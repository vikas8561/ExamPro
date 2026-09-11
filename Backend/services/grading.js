/**
 * The marking rules, in one place.
 *
 * These three questions -- what is a question worth, did the student answer it,
 * and is an MCQ answer right -- were each answered independently in
 * routes/testSubmissions.js (on submit) and services/scoreCalculation.js (on
 * re-grade after a test edit). The two answers disagreed, and because a test
 * edit used to orphan every response by regenerating question ids, the
 * disagreement was invisible: the re-grade matched nothing, so it changed
 * nothing. Once ids survive an edit the re-grade actually runs, and the
 * divergence turns into corrupted scores:
 *
 *   - an unanswered MCQ was treated as a wrong answer and given the negative
 *     marking penalty, so students lost marks for questions they never touched;
 *   - a coding question's worth silently fell back from the sum of its hidden
 *     test case marks to its `points` field, which could drop maxScore BELOW
 *     the score already awarded (observed: a submission re-graded to 10 out of 8);
 *   - a coding answer graded by Judge0 had `autoGraded` flipped to false, which
 *     stopped the score being carried forward on a resubmit.
 *
 * Both callers now share this module, so a rule can only be changed in one
 * place. Same reasoning as services/questionSanitizer.js.
 */

/**
 * What a question is worth.
 *
 * Coding questions are scored from their hidden test cases -- that is what
 * /api/coding/submit awards -- and fall back to `points` only when no hidden
 * case carries any marks.
 */
function maxMarksForQuestion(question) {
  if (!question) return 0;

  if (question.kind === "coding") {
    const codingMarks = (question.hiddenTestCases || [])
      .reduce((sum, testCase) => sum + (testCase.marks || 0), 0);
    if (codingMarks > 0) return codingMarks;
  }

  // `?? 1` rather than `|| 1`, so a deliberately zero-point question stays zero.
  return Number(question.points ?? 1);
}

/** The whole paper's worth. */
function maxScoreForTest(questions) {
  return (questions || []).reduce((sum, question) => sum + maxMarksForQuestion(question), 0);
}

/**
 * Did the student actually answer?
 *
 * A blank is not a wrong answer: it scores zero and must never attract the
 * negative marking penalty. Empty and whitespace-only strings count as blank,
 * which the submit path's original check missed.
 */
function isAnswered(response) {
  if (!response) return false;

  const { selectedOption, textAnswer } = response;
  if (typeof selectedOption === "string" && selectedOption.trim() !== "") return true;
  if (typeof textAnswer === "string" && textAnswer.trim() !== "") return true;
  return false;
}

/**
 * Mark one answered MCQ.
 *
 * Correct answers are stored as the option's text, not its index, which is what
 * makes shuffling safe -- see services/questionOrder.js. Only call this for a
 * response that isAnswered(); a blank scores zero with no penalty.
 */
function markMcq(question, response, negativeMarkingPercent) {
  const isCorrect = response.selectedOption === question.answer;
  const worth = maxMarksForQuestion(question);

  if (isCorrect) return { isCorrect: true, points: worth };

  const penalty = Number(negativeMarkingPercent) || 0;
  return { isCorrect: false, points: penalty > 0 ? -(worth * penalty) : 0 };
}

module.exports = {
  maxMarksForQuestion,
  maxScoreForTest,
  isAnswered,
  markMcq,
};
