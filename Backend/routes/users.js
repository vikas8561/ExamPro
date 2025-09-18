const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();
const User = require("../models/User");

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
