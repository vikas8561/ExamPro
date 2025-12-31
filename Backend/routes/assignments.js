const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const User = require("../models/User");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { getCachedTestIds, setCachedTestIds } = require("../utils/testCache");

// Get all assignments (admin only) - ULTRA FAST VERSION
router.get("/", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const startTime = Date.now();
    const { status, userId, testId } = req.query;
    const query = {};
    
    if (status) query.status = status;
    if (userId) query.userId = userId;
    if (testId) query.testId = testId;

    // console.log('🚀 ULTRA FAST: Fetching assignments for admin');

    // ULTRA FAST: Get assignments with MINIMAL data
    const assignments = await Assignment.find(query)
      .select("testId userId mentorId status startTime duration deadline startedAt completedAt score autoScore mentorScore mentorFeedback reviewStatus timeSpent createdAt")
      .populate({
        path: "testId",
        select: "title type instructions timeLimit",
        match: { type: { $ne: "practice" } } // Exclude practice tests from admin assignments
      })
      .populate("userId", "name email")
      .populate("mentorId", "name email")
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for 2x faster queries

    // Filter out assignments where testId is null (due to the match filter above)
    const filteredAssignments = assignments.filter(assignment => assignment.testId !== null);

    const totalTime = Date.now() - startTime;
    // console.log(`✅ ULTRA FAST admin assignments completed in ${totalTime}ms - Found ${filteredAssignments.length} assignments`);

    res.json(filteredAssignments);
  } catch (error) {
    next(error);
  }
});

