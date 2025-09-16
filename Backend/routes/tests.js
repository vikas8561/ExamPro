const express = require("express");
const router = express.Router();
const Test = require("../models/Test");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { recalculateScoresForTest } = require("../services/scoreCalculation");

// Get all tests (admin only)
router.get("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const query = {};
    
    if (status) query.status = status;
    if (search) query.title = { $regex: search, $options: "i" };

    const tests = await Test.find(query)
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });
    
    res.json({ tests });
  } catch (error) {
    next(error);
  }
});

// Get test by ID
router.get("/:id", authenticateToken, async (req, res, next) => {
  try {
    const test = await Test.findById(req.params.id)
      .populate("createdBy", "name email");
    
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }
    
    res.json(test);
  } catch (error) {
    next(error);
  }
});

// Generate a 5-digit OTP
function generateOTP() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

// Create new test (admin only)
router.post("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { title, subject, type, instructions, timeLimit, negativeMarkingPercent, questions } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Test title is required" });
    }

    const test = await Test.create({
      title: title.trim(),
      subject: subject || "",
      type: type || "mixed",
      instructions: instructions || "",
      timeLimit: Number(timeLimit || 30),
      negativeMarkingPercent: Number(negativeMarkingPercent || 0),
      questions: Array.isArray(questions) ? questions : [],
      otp: generateOTP(),
      createdBy: req.user.userId
    });

    const populatedTest = await Test.findById(test._id)
      .populate("createdBy", "name email");

    res.status(201).json(populatedTest);
  } catch (error) {
    next(error);
  }
});

// Update test (admin only)
router.put("/:id", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { title, subject, type, instructions, timeLimit, negativeMarkingPercent, questions, status } = req.body;

    const updateData = {};
    if (title) updateData.title = title.trim();
    if (subject !== undefined) updateData.subject = subject;
    if (type) updateData.type = type;
    if (instructions !== undefined) updateData.instructions = instructions;
    if (timeLimit) updateData.timeLimit = Number(timeLimit);
    if (negativeMarkingPercent !== undefined) updateData.negativeMarkingPercent = Number(negativeMarkingPercent);
    if (questions) updateData.questions = questions;
    if (status) updateData.status = status;

    const test = await Test.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate("createdBy", "name email");

    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    // Recalculate scores for all submissions of this test
    if (questions) {
      await recalculateScoresForTest(req.params.id);
    }

    res.json(test);
  } catch (error) {
    next(error);
  }
});

// Delete test (admin only)
router.delete("/:id", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const test = await Test.findById(req.params.id);
    
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    const TestSubmission = require("../models/TestSubmission");
    const Assignment = require("../models/Assignment");

    // Delete associated submissions
    await TestSubmission.deleteMany({ testId: req.params.id });
    
    // Delete associated assignments
    await Assignment.deleteMany({ testId: req.params.id });

    // Delete the test
    await Test.findByIdAndDelete(req.params.id);

    res.json({ message: "Test and all associated data deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// Get test statistics (admin only)
router.get("/:id/stats", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const test = await Test.findById(req.params.id);
    
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    // Get assignment and submission stats
    const Assignment = require("../models/Assignment");
    const TestSubmission = require("../models/TestSubmission");

    const assignmentCount = await Assignment.countDocuments({ testId: req.params.id });
    const completedCount = await Assignment.countDocuments({ 
      testId: req.params.id, 
      status: "Completed" 
    });
    const submissionCount = await TestSubmission.countDocuments({ testId: req.params.id });

    res.json({
      test: test.title,
      totalAssignments: assignmentCount,
      completedAssignments: completedCount,
      totalSubmissions: submissionCount,
      completionRate: assignmentCount > 0 ? (completedCount / assignmentCount * 100).toFixed(1) : 0
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
