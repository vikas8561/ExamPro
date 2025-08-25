const express = require('express');
const router = express.Router();
const Assignment = require('../models/Assignment');
const { authenticateToken } = require('../middleware/auth');

// Debug endpoint to check current user role
router.get('/check-role', authenticateToken, (req, res) => {
  res.json({
    userId: req.user.userId,
    email: req.user.email,
    role: req.user.role,
    message: 'Current user details'
  });
});

// Debug endpoint to check assignment status
router.get('/assignment/:id/status', authenticateToken, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('testId', 'title')
      .populate('userId', 'name email');

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    const now = new Date();
    const deadline = new Date(assignment.deadline);
    deadline.setUTCHours(23, 59, 59, 999);

    const statusCheck = {
      assignmentId: assignment._id,
      testTitle: assignment.testId?.title || 'Unknown',
      userName: assignment.userId?.name || 'Unknown',
      userEmail: assignment.userId?.email || 'Unknown',
      currentStatus: assignment.status,
      deadline: assignment.deadline,
      startedAt: assignment.startedAt,
      completedAt: assignment.completedAt,
      currentTime: now,
      deadlineEndOfDay: deadline,
      isDeadlineValid: !isNaN(deadline.getTime()),
      isDeadlinePassed: now > deadline,
      canStartTest: assignment.status === 'Assigned' && now <= deadline && !isNaN(deadline.getTime()),
      validationErrors: []
    };

    if (assignment.status === 'In Progress') {
      statusCheck.validationErrors.push('Test already started');
    }
    if (assignment.status === 'Completed') {
      statusCheck.validationErrors.push('Test already completed');
    }
    if (isNaN(deadline.getTime())) {
      statusCheck.validationErrors.push('Invalid deadline format');
    }
    if (now > deadline) {
      statusCheck.validationErrors.push('Deadline has passed');
    }

    res.json(statusCheck);
  } catch (error) {
    console.error('Debug assignment status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to list all assignments for current user
router.get('/my-assignments', authenticateToken, async (req, res) => {
  try {
    const assignments = await Assignment.find({ userId: req.user.userId })
      .populate('testId', 'title')
      .sort({ createdAt: -1 });

    res.json({
      userId: req.user.userId,
      assignmentCount: assignments.length,
      assignments: assignments.map(a => ({
        id: a._id,
        testTitle: a.testId?.title,
        status: a.status,
        deadline: a.deadline,
        startedAt: a.startedAt,
        completedAt: a.completedAt
      }))
    });
  } catch (error) {
    console.error('Debug my-assignments error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
