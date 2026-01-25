const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();
const User = require("../models/User");
const { authenticateToken, requireRole } = require("../middleware/auth");

// Get all users - ULTRA FAST VERSION
router.get("/", async (req, res) => {
  try {
    const startTime = Date.now();
    // console.log('🚀 ULTRA FAST: Fetching users for admin');

    // ULTRA FAST: Get users with MINIMAL data
    const users = await User.find()
      .select("name email role studentCategory createdAt")
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for 2x faster queries

    const totalTime = Date.now() - startTime;
    // console.log(`✅ ULTRA FAST admin users completed in ${totalTime}ms - Found ${users.length} users`);

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all users with profile details (for Student Profile section) - with pagination and search
router.get("/profiles", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search || "";
    const filterRole = req.query.filter || "";

    // Build query for search and filter
    let query = {};

    // Search functionality - search in name and email
    if (searchTerm) {
      query.$or = [
        { name: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } }
      ];
    }

    // Filter by role
    if (filterRole && filterRole !== "All Users") {
      if (filterRole === "RU Students") {
        query.role = "Student";
        query.studentCategory = "RU";
      } else if (filterRole === "SU Students") {
        query.role = "Student";
        query.studentCategory = "SU";
      } else if (filterRole === "Mentor") {
        query.role = "Mentor";
      } else if (filterRole === "Admin") {
        query.role = "Admin";
      }
    }

    // Get total count for pagination (with search/filter applied)
    const totalUsers = await User.countDocuments(query);

    // Sort directly in database using aggregation pipeline
    // Order: Students with profile image (1) -> Students without profile image (2) -> Mentors (3) -> Admins (4)
    // Within each group: newest first (createdAt descending)
    const users = await User.aggregate([
      { $match: query },
      {
        $addFields: {
          roleOrder: {
            $switch: {
              branches: [
                { case: { $eq: ["$role", "Student"] }, then: 1 },
                { case: { $eq: ["$role", "Mentor"] }, then: 2 },
                { case: { $eq: ["$role", "Admin"] }, then: 3 }
              ],
              default: 99
            }
          },
          // For students: prioritize those with profile images (0 = first, 1 = second)
          // For others: use role order
          sortOrder: {
            $cond: {
              if: { $eq: ["$role", "Student"] },
              then: {
                $cond: {
                  if: { $eq: ["$profileImageSaved", true] },
                  then: 0,  // Students with profile image come first
                  else: 1    // Students without profile image come second
                }
              },
              else: {
                $switch: {
                  branches: [
                    { case: { $eq: ["$role", "Mentor"] }, then: 2 },
                    { case: { $eq: ["$role", "Admin"] }, then: 3 }
                  ],
                  default: 99
                }
              }
            }
          }
        }
      },
      {
        $sort: {
          sortOrder: 1,     // Sort by priority (Students with image=0, Students without=1, Mentors=2, Admins=3)
          createdAt: -1     // Within same priority, newest first
        }
      },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          name: 1,
          email: 1,
          role: 1,
          studentCategory: 1,
          profileImageSaved: 1,
          faceDescriptorSaved: 1,
          createdAt: 1,
          updatedAt: 1,
          _id: 1
        }
      }
    ]).allowDiskUse(true);

    // Calculate pagination info
    const totalPages = Math.ceil(totalUsers / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.json({
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        limit,
        hasNextPage,
        hasPrevPage
      }
    });
  } catch (err) {
    console.error("Error fetching user profiles:", err);
    res.status(500).json({ message: err.message });
  }
});

