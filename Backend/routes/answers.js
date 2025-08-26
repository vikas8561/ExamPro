const express = require("express");
const router = express.Router();
const TestSubmission = require("../models/TestSubmission");
const Assignment = require("../models/Assignment");
const { authenticateToken } = require("../middleware/auth");

// Save individual answer
router.post("/", authenticateToken, async (req, res, next) => {
  try {
    const { assignmentId, questionId, selectedOption, textAnswer } = req.body;
    const userId = req.user.userId;

    if (!assignmentId || !questionId) {
      return res.status(400).json({ message: "assignmentId and questionId are required" });
    }

    // Get or create submission
    let submission = await TestSubmission.findOne({ assignmentId, userId });

    if (!submission) {
      // Create new submission if it doesn't exist
      const assignment = await Assignment.findById(assignmentId);
      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }

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

    if (existingResponseIndex !== -1) {
      // Update existing response
      submission.responses[existingResponseIndex].selectedOption = selectedOption;
      submission.responses[existingResponseIndex].textAnswer = textAnswer;
    } else {
      // Add new response
      submission.responses.push({
        questionId,
        selectedOption,
        textAnswer,
        isCorrect: false,
        points: 0,
        autoGraded: false
      });
    }

    await submission.save();

    res.status(200).json({
      message: "Answer saved successfully",
      submission
    });
  } catch (error) {
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
