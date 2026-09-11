/**
 * Strip everything from a question that would give away the answer.
 *
 * This exists because the same stripping was written by hand in three separate
 * routes and each one got it slightly wrong:
 *
 *   - GET /api/tests/:id       removed answer/answers/hiddenTestCases but
 *                              forgot expectedAnswer, so a student could read
 *                              the model answer for every theory question.
 *   - GET /api/assignments/:id tried to strip by re-assigning onto a Mongoose
 *                              document, which silently casts the plain objects
 *                              back into full subdocuments — so nothing was
 *                              stripped at all, and answers, model answers and
 *                              hidden test cases were all served to students.
 *   - the submission view      leaked the lot whenever results were unlocked.
 *
 * One function, used everywhere, so a new secret field only has to be added to
 * one list. Always returns plain objects — never Mongoose documents, which is
 * what made the second bug possible.
 */

/** Fields that must never reach a student while a test is in progress. */
const SECRET_QUESTION_FIELDS = ["answer", "answers", "expectedAnswer", "hiddenTestCases"];

/**
 * Sanitize one question.
 *
 * Students still get what they legitimately need in order to answer: how many
 * hidden test cases exist and what the question is worth, just not what those
 * cases contain.
 */
function sanitizeQuestion(question) {
  if (!question) return question;

  const plain = typeof question.toObject === "function" ? question.toObject() : { ...question };

  const hiddenTestCases = Array.isArray(plain.hiddenTestCases) ? plain.hiddenTestCases : [];

  for (const field of SECRET_QUESTION_FIELDS) {
    delete plain[field];
  }

  plain.hiddenTestCaseCount = hiddenTestCases.length;
  plain.totalMarks = hiddenTestCases.reduce((sum, testCase) => sum + (testCase.marks || 0), 0);

  return plain;
}

function sanitizeQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  return questions.map(sanitizeQuestion);
}

/**
 * Should this request be allowed to see answers at all?
 *
 * Only admins and mentors, and only by their actual role — never inferred from
 * whether an assignment happens to have a mentor attached to it. That inference
 * was the bug that let any logged-in student read the answers mid-exam.
 */
function canSeeAnswers(user) {
  const role = String(user?.role || "").toLowerCase();
  return role === "admin" || role === "mentor";
}

module.exports = {
  SECRET_QUESTION_FIELDS,
  sanitizeQuestion,
  sanitizeQuestions,
  canSeeAnswers,
};
