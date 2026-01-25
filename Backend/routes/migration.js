const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { authenticateToken, requireRole } = require("../middleware/auth");

/**
 * Migration endpoint to extract face descriptors from existing profile images
 * This should be run once to migrate existing users who have profile images
 * but no face descriptors stored.
 * 
 * SECURITY: Admin only endpoint
 */
router.post("/extract-face-descriptors", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    // Find all users with profile images but no face descriptors
    const usersToMigrate = await User.find({
      profileImage: { $exists: true, $ne: null },
      $or: [
        { faceDescriptor: { $exists: false } },
        { faceDescriptor: null },
        { faceDescriptorSaved: { $ne: true } }
      ]
    }).select("_id name email profileImage");

    if (usersToMigrate.length === 0) {
      return res.json({
        message: "No users need migration. All users either have face descriptors or no profile images.",
        processed: 0,
        failed: 0,
        total: 0
      });
    }

    res.json({
      message: `Found ${usersToMigrate.length} users that need migration. This endpoint only identifies users. Use the migration script to process them.`,
      usersFound: usersToMigrate.length,
      users: usersToMigrate.map(u => ({
        id: u._id,
        name: u.name,
        email: u.email,
        hasProfileImage: !!u.profileImage
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * Process a single user's profile image to extract face descriptor
 * This is called by the migration script or can be used individually
 */
router.post("/extract-face-descriptor/:userId", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.profileImage) {
      return res.status(400).json({ message: "User has no profile image to process" });
    }

    if (user.faceDescriptorSaved && user.faceDescriptor) {
      return res.json({
        message: "User already has face descriptor",
        userId: user._id,
        name: user.name,
        email: user.email,
        alreadyProcessed: true
      });
    }

    // Note: Face descriptor extraction must be done on frontend with face-api.js
    // This endpoint just marks that the user needs processing
    // The actual extraction should be done via a frontend migration tool
    
    res.json({
      message: "User identified for processing. Use frontend migration tool to extract descriptor.",
      userId: user._id,
      name: user.name,
      email: user.email,
      hasProfileImage: true,
      needsProcessing: true
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

