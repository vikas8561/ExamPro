const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const TestSubmission = require("../models/TestSubmission");
const Assignment = require("../models/Assignment");
const { authenticateToken } = require("../middleware/auth");
const { requireProctorSession } = require("../middleware/proctorSession");

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({ 
    message: "Answers API is healthy",
    timestamp: new Date().toISOString(),
    mongooseState: mongoose.connection.readyState
  });
});

// Save individual answer. Answers are only accepted while a proctoring session
// is live, so answers cannot be posted from outside the exam page.
router.post("/", authenticateToken, requireProctorSession(), async (req, res, next) => {
  try {
    const { assignmentId, questionId, selectedOption, textAnswer, language } = req.body;
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
      const existing = submission.responses[existingResponseIndex];
      existing.selectedOption = selectedOption;

      // A coding answer that has already been graded keeps its source.
      //
      // Coding questions are graded best-wins, so `textAnswer` holds the attempt
      // that earned the marks -- and the student carries on editing afterwards.
      // Writing the live draft over it would leave a score attached to code that
      // never earned it: the mentor would review work in progress, and the
      // re-grade audit would score something different from what was awarded.
      // The draft still has to be saved, or a closed laptop loses the work, so it
      // goes to its own field and the graded source is left alone.
      //
      // Only `autoGraded` answers are protected. Before a first submission, and
      // for every MCQ and theory answer, `textAnswer` IS the answer and autosave
      // owns it exactly as before.
      if (existing.autoGraded === true) {
        existing.draftAnswer = textAnswer;
      } else {
        existing.textAnswer = textAnswer;
      }

      // Only when the client actually sends one, so an MCQ autosave cannot wipe
      // the language recorded against a coding answer.
      if (language) existing.language = language;
    } else {
      // Add new response
      console.log("➕ Adding new response");
      submission.responses.push({
        questionId,
        selectedOption,
        textAnswer,
        // Kept so a coding answer recovered by the expiry sweep still tells the
        // mentor which language it was written in.
        language: language || null,
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
