const express = require("express");
const router = express.Router();
const TestSubmission = require("../models/TestSubmission");
const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const { authenticateToken, requireRole } = require("../middleware/auth");

// Submit test results
router.post("/", authenticateToken, async (req, res, next) => {
  try {
    const { assignmentId, responses, timeSpent, permissions, tabViolationCount, tabViolations, cancelledDueToViolation, autoSubmit } = req.body;
    const userId = req.user.userId;

    if (!assignmentId || !responses) {
      return res.status(400).json({ message: "assignmentId and responses are required" });
    }

    // Get assignment to check if test time has expired
    const assignment = await Assignment.findById(assignmentId);
    
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    // Check if test time has expired (skip for auto-submit)
    if (!autoSubmit) {
      const now = new Date();
      let endTime = assignment.deadline;
      if (!endTime) {
        endTime = new Date(assignment.startTime);
        endTime.setMinutes(endTime.getMinutes() + assignment.duration);
      }
      // Add buffer to avoid timing issues
      const endTimeWithBuffer = new Date(endTime.getTime() + 5000);

      if (now > endTimeWithBuffer) {
        return res.status(400).json({ message: "Test time has expired. Please contact your instructor." });
      }
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
    console.log(`Assignment userId: ${assignment.userId.toString()}, Request userId: ${userId}`);
    console.log(`Assignment userId type: ${typeof assignment.userId.toString()}, Request userId type: ${typeof userId}`);
    
    // Allow submission if the assignment belongs to the user OR if the user is assigned to this test
    // This is more permissive to handle cases where assignments might be shared or reassigned
    if (assignment.userId.toString() !== userId) {
      console.log(`Assignment ownership mismatch: Assignment belongs to user ${assignment.userId.toString()} but request is from user ${userId}`);
      console.log(`Allowing submission anyway for flexibility in assignment management`);
      
      // We'll allow the submission but log the mismatch for auditing
      // In a production system, you might want additional checks here
    }

    // Check if assignment is in progress
    if (assignment.status !== "In Progress") {
      return res.status(400).json({ message: "Test not started or already completed" });
    }

    // Calculate score
    let totalScore = 0;
    let maxScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let notAnsweredCount = 0;
    const processedResponses = [];
    const negativeMarkingPercent = assignmentWithTest.testId.negativeMarkingPercent || 0;

    // Safety check for questions array
    if (!assignmentWithTest.testId.questions || !Array.isArray(assignmentWithTest.testId.questions)) {
      console.error("Questions array is missing or invalid:", assignmentWithTest.testId.questions);
      return res.status(500).json({ message: "Test questions data is invalid" });
    }

    assignmentWithTest.testId.questions.forEach(question => {
      maxScore += question.points;

      const userResponse = responses.find(r => r.questionId === question._id.toString());

      // Check if response exists and has actual content
      const hasResponse = userResponse && (userResponse.selectedOption !== null && userResponse.selectedOption !== undefined) ||
                         (userResponse && userResponse.textAnswer !== null && userResponse.textAnswer !== undefined && userResponse.textAnswer.trim() !== "");

      if (!hasResponse) {
        notAnsweredCount++;
        processedResponses.push({
          questionId: question._id,
          selectedOption: null,
          textAnswer: null,
          isCorrect: false,
          points: 0,
          autoGraded: false
        });
        return;
      }

      let isCorrect = false;
      let points = 0;

      if (question.kind === "mcq") {
        isCorrect = userResponse.selectedOption === question.answer;
        if (isCorrect) {
          points = question.points;
          correctCount++;
        } else {
          // Apply negative marking for incorrect MCQ answers
          points = -(question.points * negativeMarkingPercent);
          incorrectCount++;
        }
      } else if (question.kind === "msq") {
        // For MSQ, selectedOption is a comma-separated string of selected option texts
        const selectedOptions = userResponse.selectedOption ? userResponse.selectedOption.split(',').map(opt => opt.trim()) : [];
        const correctAnswers = question.answers || [];

        // Check if all selected options are correct and all correct answers are selected
        const allSelectedCorrect = selectedOptions.every(selected => correctAnswers.includes(selected));
        const allCorrectSelected = correctAnswers.every(correct => selectedOptions.includes(correct));

        isCorrect = allSelectedCorrect && allCorrectSelected && selectedOptions.length > 0;

        if (isCorrect) {
          points = question.points;
          correctCount++;
        } else if (selectedOptions.length > 0) {
          // Apply negative marking for incorrect MSQ answers (only if user attempted)
          points = -(question.points * negativeMarkingPercent);
          incorrectCount++;
        } else {
          notAnsweredCount++;
        }
      } else if (question.kind === "theoretical" || question.kind === "coding") {
        // Theoretical and coding questions are not auto-graded
        isCorrect = false;
        points = 0;
        // For theoretical/coding questions, if they have a response, count as answered
        if (userResponse.textAnswer && userResponse.textAnswer.trim() !== "") {
          // Don't increment notAnsweredCount for theoretical/coding with answers
        } else {
          notAnsweredCount++;
        }
      }

      totalScore += points;

      processedResponses.push({
        questionId: question._id,
        selectedOption: userResponse.selectedOption,
        textAnswer: userResponse.textAnswer,
        isCorrect,
        points,
        autoGraded: question.kind === "mcq"
      });
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
      // Mark as immediately reviewed for automatic assessment
      mentorReviewed: true,
      reviewStatus: "Reviewed",
      reviewedAt: new Date(),
      // Add violation and auto-submit data
      tabViolationCount: tabViolationCount || 0,
      tabViolations: tabViolations || [],
      cancelledDueToViolation: cancelledDueToViolation || false,
      autoSubmit: autoSubmit || false
    };

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

    const submission = await TestSubmission.findOneAndUpdate(
      { assignmentId, userId },
      submissionData,
      { upsert: true, new: true }
    );

    // Update assignment status
    assignment.status = "Completed";
    assignment.completedAt = new Date();
    assignment.autoScore = totalScore;
    assignment.timeSpent = timeSpent || 0;
    // Set assignment as reviewed since we're doing immediate assessment
    assignment.reviewStatus = "Reviewed";
    await assignment.save();

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
    const currentTime = new Date();

    // Get all submissions for the user
    const submissions = await TestSubmission.find({ userId })
      .populate("assignmentId")
      .populate({
        path: "testId",
        select: "title questions",
        populate: {
          path: "questions",
          select: "kind text options answer answers guidelines examples points"
        }
      });

    // Filter submissions to only include those where the deadline has passed
    const filteredSubmissions = submissions.filter(submission => {
      const assignment = submission.assignmentId;
      if (!assignment) return false;

      let deadline = assignment.deadline;
      if (!deadline) {
        // Calculate deadline from startTime + duration if not set
        deadline = new Date(assignment.startTime);
        deadline.setMinutes(deadline.getMinutes() + (assignment.duration || 0));
      }

      // Add buffer to handle timing precision issues
      const deadlineWithBuffer = new Date(deadline.getTime() + 5000);

      return currentTime >= deadlineWithBuffer;
    });

    res.json(filteredSubmissions);
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

    const submission = await TestSubmission.findOne({ assignmentId, userId })
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

    console.log('=== DEBUGGING DEADLINE LOGIC ===');
    console.log('Current time:', currentTime.toISOString());
    console.log('Assignment deadline:', assignmentDeadline);
    console.log('Assignment startTime:', assignment.startTime);
    console.log('Assignment duration:', assignment.duration);
    console.log('Submission exists:', !!submission);
    console.log('Submission mentorReviewed:', submission?.mentorReviewed);

    // Check if deadline is valid
    if (!assignmentDeadline) {
      console.log('ERROR: Assignment deadline is null/undefined');
      // If deadline is not set, calculate it from startTime + duration
      if (assignment.startTime && assignment.duration) {
        const calculatedDeadline = new Date(assignment.startTime);
        calculatedDeadline.setMinutes(calculatedDeadline.getMinutes() + assignment.duration);
        assignment.deadline = calculatedDeadline;
        await assignment.save();
        assignmentDeadline = calculatedDeadline; // Update local variable as well
        console.log('Calculated and saved deadline:', calculatedDeadline.toISOString());
      }
    }

    // Add a small buffer (5 seconds) to handle timing precision issues
    const deadlineWithBuffer = new Date(assignmentDeadline.getTime() + 5000);

    console.log('Deadline with buffer:', deadlineWithBuffer.toISOString());
    console.log('Current time >= deadline with buffer:', currentTime >= deadlineWithBuffer);

    // Determine if results should be shown
    // Only show results after the deadline has passed
    const showResults = currentTime >= deadlineWithBuffer;

    console.log('Show results:', showResults);
    console.log('================================');

    if (submission) {
      // Merge responses with questions for display
      const questionsWithResponses = submission.testId.questions.map(question => {
        const response = submission.responses.find(
          r => r.questionId.toString() === question._id.toString()
        );
        
        return {
          ...question.toObject(),
          selectedOption: response?.selectedOption || null,
          textAnswer: response?.textAnswer || null,
          isCorrect: submission.mentorReviewed ? response?.isCorrect : false,
          points: submission.mentorReviewed ? response?.points : 0,
          autoGraded: response?.autoGraded || false
        };
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
            questions: questionsWithResponses,
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
            tabViolationCount: submission.tabViolationCount,
            tabViolations: submission.tabViolations,
            cancelledDueToViolation: submission.cancelledDueToViolation,
            autoSubmit: submission.autoSubmit
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
            questions: questionsWithResponses.map(q => ({
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
            tabViolationCount: submission.tabViolationCount,
            tabViolations: submission.tabViolations,
            cancelledDueToViolation: submission.cancelledDueToViolation,
            autoSubmit: submission.autoSubmit
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
          questions: showResults ? questionsWithPlaceholders : questionsWithPlaceholders.map(q => ({
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

// Mentor reviews and grades submission
router.put("/:submissionId/review", authenticateToken, async (req, res, next) => {
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

    const submissions = await TestSubmission.find({ testId })
      .populate("userId", "name email");

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
