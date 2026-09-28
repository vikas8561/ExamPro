const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Test = require("../models/Test");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { attach } = require("../services/principals");
const { resolveProctorStatusForTest } = require("../middleware/proctorSession");
const { sanitizeQuestions, canSeeAnswers } = require("../services/questionSanitizer");
const { sanitizeCodingQuestion } = require("../services/testCases");
const { recalculateScoresForTest } = require("../services/scoreCalculation");
const { resolveOrderedQuestions } = require("../services/questionOrder");
const Assignment = require("../models/Assignment");
const Mentor = require("../models/Mentor");
const Subject = require("../models/Subject");
const { invalidateTestCache } = require("../utils/testCache");

// Get all tests (admin/mentor) - ULTRA FAST VERSION with pagination
// Admins see all tests; mentors see only their own.
router.get("/", authenticateToken, requireRole(["admin", "Mentor"]), async (req, res, next) => {
  try {
    const startTime = Date.now();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search || "";
    const { status } = req.query;

    // Build query
    const query = {};

    // Mentors can only see tests they created for their assigned subjects
    const userRole = String(req.user?.role || "").toLowerCase();
    if (userRole === "mentor") {
      const mentor = await Mentor.findById(req.user.userId).populate("subjects", "name").lean();
      const subjectNames = (mentor?.subjects || [])
        .map((s) => (typeof s === "string" ? s : s?.name || "").trim())
        .filter(Boolean);

      if (subjectNames.length === 0) {
        query._id = { $in: [] };
      } else {
        const hasAllSubject = subjectNames.some((s) => s.toUpperCase() === "ALL");
        const subjectRegexes = subjectNames.map(
          (name) => new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i")
        );

        query.createdBy = new mongoose.Types.ObjectId(req.user.userId);
        if (!hasAllSubject) {
          query.subject = { $in: subjectRegexes };
        }
      }
    }

    if (status) {
      query.status = status;
    }

    // Search functionality - search in title, subject, type and status
    if (searchTerm) {
      query.$or = [
        { title: { $regex: searchTerm, $options: "i" } },
        { subject: { $regex: searchTerm, $options: "i" } },
        { type: { $regex: searchTerm, $options: "i" } },
        { status: { $regex: searchTerm, $options: "i" } }
      ];
    }

    // Get total count for pagination
    const totalTests = await Test.countDocuments(query);

    // Get tests with aggregation to include calculated fields (participants, avgScore)
    const pipeline = [
      { $match: query },
      // Lookup submissions to calculate stats
      {
        $lookup: {
          from: "testsubmissions",
          localField: "_id",
          foreignField: "testId",
          as: "submissions"
        }
      },
      // Calculate derived fields
      {
        $addFields: {
          participants: { $size: "$submissions" },
          avgScore: {
            $cond: {
              if: { $gt: [{ $size: "$submissions" }, 0] },
              then: {
                $avg: {
                  $map: {
                    input: "$submissions",
                    as: "sub",
                    in: {
                      $cond: [
                        { $gt: ["$$sub.maxScore", 0] },
                        { $multiply: [{ $divide: ["$$sub.totalScore", "$$sub.maxScore"] }, 100] },
                        0
                      ]
                    }
                  }
                }
              },
              else: 0
            }
          }
        }
      },
      // Remove heavy submissions array
      { $project: { submissions: 0 } },

      // Populate createdBy (Note: $lookup is needed for aggregation populate)
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "createdBy"
        }
      },
      { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },

      // Keep only necessary fields from user
      {
        $addFields: {
          "createdBy": {
            name: "$createdBy.name",
            email: "$createdBy.email",
            _id: "$createdBy._id"
          }
        }
      },

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ];

    const tests = await Test.aggregate(pipeline);

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
    const test = await attach(
      await Test.findById(req.params.id),
      "createdBy",
      "Author"
    );

    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    // Students take tests through this endpoint, so everything that would give
    // away the answer must be stripped. Admins and mentors need the full
    // document to author and review.
    if (canSeeAnswers(req.user)) {
      const userRole = String(req.user?.role || "").toLowerCase();
      if (userRole === "mentor") {
        const isCreator = String(test.createdBy?._id || test.createdBy) === String(req.user.userId);
        const conductsAssignment = await Assignment.exists({
          testId: req.params.id,
          mentorId: req.user.userId
        });

        if (!isCreator && !conductsAssignment) {
          return res.status(403).json({ message: "You can only access tests you create or conduct." });
        }

        const mentor = await Mentor.findById(req.user.userId).populate("subjects", "name").lean();
        const subjectNames = (mentor?.subjects || [])
          .map((s) => (typeof s === "string" ? s : s?.name || "").trim().toLowerCase())
          .filter(Boolean);
        const hasAllSubject = subjectNames.includes("all");
        const testSubject = (test.subject || "").trim().toLowerCase();
        if (!hasAllSubject && !subjectNames.includes(testSubject)) {
          return res.status(403).json({ message: "You can only access tests related to your assigned subjects." });
        }
      }

      return res.json(test);
    }

    // attach() already returned a plain object, virtuals included.
    const safeTest = { ...test };

    // The other route that hands a student real question content. Without this
    // check a student could skip the exam page entirely and fetch the paper
    // with a direct API call, which is exactly what the old client-side-only
    // proctoring could not prevent.
    const proctorStatus = await resolveProctorStatusForTest(req, req.params.id);
    if (proctorStatus.required && !proctorStatus.ok) {
      return res.status(403).json({
        message: "This test must be taken with proctoring active. Please start it from your assignments page.",
        proctoringRequired: true,
        reason: proctorStatus.reason,
      });
    }

    // Shared sanitizer. The hand-written version this replaces stripped
    // answer/answers/hiddenTestCases but forgot expectedAnswer, so students
    // could read the model answer for every theory question.
    safeTest.questions = sanitizeQuestions(safeTest.questions);

    // This is how TakeCodingTest loads the paper, so it has to honour the same
    // per-student order as the assignment routes -- otherwise a coding exam
    // would come back in a different order than the one the student started.
    // No assignment travels with this request, so look it up: Assignment is
    // unique per {testId, userId}, so this is a single indexed lookup.
    const assignment = await Assignment.findOne({
      testId: req.params.id,
      userId: req.user.userId,
    }).select("_id questionOrder");

    if (assignment) {
      const { questions, order, changed } = resolveOrderedQuestions({
        test: safeTest,
        assignment,
        questions: safeTest.questions,
      });
      safeTest.questions = questions;
      if (changed) {
        await Assignment.updateOne({ _id: assignment._id }, { $set: { questionOrder: order } });
      }
    }

    res.json(safeTest);
  } catch (error) {
    next(error);
  }
});

