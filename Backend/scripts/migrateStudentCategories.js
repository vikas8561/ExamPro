const mongoose = require("mongoose");
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

// Helper function to check if email is SU student (student1@gmail.com to student123@gmail.com)
const isSUStudent = (email) => {
  const match = email.match(/^student(\d+)@gmail\.com$/);
  if (!match) return false;
  const num = parseInt(match[1], 10);
  return num >= 1 && num <= 123;
};

// Script to add studentCategory field to existing students
const migrateStudentCategories = async () => {
  try {
    await connectDB();

    // Find all students
    const allStudents = await User.find({ role: "Student" });

    console.log(`Found ${allStudents.length} students total`);

    let suCount = 0;
    let ruCount = 0;

    // Update each student based on email pattern
    for (const student of allStudents) {
      const category = isSUStudent(student.email) ? "SU" : "RU";
      await User.findByIdAndUpdate(student._id, { studentCategory: category });

      if (category === "SU") suCount++;
      else ruCount++;
    }

    console.log(`Successfully updated ${allStudents.length} students:`);
    console.log(`- ${suCount} students set to "SU" (student1@gmail.com to student123@gmail.com)`);
    console.log(`- ${ruCount} students set to "RU" (others)`);

    // Show summary
    const totalRU = await User.countDocuments({ role: "Student", studentCategory: "RU" });
    const totalSU = await User.countDocuments({ role: "Student", studentCategory: "SU" });
    const totalStudents = await User.countDocuments({ role: "Student" });

    console.log(`\nMigration completed!`);
    console.log(`Total students: ${totalStudents}`);
    console.log(`RU students: ${totalRU}`);
    console.log(`SU students: ${totalSU}`);

    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

// Run the migration
migrateStudentCategories();
