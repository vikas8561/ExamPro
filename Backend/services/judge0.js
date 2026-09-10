'use strict';

/**
 * Judge0 integration (CE v1.13.x)
 * -------------------------------
 * Talks to a self-hosted Judge0 instance over its documented REST API:
 *   POST /submissions/batch?base64_encoded=true   -> [{ token }, ...]
 *   GET  /submissions/batch?tokens=..&base64_encoded=true&fields=..
 *   GET  /languages, GET /config_info, GET /about
 *
 * Design notes:
 *  - Everything is base64 encoded on the wire so arbitrary stdin/stdout
 *    (unicode, trailing spaces, binary-ish bytes) survives the round trip.
 *  - Submissions are sent in batches and polled. We never rely on `wait=true`,
 *    which self-hosted instances disable by default (enable_wait_result=false)
 *    and which does not scale to exam-sized traffic anyway.
 *  - Language IDs are resolved at runtime from GET /languages, because the IDs
 *    differ between the standard and "extra" Judge0 images. A conservative
 *    fallback map (IDs present in every 1.13.x build) is used if discovery fails.
 */

const {
  LANGUAGES,
  LANGUAGE_KEYS,
  FALLBACK_LANGUAGE_IDS,
  normalizeLanguageKey,
} = require('../configs/languages');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const JUDGE0_URL = String(
  process.env.JUDGE0_URL || process.env.JUDGE0_BASE_URL || 'http://localhost:2358'
).replace(/\/+$/, '');

const AUTH_HEADER = process.env.JUDGE0_AUTH_HEADER || 'X-Auth-Token';
const AUTH_TOKEN = process.env.JUDGE0_AUTH_TOKEN || '';

// Per-submission sandbox limits. Judge0 clamps these to its own max_* values.
const CPU_TIME_LIMIT = num(process.env.JUDGE0_CPU_TIME_LIMIT, 5);      // seconds
const WALL_TIME_LIMIT = num(process.env.JUDGE0_WALL_TIME_LIMIT, 10);   // seconds
const MEMORY_LIMIT = num(process.env.JUDGE0_MEMORY_LIMIT, 256000);     // KB

// Transport / orchestration
const REQUEST_TIMEOUT_MS = num(process.env.JUDGE0_REQUEST_TIMEOUT_MS, 20000);
const POLL_TIMEOUT_MS = num(process.env.JUDGE0_POLL_TIMEOUT_MS, 90000);
const POLL_INTERVAL_MS = num(process.env.JUDGE0_POLL_INTERVAL_MS, 600);
const MAX_RETRIES = num(process.env.JUDGE0_MAX_RETRIES, 3);
const MAX_CONCURRENT = num(process.env.JUDGE0_MAX_CONCURRENT, 8);
const DEFAULT_BATCH_SIZE = num(process.env.JUDGE0_BATCH_SIZE, 20);

// Judge0 status ids (GET /statuses)
const STATUS = {
  IN_QUEUE: 1,
  PROCESSING: 2,
  ACCEPTED: 3,
  WRONG_ANSWER: 4,
  TIME_LIMIT_EXCEEDED: 5,
  COMPILATION_ERROR: 6,
  INTERNAL_ERROR: 13,
  EXEC_FORMAT_ERROR: 14,
};

const RESULT_FIELDS = [
  'token', 'stdout', 'stderr', 'compile_output', 'message',
  'exit_code', 'exit_signal', 'status', 'time', 'memory',
].join(',');

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const encode = (value) => Buffer.from(String(value ?? ''), 'utf8').toString('base64');
const decode = (value) => (value ? Buffer.from(String(value), 'base64').toString('utf8') : '');

/**
 * Judge0 compares stdout against expected_output after stripping trailing
 * whitespace from the whole string (leading whitespace still matters).
 * We mirror that rule exactly so our verdict always agrees with its status,
 * and additionally fold CRLF -> LF because expected outputs authored in a
 * browser textarea routinely arrive with Windows line endings.
 */
function normalizeOutput(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/[\s﻿\xA0]+$/, '');
}

class Judge0Error extends Error {
  constructor(message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = 'Judge0Error';
    this.status = status;
    this.retryable = retryable;
  }
}

// Bounded concurrency so a few hundred simultaneous submitters cannot open an
// unbounded number of sockets against the judge.
let activeRequests = 0;
const waiters = [];

