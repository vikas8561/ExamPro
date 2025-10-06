const { runAgainstCases } = require('./services/judge0');

const languages = [
  { 
    name: 'Python', 
    code: 'print("Hello from your new Judge0 deployment!")', 
    expected: 'Hello from your new Judge0 deployment!',
    id: 'python'
  },
  { 
    name: 'JavaScript', 
    code: 'console.log("Hello from JavaScript!");', 
    expected: 'Hello from JavaScript!',
    id: 'javascript'
  },
  { 
    name: 'Java', 
    code: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from Java!");
    }
}`, 
    expected: 'Hello from Java!',
    id: 'java'
  },
  { 
    name: 'C++', 
    code: `#include <iostream>
using namespace std;
int main() {
    cout << "Hello from C++!" << endl;
    return 0;
}`, 
    expected: 'Hello from C++!',
    id: 'cpp'
  },
  { 
    name: 'C', 
    code: `#include <stdio.h>
int main() {
    printf("Hello from C!\\n");
    return 0;
}`, 
    expected: 'Hello from C!',
    id: 'c'
  }
];

async function testNewDeployment() {
  console.log('🧪 Testing New Judge0 Deployment with All Languages...');
  console.log('🎯 Goal: Verify all 5 languages work on new deployment\n');
  
  let passedCount = 0;
  let totalCount = languages.length;
  
  for (const lang of languages) {
    console.log(`📝 Testing ${lang.name}...`);
    try {
      const startTime = Date.now();
      
      const results = await runAgainstCases({
        sourceCode: lang.code,
        language: lang.id,
        cases: [{ input: '', output: lang.expected }]
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      if (results[0]?.passed) {
        console.log(`✅ ${lang.name}: PASSED (${duration}ms)`);
        console.log(`   Output: "${results[0].stdout.trim()}"`);
        console.log(`   Time: ${results[0].time}s, Memory: ${results[0].memory}KB`);
        passedCount++;
      } else {
        console.log(`❌ ${lang.name}: FAILED (${duration}ms)`);
        console.log(`   Status: ${results[0]?.status?.description}`);
        console.log(`   Output: "${results[0]?.stdout}"`);
        console.log(`   Error: "${results[0]?.stderr}"`);
        if (results[0]?.compile_output) {
          console.log(`   Compile Error: "${results[0].compile_output}"`);
        }
      }
    } catch (error) {
      console.log(`❌ ${lang.name}: ERROR - ${error.message}`);
    }
    console.log(''); // Empty line for readability
  }
  
  console.log('📊 Deployment Test Results:');
  console.log(`✅ Passed: ${passedCount}/${totalCount} languages`);
  console.log(`❌ Failed: ${totalCount - passedCount}/${totalCount} languages`);
  
  if (passedCount === totalCount) {
    console.log('🎉 SUCCESS: New deployment working perfectly!');
    console.log('🚀 Ready for 200 students with full language support!');
    console.log('📋 Next: Update your backend configuration');
  } else if (passedCount > 0) {
    console.log('⚠️ Partial success: Some languages working');
    console.log('🔧 Check deployment logs for issues');
  } else {
    console.log('❌ Deployment failed: No languages working');
    console.log('🚨 Check Render deployment status and logs');
  }
  
  console.log('\n📋 Next Steps:');
  console.log('1. If all tests pass: Update backend configuration');
  console.log('2. If some fail: Check Render service logs');
  console.log('3. If all fail: Redeploy services');
}

testNewDeployment();
