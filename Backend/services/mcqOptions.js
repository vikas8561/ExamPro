/**
 * Whether an MCQ's options and answer can be saved.
 *
 * The answer is stored as an option's TEXT and graded by exact comparison (see
 * services/grading.js), so the text has to pick out exactly one option. Two
 * options reading the same made both "correct" and both "the student's
 * choice" on the review page; an answer matching no option -- left behind when
 * the correct option's text was edited -- marked every student wrong.
 *
 *   - every option needs text;
 *   - no two options may read the same. Options differing only in spacing look
 *     identical to a student, so they count as the same; options differing in
 *     case ("hello", "Hello", "HELLO") are different answers and are allowed;
 *   - the answer must be, character for character, one of the options.
 *
 * mcqOptionsError() is a copy of the same function in
 * Frontend/src/utils/mcqOption.js, which checks the editor and JSON upload
 * before they get here -- the two deploy separately.
 */
function mcqOptionsError(options, answer) {
  const texts = (Array.isArray(options) ? options : []).map((option) =>
    typeof option === "string" ? option : option?.text
  );
  if (texts.length < 2) return "needs at least 2 options";

  const letter = (index) => String.fromCharCode(65 + index);
  const blank = texts.findIndex((text) => typeof text !== "string" || text.trim() === "");
  if (blank !== -1) return `option ${letter(blank)} is empty`;

  const seen = new Map();
  for (let index = 0; index < texts.length; index++) {
    const key = texts[index].trim();
    if (seen.has(key)) {
      return `options ${letter(seen.get(key))} and ${letter(index)} are the same ("${key}") -- every option must be different`;
    }
    seen.set(key, index);
  }

  if (typeof answer !== "string" || answer === "") return "no correct answer is selected";
  if (!texts.includes(answer)) return "the correct answer does not exactly match any option";
  return null;
}

/** The first MCQ in a questions payload that cannot be saved, as a message. */
function mcqQuestionsError(questions) {
  if (!Array.isArray(questions)) return null;
  for (let index = 0; index < questions.length; index++) {
    const question = questions[index];
    if (question?.kind !== "mcq") continue;
    const error = mcqOptionsError(question.options, question.answer);
    if (error) return `Question ${index + 1}: ${error}`;
  }
  return null;
}

module.exports = { mcqOptionsError, mcqQuestionsError };
