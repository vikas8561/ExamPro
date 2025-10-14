
const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const router = express.Router();
const User = require("../models/User");
const { generateToken } = require("../middleware/auth");

// Configure nodemailer transporter for Gmail
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
  secure: false, // true for 587, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Login endpoint
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate JWT token
    const token = generateToken(user);

    // Clear any existing sessions and add new session
    user.activeSessions = [token];
    await user.save();

    // Return user without password
    const userResponse = user.toObject();
    delete userResponse.password;
    delete userResponse.activeSessions;

    res.json({ 
      user: userResponse,
      token,
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
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
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

    const { oldEmail, newEmail, newPassword, confirmPassword } = req.body;

    // Validate input
    if (!oldEmail || !newEmail || !newPassword || !confirmPassword) {
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

    // console.log('Finding user by email:', oldEmail);
    // Find user by old email
    const user = await User.findOne({ email: oldEmail });
    if (!user) {
      // console.log('User not found');
      return res.status(404).json({ message: "User not found" });
    }

    // console.log('User found, hashing password');
    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Store pending changes
    user.pendingPassword = hashedPassword;
    user.pendingEmail = newEmail;
    if (req.body.name) {
      user.name = req.body.name;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Set token and expiry (1 hour)
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    // console.log('Saving user with pending changes');
    await user.save();

    // Determine which email to send verification to
    const verificationEmail = (oldEmail !== newEmail) ? newEmail : oldEmail;
    // console.log('Verification email will be sent to:', verificationEmail);

    // Send email with reset link to verificationEmail
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    const mailOptions = {
      from: process.env.SMTP_FROM || '"ExamPro Support" <support@example.com>',
      to: verificationEmail,
      subject: 'Password Reset Verification',
      html: `
        <p>You requested to reset your password.</p>
        <p>Please click the link below to confirm your password and email changes:</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>If you did not request this, please ignore this email.</p>
      `
    };

    // Email options logging disabled
    // const emailOptions = {
    //   from: mailOptions.from,
    //   to: mailOptions.to,
    //   subject: mailOptions.subject
    // };

    try {
      // Check if email configuration is available
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('Email configuration missing - SMTP_USER or SMTP_PASS not set');
        return res.json({
          message: "Password reset initiated but email service not configured",
          verificationSentTo: verificationEmail,
          resetToken: resetToken, // For testing purposes
          warning: "Email service not configured - please contact administrator"
        });
      }

      await transporter.sendMail(mailOptions);
      console.log('Reset email sent successfully to:', verificationEmail);
      return res.json({
        message: "Password reset verification sent",
        verificationSentTo: verificationEmail,
        resetToken: resetToken // For testing purposes
      });
    } catch (emailError) {
      console.error('Error sending reset email:', emailError);
      // Don't fail the request if email fails, but log it
      // In production, you might want to queue emails or use a service
      return res.status(500).json({
        message: 'Password reset initiated but email failed to send',
        error: emailError.message,
        resetToken: resetToken, // For testing purposes
        verificationSentTo: verificationEmail
      });
    }
  } catch (err) {
    console.error('Unexpected error in forgot-password:', err);
    res.status(500).json({ message: err.message, stack: err.stack });
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

module.exports = router;
