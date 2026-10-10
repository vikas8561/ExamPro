const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Test = require("../models/Test");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { attach, COHORTS } = require("../services/principals");
const Student = require("../models/Student");
const { resolveProctorStatusForTest } = require("../middleware/proctorSession");
const { sanitizeQuestions, canSeeAnswers } = require("../services/questionSanitizer");
const { sanitizeCodingQuestion } = require("../services/testCases");
const { mcqQuestionsError } = require("../services/mcqOptions");
const { recalculateScoresForTest } = require("../services/scoreCalculation");
const { resolveOrderedQuestions } = require("../services/questionOrder");
const { hasAttemptOpened, notStartedBody } = require("../services/attemptWindow");
const Assignment = require("../models/Assignment");
const Mentor = require("../models/Mentor");
const Subject = require("../models/Subject");
const { isAllSubject } = require("../services/subjects");
const { invalidateTestCache } = require("../utils/testCache");

const isAllSubject = (s) => typeof s === "string" && s.trim().toUpperCase() === "ALL";

// Mentor subject names arrive lowercased and trimmed.
const isDSASubject = (s) => s === "dsa" || s.includes("dsa") || s.includes("data structure");
const isInterviewPrepSubject = (s) => s.includes("interview");

// Which mentors may author a given test type. Coding and MCQ + Coding tests are
// open to DSA and Interview Preparation mentors; every other type is open to all.
// Keep in sync with mentorCanCreateCoding in Frontend/src/pages/CreateTest.jsx.
function mentorTypeRestriction(type, mentorSubjectNames, hasAllSubject) {
  if (hasAllSubject || (type !== "coding" && type !== "mixed")) return null;
  if (mentorSubjectNames.some((s) => isDSASubject(s) || isInterviewPrepSubject(s))) return null;
  return type === "coding"
    ? "Only mentors assigned to DSA or Interview Preparation can create or update coding tests."
    : "Only mentors assigned to DSA or Interview Preparation can create or update MCQ + Coding tests.";
}

