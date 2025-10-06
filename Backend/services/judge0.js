// judge0.js
// Judge0 integration with local and deployed instances

// Node >=18 has global fetch, fallback to node-fetch if needed
const fetchFn = async (...args) => {
  if (typeof fetch !== 'undefined') {
    return fetch(...args);
  }
  const nodeFetch = require('node-fetch');
  return nodeFetch(...args);
};

// Use your deployed Judge0 instance on Render
const JUDGE0_INSTANCES = [
  process.env.JUDGE0_BASE_URL || 'https://judge0-api-b0cf.onrender.com',  // Your deployed instance
  'http://localhost:2358'  // Local fallback (optional)
];

// Local execution fallback for when all Judge0 instances fail
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let currentInstanceIndex = 0;
const JUDGE0_BASE_URL = JUDGE0_INSTANCES[currentInstanceIndex];
// No API key needed for deployed or local Judge0 instances

// Function to switch to next Judge0 instance
function switchToNextInstance() {
  const oldInstance = JUDGE0_INSTANCES[currentInstanceIndex];
  currentInstanceIndex = (currentInstanceIndex + 1) % JUDGE0_INSTANCES.length;
  const newInstance = JUDGE0_INSTANCES[currentInstanceIndex];
  console.log(`🔄 Switching from ${oldInstance} to ${newInstance}`);
  return newInstance;
}

