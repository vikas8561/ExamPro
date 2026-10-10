const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const TestSubmission = require("../models/TestSubmission");
const Assignment = require("../models/Assignment");
const { authenticateToken } = require("../middleware/auth");
const { requireProctorSession } = require("../middleware/proctorSession");
const { isAttemptExpired } = require("../services/attemptWindow");

/**
 * An answer sent just as the clock runs out -- typed at 59:59, arriving a
 * moment later -- is still accepted for this long. The same allowance the
 * submit route gives a manual hand-in and the coding routes give a run.
 */
const CLOCK_SLACK_MS = 5000;

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

    // Only the student the assignment belongs to may save answers to it. Without
    // this, saving against someone else's assignment id quietly created a
    // submission row under the caller's id on that attempt, which readers that
    // look submissions up by assignment alone could then pick up as the real one.
    const assignment = await Assignment.findById(assignmentId)
      .select("userId testId status startTime duration deadline startedAt")
      .populate("testId", "timeLimit")
      .lean();
    if (!assignment) {
      console.error("❌ Assignment not found:", assignmentId);
      return res.status(404).json({ message: "Assignment not found" });
    }
    if (String(assignment.userId) !== String(userId)) {
      return res.status(403).json({
        message: "This assignment does not belong to you.",
        reason: "not_owner",
      });
    }

    // Only while the attempt is running.
    //
    // The proctoring session was the only gate, and a session stays "active"
    // after the clock runs out until the expiry sweep closes it -- the 5-minute
    // grace plus up to a minute for the sweep to come round. For those minutes a
    // student could keep answering a paper whose time was up, and the sweep then
    // graded what they had added. The attempt's status was never checked either,
    // so a test that needs no proctoring session accepted answers after it had
    // been handed in.
    if (assignment.status !== "In Progress") {
      return res.status(400).json({
        message: assignment.status === "Completed" || assignment.status === "Cancelled"
          ? "This test has already been submitted, so answers can no longer be changed."
          : "This test is not in progress.",
        code: "attempt_not_active",
      });
    }
    if (isAttemptExpired(assignment, assignment.testId, CLOCK_SLACK_MS)) {
      return res.status(400).json({
        message: "This test's time is up, so answers can no longer be changed.",
        code: "attempt_expired",
      });
    }

    // Get or create submission
    let submission = await TestSubmission.findOne({ assignmentId, userId });
    console.log("🔍 Found existing submission:", !!submission);

    if (!submission) {
      console.log("✅ Assignment found, creating new submission");
      submission = new TestSubmission({
        assignmentId,
        testId: assignment.testId?._id || assignment.testId,
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

    // Just an acknowledgement. This used to echo the whole submission document,
    // which carries every response's marks once a coding answer has been graded.
    res.status(200).json({ message: "Answer saved successfully" });
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

    const submission = await TestSubmission.findOne({ assignmentId, userId }).lean();

    if (!submission) {
      return res.status(404).json({ message: "No answers found for this assignment" });
    }

    // What the exam page needs to put the student's work back after a reload --
    // and nothing that marks it. This used to return the stored responses
    // whole, so once a paper was graded, each question's `isCorrect` and
    // `points` were one request away, long before results were released.
    // Pass counts stay: they are what /coding/submit already tells the student
    // during the exam.
    res.json((submission.responses || []).map((response) => ({
      questionId: response.questionId,
      selectedOption: response.selectedOption ?? null,
      textAnswer: response.textAnswer ?? null,
      draftAnswer: response.draftAnswer ?? null,
      language: response.language ?? null,
      passedCount: response.passedCount ?? null,
      totalHidden: response.totalHidden ?? null,
      submittedAt: response.submittedAt ?? null,
    })));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
