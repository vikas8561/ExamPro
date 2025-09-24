const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('../models/User');
const Test = require('../models/Test');
const Assignment = require('../models/Assignment');
const TestSubmission = require('../models/TestSubmission');

async function performanceMonitor() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 500,
      minPoolSize: 200,
      maxIdleTimeMS: 120000,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 90000,
      connectTimeoutMS: 20000,
      bufferCommands: false,
      maxConnecting: 100,
      retryWrites: true,
      retryReads: true,
      readPreference: 'primary',
      readConcern: { level: 'majority' },
      heartbeatFrequencyMS: 10000,
      autoIndex: true
    });

    console.log('🔗 Connected to MongoDB');
    console.log('📊 Performance Monitor for 1000+ Users');
    console.log('=' .repeat(50));

    // Test critical queries with timing
    const testQueries = async () => {
      console.log('\n🚀 Testing Critical Queries...\n');

      // Test 1: User queries
      console.log('1. Testing User Queries...');
      const start1 = Date.now();
      const users = await User.find({ role: 'Student' }).limit(100).lean();
      const time1 = Date.now() - start1;
      console.log(`   ✅ Found ${users.length} students in ${time1}ms`);

      // Test 2: Assignment queries
      console.log('2. Testing Assignment Queries...');
      const start2 = Date.now();
      const assignments = await Assignment.find({ status: 'Assigned' })
        .populate('userId', 'name email')
        .populate('testId', 'title type')
        .limit(100)
        .lean();
      const time2 = Date.now() - start2;
      console.log(`   ✅ Found ${assignments.length} assignments in ${time2}ms`);

      // Test 3: TestSubmission queries
      console.log('3. Testing TestSubmission Queries...');
      const start3 = Date.now();
      const submissions = await TestSubmission.find({})
        .populate('userId', 'name email')
        .populate('assignmentId', 'testId status')
        .sort({ submittedAt: -1 })
        .limit(100)
        .lean();
      const time3 = Date.now() - start3;
      console.log(`   ✅ Found ${submissions.length} submissions in ${time3}ms`);

      // Test 4: Complex compound queries
      console.log('4. Testing Complex Queries...');
      const start4 = Date.now();
      const complexQuery = await Assignment.find({
        $or: [
          { mentorId: new mongoose.Types.ObjectId() },
          { mentorId: null }
        ]
      })
        .populate('testId', 'title type instructions timeLimit')
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      const time4 = Date.now() - start4;
      console.log(`   ✅ Complex query completed in ${time4}ms`);

      return { time1, time2, time3, time4 };
    };

    const results = await testQueries();

    // Performance analysis
    console.log('\n📈 Performance Analysis:');
    console.log('=' .repeat(30));
    
    const analyzePerformance = (time, queryName) => {
      if (time < 100) {
        return `✅ ${queryName}: EXCELLENT (${time}ms) - Ready for 1000+ users`;
      } else if (time < 500) {
        return `⚠️ ${queryName}: GOOD (${time}ms) - Ready for 500+ users`;
      } else if (time < 1000) {
        return `🔶 ${queryName}: FAIR (${time}ms) - Ready for 250+ users`;
      } else {
        return `❌ ${queryName}: POOR (${time}ms) - Needs optimization`;
      }
    };

    console.log(analyzePerformance(results.time1, 'User Queries'));
    console.log(analyzePerformance(results.time2, 'Assignment Queries'));
    console.log(analyzePerformance(results.time3, 'TestSubmission Queries'));
    console.log(analyzePerformance(results.time4, 'Complex Queries'));

    // Overall assessment
    const avgTime = (results.time1 + results.time2 + results.time3 + results.time4) / 4;
    console.log(`\n🎯 Overall Performance: ${avgTime.toFixed(0)}ms average`);
    
    if (avgTime < 200) {
      console.log('🚀 EXCELLENT: Ready for 1000+ concurrent users!');
    } else if (avgTime < 500) {
      console.log('✅ GOOD: Ready for 500+ concurrent users');
    } else if (avgTime < 1000) {
      console.log('⚠️ FAIR: Ready for 250+ concurrent users');
    } else {
      console.log('❌ POOR: Needs optimization before scaling');
    }

    // Memory usage check
    const memUsage = process.memoryUsage();
    const formatMB = (bytes) => Math.round(bytes / 1024 / 1024 * 100) / 100;
    console.log('\n💾 Memory Usage:');
    console.log(`   RSS: ${formatMB(memUsage.rss)} MB`);
    console.log(`   Heap Used: ${formatMB(memUsage.heapUsed)} MB`);
    console.log(`   Heap Total: ${formatMB(memUsage.heapTotal)} MB`);

    if (memUsage.heapUsed > 500 * 1024 * 1024) {
      console.log('⚠️ WARNING: High memory usage detected');
    } else {
      console.log('✅ Memory usage is optimal');
    }

  } catch (error) {
    console.error('❌ Performance monitoring error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  performanceMonitor();
}

module.exports = { performanceMonitor };
