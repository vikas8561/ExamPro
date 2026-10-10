const express = require("express");
const router = express.Router();
const Assignment = require("../models/Assignment");
const TestSubmission = require("../models/TestSubmission");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { attach } = require("../services/principals");
const { getMentorScope } = require("./mentor");

// ULTRA-FAST assignments endpoint - optimized for 30+ second loading issue (mentor/admin only)
router.get("/assignments", authenticateToken, requireRole(["Mentor", "Admin"]), async (req, res) => {
  try {
    const scope = await getMentorScope(req.user);
    const assignQuery = scope.isAdmin ? {} : scope.assignmentFilter;
    
    const startTime = Date.now();
    
    // MEMORY OPTIMIZED: Add pagination to prevent memory issues
    const page = parseInt(req.query.page) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const skip = page * limit;

    // STEP 1: Get assignments with MINIMAL population (no questions!)
    // Scoped to tests conducted by mentor for their subjects
    const assignments = await Assignment.find(assignQuery)
      .populate({
        path: "testId",
        select: "title type instructions timeLimit subject",
        match: { type: { $ne: "practice" } } // Exclude practice tests from mentor assignments
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean(); // Use lean() for 2x faster queries

    // Each attempt's owner, read before attach() replaces the id with a record.
    const ownerByAssignment = new Map(assignments.map((a) => [String(a._id), String(a.userId)]));

    // Filter out assignments where testId is null (due to the match filter above)
    // then resolve each student from the university's database.
    const filteredAssignments = await attach(
      assignments.filter(assignment => assignment.testId !== null),
      "userId",
      "Student"
    );
    
    // console.log(`📊 Found ${filteredAssignments.length} assignments in ${Date.now() - startTime}ms`);
    
    // STEP 2: Batch fetch submissions (single query)
    const assignmentIds = filteredAssignments.map(a => a._id);
    const submissions = await TestSubmission.find({
      assignmentId: { $in: assignmentIds }
    })
      .select('assignmentId userId submittedAt score autoScore')
      .lean();
    
    // console.log(`📊 Found ${submissions.length} submissions in ${Date.now() - startTime}ms`);
    
    // STEP 3: Create lookup map
    const submissionMap = new Map();
    submissions.forEach(sub => {
      // Only the owner's row counts. A row someone else wrote against this
      // attempt (possible before submit and autosave checked ownership) must
      // not stand in for the student's submission.
      if (String(sub.userId) !== ownerByAssignment.get(String(sub.assignmentId))) return;
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

// Get test details on demand (when user clicks to view test) (mentor/admin only)
router.get("/assignments/:assignmentId/test-details", authenticateToken, requireRole(["Mentor", "Admin"]), async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const scope = await getMentorScope(req.user);

    if (!scope.isAdmin) {
      const allowed = scope.validAssignmentIds.some((id) => String(id) === String(assignmentId));
      if (!allowed) {
        return res.status(403).json({ error: "Not authorized to view test details for this assignment" });
      }
    }
    
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
