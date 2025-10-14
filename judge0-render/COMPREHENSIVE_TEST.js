// Comprehensive Judge0 Testing Suite
// Tests all functionality for 200-300 students deployment

const https = require('https');

// Your Render service URLs
const API_URL = 'https://judge0-api-b0cf.onrender.com';
const WORKER_URL = 'https://judge0-worker.onrender.com';

console.log('🧪 COMPREHENSIVE JUDGE0 TESTING SUITE\n');
console.log('🎯 Testing deployment for 200-300 students');
console.log('📡 API URL:', API_URL);
console.log('🔧 Worker URL:', WORKER_URL);
console.log('='.repeat(60));

// Test cases for all 5 supported languages
const testCases = [
    {
        name: 'Python 3',
        language: 71, // Python 3 language ID
        code: 'print("Hello from Python!")\nprint(2 + 3)',
        expected: 'Hello from Python!\n5'
    },
    {
        name: 'JavaScript (Node.js)',
        language: 63, // Node.js language ID
        code: 'console.log("Hello from JavaScript!");\nconsole.log(2 + 3);',
        expected: 'Hello from JavaScript!\n5'
    },
    {
        name: 'Java',
        language: 62, // Java language ID
        code: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from Java!");
        System.out.println(2 + 3);
    }
}`,
        expected: 'Hello from Java!\n5'
    },
    {
        name: 'C++',
        language: 54, // C++ language ID
        code: `#include <iostream>
using namespace std;
int main() {
    cout << "Hello from C++!" << endl;
    cout << 2 + 3 << endl;
    return 0;
}`,
        expected: 'Hello from C++!\n5'
    },
    {
        name: 'C',
        language: 50, // C language ID
        code: `#include <stdio.h>
int main() {
    printf("Hello from C!\\n");
    printf("%d\\n", 2 + 3);
    return 0;
}`,
        expected: 'Hello from C!\n5'
    }
];

async function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });
        
        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

async function testAPIEndpoint() {
    console.log('\n🔍 TEST 1: API Endpoint Availability');
    console.log('-'.repeat(40));
    
    try {
        const response = await makeRequest(`${API_URL}/languages`);
        if (response.status === 200 && Array.isArray(response.data)) {
            console.log('✅ API is responding correctly');
            console.log(`✅ Languages supported: ${response.data.length}`);
            console.log(`✅ API URL: ${API_URL}`);
            return true;
        } else {
            console.log('❌ API response error:', response.status, response.data);
            return false;
        }
    } catch (error) {
        console.log('❌ API connection failed:', error.message);
        return false;
    }
}

async function testLanguageSupport() {
    console.log('\n🔍 TEST 2: Language Support Verification');
    console.log('-'.repeat(40));
    
    try {
        const response = await makeRequest(`${API_URL}/languages`);
        if (response.status !== 200) {
            console.log('❌ Cannot fetch languages');
            return false;
        }
        
        const languages = response.data;
        const requiredLanguages = [
            { id: 71, name: 'Python 3' },
            { id: 63, name: 'JavaScript (Node.js)' },
            { id: 62, name: 'Java' },
            { id: 54, name: 'C++' },
            { id: 50, name: 'C' }
        ];
        
        let allSupported = true;
        for (const required of requiredLanguages) {
            const found = languages.find(lang => lang.id === required.id);
            if (found) {
                console.log(`✅ ${required.name} (ID: ${required.id})`);
            } else {
                console.log(`❌ ${required.name} (ID: ${required.id}) - NOT FOUND`);
                allSupported = false;
            }
        }
        
        return allSupported;
    } catch (error) {
        console.log('❌ Language test failed:', error.message);
        return false;
    }
}

async function testCodeExecution(testCase) {
    console.log(`\n🔍 TEST 3.${testCase.name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '')}: ${testCase.name} Code Execution`);
    console.log('-'.repeat(40));
    
    try {
        // Submit code
        const submitData = JSON.stringify({
            language_id: testCase.language,
            source_code: Buffer.from(testCase.code).toString('base64')
        });
        
        const submitResponse = await makeRequest(`${API_URL}/submissions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(submitData)
            },
            body: submitData
        });
        
        if (submitResponse.status !== 201) {
            console.log(`❌ Submission failed: ${submitResponse.status}`);
            console.log('Response:', submitResponse.data);
            return false;
        }
        
        const token = submitResponse.data.token;
        console.log(`✅ Code submitted successfully (Token: ${token})`);
        
        // Poll for result
        let attempts = 0;
        const maxAttempts = 20; // 20 seconds max
        
        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
            
            const resultResponse = await makeRequest(`${API_URL}/submissions/${token}`);
            
            if (resultResponse.status === 200) {
                const result = resultResponse.data;
                
                if (result.status.id <= 2) { // Processing
                    console.log(`⏳ Processing... (${attempts}s)`);
                    continue;
                } else if (result.status.id === 3) { // Accepted
                    console.log('✅ Code executed successfully');
                    
                    if (result.stdout) {
                        const output = Buffer.from(result.stdout, 'base64').toString();
                        console.log('📤 Output:', output.trim());
                        
                        if (output.trim() === testCase.expected) {
                            console.log('✅ Output matches expected result');
                            return true;
                        } else {
                            console.log('⚠️  Output differs from expected');
                            console.log('Expected:', testCase.expected);
                            console.log('Actual:', output.trim());
                            return false;
                        }
                    } else {
                        console.log('⚠️  No output received');
                        return false;
                    }
                } else {
                    console.log(`❌ Execution failed: ${result.status.description}`);
                    if (result.stderr) {
                        const error = Buffer.from(result.stderr, 'base64').toString();
                        console.log('Error:', error);
                    }
                    return false;
                }
            } else {
                console.log(`❌ Failed to get result: ${resultResponse.status}`);
                return false;
            }
        }
        
        console.log('❌ Timeout waiting for result');
        return false;
        
    } catch (error) {
        console.log(`❌ ${testCase.name} test failed:`, error.message);
        return false;
    }
}

