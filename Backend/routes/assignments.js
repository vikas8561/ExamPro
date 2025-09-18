const express = require("express");
const router = express.Router();
const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const User = require("../models/User");
const { authenticateToken, requireRole } = require("../middleware/auth");

// Get all assignments (admin only) - ULTRA FAST VERSION
router.get("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const startTime = Date.now();
    const { status, userId, testId } = req.query;
    const query = {};
    
    if (status) query.status = status;
    if (userId) query.userId = userId;
    if (testId) query.testId = testId;

    console.log('🚀 ULTRA FAST: Fetching assignments for admin');

    // ULTRA FAST: Get assignments with MINIMAL data
    const assignments = await Assignment.find(query)
      .select("testId userId mentorId status startTime duration deadline startedAt completedAt score autoScore mentorScore mentorFeedback reviewStatus timeSpent createdAt")
      .populate("testId", "title type instructions timeLimit")
      .populate("userId", "name email")
      .populate("mentorId", "name email")
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for 2x faster queries

    const totalTime = Date.now() - startTime;
    console.log(`✅ ULTRA FAST admin assignments completed in ${totalTime}ms - Found ${assignments.length} assignments`);

    res.json(assignments);
  } catch (error) {
    next(error);
  }
});

// Get assignments for current student - ULTRA FAST VERSION
router.get("/student", authenticateToken, async (req, res, next) => {
  try {
    if (req.user.role !== "Student") {
      return res.status(403).json({ message: "Access denied. Student access only." });
    }

    const startTime = Date.now();
    console.log('🚀 ULTRA FAST: Fetching assignments for student:', req.user.userId);

    // ULTRA FAST: Get assignments with MINIMAL data (NO questions upfront!)
    const assignments = await Assignment.find({ userId: req.user.userId })
      .select("testId mentorId status startTime duration deadline startedAt completedAt score autoScore mentorScore mentorFeedback reviewStatus timeSpent createdAt")
      .populate({
        path: "testId",
        select: "title type instructions timeLimit subject" // NO questions!
      })
      .populate("mentorId", "name email")
      .sort({ deadline: 1 })
      .lean(); // Use lean() for 2x faster queries

    // ULTRA FAST: Auto-start logic - batch update instead of individual updates
    const now = new Date();
    const assignmentsToAutoStart = assignments.filter(assignment => 
      assignment.status === "Assigned" &&
      assignment.duration === assignment.testId.timeLimit &&
      now >= new Date(assignment.startTime) &&
      now <= new Date(assignment.deadline)
    );

    if (assignmentsToAutoStart.length > 0) {
      console.log(`Auto-starting ${assignmentsToAutoStart.length} assignments for user ${req.user.userId}`);
      
      // ULTRA FAST: Batch update all assignments at once
      const assignmentIds = assignmentsToAutoStart.map(a => a._id);
      await Assignment.updateMany(
        { _id: { $in: assignmentIds } },
        { 
          status: "In Progress",
          startedAt: now
        }
      );
      
      // Update local assignment objects
      assignmentsToAutoStart.forEach(assignment => {
        assignment.status = "In Progress";
        assignment.startedAt = now;
      });
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ ULTRA FAST student assignments completed in ${totalTime}ms - Found ${assignments.length} assignments`);

    res.json(assignments);
  } catch (error) {
    next(error);
  }
});

// Get recent activity for current student - ULTRA FAST VERSION
router.get("/student/recent-activity", authenticateToken, async (req, res, next) => {
  try {
    if (req.user.role !== "Student") {
      return res.status(403).json({ message: "Access denied. Student access only." });
    }

    const startTime = Date.now();
    const userId = req.user.userId;
    console.log('🚀 ULTRA FAST: Fetching recent activity for student:', userId);
    const activities = [];

    // ULTRA FAST: Get all student assignments in one query with minimal data
    const assignments = await Assignment.find({ userId })
      .select("testId status completedAt startedAt createdAt")
      .populate("testId", "title")
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for 2x faster queries

    // Process assignments into activities
    const completedTests = assignments.filter(a => a.status === "Completed").slice(0, 3);
    const startedTests = assignments.filter(a => a.status === "In Progress" && a.startedAt).slice(0, 2);
    const assignedTests = assignments.filter(a => a.status === "Assigned").slice(0, 2);

    // Add completed tests to activities
    completedTests.forEach(test => {
      activities.push({
        type: "completed",
        testId: test.testId,
        testTitle: test.testId.title,
        timestamp: test.completedAt || test.createdAt,
        message: `Completed test: ${test.testId.title}`
      });
    });

    // Add started tests to activities
    startedTests.forEach(test => {
      activities.push({
        type: "started",
        testId: test.testId,
        testTitle: test.testId.title,
        timestamp: test.startedAt,
        message: `Started test: ${test.testId.title}`
      });
    });

    // Add assigned tests to activities
    assignedTests.forEach(test => {
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

    const totalTime = Date.now() - startTime;
    console.log(`✅ ULTRA FAST student recent activity completed in ${totalTime}ms - Found ${recentActivities.length} activities`);

    res.json(recentActivities);
  } catch (error) {
    next(error);
  }
});

// Get assignment by ID
router.get("/:id", authenticateToken, async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate({
        path: "testId",
        select: "title type instructions timeLimit questions otp",
        populate: {
          path: "questions",
          select: "kind text options answer guidelines examples points"
        }
      })
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
    const assignment = await Assignment.findById(req.params.id)
      .populate("testId", "timeLimit");

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const now = new Date();

    // Check availability window (assignment duration)
    let endTime = assignment.deadline;
    if (!endTime) {
      endTime = new Date(assignment.startTime);
      endTime.setMinutes(endTime.getMinutes() + assignment.duration);
    }
    // Add buffer to avoid timing issues
    const endTimeWithBuffer = new Date(endTime.getTime() + 5000);

    if (now > endTimeWithBuffer) {
      return res.status(400).json({ message: "Test availability window has expired." });
    }

    // Check test time limit if test has started
    if (assignment.startedAt && assignment.testId?.timeLimit) {
      const testEndTime = new Date(assignment.startedAt.getTime() + assignment.testId.timeLimit * 60000);
      const testEndTimeWithBuffer = new Date(testEndTime.getTime() + 5000);

      if (now > testEndTimeWithBuffer) {
        return res.status(400).json({ message: "Test time limit has expired." });
      }
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

    // Get test to validate timeLimit
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    // Validate duration >= timeLimit
    if (Number(duration) < test.timeLimit) {
      return res.status(400).json({
        message: `Duration (${duration} minutes) must be greater than or equal to test time limit (${test.timeLimit} minutes)`
      });
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

    // Explicitly calculate and save deadline
    const deadline = new Date(assignment.startTime);
    deadline.setMinutes(deadline.getMinutes() + assignment.duration);
    assignment.deadline = deadline;
    await assignment.save();

    const populatedAssignment = await Assignment.findById(assignment._id)
      .populate("testId", "title type instructions timeLimit subject")
      .populate("userId", "name email")
      .populate("mentorId", "name email");

    // Emit real-time update to specific student
    const io = req.app.get('io');
    console.log(`Emitting assignmentCreated to user ${userId}`);
    io.to(userId.toString()).emit('assignmentCreated', {
      userId: userId,
      assignment: populatedAssignment
    });

    res.status(201).json(populatedAssignment);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/start", authenticateToken, async (req, res, next) => {
  try {
    const { permissions, otp } = req.body;

    const assignment = await Assignment.findById(req.params.id)
      .populate({
        path: "testId",
        select: "title type instructions timeLimit questions otp",
        populate: {
          path: "questions",
          select: "kind text options answer guidelines examples points"
        }
      });

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

    // Handle permissions
    let permissionStatus = "Pending";
    let hasAllPermissionsGranted = false;

    if (permissions) {
      const cameraGranted = permissions.cameraGranted || permissions.camera === "granted";
      const microphoneGranted = permissions.microphoneGranted || permissions.microphone === "granted";
      const locationGranted = permissions.locationGranted || permissions.location === "granted";

      // Determine permission status
      if (cameraGranted && microphoneGranted && locationGranted) {
        permissionStatus = "Granted";
        hasAllPermissionsGranted = true;
      } else if (cameraGranted || microphoneGranted || locationGranted) {
        permissionStatus = "Partially Granted";
      } else {
        permissionStatus = "Denied";
      }

      // Store permissions in assignment
      assignment.permissions = {
        cameraGranted,
        microphoneGranted,
        locationGranted,
        permissionRequestedAt: new Date(),
        permissionStatus
      };
    }

    // Check if OTP is required
    // Skip OTP if user is Admin/Mentor OR if all permissions are granted
    const hasRolePermissions = req.user.role === "Admin" || req.user.role === "Mentor";
    const requiresOtp = assignment.testId.otp && !hasRolePermissions && !hasAllPermissionsGranted;

    console.log(`User role: ${req.user.role}, hasRolePermissions: ${hasRolePermissions}, hasAllPermissionsGranted: ${hasAllPermissionsGranted}, test OTP: ${assignment.testId.otp}, requiresOtp: ${requiresOtp}`);

    if (requiresOtp) {
      if (!otp) {
        return res.status(400).json({ message: "OTP is required to start this test" });
      }

      // Verify OTP (this would need to be implemented based on your OTP system)
      if (otp !== assignment.testId.otp) {
        return res.status(400).json({ message: "Invalid OTP" });
      }
    }

    // Start the test
    assignment.status = "In Progress";
    assignment.startedAt = new Date();

    // Explicitly calculate and save deadline if not set
    if (!assignment.deadline) {
      const deadline = new Date(assignment.startTime);
      deadline.setMinutes(deadline.getMinutes() + assignment.duration);
      assignment.deadline = deadline;
    }

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

    // Get test to validate timeLimit
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    // Validate duration >= timeLimit
    if (Number(duration) < test.timeLimit) {
      return res.status(400).json({
        message: `Duration (${duration} minutes) must be greater than or equal to test time limit (${test.timeLimit} minutes)`
      });
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

        // Explicitly calculate and save deadline
        const deadline = new Date(assignment.startTime);
        deadline.setMinutes(deadline.getMinutes() + assignment.duration);
        assignment.deadline = deadline;
        await assignment.save();

        assignments.push(assignment);
      }
    }

    if (assignments.length === 0) {
      return res.status(200).json({
        message: "All students already have this assignment",
        assignedCount: 0
      });
    }

    await Promise.all(assignments);

    // Emit real-time update to specific student for each assignment
    const io = req.app.get('io');
    assignments.forEach(assignment => {
      io.to(assignment.userId.toString()).emit('assignmentCreated', {
        userId: assignment.userId.toString(),
        assignment: assignment
      });
    });

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

    // Get test to validate timeLimit
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    // Validate duration >= timeLimit
    if (Number(duration) < test.timeLimit) {
      return res.status(400).json({
        message: `Duration (${duration} minutes) must be greater than or equal to test time limit (${test.timeLimit} minutes)`
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

        // Explicitly calculate and save deadline
        const deadline = new Date(assignment.startTime);
        deadline.setMinutes(deadline.getMinutes() + assignment.duration);
        assignment.deadline = deadline;
        await assignment.save();

        assignments.push(assignment);
      }
    }

    if (assignments.length === 0) {
      return res.status(200).json({
        message: "All selected students already have this assignment",
        assignedCount: 0
      });
    }

    await Promise.all(assignments);

    // Emit real-time update to specific student for each assignment
    const io = req.app.get('io');
    assignments.forEach(assignment => {
      io.to(assignment.userId.toString()).emit('assignmentCreated', {
        userId: assignment.userId.toString(),
        assignment: assignment
      });
    });

    res.status(201).json({
      message: `Successfully assigned to ${assignments.length} students`,
      assignedCount: assignments.length
    });
  } catch (error) {
    next(error);
  }
});

// Helper function to check if email is SU student (student1@gmail.com to student123@gmail.com)
const isSUStudent = (email) => {
  const match = email.match(/^student(\d+)@gmail\.com$/);
  if (!match) return false;
  const num = parseInt(match[1], 10);
  return num >= 1 && num <= 123;
};

// Assign test to RU students (admin only)
router.post("/assign-ru", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { testId, startTime, duration, mentorId } = req.body;

    if (!testId || !startTime || !duration) {
      return res.status(400).json({ message: "testId, startTime, and duration are required" });
    }

    // Get test to validate timeLimit
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    // Validate duration >= timeLimit
    if (Number(duration) < test.timeLimit) {
      return res.status(400).json({
        message: `Duration (${duration} minutes) must be greater than or equal to test time limit (${test.timeLimit} minutes)`
      });
    }

    // Get RU students (students with studentCategory = "RU")
    const ruStudents = await User.find({
      role: "Student",
      studentCategory: "RU"
    });

    if (!ruStudents.length) {
      return res.status(404).json({ message: "No RU students found" });
    }

    // Create assignments for RU students
    const assignments = [];
    const existingAssignments = await Assignment.find({ testId });

    for (const student of ruStudents) {
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

        // Explicitly calculate and save deadline
        const deadline = new Date(assignment.startTime);
        deadline.setMinutes(deadline.getMinutes() + assignment.duration);
        assignment.deadline = deadline;
        await assignment.save();

        assignments.push(assignment);
      }
    }

    if (assignments.length === 0) {
      return res.status(200).json({
        message: "All RU students already have this assignment",
        assignedCount: 0
      });
    }

    await Promise.all(assignments);

    // Emit real-time update to specific student for each assignment
    const io = req.app.get('io');
    assignments.forEach(assignment => {
      io.to(assignment.userId.toString()).emit('assignmentCreated', {
        userId: assignment.userId.toString(),
        assignment: assignment
      });
    });

    res.status(201).json({
      message: `Successfully assigned to ${assignments.length} RU students`,
      assignedCount: assignments.length
    });
  } catch (error) {
    next(error);
  }
});

// Assign test to SU students (admin only)
router.post("/assign-su", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { testId, startTime, duration, mentorId } = req.body;

    if (!testId || !startTime || !duration) {
      return res.status(400).json({ message: "testId, startTime, and duration are required" });
    }

    // Get test to validate timeLimit
    const test = await Test.findById(testId);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    // Validate duration >= timeLimit
    if (Number(duration) < test.timeLimit) {
      return res.status(400).json({
        message: `Duration (${duration} minutes) must be greater than or equal to test time limit (${test.timeLimit} minutes)`
      });
    }

    // Get SU students (students with studentCategory = "SU")
    const suStudents = await User.find({
      role: "Student",
      studentCategory: "SU"
    });

    if (!suStudents.length) {
      return res.status(404).json({ message: "No SU students found" });
    }

    // Create assignments for SU students
    const assignments = [];
    const existingAssignments = await Assignment.find({ testId });

    for (const student of suStudents) {
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

        // Explicitly calculate and save deadline
        const deadline = new Date(assignment.startTime);
        deadline.setMinutes(deadline.getMinutes() + assignment.duration);
        assignment.deadline = deadline;
        await assignment.save();

        assignments.push(assignment);
      }
    }

    if (assignments.length === 0) {
      return res.status(200).json({
        message: "All SU students already have this assignment",
        assignedCount: 0
      });
    }

    await Promise.all(assignments);

    // Emit real-time update to specific student for each assignment
    const io = req.app.get('io');
    assignments.forEach(assignment => {
      io.to(assignment.userId.toString()).emit('assignmentCreated', {
        userId: assignment.userId.toString(),
        assignment: assignment
      });
    });

    res.status(201).json({
      message: `Successfully assigned to ${assignments.length} SU students`,
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
