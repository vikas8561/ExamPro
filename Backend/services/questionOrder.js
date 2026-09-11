/**
 * Per-student question ordering.
 *
 * Every student assigned a test used to see the questions in the same order --
 * the array order of the embedded `Test.questions` -- which made it trivial to
 * share answers by position. When a test has `shuffleQuestions` on, each student
 * gets their own permutation instead.
 *
 * WHY THIS IS SAFE FOR MARKING
 *
 * Nothing in the persistence or grading path is positional. Responses are
 * matched to questions by `_id` everywhere:
 *
 *   - routes/testSubmissions.js  responses.find(r => r.questionId === question._id...)
 *   - services/scoreCalculation  test.questions.find(q => q._id... === response.questionId...)
 *   - routes/answers.js          responses.findIndex(r => r.questionId... === questionId)
 *
 * and the grader iterates the questions freshly loaded from the database in
 * canonical order, not the array that was sent to the browser. So the shuffled
 * order never reaches the grader at all. Reordering on the way out cannot
 * change a score.
 *
 * The order is therefore persisted for one reason only: stability. A student
 * who refreshes mid-exam must get the same paper back, not a new shuffle.
 *
 * Apply this AFTER sanitizeQuestions(), and never for admins or mentors -- they
 * author and review against the canonical order.
 */

const crypto = require("crypto");

/** Fisher-Yates, using the CSPRNG rather than Math.random. */
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function idOf(question) {
  return question && question._id ? question._id.toString() : null;
}

/**
 * Work out the order this student should see, reconciling whatever was stored
 * against the questions that actually exist on the test right now.
 *
 * The reconciliation is what keeps this robust when the test changes underneath
 * a live attempt: a question added, removed, or replaced wholesale by a bulk
 * re-upload. Rather than serve a broken or empty paper we keep the questions we
 * still recognise, in their established order, and shuffle whatever is new onto
 * the end. That covers every case with one rule:
 *
 *   first start          -> nothing stored, everything is "new"  -> full shuffle
 *   question removed     -> drops out of `kept`
 *   question added       -> appended
 *   every id replaced    -> `kept` is empty                      -> full reshuffle
 *
 * That last case used to be the common one, because saving an edit regenerated
 * every question id. It no longer does -- see the id-preserving branch in
 * PUT /api/tests/:id -- but the reconciliation stays, because a bulk re-upload
 * still replaces questions outright and an empty paper is never an acceptable
 * outcome mid-exam.
 */
function resolveOrderedQuestions({ test, assignment, questions }) {
  const list = Array.isArray(questions) ? questions : [];

  if (!test || !test.shuffleQuestions || list.length === 0) {
    return { questions: list, order: [], changed: false };
  }

  const byId = new Map();
  for (const question of list) {
    const id = idOf(question);
    if (id) byId.set(id, question);
  }

  const stored = (assignment && Array.isArray(assignment.questionOrder) ? assignment.questionOrder : [])
    .map((id) => id.toString());

  const seen = new Set();
  const kept = [];
  for (const id of stored) {
    if (byId.has(id) && !seen.has(id)) {
      seen.add(id);
      kept.push(id);
    }
  }

  const added = shuffle([...byId.keys()].filter((id) => !seen.has(id)));
  const order = [...kept, ...added];

  // Rebuild the paper in that order. Anything without a usable id (which the
  // schema should make impossible) is appended rather than silently dropped --
  // losing a question from a student's paper is far worse than a wrong order.
  const ordered = order.map((id) => byId.get(id));
  for (const question of list) {
    if (!idOf(question)) ordered.push(question);
  }

  const changed =
    order.length !== stored.length || order.some((id, index) => id !== stored[index]);

  return { questions: ordered, order, changed };
}

module.exports = {
  resolveOrderedQuestions,
};
