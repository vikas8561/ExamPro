const express = require("express");
const router = express.Router();
const Subject = require("../models/Subject");
const { authenticateToken, requireRole } = require("../middleware/auth");

// Get all subjects (public - for students to use in filters)
router.get("/public", async (req, res, next) => {
  try {
    const subjects = await Subject.find({})
      .select("name description")
      .sort({ name: 1 });

    res.json({ subjects });
  } catch (error) {
    next(error);
  }
});

// Get all subjects (admin only)
router.get("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const subjects = await Subject.find({})
      .populate("createdBy", "name email")
      .sort({ name: 1 });

    res.json({ subjects });
  } catch (error) {
    next(error);
  }
});

// Create new subject (admin only)
router.post("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Subject name is required" });
    }

    const subject = await Subject.create({
      name: name.trim(),
      description: description || "",
      createdBy: req.user.userId
    });

    const populatedSubject = await Subject.findById(subject._id)
      .populate("createdBy", "name email");

    res.status(201).json(populatedSubject);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Subject name already exists" });
    }
    next(error);
  }
});

// Update subject (admin only)
router.put("/:id", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { name, description } = req.body;

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;

    const subject = await Subject.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate("createdBy", "name email");

    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    res.json(subject);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Subject name already exists" });
    }
    next(error);
  }
});

// Delete subject (admin only)
router.delete("/:id", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const subject = await Subject.findById(req.params.id);

    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    // Check if subject is being used by any tests
    const Test = require("../models/Test");
    const testCount = await Test.countDocuments({ subject: subject.name });

    if (testCount > 0) {
      return res.status(400).json({
        message: `Cannot delete subject. It is being used by ${testCount} test(s).`
      });
    }

    await Subject.findByIdAndDelete(req.params.id);

    res.json({ message: "Subject deleted successfully" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
