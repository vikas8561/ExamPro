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
  getSupportedLanguages,
  checkHealth,
  Judge0Error,
} = require('../services/judge0');
const { LANGUAGES, normalizeLanguageKey, LANGUAGE_KEYS } = require('../configs/languages');

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
    return res.status(503).json({
      message: 'The code execution service is temporarily unavailable. Please try again in a moment.',
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

    if (cases.length === 0) {
      return res.json({ results: [], passed: 0, total: 0, message: 'No visible test cases available' });
    }

    const results = await runAgainstCases({ sourceCode, language: languageKey, cases });

    // The custom case is reported separately so it never skews the pass count.
    const customResult = hasCustomInput ? results.pop() : null;
    const passed = results.filter((result) => result.passed).length;

    return res.json({
      results,
      passed,
      total: results.length,
      customResult: customResult ? { ...customResult, isCustom: true } : null,
      language: languageKey,
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

  const hiddenCases = (question.hiddenTestCases || []).map((testCase) => ({
    input: testCase.input,
    output: testCase.output,
    marks: testCase.marks ?? 0,
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

  const passedCount = results.filter((result) => result.passed).length;
  const totalMarks = hiddenCases.reduce((sum, testCase) => sum + (testCase.marks || 0), 0);
  const earnedMarks = results.reduce((sum, result) => sum + (result.passed ? result.marks || 0 : 0), 0);
  const compileError = results.find((result) => result.status.id === 6);

  const numeric = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const runtimes = results.map((r) => numeric(r.time)).filter((v) => v !== null);
  const memories = results.map((r) => numeric(r.memory)).filter((v) => v !== null);
  const runtimeMs = runtimes.length ? Math.round(Math.max(...runtimes) * 1000) : null;
  const memoryKb = memories.length ? Math.max(...memories) : null;

  const firstFailure = results.find((result) => !result.passed);
  const verdict = firstFailure ? firstFailure.status : { id: 3, description: 'Accepted' };
  const accepted = !firstFailure;

  // Safe projection: verdict only.
  const safeResults = results.map((result) => ({
    index: result.index,
    passed: result.passed,
    status: result.status,
  }));

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
  };

  const maxScore = (test.questions || []).reduce((sum, q) => {
    if (q.kind === 'coding') {
      return sum + (q.hiddenTestCases || []).reduce((s, h) => s + (h.marks || 0), 0);
    }
    return sum + (q.points || 1);
  }, 0);

  let submission = await TestSubmission.findOne({ assignmentId: assignment._id, userId: assignment.userId });
  if (!submission) {
    submission = await TestSubmission.create({
      assignmentId: assignment._id,
      testId: test._id,
      userId: assignment.userId,
      responses: [response],
      totalScore: earnedMarks,
      maxScore,
      timeSpent: 0,
      mentorReviewed: false,
      reviewStatus: 'Pending',
      // The student is still mid-test; the final submit flips this.
      isFinalized: false,
    });
  } else {
    const index = submission.responses.findIndex(
      (existing) => existing.questionId.toString() === String(question._id)
    );
    if (index >= 0) submission.responses[index] = response;
    else submission.responses.push(response);

    submission.totalScore = submission.responses.reduce((sum, r) => sum + (r.points || 0), 0);
    submission.maxScore = maxScore;
    await submission.save();
  }

  return {
    results: safeResults,
    verdict,
    passedCount,
    totalHidden: hiddenCases.length,
    runtimeMs,
    memoryKb,
    language: languageKey,
    compileOutput: compileError ? compileError.compileOutput : null,
    // earnedMarks / totalMarks are deliberately not returned: the score is
    // computed and stored, but students are not shown it during the test.
  };
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
        message: error instanceof Judge0Error
          ? 'The code execution service is temporarily unavailable. Please try again in a moment.'
          : error.message || 'Code submission failed',
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
 * Runtime / memory distribution for one question, so a student can see where
 * their accepted submission sits — the chart shown after submitting.
 *
 * Aggregated and anonymous: counts only, never other students' identities,
 * code or scores.
 */
router.get('/distribution/:questionId', authenticateToken, async (req, res) => {
  try {
    const { questionId } = req.params;
    if (!OBJECT_ID.test(questionId)) {
      return res.status(400).json({ message: 'Invalid questionId format' });
    }

    const rows = await TestSubmission.aggregate([
      { $unwind: '$responses' },
      {
        $match: {
          'responses.questionId': new mongoose.Types.ObjectId(questionId),
          'responses.autoGraded': true,
          'responses.isCorrect': true,
          'responses.runtimeMs': { $ne: null },
        },
      },
      {
        $project: {
          userId: 1,
          runtimeMs: '$responses.runtimeMs',
          memoryKb: '$responses.memoryKb',
        },
      },
    ]);

    const mine = rows.find((row) => String(row.userId) === String(req.user.userId)) || null;

    // Bucket a set of values into a small histogram and work out what share of
    // submissions the given value beats (i.e. is strictly better than).
    const summarize = (values, myValue, bucketCount = 12) => {
      const clean = values.filter((v) => Number.isFinite(v));
      if (clean.length === 0) return null;

      const min = Math.min(...clean);
      const max = Math.max(...clean);
      const span = max - min || 1;
      const step = span / bucketCount;

      const buckets = Array.from({ length: bucketCount }, (_, i) => ({
        value: Math.round((min + step * i) * 100) / 100,
        count: 0,
      }));
      clean.forEach((v) => {
        const slot = Math.min(bucketCount - 1, Math.floor((v - min) / step));
        buckets[slot].count += 1;
      });
      buckets.forEach((bucket) => {
        bucket.percent = Math.round((bucket.count / clean.length) * 1000) / 10;
      });

      const beats = myValue === null || myValue === undefined
        ? null
        : Math.round((clean.filter((v) => v > myValue).length / clean.length) * 1000) / 10;

      return { buckets, beats, mine: myValue ?? null, sampleSize: clean.length };
    };

    return res.json({
      runtime: summarize(rows.map((r) => r.runtimeMs), mine?.runtimeMs ?? null),
      memory: summarize(rows.map((r) => r.memoryKb), mine?.memoryKb ?? null),
      sampleSize: rows.length,
    });
  } catch (error) {
    console.error('❌ Distribution lookup failed:', error.message);
    return res.status(500).json({ message: 'Could not load submission statistics' });
  }
});

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
