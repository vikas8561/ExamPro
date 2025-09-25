const express = require("express");
const router = express.Router();
const Test = require("../models/Test");
const PracticeTestSubmission = require("../models/PracticeTestSubmission");
const { authenticateToken, requireRole } = require("../middleware/auth");


// MEMORY OPTIMIZATION: Clean up old practice test data
const cleanupOldPracticeData = async () => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Remove practice test submissions older than 30 days
    const deletedCount = await PracticeTestSubmission.deleteMany({
      savedAt: { $lt: thirtyDaysAgo }
    });
    
    console.log(`🗑️ Cleaned up ${deletedCount.deletedCount} old practice test submissions`);
  } catch (error) {
    console.error('Error cleaning up old practice data:', error);
  }
};

// Run cleanup daily
setInterval(cleanupOldPracticeData, 24 * 60 * 60 * 1000); // 24 hours

// Get all practice tests for students
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    console.log('🎯 Fetching practice tests...');
    
    // First, let's see all practice tests regardless of status
    const allPracticeTests = await Test.find({ type: "practice" })
      .select("title subject status")
      .lean();
    console.log('🎯 All practice tests found:', allPracticeTests);
    
    // Then get only active ones - exclude questions for performance but include question count
    const tests = await Test.find({ 
      type: "practice", 
      status: "Active" 
    })
    .select("title subject instructions timeLimit createdBy questions")
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 })
    .lean();

    // Transform tests to include question count but exclude question content
    const testsWithQuestionCount = tests.map(test => ({
      _id: test._id,
      title: test.title,
      subject: test.subject,
      instructions: test.instructions,
      timeLimit: test.timeLimit,
      createdBy: test.createdBy,
      questionCount: test.questions ? test.questions.length : 0,
      // Exclude the actual questions array for performance
      questions: undefined
    }));

    console.log(`🎯 Active practice tests found: ${testsWithQuestionCount.length}`);
    res.json({ tests: testsWithQuestionCount });
  } catch (error) {
    console.error('🎯 Error fetching practice tests:', error);
    next(error);
  }
});

// Get practice test by ID
router.get("/:testId", authenticateToken, async (req, res, next) => {
  try {
    const test = await Test.findOne({ 
      _id: req.params.testId, 
      type: "practice", 
      status: "Active" 
    })
    .select("title subject instructions timeLimit questions")
    .lean();

    if (!test) {
      return res.status(404).json({ message: "Practice test not found" });
    }

    // Remove correct answers from questions for practice tests
    const questionsWithoutAnswers = test.questions.map(q => ({
      ...q,
      answer: undefined, // Don't send correct answers
      answers: undefined // Removed MSQ support
    }));

    res.json({
      ...test,
      questions: questionsWithoutAnswers
    });
  } catch (error) {
    next(error);
  }
});

// Get current attempt data (for showing previous selections when starting new attempt)
router.get("/:testId/current-attempt", authenticateToken, async (req, res, next) => {
  try {
    const { testId } = req.params;
    const userId = req.user.userId;

    // Get the current attempt data for this user and test
    const currentAttempt = await PracticeTestSubmission.findOne({
      testId,
      userId
    }).select('responses attemptNumber isCompleted savedAt');
    
    console.log('Current attempt found:', currentAttempt);

    if (!currentAttempt) {
      return res.json({
        hasPreviousAttempt: false,
        responses: [],
        attemptNumber: 0
      });
    }

    // Return the previous attempt data for restoration
    res.json({
      hasPreviousAttempt: true,
      responses: currentAttempt.responses || [],
      attemptNumber: currentAttempt.attemptNumber,
      isCompleted: currentAttempt.isCompleted,
      lastSavedAt: currentAttempt.savedAt
    });
  } catch (error) {
    console.error("Error in GET /api/practice-tests/:testId/current-attempt:", error.message, error.stack);
    next(error);
  }
});

// Save current attempt data (real-time saving during attempt)
router.post("/:testId/save-current", authenticateToken, async (req, res, next) => {
  try {
    const { testId } = req.params;
    const { responses, timeSpent } = req.body;
    const userId = req.user.userId;

    if (!responses) {
      return res.status(400).json({ message: "responses are required" });
    }

    // Find existing submission or create new one
    let submission = await PracticeTestSubmission.findOne({
      testId,
      userId
    });

    if (submission) {
      // Update existing submission with current attempt data
      submission.responses = responses;
      submission.timeSpent = timeSpent || 0;
      submission.savedAt = new Date();
      await submission.save();
    } else {
      // Create new submission for first attempt
      submission = await PracticeTestSubmission.create({
        testId,
        userId,
        responses: responses,
        timeSpent: timeSpent || 0,
        attemptNumber: 1,
        isCompleted: false
      });
    }

    res.json({
      message: "Current attempt saved successfully",
      attemptNumber: submission.attemptNumber,
      savedAt: submission.savedAt
    });
  } catch (error) {
    console.error("Error in POST /api/practice-tests/:testId/save-current:", error.message, error.stack);
    next(error);
  }
});