async function acquireSlot() {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests += 1;
    return;
  }
  await new Promise((resolve) => waiters.push(resolve));
  activeRequests += 1;
}

function releaseSlot() {
  activeRequests -= 1;
  const next = waiters.shift();
  if (next) next();
}

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

async function rawFetch(path, { method = 'GET', body = null, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = { Accept: 'application/json' };
  if (AUTH_TOKEN) headers[AUTH_HEADER] = AUTH_TOKEN;
  if (body) headers['Content-Type'] = 'application/json';

  try {
    const response = await fetch(`${JUDGE0_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const retryable = response.status === 429 || response.status >= 500;
      const hint =
        response.status === 401 || response.status === 403
          ? ' (check JUDGE0_AUTH_TOKEN / JUDGE0_AUTH_HEADER)'
          : '';
      throw new Judge0Error(
        `Judge0 responded ${response.status}${hint}: ${text.slice(0, 300)}`,
        { status: response.status, retryable }
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Judge0Error) throw error;
    if (error.name === 'AbortError') {
      throw new Judge0Error(`Judge0 request timed out after ${timeoutMs}ms`, { retryable: true });
    }
    throw new Judge0Error(`Cannot reach Judge0 at ${JUDGE0_URL}: ${error.message}`, { retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

/** rawFetch plus bounded concurrency and exponential backoff on transient faults. */
async function judge0Fetch(path, options = {}) {
  await acquireSlot();
  try {
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        return await rawFetch(path, options);
      } catch (error) {
        lastError = error;
        if (!error.retryable || attempt === MAX_RETRIES) throw error;
        const backoff = Math.round(500 * 2 ** (attempt - 1) * (1 + Math.random() * 0.3));
        console.warn(`⚠️ Judge0 ${path} failed (attempt ${attempt}/${MAX_RETRIES}): ${error.message}. Retrying in ${backoff}ms`);
        await sleep(backoff);
      }
    }
    throw lastError;
  } finally {
    releaseSlot();
  }
}

// ---------------------------------------------------------------------------
// Instance capability discovery (cached)
// ---------------------------------------------------------------------------

let languageIdCache = null;      // { python: 71, ... }
let languageCatalogCache = null; // raw GET /languages payload
let batchSizeCache = null;
let compilerOptionsEnabled = true;
let discoveryPromise = null;
// When discovery fails we fall back to the universal ID map, but that must not
// become permanent — retry it periodically so a blip at boot self-heals.
let usingFallback = false;
let fallbackAt = 0;
const FALLBACK_RETRY_MS = num(process.env.JUDGE0_FALLBACK_RETRY_MS, 60000);

/**
 * Pick, for every language we support, the best Judge0 id actually offered by
 * this instance. Candidates are ordered newest-runtime-first in the shared
 * language config.
 */
async function discoverLanguageIds() {
  const catalog = await judge0Fetch('/languages');
  if (!Array.isArray(catalog)) throw new Judge0Error('GET /languages did not return a list');

  const availableIds = new Set(catalog.map((entry) => Number(entry.id)));
  const resolved = {};
  const missing = [];

  for (const key of LANGUAGE_KEYS) {
    const chosen = LANGUAGES[key].judge0Ids.find((id) => availableIds.has(id));
    if (chosen) resolved[key] = chosen;
    else missing.push(key);
  }

  if (missing.length) {
    console.warn(`⚠️ Judge0 instance does not offer: ${missing.join(', ')}. Those languages will be rejected.`);
  }

  languageCatalogCache = catalog;
  languageIdCache = resolved;

  const summary = LANGUAGE_KEYS
    .filter((key) => resolved[key])
    .map((key) => {
      const entry = catalog.find((lang) => Number(lang.id) === resolved[key]);
      return `${key}=${resolved[key]} (${entry ? entry.name : '?'})`;
    })
    .join(', ');
  console.log(`✅ Judge0 languages resolved at ${JUDGE0_URL}: ${summary}`);

  return resolved;
}

async function discoverInstanceConfig() {
  try {
    const config = await judge0Fetch('/config_info');
    const max = Number(config?.max_submission_batch_size);
    const batchSize = Number.isFinite(max) && max > 0 ? Math.min(max, DEFAULT_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
    // If the instance forbids compiler options, sending them makes it reject
    // the submission outright, so we drop them instead.
    const enableCompilerOptions = config?.enable_compiler_options !== false;
    if (!enableCompilerOptions) {
      console.warn('⚠️ Judge0 has compiler options disabled; language compiler flags will be omitted.');
    }
    return { batchSize, enableCompilerOptions };
  } catch (error) {
    console.warn(`⚠️ Could not read Judge0 /config_info: ${error.message}`);
    return { batchSize: DEFAULT_BATCH_SIZE, enableCompilerOptions: true };
  }
}

/** Resolve language ids + batch size once; fall back to the universal ID map. */
async function ensureDiscovery() {
  const staleFallback = usingFallback && Date.now() - fallbackAt > FALLBACK_RETRY_MS;

  if (languageIdCache && batchSizeCache && !staleFallback) {
    return {
      languageIds: languageIdCache,
      batchSize: batchSizeCache,
      enableCompilerOptions: compilerOptionsEnabled,
    };
  }

  if (staleFallback) {
    languageIdCache = null;
    batchSizeCache = null;
    usingFallback = false;
  }

  if (!discoveryPromise) {
    discoveryPromise = (async () => {
      try {
        const [languageIds, instanceConfig] = await Promise.all([
          discoverLanguageIds(),
          discoverInstanceConfig(),
        ]);
        batchSizeCache = instanceConfig.batchSize;
        compilerOptionsEnabled = instanceConfig.enableCompilerOptions;
        usingFallback = false;
        return { languageIds, batchSize: batchSizeCache, enableCompilerOptions: compilerOptionsEnabled };
      } catch (error) {
        console.warn(`⚠️ Judge0 language discovery failed (${error.message}). Using built-in fallback IDs; will retry in ${Math.round(FALLBACK_RETRY_MS / 1000)}s.`);
        languageIdCache = { ...FALLBACK_LANGUAGE_IDS };
        batchSizeCache = DEFAULT_BATCH_SIZE;
        compilerOptionsEnabled = true;
        usingFallback = true;
        fallbackAt = Date.now();
        return { languageIds: languageIdCache, batchSize: batchSizeCache, enableCompilerOptions: true };
      } finally {
        // Callers already awaiting keep their reference; new callers either hit
        // the cache above or start a fresh attempt.
        discoveryPromise = null;
      }
    })();
  }
  return discoveryPromise;
}

/** Forget cached capabilities (used by the health check / admin tooling). */
function resetDiscoveryCache() {
  languageIdCache = null;
  languageCatalogCache = null;
  batchSizeCache = null;
  compilerOptionsEnabled = true;
  discoveryPromise = null;
  usingFallback = false;
  fallbackAt = 0;
}

// ---------------------------------------------------------------------------
// Submission plumbing
// ---------------------------------------------------------------------------

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function buildSubmission({ languageId, compilerOptions, sourceCode, stdin, expectedOutput, limits }) {
  const submission = {
    language_id: languageId,
    source_code: encode(sourceCode),
    stdin: encode(stdin ?? ''),
    cpu_time_limit: limits?.cpuTimeLimit ?? CPU_TIME_LIMIT,
    wall_time_limit: limits?.wallTimeLimit ?? WALL_TIME_LIMIT,
    memory_limit: limits?.memoryLimit ?? MEMORY_LIMIT,
    redirect_stderr_to_stdout: false,
  };

  // Only send expected_output when the case actually declares one, otherwise
  // Judge0 would mark a plain "run this code" submission as Wrong Answer.
  if (expectedOutput !== null && expectedOutput !== undefined) {
    submission.expected_output = encode(normalizeOutput(expectedOutput));
  }
  if (compilerOptions) submission.compiler_options = compilerOptions;

  return submission;
}

async function createBatch(submissions) {
  const tokens = await judge0Fetch('/submissions/batch?base64_encoded=true', {
    method: 'POST',
    body: { submissions },
  });

  if (!Array.isArray(tokens)) throw new Judge0Error('Unexpected response from POST /submissions/batch');

  // Judge0 replies with a validation-error object in place of a token for any
  // submission it rejected. Surface that instead of silently losing the case.
  return tokens.map((entry) => {
    if (entry && typeof entry.token === 'string') return { token: entry.token };
    return { token: null, error: JSON.stringify(entry) };
  });
}

async function pollBatch(tokens, onTick = null) {
  const query = `tokens=${tokens.join(',')}&base64_encoded=true&fields=${RESULT_FIELDS}`;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let interval = POLL_INTERVAL_MS;

  while (Date.now() < deadline) {
    await sleep(interval);
    const payload = await judge0Fetch(`/submissions/batch?${query}`);
    const submissions = Array.isArray(payload?.submissions) ? payload.submissions : [];

    // Real progress: Judge0 reports each submission's status independently, so
    // we can report how many have actually finished rather than guessing.
    const finished = submissions.filter((s) => Number(s?.status?.id) > STATUS.PROCESSING);
    if (onTick) {
      // Judge0 reports IN_QUEUE (1) and PROCESSING (2) separately, so we can
      // tell "still waiting to start" from "actually executing".
      const processing = submissions.some((s) => Number(s?.status?.id) === STATUS.PROCESSING);
      onTick({ finished: finished.length, total: tokens.length, processing });
    }

    const settled = submissions.length === tokens.length && finished.length === tokens.length;
    if (settled) return submissions;

    // Ease off gradually on long-running batches.
    interval = Math.min(Math.round(interval * 1.25), 2000);
  }

  throw new Judge0Error(`Judge0 did not finish grading within ${POLL_TIMEOUT_MS}ms`, { retryable: false });
}

/** Turn a raw Judge0 submission result into the shape our routes return. */
function toResult(raw, testCase, index) {
  const statusId = Number(raw?.status?.id) || STATUS.INTERNAL_ERROR;
  const stdout = decode(raw?.stdout);
  const stderr = decode(raw?.stderr);
  const compileOutput = decode(raw?.compile_output);
  const message = decode(raw?.message);

  const hasExpected = testCase.output !== null && testCase.output !== undefined;
  const passed = hasExpected
    ? statusId === STATUS.ACCEPTED && normalizeOutput(stdout) === normalizeOutput(testCase.output)
    : statusId === STATUS.ACCEPTED;

  return {
    index,
    input: testCase.input ?? '',
    expected: testCase.output ?? '',
    stdout,
    stderr,
    compileOutput,
    message,
    status: { id: statusId, description: raw?.status?.description || 'Unknown' },
    time: raw?.time ?? null,
    memory: raw?.memory ?? null,
    exitCode: raw?.exit_code ?? null,
    passed,
    marks: testCase.marks ?? 0,
  };
}

function errorResult(testCase, index, messageText) {
  return {
    index,
    input: testCase.input ?? '',
    expected: testCase.output ?? '',
    stdout: '',
    stderr: '',
    compileOutput: '',
    message: messageText,
    status: { id: STATUS.INTERNAL_ERROR, description: 'Internal Error' },
    time: null,
    memory: null,
    exitCode: null,
    passed: false,
    marks: testCase.marks ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Resolve a language key ('cpp', 'python', ...) to this instance's Judge0 id. */
async function resolveLanguage(language) {
  const key = normalizeLanguageKey(language);
  if (!key) {
    throw new Judge0Error(
      `Unsupported language "${language}". Supported: ${LANGUAGE_KEYS.join(', ')}`
    );
  }
  const { languageIds } = await ensureDiscovery();
  const languageId = languageIds[key];
  if (!languageId) {
    throw new Judge0Error(`Language "${key}" is not available on this Judge0 instance`);
  }
  return { key, languageId, compilerOptions: LANGUAGES[key].compilerOptions || null };
}

/**
 * Run one program against many test cases.
 *
 * @param {object}   params
 * @param {string}   params.sourceCode
 * @param {string}   params.language     one of LANGUAGE_KEYS (or an alias)
 * @param {Array}    params.cases        [{ input, output, marks }] — `output` may be
 *                                       null/undefined for a plain run with no expectation
 * @param {object}  [params.limits]      { cpuTimeLimit, wallTimeLimit, memoryLimit }
 * @returns {Promise<Array>} one result per case, in the order given
 */
async function runAgainstCases({ sourceCode, language, cases = [], limits = null, onProgress = null }) {
  if (!sourceCode || !String(sourceCode).trim()) {
    throw new Judge0Error('Source code is empty');
  }
  if (!Array.isArray(cases) || cases.length === 0) return [];

  const { languageId, compilerOptions } = await resolveLanguage(language);
  const { batchSize, enableCompilerOptions } = await ensureDiscovery();

  const submissions = cases.map((testCase) =>
    buildSubmission({
      languageId,
      compilerOptions: enableCompilerOptions ? compilerOptions : null,
      sourceCode,
      stdin: testCase.input,
      expectedOutput: testCase.output,
      limits,
    })
  );

  const results = new Array(cases.length);
  const groups = chunk(
    submissions.map((submission, index) => ({ submission, index })),
    batchSize
  );

  // Progress is reported across all chunks, not just the current one.
  let finishedBefore = 0;
  const report = (payload) => {
    if (!onProgress) return;
    try {
      onProgress({ ...payload, total: cases.length });
    } catch {
      // A failing progress listener must never break grading.
    }
  };
  report({ phase: 'submitting', finished: 0 });

  for (const group of groups) {
    let created;
    try {
      created = await createBatch(group.map((item) => item.submission));
    } catch (error) {
      console.error(`❌ Judge0 batch creation failed: ${error.message}`);
      group.forEach(({ index }) => {
        results[index] = errorResult(cases[index], index, error.message);
      });
      continue;
    }

    const accepted = [];
    created.forEach((entry, position) => {
      const { index } = group[position];
      if (entry.token) accepted.push({ token: entry.token, index });
      else results[index] = errorResult(cases[index], index, `Judge0 rejected submission: ${entry.error}`);
    });

    if (accepted.length === 0) continue;

    try {
      const settled = await pollBatch(
        accepted.map((item) => item.token),
        ({ finished, processing }) => report({
          phase: finished > 0 || processing ? 'running' : 'queued',
          finished: finishedBefore + finished,
        })
      );
      settled.forEach((raw, position) => {
        const { index } = accepted[position];
        results[index] = toResult(raw, cases[index], index);
      });
      finishedBefore += accepted.length;
      report({ phase: 'running', finished: finishedBefore });
    } catch (error) {
      console.error(`❌ Judge0 polling failed: ${error.message}`);
      accepted.forEach(({ index }) => {
        results[index] = errorResult(cases[index], index, error.message);
      });
    }
  }

  // Defensive: never hand back a sparse array.
  for (let i = 0; i < results.length; i += 1) {
    if (!results[i]) results[i] = errorResult(cases[i], i, 'No result returned by Judge0');
  }

  return results;
}

/** Convenience wrapper: run once against a single (optionally expectation-free) case. */
async function runSingle({ sourceCode, language, stdin = '', expectedOutput = null, limits = null }) {
  const [result] = await runAgainstCases({
    sourceCode,
    language,
    cases: [{ input: stdin, output: expectedOutput, marks: 0 }],
    limits,
  });
  return result;
}

/** Languages this deployment can actually run, for the UI's picker. */
async function getSupportedLanguages() {
  const { languageIds } = await ensureDiscovery();
  return LANGUAGE_KEYS.filter((key) => languageIds[key]).map((key) => ({
    key,
    label: LANGUAGES[key].label,
    monacoLanguage: LANGUAGES[key].monacoLanguage,
    boilerplate: LANGUAGES[key].boilerplate,
    judge0Id: languageIds[key],
    judge0Name:
      languageCatalogCache?.find((entry) => Number(entry.id) === languageIds[key])?.name || null,
  }));
}

/** Connectivity + auth + capability probe, used by /api/coding/health. */
async function checkHealth({ refresh = false } = {}) {
  if (refresh) resetDiscoveryCache();
  const startedAt = Date.now();
  try {
    const about = await judge0Fetch('/about');
    const { languageIds, batchSize } = await ensureDiscovery();
    return {
      ok: true,
      url: JUDGE0_URL,
      authenticated: Boolean(AUTH_TOKEN),
      version: about?.version || null,
      latencyMs: Date.now() - startedAt,
      batchSize,
      languages: languageIds,
      missingLanguages: LANGUAGE_KEYS.filter((key) => !languageIds[key]),
    };
  } catch (error) {
    return {
      ok: false,
      url: JUDGE0_URL,
      authenticated: Boolean(AUTH_TOKEN),
      latencyMs: Date.now() - startedAt,
      error: error.message,
    };
  }
}

module.exports = {
  runAgainstCases,
  runSingle,
  resolveLanguage,
  getSupportedLanguages,
  checkHealth,
  resetDiscoveryCache,
  normalizeOutput,
  Judge0Error,
  STATUS,
  JUDGE0_URL,
};
