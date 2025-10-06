// Script to update backend configuration for new Judge0 deployment
const fs = require('fs');
const path = require('path');

// Your new Judge0 deployment URL (replace with actual URL after deployment)
const NEW_JUDGE0_URL = 'https://your-judge0-api-full.onrender.com'; // Replace with actual URL

function updateJudge0Config() {
  console.log('🔧 Updating Judge0 configuration...');
  
  const configPath = path.join(__dirname, 'services', 'judge0.js');
  
  try {
    // Read current configuration
    let config = fs.readFileSync(configPath, 'utf8');
    
    // Update the JUDGE0_INSTANCES array
    const oldInstances = /const JUDGE0_INSTANCES = \[[\s\S]*?\];/;
    const newInstances = `const JUDGE0_INSTANCES = [
  process.env.JUDGE0_BASE_URL || '${NEW_JUDGE0_URL}',  // Your new deployment with all languages
  'https://judge0-api-b0cf.onrender.com',  // Fallback to old deployment
  'http://localhost:2358'  // Local fallback
];`;
    
    config = config.replace(oldInstances, newInstances);
    
    // Write updated configuration
    fs.writeFileSync(configPath, config);
    
    console.log('✅ Judge0 configuration updated successfully!');
    console.log(`📍 New primary instance: ${NEW_JUDGE0_URL}`);
    console.log('🔄 Fallback instances configured');
    
    console.log('\n📋 Next Steps:');
    console.log('1. Test the configuration: node test-all-languages-new.js');
    console.log('2. Start your backend server: npm start');
    console.log('3. Test with your frontend application');
    
  } catch (error) {
    console.error('❌ Error updating configuration:', error.message);
    console.log('\n🔧 Manual Update Required:');
    console.log(`Replace the JUDGE0_INSTANCES array in Backend/services/judge0.js with:`);
    console.log(`
const JUDGE0_INSTANCES = [
  process.env.JUDGE0_BASE_URL || '${NEW_JUDGE0_URL}',  // Your new deployment
  'https://judge0-api-b0cf.onrender.com',  // Fallback
  'http://localhost:2358'  // Local fallback
];
    `);
  }
}

// Instructions
console.log('📋 JUDGE0 CONFIGURATION UPDATER');
console.log('================================');
console.log('');
console.log('This script will update your backend to use the new Judge0 deployment.');
console.log('');
console.log('Before running:');
console.log('1. Deploy your Judge0 services to Render');
console.log('2. Get your new API URL from Render dashboard');
console.log('3. Update NEW_JUDGE0_URL in this script');
console.log('');
console.log('Current URL to update:', NEW_JUDGE0_URL);
console.log('');

if (NEW_JUDGE0_URL === 'https://your-judge0-api-full.onrender.com') {
  console.log('⚠️ Please update NEW_JUDGE0_URL with your actual deployment URL first!');
  console.log('');
  console.log('To find your URL:');
  console.log('1. Go to Render Dashboard');
  console.log('2. Click on your judge0-api-full service');
  console.log('3. Copy the URL from the service overview');
  console.log('4. Replace the URL in this script');
} else {
  updateJudge0Config();
}