// findByIdAndUpdate skips the model's pre-save hook, so the update route checks
// this itself.
function mixedTestKindError(type, questions) {
  if (type !== "mixed" || !Array.isArray(questions)) return null;
  const invalid = questions.some((q) => q && q.kind !== "mcq" && q.kind !== "coding");
  return invalid ? "MCQ + Coding tests can only contain MCQ and coding questions" : null;
}

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

      // Compute questionCount and totalMarks from questions before dropping them
      {
        $addFields: {
          questionCount: { $size: { $ifNull: ["$questions", []] } },
          totalMarks: {
            $sum: {
              $map: {
                input: { $ifNull: ["$questions", []] },
                as: "q",
                in: {
                  $let: {
                    vars: {
                      codingMarks: {
                        $cond: [
                          { $eq: ["$$q.kind", "coding"] },
                          {
                            $sum: {
                              $map: {
                                input: { $ifNull: ["$$q.hiddenTestCases", []] },
                                as: "h",
                                in: { $ifNull: ["$$h.marks", 0] },
                              },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      $cond: [
                        { $gt: ["$$codingMarks", 0] },
                        "$$codingMarks",
                        { $convert: { input: "$$q.points", to: "double", onError: 1, onNull: 1 } },
                      ],
                    },
                  },
                },
              },
            },
          },
        }
      },

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
      { $limit: limit },

      // Lookup assignments to get scheduled startTime for the page
      {
        $lookup: {
          from: "assignments",
          let: { testId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$testId", "$$testId"] },
                startTime: { $exists: true, $ne: null }
              }
            },
            { $sort: { startTime: -1 } },
            { $limit: 1 },
            { $project: { startTime: 1 } }
          ],
          as: "scheduledAssignment"
        }
      },
      {
        $addFields: {
          startTime: {
            $ifNull: [
              "$startTime",
              { $arrayElemAt: ["$scheduledAssignment.startTime", 0] }
            ]
          }
        }
      },
      {
        $addFields: {
          hasStarted: {
            $cond: {
              if: { $and: [{ $ne: ["$startTime", null] }, { $lte: ["$startTime", new Date()] }] },
              then: true,
              else: { $gt: ["$participants", 0] }
            }
          }
        }
      },
      // Remove heavy/temporary fields from card list response
      { $project: { scheduledAssignment: 0, questions: 0 } }
    ];

    const tests = await Test.aggregate(pipeline);

    // Enrich the current page of tests with currently assigned batch labels
    if (tests.length > 0) {
      const testIds = tests.map((t) => t._id);
      const assignments = await Assignment.find({
        testId: { $in: testIds },
        status: { $ne: "Cancelled" }
      })
        .select("testId userId cohort")
        .lean();

      const assignmentsByTestId = new Map();
      const uncachedUserIds = [];

      for (const a of assignments) {
        const tId = String(a.testId);
        if (!assignmentsByTestId.has(tId)) {
          assignmentsByTestId.set(tId, []);
        }
        assignmentsByTestId.get(tId).push(a);
        if (!a.cohort && a.userId) {
          uncachedUserIds.push(a.userId);
        }
      }

      let studentUnivMap = new Map();
      if (uncachedUserIds.length > 0) {
        const students = await Student.find({ _id: { $in: uncachedUserIds } })
          .select("University")
          .lean();
        for (const s of students) {
          studentUnivMap.set(String(s._id), s.University);
        }
      }

      for (const t of tests) {
        const testAssignments = assignmentsByTestId.get(String(t._id)) || [];
        const batchLabels = new Set();

        for (const a of testAssignments) {
          if (a.cohort) {
            const c = COHORTS.find((co) => co.key === a.cohort);
            if (c && c.key !== "all") {
              batchLabels.add(c.label);
            } else if (c && c.key === "all") {
              batchLabels.add("All Students");
            } else if (a.cohort) {
              batchLabels.add(a.cohort);
            }
          } else if (a.userId) {
            const univ = studentUnivMap.get(String(a.userId));
            if (univ) {
              for (const c of COHORTS) {
                if (c.key === "all") continue;
                const filterUniv = c.filter?.University;
                if (typeof filterUniv === "string" && filterUniv === univ) {
                  batchLabels.add(c.label);
                } else if (filterUniv?.$in && filterUniv.$in.includes(univ)) {
                  batchLabels.add(c.label);
                }
              }
            }
          }
        }

        t.assignedBatches = Array.from(batchLabels);
      }
    }

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

      // Enrich test with schedule, cohort/batch, and assigned students if missing or from assignments
      const testObj = typeof test.toObject === "function" ? test.toObject() : { ...test };

      const existingAssignments = await Assignment.find({ testId: req.params.id })
        .select("startTime duration userId cohort")
        .lean();

      if (existingAssignments.length > 0) {
        if (!testObj.startTime) testObj.startTime = existingAssignments[0].startTime;
        if (!testObj.duration) testObj.duration = existingAssignments[0].duration;
        if (!testObj.selectedStudents || testObj.selectedStudents.length === 0) {
          testObj.selectedStudents = existingAssignments.map((a) => a.userId);
        }
        if (!testObj.cohort && existingAssignments[0].cohort) {
          testObj.cohort = existingAssignments[0].cohort;
        }
      }

      if (!testObj.assignmentMode) {
        if (testObj.cohort) {
          testObj.assignmentMode = testObj.cohort;
        } else if (existingAssignments.length > 0) {
          const studentIds = existingAssignments.map((a) => a.userId);
          const Student = require("../models/Student");
          const students = await Student.find({ _id: { $in: studentIds } }).select("University").lean();
          const univs = new Set(students.map((s) => s.University).filter(Boolean));

          let matchedCohort = null;
          const { COHORTS } = require("../services/principals");
          for (const c of COHORTS) {
            if (c.key === "all") continue;
            const filterUniv = c.filter?.University;
            if (typeof filterUniv === "string" && univs.size === 1 && univs.has(filterUniv)) {
              matchedCohort = c.key;
              break;
            } else if (filterUniv?.$in && univs.size > 0 && [...univs].every((u) => filterUniv.$in.includes(u))) {
              matchedCohort = c.key;
              break;
            }
          }
          testObj.assignmentMode = matchedCohort || (existingAssignments.length > 0 ? "manual" : "all");
          testObj.cohort = matchedCohort || "";
        } else {
          testObj.assignmentMode = "all";
        }
      }

      const TestSubmission = require("../models/TestSubmission");
      const hasSubmissions = Boolean(await TestSubmission.exists({ testId: req.params.id }));
      const hasStartedAttempt = existingAssignments.some((a) => a.status === "In Progress" || a.status === "Completed" || a.startedAt != null);
      const isPastStartTime = Boolean(testObj.startTime && new Date(testObj.startTime) <= new Date());
      testObj.questionCount = (testObj.questions || []).length;
      testObj.totalMarks = (testObj.questions || []).reduce((sum, q) => {
        if (q.kind === "coding") {
          const codingMarks = (q.hiddenTestCases || []).reduce(
            (acc, h) => acc + (typeof h.marks === "number" ? h.marks : 0),
            0
          );
          return sum + (codingMarks > 0 ? codingMarks : (typeof q.points === "number" ? q.points : 1));
        }
        return sum + (typeof q.points === "number" ? q.points : 1);
      }, 0);

      const batchLabels = new Set();
      const uncachedIds = [];
      for (const a of existingAssignments) {
        if (a.cohort) {
          const c = COHORTS.find((co) => co.key === a.cohort);
          if (c && c.key !== "all") batchLabels.add(c.label);
          else if (c && c.key === "all") batchLabels.add("All Students");
          else if (a.cohort) batchLabels.add(a.cohort);
        } else if (a.userId) {
          uncachedIds.push(a.userId);
        }
      }
      if (uncachedIds.length > 0) {
        const students = await Student.find({ _id: { $in: uncachedIds } }).select("University").lean();
        const univs = new Set(students.map((s) => s.University).filter(Boolean));
        for (const c of COHORTS) {
          if (c.key === "all") continue;
          const filterUniv = c.filter?.University;
          if (typeof filterUniv === "string" && univs.has(filterUniv)) {
            batchLabels.add(c.label);
          } else if (filterUniv?.$in && filterUniv.$in.some((u) => univs.has(u))) {
            batchLabels.add(c.label);
          }
        }
      }
      testObj.assignedBatches = Array.from(batchLabels);

      return res.json(testObj);
    }

    // attach() already returned a plain object, virtuals included.
    const safeTest = { ...test };

    // The other route that hands a student real question content. Without this
    // check a student could skip the exam page entirely and fetch the paper
    // with a direct API call, which is exactly what the old client-side-only
    // proctoring could not prevent.
    // The student's own attempt at this test. Assignment is unique per
    // {testId, userId}, so this is a single indexed lookup; it serves both the
    // start-time check here and the per-student question order further down.
    const assignment = await Assignment.findOne({
      testId: req.params.id,
      userId: req.user.userId,
    }).select("_id questionOrder startTime");

    const proctorStatus = await resolveProctorStatusForTest(req, req.params.id);

    // An exam paper is not served before the student's window opens. The
    // proctor check below used to be the only gate, and a session could be
    // opened early -- so the paper was one request away days in advance. Asked
    // of every proctored test, session or not: a session left over from before
    // a rescheduling must not unlock a paper whose window has moved.
    if (proctorStatus.required && assignment && !hasAttemptOpened(assignment)) {
      return res.status(403).json(notStartedBody(assignment));
    }

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
    // No assignment travels with this request; it was looked up above.
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
    const { title, subject, type, instructions, timeLimit, negativeMarkingPercent, allowedTabSwitches, shuffleQuestions, sebEnabled, questions, startTime, duration, assignmentMode, cohort, selectedStudents } = req.body;
    console.log('DEBUG: Creating test with allowedTabSwitches:', allowedTabSwitches);

    if (!title) {
      return res.status(400).json({ message: "Test title is required" });
    }

    if (isAllSubject(subject)) {
      return res.status(400).json({ message: '"ALL" is not a subject. Pick the subject this test belongs to.' });
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

      const restriction = mentorTypeRestriction(type, mentorSubjectNames, hasAllSubject);
      if (restriction) {
        return res.status(403).json({ message: restriction });
      }
    }

    const kindError = mixedTestKindError(type, questions);
    if (kindError) {
      return res.status(400).json({ message: kindError });
    }

    const mcqError = mcqQuestionsError(questions);
    if (mcqError) {
      return res.status(400).json({ message: mcqError });
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
      // Absent means "follow the system-wide SEB setting", so only an explicit
      // false opts the test out.
      sebEnabled: sebEnabled !== false,
      questions: processedQuestions,
      startTime: startTime ? new Date(startTime) : null,
      duration: duration ? Number(duration) : Number(timeLimit || 30),
      assignmentMode: assignmentMode || "all",
      cohort: cohort || (assignmentMode !== "manual" ? (assignmentMode || "") : ""),
      selectedStudents: Array.isArray(selectedStudents) ? selectedStudents : [],
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
      sebEnabled: test.sebEnabled,
      status: test.status,
      questions: test.questions,
      startTime: test.startTime,
      duration: test.duration,
      assignmentMode: test.assignmentMode,
      cohort: test.cohort,
      selectedStudents: test.selectedStudents,
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
    const { title, subject, type, instructions, timeLimit, negativeMarkingPercent, allowedTabSwitches, shuffleQuestions, sebEnabled, questions, status, startTime, duration, assignmentMode, cohort, selectedStudents } = req.body;

    if (subject !== undefined && isAllSubject(subject)) {
      return res.status(400).json({ message: '"ALL" is not a subject. Pick the subject this test belongs to.' });
    }

    // Check if test exists and whether editing is allowed
    const testToEdit = await Test.findById(req.params.id).select("createdBy subject type startTime").lean();
    if (!testToEdit) {
      return res.status(404).json({ message: "Test not found" });
    }

    // Disable editing once the test has started (editing must remain available before start time)
    const now = new Date();
    let testStartTime = testToEdit.startTime;
    if (!testStartTime) {
      const earliestAssignment = await Assignment.findOne({ testId: req.params.id, startTime: { $ne: null } })
        .sort({ startTime: 1 })
        .select("startTime")
        .lean();
      if (earliestAssignment) {
        testStartTime = earliestAssignment.startTime;
      }
    }

    const TestSubmission = require("../models/TestSubmission");
    const hasSubmissions = await TestSubmission.exists({ testId: req.params.id });
    const hasStartedAttempt = await Assignment.exists({
      testId: req.params.id,
      $or: [
        { status: { $in: ["In Progress", "Completed"] } },
        { startedAt: { $exists: true, $ne: null } }
      ]
    });

    if ((testStartTime && new Date(testStartTime) <= now) || hasSubmissions || hasStartedAttempt) {
      return res.status(400).json({ message: "Test has already started and cannot be edited" });
    }

    if (subject !== undefined && isAllSubject(subject)) {
      return res.status(400).json({ message: '"ALL" is not a subject. Pick the subject this test belongs to.' });
    }

    // Mentor can only update tests they created
    const userRole = String(req.user?.role || "").toLowerCase();
    if (userRole === "mentor") {
      if (String(testToEdit.createdBy) !== String(req.user.userId)) {
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

      const targetSubject = subject !== undefined ? subject : testToEdit.subject;
      if (!hasAllSubject && (!targetSubject || !mentorSubjectNames.includes(targetSubject.trim().toLowerCase()))) {
        return res.status(403).json({ message: `You are not assigned to the subject "${targetSubject}". You can only edit tests for your assigned subjects.` });
      }

      const restriction = mentorTypeRestriction(type || testToEdit.type, mentorSubjectNames, hasAllSubject);
      if (restriction) {
        return res.status(403).json({ message: restriction });
      }
    }

    if (questions) {
      const effectiveType = type || testToEdit.type;
      const kindError = mixedTestKindError(effectiveType, questions);
      if (kindError) {
        return res.status(400).json({ message: kindError });
      }
      const mcqError = mcqQuestionsError(questions);
      if (mcqError) {
        return res.status(400).json({ message: mcqError });
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
    // Takes effect for attempts that have not started yet. A student already
    // sitting the test inside SEB stays on SEB; one blocked at the SEB launch
    // screen is let through on their next reload. See routes/proctor.js.
    if (sebEnabled !== undefined) updateData.sebEnabled = Boolean(sebEnabled);
    if (startTime !== undefined) updateData.startTime = startTime ? new Date(startTime) : null;
    if (duration !== undefined) updateData.duration = Number(duration);
    if (assignmentMode !== undefined) updateData.assignmentMode = assignmentMode;
    if (cohort !== undefined) updateData.cohort = cohort;
    if (selectedStudents !== undefined) updateData.selectedStudents = Array.isArray(selectedStudents) ? selectedStudents : [];

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

    // Synchronize schedule and assignments if schedule fields are present
    const targetStartTime = updateData.startTime !== undefined ? updateData.startTime : test.startTime;
    const targetDuration = updateData.duration !== undefined ? updateData.duration : (test.duration || test.timeLimit);
    const targetMode = updateData.assignmentMode !== undefined ? updateData.assignmentMode : test.assignmentMode;
    const targetCohort = updateData.cohort !== undefined ? updateData.cohort : (targetMode !== "manual" ? (targetMode || "") : "");
    const targetSelectedStudents = updateData.selectedStudents !== undefined ? updateData.selectedStudents : (test.selectedStudents || []);

    if (targetStartTime && targetDuration) {
      const startTimeDate = new Date(targetStartTime);
      const deadline = new Date(startTimeDate);
      deadline.setMinutes(deadline.getMinutes() + Number(targetDuration));

      // 1. Update schedule on all existing assignments for this test
      await Assignment.updateMany(
        { testId: req.params.id },
        {
          $set: {
            startTime: startTimeDate,
            duration: Number(targetDuration),
            deadline: deadline,
            ...(targetCohort ? { cohort: targetCohort } : {})
          }
        }
      );

      // 2. Determine target student IDs according to assignmentMode
      let targetStudentIds = [];
      if (targetMode === "manual") {
        targetStudentIds = targetSelectedStudents.map((s) => String(s?._id || s));
      } else if (targetMode) {
        const { findStudentsByCohort } = require("../services/principals");
        const cohortStudents = await findStudentsByCohort(targetMode);
        if (cohortStudents) {
          targetStudentIds = cohortStudents.map((s) => String(s._id));
        }
      }

      if (targetStudentIds.length > 0) {
        // Find existing assignment userIds
        const existingAssignments = await Assignment.find({ testId: req.params.id }).select("userId status").lean();
        const existingUserIds = new Set(existingAssignments.map((a) => String(a.userId)));

        // Insert assignments for any newly targeted students (no duplicates!)
        const assignmentsToInsert = [];
        const effectiveMentorId = String(req.user?.role || "").toLowerCase() === "mentor" ? req.user.userId : null;
        for (const sId of targetStudentIds) {
          if (!existingUserIds.has(sId)) {
            assignmentsToInsert.push({
              testId: req.params.id,
              userId: sId,
              mentorId: effectiveMentorId,
              startTime: startTimeDate,
              duration: Number(targetDuration),
              deadline,
              cohort: targetCohort || null,
              status: "Assigned"
            });
          }
        }

        if (assignmentsToInsert.length > 0) {
          await Assignment.insertMany(assignmentsToInsert, { ordered: false });
        }

        // Clean up unstarted assignments for students no longer in target
        await Assignment.deleteMany({
          testId: req.params.id,
          status: "Assigned",
          userId: { $nin: targetStudentIds }
        });

        // Ensure test status is Active if assignments exist and test was Draft
        if (test.status === "Draft") {
          await Test.findByIdAndUpdate(req.params.id, { status: "Active" });
          test.status = "Active";
        }
      }
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