// Get assignments for current student - ULTRA FAST VERSION with pagination
router.get("/student", authenticateToken, async (req, res, next) => {
  try {
    if (req.user.role !== "Student") {
      return res.status(403).json({ message: "Access denied. Student access only." });
    }

    // Disable ETag for this route to prevent 304 delays
    res.set('ETag', false);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const startTime = Date.now();
    console.log('🚀 ULTRA FAST: Fetching assignments for student:', req.user.userId);

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 9;
    const skip = (page - 1) * limit;
    const testType = req.query.type; // Optional filter for test type (e.g., 'coding')

    // OPTIMIZED: Filter in database, not in memory
    const testQuery = { type: { $ne: "practice" } };
    if (testType) {
      testQuery.type = testType;
    }
    
    // Step 1: Get test IDs from cache or database (CACHED for 5 minutes)
    const cacheKey = testType ? `tests_${testType}` : 'tests_all';
    const testQueryStart = Date.now();
    let validTestIds = getCachedTestIds(cacheKey);
    
    if (!validTestIds) {
      const validTests = await Test.find(testQuery).select('_id').lean();
      validTestIds = validTests.map(t => t._id);
      setCachedTestIds(cacheKey, validTestIds);
      console.log(`💾 Cached test IDs for key: ${cacheKey}`);
    } else {
      console.log(`⚡ Using cached test IDs for key: ${cacheKey}`);
    }
    const testQueryTime = Date.now() - testQueryStart;
    console.log(`⏱️ Test query: ${testQueryTime}ms - Found ${validTestIds.length} valid tests`);
    
    // Step 2 & 3: Run count and assignment queries in PARALLEL for maximum speed
    const parallelStart = Date.now();
    const [validCount, assignments] = await Promise.all([
      // Count total valid assignments
      Assignment.countDocuments({
        userId: req.user.userId,
        testId: { $in: validTestIds }
      }),
      // Get paginated assignments (optimized - removed populate match, filter in DB)
      Assignment.find({ 
        userId: req.user.userId,
        testId: { $in: validTestIds }
      })
        .select("testId mentorId status startTime duration deadline startedAt completedAt score autoScore mentorScore mentorFeedback reviewStatus timeSpent createdAt")
        .populate({
          path: "testId",
          select: "title type instructions timeLimit subject" // No match filter - we already filtered with $in
        })
        .populate("mentorId", "name email")
        .sort({ deadline: 1 })
        .limit(limit)
        .skip(skip)
        .lean()
    ]);
    const parallelTime = Date.now() - parallelStart;
    console.log(`⏱️ Parallel queries (count + assignments): ${parallelTime}ms - Found ${validCount} total, ${assignments.length} assignments`);
    
    // Step 4: Get question counts for tests (single aggregation query)
    const questionCountStart = Date.now();
    const testIds = [...new Set(assignments.map(a => a.testId?._id).filter(Boolean))];
    let questionCountMap = {};
    if (testIds.length > 0) {
      const questionCounts = await Test.aggregate([
        { $match: { _id: { $in: testIds } } },
        { $project: { _id: 1, questionCount: { $size: { $ifNull: ['$questions', []] } } } }
      ]);
      questionCounts.forEach(test => {
        questionCountMap[test._id.toString()] = test.questionCount || 0;
      });
    }
    const questionCountTime = Date.now() - questionCountStart;
    console.log(`⏱️ Question count query: ${questionCountTime}ms`);
    
    // Step 5: Transform assignments with question counts
    // SAFETY: Filter out null testIds (can happen if test was deleted but still in cache)
    // This is safe - stale cache data is handled gracefully
    const transformStart = Date.now();
    const assignmentsWithQuestionCount = assignments
      .filter(a => a.testId !== null) // Filter out null testIds (deleted tests or cache staleness)
      .map(assignment => ({
        ...assignment,
        testId: {
          _id: assignment.testId._id,
          title: assignment.testId.title,
          type: assignment.testId.type,
          instructions: assignment.testId.instructions,
          timeLimit: assignment.testId.timeLimit,
          subject: assignment.testId.subject,
          questionCount: questionCountMap[assignment.testId._id.toString()] || 0
        }
      }));
    const transformTime = Date.now() - transformStart;
    console.log(`⏱️ Transform: ${transformTime}ms`);
    
    const totalQueryTime = Date.now() - startTime;
    console.log(`📊 Query breakdown - Tests: ${testQueryTime}ms (cached), Parallel (Count+Assignments): ${parallelTime}ms, Questions: ${questionCountTime}ms, Transform: ${transformTime}ms, Total: ${totalQueryTime}ms`);

    // Auto-start logic - batch update instead of individual updates
    const autoStartStart = Date.now();
    const now = new Date();
    const assignmentsToAutoStart = assignmentsWithQuestionCount.filter(assignment => 
      assignment.status === "Assigned" &&
      assignment.duration === assignment.testId.timeLimit &&
      now >= new Date(assignment.startTime) &&
      now <= new Date(assignment.deadline)
    );

    if (assignmentsToAutoStart.length > 0) {
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
    const autoStartTime = Date.now() - autoStartStart;
    if (autoStartTime > 0) {
      console.log(`⏱️ Auto-start: ${autoStartTime}ms`);
    }

    // Prepare response
    const responseStart = Date.now();
    const responseData = {
      assignments: assignmentsWithQuestionCount,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(validCount / limit),
        totalItems: validCount,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(validCount / limit),
        hasPrevPage: page > 1
      }
    };
    
    // Send response
    res.json(responseData);
    const responseTime = Date.now() - responseStart;
    const totalTime = Date.now() - startTime;
    
    console.log(`✅ Response sent - Response prep: ${responseTime}ms, Total: ${totalTime}ms`);
  } catch (error) {
    console.error('❌ Error in student assignments:', error);
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
    // console.log('🚀 ULTRA FAST: Fetching recent activity for student:', userId);
    const activities = [];

    // ULTRA FAST: Get only recent assignments with limit to reduce data processing
    const assignments = await Assignment.find({ userId })
      .select("testId status completedAt startedAt createdAt")
      .populate("testId", "title")
      .sort({ createdAt: -1 })
      .limit(20) // Limit to recent 20 assignments only
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

    // Optimize response - ensure clean JSON structure
    const optimizedActivities = recentActivities.map(activity => ({
      type: activity.type,
      testId: activity.testId?._id || activity.testId,
      testTitle: activity.testTitle,
      timestamp: activity.timestamp,
      message: activity.message
    }));

    res.json(optimizedActivities);
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
        select: "title type instructions timeLimit allowedTabSwitches questions otp",
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
    if (req.user.role !== "admin" && assignment.userId && assignment.userId._id && assignment.userId._id.toString() !== req.user.userId) {
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

    // Update test status from "Draft" to "Active" when assigned to students
    // Refetch test to ensure we have the latest status
    const updatedTest = await Test.findById(testId);
    if (updatedTest && updatedTest.status === "Draft") {
      updatedTest.status = "Active";
      await updatedTest.save();
    }

    const populatedAssignment = await Assignment.findById(assignment._id)
      .populate("testId", "title type instructions timeLimit subject")
      .populate("userId", "name email")
      .populate("mentorId", "name email");

    // Emit real-time update to specific student
    const io = req.app.get('io');
    // console.log(`Emitting assignmentCreated to user ${userId}`);
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
        select: "title type instructions timeLimit allowedTabSwitches questions otp",
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
      // Calculate remaining time
      const now = new Date();
      let timeRemaining = 0;
      
      if (assignment.startedAt && assignment.testId?.timeLimit) {
        const testEndTime = new Date(assignment.startedAt.getTime() + assignment.testId.timeLimit * 60000);
        const remainingMs = testEndTime.getTime() - now.getTime();
        timeRemaining = Math.max(0, Math.floor(remainingMs / 1000)); // Convert to seconds
      }
      
      return res.status(200).json({
        assignment,
        test: assignment.testId,
        message: "Test already started",
        alreadyStarted: true,
        timeRemaining
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

    // Handle permissions (skip for coding tests)
    let permissionStatus = "Pending";
    let hasAllPermissionsGranted = false;
    const isCodingTest = assignment.testId?.type === "coding";

    if (!isCodingTest && permissions) {
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
    // Skip OTP if user is Admin/Mentor OR if all permissions are granted OR if it's a coding test
    const hasRolePermissions = req.user.role === "Admin" || req.user.role === "Mentor";
    const requiresOtp = assignment.testId.otp && !hasRolePermissions && !hasAllPermissionsGranted && !isCodingTest;

    // console.log(`User role: ${req.user.role}, hasRolePermissions: ${hasRolePermissions}, hasAllPermissionsGranted: ${hasAllPermissionsGranted}, test OTP: ${assignment.testId.otp}, requiresOtp: ${requiresOtp}`);

    if (requiresOtp) {
      if (!otp) {
        return res.status(400).json({ message: "OTP is required to start this test" });
      }

      // Verify OTP (this would need to be implemented based on your OTP system)
      if (otp !== assignment.testId.otp) {
        return res.status(400).json({ message: "Invalid OTP" });
      }
    }

    // Store timeLimit before saving (populated testId might be lost after save)
    let timeLimitMinutes = assignment.testId?.timeLimit;
    
    console.log('🔍 Initial timeLimit check:', {
      timeLimitMinutes,
      testIdType: typeof assignment.testId,
      testIdIsObject: assignment.testId && typeof assignment.testId === 'object',
      testIdId: assignment.testId?._id,
      testIdTimeLimit: assignment.testId?.timeLimit
    });
    
    // If timeLimit is missing, try to get it from the test directly
    if (!timeLimitMinutes || timeLimitMinutes <= 0 || isNaN(timeLimitMinutes)) {
      console.warn('⚠️ timeLimit missing or invalid, fetching test directly');
      const testIdToFetch = assignment.testId?._id || assignment.testId;
      if (testIdToFetch) {
        const test = await Test.findById(testIdToFetch);
        if (test && test.timeLimit) {
          timeLimitMinutes = Number(test.timeLimit);
          console.log('✅ Fetched timeLimit from test:', timeLimitMinutes);
        }
      }
    }
    
    // Ensure it's a valid number
    timeLimitMinutes = Number(timeLimitMinutes);
    
    if (!timeLimitMinutes || timeLimitMinutes <= 0 || isNaN(timeLimitMinutes)) {
      console.error('❌ ERROR: timeLimit is missing or invalid:', {
        timeLimitMinutes,
        testId: assignment.testId?._id || assignment.testId,
        testIdType: typeof assignment.testId,
        testIdValue: assignment.testId
      });
      // Use a default of 30 minutes if timeLimit is missing
      timeLimitMinutes = 30;
      console.warn('⚠️ Using default timeLimit of 30 minutes');
    }
    
    console.log('✅ Final timeLimitMinutes:', timeLimitMinutes);

    // Start the test
    assignment.status = "In Progress";
    const startedAt = new Date();
    assignment.startedAt = startedAt;

    // Explicitly calculate and save deadline if not set
    if (!assignment.deadline) {
      const deadline = new Date(assignment.startTime);
      deadline.setMinutes(deadline.getMinutes() + assignment.duration);
      assignment.deadline = deadline;
    }

    await assignment.save();

    // Calculate remaining time in seconds
    // Use the stored timeLimitMinutes and startedAt
    const startedAtTime = startedAt.getTime();
    const testEndTime = startedAtTime + (timeLimitMinutes * 60000); // timeLimit in minutes, convert to ms
    const nowTimestamp = Date.now();
    const remainingMs = testEndTime - nowTimestamp;
    const timeRemaining = Math.max(0, Math.floor(remainingMs / 1000)); // Convert to seconds
    
    console.log('⏰ Time calculation:', {
      timeLimitMinutes,
      startedAt: startedAt.toISOString(),
      startedAtTime,
      testEndTime,
      nowTimestamp,
      remainingMs,
      timeRemaining,
      'testEndTime - nowTimestamp (ms)': remainingMs,
      'timeRemaining (seconds)': timeRemaining,
      'timeRemaining (minutes)': Math.floor(timeRemaining / 60)
    });

    // Ensure testId is populated in response
    const populatedAssignment = await Assignment.findById(assignment._id)
      .populate({
        path: "testId",
        select: "title type instructions timeLimit allowedTabSwitches questions otp"
      });

    res.json({
      assignment: populatedAssignment,
      test: populatedAssignment.testId || assignment.testId,
      message: "Test started successfully",
      timeRemaining: timeRemaining
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

    await Promise.all(assignments);

    // Update test status from "Draft" to "Active" when assigned to students
    // Refetch test to ensure we have the latest status
    const updatedTest = await Test.findById(testId);
    if (updatedTest && updatedTest.status === "Draft") {
      updatedTest.status = "Active";
      await updatedTest.save();
    }

    if (assignments.length === 0) {
      return res.status(200).json({
        message: "All students already have this assignment",
        assignedCount: 0
      });
    }

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

    await Promise.all(assignments);

    // Update test status from "Draft" to "Active" when assigned to students
    // Refetch test to ensure we have the latest status
    const updatedTest = await Test.findById(testId);
    if (updatedTest && updatedTest.status === "Draft") {
      updatedTest.status = "Active";
      await updatedTest.save();
    }

    if (assignments.length === 0) {
      return res.status(200).json({
        message: "All selected students already have this assignment",
        assignedCount: 0
      });
    }

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

    await Promise.all(assignments);

    // Update test status from "Draft" to "Active" when assigned to students
    // Refetch test to ensure we have the latest status
    const updatedTest = await Test.findById(testId);
    if (updatedTest && updatedTest.status === "Draft") {
      updatedTest.status = "Active";
      await updatedTest.save();
    }

    if (assignments.length === 0) {
      return res.status(200).json({
        message: "All RU students already have this assignment",
        assignedCount: 0
      });
    }

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

    await Promise.all(assignments);

    // Update test status from "Draft" to "Active" when assigned to students
    // Refetch test to ensure we have the latest status
    const updatedTest = await Test.findById(testId);
    if (updatedTest && updatedTest.status === "Draft") {
      updatedTest.status = "Active";
      await updatedTest.save();
    }

    if (assignments.length === 0) {
      return res.status(200).json({
        message: "All SU students already have this assignment",
        assignedCount: 0
      });
    }

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