// Save practice test responses (final submit)
router.post("/:testId/save", authenticateToken, async (req, res, next) => {
  try {
    const { testId } = req.params;
    const { responses, timeSpent } = req.body;
    const userId = req.user.userId;

    if (!responses) {
      return res.status(400).json({ message: "responses are required" });
    }

    // Get the practice test
    const test = await Test.findOne({ 
      _id: testId, 
      type: "practice", 
      status: "Active" 
    });

    if (!test) {
      return res.status(404).json({ message: "Practice test not found" });
    }

    // Calculate score and correctness
    let totalScore = 0;
    let maxScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let notAnsweredCount = 0;
    const processedResponses = [];

    for (const question of test.questions) {
      const response = responses.find(r => r.questionId === question._id.toString());
      maxScore += question.points || 1;

      let isCorrect = false;
      let points = 0;
      let selectedOption = "";
      let textAnswer = "";
      let isAnswered = false;

      if (response) {
        if (question.kind === "mcq") {
          selectedOption = response.selectedOption || "";
          isAnswered = selectedOption !== "";
          isCorrect = selectedOption === question.answer;
          points = isCorrect ? (question.points || 1) : 0;
        } else {
          textAnswer = response.textAnswer || "";
          isAnswered = textAnswer.trim() !== "";
          // For practice tests, we don't evaluate theory/coding questions automatically
          points = 0;
        }
      }

      if (isCorrect) {
        correctCount++;
        totalScore += points;
      } else if (isAnswered) {
        incorrectCount++;
      } else {
        notAnsweredCount++;
      }

      processedResponses.push({
        questionId: question._id,
        selectedOption,
        textAnswer,
        isCorrect,
        isAnswered,
        points
      });
    }

    // Get the latest attempt number for this user and test
    // SINGLE ATTEMPT STORAGE: Only keep the last attempt
    // Find existing submission for this user and test
    const existingSubmission = await PracticeTestSubmission.findOne({
      testId,
      userId 
    });

    let submission;
    if (existingSubmission) {
      // Update existing submission with new attempt data
      existingSubmission.responses = processedResponses.map(r => ({
        questionId: r.questionId,
        selectedOption: r.selectedOption,
        isCorrect: r.isCorrect,
        points: r.points
      }));
      existingSubmission.totalScore = totalScore;
      existingSubmission.maxScore = maxScore;
      existingSubmission.correctCount = correctCount;
      existingSubmission.incorrectCount = incorrectCount;
      existingSubmission.notAnsweredCount = notAnsweredCount;
      existingSubmission.timeSpent = timeSpent || 0;
      existingSubmission.attemptNumber = existingSubmission.attemptNumber + 1;
      existingSubmission.isCompleted = true;
      existingSubmission.savedAt = new Date();
      
      await existingSubmission.save();
      submission = existingSubmission;
    } else {
      // Create new submission for first attempt
      submission = await PracticeTestSubmission.create({
        testId,
        userId,
        responses: processedResponses.map(r => ({
          questionId: r.questionId,
          selectedOption: r.selectedOption,
          isCorrect: r.isCorrect,
          points: r.points
        })),
        totalScore,
        maxScore,
        correctCount,
        incorrectCount,
        notAnsweredCount,
        timeSpent: timeSpent || 0,
        attemptNumber: 1,
        isCompleted: true
      });
    }

    res.status(201).json({
      submission,
      totalScore,
      maxScore,
      correctCount,
      incorrectCount,
      notAnsweredCount,
      message: "Practice test saved successfully"
    });
  } catch (error) {
    console.error("Error in POST /api/practice-tests/:testId/save:", error.message, error.stack);
    next(error);
  }
});

