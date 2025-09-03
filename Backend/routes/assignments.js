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
      .populate("testId", "title type instructions timeLimit questions subject")
      .populate("mentorId", "name email")
      .sort({ deadline: 1 });

    res.json(assignments);
  } catch (error) {
    next(error);
  }
});

// Get recent activity for current student
router.get("/student/recent-activity", authenticateToken, async (req, res, next) => {
  try {
    if (req.user.role !== "Student") {
      return res.status(403).json({ message: "Access denied. Student access only." });
    }

    const userId = req.user.userId;
    console.log("Fetching recent activity for user:", userId);
    const activities = [];

    // Get recently completed tests
    const completedTests = await Assignment.find({
      userId,
      status: "Completed"
    })
    .populate("testId", "title")
    .sort({ completedAt: -1 })
    .limit(3);

    console.log("Completed tests found:", completedTests.length);
    completedTests.forEach(test => {
      console.log("Completed test:", test.testId?.title, "completedAt:", test.completedAt);
      activities.push({
        type: "completed",
        testId: test.testId,
        testTitle: test.testId.title,
        timestamp: test.completedAt || test.updatedAt,
        message: `Completed test: ${test.testId.title}`
      });
    });

    // Get recently started tests
    const startedTests = await Assignment.find({
      userId,
      status: "In Progress",
      startedAt: { $exists: true }
    })
    .populate("testId", "title")
    .sort({ startedAt: -1 })
    .limit(2);

    console.log("Started tests found:", startedTests.length);
    startedTests.forEach(test => {
      console.log("Started test:", test.testId?.title, "startedAt:", test.startedAt);
      activities.push({
        type: "started",
        testId: test.testId,
        testTitle: test.testId.title,
        timestamp: test.startedAt,
        message: `Started test: ${test.testId.title}`
      });
    });

    // Get recently assigned tests
    const assignedTests = await Assignment.find({
      userId,
      status: "Assigned"
    })
    .populate("testId", "title")
    .sort({ createdAt: -1 })
    .limit(2);

    console.log("Assigned tests found:", assignedTests.length);
    assignedTests.forEach(test => {
      console.log("Assigned test:", test.testId?.title, "createdAt:", test.createdAt);
      activities.push({
        type: "assigned",
        testId: test.testId,
        testTitle: test.testId.title,
        timestamp: test.createdAt,
        message: `Assigned test: ${test.testId.title}`
      });
    });

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Return only the most recent 7 activities
    const recentActivities = activities.slice(0, 7);
    console.log("Final activities to return:", recentActivities.length, recentActivities);

    res.json(recentActivities);
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

router.get("/check-expiration/:id", authenticateToken, async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const now = new Date();
    const endTime = new Date(assignment.startTime);
    endTime.setMinutes(endTime.getMinutes() + assignment.duration);

    if (now > endTime) {
      return res.status(400).json({ message: "Test time has expired." });
    }

    res.status(200).json({ message: "Test is still active." });
  } catch (error) {
    next(error);
  }
});

// Create assignment (admin only)
router.post("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { testId, userId, startTime, duration, mentorId } = req.body;

    if (!testId || !userId || !startTime || !duration) {
      return res.status(400).json({ message: "testId, userId, startTime, and duration are required" });
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
      startTime: new Date(startTime),
      duration: Number(duration),
      status: "Assigned"
    });

    const populatedAssignment = await Assignment.findById(assignment._id)
      .populate("testId", "title type instructions timeLimit subject")
      .populate("userId", "name email")
      .populate("mentorId", "name email");

    res.status(201).json(populatedAssignment);
  } catch (error) {
    next(error);
  }
});

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

    // Check if test is within the allowed time window
    const now = new Date();
    const startTime = new Date(assignment.startTime);
    const endTime = new Date(startTime.getTime() + assignment.duration * 60000); // Convert minutes to milliseconds

    if (now < startTime) {
      return res.status(400).json({ message: "Test is not available yet. It will start at " + startTime.toLocaleString() });
    }

    if (now > endTime) {
      assignment.status = "Overdue";
      await assignment.save();
      return res.status(400).json({ message: "Test deadline has passed. The test was available until " + endTime.toLocaleString() });
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
    const { testId, startTime, duration, mentorId } = req.body;

    if (!testId || !startTime || !duration) {
      return res.status(400).json({ message: "testId, startTime, and duration are required" });
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
          startTime: new Date(startTime),
          duration: Number(duration),
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

// Assign test to specific students manually (admin only)
router.post("/assign-manual", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { testId, studentIds, startTime, duration, mentorId } = req.body;

    if (!testId || !studentIds || !startTime || !duration) {
      return res.status(400).json({ 
        message: "testId, studentIds, startTime, and duration are required" 
      });
    }

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ 
        message: "studentIds must be a non-empty array" 
      });
    }

    // Validate that all student IDs are valid and correspond to actual students
    const students = await User.find({ 
      _id: { $in: studentIds }, 
      role: "Student" 
    });

    if (students.length !== studentIds.length) {
      const validStudentIds = students.map(student => student._id.toString());
      const invalidStudentIds = studentIds.filter(id => !validStudentIds.includes(id));
      
      return res.status(400).json({ 
        message: "Some student IDs are invalid or not students",
        invalidStudentIds 
      });
    }

    // Create assignments for selected students
    const assignments = [];
    const existingAssignments = await Assignment.find({ 
      testId, 
      userId: { $in: studentIds } 
    });

    for (const studentId of studentIds) {
      const existingAssignment = existingAssignments.find(
        assignment => assignment.userId.toString() === studentId
      );

      if (!existingAssignment) {
        const assignment = new Assignment({
          testId,
          userId: studentId,
          mentorId: mentorId || null,
          startTime: new Date(startTime),
          duration: Number(duration),
          status: "Assigned"
        });
        
        assignments.push(assignment.save());
      }
    }

    if (assignments.length === 0) {
      return res.status(200).json({ 
        message: "All selected students already have this assignment", 
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
