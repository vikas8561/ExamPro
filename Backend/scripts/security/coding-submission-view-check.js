/**
 * What a coding submission tells the student — pinned down.
 *
 * The rule: a student may learn HOW MUCH of the problem they have solved, and
 * never WHICH hidden case failed or WHY. Hidden cases are the marking scheme.
 * Handing them back one failure at a time turns an exam into a search for the
 * answer, and it does so most effectively for the students who understand the
 * problem least.
 *
 * This is checked rather than merely commented because the failure is silent
 * and invisible from the interface. The submission panel showed no per-case
 * detail, yet the payload behind it carried an array with a status for every
 * hidden case, a runtime and a memory figure — all one network-tab away from a
 * student who, in a coding exam, is by definition sitting in front of a code
 * editor. A future change that spreads the internal result into the response
 * would reintroduce exactly that, look completely reasonable in review, and
 * show nothing on screen.
 *
 * So the key set is asserted exactly: adding a field has to be a decision
 * somebody makes on purpose, in this file, rather than a spread operator.
 *
 * Pure unit checks: no server, no database, no judge.
 */

const { studentSubmissionView, previousIsBetter } = require('../../services/codingSubmission');

let pass = 0,
  fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
};

// Everything the grading path computes internally, as it really looks.
const submittedAt = new Date('2026-09-26T10:42:18.000Z');
const internal = {
  verdict: { id: 4, description: 'Wrong Answer' },
  passedCount: 7,
  totalHidden: 10,
  language: 'cpp',
  compileOutput: null,
  submittedAt,

  // None of the following may reach the student.
  results: [
    { index: 0, passed: true, status: { id: 3, description: 'Accepted' } },
    { index: 7, passed: false, status: { id: 5, description: 'Time Limit Exceeded' } },
  ],
  runtimeMs: 3,
  memoryKb: 1126,
  points: 7,
  earnedMarks: 7,
  maxScore: 100,
  hiddenCases: [{ input: '5\n1 2 3 4 5', output: '15' }],
  stderr: 'Segmentation fault',
  expectedOutput: '15',
  sourceCode: 'int main(){}',
};

const view = studentSubmissionView(internal);
const keys = Object.keys(view).sort();

const ALLOWED = ['compileOutput', 'graded', 'language', 'passedCount', 'submittedAt', 'totalHidden', 'verdict'];

check(
  'the student view has exactly the allowed keys, no more and no fewer',
  JSON.stringify(keys) === JSON.stringify(ALLOWED),
  `got ${JSON.stringify(keys)}`
);

// Each leak, named, so a failure says which one came back.
for (const forbidden of [
  'results',
  'runtimeMs',
  'memoryKb',
  'points',
  'earnedMarks',
  'maxScore',
  'hiddenCases',
  'stderr',
  'expectedOutput',
  'sourceCode',
]) {
  check(`${forbidden} is not sent to the student`, !(forbidden in view));
}

// A spread would pass a naive key check on a trimmed fixture but not this one:
// nothing in the view may be an array or carry a nested status.
const serialized = JSON.stringify(view);
check(
  'no per-case array survives anywhere in the payload',
  !Array.isArray(view.results) && !serialized.includes('Time Limit Exceeded'),
  serialized
);
check(
  'no hidden test data survives anywhere in the payload',
  !serialized.includes('1 2 3 4 5') && !serialized.includes('Segmentation fault'),
  serialized
);

// The counts are the whole point of the screen and must come through.
check('the verdict is shown', view.verdict?.description === 'Wrong Answer');
check('the pass count is shown', view.passedCount === 7 && view.totalHidden === 10);
check('the language is shown', view.language === 'cpp');

// The receipt. Serialised from the server's clock, never the browser's.
check(
  'the submission time is sent as an ISO string from the server',
  view.submittedAt === '2026-09-26T10:42:18.000Z',
  String(view.submittedAt)
);
check(
  'a missing submission time comes back null rather than a broken date',
  studentSubmissionView({ ...internal, submittedAt: undefined }).submittedAt === null
);

// A compile error is the student's own source failing to build, before any test
// input exists. It reveals nothing about the hidden cases and withholding it
// would fail somebody for a missing semicolon they were never allowed to see.
check(
  'a compile error IS passed through',
  studentSubmissionView({ ...internal, compileOutput: "error: expected ';'" }).compileOutput ===
    "error: expected ';'"
);
check('an absent compile error is null, not undefined', view.compileOutput === null);

