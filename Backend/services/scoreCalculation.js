const TestSubmission = require("../models/TestSubmission");
const Test = require("../models/Test");

/**
 * Recalculates scores for all submissions of a given test
 * @param {string} testId - The ID of the test
 */
async function recalculateScoresForTest(testId) {
  try {
    // Get the updated test with correct answers
    const test = await Test.findById(testId);
    if (!test) {
      throw new Error("Test not found");
    }

    // Get all submissions for this test
    const submissions = await TestSubmission.find({ testId });

    for (const submission of submissions) {
      await recalculateSubmissionScore(submission, test);
    }

    // console.log(`Recalculated scores for ${submissions.length} submissions of test ${testId}`);
  } catch (error) {
    console.error("Error recalculating scores:", error);
    throw error;
  }
}

/**
 * Recalculates score for a single submission
 * @param {Object} submission - The TestSubmission document
 * @param {Object} test - The Test document
 */
async function recalculateSubmissionScore(submission, test) {
  let totalScore = 0;
  let maxScore = 0;

  // Calculate max score
  for (const question of test.questions) {
    maxScore += question.points || 1;
  }

  // Recalculate each response
  for (const response of submission.responses) {
    const question = test.questions.find(q => q._id.toString() === response.questionId.toString());
    if (!question) continue;

    let isCorrect = false;
    let points = 0;

    if (question.kind === "mcq") {
      // For MCQ, check if selected option matches the correct answer
      isCorrect = response.selectedOption === question.answer;
      points = isCorrect ? (question.points || 1) : 0;

      // Apply negative marking if applicable
      if (!isCorrect && test.negativeMarkingPercent > 0) {
        points = -(question.points || 1) * test.negativeMarkingPercent;
      }
    } else if (question.kind === "msq") {
      // For MSQ, check if all correct answers are selected and no wrong ones
      const correctAnswers = question.answers || [];
      const selectedAnswers = response.selectedOption ? response.selectedOption.split(',').map(a => a.trim()) : [];

      // All correct answers must be selected, and no incorrect answers
      const allCorrectSelected = correctAnswers.every(ans => selectedAnswers.includes(ans));
      const noIncorrectSelected = selectedAnswers.every(ans => correctAnswers.includes(ans));

      isCorrect = allCorrectSelected && noIncorrectSelected;
      points = isCorrect ? (question.points || 1) : 0;

      // Apply negative marking if applicable
      if (!isCorrect && test.negativeMarkingPercent > 0) {
        points = -(question.points || 1) * test.negativeMarkingPercent;
      }
    } else if (question.kind === "theory" || question.kind === "coding") {
      // For theory/coding, keep existing manual grading
      isCorrect = response.isCorrect;
      points = response.points;
    }

    // Update response
    response.isCorrect = isCorrect;
    response.points = points;
    response.autoGraded = question.kind !== "theory" && question.kind !== "coding";

    totalScore += points;
  }

  // Update submission
  submission.totalScore = totalScore;
  submission.maxScore = maxScore;

  try {
    await submission.save();
  } catch (error) {
    // Handle validation errors gracefully
    if (error.name === 'ValidationError') {
      console.warn(`Validation error when saving submission ${submission._id}:`, error.message);
      // Try to save without the problematic tabViolations
      const cleanSubmission = submission.toObject();
      if (cleanSubmission.tabViolations) {
        // Filter out invalid violation types
        cleanSubmission.tabViolations = cleanSubmission.tabViolations.filter(
          violation => ["tab_switch", "window_open", "tab_close", "browser_switch", "fullscreen_exit"].includes(violation.violationType)
        );
      }
      await TestSubmission.findByIdAndUpdate(submission._id, {
        totalScore: cleanSubmission.totalScore,
        maxScore: cleanSubmission.maxScore,
        responses: cleanSubmission.responses
      });
    } else {
      throw error;
    }
  } finally {
    // MEMORY OPTIMIZATION: Clear large objects from memory
    if (submission.responses) {
      submission.responses = null;
    }
    if (submission.tabViolations) {
      submission.tabViolations = null;
    }
  }
}

module.exports = {
  recalculateScoresForTest,
  recalculateSubmissionScore
};