// Backward compatible endpoint for old URL format with attemptNumber (MUST BE FIRST)
router.get("/:testId/results/:attemptNumber", authenticateToken, async (req, res, next) => {
  try {
    const { testId } = req.params; // attemptNumber is ignored
    const userId = req.user.userId;

    const submission = await PracticeTestSubmission.findOne({
      testId,
      userId
    }).populate({
      path: "testId",
      select: "title subject questions"
    });

    if (!submission) {
      return res.status(404).json({ message: "Practice test submission not found" });
    }

    // For practice tests, only show if the answer is correct or incorrect, not the correct answer
    const questionsWithResponses = submission.testId.questions.map(question => {
      const response = submission.responses.find(r => 
        r.questionId.toString() === question._id.toString()
      );

      return {
        _id: question._id,
        text: question.text,
        kind: question.kind,
        options: question.options,
        points: question.points,
        // Don't include correct answers for practice tests
        answer: undefined,
        answers: undefined,
        // Include student's response and correctness
        selectedOption: response?.selectedOption || "",
        textAnswer: response?.textAnswer || "",
        isCorrect: response?.isCorrect || false,
        isAnswered: response?.isAnswered || false,
        pointsEarned: response?.points || 0
      };
    });

    res.json({
      test: {
        _id: submission.testId._id,
        title: submission.testId.title,
        subject: submission.testId.subject,
        questions: questionsWithResponses
      },
      submission: {
        _id: submission._id,
        totalScore: submission.totalScore,
        maxScore: submission.maxScore,
        correctCount: submission.correctCount,
        incorrectCount: submission.incorrectCount,
        notAnsweredCount: submission.notAnsweredCount,
        savedAt: submission.savedAt,
        timeSpent: submission.timeSpent,
        attemptNumber: submission.attemptNumber,
        isCompleted: submission.isCompleted
      }
    });
  } catch (error) {
    console.error("Error in GET /api/practice-tests/:testId/results/:attemptNumber:", error.message, error.stack);
    next(error);
  }
});

// Get practice test results (single attempt storage)
router.get("/:testId/results", authenticateToken, async (req, res, next) => {
  try {
    const { testId } = req.params;
    const userId = req.user.userId;

    const submission = await PracticeTestSubmission.findOne({
      testId,
      userId
    }).populate({
      path: "testId",
      select: "title subject questions"
    });

    if (!submission) {
      return res.status(404).json({ message: "Practice test submission not found" });
    }

    // For practice tests, only show if the answer is correct or incorrect, not the correct answer
    const questionsWithResponses = submission.testId.questions.map(question => {
      const response = submission.responses.find(r => 
        r.questionId.toString() === question._id.toString()
      );

      return {
        _id: question._id,
        text: question.text,
        kind: question.kind,
        options: question.options,
        points: question.points,
        // Don't include correct answers for practice tests
        answer: undefined,
        answers: undefined,
        // Include student's response and correctness
        selectedOption: response?.selectedOption || "",
        textAnswer: response?.textAnswer || "",
        isCorrect: response?.isCorrect || false,
        isAnswered: response?.isAnswered || false,
        pointsEarned: response?.points || 0
      };
    });

    res.json({
      test: {
        _id: submission.testId._id,
        title: submission.testId.title,
        subject: submission.testId.subject,
        questions: questionsWithResponses
      },
      submission: {
        _id: submission._id,
        totalScore: submission.totalScore,
        maxScore: submission.maxScore,
        correctCount: submission.correctCount,
        incorrectCount: submission.incorrectCount,
        notAnsweredCount: submission.notAnsweredCount,
        savedAt: submission.savedAt,
        timeSpent: submission.timeSpent,
        attemptNumber: submission.attemptNumber,
        isCompleted: submission.isCompleted
      }
    });
  } catch (error) {
    console.error("Error in GET /api/practice-tests/:testId/results/:attemptNumber:", error.message, error.stack);
    next(error);
  }
});


// Get practice test attempt for a user (single attempt storage)
router.get("/:testId/attempts", authenticateToken, async (req, res, next) => {
  try {
    const { testId } = req.params;
    const userId = req.user.userId;

    const submission = await PracticeTestSubmission.findOne({
      testId,
      userId
    })
    .select("totalScore maxScore correctCount incorrectCount notAnsweredCount savedAt timeSpent attemptNumber isCompleted");

    if (!submission) {
      return res.json({ submissions: [] });
    }

    // Return as array for compatibility with frontend
    res.json({ submissions: [submission] });
  } catch (error) {
    console.error("Error in GET /api/practice-tests/:testId/attempts:", error.message, error.stack);
    next(error);
  }
});

// Get user's practice test history
router.get("/user/history", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const submissions = await PracticeTestSubmission.find({ userId })
      .populate({
        path: "testId",
        select: "title subject"
      })
      .select("testId totalScore maxScore correctCount incorrectCount savedAt attemptNumber")
      .sort({ savedAt: -1 });

    res.json({ submissions });
  } catch (error) {
    console.error("Error in GET /api/practice-tests/user/history:", error.message, error.stack);
    next(error);
  }
});

// MEMORY OPTIMIZATION: Manual cleanup endpoint (admin only)
router.post("/cleanup", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const { daysOld = 30 } = req.body;
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    
    // Clean up old practice test submissions
    const deletedCount = await PracticeTestSubmission.deleteMany({
      savedAt: { $lt: cutoffDate }
    });
    
    res.json({
      message: `Cleaned up ${deletedCount.deletedCount} old practice test submissions`,
      deletedCount: deletedCount.deletedCount,
      cutoffDate: cutoffDate.toISOString()
    });
  } catch (error) {
    console.error('Error in practice test cleanup:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
