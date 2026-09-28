/**
 * What a coding question's test cases look like once they are stored.
 *
 * POST /tests and PUT /tests/:id each had their own copy of this rule:
 *
 *     tc && tc.input && tc.input.trim() && tc.output && tc.output.trim()
 *
 * which threw away any case whose input OR expected output was empty. Two
 * perfectly ordinary cases fell through that hole, silently, with no warning
 * to the author and no trace in the response:
 *
 *   - a question that reads nothing from stdin ("print Hello, World!"), and
 *   - a case whose correct answer IS empty output ("print nothing when there
 *     is no solution").
 *
 * Losing them shrinks what Submit grades against; losing all of them leaves a
 * question that answers every submission with "no hidden test cases to grade
 * against". The schema agreed with the bug -- `required: true` on a String
 * rejects "" in Mongoose -- so even a hand-written case could not be saved.
 *
 * The rule that filter was reaching for is narrower: drop the untouched blank
 * row the editor seeds a new coding question with (both fields empty), and
 * keep everything else. That is what this module does, in one place, for both
 * routes. Same reasoning as services/grading.js and services/questionSanitizer.js.
 */

const asText = (value) => (value === null || value === undefined ? '' : String(value));

/**
 * Line endings are normalised on the way in.
 *
 * services/judge0.js folds CRLF before it compares outputs and before it feeds
 * stdin to the program, so a Windows-authored case already grades correctly --
 * but the stored copy is what a mentor reads back in the editor and what the
 * student is shown as "Expected". Folding once here keeps all three views of
 * the same case byte-identical. Nothing else is touched: leading whitespace,
 * interior blank lines and a deliberate trailing newline are all part of the
 * expectation.
 */
const normalizeNewlines = (value) => asText(value).replace(/\r\n/g, '\n');

/** The blank row CreateTest seeds a new coding question with. */
function isBlankCase(testCase) {
  return normalizeNewlines(testCase.input).trim() === ''
    && normalizeNewlines(testCase.output).trim() === '';
}

/**
 * Clean one list of test cases.
 *
 * @param {Array}   list          raw cases off the request body
 * @param {object}  [options]
 * @param {boolean} [options.withMarks]  keep the `marks` field (hidden cases)
 */
function sanitizeTestCases(list, { withMarks = false } = {}) {
  if (!Array.isArray(list)) return [];

  return list
    .filter((testCase) => testCase && typeof testCase === 'object' && !isBlankCase(testCase))
    .map((testCase) => {
      const clean = {
        input: normalizeNewlines(testCase.input),
        output: normalizeNewlines(testCase.output),
      };
      if (withMarks) {
        const marks = Number(testCase.marks);
        clean.marks = Number.isFinite(marks) && marks >= 0 ? marks : 1;
      }
      return clean;
    });
}

/** Clean both lists on one coding question, leaving every other field alone. */
function sanitizeCodingQuestion(question) {
  return {
    ...question,
    visibleTestCases: sanitizeTestCases(question?.visibleTestCases, { withMarks: false }),
    hiddenTestCases: sanitizeTestCases(question?.hiddenTestCases, { withMarks: true }),
  };
}

module.exports = {
  sanitizeTestCases,
  sanitizeCodingQuestion,
  normalizeNewlines,
};