// Delete ALL users profile images (admin only)
router.delete("/profile-images/all", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    // Update all users: clear profileImage and faceDescriptor
    // Using $unset to remove fields and $set to update boolean flags
    const result = await User.updateMany(
      {}, // Target ALL users
      {
        $unset: {
          profileImage: "",
          faceDescriptor: ""
        },
        $set: {
          profileImageSaved: false,
          faceDescriptorSaved: false
        }
      }
    );

    res.json({
      message: `Successfully deleted profile images and face data for ${result.modifiedCount} users.`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete user profile image (admin only)
router.delete("/:id/profile-image", async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Reset profile image and face descriptor to ensure complete cleanup
    user.profileImage = undefined;
    user.profileImageSaved = false;
    user.faceDescriptor = undefined;
    user.faceDescriptorSaved = false;
    await user.save();

    res.json({
      message: "Profile image deleted successfully. User can now re-upload their image.",
      profileImage: null,
      profileImageSaved: false
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get full user profile including profileImage (admin only - for migration)
router.get("/:id/full-profile", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).select("-password -activeSessions");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update face descriptor (admin only - for migration purposes)
router.post("/:id/update-face-descriptor", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const userId = req.params.id;
    const { faceDescriptor } = req.body;

    if (!faceDescriptor || !Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
      return res.status(400).json({
        message: "Face descriptor is required and must be a 128-dimensional array"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update face descriptor (admin override for migration)
    user.faceDescriptor = faceDescriptor;
    user.faceDescriptorSaved = true;
    await user.save();

    res.json({
      message: "Face descriptor updated successfully",
      userId: user._id,
      name: user.name,
      email: user.email,
      faceDescriptorSaved: true
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Reset user password to default (admin only)
router.post("/:id/reset-password", async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Reset password to default "12345"
    // The pre-save hook will hash it automatically
    user.password = "12345";
    await user.save();

    res.json({
      message: "Password reset successfully. Default password is now: 12345"
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new user
router.post("/", async (req, res) => {
  try {
    const { name, email, role, studentCategory } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    // Validate student category for students
    if (role === "Student" && !studentCategory) {
      return res.status(400).json({ message: "Student category (RU/SU) is required for students" });
    }

    if (role === "Student" && !["RU", "SU"].includes(studentCategory)) {
      return res.status(400).json({ message: "Student category must be either RU or SU" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Plain password (not hashed)
    const password = "12345";

    const userData = { name, email, password, role };
    if (role === "Student") {
      userData.studentCategory = studentCategory;
    }

    const newUser = new User(userData);
    const savedUser = await newUser.save();

    // Send response (don't send password)
    const userResponse = savedUser.toObject();
    delete userResponse.password;
    userResponse.generatedPassword = password; // If you want admin to see

    res.status(201).json(userResponse);
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(400).json({ message: err.message });
  }
});

// Update a user
router.put("/:id", async (req, res) => {
  try {
    const { name, email, role, studentCategory } = req.body;
    const userId = req.params.id;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    // Validate student category for students
    if (role === "Student" && !studentCategory) {
      return res.status(400).json({ message: "Student category (RU/SU) is required for students" });
    }

    if (role === "Student" && !["RU", "SU"].includes(studentCategory)) {
      return res.status(400).json({ message: "Student category must be either RU or SU" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Check if email already exists for another user
    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const updateData = { name, email, role };
    if (role === "Student") {
      updateData.studentCategory = studentCategory;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(updatedUser);
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(400).json({ message: err.message });
  }
});

// Delete a user
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const csv = require("csv-parser");
const multer = require("multer");
const fs = require("fs");
const upload = multer({ dest: "uploads/" }); // Temporary storage for uploaded files

// Bulk upload users
router.post("/bulk", upload.single("file"), async (req, res) => {
  try {
    const { role, studentCategory } = req.body;
    const usersData = [];
    const fileType = req.file.mimetype;

    // Validate student category for students
    if (role === "Student" && !studentCategory) {
      return res.status(400).json({ message: "Student category (RU/SU) is required for bulk student upload" });
    }

    if (role === "Student" && !["RU", "SU"].includes(studentCategory)) {
      return res.status(400).json({ message: "Student category must be either RU or SU" });
    }

    if (fileType === "application/json") {
      const jsonData = JSON.parse(fs.readFileSync(req.file.path, 'utf8'));
      jsonData.forEach((item) => {
        if (item.email && item.name) {
          usersData.push({ name: item.name, email: item.email });
        }
      });

      // Process JSON users
      const results = [];
      for (const userData of usersData) {
        try {
          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(userData.email)) {
            results.push({ email: userData.email, status: "failed", message: "Invalid email format" });
            continue;
          }

          // Check if email already exists
          const existingUser = await User.findOne({ email: userData.email });
          if (existingUser) {
            results.push({ email: userData.email, status: "failed", message: "Email already exists" });
            continue;
          }

          // Create new user
          const password = "12345";
          const userDataObj = {
            name: userData.name,
            email: userData.email,
            password,
            role
          };

          if (role === "Student") {
            userDataObj.studentCategory = studentCategory;
          }

          const newUser = new User(userDataObj);
          await newUser.save();
          results.push({
            email: userData.email,
            name: userData.name,
            status: "success",
            message: "User created successfully"
          });
        } catch (error) {
          results.push({
            email: userData.email,
            name: userData.name,
            status: "failed",
            message: error.message
          });
        }
      }

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      res.status(201).json({ message: "Bulk upload completed", results });

    } else if (fileType === "text/csv") {
      const results = [];
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on("data", (row) => {
          if (row.email && row.name) {
            usersData.push({ name: row.name, email: row.email });
          }
        })
        .on("end", async () => {
          for (const userData of usersData) {
            try {
              // Validate email format
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(userData.email)) {
                results.push({ email: userData.email, name: userData.name, status: "failed", message: "Invalid email format" });
                continue;
              }

              // Check if email already exists
              const existingUser = await User.findOne({ email: userData.email });
              if (existingUser) {
                results.push({ email: userData.email, name: userData.name, status: "failed", message: "Email already exists" });
                continue;
              }

              // Create new user
              const password = "12345";
              const userDataObj = {
                name: userData.name,
                email: userData.email,
                password,
                role
              };

              if (role === "Student") {
                userDataObj.studentCategory = studentCategory;
              }

              const newUser = new User(userDataObj);
              await newUser.save();
              results.push({
                email: userData.email,
                name: userData.name,
                status: "success",
                message: "User created successfully"
              });
            } catch (error) {
              results.push({
                email: userData.email,
                name: userData.name,
                status: "failed",
                message: error.message
              });
            }
          }

          // Clean up uploaded file
          fs.unlinkSync(req.file.path);
          res.status(201).json({ message: "Bulk upload completed", results });
        });
    } else {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "Unsupported file type" });
    }
  } catch (err) {
    console.error("Error uploading users:", err);
    // Clean up uploaded file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
