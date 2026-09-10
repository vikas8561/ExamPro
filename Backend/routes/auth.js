
const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const router = express.Router();
const User = require("../models/User");
const { generateToken, authenticateToken, requireRole } = require("../middleware/auth");
const { sendEmailImmediate } = require("../services/emailService");

// In-memory store for admin lockout (30-min cooldown after 3 failed attempts)
// Key: email (lowercase), Value: Date when lockout expires
const adminLockout = new Map();

// Email service is now in Backend/services/emailService.js

// Login endpoint
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email - include lockout fields
    const user = await User.findOne({ email }).select('_id email password role name studentCategory isBlocked failedLoginAttempts failedLoginWindow mustChangePassword');
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // --- LOCKOUT CHECKS ---

    // Check if Student/Mentor is permanently blocked
    if (user.role !== 'Admin' && user.isBlocked) {
      return res.status(403).json({ message: "Your account has been blocked. Please contact your administrator." });
    }

    // Check if Admin is in 30-min cooldown (in-memory)
    if (user.role === 'Admin') {
      const lockoutExpiry = adminLockout.get(email.toLowerCase());
      if (lockoutExpiry && lockoutExpiry > new Date()) {
        return res.status(403).json({ message: "Access denied." });
      }
      // Clear expired lockout entry
      if (lockoutExpiry) {
        adminLockout.delete(email.toLowerCase());
      }
    }

    // --- PASSWORD VERIFICATION ---

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // --- HANDLE FAILED ATTEMPT ---
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      // Check if the current failed attempt window is still valid (within 5 min)
      let currentAttempts;
      if (user.failedLoginWindow && user.failedLoginWindow > fiveMinutesAgo) {
        // Within the 5-min window, increment
        currentAttempts = (user.failedLoginAttempts || 0) + 1;
      } else {
        // Window expired or first attempt — start fresh
        currentAttempts = 1;
      }

      // Update failed attempt tracking
      const updateFields = {
        failedLoginAttempts: currentAttempts,
        failedLoginWindow: currentAttempts === 1 ? now : user.failedLoginWindow
      };

      // Check if threshold reached (3 attempts)
      if (currentAttempts >= 3) {
        if (user.role === 'Admin') {
          // Admin: 30-min in-memory cooldown
          adminLockout.set(email.toLowerCase(), new Date(now.getTime() + 30 * 60 * 1000));
          // Reset counters in DB (cooldown is in-memory)
          updateFields.failedLoginAttempts = 0;
          updateFields.failedLoginWindow = null;
          await User.updateOne({ _id: user._id }, { $set: updateFields });
          return res.status(403).json({ message: "Access denied." });
        } else {
          // Student/Mentor: permanent block
          updateFields.isBlocked = true;
          await User.updateOne({ _id: user._id }, { $set: updateFields });
          return res.status(403).json({ message: "Your account has been blocked. Please contact your administrator." });
        }
      }

      await User.updateOne({ _id: user._id }, { $set: updateFields });
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // --- SUCCESSFUL LOGIN ---

    // Reset failed login counters on successful login
    const token = generateToken(user);

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          activeSessions: [token],
          failedLoginAttempts: 0,
          failedLoginWindow: null
        }
      }
    );

    // Return user without sensitive fields
    const userResponse = {
      _id: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
      studentCategory: user.studentCategory
    };

    res.json({
      user: userResponse,
      token,
      mustChangePassword: user.mustChangePassword || false,
      message: "Login successful"
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Logout endpoint
router.post("/logout", async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      // Remove token from user's active sessions
      if (!process.env.JWT_SECRET) {
        return res.status(500).json({ message: 'Server configuration error' });
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);

      if (user) {
        user.activeSessions = user.activeSessions.filter(sessionToken => sessionToken !== token);
        await user.save();
      }
    }

    res.json({ message: "Logout successful" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Force change password endpoint (for users who must change default password)
router.post("/force-change-password", authenticateToken, async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ message: "New password and confirm password are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    // Prevent setting the default password again
    if (newPassword === "12345") {
      return res.status(400).json({ message: "You cannot use the default password. Please choose a different password." });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password and clear mustChangePassword flag
    await User.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword, mustChangePassword: false } }
    );

    console.log('✅ Forced password change completed for user:', user.email);
    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get current user endpoint
router.get("/me", async (req, res) => {
  try {
    // This would typically use JWT token, but for now we'll use a simple approach
    // In a real app, you'd verify the token here
    res.json({ message: "Authentication endpoint ready" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// Forgot password endpoint
router.post("/forgot-password", async (req, res) => {
  try {
    // console.log('Forgot password request received:', req.body);

    const { email, newPassword, confirmPassword } = req.body;

    // Validate input
    if (!email || !newPassword || !confirmPassword) {
      // console.log('Validation failed: Missing fields');
      return res.status(400).json({ message: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      // console.log('Validation failed: Passwords do not match');
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (newPassword.length < 6) {
      // console.log('Validation failed: Password too short');
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    // console.log('Finding user by email:', email);
    // Find user by email
    const user = await User.findOne({ email: email });
    if (!user) {
      // console.log('User not found');
      return res.status(404).json({ message: "User not found with this email address" });
    }

    // console.log('User found, hashing password');
    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Store pending changes
    user.pendingPassword = hashedPassword;
    user.pendingEmail = email;

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Set token and expiry (1 hour)
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    // console.log('Saving user with pending changes');
    try {
      await user.save();
    } catch (saveError) {
      console.error('Error saving user:', saveError);
      return res.status(500).json({
        message: 'Failed to save password reset request',
        error: saveError.message
      });
    }

    // Send verification to email
    const verificationEmail = email;
    // console.log('Verification email will be sent to:', verificationEmail);

    // Send email with reset link to verificationEmail
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
    const emailSubject = 'Password Reset Verification';
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Password Reset Request</h2>
        <p>You requested to reset your password.</p>
        <p>Please click the link below to confirm your password and email changes:</p>
        <p style="margin: 20px 0;">
          <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
        </p>
        <p style="word-break: break-all; color: #666; font-size: 12px;">Or copy this link: ${resetLink}</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">If you did not request this, please ignore this email.</p>
        <p style="color: #999; font-size: 12px;">This link will expire in 1 hour.</p>
      </div>
    `;

    // Send email using optimized email service
    const emailResult = await sendEmailImmediate(verificationEmail, emailSubject, emailHtml);

    if (emailResult.success) {
      console.log('✅ Reset email sent successfully to:', verificationEmail);
      return res.json({
        message: "Password reset verification sent",
        verificationSentTo: verificationEmail
      });
    } else {
      // Email failed but don't fail the request - return success with token
      console.warn('⚠️ Email send failed:', emailResult.error);
      return res.json({
        message: "Password reset initiated successfully",
        warning: "Email could not be sent due to network/configuration issues",
        verificationSentTo: verificationEmail,
        note: "Please check your email configuration or contact the administrator"
      });
    }
  } catch (err) {
    console.error('Unexpected error in forgot-password:', err);
    res.status(500).json({ message: "An error occurred while processing your request" });
  }
});

// Reset password endpoint
router.post("/reset-password", async (req, res) => {
  try {
    const { token } = req.body;

    // Find user by reset token
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // Prepare update object
    const updateObj = {
      resetPasswordToken: undefined,
      resetPasswordExpires: undefined,
      pendingPassword: undefined,
      pendingEmail: undefined,
    };

    // Apply pending changes
    if (user.pendingPassword) {
      updateObj.password = user.pendingPassword;
    }

    if (user.pendingEmail && user.pendingEmail !== user.email) {
      // Check if new email is already taken
      const existingUser = await User.findOne({ email: user.pendingEmail });
      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        return res.status(400).json({ message: "New email is already in use" });
      }
      updateObj.email = user.pendingEmail;
    }

    // Update user using updateOne to avoid pre-save hook double-hashing
    await User.updateOne({ _id: user._id }, { $set: updateObj });

    res.json({ message: "Password and email updated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get current user profile
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password -activeSessions");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Upload profile image (camera only, one-time)
router.post("/profile/image", authenticateToken, async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ message: "An image is required." });
    }

    if (!image.startsWith('data:image/')) {
      return res.status(400).json({ message: "Invalid image format. Only images from camera are allowed." });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Still one-time only, matching the previous behaviour.
    if (user.profileImageSaved) {
      return res.status(400).json({ message: "Profile image can only be saved once and cannot be changed" });
    }

    user.profileImage = image;
    user.profileImageSaved = true;

    await user.save();

    res.json({
      message: "Profile image saved successfully",
      profileImage: user.profileImage,
      profileImageSaved: user.profileImageSaved
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update email with nodemailer verification
router.post("/profile/update-email", authenticateToken, async (req, res) => {
  try {
    const { newEmail } = req.body;

    if (!newEmail) {
      return res.status(400).json({ message: "New email is required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if new email is already taken by another user
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser && existingUser._id.toString() !== user._id.toString()) {
      return res.status(400).json({ message: "Email is already in use" });
    }

    // If email is the same, no need to update
    if (user.email === newEmail) {
      return res.status(400).json({ message: "New email is the same as current email" });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.pendingEmail = newEmail;
    user.resetPasswordToken = verificationToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    await user.save();

    // Send verification email
    const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${verificationToken}`;
    const emailSubject = 'Email Update Verification';
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Email Update Request</h2>
        <p>You requested to update your email address to <strong>${newEmail}</strong>.</p>
        <p>Please click the link below to verify your new email address:</p>
        <p style="margin: 20px 0;">
          <a href="${verificationLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
        </p>
        <p style="word-break: break-all; color: #666; font-size: 12px;">Or copy this link: ${verificationLink}</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">This link will expire in 1 hour.</p>
        <p style="color: #999; font-size: 12px;">If you did not request this, please ignore this email.</p>
      </div>
    `;

    // Send email using optimized email service
    const emailResult = await sendEmailImmediate(newEmail, emailSubject, emailHtml);

    if (emailResult.success) {
      console.log('✅ Email verification sent successfully to:', newEmail);
      return res.json({
        message: "Verification email sent to your new email address"
      });
    } else {
      console.error('❌ Error sending verification email:', emailResult.error);
      return res.status(500).json({
        message: 'Email update initiated but verification email failed to send'
      });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Verify email update
router.post("/profile/verify-email", async (req, res) => {
  try {
    const { token } = req.body;

    // Find user by verification token
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired verification token" });
    }

    if (!user.pendingEmail) {
      return res.status(400).json({ message: "No pending email change found" });
    }

    // Check if new email is already taken
    const existingUser = await User.findOne({ email: user.pendingEmail });
    if (existingUser && existingUser._id.toString() !== user._id.toString()) {
      return res.status(400).json({ message: "New email is already in use" });
    }

    // Update email
    user.email = user.pendingEmail;
    user.pendingEmail = undefined;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: "Email updated successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Change password directly (no email verification)
router.post("/profile/change-password", authenticateToken, async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password directly using updateOne to avoid pre-save hook double-hashing
    await User.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword } }
    );

    console.log('✅ Password changed successfully for user:', user.email);
    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Verify password change
router.post("/profile/verify-password", async (req, res) => {
  try {
    const { token } = req.body;

    // Find user by verification token
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired verification token" });
    }

    if (!user.pendingPassword) {
      return res.status(400).json({ message: "No pending password change found" });
    }

    // Update password using updateOne to avoid pre-save hook double-hashing
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          password: user.pendingPassword,
          resetPasswordToken: undefined,
          resetPasswordExpires: undefined,
          pendingPassword: undefined
        }
      }
    );

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Test email endpoint (for debugging) - Admin only
router.post("/test-email", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const { to } = req.body;
    const testEmail = to || process.env.SMTP_USER;

    if (!testEmail) {
      return res.status(400).json({ message: "Email address required" });
    }

    const emailSubject = "Test Email from CodingGita";
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">Test Email</h2>
        <p>This is a test email from CodingGita email service.</p>
        <p>If you received this email, your email configuration is working correctly!</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">Sent at: ${new Date().toLocaleString()}</p>
      </div>
    `;

    console.log(`🧪 Testing email to: ${testEmail}`);
    const emailResult = await sendEmailImmediate(testEmail, emailSubject, emailHtml);

    if (emailResult.success) {
      res.json({
        success: true,
        message: "Test email sent successfully",
        to: testEmail,
        messageId: emailResult.info?.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to send test email",
        error: emailResult.error,
        code: emailResult.code
      });
    }
  } catch (err) {
    console.error('Error in test-email endpoint:', err);
    res.status(500).json({ message: "An error occurred while processing your request" });
  }
});
// Force logout all users - clears all active sessions (admin only)
router.post("/force-logout-all", authenticateToken, requireRole("Admin"), async (req, res) => {
  try {
    // Clear activeSessions for ALL users
    const result = await User.updateMany(
      {},
      { $set: { activeSessions: [] } }
    );

    console.log(`🔒 Force logout: Cleared sessions for ${result.modifiedCount} users`);
    
    res.json({
      message: `Successfully logged out all users. ${result.modifiedCount} users affected.`,
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    console.error('Error in force-logout-all:', err);
    res.status(500).json({ message: "An error occurred while processing your request" });
  }
});

module.exports = router;
