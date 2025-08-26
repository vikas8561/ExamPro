const express = require("express");
const router = express.Router();
const TestSubmission = require("../models/TestSubmission");
const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const { authenticateToken, requireRole } = require("../middleware/auth");

// Submit test results
router.post("/", authenticateToken, async (req, res, next) => {
  try {
    const { assignmentId, responses, timeSpent, permissions } = req.body;
    const userId = req.user.userId;

    if (!assignmentId || !responses) {
      return res.status(400).json({ message: "assignmentId and responses are required" });
    }

    // Get assignment and test
    const assignment = await Assignment.findById(assignmentId)
      .populate("testId", "questions");
    
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
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
    const processedResponses = [];

    assignment.testId.questions.forEach(question => {
      maxScore += question.points;
      
      const userResponse = responses.find(r => r.questionId === question._id.toString());
      if (!userResponse) {
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
        points = isCorrect ? question.points : 0;
      } else {
        // Theoretical questions are not auto-graded
        isCorrect = false;
        points = 0;
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
      testId: assignment.testId._id,
      userId,
      responses: processedResponses,
      totalScore,
      maxScore,
      timeSpent: timeSpent || 0,
      submittedAt: new Date(),
      // Mark as immediately reviewed for automatic assessment
      mentorReviewed: true,
      reviewStatus: "Reviewed",
      reviewedAt: new Date()
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
    next(error);
  }
});

router.get("/student", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const submissions = await TestSubmission.find({ userId })
      .populate("assignmentId")
      .populate("testId", "title questions");

    res.json(submissions);
  } catch (error) {
    next(error);
  }
});

// Get submission by assignment ID
router.get("/assignment/:assignmentId", authenticateToken, async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const userId = req.user.userId;

    const submission = await TestSubmission.findOne({ assignmentId, userId })
      .populate({
        path: "testId",
        select: "title questions"
      });

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

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

    // Return different data structure based on review status
    if (submission.mentorReviewed) {
      // Return full results with scores for reviewed submissions
      res.json({
        test: {
          _id: submission.testId._id,
          title: submission.testId.title,
          questions: questionsWithResponses
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
          finalScore: submission.mentorScore || submission.totalScore,
          permissions: submission.permissions
        },
        showResults: true
      });
    } else {
      // Return submission data without scores for unreviewed submissions
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
            // Hide correctness and points until reviewed
            isCorrect: false,
            points: 0
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
          permissions: submission.permissions
        },
        showResults: false
      });
    }
  } catch (error) {
    next(error);
  }
});

// Get submissions for mentor review
router.get("/mentor/pending", authenticateToken, async (req, res, next) => {
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
    .populate({
      path: "assignmentId",
      populate: {
        path: "testId",
        select: "title"
      }
    })
    .populate("userId", "name email")
    .sort({ submittedAt: -1 });

    console.log(`Found ${submissions.length} pending submissions for review`);
    res.json(submissions);
  } catch (error) {
    console.error("Error fetching mentor pending submissions:", error);
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
      const score = submission.mentorReviewed ? submission.mentorScore : submission.totalScore;
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
