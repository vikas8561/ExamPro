
const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const router = express.Router();
const User = require("../models/User");
const { generateToken, authenticateToken, requireRole } = require("../middleware/auth");
const { sendEmailImmediate } = require("../services/emailService");

// Email service is now in Backend/services/emailService.js

// Login endpoint
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email - only select fields needed for login (exclude large fields like profileImage)
    const user = await User.findOne({ email }).select('_id email password role name studentCategory');
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

    // Update activeSessions using updateOne (much faster than save - doesn't load full document or run hooks)
    await User.updateOne(
      { _id: user._id },
      { $set: { activeSessions: [token] } }
    );

    // Return user without password
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
        verificationSentTo: verificationEmail,
        resetToken: resetToken // For testing purposes
      });
    } else {
      // Email failed but don't fail the request - return success with token
      console.warn('⚠️ Email send failed:', emailResult.error);
      return res.json({
        message: "Password reset initiated successfully",
        warning: "Email could not be sent due to network/configuration issues",
        verificationSentTo: verificationEmail,
        resetToken: resetToken, // For testing/manual use
        error: emailResult.error,
        note: "You can use the reset token manually to reset your password"
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

// Get current user profile
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password -activeSessions -faceDescriptor");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get face descriptor for proctoring (secure endpoint, only returns descriptor)
router.get("/profile/face-descriptor", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("faceDescriptor faceDescriptorSaved");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.faceDescriptor || !user.faceDescriptorSaved) {
      return res.status(400).json({
        message: "Face descriptor not found. Please upload a profile image first.",
        faceDescriptor: null
      });
    }

    res.json({
      faceDescriptor: user.faceDescriptor,
      faceDescriptorSaved: user.faceDescriptorSaved
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Upload profile image and face descriptor (camera only, one-time)
// SECURITY: Only face descriptor is stored for face recognition, image is optional for display
router.post("/profile/image", authenticateToken, async (req, res) => {
  try {
    const { image, faceDescriptor } = req.body; // image is optional (for display), faceDescriptor is required for face recognition

    if (!faceDescriptor || !Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
      return res.status(400).json({
        message: "Face descriptor is required and must be a 128-dimensional array. Please ensure face-api.js extracted the descriptor correctly."
      });
    }

    // Validate base64 image format if provided (optional, for display only)
    if (image && !image.startsWith('data:image/')) {
      return res.status(400).json({ message: "Invalid image format. Only images from camera are allowed." });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if face descriptor was already saved (one-time only)
    if (user.faceDescriptorSaved) {
      return res.status(400).json({ message: "Face descriptor can only be saved once and cannot be changed" });
    }

    // Store face descriptor (secure, non-reversible biometric template)
    user.faceDescriptor = faceDescriptor;
    user.faceDescriptorSaved = true;

    // Optionally store image for display purposes only (not used for face recognition)
    if (image) {
      user.profileImage = image;
      user.profileImageSaved = true;
    }

    await user.save();

    res.json({
      message: "Face descriptor saved successfully",
      faceDescriptorSaved: user.faceDescriptorSaved,
      profileImage: user.profileImage || null, // Return image only if stored
      profileImageSaved: user.profileImageSaved
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Verify face match for test authentication
router.post("/verify-face", authenticateToken, async (req, res) => {
  try {
    const { image } = req.body; // Base64 encoded image from camera

    if (!image) {
      return res.status(400).json({ message: "Image is required" });
    }

    // Validate base64 image format
    if (!image.startsWith('data:image/')) {
      return res.status(400).json({ message: "Invalid image format" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user has a profile image
    if (!user.profileImage || !user.profileImageSaved) {
      return res.status(400).json({
        message: "No profile image found. Please upload a profile image first.",
        match: false
      });
    }

    // Check if face recognition is enabled (development mode can bypass)
    const faceRecognitionEnabled = process.env.FACE_RECOGNITION_ENABLED !== 'false';
    const faceServiceUrl = process.env.FACE_RECOGNITION_SERVICE_URL || 'http://localhost:5000';

    // Development fallback: if service is disabled, allow test to proceed
    // BUT ONLY if explicitly disabled - default is to require verification
    if (!faceRecognitionEnabled) {
      console.warn("⚠️ WARNING: Face recognition is DISABLED. Allowing test to proceed without verification.");
      console.warn("⚠️ This should only be used for development/testing. In production, face verification must be enabled.");
      return res.json({
        match: true,
        confidence: 1.0,
        message: "Face verification bypassed (FACE_RECOGNITION_ENABLED=false)",
        warning: "Face verification is disabled - this should not be used in production"
      });
    }

    // Call Python face recognition service
    // Use built-in fetch if available (Node 18+), otherwise use node-fetch
    let fetchFn;
    if (typeof fetch !== 'undefined') {
      fetchFn = fetch;
    } else {
      const nodeFetch = require('node-fetch');
      fetchFn = nodeFetch.default || nodeFetch;
    }

    // Check if fallback is enabled BEFORE making the request
    const allowFallback = process.env.FACE_RECOGNITION_FALLBACK === 'true';

    try {
      const controller = new AbortController();
      // Increased timeout to handle:
      // - Model download on first request (~10-15 seconds)
      // - Cold starts on Render free tier (~30-60 seconds)
      // - Face verification processing (~5-10 seconds)
      const timeoutMs = parseInt(process.env.FACE_RECOGNITION_TIMEOUT_MS) || 90000; // 90 seconds default
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetchFn(`${faceServiceUrl}/verify-face`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileImage: user.profileImage,
          capturedImage: image,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse response even if status is not OK to get error details
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        // If response is not JSON, treat as error
        if (allowFallback) {
          console.warn("⚠️ WARNING: Face recognition service returned non-JSON response. Allowing fallback.");
          return res.json({
            match: true,
            confidence: 0.5,
            message: "Face verification bypassed (service error, fallback enabled)",
            warning: "Face recognition service returned invalid response. Test proceeding with fallback."
          });
        }
        throw new Error(`Invalid response from face recognition service: ${response.statusText}`);
      }

      // If service returned an error status, check for fallback
      if (!response.ok) {
        console.error("Face recognition service returned error:", result);

        // If fallback is enabled, allow verification to proceed
        if (allowFallback) {
          console.warn("⚠️ WARNING: Face recognition service unavailable. Allowing fallback (FACE_RECOGNITION_FALLBACK=true).");
          console.warn("⚠️ This should only be used for development/testing. In production, face verification must work.");
          return res.json({
            match: true,
            confidence: 0.5,
            message: "Face verification bypassed (service unavailable, fallback enabled)",
            warning: "Face recognition service is unavailable. Test proceeding with fallback."
          });
        }

        // Reject verification if fallback is not enabled
        // Use the message from the service if available (it's user-friendly)
        // Preserve the original status code from Python service (400, 500, etc.)
        const statusCode = response.status >= 400 && response.status < 600 ? response.status : 400;
        return res.status(statusCode).json({
          match: false,
          confidence: 0,
          message: result.message || result.error || "Face verification failed. Please try again.",
          error: result.error || `Service error: ${response.statusText}`
        });
      }

      // Strict validation: match must be explicitly true and confidence must meet threshold
      const isValidMatch = result.match === true &&
        typeof result.confidence === 'number' &&
        result.confidence >= 0.7;

      if (!isValidMatch) {
        console.log("Face verification failed:", {
          match: result.match,
          confidence: result.confidence,
          threshold: result.threshold || 0.7
        });
      }

      res.json({
        match: isValidMatch,
        confidence: result.confidence || 0,
        message: isValidMatch ? "Face verified successfully" : (result.message || "Face verification failed - faces do not match"),
        threshold: result.threshold || 0.7
      });
    } catch (serviceError) {
      console.error("Face recognition service error:", serviceError);
      console.error("Service URL:", faceServiceUrl);
      console.error("Error details:", {
        name: serviceError.name,
        message: serviceError.message,
        code: serviceError.code
      });

      // Check if this is a timeout error
      const isTimeout = serviceError.name === 'AbortError' ||
        serviceError.message.includes('aborted') ||
        serviceError.code === 20;

      // Only allow fallback if explicitly enabled (for development/testing)
      if (allowFallback) {
        console.warn("⚠️ WARNING: Face recognition service unavailable. Allowing fallback (FACE_RECOGNITION_FALLBACK=true).");
        console.warn("⚠️ This should only be used for development/testing. In production, face verification must work.");
        return res.json({
          match: true,
          confidence: 0.5,
          message: "Face verification bypassed (service unavailable, fallback enabled)",
          warning: "Face recognition service is unavailable. Test proceeding with fallback."
        });
      }

      // Reject verification if service is unavailable (default behavior)
      let errorMessage = "Face recognition service is temporarily unavailable.";
      if (isTimeout) {
        errorMessage = "Face recognition service request timed out. This may happen if the service is starting up (downloading models) or waking from sleep. Please try again in a few moments.";
      } else if (serviceError.message.includes('ECONNREFUSED') || serviceError.message.includes('fetch failed')) {
        errorMessage = "Cannot connect to face recognition service. The service may be down or unreachable.";
      }

      console.error("Face recognition service error:", serviceError.message);
      res.status(503).json({
        message: errorMessage,
        match: false,
        error: serviceError.message,
        serviceUrl: faceServiceUrl,
        isTimeout: isTimeout,
        help: isTimeout ? "The service may be downloading models (first request) or waking from sleep. Wait 30-60 seconds and try again." : "Please ensure the Python service is running and accessible."
      });
    }
  } catch (err) {
    console.error("Face verification error:", err);
    res.status(500).json({ message: err.message, match: false });
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
        message: "Verification email sent to your new email address",
        verificationToken: verificationToken // For testing purposes
      });
    } else {
      console.error('❌ Error sending verification email:', emailResult.error);
      return res.status(500).json({
        message: 'Email update initiated but verification email failed to send',
        error: emailResult.error,
        verificationToken: verificationToken // For testing purposes
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
    res.status(500).json({ message: err.message, stack: err.stack });
  }
});

module.exports = router;
