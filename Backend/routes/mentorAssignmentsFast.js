const express = require("express");
const router = express.Router();
const Assignment = require("../models/Assignment");
const TestSubmission = require("../models/TestSubmission");
const { authenticateToken } = require("../middleware/auth");
// ULTRA-FAST assignments endpoint - optimized for 30+ second loading issue
router.get("/assignments", authenticateToken, async (req, res) => {
  try {
    const mentorId = req.user.userId;
    // console.log('🚀 Fast assignments fetch for mentor:', mentorId);
    
    const startTime = Date.now();
    
    // MEMORY OPTIMIZED: Add pagination to prevent memory issues
    const page = parseInt(req.query.page) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Max 100 records
    const skip = page * limit;

    // STEP 1: Get assignments with MINIMAL population (no questions!)
    const assignments = await Assignment.find({
      $or: [
        { mentorId: mentorId },
        { mentorId: null }
      ]
    })
      .populate({
        path: "testId",
        select: "title type instructions timeLimit",
        match: { type: { $ne: "practice" } } // Exclude practice tests from mentor assignments
      })
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean(); // Use lean() for 2x faster queries

    // Filter out assignments where testId is null (due to the match filter above)
    const filteredAssignments = assignments.filter(assignment => assignment.testId !== null);
    
    // console.log(`📊 Found ${filteredAssignments.length} assignments in ${Date.now() - startTime}ms`);
    
    // STEP 2: Batch fetch submissions (single query)
    const assignmentIds = filteredAssignments.map(a => a._id);
    const submissions = await TestSubmission.find({
      assignmentId: { $in: assignmentIds }
    })
      .select('assignmentId submittedAt score autoScore')
      .lean();
    
    // console.log(`📊 Found ${submissions.length} submissions in ${Date.now() - startTime}ms`);
    
    // STEP 3: Create lookup map
    const submissionMap = new Map();
    submissions.forEach(sub => {
      submissionMap.set(sub.assignmentId.toString(), {
        submittedAt: sub.submittedAt,
        score: sub.score || sub.autoScore || null
      });
    });
    
    // STEP 4: Merge data (no async operations)
    const assignmentsWithSubmissions = filteredAssignments.map(assignment => {
      const submission = submissionMap.get(assignment._id.toString());
      return {
        ...assignment,
        submittedAt: submission?.submittedAt || null,
        score: submission?.score || null,
        autoScore: submission?.score || null
      };
    });
    
    const totalTime = Date.now() - startTime;
    // console.log(`✅ Fast assignments completed in ${totalTime}ms`);
    
    res.json(assignmentsWithSubmissions);
    
  } catch (err) {
    console.error('❌ Error in fast assignments:', err);
    res.status(500).json({ 
      error: 'Failed to fetch assignments',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});

// Get test details on demand (when user clicks to view test)
router.get("/assignments/:assignmentId/test-details", authenticateToken, async (req, res) => {
  try {
    const { assignmentId } = req.params;
    
    const assignment = await Assignment.findById(assignmentId)
      .populate({
        path: "testId",
        select: "title type instructions timeLimit questions",
        populate: {
          path: "questions",
          select: "kind text options answer guidelines examples points"
        }
      })
      .lean();
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    res.json(assignment.testId);
    
  } catch (err) {
    console.error('Error fetching test details:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
