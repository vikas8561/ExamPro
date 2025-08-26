const mongoose = require('mongoose');
const Test = require('./models/Test');
const Assignment = require('./models/Assignment');
const TestSubmission = require('./models/TestSubmission');

// Connect to MongoDB using the same config as server.js
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test-platform';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

async function testDeletion() {
  try {
    console.log('Testing deletion functionality...');
    
    // Create valid ObjectId values
    const testUserId = new mongoose.Types.ObjectId();
    const testStudentId = new mongoose.Types.ObjectId();
    
    // Create a test to delete
    const test = await Test.create({
      title: 'Test Deletion Test',
      type: 'mcq',
      instructions: 'Test instructions',
      timeLimit: 30,
      questions: [],
      createdBy: testUserId
    });
    
    console.log('Created test:', test._id);
    
    // Create an assignment for this test
    const assignment = await Assignment.create({
      testId: test._id,
      userId: testStudentId,
      startTime: new Date(),
      duration: 60,
      status: 'Assigned'
    });
    
    console.log('Created assignment:', assignment._id);
    
    // Create a submission for this test
    const submission = await TestSubmission.create({
      testId: test._id,
      assignmentId: assignment._id,
      userId: testStudentId,
      responses: [],
      totalScore: 0,
      maxScore: 0,
      timeSpent: 0,
      submittedAt: new Date()
    });
    
    console.log('Created submission:', submission._id);
    
    // Now delete the test using the route logic
    console.log('Deleting test...');
    
    // Simulate the route deletion logic
    const TestSubmissionModel = require('./models/TestSubmission');
    const AssignmentModel = require('./models/Assignment');
    const TestModel = require('./models/Test');

    // Delete associated submissions
    await TestSubmissionModel.deleteMany({ testId: test._id });
    
    // Delete associated assignments
    await AssignmentModel.deleteMany({ testId: test._id });

    // Delete the test
    await TestModel.findByIdAndDelete(test._id);

    // Check if assignments and submissions were deleted
    const remainingAssignments = await AssignmentModel.find({ testId: test._id });
    const remainingSubmissions = await TestSubmissionModel.find({ testId: test._id });
    const remainingTest = await TestModel.findById(test._id);
    
    console.log('Remaining test:', remainingTest ? remainingTest._id : 'None');
    console.log('Remaining assignments:', remainingAssignments.length);
    console.log('Remaining submissions:', remainingSubmissions.length);
    
    if (!remainingTest && remainingAssignments.length === 0 && remainingSubmissions.length === 0) {
      console.log('✅ Deletion test PASSED: All associated data was deleted');
    } else {
      console.log('❌ Deletion test FAILED: Some associated data remains');
      console.log('Test remaining:', remainingTest);
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
