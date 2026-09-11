const TestSubmission = require("../models/TestSubmission");
const Test = require("../models/Test");
const { maxScoreForTest, isAnswered, markMcq } = require("./grading");

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

  // The paper's worth, by the same rule the submit path uses -- coding
  // questions count their hidden test case marks, not their `points`.
  const maxScore = maxScoreForTest(test.questions);

  // Recalculate each response
  for (const response of submission.responses) {
    const question = test.questions.find(q => q._id.toString() === response.questionId.toString());
    if (!question) continue;

    if (question.kind === "mcq") {
      // A blank is not a wrong answer. Grading it as one handed every student a
      // negative marking penalty for questions they never touched.
      if (isAnswered(response)) {
        const marked = markMcq(question, response, test.negativeMarkingPercent);
        response.isCorrect = marked.isCorrect;
        response.points = marked.points;
      } else {
        response.isCorrect = false;
        response.points = 0;
      }
      response.autoGraded = true;
    }
    // Theory and coding keep whatever they were awarded -- a mentor's manual
    // mark, or a Judge0 result. `autoGraded` is left alone too: overwriting it
    // discarded the fact that Judge0 had scored the answer, which stopped that
    // score being carried forward if the student submitted again.

    totalScore += response.points || 0;
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
