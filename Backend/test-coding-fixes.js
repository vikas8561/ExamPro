// Test script to verify coding fixes
const mongoose = require('mongoose');
const Test = require('./models/Test');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/exampro');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Test function
const testCodingFixes = async () => {
  try {
    console.log('🧪 Testing coding fixes...');
    
    // Find a test with coding questions
    const test = await Test.findOne({ 
      'questions.kind': 'coding',
      status: 'Active'
    }).populate('createdBy', 'name email');
    
    if (!test) {
      console.log('❌ No active test with coding questions found');
      return;
    }
    
    console.log('✅ Found test:', test.title);
    console.log('📝 Created by:', test.createdBy?.name);
    
    // Find coding questions
    const codingQuestions = test.questions.filter(q => q.kind === 'coding');
    console.log('🔢 Coding questions found:', codingQuestions.length);
    
    codingQuestions.forEach((q, index) => {
      console.log(`\n📋 Question ${index + 1}:`);
      console.log(`   ID: ${q._id}`);
      console.log(`   Language: ${q.language || 'Not set (will default to python)'}`);
      console.log(`   Text: ${q.text.substring(0, 100)}...`);
      console.log(`   Visible test cases: ${q.visibleTestCases?.length || 0}`);
      console.log(`   Hidden test cases: ${q.hiddenTestCases?.length || 0}`);
      
      if (q.visibleTestCases && q.visibleTestCases.length > 0) {
        console.log(`   First visible test case:`);
        console.log(`     Input: ${q.visibleTestCases[0].input}`);
        console.log(`     Output: ${q.visibleTestCases[0].output}`);
      }
    });
    
    console.log('\n🎯 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔒 Database connection closed');
  }
};

// Run the test
connectDB().then(() => {
  testCodingFixes();
});
