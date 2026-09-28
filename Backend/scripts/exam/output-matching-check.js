/**
 * Verification: the rule that decides whether a student's output is correct.
 *
 * Judge0 decides Accepted vs Wrong Answer in app/jobs/isolate_job.rb:
 *
 *     def strip(text)
 *       return nil unless text
 *       text.split("\n").collect(&:rstrip).join("\n").rstrip
 *     end
 *
 *     elsif submission.expected_output.nil? ||
 *           strip(submission.expected_output) == strip(submission.stdout)
 *       return Status.ac
 *
 * services/judge0.js has to agree with that exactly, because a coding answer
 * only passes when BOTH the judge and our own comparison say so. It did not:
 * `/\s+$/` has no `m` flag in JavaScript, so the old rule stripped trailing
 * whitespace from the end of the whole output while Judge0 strips it from
 * every line. Output like "1 2 3 \n4 5 6 \n" -- an ordinary
 * `print(x, end=' ')` loop -- was Accepted by the judge and recorded as failed
 * here, next to an "Expected" panel that looked identical to what the student
 * printed. On submit that came straight off the score.
 *
 * Case 4 is the centrepiece: every pair of short strings is fed through both
 * rules and they must agree on every single one.
 *
 * Runs offline. No database, no Judge0, no API.
 */

const {
  normalizeOutput,
  normalizeInput,
} = require('../../services/judge0');

let passed = 0, failed = 0;
const pass = (label) => { passed++; console.log(`  PASS  ${label}`); };
const fail = (label, detail) => { failed++; console.log(`  FAIL  ${label}\n        ${detail}`); };
const check = (cond, label, detail) => (cond ? pass(label) : fail(label, detail));

// --- Judge0's rule, transcribed from Ruby --------------------------------
// Ruby's String#rstrip removes " \t\r\n\f\v\0" and nothing else. `nil` and ""
// are different values here, which is the whole point of case 3.
const rubyRstrip = (s) => s.replace(/[ \t\r\n\f\v\0]+$/, '');
const judge0Strip = (text) => (text === null || text === undefined
  ? null
  : rubyRstrip(text.split('\n').map(rubyRstrip).join('\n')));

/**
 * What Judge0 would return for one case, including the two details that bite:
 * an empty program output is stored as NULL, and the expectation we send has
 * already been normalised by us.
 */
function judge0Verdict(stdout, expectedSentToJudge) {
  const storedStdout = stdout === '' ? null : stdout;
  if (expectedSentToJudge === undefined) return 'Accepted';    // no expectation sent
  return judge0Strip(expectedSentToJudge) === judge0Strip(storedStdout) ? 'Accepted' : 'Wrong Answer';
}

console.log('\n1. Output that Judge0 accepts must not be recorded as failed');
[
  ['trailing space on every line', '1 2 3 \n4 5 6 \n', '1 2 3\n4 5 6'],
  ['expected authored with trailing spaces', '1 2 3\n4 5 6', '1 2 3 \n4 5 6 '],
  ['trailing tab on an interior line', 'YES\t\nNO\n', 'YES\nNO'],
  ['a "blank" line that contains a space', 'a\n \nb\n', 'a\n\nb'],
  ['expected output authored on Windows', 'a\nb', 'a\r\nb\r\n'],
].forEach(([label, stdout, expected]) => {
  check(normalizeOutput(stdout) === normalizeOutput(expected), label,
    `${JSON.stringify(normalizeOutput(stdout))} !== ${JSON.stringify(normalizeOutput(expected))}`);
});

console.log('\n2. Genuinely different output must still fail');
[
  ['different values', '1 2 3', '1 2 4'],
  ['leading whitespace is significant', ' a', 'a'],
  ['a missing interior blank line', 'a\nb', 'a\n\nb'],
  ['output when none was expected', 'oops', ''],
  ['no output when some was expected', '', 'Hello'],
].forEach(([label, stdout, expected]) => {
  check(normalizeOutput(stdout) !== normalizeOutput(expected), label,
    'these normalised to the same value, so a wrong answer would pass');
});

console.log('\n3. An expectation of NO output is never sent to Judge0');
// Judge0 stores empty output as nil and compares `"" == nil`, which is false,
// so such a case could never be Accepted however correct the submission.
check(judge0Verdict('', '') === 'Wrong Answer',
  'Judge0 would mark a correct empty-output answer Wrong Answer',
  'the premise no longer holds — re-check isolate_job.rb before simplifying buildSubmission');
check(judge0Verdict('', undefined) === 'Accepted',
  'withholding the expectation lets a clean run be Accepted',
  'Judge0 should accept any clean run when no expectation is sent');
check(normalizeOutput('') === normalizeOutput('') && normalizeOutput('x') !== normalizeOutput(''),
  'our own comparison is what decides an empty expectation',
  'normalizeOutput must distinguish "printed nothing" from "printed something"');

console.log('\n4. Our rule and Judge0\'s rule agree on every pair of short strings');
{
  const alpha = ['a', 'b', ' ', '\t', '\n'];
  const strings = [''];
  for (let len = 1; len <= 4; len += 1) {
    for (const s of strings.filter((x) => x.length === len - 1)) {
      for (const c of alpha) strings.push(s + c);
    }
  }

  let compared = 0, disagreements = 0, withheld = 0, withheldWrong = 0;
  let example = null;
  for (const stdout of strings) {
    for (const expected of strings) {
      // What buildSubmission actually sends: an empty expectation is withheld.
      const sent = normalizeOutput(expected) || undefined;
      const judgeAccepted = judge0Verdict(stdout, sent) === 'Accepted';
      const weAgree = normalizeOutput(stdout) === normalizeOutput(expected);
      // toResult: passed = judge said Accepted AND our comparison agrees.
      const passedFlag = judgeAccepted && weAgree;

      if (sent === undefined) {
        // No expectation was sent, so the judge accepts any clean run and our
        // comparison is the only authority. It must still be the right answer.
        withheld += 1;
        if (passedFlag !== weAgree) withheldWrong += 1;
        continue;
      }

      // An expectation WAS sent, so both rules gate the verdict and they must
      // never disagree: a judge Accept that we reject is a correct answer
      // marked wrong, which is exactly the bug this file exists to catch.
      compared += 1;
      if (judgeAccepted !== weAgree) {
        disagreements += 1;
        example = example || { stdout, expected };
      }
    }
  }

  check(disagreements === 0,
    `${compared} judged pairs, our rule and Judge0's agree on all of them`,
    `${disagreements} disagreements, e.g. ${JSON.stringify(example)}`);
  check(withheldWrong === 0,
    `${withheld} withheld-expectation pairs decided correctly by our rule alone`,
    `${withheldWrong} were scored against the wrong answer`);
}

console.log('\n5. Test case input reaches the program with Unix line endings');
check(normalizeInput('3\r\n1 2 3\r\n') === '3\n1 2 3\n',
  'CRLF in an authored input is folded',
  'a stray \\r reaches getline / Scanner.nextLine / readline and breaks parsing');
check(normalizeInput('3\n1 2 3\n') === '3\n1 2 3\n',
  'input that is already LF is untouched', 'normalizeInput must be idempotent');
check(normalizeInput('a b') === 'a b',
  'no trailing newline is invented',
  'adding one would put a line in the input the author did not write');
check(normalizeInput(null) === '' && normalizeInput(undefined) === '',
  'a missing input is empty, not "null"', 'null leaked into the program stdin');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