// Create new test (admin/mentor)
router.post("/", authenticateToken, requireRole(["admin", "Mentor"]), async (req, res, next) => {
  try {
    const { title, subject, type, instructions, timeLimit, negativeMarkingPercent, allowedTabSwitches, shuffleQuestions, questions } = req.body;
    console.log('DEBUG: Creating test with allowedTabSwitches:', allowedTabSwitches);

    if (!title) {
      return res.status(400).json({ message: "Test title is required" });
    }

    // Mentor-specific validations
    const userRole = String(req.user?.role || "").toLowerCase();
    if (userRole === "mentor") {
      const mentor = await Mentor.findById(req.user.userId)
        .populate("subjects", "name")
        .lean();

      if (!mentor) {
        return res.status(403).json({ message: "Mentor profile not found" });
      }

      const mentorSubjectNames = (mentor.subjects || [])
        .map((s) => (typeof s === "string" ? s : s?.name || "").toLowerCase().trim())
        .filter(Boolean);

      // Mentor must have at least one assigned subject
      if (mentorSubjectNames.length === 0) {
        return res.status(403).json({ message: "You have no subjects assigned. Contact an admin." });
      }

      const hasAllSubject = mentorSubjectNames.includes("all");

      // Validate the test's subject belongs to the mentor's assigned subjects
      if (!hasAllSubject && (!subject || !mentorSubjectNames.includes(subject.trim().toLowerCase()))) {
        return res.status(403).json({ message: `You are not assigned to the subject "${subject}". You can only create tests for your assigned subjects.` });
      }

      // Coding tests require DSA assignment
      if (type === "coding") {
        const hasDSA = hasAllSubject || mentorSubjectNames.some(s => s === "dsa" || s.includes("dsa") || s.includes("data structure"));
        if (!hasDSA) {
          return res.status(403).json({ message: "Only mentors assigned to DSA can create coding tests." });
        }
      }
    }

    // Validate allowedTabSwitches (0-100 for regular tests, -1 for practice tests)
    const tabSwitchesValue = Number(allowedTabSwitches || 0);
    if (type !== "practice" && (tabSwitchesValue < 0 || tabSwitchesValue > 100)) {
      return res.status(400).json({ message: "Allowed tab switches must be between 0 and 100" });
    }

    // Process questions to ensure test cases are properly formatted
    const processedQuestions = (Array.isArray(questions) ? questions : []).map(rawQuestion => {
      // A new test has no existing questions, so there is no id worth keeping
      // and a client-supplied one could only collide. Mongoose mints them.
      const { _id, ...q } = rawQuestion;
      if (q.kind === 'coding') {
        // Shared rule -- see services/testCases.js. The hand-written filter
        // this replaces dropped any case with an empty input or an empty
        // expected output, which are both legitimate.
        return sanitizeCodingQuestion(q);
      }

      if (q.kind === 'theory') {
        return {
          ...q,
          expectedAnswer: q.expectedAnswer || ''
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
      shuffleQuestions: Boolean(shuffleQuestions),
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
      shuffleQuestions: test.shuffleQuestions,
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

// Update test (admin/mentor - mentors can only update their own)
router.put("/:id", authenticateToken, requireRole(["admin", "Mentor"]), async (req, res, next) => {
  try {
    const { title, subject, type, instructions, timeLimit, negativeMarkingPercent, allowedTabSwitches, shuffleQuestions, questions, status } = req.body;

    // Mentor can only update tests they created
    const userRole = String(req.user?.role || "").toLowerCase();
    if (userRole === "mentor") {
      const existingTest = await Test.findById(req.params.id).select("createdBy subject type").lean();
      if (!existingTest || String(existingTest.createdBy) !== String(req.user.userId)) {
        return res.status(403).json({ message: "You can only edit tests you created." });
      }

      const mentor = await Mentor.findById(req.user.userId)
        .populate("subjects", "name")
        .lean();

      if (!mentor) {
        return res.status(403).json({ message: "Mentor profile not found" });
      }

      const mentorSubjectNames = (mentor.subjects || [])
        .map((s) => (typeof s === "string" ? s : s?.name || "").toLowerCase().trim())
        .filter(Boolean);

      const hasAllSubject = mentorSubjectNames.includes("all");

      const targetSubject = subject !== undefined ? subject : existingTest.subject;
      if (!hasAllSubject && (!targetSubject || !mentorSubjectNames.includes(targetSubject.trim().toLowerCase()))) {
        return res.status(403).json({ message: `You are not assigned to the subject "${targetSubject}". You can only edit tests for your assigned subjects.` });
      }

      const targetType = type || existingTest.type;
      if (targetType === "coding") {
        const hasDSA = hasAllSubject || mentorSubjectNames.some(s => s === "dsa" || s.includes("dsa") || s.includes("data structure"));
        if (!hasDSA) {
          return res.status(403).json({ message: "Only mentors assigned to DSA can create or update coding tests." });
        }
      }
    }

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
    if (shuffleQuestions !== undefined) updateData.shuffleQuestions = Boolean(shuffleQuestions);

    // Process questions to ensure test cases are properly formatted
    if (questions) {
      // Keep the question ids this test already has.
      //
      // The edit form used to drop `_id`, so findByIdAndUpdate minted a brand
      // new subdocument id for every question on every save. Student responses
      // are matched to questions by id and nothing else, so one edit orphaned
      // every answer ever given: finished papers rendered as "Not answered"
      // throughout, and the re-grade below matched nothing and silently left
      // stale marks in place.
      //
      // Only ids that genuinely belong to THIS test are honoured, and each at
      // most once. Everything else -- a newly added question, a duplicated one,
      // a stale id from another test, anything forged -- falls through to a
      // fresh id from Mongoose. That is the safe default: two subdocuments
      // sharing an id would make `test.questions.id(...)` ambiguous, and every
      // grading lookup in the codebase goes through exactly that call.
      const existingTest = await Test.findById(req.params.id).select("questions").lean();
      const idsOnThisTest = new Set((existingTest?.questions || []).map(q => String(q._id)));
      const alreadyClaimed = new Set();

      updateData.questions = questions.map(q => {
        const { _id, ...question } = q;
        const candidate = _id === null || _id === undefined ? null : String(_id);
        const keepId = Boolean(candidate) && idsOnThisTest.has(candidate) && !alreadyClaimed.has(candidate);
        if (keepId) alreadyClaimed.add(candidate);

        // Same shared rule the create path uses -- services/testCases.js.
        const processed = question.kind === 'coding'
          ? sanitizeCodingQuestion(question)
          : question;

        return keepId ? { ...processed, _id: candidate } : processed;
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

    const test = await attach(
      await Test.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      ),
      "createdBy",
      "Author"
    );

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

// Delete test (admin/mentor - mentors can only delete their own)
router.delete("/:id", authenticateToken, requireRole(["admin", "Mentor"]), async (req, res, next) => {
  try {
    const test = await Test.findById(req.params.id);

    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    const userRole = String(req.user?.role || "").toLowerCase();
    if (userRole === "mentor" && String(test.createdBy) !== String(req.user.userId)) {
      return res.status(403).json({ message: "You can only delete tests you created." });
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

// Get test statistics (admin/mentor)
router.get("/:id/stats", authenticateToken, requireRole(["admin", "Mentor"]), async (req, res, next) => {
  try {
    const test = await Test.findById(req.params.id);

    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    const userRole = String(req.user?.role || "").toLowerCase();
    if (userRole === "mentor") {
      const isCreator = String(test.createdBy) === String(req.user.userId);
      const isAssigned = await Assignment.exists({ testId: req.params.id, mentorId: req.user.userId });
      if (!isCreator && !isAssigned) {
        return res.status(403).json({ message: "You can only view stats for tests you conduct." });
      }

      const mentor = await Mentor.findById(req.user.userId).populate("subjects", "name").lean();
      const subjectNames = (mentor?.subjects || [])
        .map((s) => (typeof s === "string" ? s : s?.name || "").trim().toLowerCase())
        .filter(Boolean);
      const hasAllSubject = subjectNames.includes("all");
      const testSubject = (test.subject || "").trim().toLowerCase();
      if (!hasAllSubject && !subjectNames.includes(testSubject)) {
        return res.status(403).json({ message: "You can only view stats for tests in your assigned subjects." });
      }
    }

    // Get assignment and submission stats
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

// Download test results (admin/mentor) - returns student names and scores for CSV export
router.get("/:id/results/download", authenticateToken, requireRole(["admin", "Mentor"]), async (req, res, next) => {
  try {
    const test = await Test.findById(req.params.id).select("title createdBy subject");

    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    const userRole = String(req.user?.role || "").toLowerCase();
    if (userRole === "mentor") {
      const isCreator = String(test.createdBy) === String(req.user.userId);
      const isAssigned = await Assignment.exists({ testId: req.params.id, mentorId: req.user.userId });
      if (!isCreator && !isAssigned) {
        return res.status(403).json({ message: "You can only download results for tests you conduct." });
      }

      const mentor = await Mentor.findById(req.user.userId).populate("subjects", "name").lean();
      const subjectNames = (mentor?.subjects || [])
        .map((s) => (typeof s === "string" ? s : s?.name || "").trim().toLowerCase())
        .filter(Boolean);
      const hasAllSubject = subjectNames.includes("all");
      const testSubject = (test.subject || "").trim().toLowerCase();
      if (!hasAllSubject && !subjectNames.includes(testSubject)) {
        return res.status(403).json({ message: "You can only download results for tests in your assigned subjects." });
      }
    }

    const TestSubmission = require("../models/TestSubmission");

    // Get all submissions for this test with student names
    const submissions = await attach(
      await TestSubmission.find({ testId: req.params.id })
        .select("userId totalScore maxScore submittedAt")
        .lean(),
      "userId",
      "Student"
    );

    // Build results array
    const results = submissions
      .filter(sub => sub.userId) // Filter out submissions with deleted users
      .map(sub => ({
        name: sub.userId.name,
        email: sub.userId.email,
        totalScore: sub.totalScore || 0,
        maxScore: sub.maxScore || 0,
        submittedAt: sub.submittedAt
      }))
      .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically by name

    res.json({
      testTitle: test.title,
      totalStudents: results.length,
      results
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