// ── Best-wins: which attempt counts ──────────────────────────────────────
//
// The rule is that a student keeps whichever attempt solved more of the
// problem, so resubmitting can only ever help. The comparison runs inside the
// update pipeline, so what is checked here is the expression it is built from:
// a plain JavaScript evaluator for the handful of aggregation operators used,
// applied to the same shapes MongoDB would see.

function evaluate(expr, vars) {
  if (expr === null || typeof expr !== 'object') return expr;
  if (Array.isArray(expr)) return expr.map((item) => evaluate(item, vars));
  if ('$literal' in expr) return expr.$literal;

  const [op, arg] = Object.entries(expr)[0];
  // A resolved document, not an expression -- `$$previous` becomes one of these.
  if (!op.startsWith('$')) return expr;
  const args = () => evaluate(arg, vars);

  switch (op) {
    case '$cond': {
      const [test, yes, no] = args();
      return test ? yes : no;
    }
    case '$and': return args().every(Boolean);
    case '$gt': { const [a, b] = args(); return a > b; }
    case '$eq': { const [a, b] = args(); return a === b; }
    case '$ne': { const [a, b] = args(); return a !== b; }
    case '$ifNull': { const [a, b] = args(); return a === null || a === undefined ? b : a; }
    default: throw new Error(`unhandled operator ${op}`);
  }
}

// Resolve "$$previous.passedCount" style paths against the supplied vars.
function resolve(expr, vars) {
  if (typeof expr === 'string' && expr.startsWith('$$')) {
    return expr.slice(2).split('.').reduce((value, key) => (value == null ? null : value[key]), vars);
  }
  if (Array.isArray(expr)) return expr.map((item) => resolve(item, vars));
  if (expr && typeof expr === 'object') {
    if ('$literal' in expr) return expr;
    return Object.fromEntries(Object.entries(expr).map(([k, v]) => [k, resolve(v, vars)]));
  }
  return expr;
}

const keepsPrevious = (previous, submitted) =>
  evaluate(resolve(previousIsBetter(submitted), { previous }), {});

const attempt = (passedCount, points) => ({ passedCount, points, textAnswer: 'src' });

check(
  'a worse resubmission does not replace a better attempt',
  keepsPrevious(attempt(10, 10), attempt(6, 6)) === true
);
check(
  'a better resubmission does replace a worse attempt',
  keepsPrevious(attempt(6, 6), attempt(10, 10)) === false
);
check(
  'an equal resubmission replaces the earlier one, so the stored code stays current',
  keepsPrevious(attempt(7, 7), attempt(7, 7)) === false
);
check(
  'the first submission for a question is always kept',
  keepsPrevious(undefined, attempt(0, 0)) === false
);
check(
  'a zero-scoring resubmission cannot wipe out a full mark',
  keepsPrevious(attempt(10, 10), attempt(0, 0)) === true
);

// Rows written before best-wins existed carry no passedCount. Falling back to
// marks is what stops the first resubmission after deploy discarding a mark
// the student already holds.
check(
  'a legacy row with no passedCount is compared on marks instead',
  keepsPrevious({ points: 10, textAnswer: 'src' }, attempt(6, 6)) === true
);
check(
  'and a legacy row is still beaten by a genuinely better attempt',
  keepsPrevious({ points: 6, textAnswer: 'src' }, attempt(10, 10)) === false
);

// ── What the student is told about which attempt counts ──────────────────

const worse = studentSubmissionView({
  ...internal,
  passedCount: 6,
  submittedAt: new Date('2026-09-26T11:00:00.000Z'),
  graded: { passedCount: 10, totalHidden: 10, submittedAt },
});
check(
  'a set-aside attempt reports the better one as the grade',
  worse.graded.passedCount === 10 && worse.graded.isThisAttempt === false,
  JSON.stringify(worse.graded)
);
check(
  'and still reports what this attempt itself scored',
  worse.passedCount === 6
);

const better = studentSubmissionView({
  ...internal,
  passedCount: 10,
  graded: { passedCount: 10, totalHidden: 10, submittedAt },
});
check(
  'a winning attempt is marked as the one being graded',
  better.graded.isThisAttempt === true,
  JSON.stringify(better.graded)
);

check(
  'with no read-back the view falls back to describing this attempt',
  studentSubmissionView({ ...internal, graded: null }).graded.passedCount === internal.passedCount
);

// The grade block must not become a second route for hidden test data.
check(
  'the graded block carries counts and a time, nothing else',
  JSON.stringify(Object.keys(worse.graded).sort()) ===
    JSON.stringify(['isThisAttempt', 'passedCount', 'submittedAt', 'totalHidden']),
  JSON.stringify(Object.keys(worse.graded))
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