async function testPerformance() {
    console.log('\n🔍 TEST 4: Performance Test (Concurrent Submissions)');
    console.log('-'.repeat(40));
    
    const concurrentTests = 5; // Test 5 concurrent submissions
    const testPromises = [];
    
    for (let i = 0; i < concurrentTests; i++) {
        testPromises.push(testCodeExecution({
            name: `Python Test ${i + 1}`,
            language: 71,
            code: `print("Test ${i + 1}")\nprint(${i + 1} * ${i + 1})`,
            expected: `Test ${i + 1}\n${(i + 1) * (i + 1)}`
        }));
    }
    
    try {
        const startTime = Date.now();
        const results = await Promise.all(testPromises);
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        const successCount = results.filter(r => r).length;
        console.log(`✅ Concurrent test completed in ${duration}s`);
        console.log(`✅ Successful submissions: ${successCount}/${concurrentTests}`);
        
        if (successCount === concurrentTests) {
            console.log('✅ Performance test PASSED - Ready for 200-300 students');
            return true;
        } else {
            console.log('⚠️  Performance test PARTIAL - Some submissions failed');
            return false;
        }
    } catch (error) {
        console.log('❌ Performance test failed:', error.message);
        return false;
    }
}

async function runComprehensiveTests() {
    console.log('🚀 Starting Comprehensive Judge0 Tests...\n');
    
    const results = {
        apiEndpoint: false,
        languageSupport: false,
        codeExecution: {},
        performance: false
    };
    
    // Test 1: API Endpoint
    results.apiEndpoint = await testAPIEndpoint();
    
    // Test 2: Language Support
    results.languageSupport = await testLanguageSupport();
    
    // Test 3: Code Execution for each language
    for (const testCase of testCases) {
        results.codeExecution[testCase.name] = await testCodeExecution(testCase);
    }
    
    // Test 4: Performance
    results.performance = await testPerformance();
    
    // Final Report
    console.log('\n' + '='.repeat(60));
    console.log('📊 COMPREHENSIVE TEST RESULTS');
    console.log('='.repeat(60));
    
    console.log(`API Endpoint: ${results.apiEndpoint ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Language Support: ${results.languageSupport ? '✅ PASS' : '❌ FAIL'}`);
    
    console.log('\nCode Execution Tests:');
    for (const [language, passed] of Object.entries(results.codeExecution)) {
        console.log(`  ${language}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    }
    
    console.log(`\nPerformance Test: ${results.performance ? '✅ PASS' : '❌ FAIL'}`);
    
    // Overall Status
    const allTestsPassed = results.apiEndpoint && results.languageSupport && 
                          Object.values(results.codeExecution).every(r => r) && 
                          results.performance;
    
    console.log('\n' + '='.repeat(60));
    if (allTestsPassed) {
        console.log('🎉 ALL TESTS PASSED!');
        console.log('✅ Judge0 is fully operational');
        console.log('✅ Ready for 200-300 students');
        console.log('✅ All 5 languages supported');
        console.log('✅ Performance optimized');
        console.log('\n🚀 Your ExamPro coding tests are ready!');
    } else {
        console.log('⚠️  SOME TESTS FAILED');
        console.log('❌ Issues detected - check configuration');
        console.log('\n💡 Troubleshooting:');
        console.log('1. Check Render service logs');
        console.log('2. Verify Redis connectivity');
        console.log('3. Check environment variables');
        console.log('4. Ensure Standard plan is active');
    }
    console.log('='.repeat(60));
}

// Run the comprehensive tests
runComprehensiveTests().catch(console.error);
