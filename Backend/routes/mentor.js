const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const TestSubmission = require("../models/TestSubmission");
const Mentor = require("../models/Mentor");
const Subject = require("../models/Subject");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { attach, cohortCounts, getStudentIdsForBatches } = require("../services/principals");
const { expandMentorSubjects } = require("../services/subjects");

// Get mentor's assigned subjects (for filtering what they can create)
router.get("/me/subjects", authenticateToken, requireRole(["Mentor", "Admin"]), async (req, res) => {
  try {
    const mentor = await Mentor.findById(req.user.userId)
      .populate("subjects", "name description")
      .lean();

    if (!mentor) {
      return res.status(404).json({ message: "Mentor profile not found" });
    }

    res.json({ subjects: await expandMentorSubjects(mentor.subjects) });
  } catch (err) {
    console.error("Error fetching mentor subjects:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get mentor's assigned batches (for filtering students and assignments)
router.get("/me/batches", authenticateToken, requireRole(["Mentor", "Admin"]), async (req, res) => {
  try {
    const mentor = await Mentor.findById(req.user.userId).select("batches").lean();
    if (!mentor) {
      return res.status(404).json({ message: "Mentor profile not found" });
    }

    const allCohorts = await cohortCounts();
    const mentorBatches = mentor.batches || [];
    const detailedBatches = allCohorts.filter((c) => mentorBatches.includes(c.key));

    res.json({
      batches: mentorBatches,
      details: detailedBatches
    });
  } catch (err) {
    console.error("Error fetching mentor batches:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Resolves the query criteria for a mentor:
 * Access rule for Mentor = Assigned Subjects + Assigned Batches + Their Own Tests
 *
 * For admins, returns isAdmin: true (unrestricted).
 */
async function getMentorScope(user) {
  const role = String(user?.role || "").toLowerCase();
  if (role !== "mentor") {
    return {
      isAdmin: true,
      assignmentFilter: {},
      submissionFilter: {},
      validAssignmentIds: null,
      validTestIds: null,
      allowedStudentIds: null,
    };
  }

  const mentorId = user.userId;
  const mentor = await Mentor.findById(mentorId).populate("subjects", "name").lean();

  // If mentor has no subjects OR no batches, they have zero access
  if (
    !mentor ||
    !mentor.subjects ||
    mentor.subjects.length === 0 ||
    !mentor.batches ||
    mentor.batches.length === 0
  ) {
    return {
      isAdmin: false,
      assignmentFilter: { _id: { $in: [] } },
      submissionFilter: { _id: { $in: [] } },
      validAssignmentIds: [],
      validTestIds: [],
      subjectNames: [],
      batches: mentor?.batches || [],
      allowedStudentIds: [],
    };
  }

  const subjectNames = mentor.subjects
    .map((s) => (typeof s === "string" ? s : s?.name || "").trim())
    .filter(Boolean);

  if (subjectNames.length === 0) {
    return {
      isAdmin: false,
      assignmentFilter: { _id: { $in: [] } },
      submissionFilter: { _id: { $in: [] } },
      validAssignmentIds: [],
      validTestIds: [],
      subjectNames: [],
      batches: mentor.batches || [],
      allowedStudentIds: [],
    };
  }

  // 1. Resolve student IDs in mentor's assigned batches
  const allowedStudentIds = await getStudentIdsForBatches(mentor.batches);
  if (!allowedStudentIds || allowedStudentIds.length === 0) {
    return {
      isAdmin: false,
      assignmentFilter: { _id: { $in: [] } },
      submissionFilter: { _id: { $in: [] } },
      validAssignmentIds: [],
      validTestIds: [],
      subjectNames,
      batches: mentor.batches,
      allowedStudentIds: [],
    };
  }

  const hasAllSubject = subjectNames.some((s) => s.toUpperCase() === "ALL");
  const subjectRegexes = subjectNames.map(
    (name) => new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i")
  );

  // 2. Find tests belonging to mentor's subjects
  const subjectCondition = hasAllSubject ? {} : { subject: { $in: subjectRegexes } };
  const testsInSubjects = await Test.find(subjectCondition).select("_id createdBy subject").lean();

  const mentorObjectId = mongoose.Types.ObjectId.isValid(mentorId)
    ? new mongoose.Types.ObjectId(mentorId)
    : null;

  const mentorIdVariants = mentorObjectId ? [mentorObjectId, String(mentorId)] : [mentorId];

  // Tests created by this mentor
  const mentorCreatedTestIds = testsInSubjects
    .filter((t) => String(t.createdBy) === String(mentorId))
    .map((t) => t._id);

  // Tests in mentor's subjects created by others (e.g. admin) but conducted by mentor
  const otherTestIds = testsInSubjects
    .filter((t) => String(t.createdBy) !== String(mentorId))
    .map((t) => t._id);

  const orConditions = [];
  if (mentorCreatedTestIds.length > 0) {
    orConditions.push({ testId: { $in: mentorCreatedTestIds } });
  }
  if (otherTestIds.length > 0) {
    orConditions.push({
      testId: { $in: otherTestIds },
      mentorId: { $in: mentorIdVariants },
    });
  }

  if (orConditions.length === 0) {
    return {
      isAdmin: false,
      assignmentFilter: { _id: { $in: [] } },
      submissionFilter: { _id: { $in: [] } },
      validAssignmentIds: [],
      validTestIds: [],
      subjectNames,
      batches: mentor.batches,
      allowedStudentIds,
    };
  }

  // Assignment Filter = (Tests conducted by mentor in assigned subjects) AND (Student belongs to mentor's assigned batches)
  const assignmentFilter = {
    $and: [
      { $or: orConditions },
      { userId: { $in: allowedStudentIds } }
    ]
  };

  // Pre-fetch matching assignment IDs
  const matchingAssignments = await Assignment.find(assignmentFilter).select("_id testId userId").lean();

  const validAssignmentIds = matchingAssignments.map((a) => a._id);
  const validTestIds = Array.from(new Set(matchingAssignments.map((a) => String(a.testId))))
    .map((id) => new mongoose.Types.ObjectId(id));

  // Submission Filter = (Assignment is valid for this mentor) AND (Student is in assigned batches)
  const submissionFilter = {
    assignmentId: { $in: validAssignmentIds },
    userId: { $in: allowedStudentIds }
  };

  return {
    isAdmin: false,
    assignmentFilter,
    submissionFilter,
    validAssignmentIds,
    validTestIds,
    subjectNames,
    batches: mentor.batches,
    allowedStudentIds,
  };
}

// Get mentor dashboard data (mentor/admin only)
router.get("/dashboard", authenticateToken, requireRole(["Mentor", "Admin"]), async (req, res) => {
  try {
    const scope = await getMentorScope(req.user);
    const assignQuery = scope.isAdmin ? {} : scope.assignmentFilter;
    const subQuery = scope.isAdmin ? {} : scope.submissionFilter;

    // Get assignments filtered to tests the mentor conducts in their subjects
    const assignments = await attach(
      await Assignment.find(assignQuery)
        .populate("testId", "title type subject instructions timeLimit")
        .sort({ createdAt: -1 })
        .lean(),
      "userId",
      "Student"
    );

    const activeAssignments = assignments.filter(a => a.status === "In Progress");
    const completedAssignments = assignments.filter(a => a.status === "Completed");

    // Get test submissions for monitoring (filtered to mentor's conducted tests)
    const submissions = await attach(
      await TestSubmission.find({
        ...subQuery,
        isFinalized: { $ne: false }
      })
        .populate({
          path: "assignmentId",
          populate: {
            path: "testId",
            select: "title subject"
          }
        })
        .sort({ submittedAt: -1 })
        .limit(10)
        .lean(),
      "userId",
      "Student"
    );

    res.json({
      totalAssigned: assignments.length,
      activeTests: activeAssignments.length,
      completedTests: completedAssignments.length,
      recentSubmissions: submissions,
      assignments
    });
  } catch (err) {
    console.error('Error in mentor dashboard:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get assignments assigned to mentor - ULTRA FAST VERSION (mentor/admin only)
router.get("/assignments", authenticateToken, requireRole(["Mentor", "Admin"]), async (req, res) => {
  try {
    const scope = await getMentorScope(req.user);
    const assignQuery = scope.isAdmin ? {} : scope.assignmentFilter;

    const startTime = Date.now();

    // MEMORY OPTIMIZED: Add pagination to prevent memory issues
    const page = parseInt(req.query.page) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 200, 2000); // Allow up to 2000 records
    const skip = page * limit;

    // Filter assignments to only those the mentor conducts for their subjects
    const rawAssignments = await Assignment.find(assignQuery)
      .populate("testId", "title type subject instructions timeLimit")
      .select("testId userId mentorId status startTime duration deadline startedAt completedAt score autoScore mentorScore mentorFeedback reviewStatus timeSpent createdAt")
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const assignments = await attach(rawAssignments, "userId", "Student");

    console.log(`📊 Found ${assignments.length} assignments in ${Date.now() - startTime}ms`);
    console.log('Sample assignments:', assignments.slice(0, 3).map(a => ({ 
      id: a._id, 
      testTitle: a.testId?.title,
      studentName: a.userId?.name,
      status: a.status, 
      mentorId: a.mentorId
    })));
    // Sample assignment data logging disabled
    // const sampleAssignments = assignments.slice(0, 2).map(a => ({ 
    //   id: a._id, 
    //   status: a.status, 
    //   autoScore: a.autoScore, 
    //   score: a.score, 
    //   mentorScore: a.mentorScore 
    // }));

    // ULTRA FAST: Batch fetch submissions (single query)
    const assignmentIds = assignments.map(a => a._id);
    const submissions = await TestSubmission.find({
      assignmentId: { $in: assignmentIds }
    })
      .select('assignmentId submittedAt totalScore maxScore')
      .lean();
    
    console.log(`📊 Found ${submissions.length} submissions in ${Date.now() - startTime}ms`);
    // console.log('Sample submission data:', submissions.slice(0, 2));
    // All submission data logging disabled
    // const allSubmissionData = submissions.map(sub => ({ 
    //   assignmentId: sub.assignmentId, 
    //   totalScore: sub.totalScore, 
    //   maxScore: sub.maxScore,
    //   submittedAt: sub.submittedAt 
    // }));
    
    // ULTRA FAST: Create lookup map
    const submissionMap = new Map();
    submissions.forEach(sub => {
      // Store both totalScore and maxScore for "X out of Y" format
      submissionMap.set(sub.assignmentId.toString(), {
        submittedAt: sub.submittedAt,
        score: sub.totalScore,
        totalScore: sub.totalScore,
        maxScore: sub.maxScore
      });
    });
    
    // ULTRA FAST: Merge data (no async operations)
    const assignmentsWithSubmissions = assignments.map(assignment => {
      const submission = submissionMap.get(assignment._id.toString());
      
      // Priority: Assignment.autoScore > TestSubmission.score > Assignment.score > null
      let finalScore = null;
      let finalMaxScore = null;
      
      if (assignment.autoScore !== null && assignment.autoScore !== undefined) {
        finalScore = assignment.autoScore;
        // For Assignment.autoScore, we need to get maxScore from TestSubmission
        finalMaxScore = submission?.maxScore || null;
      } else if (submission?.score !== null && submission?.score !== undefined) {
        finalScore = submission.score;
        finalMaxScore = submission.maxScore;
      } else if (assignment.score !== null && assignment.score !== undefined) {
        finalScore = assignment.score;
        finalMaxScore = submission?.maxScore || null;
      }
      
      return {
        ...assignment,
        submittedAt: submission?.submittedAt || assignment.completedAt || null,
        score: finalScore,
        maxScore: finalMaxScore,
        autoScore: finalScore
      };
    });
    
    const totalTime = Date.now() - startTime;
    // console.log(`✅ ULTRA FAST assignments completed in ${totalTime}ms`);
    // console.log('Sample final assignment with score:', assignmentsWithSubmissions.find(a => a.score !== null && a.score !== undefined));
    // console.log('Score range:', assignmentsWithSubmissions.filter(a => a.score !== null && a.score !== undefined).map(a => `${a.score} out of ${a.maxScore}`));

    res.json(assignmentsWithSubmissions);
    
  } catch (err) {
    console.error('Critical error in mentor assignments:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ 
      error: 'Failed to fetch assignments',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// Get test submissions for monitoring - grouped by student (mentor/admin only)
router.get("/submissions", authenticateToken, requireRole(["Mentor", "Admin"]), async (req, res) => {
  try {
    const scope = await getMentorScope(req.user);
    const subQuery = scope.isAdmin ? {} : scope.submissionFilter;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Use optimized query with pagination filtered for mentor
    const submissions = await attach(
      await TestSubmission.find({
        ...subQuery,
        isFinalized: { $ne: false }
      })
        .populate("testId", "title subject type")
        .populate({
          path: "assignmentId",
          populate: {
            path: "testId",
            select: "title subject type"
          }
        })
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      "userId",
      "Student"
    );

    // Group submissions by student
    const studentsMap = new Map();
    
    submissions.forEach(submission => {
      const studentId = submission.userId?._id?.toString();
      if (!studentId) return;
      
      if (!studentsMap.has(studentId)) {
        studentsMap.set(studentId, {
          student: {
            _id: submission.userId._id,
            name: submission.userId.name,
            email: submission.userId.email
          },
          submissions: [],
          totalSubmissions: 0,
          averageScore: 0,
          totalScore: 0
        });
      }
      
      const studentData = studentsMap.get(studentId);
      studentData.submissions.push(submission);
      studentData.totalSubmissions++;
      studentData.totalScore += submission.totalScore || 0;
    });
    
    // Calculate average scores and convert to array
    const groupedStudents = Array.from(studentsMap.values()).map(studentData => ({
      ...studentData,
      averageScore: studentData.totalSubmissions > 0 
        ? Math.round(studentData.totalScore / studentData.totalSubmissions) 
        : 0
    }));

    // Get total count for pagination info
    const totalCount = await TestSubmission.countDocuments({
      ...subQuery,
      isFinalized: { $ne: false }
    });
    
    res.json({
      students: groupedStudents,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit) || 1,
        totalCount,
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1
      }
    });
  } catch (err) {
    console.error('Error in mentor submissions:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get submissions for a specific student - ULTRA FAST VERSION (mentor/admin only)
router.get("/student/:studentId/submissions", authenticateToken, requireRole(["Mentor", "Admin"]), async (req, res) => {
  try {
    const { studentId } = req.params;
    const scope = await getMentorScope(req.user);
    const subQuery = scope.isAdmin
      ? { userId: studentId }
      : { userId: studentId, ...scope.submissionFilter };

    const startTime = Date.now();

    // MEMORY OPTIMIZED: Add pagination to prevent memory issues
    const page = parseInt(req.query.page) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Max 100 records
    const skip = page * limit;

    // Filter submissions for this student to tests the mentor conducts in their subjects
    const submissions = await TestSubmission.find(subQuery)
      .select("assignmentId testId userId responses totalScore maxScore submittedAt timeSpent mentorReviewed mentorScore mentorFeedback reviewStatus reviewedAt")
      .populate({
        path: "assignmentId",
        select: "testId userId status startTime duration deadline"
      })
      .populate({
        path: "testId",
        select: "title type subject instructions timeLimit negativeMarkingPercent" // NO questions!
      })
      .sort({ submittedAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean(); // Use lean() for 2x faster queries

    // MEMORY OPTIMIZED: Batch process score recalculation
    const { recalculateSubmissionScore } = require("../services/scoreCalculation");
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Get unique test IDs to avoid duplicate queries
    const uniqueTestIds = [...new Set(submissions
      .filter(sub => sub.assignmentId?.testId && sub.responses?.length > 0)
      .map(sub => (sub.testId?._id || sub.testId)?.toString())
      .filter(Boolean)
    )];

    // Batch load all required tests (single query instead of N+1)
    const testsMap = new Map();
    if (uniqueTestIds.length > 0) {
      const tests = await Test.find({ _id: { $in: uniqueTestIds } })
        .populate("questions", "kind text options answer answers guidelines examples points")
        .lean();
      
      tests.forEach(test => {
        testsMap.set(test._id.toString(), test);
      });
    }

    // Process submissions with pre-loaded tests
    for (const submission of submissions) {
      const testIdStr = (submission.testId?._id || submission.testId || submission.assignmentId?.testId?._id || submission.assignmentId?.testId)?.toString();
      const testWithQuestions = testsMap.get(testIdStr);
      if (testWithQuestions) {
        if (submission.assignmentId && typeof submission.assignmentId === "object") {
          submission.assignmentId.testId = testWithQuestions;
        }
        if (submission.responses?.length > 0) {
          const needsRecalculation = 
            !submission.totalScore || 
            submission.totalScore === 0 ||
            submission.updatedAt > fiveMinutesAgo;
          
          if (needsRecalculation) {
            await recalculateSubmissionScore(submission, testWithQuestions);
          }
        }
      }
    }

    const totalTime = Date.now() - startTime;

    res.json(submissions);
  } catch (err) {
    console.error('Error in student submissions:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get detailed test monitoring data (mentor/admin only)
router.get("/monitor/:assignmentId", authenticateToken, requireRole(["Mentor", "Admin"]), async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const scope = await getMentorScope(req.user);

    if (!scope.isAdmin) {
      const allowed = scope.validAssignmentIds.some(id => String(id) === String(assignmentId));
      if (!allowed) {
        return res.status(403).json({ error: "You are not authorized to monitor this assignment." });
      }
    }
    
    const raw = await Assignment.findById(assignmentId).populate("testId").lean();
    if (!raw) {
      return res.status(404).json({ error: "Assignment not found" });
    }
    // The owner's id, read before attach() replaces it with their record.
    const ownerId = raw.userId;
    const assignment = await attach(raw, "userId", "Student");

    // The OWNER's submission. Looked up by assignment alone, this could return a
    // row someone else wrote against the attempt (possible before the ownership
    // checks on submit and autosave existed) and show it as the student's work.
    const submission = await attach(
      await TestSubmission.findOne({ assignmentId, userId: ownerId }).lean(),
      "userId",
      "Student"
    );

    res.json({
      assignment,
      submission,
      monitoringData: {
        startTime: assignment.startedAt,
        endTime: submission?.submittedAt || null,
        duration: submission ? 
          Math.floor((submission.submittedAt - assignment.startedAt) / 1000 / 60) : null,
        score: submission?.totalScore || null,
        maxScore: submission?.maxScore || null
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update assignment review/notes (mentor/admin only)
router.put("/assignments/:id/review", authenticateToken, requireRole(["Mentor", "Admin"]), async (req, res) => {
  try {
    const { notes, status } = req.body;
    const scope = await getMentorScope(req.user);

    if (!scope.isAdmin) {
      const allowed = scope.validAssignmentIds.some(id => String(id) === String(req.params.id));
      if (!allowed) {
        return res.status(403).json({ message: "Not authorized to review this assignment" });
      }
    }

    const assignment = await attach(
      await Assignment.findByIdAndUpdate(
        req.params.id,
        { notes, status },
        { new: true }
      ).populate("testId").lean(),
      "userId",
      "Student"
    );

    res.json(assignment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get submissions pending mentor review (mentor/admin only)
router.get("/submissions/pending", authenticateToken, requireRole(["Mentor", "Admin"]), async (req, res, next) => {
  try {
    const scope = await getMentorScope(req.user);
    const assignQuery = scope.isAdmin ? {} : scope.assignmentFilter;

    // Find assignments this mentor conducts for their subjects
    const assignments = await Assignment.find(assignQuery).select("_id");
    const assignmentIds = assignments.map(a => a._id);

    const submissions = await TestSubmission.find({
      assignmentId: { $in: assignmentIds },
      mentorReviewed: false,
      // Skip records the judge created while the student is still working.
      isFinalized: { $ne: false }
    })
    .populate("testId", "title subject")
    .populate({
      path: "assignmentId",
      select: "mentorId status deadline"
    })
    .sort({ submittedAt: -1 })
    .lean();

    res.json(await attach(submissions, "userId", "Student"));
  } catch (error) {
    console.error("Error fetching mentor pending submissions:", error);
    next(error);
  }
});

// Mentor reviews and grades submission (mentor/admin only)
router.put("/submissions/:submissionId/review", authenticateToken, requireRole(["Mentor", "Admin"]), async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const { mentorScore, mentorFeedback } = req.body;

    if (!mentorScore || mentorScore < 0 || mentorScore > 100) {
      return res.status(400).json({ message: "Valid mentor score (0-100) is required" });
    }

    // Validate submission exists and belongs to mentor
    const submission = await TestSubmission.findById(submissionId)
      .populate("assignmentId");

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    const scope = await getMentorScope(req.user);
    if (!scope.isAdmin) {
      const assignmentIdStr = String(submission.assignmentId?._id || submission.assignmentId);
      const allowed = scope.validAssignmentIds.some(id => String(id) === assignmentIdStr);
      if (!allowed) {
        return res.status(403).json({ message: "Not authorized to review this submission" });
      }
    }

    // Update submission with mentor review
    const updatedSubmission = await TestSubmission.findByIdAndUpdate(
      submissionId,
      {
        mentorScore,
        mentorFeedback,
        mentorReviewed: true,
        reviewedAt: new Date(),
        reviewStatus: "Reviewed"
      },
      { new: true }
    );

    // Update assignment with final score
    const targetAssignmentId = submission.assignmentId?._id || submission.assignmentId;
    await Assignment.findByIdAndUpdate(targetAssignmentId, {
      mentorScore,
      mentorFeedback,
      reviewStatus: "Reviewed"
    });

    res.json({
      message: "Test reviewed successfully",
      submission: updatedSubmission
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.getMentorScope = getMentorScope;
