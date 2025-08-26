const mongoose = require('mongoose');
const Test = require('./models/Test');
const Assignment = require('./models/Assignment');
const TestSubmission = require('./models/TestSubmission');
const dbConfig = require('./configs/db.config');

// Connect to MongoDB
mongoose.connect(dbConfig.url, dbConfig.options)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

async function testDeletion() {
  try {
    console.log('Testing deletion functionality...');
    
    // Create a test to delete
    const test = await Test.create({
      title: 'Test Deletion Test',
      type: 'mcq',
      instructions: 'Test instructions',
      timeLimit: 30,
      questions: [],
      createdBy: 'test-user-id'
    });
    
    console.log('Created test:', test._id);
    
    // Create an assignment for this test
    const assignment = await Assignment.create({
      testId: test._id,
      userId: 'test-student-id',
      startTime: new Date(),
      duration: 60,
      status: 'Assigned'
    });
    
    console.log('Created assignment:', assignment._id);
    
    // Create a submission for this test
    const submission = await TestSubmission.create({
      testId: test._id,
      assignmentId: assignment._id,
      userId: 'test-student-id',
      responses: [],
      totalScore: 0,
      maxScore: 0,
      timeSpent: 0,
      submittedAt: new Date()
    });
    
    console.log('Created submission:', submission._id);
    
    // Now delete the test
    console.log('Deleting test...');
    await Test.findByIdAndDelete(test._id);
    
    // Check if assignments and submissions were deleted
    const remainingAssignments = await Assignment.find({ testId: test._id });
    const remainingSubmissions = await TestSubmission.find({ testId: test._id });
    
    console.log('Remaining assignments:', remainingAssignments.length);
    console.log('Remaining submissions:', remainingSubmissions.length);
    
    if (remainingAssignments.length === 0 && remainingSubmissions.length === 0) {
      console.log('✅ Deletion test PASSED: All associated data was deleted');
    } else {
      console.log('❌ Deletion test FAILED: Some associated data remains');
      console.log('Assignments remaining:', remainingAssignments);
      console.log('Submissions remaining:', remainingSubmissions);
    }
    
  } catch (error) {
    console.error('Error during deletion test:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

testDeletion();
