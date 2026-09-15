const mongoose = require("mongoose");
const { getStudentConnection } = require("../configs/studentDb");

// Read-only mirror of the university attendance platform's `students`
// collection. `strict: false` keeps every field the university stores (mentor
// links, attendance, profile links) reachable without ExamPro having to model
// them, and nothing here ever writes.
const StudentSchema = new mongoose.Schema(
  {
    studentName: String,
    studentEmail: String,
    UniversityUID: String,
    rollno: String,
    password: String,
    University: String,
    role: String,
    subject: [mongoose.Schema.Types.Mixed],
    mentor: [mongoose.Schema.Types.Mixed],
  },
  { strict: false, collection: "students", versionKey: false }
);

module.exports = getStudentConnection().model("Student", StudentSchema);
