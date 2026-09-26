'use strict';

const express = require('express');
const mongoose = require('mongoose');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();

const { authenticateToken, requireRole } = require('../middleware/auth');
const Test = require('../models/Test');
const Assignment = require('../models/Assignment');
const TestSubmission = require('../models/TestSubmission');
const {
  runAgainstCases,
  infrastructureFailures,
  getSupportedLanguages,
  checkHealth,
  Judge0Error,
  STATUS,
} = require('../services/judge0');
const { LANGUAGES, normalizeLanguageKey, LANGUAGE_KEYS } = require('../configs/languages');
const { maxScoreForTest, marksPerTestCase, codingMarksEarned } = require('../services/grading');
const {
  persistCodingResponse,
  readGradedAttempt,
  studentSubmissionView,
} = require('../services/codingSubmission');

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// Code execution is by far the most expensive thing a student can trigger, so
// it is limited per user (not per IP — a whole campus shares one public IP).
const executionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.JUDGE0_RATE_LIMIT_PER_MINUTE) || 30,
  // These routes are all behind authenticateToken, so a user id is always
  // present; ipKeyGenerator is the IPv6-safe fallback the library requires.
  keyGenerator: (req) => (req.user?.userId ? `user:${req.user.userId}` : ipKeyGenerator(req.ip)),
  message: { message: 'You are running code too quickly. Please wait a moment and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Map a Judge0Error onto a sensible HTTP status. */
function sendJudgeError(res, error, fallbackMessage) {
  if (error instanceof Judge0Error) {
    const isClientFault = /Unsupported language|not available|Source code is empty/.test(error.message);
    if (isClientFault) return res.status(400).json({ message: error.message });
    console.error(`❌ Judge0 unavailable: ${error.message}`);
    // `ungraded` errors carry a student-safe message that says the submission
    // was not scored — worth more than the generic text, so pass it through.
    return res.status(503).json({
      message: error.ungraded
        ? error.message
        : 'The code execution service is temporarily unavailable. Please try again in a moment.',
      ungraded: Boolean(error.ungraded),
      retryable: true,
    });
  }
  console.error(`❌ ${fallbackMessage}:`, error.message);
  return res.status(500).json({ message: fallbackMessage });
}

/**
 * Resolve the coding question the caller is asking about and prove they are
 * allowed to run code against it. Returns { assignment, test, question } or
 * responds and returns null.
 */
async function loadOwnedQuestion(req, res, { assignmentId, testId, questionId }) {
  if (!questionId || !OBJECT_ID.test(questionId)) {
    res.status(400).json({ message: 'A valid questionId is required' });
    return null;
  }
  if (assignmentId && !OBJECT_ID.test(assignmentId)) {
    res.status(400).json({ message: 'Invalid assignmentId format' });
    return null;
  }
  if (testId && !OBJECT_ID.test(testId)) {
    res.status(400).json({ message: 'Invalid testId format' });
    return null;
  }

  let assignment = null;
  if (assignmentId) {
    assignment = await Assignment.findById(assignmentId).populate('testId');
  } else if (testId) {
    // The editor may only know the test; find this user's assignment for it.
    assignment = await Assignment.findOne({ testId, userId: req.user.userId }).populate('testId');
  }

  if (!assignment) {
    res.status(404).json({ message: 'Assignment not found for this test' });
    return null;
  }

  // Ownership: a student may only execute code against their own assignment.
  // Mentors and admins may run against any assignment (for review/debugging).
  const role = String(req.user?.role || '').toLowerCase();
  const isPrivileged = role === 'admin' || role === 'mentor';
  if (!isPrivileged && assignment.userId.toString() !== String(req.user.userId)) {
    res.status(403).json({ message: 'Access denied. This assignment does not belong to you.' });
    return null;
  }

  const test = assignment.testId;
  if (!test) {
    res.status(404).json({ message: 'Test not found for this assignment' });
    return null;
  }

  const question = test.questions?.id ? test.questions.id(questionId) : null;
  if (!question) {
    res.status(404).json({ message: 'Question not found in this test' });
    return null;
  }
  if (question.kind !== 'coding') {
    res.status(400).json({ message: 'This question is not a coding question' });
    return null;
  }

  return { assignment, test, question };
}

/** Pick and validate the language: student's choice, else the question default. */
function resolveRequestedLanguage(requested, question, res) {
  const key = normalizeLanguageKey(requested) || normalizeLanguageKey(question.language);
  if (!key) {
    res.status(400).json({
      message: `A supported language is required. Supported: ${LANGUAGE_KEYS.join(', ')}`,
    });
    return null;
  }
  return key;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

// Languages this deployment can actually execute — drives the editor's picker
// and boilerplate, so the UI can never offer something the judge cannot run.
router.get('/languages', authenticateToken, async (req, res) => {
  try {
    const languages = await getSupportedLanguages();
    res.json({ languages });
  } catch (error) {
    sendJudgeError(res, error, 'Failed to load supported languages');
  }
});

// Judge0 connectivity probe. Admins get the full diagnostic payload.
router.get('/health', authenticateToken, async (req, res) => {
  const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';
  const health = await checkHealth({ refresh: isAdmin && req.query.refresh === 'true' });

  if (!isAdmin) {
    return res.status(health.ok ? 200 : 503).json({ ok: health.ok });
  }
  return res.status(health.ok ? 200 : 503).json(health);
});

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Run code against the question's VISIBLE test cases, plus an optional custom
 * input supplied by the student. Nothing is persisted.
 */
router.post('/run', authenticateToken, executionLimiter, async (req, res) => {
  try {
    const { assignmentId, testId, questionId, sourceCode, language, customInput } = req.body || {};

    if (!sourceCode || !String(sourceCode).trim()) {
      return res.status(400).json({ message: 'sourceCode is required' });
    }

    const owned = await loadOwnedQuestion(req, res, { assignmentId, testId, questionId });
    if (!owned) return undefined;

    const languageKey = resolveRequestedLanguage(language, owned.question, res);
    if (!languageKey) return undefined;

    const cases = (owned.question.visibleTestCases || []).map((testCase) => ({
      input: testCase.input,
      output: testCase.output,
      marks: 0,
    }));

    // A custom case has no expected output — we just show whatever it prints.
    const hasCustomInput = typeof customInput === 'string' && customInput.length > 0;
    if (hasCustomInput) cases.push({ input: customInput, output: null, marks: 0 });

    // `total` is the number of cases that were checked against an expectation
    // — the custom case is not one of them. With no visible cases that is 0,
    // and "0 of 0 passed" must not be read as success: the page used to render
    // a green "Accepted" for a question that had no sample cases to run at all.
    if (cases.length === 0) {
      return res.json({
        results: [],
        passed: 0,
        total: 0,
        customResult: null,
        language: languageKey,
        message: 'No visible test cases available',
      });
    }

    const results = await runAgainstCases({ sourceCode, language: languageKey, cases });

    // Nothing is persisted here, but showing an outage as a failed test case
    // would still tell the student their working code is wrong.
    if (infrastructureFailures(results).length) {
      throw new Judge0Error('The code execution service is unreachable.', { retryable: true });
    }

    // The custom case is reported separately so it never skews the pass count.
    const customResult = hasCustomInput ? results.pop() : null;
    const passed = results.filter((result) => result.passed).length;

    return res.json({
      results,
      passed,
      total: results.length,
      customResult: customResult ? { ...customResult, isCustom: true } : null,
      language: languageKey,
      ...(results.length === 0 ? { message: 'No visible test cases available' } : {}),
    });
  } catch (error) {
    return sendJudgeError(res, error, 'Code execution failed');
  }
});

/**
 * Grade one question against its HIDDEN test cases and persist the score.
 *
 * `onProgress` receives real progress from Judge0 (how many test cases have
 * actually finished), so the caller can stream it.
 *
 * The payload deliberately omits hidden inputs, expected outputs, program
 * stdout and the marks: the score is stored, never shown during the test.
 */
async function gradeHiddenCases({ owned, languageKey, sourceCode, onProgress }) {
  const { assignment, test, question } = owned;

  // Every hidden case is worth the same share of the question's marks, so the
  // authored per-case `marks` is not used for scoring any more.
  const perCase = marksPerTestCase(question);
  const hiddenCases = (question.hiddenTestCases || []).map((testCase) => ({
    input: testCase.input,
    output: testCase.output,
    marks: perCase,
  }));

  if (hiddenCases.length === 0) {
    const error = new Error('This question has no hidden test cases to grade against');
    error.statusCode = 400;
    throw error;
  }

  const results = await runAgainstCases({
    sourceCode,
    language: languageKey,
    cases: hiddenCases,
    onProgress,
  });

  // If any hidden case never ran, this submission is UNGRADED. Scoring it would
  // record a zero that is indistinguishable from a wrong answer, so refuse:
  // persist nothing and let the student retry once the judge is back.
  const ungraded = infrastructureFailures(results);
  if (ungraded.length) {
    console.error(
      `\u274c UNGRADED coding submission — judge unreachable. ` +
      `user=${assignment.userId} assignment=${assignment._id} question=${question._id} ` +
      `language=${languageKey} cases=${ungraded.length}/${results.length} ` +
      `reason="${ungraded[0].message}". No score was written.`
    );
    const error = new Judge0Error(
      'Grading could not be completed because the code execution service is unreachable. ' +
      'Your submission was not scored — please try again.',
      { retryable: true }
    );
    // Distinguishes "we refused to score this" from a generic judge outage, and
    // marks the message as safe to show verbatim (no internal host names).
    error.ungraded = true;
    throw error;
  }

  const passedCount = results.filter((result) => result.passed).length;
  // Divided once, at the end: all cases passing awards exactly `points`.
  const earnedMarks = codingMarksEarned(question, passedCount);
  const compileError = results.find((result) => result.status.id === STATUS.COMPILATION_ERROR);

  const numeric = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const runtimes = results.map((r) => numeric(r.time)).filter((v) => v !== null);
  const memories = results.map((r) => numeric(r.memory)).filter((v) => v !== null);
  const runtimeMs = runtimes.length ? Math.round(Math.max(...runtimes) * 1000) : null;
  const memoryKb = memories.length ? Math.max(...memories) : null;

  const firstFailure = results.find((result) => !result.passed);
  // toResult never labels a failed case "Accepted", so the first failure's
  // status is a verdict the student can be shown as-is. STATUS.ACCEPTED rather
  // than a bare 3, so the id can only ever mean one thing.
  const verdict = firstFailure
    ? firstFailure.status
    : { id: STATUS.ACCEPTED, description: 'Accepted' };
  const accepted = !firstFailure;

  // One instant, taken once: the same value is stored and handed back, so the
  // receipt a student is looking at cannot drift from the record a mentor sees.
  // The server's clock, never the browser's -- the browser's belongs to the
  // student and can be set to anything.
  const submittedAt = new Date();

  const response = {
    questionId: String(question._id),
    selectedOption: null,
    textAnswer: sourceCode,
    language: languageKey,
    isCorrect: accepted,
    points: earnedMarks,
    autoGraded: true,
    geminiFeedback: null,
    correctAnswer: null,
    errorAnalysis: null,
    improvementSteps: [],
    topicRecommendations: [],
    runtimeMs,
    memoryKb,
    submittedAt,
    passedCount,
    totalHidden: hiddenCases.length,
  };

  // Same rule the submit and re-grade paths use, so maxScore can never land
  // below a score already awarded.
  const maxScore = maxScoreForTest(test.questions);

  await persistCodingResponse({ assignment, test, response, maxScore, earnedMarks });

  // Which attempt actually counts now. Best-wins means this submission may have
  // been set aside in favour of a better earlier one, and the student has to be
  // told that rather than left to read a lower number as their grade.
  const graded = await readGradedAttempt({ assignment, questionId: question._id });

  // The allowlist lives in services/codingSubmission.js, where a test asserts
  // its exact key set. Everything this function computed that is not in that
  // list -- the per-case results, the statuses, the runtime, the memory -- is
  // stored and never sent.
  return studentSubmissionView({
    verdict,
    passedCount,
    totalHidden: hiddenCases.length,
    language: languageKey,
    compileOutput: compileError ? compileError.compileOutput : null,
    submittedAt,
    graded,
  });
}

router.post('/submit', authenticateToken, executionLimiter, async (req, res) => {
  const wantsStream = req.query.stream === '1';

  try {
    const { assignmentId, testId, questionId, sourceCode, language } = req.body || {};

    if (!sourceCode || !String(sourceCode).trim()) {
      return res.status(400).json({ message: 'sourceCode is required' });
    }

    const owned = await loadOwnedQuestion(req, res, { assignmentId, testId, questionId });
    if (!owned) return undefined;

    const languageKey = resolveRequestedLanguage(language, owned.question, res);
    if (!languageKey) return undefined;

    // ---- plain JSON transport -------------------------------------------
    if (!wantsStream) {
      const payload = await gradeHiddenCases({ owned, languageKey, sourceCode });
      return res.json(payload);
    }

    // ---- server-sent events ---------------------------------------------
    // Grading can outlive the app's default 30s socket timeout, so clear it.
    req.setTimeout(0);
    res.setTimeout(0);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stops nginx and friends from buffering the stream.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    let closed = false;
    req.on('close', () => { closed = true; });

    const send = (event, data) => {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Nothing has reached the judge yet — say so rather than claiming to compile.
    send('progress', {
      phase: 'submitting',
      finished: 0,
      total: owned.question.hiddenTestCases?.length || 0,
    });

    try {
      const payload = await gradeHiddenCases({
        owned,
        languageKey,
        sourceCode,
        onProgress: (progress) => send('progress', progress),
      });
      send('result', payload);
    } catch (error) {
      send('failed', {
        message: error.ungraded
          ? error.message
          : error instanceof Judge0Error
            ? 'The code execution service is temporarily unavailable. Please try again in a moment.'
            : error.message || 'Code submission failed',
        // The client must not show a verdict when nothing was scored.
        ungraded: Boolean(error.ungraded),
        retryable: error instanceof Judge0Error,
      });
      console.error(`❌ Streaming submit failed: ${error.message}`);
    }

    if (!closed) res.end();
    return undefined;
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    if (res.headersSent) {
      res.end();
      return undefined;
    }
    return sendJudgeError(res, error, 'Code submission failed');
  }
});

/**
 * The runtime / memory distribution endpoint used to live here.
 *
 * It returned, for one question, a histogram of every accepted submission's
 * runtime and memory plus the share this student beat -- the chart shown after
 * submitting. Removed rather than hidden, because the leak was in the data and
 * not in the drawing of it:
 *
 *   - Aggregated over every student's submissions, it reported on a cohort that
 *     is still sitting the exam. "1 accepted" told a student how many of their
 *     classmates had solved the question so far; the histogram told them how
 *     fast. Anonymous in identity, not in signal.
 *   - It was authenticated but otherwise ungated, so dropping the chart from the
 *     page would have left the numbers one fetch away from any student taking
 *     the test.
 *
 * It was also wrong on its own terms: the caller's own submission sat inside the
 * comparison set, so nobody could beat 100% and the first student to solve a
 * question was always told they beat 0%.
 *
 * If a practice mode ever wants this back, it belongs behind a check that the
 * question's test is not proctored -- not merely behind a conditional render.
 */

// ---------------------------------------------------------------------------
// Admin smoke test
// ---------------------------------------------------------------------------

// Runs a trivial program on demand so an admin can confirm the judge works
// end to end without creating a test.
router.post('/selftest', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const languageKey = normalizeLanguageKey(req.body?.language) || 'python';
    const results = await runAgainstCases({
      sourceCode: LANGUAGES[languageKey].boilerplate,
      language: languageKey,
      cases: [{ input: '2 3\n', output: '5', marks: 1 }],
    });
    return res.json({ language: languageKey, result: results[0] });
  } catch (error) {
    return sendJudgeError(res, error, 'Judge0 self-test failed');
  }
});

module.exports = router;
