const mongoose = require("mongoose");
const Assignment = require("../models/Assignment");
const User = require("../models/User");
require("dotenv").config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test-platform');
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
};

// Script to assign a default mentor to assignments that don't have one
const migrateAssignments = async () => {
  try {
    await connectDB();

    // Find the first available mentor
    const mentor = await User.findOne({ role: "Mentor" });
    
    if (!mentor) {
      console.log("No mentors found in the system. Please create a mentor user first.");
      process.exit(1);
    }

    console.log(`Using mentor: ${mentor.name} (${mentor.email})`);

    // Find assignments without a mentor
    const assignmentsWithoutMentor = await Assignment.find({ mentorId: null });
    
    console.log(`Found ${assignmentsWithoutMentor.length} assignments without a mentor`);

    if (assignmentsWithoutMentor.length === 0) {
      console.log("No assignments need migration. All assignments already have mentors assigned.");
      process.exit(0);
    }

    // Update assignments with the default mentor
    const updateResult = await Assignment.updateMany(
      { mentorId: null },
      { mentorId: mentor._id }
    );

    console.log(`Successfully updated ${updateResult.modifiedCount} assignments with mentor ID`);
    console.log("Migration completed successfully!");

    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

// Run the migration
migrateAssignments();
