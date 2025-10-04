// Use global fetch on Node >=18; fallback to node-fetch only if needed
const fetchFn = async (...args) => {
  if (typeof fetch !== 'undefined') {
    return fetch(...args);
  }
  // Lazy-require to avoid hard dependency
  // eslint-disable-next-line global-require
  const nodeFetch = require('node-fetch');
  return nodeFetch(...args);
};

const JUDGE0_BASE_URL = process.env.JUDGE0_BASE_URL || 'https://judge0-render-5nl0.onrender.com';
// Removed RapidAPI host and key since self-hosted Judge0 does not require them
// const JUDGE0_HOST = process.env.JUDGE0_RAPIDAPI_HOST || 'judge0-ce.p.rapidapi.com';
// const JUDGE0_KEY = process.env.JUDGE0_RAPIDAPI_KEY || process.env.JUDGE0_API_KEY || '';

function mapLanguageToJudge0Id(language) {
  const map = {
    c: 50,
    cpp: 54,
    'c++': 54,
    java: 62,
    python: 71,
    'python3': 71,
    javascript: 63,
    nodejs: 63,
    go: 60,
    ruby: 72,
  };
  return map[String(language || '').toLowerCase()] || 71; // default python3
}

async function createSubmission({ sourceCode, language, stdin, expectedOutput, cpuTimeLimit = '2', memoryLimit = '512000' }) {
  const language_id = mapLanguageToJudge0Id(language);
  const url = `${JUDGE0_BASE_URL}/submissions?base64_encoded=false&wait=true`;

  const headers = {
    'content-type': 'application/json',
  };
  // Removed RapidAPI headers for self-hosted Judge0
  // if (JUDGE0_KEY) {
  //   headers['X-RapidAPI-Key'] = JUDGE0_KEY;
  //   headers['X-RapidAPI-Host'] = JUDGE0_HOST;
  // }

  const body = {
    source_code: sourceCode || '',
    language_id,
    stdin: stdin ?? '',
    expected_output: expectedOutput ?? undefined,
    cpu_time_limit: cpuTimeLimit,
    memory_limit: memoryLimit,
  };

  const res = await fetchFn(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Judge0 API error response: ${res.status} ${text}`);
    throw new Error(`Judge0 error: ${res.status} ${text}`);
  }
  return res.json();
}

async function runAgainstCases({ sourceCode, language, cases }) {
  const results = [];
  for (const testCase of cases) {
    try {
      // testCase: { input, output, marks? }
      const submission = await createSubmission({
        sourceCode,
        language,
        stdin: testCase.input,
        expectedOutput: testCase.output,
      });
      const statusId = submission.status?.id;
      // Judge0 status 3 = Accepted, but also check output manually as fallback
      const stdout = submission.stdout ?? '';
      const expected = testCase.output ?? '';
      const isAccepted = statusId === 3 || (statusId === 1 && stdout.trim() === expected.trim()); // 1 = Compilation successful, but check output
      results.push({
        input: testCase.input,
        expected: testCase.output,
        stdout: stdout,
        stderr: submission.stderr ?? '',
        time: submission.time,
        memory: submission.memory,
        status: submission.status,
        passed: isAccepted,
        marks: testCase.marks ?? 0,
      });
    } catch (err) {
      console.error('Judge0 submission failed:', err.message);
      // Return failed result instead of throwing
      results.push({
        input: testCase.input,
        expected: testCase.output,
        stdout: '',
        stderr: `Execution failed: ${err.message}`,
        time: null,
        memory: null,
        status: { description: 'Internal Error' },
        passed: false,
        marks: testCase.marks ?? 0,
      });
    }
  }
  return results;
}

module.exports = { createSubmission, runAgainstCases, mapLanguageToJudge0Id };


