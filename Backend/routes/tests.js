const express = require("express");
const router = express.Router();
const Test = require("../models/Test");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { recalculateScoresForTest } = require("../services/scoreCalculation");
const { invalidateTestCache } = require("../utils/testCache");

// Get all tests (admin only) - ULTRA FAST VERSION with pagination
router.get("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const startTime = Date.now();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search || "";
    const { status } = req.query;
    
    // Build query
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    // Search functionality - search in title, subject, type, status, and OTP
    if (searchTerm) {
      query.$or = [
        { title: { $regex: searchTerm, $options: "i" } },
        { subject: { $regex: searchTerm, $options: "i" } },
        { type: { $regex: searchTerm, $options: "i" } },
        { status: { $regex: searchTerm, $options: "i" } },
        { otp: { $regex: searchTerm, $options: "i" } }
      ];
    }

    // Get total count for pagination
    const totalTests = await Test.countDocuments(query);

    // ULTRA FAST: Get tests with MINIMAL data (NO questions!)
    const tests = await Test.find(query)
      .select("title subject type instructions timeLimit negativeMarkingPercent allowedTabSwitches otp status createdAt createdBy")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean() for 2x faster queries

    const totalTime = Date.now() - startTime;
    // console.log(`✅ ULTRA FAST admin tests completed in ${totalTime}ms - Found ${tests.length} tests`);
    
    // Calculate pagination info
    const totalPages = Math.ceil(totalTests / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    
    res.json({ 
      tests,
      pagination: {
        currentPage: page,
        totalPages,
        totalTests,
        limit,
        hasNextPage,
        hasPrevPage
      }
    });
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

// Create new test (admin only)
router.post("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { title, subject, type, instructions, timeLimit, negativeMarkingPercent, allowedTabSwitches, questions } = req.body;
    console.log('DEBUG: Creating test with allowedTabSwitches:', allowedTabSwitches);

    if (!title) {
      return res.status(400).json({ message: "Test title is required" });
    }

    // Validate allowedTabSwitches (0-100 for regular tests, -1 for practice tests)
    const tabSwitchesValue = Number(allowedTabSwitches || 0);
    if (type !== "practice" && (tabSwitchesValue < 0 || tabSwitchesValue > 100)) {
      return res.status(400).json({ message: "Allowed tab switches must be between 0 and 100" });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Process questions to ensure test cases are properly formatted
    const processedQuestions = (Array.isArray(questions) ? questions : []).map(q => {
      if (q.kind === 'coding') {
        return {
          ...q,
          visibleTestCases: (q.visibleTestCases || []).filter(tc =>
            tc && tc.input && tc.input.trim() && tc.output && tc.output.trim()
          ),
          hiddenTestCases: (q.hiddenTestCases || []).filter(tc =>
            tc && tc.input && tc.input.trim() && tc.output && tc.output.trim()
          )
        };
      }
      return q;
    });

    const testData = {
      title: title.trim(),
      subject: subject || "",
      type: type || "mcq",
      instructions: instructions || "",
      timeLimit: Number(timeLimit || 30),
      negativeMarkingPercent: Number(negativeMarkingPercent || 0),
      allowedTabSwitches: Number(allowedTabSwitches || 0),
      otp: otp,
      questions: processedQuestions,
      createdBy: req.user.userId
    };

    // Handle practice test specific settings
    if (type === "practice") {
      testData.isPracticeTest = true;
      testData.status = "Active"; // Practice tests should be immediately available
      testData.practiceTestSettings = {
        allowMultipleAttempts: true,
        showCorrectAnswers: false,
        allowTabSwitching: true,
        noProctoring: true
      };
      // Practice tests should have no negative marking
      testData.negativeMarkingPercent = 0;
      // Practice tests allow unlimited tab switches
      testData.allowedTabSwitches = -1;
    }

    const test = await Test.create(testData);
    console.log('DEBUG: Test created in database:', test);

    // Invalidate test cache when new test is created
    invalidateTestCache();

    // Return test without populate for faster response - frontend can fetch details if needed
    // This significantly speeds up test creation, especially for tests with many questions
    const testResponse = {
      _id: test._id,
      title: test.title,
      subject: test.subject,
      type: test.type,
      instructions: test.instructions,
      timeLimit: test.timeLimit,
      negativeMarkingPercent: test.negativeMarkingPercent,
      allowedTabSwitches: test.allowedTabSwitches,
      otp: test.otp,
      status: test.status,
      questions: test.questions,
      createdBy: {
        _id: req.user.userId,
        name: req.user.name || '',
        email: req.user.email || ''
      },
      createdAt: test.createdAt,
      updatedAt: test.updatedAt
    };
    
    console.log('DEBUG: Test response prepared (without populate)');

    res.status(201).json(testResponse);
  } catch (error) {
    next(error);
  }
});

// Update test (admin only)
router.put("/:id", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { title, subject, type, instructions, timeLimit, negativeMarkingPercent, allowedTabSwitches, questions, status } = req.body;

    // Validate allowedTabSwitches if provided (0-100 for regular tests, -1 for practice tests)
    if (allowedTabSwitches !== undefined) {
      const tabSwitchesValue = Number(allowedTabSwitches);
      // Get test type from request body or fetch from database
      let testType = type;
      if (!testType) {
        const existingTest = await Test.findById(req.params.id);
        if (existingTest) testType = existingTest.type;
      }
      if (testType !== "practice" && (tabSwitchesValue < 0 || tabSwitchesValue > 100)) {
        return res.status(400).json({ message: "Allowed tab switches must be between 0 and 100" });
      }
    }

    const updateData = {};
    if (title) updateData.title = title.trim();
    if (subject !== undefined) updateData.subject = subject;
    if (type) updateData.type = type;
    if (instructions !== undefined) updateData.instructions = instructions;
    if (timeLimit) updateData.timeLimit = Number(timeLimit);
    if (negativeMarkingPercent !== undefined) updateData.negativeMarkingPercent = Number(negativeMarkingPercent);
    if (allowedTabSwitches !== undefined) updateData.allowedTabSwitches = Number(allowedTabSwitches);

    // Process questions to ensure test cases are properly formatted
    if (questions) {
      updateData.questions = questions.map(q => {
        if (q.kind === 'coding') {
          return {
            ...q,
            visibleTestCases: (q.visibleTestCases || []).filter(tc =>
              tc && tc.input && tc.input.trim() && tc.output && tc.output.trim()
            ),
            hiddenTestCases: (q.hiddenTestCases || []).filter(tc =>
              tc && tc.input && tc.input.trim() && tc.output && tc.output.trim()
            )
          };
        }
        return q;
      });
    }

    if (status) updateData.status = status;

    // Handle practice test specific settings
    if (type === "practice") {
      updateData.isPracticeTest = true;
      updateData.status = "Active"; // Practice tests should be immediately available
      updateData.practiceTestSettings = {
        allowMultipleAttempts: true,
        showCorrectAnswers: false,
        allowTabSwitching: true,
        noProctoring: true
      };
      // Practice tests should have no negative marking
      updateData.negativeMarkingPercent = 0;
      // Practice tests allow unlimited tab switches
      updateData.allowedTabSwitches = -1;
    } else {
      // If changing from practice to regular test, reset practice settings
      updateData.isPracticeTest = false;
      updateData.practiceTestSettings = undefined;
    }

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

    // Invalidate test cache when test is updated
    invalidateTestCache();

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

    // Invalidate test cache when test is deleted
    invalidateTestCache();

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