// Local execution fallback function
async function executeLocally({ sourceCode, language, stdin, expectedOutput }) {
  return new Promise((resolve, reject) => {
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    
    let filename, command;
    
    switch (language.toLowerCase()) {
      case 'python':
        filename = `temp_${timestamp}.py`;
        command = `python3 "${path.join(tempDir, filename)}"`;
        break;
      case 'javascript':
        filename = `temp_${timestamp}.js`;
        command = `node "${path.join(tempDir, filename)}"`;
        break;
      case 'java':
        filename = `Temp_${timestamp}.java`;
        command = `cd "${tempDir}" && javac "${filename}" && java "Temp_${timestamp}"`;
        break;
      case 'cpp':
        filename = `temp_${timestamp}.cpp`;
        command = `cd "${tempDir}" && g++ "${filename}" -o "temp_${timestamp}" && "./temp_${timestamp}"`;
        break;
      case 'c':
        filename = `temp_${timestamp}.c`;
        command = `cd "${tempDir}" && gcc "${filename}" -o "temp_${timestamp}" && "./temp_${timestamp}"`;
        break;
      default:
        reject(new Error(`Unsupported language: ${language}`));
        return;
    }
    
    const filePath = path.join(tempDir, filename);
    
    // Write code to file
    fs.writeFileSync(filePath, sourceCode);
    
    // Execute with timeout
    const timeout = 5000; // 5 seconds
    const child = exec(command, { timeout }, (error, stdout, stderr) => {
      // Clean up files
      try {
        fs.unlinkSync(filePath);
        if (language === 'java' || language === 'cpp' || language === 'c') {
          const executableName = language === 'java' ? `Temp_${timestamp}.class` : `temp_${timestamp}`;
          const executablePath = path.join(tempDir, executableName);
          if (fs.existsSync(executablePath)) {
            fs.unlinkSync(executablePath);
          }
        }
      } catch (cleanupError) {
        console.warn('Cleanup error:', cleanupError.message);
      }
      
      if (error) {
        resolve({
          status: { id: 6, description: 'Runtime Error' },
          stdout: stdout || '',
          stderr: stderr || error.message,
          time: null,
          memory: null,
          message: error.message
        });
      } else {
        const output = stdout.trim();
        const isAccepted = output === expectedOutput;
        
        resolve({
          status: { id: isAccepted ? 3 : 4, description: isAccepted ? 'Accepted' : 'Wrong Answer' },
          stdout: output,
          stderr: stderr || '',
          time: null,
          memory: null,
          message: isAccepted ? 'Accepted' : 'Wrong Answer'
        });
      }
    });
    
    // Send input to stdin if provided
    if (stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

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

// Create a single submission to Judge0 with retry logic
async function createSubmission({
  sourceCode,
  language,
  stdin,
  expectedOutput,
  cpuTimeLimit = '2',
  memoryLimit = '512000',
}) {
  const language_id = mapLanguageToJudge0Id(language);
  
  // Retry logic for 503 errors (service suspended/sleeping)
  const maxRetries = 3;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Use current instance URL
      const currentUrl = JUDGE0_INSTANCES[currentInstanceIndex];
      const createUrl = `${currentUrl}/api/v1/submissions`;
      console.log(`🚀 Using Judge0 instance: ${currentUrl} (attempt ${attempt}/${maxRetries})`);
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
        
        // Handle 503 Service Suspended and 429 Rate Limiting errors with retry
        if ((createRes.status === 503 || createRes.status === 429) && attempt < maxRetries) {
          const errorType = createRes.status === 503 ? 'service suspended' : 'rate limited';
          const delay = createRes.status === 429 ? attempt * 5000 : attempt * 2000; // Longer delay for rate limiting
          console.warn(`Judge0 ${errorType} (attempt ${attempt}/${maxRetries}), retrying in ${delay/1000} seconds...`);
          
          // If it's a 503 error, switch to next instance
          if (createRes.status === 503) {
            switchToNextInstance();
          }
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
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
        
        const resultRes = await fetchFn(`${JUDGE0_INSTANCES[currentInstanceIndex]}/api/v1/submissions/${submissionId}`);
        if (!resultRes.ok) {
          // Handle 503 and 429 errors during polling
          if ((resultRes.status === 503 || resultRes.status === 429) && attempt < maxRetries) {
            const errorType = resultRes.status === 503 ? 'service suspended' : 'rate limited';
            const delay = resultRes.status === 429 ? attempt * 5000 : attempt * 2000;
            console.warn(`Judge0 ${errorType} during polling (attempt ${attempt}/${maxRetries}), retrying in ${delay/1000} seconds...`);
            
            // If it's a 503 error, switch to next instance
            if (resultRes.status === 503) {
              switchToNextInstance();
            }
            
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
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
      
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        console.warn(`Judge0 request failed (attempt ${attempt}/${maxRetries}): ${error.message}`);
        
        // If it's a 503 error (service suspended), try switching to next instance
        if (error.message.includes('503') || error.message.includes('Service Suspended') || error.message.includes('<!DOCTYPE html>')) {
          switchToNextInstance();
        }
        
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        continue;
      }
      throw error;
    }
  }
  
  // If we get here, all retries failed
  throw lastError || new Error('Judge0 service unavailable after multiple retries');
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
// Run code against multiple test cases with rate limiting protection
async function runAgainstCases({ sourceCode, language, cases }) {
  const results = [];
  
  // Process test cases sequentially to avoid rate limiting
  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    
    try {
      // Add delay between submissions to prevent rate limiting
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between requests
      }
      
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

      results.push({
        input: testCase.input,
        expected: testCase.output,
        stdout,
        stderr: submission.stderr ?? '',
        time: submission.time,
        memory: submission.memory,
        status: submission.status,
        passed: isAccepted,
        marks: testCase.marks ?? 0,
      });
    } catch (err) {
      console.error('Judge0 submission failed:', err.message);
      
      // If it's a 503 error, try switching to next instance and retry once
      if (err.message.includes('503') || err.message.includes('Service Suspended') || err.message.includes('<!DOCTYPE html>')) {
        console.log('🔄 503 error detected in runAgainstCases, switching instance and retrying...');
        switchToNextInstance();
        
        try {
          // Retry with new instance
          const retrySubmission = await createSubmission({
            sourceCode,
            language,
            stdin: testCase.input,
            expectedOutput: testCase.output,
          });

          const retryStatusId = retrySubmission.status?.id;
          const isAccepted = retryStatusId === 3; // Accepted status

          results.push({
            input: testCase.input,
            expected: testCase.output,
            stdout: retrySubmission.stdout || '',
            stderr: retrySubmission.stderr || '',
            time: retrySubmission.time,
            memory: retrySubmission.memory,
            status: retrySubmission.status,
            passed: isAccepted,
            marks: testCase.marks ?? 0,
          });
          
          console.log(`✅ Retry successful for test case ${i + 1}`);
          continue;
        } catch (retryErr) {
          console.error('Retry also failed:', retryErr.message);
          
          // If all Judge0 instances failed, try local execution as last resort
          if (retryErr.message.includes('401') || retryErr.message.includes('Invalid API key')) {
            console.log('🔄 All Judge0 instances failed, trying local execution...');
            try {
              const localResult = await executeLocally({
                sourceCode,
                language,
                stdin: testCase.input,
                expectedOutput: testCase.output,
              });
              
              const isAccepted = localResult.status.id === 3;
              
              results.push({
                input: testCase.input,
                expected: testCase.output,
                stdout: localResult.stdout || '',
                stderr: localResult.stderr || '',
                time: localResult.time,
                memory: localResult.memory,
                status: localResult.status,
                passed: isAccepted,
                marks: testCase.marks ?? 0,
              });
              
              console.log(`✅ Local execution successful for test case ${i + 1}`);
              continue;
            } catch (localErr) {
              console.error('Local execution also failed:', localErr.message);
            }
          }
        }
      }

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
