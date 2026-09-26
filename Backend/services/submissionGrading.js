/**
 * Grading a whole paper, in one place.
 *
 * Lifted verbatim out of POST /api/test-submissions so that the server-side
 * sweep that finalises abandoned attempts (services/expiredAttempts.js) marks
 * them by exactly the same rules. Two copies of a grading loop is how the
 * scoring bugs in services/grading.js came about; this module exists so there
 * is only ever one.
 *
 * The per-question rules themselves live in services/grading.js.
 */

const { maxMarksForQuestion, isAnswered, markMcq } = require("./grading");

/**
 * Mark every question on a test against a student's answers.
 *
 * @param {Object}   test            the Test document, with `questions`
 * @param {Array}    responses       raw answers: { questionId, selectedOption, textAnswer, language }
 * @param {Map}      priorAutoGraded questionId -> an earlier auto-graded response
 *                                   (Judge0 results recorded mid-test), so a
 *                                   coding score already earned is not zeroed.
 */
function gradeSubmission({ test, responses, priorAutoGraded = new Map() }) {
  const questions = Array.isArray(test?.questions) ? test.questions : [];
  // Null entries reach this in real data -- a sparse array serializes its
  // holes as null -- and `String(null.questionId)` throws, which would take
  // down the whole submission rather than skipping one empty slot. The sweep
  // that finalises abandoned attempts shares this function, so it has to hold
  // here too, not only at the route.
  const given = (Array.isArray(responses) ? responses : []).filter((r) => r != null);
  const negativeMarkingPercent = test?.negativeMarkingPercent || 0;

  let totalScore = 0;
  let maxScore = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let notAnsweredCount = 0;
  const processedResponses = [];

  // Always walk the test's own questions, never the answers the client sent.
  // That is what makes a shuffled paper safe to grade: order is irrelevant
  // because every answer is looked up by question id.
  for (const question of questions) {
    maxScore += maxMarksForQuestion(question);

    const userResponse = given.find(
      (r) => String(r.questionId) === question._id.toString()
    );

    if (!isAnswered(userResponse)) {
      notAnsweredCount++;
      processedResponses.push({
        questionId: question._id,
        selectedOption: null,
        textAnswer: null,
        isCorrect: false,
        points: 0,
        autoGraded: false,
        geminiFeedback: null,
        correctAnswer: null,
        errorAnalysis: null,
        improvementSteps: [],
        topicRecommendations: []
      });
      continue;
    }

    let isCorrect = false;
    let points = 0;
    // Tracks whether the score came from a grader rather than a mentor, so a
    // repeat submit can carry it forward again.
    let autoGraded = question.kind === "mcq";

    if (question.kind === "mcq") {
      const marked = markMcq(question, userResponse, negativeMarkingPercent);
      isCorrect = marked.isCorrect;
      points = marked.points;
      if (isCorrect) correctCount++; else incorrectCount++;
    } else if (question.kind === "theory" || question.kind === "coding") {
      const judged = question.kind === "coding"
        ? priorAutoGraded.get(question._id.toString())
        : null;

      if (judged) {
        // Already graded by Judge0 — keep that score.
        points = judged.points || 0;
        isCorrect = Boolean(judged.isCorrect);
        autoGraded = true;
        if (isCorrect) correctCount++; else incorrectCount++;
      } else {
        // Mentor grades this by hand.
        points = 0;
        isCorrect = false;
      }
    }

    totalScore += points;

    processedResponses.push({
      questionId: question._id,
      selectedOption: userResponse.selectedOption ?? null,
      textAnswer: userResponse.textAnswer ?? null,
      language: userResponse.language || null,
      isCorrect,
      points,
      autoGraded,
      geminiFeedback: null,
      correctAnswer: null, // Answers only visible to mentors
      errorAnalysis: null,
      improvementSteps: [],
      topicRecommendations: []
    });
  }

  return { processedResponses, totalScore, maxScore, correctCount, incorrectCount, notAnsweredCount };
}

module.exports = { gradeSubmission };
