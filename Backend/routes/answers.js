const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const TestSubmission = require("../models/TestSubmission");
const Assignment = require("../models/Assignment");
const { authenticateToken } = require("../middleware/auth");

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({ 
    message: "Answers API is healthy",
    timestamp: new Date().toISOString(),
    mongooseState: mongoose.connection.readyState
  });
});

// Save individual answer
router.post("/", authenticateToken, async (req, res, next) => {
  try {
    const { assignmentId, questionId, selectedOption, textAnswer } = req.body;
    const userId = req.user.userId;

    console.log("📝 Saving answer:", { assignmentId, questionId, userId, selectedOption, textAnswer });

    if (!assignmentId || !questionId) {
      console.error("❌ Missing required fields:", { assignmentId, questionId });
      return res.status(400).json({ message: "assignmentId and questionId are required" });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
      console.error("❌ Invalid assignmentId format:", assignmentId);
      return res.status(400).json({ message: "Invalid assignmentId format" });
    }

    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      console.error("❌ Invalid questionId format:", questionId);
      return res.status(400).json({ message: "Invalid questionId format" });
    }

    // Get or create submission
    let submission = await TestSubmission.findOne({ assignmentId, userId });
    console.log("🔍 Found existing submission:", !!submission);

    if (!submission) {
      // Create new submission if it doesn't exist
      console.log("📋 Looking up assignment:", assignmentId);
      const assignment = await Assignment.findById(assignmentId);
      if (!assignment) {
        console.error("❌ Assignment not found:", assignmentId);
        return res.status(404).json({ message: "Assignment not found" });
      }

      console.log("✅ Assignment found, creating new submission");
      submission = new TestSubmission({
        assignmentId,
        testId: assignment.testId,
        userId,
        responses: [],
        totalScore: 0,
        maxScore: 0,
        timeSpent: 0
      });
    }

    // Find existing response or create new one
    const existingResponseIndex = submission.responses.findIndex(
      response => response.questionId.toString() === questionId
    );

    console.log("🔍 Existing response index:", existingResponseIndex);

    if (existingResponseIndex !== -1) {
      // Update existing response
      console.log("📝 Updating existing response");
      submission.responses[existingResponseIndex].selectedOption = selectedOption;
      submission.responses[existingResponseIndex].textAnswer = textAnswer;
    } else {
      // Add new response
      console.log("➕ Adding new response");
      submission.responses.push({
        questionId,
        selectedOption,
        textAnswer,
        isCorrect: false,
        points: 0,
        autoGraded: false
      });
    }

    console.log("💾 Saving submission...");
    await submission.save();
    console.log("✅ Answer saved successfully");

    res.status(200).json({
      message: "Answer saved successfully",
      submission
    });
  } catch (error) {
    console.error("❌ Error in POST /api/answers:", error.message, error.stack);
    next(error);
  }
});

// Get answers for a specific assignment
router.get("/assignment/:assignmentId", authenticateToken, async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const userId = req.user.userId;

    const submission = await TestSubmission.findOne({ assignmentId, userId });

    if (!submission) {
      return res.status(404).json({ message: "No answers found for this assignment" });
    }

    res.json(submission.responses);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
