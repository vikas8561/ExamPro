const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Assignment = require("../models/Assignment");
const User = require("../models/User");
const Test = require("../models/Test");
const TestSubmission = require("../models/TestSubmission");
const { authenticateToken } = require("../middleware/auth");

// Test endpoint to verify mentor routes are working
router.get("/test", (req, res) => {
  res.json({ 
    message: "Mentor routes are working!",
    timestamp: new Date().toISOString()
  });
});

// Get mentor dashboard data
router.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    const mentorId = req.user.userId;
    console.log('Fetching dashboard for mentor:', mentorId);
    
    // Get all assignments where this mentor is assigned
    const assignments = await Assignment.find({ mentorId })
      .populate("testId", "title type instructions timeLimit")
      .populate("userId", "name email")
      .sort({ createdAt: -1 });

    const activeAssignments = assignments.filter(a => a.status === "In Progress");
    const completedAssignments = assignments.filter(a => a.status === "Completed");
    
    // Get test submissions for monitoring (with limit to avoid performance issues)
    const submissions = await TestSubmission.find()
      .populate({
        path: "assignmentId",
        populate: {
          path: "testId",
          select: "title"
        }
      })
      .populate("userId", "name email")
      .sort({ submittedAt: -1 })
      .limit(10); // Limit to 10 most recent submissions

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

// Get assignments assigned to mentor - ULTRA FAST VERSION
router.get("/assignments", authenticateToken, async (req, res) => {
  try {
    const mentorId = req.user.userId;
    console.log('🚀 ULTRA FAST: Fetching assignments for mentor:', mentorId);
    
    const startTime = Date.now();
    
    // ULTRA FAST: Get assignments with MINIMAL population (NO questions!)
    const assignments = await Assignment.find({
      $or: [
        { mentorId: req.user.userId },
        { mentorId: null }
      ]
    })
      .populate("testId", "title type instructions timeLimit") // NO questions!
      .populate("userId", "name email")
      .select("testId userId mentorId status startTime duration deadline startedAt completedAt score autoScore mentorScore mentorFeedback reviewStatus timeSpent createdAt")
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for 2x faster queries

    console.log(`📊 Found ${assignments.length} assignments in ${Date.now() - startTime}ms`);
    console.log('Sample assignment data:', assignments.slice(0, 2).map(a => ({ 
      id: a._id, 
      status: a.status, 
      autoScore: a.autoScore, 
      score: a.score, 
      mentorScore: a.mentorScore 
    })));

    // ULTRA FAST: Batch fetch submissions (single query)
    const assignmentIds = assignments.map(a => a._id);
    const submissions = await TestSubmission.find({
      assignmentId: { $in: assignmentIds }
    })
      .select('assignmentId submittedAt totalScore maxScore')
      .lean();
    
    console.log(`📊 Found ${submissions.length} submissions in ${Date.now() - startTime}ms`);
    console.log('Sample submission data:', submissions.slice(0, 2));
    console.log('All submission data:', submissions.map(sub => ({ 
      assignmentId: sub.assignmentId, 
      totalScore: sub.totalScore, 
      maxScore: sub.maxScore,
      submittedAt: sub.submittedAt 
    })));
    
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
    console.log(`✅ ULTRA FAST assignments completed in ${totalTime}ms`);
    console.log('Sample final assignment with score:', assignmentsWithSubmissions.find(a => a.score !== null && a.score !== undefined));
    console.log('Score range:', assignmentsWithSubmissions.filter(a => a.score !== null && a.score !== undefined).map(a => `${a.score} out of ${a.maxScore}`));

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

// Get test submissions for monitoring - grouped by student
router.get("/submissions", authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Use optimized query with pagination
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
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

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
    const totalCount = await TestSubmission.countDocuments();
    
    res.json({
      students: groupedStudents,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
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

// Get submissions for a specific student - ULTRA FAST VERSION
router.get("/student/:studentId/submissions", authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const startTime = Date.now();
    console.log('🚀 ULTRA FAST: Fetching submissions for student:', studentId);

    // ULTRA FAST: Get submissions with MINIMAL data (NO questions upfront!)
    const submissions = await TestSubmission.find({ userId: studentId })
      .select("assignmentId testId userId responses totalScore maxScore submittedAt timeSpent mentorReviewed mentorScore mentorFeedback reviewStatus reviewedAt")
      .populate({
        path: "assignmentId",
        select: "testId userId status startTime duration deadline"
      })
      .populate({
        path: "testId",
        select: "title type instructions timeLimit negativeMarkingPercent" // NO questions!
      })
      .sort({ submittedAt: -1 })
      .lean(); // Use lean() for 2x faster queries

    // ULTRA FAST: Only recalculate scores if absolutely necessary
    const { recalculateSubmissionScore } = require("../services/scoreCalculation");
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    for (const submission of submissions) {
      if (submission.assignmentId?.testId && submission.responses?.length > 0) {
        const needsRecalculation = 
          !submission.totalScore || 
          submission.totalScore === 0 ||
          submission.updatedAt > fiveMinutesAgo;
        
        if (needsRecalculation) {
          // Only populate questions for recalculation if needed
          const testWithQuestions = await Test.findById(submission.testId._id)
            .populate("questions", "kind text options answer answers guidelines examples points");
          await recalculateSubmissionScore(submission, testWithQuestions);
        }
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ ULTRA FAST student submissions completed in ${totalTime}ms - Found ${submissions.length} submissions`);

    res.json(submissions);
  } catch (err) {
    console.error('Error in student submissions:', err);
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
