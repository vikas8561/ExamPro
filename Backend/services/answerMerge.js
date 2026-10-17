/**
 * What a hand-in is graded on: the page's answers, backed by the saved ones.
 *
 * POST /api/test-submissions used to grade the answers in the request and
 * nothing else, replacing everything autosave had stored. Whatever the page
 * held at that moment became the paper. A page that came back blank -- signed
 * out and back in, a restore that failed, a reload mid-load -- held nothing,
 * and pressing Submit on it wiped every answer the server had kept.
 *
 * Now each question takes the page's answer when the page has one, and the
 * saved answer when the page is blank. The page still wins whenever it says
 * something: it holds the student's latest edits, including any whose autosave
 * never landed.
 *
 * The cost is one case: a student who blanks out an answer and hands in before
 * the autosave of that blank arrives keeps the earlier answer. Autosave sends
 * the blank within a second of the edit (routes/answers.js stores it, and then
 * there is nothing saved to fall back to), so in practice that case does not
 * arise. Losing a whole paper was what did.
 */

const { isAnswered } = require("./grading");

/**
 * The saved row as an answer. For a Judge0-graded coding answer, `textAnswer`
 * is the graded source and the student's later editing lives in `draftAnswer`,
 * which is the latest thing they wrote.
 */
function savedAsAnswer(saved) {
  return {
    questionId: String(saved.questionId),
    selectedOption: saved.selectedOption ?? undefined,
    textAnswer: saved.draftAnswer || saved.textAnswer || undefined,
    language: saved.language || undefined,
  };
}

/**
 * @param {Array} given  the responses in the hand-in request
 * @param {Array} saved  the responses autosave stored for this attempt
 * @returns {{ responses: Array, fromSaved: string[] }} the merged responses, and
 *          the question ids whose answer came from the saved copy
 */
function mergeWithSaved(given, saved) {
  const merged = new Map();
  for (const response of Array.isArray(given) ? given : []) {
    if (response && response.questionId) merged.set(String(response.questionId), response);
  }

  const fromSaved = [];
  for (const row of Array.isArray(saved) ? saved : []) {
    if (!row || !row.questionId) continue;
    const fallback = savedAsAnswer(row);
    if (!isAnswered(fallback)) continue;

    const id = fallback.questionId;
    const current = merged.get(id);
    if (isAnswered(current)) continue;

    merged.set(id, {
      ...fallback,
      // A coding answer's language: the page's choice when it sent one.
      language: current?.language || fallback.language,
    });
    fromSaved.push(id);
  }

  return { responses: [...merged.values()], fromSaved };
}

module.exports = { mergeWithSaved };
