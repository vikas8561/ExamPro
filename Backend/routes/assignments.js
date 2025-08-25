const express = require("express");
const router = express.Router();
const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const User = require("../models/User");
const { authenticateToken, requireRole } = require("../middleware/auth");

// Get all assignments (admin only)
router.get("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { status, userId, testId } = req.query;
    const query = {};
    
    if (status) query.status = status;
    if (userId) query.userId = userId;
    if (testId) query.testId = testId;

    const assignments = await Assignment.find(query)
      .populate("testId", "title type instructions timeLimit")
      .populate("userId", "name email")
      .populate("mentorId", "name email")
      .sort({ createdAt: -1 });

    res.json(assignments);
  } catch (error) {
    next(error);
  }
});

// Get assignments for current student
router.get("/student", authenticateToken, async (req, res, next) => {
  try {
    if (req.user.role !== "Student") {
      return res.status(403).json({ message: "Access denied. Student access only." });
    }

    const assignments = await Assignment.find({ userId: req.user.userId })
      .populate("testId", "title type instructions timeLimit questions")
      .populate("mentorId", "name email")
      .sort({ deadline: 1 });

    res.json(assignments);
  } catch (error) {
    next(error);
  }
});

// Get assignment by ID
router.get("/:id", authenticateToken, async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate("testId", "title type instructions timeLimit questions")
      .populate("userId", "name email")
      .populate("mentorId", "name email");

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    // Check if user has access to this assignment
    if (req.user.role !== "admin" && assignment.userId._id.toString() !== req.user.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(assignment);
  } catch (error) {
    next(error);
  }
});

// Create assignment (admin only)
router.post("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { testId, userId, deadline, mentorId } = req.body;

    if (!testId || !userId || !deadline) {
      return res.status(400).json({ message: "testId, userId, and deadline are required" });
    }

    // Check if assignment already exists
    const existingAssignment = await Assignment.findOne({ testId, userId });
    if (existingAssignment) {
      return res.status(400).json({ message: "Assignment already exists for this user and test" });
    }

    const assignment = await Assignment.create({
      testId,
      userId,
      mentorId: mentorId || null,
      deadline: new Date(deadline),
      status: "Assigned"
    });

    const populatedAssignment = await Assignment.findById(assignment._id)
      .populate("testId", "title type instructions timeLimit")
      .populate("userId", "name email")
      .populate("mentorId", "name email");

    res.status(201).json(populatedAssignment);
  } catch (error) {
    next(error);
  }
});

// Start test
router.post("/:id/start", authenticateToken, async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate("testId", "title type instructions timeLimit questions");

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    // Check if user owns this assignment
    if (assignment.userId.toString() !== req.user.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if already completed
    if (assignment.status === "Completed") {
      return res.status(400).json({ message: "Test already completed" });
    }

    // Check if already in progress - return 200 with special flag instead of 400
    if (assignment.status === "In Progress") {
      return res.status(200).json({ 
        assignment,
        test: assignment.testId,
        message: "Test already started",
        alreadyStarted: true
      });
    }

    // Check deadline
    const now = new Date();
    const deadline = new Date(assignment.deadline);
    deadline.setHours(23, 59, 59, 999);

    if (now > deadline) {
      assignment.status = "Overdue";
      await assignment.save();
      return res.status(400).json({ message: "Test deadline has passed" });
    }

    // Start the test
    assignment.status = "In Progress";
    assignment.startedAt = new Date();
    await assignment.save();

    res.json({
      assignment,
      test: assignment.testId,
      message: "Test started successfully"
    });
  } catch (error) {
    next(error);
  }
});

// Update assignment (admin only)
router.put("/:id", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { mentorId, deadline, status } = req.body;
    
    const updateData = {};
    if (mentorId !== undefined) updateData.mentorId = mentorId;
    if (deadline) updateData.deadline = new Date(deadline);
    if (status) updateData.status = status;

    const assignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    )
    .populate("testId", "title type instructions timeLimit")
    .populate("userId", "name email")
    .populate("mentorId", "name email");

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    res.json(assignment);
  } catch (error) {
    next(error);
  }
});

// Assign test to all students (admin only)
router.post("/assign-all", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { testId, deadline, mentorId } = req.body;

    if (!testId || !deadline) {
      return res.status(400).json({ message: "testId and deadline are required" });
    }

    // Get all students
    const students = await User.find({ role: "Student" });
    
    if (!students.length) {
      return res.status(404).json({ message: "No students found" });
    }

    // Create assignments for all students
    const assignments = [];
    const existingAssignments = await Assignment.find({ testId });

    for (const student of students) {
      const existingAssignment = existingAssignments.find(
        assignment => assignment.userId.toString() === student._id.toString()
      );

      if (!existingAssignment) {
        const assignment = new Assignment({
          testId,
          userId: student._id,
          mentorId: mentorId || null,
          deadline: new Date(deadline),
          status: "Assigned"
        });
        
        assignments.push(assignment.save());
      }
    }

    if (assignments.length === 0) {
      return res.status(200).json({ 
        message: "All students already have this assignment", 
        assignedCount: 0 
      });
    }

    await Promise.all(assignments);

    res.status(201).json({ 
      message: `Successfully assigned to ${assignments.length} students`, 
      assignedCount: assignments.length 
    });
  } catch (error) {
    next(error);
  }
});

// Get available mentors (admin only)
router.get("/mentors/available", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const mentors = await User.find({ role: "Mentor" })
      .select("name email")
      .sort({ name: 1 });
    
    res.json(mentors);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
