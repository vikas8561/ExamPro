const express = require("express");
const router = express.Router();
const Test = require("../models/Test");
const PracticeTestSubmission = require("../models/PracticeTestSubmission");
const { authenticateToken, requireRole } = require("../middleware/auth");

// Get all practice tests for students
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    console.log('🎯 Fetching practice tests...');
    
    // First, let's see all practice tests regardless of status
    const allPracticeTests = await Test.find({ type: "practice" })
      .select("title subject status")
      .lean();
    console.log('🎯 All practice tests found:', allPracticeTests);
    
    // Then get only active ones
    const tests = await Test.find({ 
      type: "practice", 
      status: "Active" 
    })
    .select("title subject instructions timeLimit questions createdBy")
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 })
    .lean();

    console.log(`🎯 Active practice tests found: ${tests.length}`);
    res.json({ tests });
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
      answers: undefined // Don't send correct answers for MSQ
    }));

    res.json({
      ...test,
      questions: questionsWithoutAnswers
    });
  } catch (error) {
    next(error);
  }
});

// Save practice test responses (not submit)
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

      if (response) {
        if (question.kind === "mcq") {
          selectedOption = response.selectedOption || "";
          isCorrect = selectedOption === question.answer;
          points = isCorrect ? (question.points || 1) : 0;
        } else if (question.kind === "msq") {
          // For MSQ, check if all correct answers are selected and no wrong ones
          const correctAnswers = question.answers || [];
          const selectedAnswers = response.selectedOptions || [];
          isCorrect = correctAnswers.length === selectedAnswers.length && 
                     correctAnswers.every(ans => selectedAnswers.includes(ans));
          points = isCorrect ? (question.points || 1) : 0;
        } else {
          textAnswer = response.textAnswer || "";
          // For practice tests, we don't evaluate theory/coding questions automatically
          points = 0;
        }
      }

      if (isCorrect) {
        correctCount++;
        totalScore += points;
      } else if (response && (selectedOption || textAnswer)) {
        incorrectCount++;
      } else {
        notAnsweredCount++;
      }

      processedResponses.push({
        questionId: question._id,
        selectedOption,
        textAnswer,
        isCorrect,
        points
      });
    }

    // Get the latest attempt number for this user and test
    const latestSubmission = await PracticeTestSubmission.findOne({ 
      testId, 
      userId 
    }).sort({ attemptNumber: -1 });

    const attemptNumber = latestSubmission ? latestSubmission.attemptNumber + 1 : 1;

    // Save the practice test submission
    const submission = await PracticeTestSubmission.create({
      testId,
      userId,
      responses: processedResponses,
      totalScore,
      maxScore,
      correctCount,
      incorrectCount,
      notAnsweredCount,
      timeSpent: timeSpent || 0,
      attemptNumber,
      isCompleted: true
    });

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

// Get practice test results for a specific attempt
router.get("/:testId/results/:attemptNumber", authenticateToken, async (req, res, next) => {
  try {
    const { testId, attemptNumber } = req.params;
    const userId = req.user.userId;

    const submission = await PracticeTestSubmission.findOne({
      testId,
      userId,
      attemptNumber: parseInt(attemptNumber)
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

// Get all practice test attempts for a user
router.get("/:testId/attempts", authenticateToken, async (req, res, next) => {
  try {
    const { testId } = req.params;
    const userId = req.user.userId;

    const submissions = await PracticeTestSubmission.find({
      testId,
      userId
    })
    .select("totalScore maxScore correctCount incorrectCount notAnsweredCount savedAt timeSpent attemptNumber isCompleted responses")
    .sort({ attemptNumber: -1 });

    console.log('🎯 Backend: Returning submissions:', submissions.map(s => ({
      attemptNumber: s.attemptNumber,
      responsesCount: s.responses?.length || 0,
      responses: s.responses
    })));
    
    res.json({ submissions });
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

module.exports = router;
