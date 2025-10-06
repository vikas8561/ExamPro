// Quick setup script for RapidAPI Judge0 (all languages supported)
const fetch = require('node-fetch');

// Replace with your RapidAPI key
const RAPIDAPI_KEY = 'YOUR_RAPIDAPI_KEY_HERE'; // Get from https://rapidapi.com/judge0-official/api/judge0-ce

async function testRapidAPIJudge0() {
  console.log('🧪 Testing RapidAPI Judge0 with all languages...');
  
  const headers = {
    'Content-Type': 'application/json',
    'X-RapidAPI-Key': RAPIDAPI_KEY,
    'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
  };
  
  // Test languages
  const languages = [
    { name: 'Python', code: 'print("Hello Python!")', expected: 'Hello Python!', id: 71 },
    { name: 'JavaScript', code: 'console.log("Hello JavaScript!");', expected: 'Hello JavaScript!', id: 63 },
    { name: 'Java', code: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello Java!");
    }
}`, expected: 'Hello Java!', id: 62 },
    { name: 'C++', code: `#include <iostream>
using namespace std;
int main() {
    cout << "Hello C++!" << endl;
    return 0;
}`, expected: 'Hello C++!', id: 54 },
    { name: 'C', code: `#include <stdio.h>
int main() {
    printf("Hello C!\\n");
    return 0;
}`, expected: 'Hello C!', id: 50 }
  ];
  
  for (const lang of languages) {
    console.log(`\\n📝 Testing ${lang.name}...`);
    
    try {
      // Create submission
      const submissionResponse = await fetch('https://judge0-ce.p.rapidapi.com/submissions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source_code: lang.code,
          language_id: lang.id,
          stdin: '',
          expected_output: lang.expected
        })
      });
      
      const submission = await submissionResponse.json();
      console.log(`✅ ${lang.name} submission created: ${submission.token}`);
      
      // Poll for result
      let attempts = 0;
      while (attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const resultResponse = await fetch(`https://judge0-ce.p.rapidapi.com/submissions/${submission.token}`, {
          headers: {
            'X-RapidAPI-Key': RAPIDAPI_KEY,
            'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
          }
        });
        
        const result = await resultResponse.json();
        
        if (result.status && result.status.id > 2) {
          if (result.status.id === 3) {
            console.log(`✅ ${lang.name}: PASSED - Output: "${result.stdout}"`);
          } else {
            console.log(`❌ ${lang.name}: FAILED - Status: ${result.status.description}`);
          }
          break;
        }
        
        attempts++;
      }
      
    } catch (error) {
      console.log(`❌ ${lang.name}: ERROR - ${error.message}`);
    }
  }
}

if (RAPIDAPI_KEY === 'YOUR_RAPIDAPI_KEY_HERE') {
  console.log('📋 SETUP INSTRUCTIONS:');
  console.log('1. Go to: https://rapidapi.com/judge0-official/api/judge0-ce');
  console.log('2. Sign up for free account');
  console.log('3. Subscribe to "Basic" plan (FREE)');
  console.log('4. Copy your API key');
  console.log('5. Replace YOUR_RAPIDAPI_KEY_HERE in this file');
  console.log('6. Run: node setup-rapidapi-judge0.js');
} else {
  testRapidAPIJudge0();
}
