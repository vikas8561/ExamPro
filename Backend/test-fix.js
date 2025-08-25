// Test script to verify the fix for the 400 error
// This simulates the problematic scenario where test was started after deadline

const mongoose = require('mongoose');
const Assignment = require('./models/Assignment');

async function testFix() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test-platform');
    console.log('Connected to MongoDB');

    // Find the problematic assignment
    const assignment = await Assignment.findById('68a7e9d4378e7c7327ec28dc');
    
    if (!assignment) {
      console.log('Assignment not found');
      return;
    }

    console.log('Current assignment status:', assignment.status);
    console.log('Deadline:', assignment.deadline);
    console.log('Started at:', assignment.startedAt);

    // Simulate the validation logic
    const now = new Date();
    const deadline = new Date(assignment.deadline);
    deadline.setUTCHours(23, 59, 59, 999);

    console.log('\n=== VALIDATION CHECKS ===');
    console.log('Current time:', now);
    console.log('Deadline (end of day):', deadline);
    console.log('Is deadline passed?', now > deadline);
    console.log('Was started after deadline?', assignment.startedAt && assignment.startedAt > deadline);

    if (assignment.status === 'In Progress') {
      if (assignment.startedAt && assignment.startedAt > deadline) {
        console.log('\n✅ FIX: Test started after deadline - should be marked as completed');
        assignment.status = 'Completed';
        assignment.completedAt = new Date();
        await assignment.save();
        console.log('Assignment marked as completed');
      } else {
        console.log('\n❌ Test already started normally');
      }
    }

    console.log('\nFinal assignment status:', assignment.status);

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

testFix();
