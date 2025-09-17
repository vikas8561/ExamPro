const express = require("express");
const router = express.Router();
const Assignment = require("../models/Assignment");
const User = require("../models/User");
const Test = require("../models/Test");
const TestSubmission = require("../models/TestSubmission");
const { authenticateToken } = require("../middleware/auth");

// Handle OPTIONS requests for CORS preflight
router.options('*', (req, res) => {
  console.log('Mentor route OPTIONS handler triggered for:', req.url);
  res.status(200).end();
});

// Get mentor dashboard data
router.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    const mentorId = req.user.userId;
    
    // Get all assignments where this mentor is assigned
    const assignments = await Assignment.find({ mentorId })
      .populate("testId", "title type instructions timeLimit")
      .populate("userId", "name email")
      .sort({ createdAt: -1 });

    const activeAssignments = assignments.filter(a => a.status === "In Progress");
    const completedAssignments = assignments.filter(a => a.status === "Completed");
    
    // Get test submissions for monitoring
    const submissions = await TestSubmission.find()
      .populate({
        path: "assignmentId",
        populate: {
          path: "testId",
          select: "title"
        }
      })
      .populate("userId", "name email")
      .sort({ submittedAt: -1 });

    res.json({
      totalAssigned: assignments.length,
      activeTests: activeAssignments.length,
      completedTests: completedAssignments.length,
      recentSubmissions: submissions.slice(0, 10),
      assignments
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get assignments assigned to mentor
router.get("/assignments", authenticateToken, async (req, res) => {
  try {
    const mentorId = req.user.userId;
    
    const assignments = await Assignment.find({
      $or: [
        { mentorId: req.user.userId },
        { mentorId: null }
      ]
    })
      .populate({
        path: "testId",
        select: "title type instructions timeLimit questions",
        populate: {
          path: "questions",
          select: "kind text options answer guidelines examples points"
        }
      })
      .populate("userId", "name email")
      .sort({ createdAt: -1 });

    // Get submission data for each assignment to include submittedAt
    const assignmentsWithSubmissions = await Promise.all(
      assignments.map(async (assignment) => {
        const submission = await TestSubmission.findOne({ 
          assignmentId: assignment._id 
        }).select('submittedAt');
        
        // Debug logging
        console.log(`Assignment ${assignment._id}: submission found = ${!!submission}, submittedAt = ${submission?.submittedAt}`);
        
        return {
          ...assignment.toObject(),
          submittedAt: submission?.submittedAt || null
        };
      })
    );

    res.json(assignmentsWithSubmissions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get test submissions for monitoring - grouped by student
router.get("/submissions", authenticateToken, async (req, res) => {
  try {
    const submissions = await TestSubmission.find()
      .populate({
        path: "assignmentId",
        populate: {
          path: "testId",
          select: "title questions",
          populate: {
            path: "questions",
            select: "kind text options answer answers guidelines examples points"
          }
        }
      })
      .populate("userId", "name email")
      .sort({ submittedAt: -1 });

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

    res.json(groupedStudents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get submissions for a specific student
router.get("/student/:studentId/submissions", authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    const submissions = await TestSubmission.find({ userId: studentId })
      .populate({
        path: "assignmentId",
        populate: {
          path: "testId",
          select: "title questions negativeMarkingPercent",
          populate: {
            path: "questions",
            select: "kind text options answer answers guidelines examples points"
          }
        }
      })
      .sort({ submittedAt: -1 });

    // Ensure scores are calculated and responses are graded
    const { recalculateSubmissionScore } = require("../services/scoreCalculation");

    for (const submission of submissions) {
      if (submission.assignmentId?.testId && submission.responses?.length > 0) {
        await recalculateSubmissionScore(submission, submission.assignmentId.testId);
      }
    }

    res.json(submissions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get detailed test monitoring data
router.get("/monitor/:assignmentId", authenticateToken, async (req, res) => {
  try {
    const { assignmentId } = req.params;
    
    const assignment = await Assignment.findById(assignmentId)
      .populate("testId")
      .populate("userId", "name email");
    
    const submission = await TestSubmission.findOne({ assignmentId })
      .populate("userId", "name email");
    
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }

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

// Update assignment review/notes
router.put("/assignments/:id/review", authenticateToken, async (req, res) => {
  try {
    const { notes, status } = req.body;
    const assignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      { notes, status },
      { new: true }
    ).populate("testId").populate("userId", "name email");

    res.json(assignment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get submissions pending mentor review
router.get("/submissions/pending", authenticateToken, async (req, res, next) => {
  try {
    const mentorId = req.user.userId;
    console.log(`Fetching pending submissions for mentor: ${mentorId}`);

    // Find assignments assigned to this mentor
    const assignments = await Assignment.find({ mentorId });
    console.log(`Found ${assignments.length} assignments for mentor ${mentorId}`);
    
    const assignmentIds = assignments.map(a => a._id);
    console.log(`Assignment IDs: ${assignmentIds}`);

    const submissions = await TestSubmission.find({
      assignmentId: { $in: assignmentIds },
      mentorReviewed: false
    })
    .populate("testId", "title")
    .populate("userId", "name email")
    .populate({
      path: "assignmentId",
      select: "mentorId status deadline"
    })
    .sort({ submittedAt: -1 });

    console.log(`Found ${submissions.length} pending submissions for review`);
    res.json(submissions);
  } catch (error) {
    console.error("Error fetching mentor pending submissions:", error);
    next(error);
  }
});

// Mentor reviews and grades submission
router.put("/submissions/:submissionId/review", authenticateToken, async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const { mentorScore, mentorFeedback } = req.body;
    const mentorId = req.user.userId;

    if (!mentorScore || mentorScore < 0 || mentorScore > 100) {
      return res.status(400).json({ message: "Valid mentor score (0-100) is required" });
    }

    // Validate submission exists and belongs to mentor
    const submission = await TestSubmission.findById(submissionId)
      .populate("assignmentId");

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    // Verify mentor is assigned to this assignment
    const assignment = await Assignment.findById(submission.assignmentId._id);
    if (!assignment || assignment.mentorId?.toString() !== mentorId) {
      return res.status(403).json({ message: "Not authorized to review this submission" });
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
    await Assignment.findByIdAndUpdate(submission.assignmentId._id, {
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
