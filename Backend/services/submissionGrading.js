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

const { maxMarksForQuestion, isAnswered, markMcq, canonicalOption } = require("./grading");

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

    // A coding answer Judge0 has already graded.
    //
    // The grade stands, whatever the editor holds at hand-in, and it is stored
    // with the code that EARNED it. The editor's contents at hand-in are kept
    // too, as `draftAnswer`, so a mentor sees both: what was marked, and what the
    // student was last working on. This is the rule autosave already follows
    // (routes/answers.js) -- a graded answer's source is frozen and later
    // editing goes to the draft -- and hand-in used to break it two ways:
    //
    //   - a non-blank hand-in replaced the graded source with the editor's
    //     contents, so the marks sat next to code that never earned them;
    //   - a blank hand-in counted as unanswered and dropped the earned grade to
    //     zero.
    //
    // It also used to drop how many hidden cases had passed, which the review
    // needs to show how much of the problem was solved.
    //
    // The editor's contents come from `textAnswer` on a hand-in (what the exam
    // page sends) and from `draftAnswer` when the expiry sweep regrades the
    // stored rows, where `textAnswer` is already the graded source.
    const earned = question.kind === "coding"
      ? priorAutoGraded.get(question._id.toString())
      : null;

    if (earned) {
      const points = earned.points || 0;
      const isCorrect = Boolean(earned.isCorrect);
      if (isCorrect) correctCount++; else incorrectCount++;
      totalScore += points;

      const gradedSource = earned.textAnswer ?? null;
      const latestDraft = [userResponse?.draftAnswer, userResponse?.textAnswer]
        .find((text) => typeof text === "string" && text.trim() !== "");
      // Only a draft that differs from what was graded is worth showing.
      const draftAnswer = latestDraft !== undefined && latestDraft !== gradedSource ? latestDraft : null;

      processedResponses.push({
        questionId: question._id,
        selectedOption: null,
        textAnswer: gradedSource,
        draftAnswer,
        // The graded code's language. The editor may have been switched since.
        language: earned.language || userResponse?.language || null,
        isCorrect,
        points,
        autoGraded: true,
        passedCount: earned.passedCount ?? null,
        totalHidden: earned.totalHidden ?? null,
        runtimeMs: earned.runtimeMs ?? null,
        memoryKb: earned.memoryKb ?? null,
        geminiFeedback: null,
        correctAnswer: null,
        errorAnalysis: null,
        improvementSteps: [],
        topicRecommendations: []
      });
      continue;
    }

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
    // repeat submit can carry it forward again. A Judge0-graded coding answer
    // never reaches here -- it is handled above.
    const autoGraded = question.kind === "mcq";

    if (question.kind === "mcq") {
      const marked = markMcq(question, userResponse, negativeMarkingPercent);
      isCorrect = marked.isCorrect;
      points = marked.points;
      if (isCorrect) correctCount++; else incorrectCount++;
    }
    // Theory, and coding that was never run through Judge0, score 0 here and
    // are marked by hand.

    totalScore += points;

    processedResponses.push({
      questionId: question._id,
      // Stored as the option it refers to, so the review page highlights the
      // right one even for an answer the old autosave stripped.
      selectedOption: question.kind === "mcq"
        ? canonicalOption(question, userResponse.selectedOption) ?? null
        : userResponse.selectedOption ?? null,
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
