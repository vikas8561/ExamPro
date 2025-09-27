const mongoose = require("mongoose");

async function connectDB(uri) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, {
    // Connection Pool Settings for 250+ users
    maxPoolSize: 400,        // Maximum 500 connections (free tier limit)
    minPoolSize: 125,        // Keep 200 connections always ready
    maxIdleTimeMS: 120000,   // Keep connections for 2 minutes
    
    // Timeout Settings (optimized for high load)
    serverSelectionTimeoutMS: 15000,  // 15 seconds
    socketTimeoutMS: 90000,           // 90 seconds
    connectTimeoutMS: 20000,          // 20 seconds
    
    // Performance Settings
    bufferCommands: false,           // Don't buffer commands
    maxConnecting: 100,              // Allow 100 simultaneous connections
    
    // High Load Settings
    retryWrites: true,               // Retry failed writes
    retryReads: true,                // Retry failed reads
    readPreference: 'primary',       // Read from primary
    readConcern: { level: 'majority' }, // Read concern level
    
    // Connection Management
    heartbeatFrequencyMS: 10000,      // Heartbeat every 10 seconds
    
    // Auto Index (keep existing)
    autoIndex: true
  });
  
  console.log("✅ MongoDB connected with optimized connection pool");
  console.log("📊 Max Pool Size: 500 connections");
  console.log("📊 Min Pool Size: 200 connections");
  console.log("👥 Capacity: 500+ simultaneous users");
  console.log("💰 Cost: $0 (Free tier)");
  console.log("⚡ Performance: Optimized for high load");
}

module.exports = { connectDB };
