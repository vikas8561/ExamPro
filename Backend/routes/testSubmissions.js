const express = require("express");
const router = express.Router();
const TestSubmission = require("../models/TestSubmission");
const { gradeSubmission } = require("../services/submissionGrading");
const { isAttemptExpired, SUBMISSION_GRACE_MS } = require("../services/attemptWindow");
const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { requireProctorSession } = require("../middleware/proctorSession");
const ProctorSession = require("../models/ProctorSession");
const { attach } = require("../services/principals");

// Gemini integration removed - mentors will grade manually

// NOTE: PUT /sync-violations and GET /violations/:assignmentId used to live
// here. They were part of the old system, where the browser reported its own
// violation totals and the server wrote down whatever it was told. Nothing
// calls them any more, and the writable one accepted any count from any
// student -- so a student could POST a count of zero and erase their own
// violation history after the fact. The proctoring session is now the single
// authority for this (see Backend/routes/proctor.js).

router.post("/", authenticateToken, requireProctorSession({ allowTerminated: true }), async (req, res, next) => {
  try {
    const { assignmentId, responses, timeSpent, permissions, tabViolationCount, tabViolations, cancelledDueToViolation, autoSubmit } = req.body;
    const userId = req.user.userId;

    // Debug logging for incoming data
    console.log("🔍 Test submission data:", {
      assignmentId,
      userId,
      responsesCount: responses?.length,
      responses: responses?.map(r => ({
        questionId: r.questionId,
        questionIdType: typeof r.questionId,
        hasSelectedOption: !!r.selectedOption,
        hasTextAnswer: !!r.textAnswer
      }))
    });

    // Validate responses format
    if (!Array.isArray(responses)) {
      console.error("❌ Responses is not an array:", responses);
      return res.status(400).json({ message: "Responses must be an array" });
    }

    // Validate each response
    for (const response of responses) {
      if (!response.questionId || typeof response.questionId !== 'string' || response.questionId.length !== 24) {
        console.error("❌ Invalid questionId in response:", response.questionId);
        return res.status(400).json({ message: "Invalid question ID format in responses" });
      }
    }

    if (!assignmentId || !responses) {
      return res.status(400).json({ message: "assignmentId and responses are required" });
    }

    // Get assignment to check if test time has expired
    console.log("🔍 Looking up assignment:", assignmentId, "Type:", typeof assignmentId);

    // Validate assignmentId format
    if (!assignmentId || typeof assignmentId !== 'string' || assignmentId.length !== 24) {
      console.error("❌ Invalid assignmentId format:", assignmentId);
      return res.status(400).json({ message: "Invalid assignment ID format" });
    }

    const assignment = await Assignment.findById(assignmentId);

    if (!assignment) {
      console.error("❌ Assignment not found:", assignmentId);
      return res.status(404).json({ message: "Assignment not found" });
    }

    console.log("✅ Assignment found:", assignment._id);

    // Has this attempt run out?
    //
    // An auto-submit is the student's own page doing the right thing the moment
    // the clock hit zero, so it is allowed to land late -- but only inside the
    // grace window. This check used to be skipped entirely for an auto-submit,
    // and `autoSubmit` is a flag the browser supplies, so anyone could submit an
    // attempt hours after it ended just by setting it. Past the grace window the
    // server's own sweep owns the attempt instead.
    //
    // Both clocks are evaluated by services/attemptWindow.js, which the sweep
    // shares, so the two can never disagree about when a sitting is over.
    const testForWindow = await Test.findById(assignment.testId).select("timeLimit");
    const graceMs = autoSubmit ? SUBMISSION_GRACE_MS : 5000;

    if (isAttemptExpired(assignment, testForWindow, graceMs)) {
      return res.status(400).json({
        message: "Test time has expired. Please contact your instructor.",
        code: "attempt_expired",
      });
    }

    // Get assignment with test populated for scoring
    const assignmentWithTest = await Assignment.findById(assignmentId)
      .populate({
        path: "testId",
        select: "questions negativeMarkingPercent",
        populate: {
          path: "questions",
          select: "kind text options answer answers guidelines examples points"
        }
      });

    if (!assignmentWithTest.testId) {
      return res.status(404).json({ message: "Test not found" });
    }

    // Check if user has access to this assignment
    // console.log(`Assignment userId: ${assignment.userId.toString()}, Request userId: ${userId}`);
    // console.log(`Assignment userId type: ${typeof assignment.userId.toString()}, Request userId type: ${typeof userId}`);

    // Allow submission if the assignment belongs to the user OR if the user is assigned to this test
    // This is more permissive to handle cases where assignments might be shared or reassigned
    if (assignment.userId.toString() !== userId) {
      // console.log(`Assignment ownership mismatch: Assignment belongs to user ${assignment.userId.toString()} but request is from user ${userId}`);
      // console.log(`Allowing submission anyway for flexibility in assignment management`);

      // We'll allow the submission but log the mismatch for auditing
      // In a production system, you might want additional checks here
    }

    // Check if assignment is in progress
    if (assignment.status !== "In Progress") {
      return res.status(400).json({ message: "Test not started or already completed" });
    }

    // Coding questions may already have been graded by Judge0 via
    // /api/coding/submit. This POST replaces the whole document, so pull those
    // auto-graded results forward instead of zeroing them out.
    const priorSubmission = await TestSubmission.findOne({ assignmentId, userId })
      .select("responses")
      .lean();
    const priorAutoGraded = new Map(
      (priorSubmission?.responses || [])
        .filter((response) => response.autoGraded)
        .map((response) => [response.questionId.toString(), response])
    );

    // Safety check for questions array
    if (!assignmentWithTest.testId.questions || !Array.isArray(assignmentWithTest.testId.questions)) {
      console.error("Questions array is missing or invalid:", assignmentWithTest.testId.questions);
      return res.status(500).json({ message: "Test questions data is invalid" });
    }

    // Mark the paper. The loop that used to live here now lives in
    // services/submissionGrading.js, so the sweep that finalises abandoned
    // attempts grades them by exactly the same rules rather than its own copy.
    const { processedResponses, totalScore, maxScore } = gradeSubmission({
      test: assignmentWithTest.testId,
      responses,
      priorAutoGraded,
    });

    // Create or update submission with permission data
    const submissionData = {
      assignmentId,
      testId: assignmentWithTest.testId._id,
      userId,
      responses: processedResponses,
      totalScore,
      maxScore,
      timeSpent: timeSpent || 0,
      submittedAt: new Date(),
      isFinalized: true,
      // Mark as immediately reviewed for automatic assessment
      mentorReviewed: true,
      reviewStatus: "Reviewed",
      reviewedAt: new Date(),
      // Add violation and auto-submit data.
      // For a proctored test these come from the server's own session record,
      // set just below — the numbers the browser sends are only a fallback for
      // unproctored practice tests, since a browser can be made to say anything.
      tabViolationCount: tabViolationCount || 0,
      tabViolations: tabViolations || [],
      cancelledDueToViolation: cancelledDueToViolation || false,
      autoSubmit: autoSubmit || false
    };

    // The server's account of the attempt overrides the browser's.
    const proctorSession = req.proctor?.session;
    if (proctorSession) {
      submissionData.proctorSessionId = proctorSession._id;
      submissionData.proctorBypassUsed = proctorSession.bypass?.used === true;
      submissionData.tabViolationCount = proctorSession.violationCount || 0;
      submissionData.tabViolations = (proctorSession.violations || []).map((v) => ({
        timestamp: v.timestamp,
        violationType: v.violationType,
        details: v.details || "",
        tabCount: 1
      }));
      submissionData.cancelledDueToViolation =
        proctorSession.status === "terminated" || cancelledDueToViolation === true;

      // Close the session out so a submitted attempt cannot be reopened.
      await ProctorSession.updateOne(
        { _id: proctorSession._id, status: { $ne: "terminated" } },
        { $set: { status: "ended", endedAt: new Date() } }
      ).catch(() => {
        // Best effort: the submission itself is what matters here.
      });
    }

    // Debug logging for submission data
    console.log("🔍 Submission data before save:", {
      assignmentId: assignmentId,
      assignmentIdType: typeof assignmentId,
      testId: assignmentWithTest.testId._id,
      testIdType: typeof assignmentWithTest.testId._id,
      userId: userId,
      userIdType: typeof userId,
      responsesCount: processedResponses.length,
      firstResponse: processedResponses[0] ? {
        questionId: processedResponses[0].questionId,
        questionIdType: typeof processedResponses[0].questionId
      } : null
    });

    // Add permission data if provided
    if (permissions) {
      // Handle both old and new permission formats
      const cameraGranted = permissions.cameraGranted || permissions.camera === "granted";
      const microphoneGranted = permissions.microphoneGranted || permissions.microphone === "granted";
      const locationGranted = permissions.locationGranted || permissions.location === "granted";

      // Determine permission status
      let permissionStatus = "Pending";
      if (cameraGranted && microphoneGranted && locationGranted) {
        permissionStatus = "Granted";
      } else if (cameraGranted || microphoneGranted || locationGranted) {
        permissionStatus = "Partially Granted";
      } else {
        permissionStatus = "Denied";
      }

      submissionData.permissions = {
        cameraGranted,
        microphoneGranted,
        locationGranted,
        permissionRequestedAt: new Date(),
        permissionStatus
      };
    }

    console.log("🔍 About to save to database with query:", { assignmentId, userId });
    console.log("🔍 Submission data keys:", Object.keys(submissionData));

    let submission;
    try {
      // Use findOneAndUpdate with upsert for atomic operation
      // Add timeout to prevent hanging
      submission = await TestSubmission.findOneAndUpdate(
        { assignmentId, userId },
        submissionData,
        {
          upsert: true,
          new: true,
          runValidators: false, // Skip validators for performance
          maxTimeMS: 10000 // 10 second timeout
        }
      ).maxTimeMS(10000);
      console.log("✅ Database save successful:", submission._id);
    } catch (dbError) {
      console.error("❌ Database save failed:", dbError);
      console.error("❌ Error details:", {
        name: dbError.name,
        message: dbError.message,
        code: dbError.code,
        keyValue: dbError.keyValue
      });

      // If it's a duplicate key error, try to fetch existing submission
      if (dbError.code === 11000) {
        console.log("⚠️ Duplicate key error, fetching existing submission...");
        submission = await TestSubmission.findOne({ assignmentId, userId });
        if (submission) {
          console.log("✅ Found existing submission, updating...");
          Object.assign(submission, submissionData);
          await submission.save();
        } else {
          throw dbError;
        }
      } else {
        throw dbError;
      }
    }

    // Update assignment status - use findByIdAndUpdate for better performance
    try {
      await Assignment.findByIdAndUpdate(
        assignmentId,
        {
          status: "Completed",
          completedAt: new Date(),
          autoScore: totalScore,
          timeSpent: timeSpent || 0,
          reviewStatus: "Reviewed"
        },
        {
          new: false, // Don't return updated document for performance
          maxTimeMS: 5000 // 5 second timeout
        }
      ).maxTimeMS(5000);
    } catch (updateError) {
      console.error("❌ Error updating assignment status:", updateError);
      // Don't throw - submission was successful, assignment update can be retried
      console.warn("⚠️ Assignment status update failed, but submission was saved");
    }

    res.status(201).json({
      submission,
      totalScore,
      maxScore,
      message: "Test submitted successfully"
    });
  } catch (error) {
    console.error("Error in POST /api/test-submissions:", error.message, error.stack);
    next(error);
  }
});

