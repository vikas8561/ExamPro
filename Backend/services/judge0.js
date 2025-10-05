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

// Use environment variable or default to deployed Judge0 endpoint
const JUDGE0_BASE_URL = process.env.JUDGE0_BASE_URL || 'https://judge0-api-b0cf.onrender.com';
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || ''; // Not needed for our deployed API

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
  
  // First, create the submission
  const createUrl = `${JUDGE0_BASE_URL}/api/v1/submissions`;
  const headers = {
    'Content-Type': 'application/json',
  };

  const body = {
    source_code: sourceCode || '',
    language_id,
    stdin: stdin ?? '',
    expected_output: expectedOutput ?? '',
  };

  const createRes = await fetchFn(createUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    console.error(`Judge0 API error response: ${createRes.status} ${text}`);
    throw new Error(`Judge0 error: ${createRes.status} ${text}`);
  }

  const submission = await createRes.json();
  const submissionId = submission.id;

  // Poll for result (with timeout)
  const maxAttempts = 60; // 60 seconds max wait
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    
    const resultRes = await fetchFn(`${JUDGE0_BASE_URL}/api/v1/submissions/${submissionId}`);
    if (!resultRes.ok) {
      throw new Error(`Failed to get submission result: ${resultRes.status}`);
    }
    
    const result = await resultRes.json();
    
    // Check if processing is complete
    if (result.status && result.status !== 'In Queue' && result.status !== 'Processing') {
      return {
        status: { id: getStatusId(result.status), description: result.status },
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        compile_output: result.compile_output || '',
        time: result.time,
        memory: result.memory,
        message: result.message || '',
      };
    }
    
    attempts++;
  }
  
  // Timeout - return a timeout status instead of throwing
  console.warn(`Submission ${submissionId} timed out after ${maxAttempts} seconds`);
  return {
    status: { id: 13, description: 'Time Limit Exceeded' },
    stdout: '',
    stderr: 'Code execution timed out. The worker service may not be running.',
    compile_output: '',
    time: null,
    memory: null,
    message: 'Execution timeout - worker service may be unavailable',
  };
}

// Helper function to map status strings to IDs
function getStatusId(status) {
  const statusMap = {
    'Accepted': 3,
    'Wrong Answer': 4,
    'Time Limit Exceeded': 5,
    'Compilation Error': 6,
    'Runtime Error': 11,
    'Internal Error': 13,
    'In Queue': 1,
    'Processing': 2,
  };
  return statusMap[status] || 13; // Default to Internal Error
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
