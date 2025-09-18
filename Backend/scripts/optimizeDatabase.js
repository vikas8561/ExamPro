const mongoose = require('mongoose');

// Database optimization script
const optimizeDatabase = async () => {
  try {
    console.log('Starting database optimization...');

    // Create indexes for better query performance
    const indexes = [
      // Assignment indexes
      {
        collection: 'assignments',
        index: { userId: 1, status: 1 },
        options: { background: true }
      },
      {
        collection: 'assignments',
        index: { mentorId: 1, status: 1 },
        options: { background: true }
      },
      {
        collection: 'assignments',
        index: { testId: 1, createdAt: -1 },
        options: { background: true }
      },
      {
        collection: 'assignments',
        index: { deadline: 1 },
        options: { background: true }
      },

      // TestSubmission indexes
      {
        collection: 'testsubmissions',
        index: { assignmentId: 1 },
        options: { background: true }
      },
      {
        collection: 'testsubmissions',
        index: { userId: 1, submittedAt: -1 },
        options: { background: true }
      },
      {
        collection: 'testsubmissions',
        index: { testId: 1, submittedAt: -1 },
        options: { background: true }
      },

      // Test indexes
      {
        collection: 'tests',
        index: { subject: 1, type: 1 },
        options: { background: true }
      },
      {
        collection: 'tests',
        index: { createdAt: -1 },
        options: { background: true }
      },

      // User indexes
      {
        collection: 'users',
        index: { email: 1 },
        options: { unique: true, background: true }
      },
      {
        collection: 'users',
        index: { role: 1, studentCategory: 1 },
        options: { background: true }
      }
    ];

    // Create indexes
    for (const indexConfig of indexes) {
      try {
        await mongoose.connection.db.collection(indexConfig.collection)
          .createIndex(indexConfig.index, indexConfig.options);
        console.log(`✓ Created index on ${indexConfig.collection}:`, indexConfig.index);
      } catch (error) {
        if (error.code === 11000) {
          console.log(`✓ Index already exists on ${indexConfig.collection}:`, indexConfig.index);
        } else {
          console.error(`✗ Failed to create index on ${indexConfig.collection}:`, error.message);
        }
      }
    }

    // Analyze collections for optimization
    const collections = ['assignments', 'testsubmissions', 'tests', 'users'];
    
    for (const collectionName of collections) {
      try {
        const stats = await mongoose.connection.db.collection(collectionName).stats();
        console.log(`\n${collectionName} collection stats:`);
        console.log(`  Documents: ${stats.count}`);
        console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Indexes: ${stats.nindexes}`);
        console.log(`  Average document size: ${(stats.avgObjSize / 1024).toFixed(2)} KB`);
        
        // Suggest optimizations
        if (stats.avgObjSize > 1024) {
          console.log(`  ⚠️  Large average document size - consider data normalization`);
        }
        if (stats.nindexes > 5) {
          console.log(`  ⚠️  Many indexes - review for unused indexes`);
        }
      } catch (error) {
        console.error(`Failed to get stats for ${collectionName}:`, error.message);
      }
    }

    // Clean up old data (optional)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Remove old test submissions (older than 30 days)
    const deletedSubmissions = await mongoose.connection.db.collection('testsubmissions')
      .deleteMany({ submittedAt: { $lt: thirtyDaysAgo } });
    
    if (deletedSubmissions.deletedCount > 0) {
      console.log(`\n✓ Cleaned up ${deletedSubmissions.deletedCount} old test submissions`);
    }

    // Compact collections to reclaim space
    console.log('\nCompacting collections...');
    for (const collectionName of collections) {
      try {
        await mongoose.connection.db.command({ compact: collectionName });
        console.log(`✓ Compacted ${collectionName}`);
      } catch (error) {
        console.log(`⚠️  Could not compact ${collectionName}: ${error.message}`);
      }
    }

    console.log('\n✅ Database optimization completed!');

  } catch (error) {
    console.error('❌ Database optimization failed:', error);
  }
};

// Query optimization suggestions
const getQueryOptimizationSuggestions = () => {
  return {
    assignments: [
      'Use lean() for read-only queries',
      'Limit populated fields with select()',
      'Use aggregation pipelines for complex queries',
      'Add compound indexes for multi-field queries'
    ],
    testsubmissions: [
      'Use pagination for large result sets',
      'Project only needed fields',
      'Use aggregation for grouping operations',
      'Cache frequently accessed data'
    ],
    tests: [
      'Limit questions array size in responses',
      'Use text indexes for search functionality',
      'Cache test metadata',
      'Optimize question structure'
    ],
    users: [
      'Use sparse indexes for optional fields',
      'Limit user data in responses',
      'Cache user roles and permissions',
      'Use projection for sensitive data'
    ]
  };
};

module.exports = {
  optimizeDatabase,
  getQueryOptimizationSuggestions
};
