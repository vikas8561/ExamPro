// Final integration test for Judge0
const { createSubmission, runAgainstCases } = require('./services/judge0');

async function testFinalIntegration() {
  console.log('🎯 Final Judge0 Integration Test\n');

  try {
    // Test 1: Simple Python execution
    console.log('Test 1: Python Hello World');
    const result1 = await createSubmission({
      sourceCode: 'print("Hello, World!")',
      language: 'python',
      stdin: '',
      expectedOutput: 'Hello, World!'
    });
    
    console.log('Result:', {
      status: result1.status?.description,
      stdout: result1.stdout,
      stderr: result1.stderr,
      time: result1.time
    });

    // Test 2: JavaScript execution
    console.log('\nTest 2: JavaScript execution');
    const result2 = await createSubmission({
      sourceCode: 'console.log("Hello from JS!");',
      language: 'javascript',
      stdin: '',
      expectedOutput: 'Hello from JS!'
    });
    
    console.log('Result:', {
      status: result2.status?.description,
      stdout: result2.stdout,
      stderr: result2.stderr,
      time: result2.time
    });

    // Test 3: Multiple test cases (simulating real exam scenario)
    console.log('\nTest 3: Multiple test cases (Exam scenario)');
    const examTestCases = [
      { input: '5\n3', output: '8' },
      { input: '10\n20', output: '30' },
      { input: '100\n200', output: '300' }
    ];
    
    const examResults = await runAgainstCases({
      sourceCode: `a = int(input())
b = int(input())
print(a + b)`,
      language: 'python',
      cases: examTestCases
    });
    
    console.log('Exam Results:');
    examResults.forEach((result, index) => {
      console.log(`  Test ${index + 1}: ${result.passed ? '✅ PASS' : '❌ FAIL'} - ${result.status?.description}`);
      if (result.stdout) console.log(`    Output: ${result.stdout.trim()}`);
      if (result.stderr) console.log(`    Error: ${result.stderr.trim()}`);
    });

    const passedCount = examResults.filter(r => r.passed).length;
    console.log(`\n📊 Final Score: ${passedCount}/${examResults.length} tests passed`);

    if (passedCount === examResults.length) {
      console.log('\n🎉 SUCCESS: All tests passed! Judge0 integration is working perfectly!');
    } else {
      console.log('\n⚠️  Some tests failed. Check worker deployment status.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testFinalIntegration();