router.get("/student", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const startTime = Date.now();

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // OPTIMIZED: Get assignment IDs that have valid assignments first
    const validAssignmentIds = await Assignment.find({ userId })
      .select('_id')
      .lean();
    const validAssignmentIdArray = validAssignmentIds.map(a => a._id);

    // OPTIMIZED: Count completed submissions efficiently
    const totalCount = await TestSubmission.countDocuments({
      userId,
      assignmentId: { $in: validAssignmentIdArray },
      submittedAt: { $ne: null, $exists: true }
    });

    // OPTIMIZED: Get paginated submissions - don't load questions array
    const submissions = await TestSubmission.find({
      userId,
      assignmentId: { $in: validAssignmentIdArray },
      submittedAt: { $ne: null, $exists: true }
    })
      .select("assignmentId testId userId responses totalScore maxScore submittedAt timeSpent mentorReviewed mentorScore mentorFeedback reviewStatus")
      .populate("assignmentId", "testId userId status startTime duration deadline")
      .populate({
        path: "testId",
        select: "title type", // Removed questions - not needed for list view
      })
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalTime = Date.now() - startTime;
    console.log(`✅ OPTIMIZED student submissions completed in ${totalTime}ms - Found ${submissions.length} submissions`);

    res.json({
      submissions: submissions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get submission by assignment ID
router.get("/assignment/:assignmentId", authenticateToken, async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const userId = req.user.userId;

    // Get the assignment to check the deadline and test details
    const assignment = await Assignment.findById(assignmentId)
      .populate({
        path: "testId",
        select: "title questions negativeMarkingPercent",
        populate: {
          path: "questions",
          select: "kind text options answer answers guidelines examples points"
        }
      });

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const isStudent = assignment.userId.toString() === userId;

    // A reviewer is someone whose ROLE is mentor or admin -- and, for a mentor,
    // one actually attached to this assignment.
    //
    // This used to read `!assignment.mentorId || assignment.mentorId === userId`,
    // which meant that whenever an assignment had no mentor attached (the
    // default for every assignment) EVERY logged-in user counted as its mentor.
    // That single flag both unlocked the correct answers and waived the
    // ownership check, so any student could read any other student's
    // submission -- and read the answers to their own paper while still
    // sitting it.
    const role = String(req.user?.role || "").toLowerCase();
    const isAdmin = role === "admin";
    const isReviewer =
      isAdmin ||
      (role === "mentor" &&
        (!assignment.mentorId || assignment.mentorId.toString() === userId));

    if (!isStudent && !isReviewer) {
      return res.status(403).json({ message: "Not authorized to view this submission" });
    }

    // Find submission for the student (assignment.userId), not the current user
    const submission = await TestSubmission.findOne({ assignmentId, userId: assignment.userId })
      .populate({
        path: "testId",
        select: "title questions",
        populate: {
          path: "questions",
          select: "kind text options answer answers guidelines examples points"
        }
      });

    // Check if the assignment deadline has passed
    const currentTime = new Date();
    let assignmentDeadline = assignment.deadline;

    // console.log('=== DEBUGGING DEADLINE LOGIC ===');
    // console.log('Current time:', currentTime.toISOString());
    // console.log('Assignment deadline:', assignmentDeadline);
    // console.log('Assignment startTime:', assignment.startTime);
    // console.log('Assignment duration:', assignment.duration);
    // console.log('Submission exists:', !!submission);
    // console.log('Submission mentorReviewed:', submission?.mentorReviewed);

    // Check if deadline is valid
    if (!assignmentDeadline) {
      // console.log('ERROR: Assignment deadline is null/undefined');
      // If deadline is not set, calculate it from startTime + duration
      if (assignment.startTime && assignment.duration) {
        const calculatedDeadline = new Date(assignment.startTime);
        calculatedDeadline.setMinutes(calculatedDeadline.getMinutes() + assignment.duration);
        assignment.deadline = calculatedDeadline;
        await assignment.save();
        assignmentDeadline = calculatedDeadline; // Update local variable as well
        // console.log('Calculated and saved deadline:', calculatedDeadline.toISOString());
      }
    }

    // Add a small buffer (5 seconds) to handle timing precision issues
    const deadlineWithBuffer = new Date(assignmentDeadline.getTime() + 5000);

    // console.log('Deadline with buffer:', deadlineWithBuffer.toISOString());
    // console.log('Current time >= deadline with buffer:', currentTime >= deadlineWithBuffer);

    // Reviewers see results straight away. A student sees them only once the
    // deadline has passed AND they have actually finished -- an unfinished
    // attempt must never unlock its own answer key.
    const hasFinished =
      assignment.status === "Completed" || submission?.isFinalized === true;
    const showResults = isReviewer || (hasFinished && currentTime >= deadlineWithBuffer);

    // console.log('Show results:', showResults);
    // console.log('================================');

    // The proctoring record belongs to the proctor.
    //
    // A student's own results page was showing them the full violation log --
    // every type, every timestamp, and a running "N violations recorded" count.
    // That is the reviewer's evidence, and handing it to the student turns it
    // into a scoreboard for working out exactly how much they can get away with.
    // They are still told at the time, by the overlay, every time one is
    // recorded; what they do not get afterwards is the tally.
    const proctorRecordFor = (sub) => (isReviewer
      ? {
        tabViolationCount: sub.tabViolationCount,
        tabViolations: sub.tabViolations,
        proctorBypassUsed: sub.proctorBypassUsed,
      }
      : {});

    // A student reviewing their own paper should see it in the order they sat
    // it. The questions are stored in one canonical order and shuffled per
    // student on the way out, so a shuffled paper reviewed canonically puts
    // "Q1" against a question the student answered somewhere else entirely --
    // which reads exactly like shuffling never happened. Reviewers keep the
    // canonical order, so "Q3" means one fixed thing to whoever marks it.
    const inStudentOrder = (questions) => {
      const order = (assignment.questionOrder || []).map(String);
      if (isReviewer || order.length === 0) return questions;

      const byId = new Map(questions.map((q) => [String(q._id), q]));
      const ordered = [];
      for (const id of order) {
        if (byId.has(id)) {
          ordered.push(byId.get(id));
          byId.delete(id);
        }
      }
      // Anything not named by the stored order (a question added since) keeps
      // its canonical position at the end rather than vanishing from the review.
      return [...ordered, ...byId.values()];
    };

    if (submission) {
      // Merge responses with questions for display
      const questionsWithResponses = submission.testId.questions.map(question => {
        const response = submission.responses.find(
          r => r.questionId.toString() === question._id.toString()
        );

        const mergedQuestion = {
          // Reviewers get the question as-is. A student reviewing their own
          // finished paper sees the correct answer -- that is the point of the
          // review -- but never the hidden test cases, which are reused across
          // cohorts and would leak to whoever they passed them on to.
          ...(isReviewer
            ? question.toObject()
            : (() => {
                const plain = question.toObject();
                delete plain.hiddenTestCases;
                return plain;
              })()),
          selectedOption: response?.selectedOption || null,
          textAnswer: response?.textAnswer || null,
          language: response?.language || question.language || null, // Student's language or question default
          isCorrect: submission.mentorReviewed ? response?.isCorrect : false,
          points: submission.mentorReviewed ? response?.points : 0,
          autoGraded: response?.autoGraded || false,
          geminiFeedback: response?.geminiFeedback || null,
          correctAnswer: response?.correctAnswer || null,
          errorAnalysis: response?.errorAnalysis || null,
          improvementSteps: response?.improvementSteps || null,
          topicRecommendations: response?.topicRecommendations || []
        };

        // Debug logging for theory/coding questions
        if (question.kind === "theory" || question.kind === "coding") {
          console.log(`DEBUG: Question ${question._id} - kind: ${question.kind}, geminiFeedback:`, response?.geminiFeedback);
        }

        return mergedQuestion;
      });

      // Calculate correct/incorrect counts from responses
      let correctCount = 0;
      let incorrectCount = 0;
      let notAnsweredCount = 0;

      submission.responses.forEach(response => {
        if (response.isCorrect) {
          correctCount++;
        } else if ((response.selectedOption !== null && response.selectedOption !== undefined) && !response.isCorrect) {
          incorrectCount++;
        } else if ((response.selectedOption === null || response.selectedOption === undefined) &&
          (response.textAnswer === null || response.textAnswer === undefined || response.textAnswer.trim() === "")) {
          notAnsweredCount++;
        }
      });

      // Return the appropriate response based on whether results should be shown
      if (showResults) {
        // Return full results with scores when deadline has passed and submission is reviewed
        res.json({
          test: {
            _id: submission.testId._id,
            title: submission.testId.title,
            questions: inStudentOrder(questionsWithResponses),
            negativeMarkingPercent: assignment.testId.negativeMarkingPercent || 0
          },
          submission: {
            _id: submission._id,
            totalScore: submission.totalScore,
            maxScore: submission.maxScore,
            submittedAt: submission.submittedAt,
            timeSpent: submission.timeSpent,
            mentorReviewed: submission.mentorReviewed,
            mentorScore: submission.mentorScore,
            mentorFeedback: submission.mentorFeedback,
            reviewStatus: submission.reviewStatus,
            finalScore: submission.mentorScore || (submission.maxScore ? Math.round((submission.totalScore / submission.maxScore) * 100) : 0),
            finalMarks: submission.totalScore, // Final marks after negative marking deduction
            correctCount,
            incorrectCount,
            notAnsweredCount,
            permissions: submission.permissions,
            // Whether the attempt was cut short, and whether it submitted
            // itself, are facts about the student's own paper and stay. The
            // violation tally and log are the proctor's -- see proctorRecordFor.
            cancelledDueToViolation: submission.cancelledDueToViolation,
            autoSubmit: submission.autoSubmit,
            ...proctorRecordFor(submission)
          },
          showResults: true
        });
      } else {
        // Calculate remaining time until results are available
        const remainingTime = Math.max(0, assignmentDeadline - currentTime);
        const remainingMinutes = Math.floor((remainingTime / 1000) / 60);
        const remainingSeconds = Math.floor((remainingTime / 1000) % 60);
        const remainingTimeString = `${remainingMinutes} minutes and ${remainingSeconds} seconds`;

        res.json({
          test: {
            _id: submission.testId._id,
            title: submission.testId.title,
            questions: inStudentOrder(questionsWithResponses).map(q => ({
              _id: q._id,
              text: q.text,
              kind: q.kind,
              options: q.options,
              guidelines: q.guidelines,
              points: q.points,
              selectedOption: q.selectedOption,
              textAnswer: q.textAnswer,
              language: q.language || null, // Include language from response
              // Hide correctness, points, and answer until results can be shown
              isCorrect: false,
              points: 0,
              answer: null  // Hide the correct answer
            }))
          },
          submission: {
            _id: submission._id,
            totalScore: null,
            maxScore: null,
            submittedAt: submission.submittedAt,
            timeSpent: submission.timeSpent,
            mentorReviewed: submission.mentorReviewed,
            mentorScore: null,
            mentorFeedback: null,
            reviewStatus: submission.reviewStatus,
            finalScore: null,
            permissions: submission.permissions,
            // Whether the attempt was cut short, and whether it submitted
            // itself, are facts about the student's own paper and stay. The
            // violation tally and log are the proctor's -- see proctorRecordFor.
            cancelledDueToViolation: submission.cancelledDueToViolation,
            autoSubmit: submission.autoSubmit,
            ...proctorRecordFor(submission)
          },
          showResults: false,
          message: `Results available after ${remainingTimeString}`
        });
      }
    } else {
      // No submission found - return test questions with correct answers
      const questionsWithPlaceholders = assignment.testId.questions.map(question => ({
        ...question.toObject(),
        selectedOption: null,
        textAnswer: null,
        isCorrect: false,
        points: 0,
        autoGraded: false
      }));

      res.json({
        test: {
          _id: assignment.testId._id,
          title: assignment.testId.title,
          questions: showResults ? inStudentOrder(questionsWithPlaceholders) : inStudentOrder(questionsWithPlaceholders).map(q => ({
            _id: q._id,
            text: q.text,
            kind: q.kind,
            options: q.options,
            guidelines: q.guidelines,
            points: q.points,
            selectedOption: q.selectedOption,
            textAnswer: q.textAnswer,
            // Hide correctness, points, and answer until results can be shown
            isCorrect: false,
            points: 0,
            answer: null
          }))
        },
        submission: {
          _id: null,
          totalScore: 0,
          maxScore: assignment.testId.questions.reduce((sum, q) => sum + q.points, 0),
          submittedAt: null,
          timeSpent: 0,
          mentorReviewed: false,
          mentorScore: null,
          mentorFeedback: null,
          reviewStatus: "Not Submitted",
          finalScore: 0,
          permissions: null
        },
        showResults: showResults,
        message: showResults ?
          "Test Completion Status\nThis test has been assessed immediately upon submission.\n\nNo test submission data is available as the test was not fully completed." :
          "Test not submitted yet. Results will be available after the deadline."
      });
    }
  } catch (error) {
    next(error);
  }
});

// Mentor reviews and grades submission (mentor/admin only)
router.put("/:submissionId/review", authenticateToken, requireRole(["Mentor", "Admin"]), async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const { mentorScore, mentorFeedback } = req.body;
    const mentorId = req.user.userId;

    if (!mentorScore || mentorScore < 0 || mentorScore > 100) {
      return res.status(400).json({ message: "Valid mentor score (0-100) is required" });
    }

    // Get submission and assignment
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

// Get submission statistics
router.get("/stats/:testId", authenticateToken, requireRole("admin"), async (req, res, next) => {
  try {
    const { testId } = req.params;

    const submissions = await attach(
      await TestSubmission.find({ testId }).lean(),
      "userId",
      "Student"
    );

    const stats = {
      totalSubmissions: submissions.length,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 100,
      scoreDistribution: Array(10).fill(0) // 0-10, 11-20, ..., 91-100
    };

    let totalScore = 0;

    submissions.forEach(submission => {
      const score = submission.mentorReviewed ? submission.mentorScore : (submission.maxScore ? Math.round((submission.totalScore / submission.maxScore) * 100) : 0);
      totalScore += score;

      if (score > stats.highestScore) stats.highestScore = score;
      if (score < stats.lowestScore) stats.lowestScore = score;

      const bucket = Math.floor(score / 10);
      stats.scoreDistribution[bucket]++;
    });

    stats.averageScore = submissions.length > 0 ? (totalScore / submissions.length).toFixed(1) : 0;

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
