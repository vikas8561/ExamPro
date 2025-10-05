// judge0.js
// RapidAPI Judge0 integration

// Node >=18 has global fetch, fallback to node-fetch if needed
const fetchFn = async (...args) => {
  if (typeof fetch !== 'undefined') {
    return fetch(...args);
  }
  const nodeFetch = require('node-fetch');
  return nodeFetch(...args);
};

// Use environment variable or default to RapidAPI Judge0 endpoint
const JUDGE0_BASE_URL = process.env.JUDGE0_BASE_URL || 'https://judge0-ce.p.rapidapi.com';
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || '3f9b7f97d4msh09614f6a8e0549ap1a2f44jsn21675a256ff5';

// Map common language names to Judge0 language IDs
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
  return map[String(language || '').toLowerCase()] || 71; // default to Python3
}

// Create a single submission to Judge0
async function createSubmission({
  sourceCode,
  language,
  stdin,
  expectedOutput,
  cpuTimeLimit = '2',
  memoryLimit = '512000',
}) {
  const language_id = mapLanguageToJudge0Id(language);
  const url = `${JUDGE0_BASE_URL}/submissions?base64_encoded=false&wait=true`;

  const headers = {
    'Content-Type': 'application/json',
    'X-RapidAPI-Key': JUDGE0_API_KEY,
    'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
  };

  const body = {
    source_code: sourceCode || '',
    language_id,
    stdin: stdin ?? '',
    expected_output: expectedOutput ?? undefined,
    cpu_time_limit: cpuTimeLimit,
    memory_limit: memoryLimit,
  };

  const res = await fetchFn(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Judge0 API error response: ${res.status} ${text}`);
    throw new Error(`Judge0 error: ${res.status} ${text}`);
  }

  return res.json();
}

// Run code against multiple test cases
// Run code against multiple test cases in parallel
async function runAgainstCases({ sourceCode, language, cases }) {
  const promises = cases.map(async (testCase) => {
    try {
      const submission = await createSubmission({
        sourceCode,
        language,
        stdin: testCase.input,
        expectedOutput: testCase.output,
      });

      const statusId = submission.status?.id;
      const stdout = submission.stdout ?? '';
      const expected = testCase.output ?? '';

      const isAccepted =
        statusId === 3 || (statusId === 1 && stdout.trim() === expected.trim());

      return {
        input: testCase.input,
        expected: testCase.output,
        stdout,
        stderr: submission.stderr ?? '',
        time: submission.time,
        memory: submission.memory,
        status: submission.status,
        passed: isAccepted,
        marks: testCase.marks ?? 0,
      };
    } catch (err) {
      console.error('Judge0 submission failed:', err.message);

      return {
        input: testCase.input,
        expected: testCase.output,
        stdout: '',
        stderr: `Execution failed: ${err.message}`,
        time: null,
        memory: null,
        status: { description: 'Internal Error' },
        passed: false,
        marks: testCase.marks ?? 0,
      };
    }
  });

  // Run all test case promises in parallel
  const results = await Promise.all(promises);
  return results;
}


module.exports = { createSubmission, runAgainstCases, mapLanguageToJudge0Id };
