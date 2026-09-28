const mongoose = require("mongoose");
const { getStudentConnection } = require("../configs/studentDb");

// The university attendance platform's `students` collection. ExamPro treats it
// as read-only with one exception: an admin resetting a locked-out student's
// password writes `password`, and nothing else, in routes/users.js.
// `strict: false` keeps every field the university stores (mentor links,
// attendance, profile links) reachable without ExamPro having to model them.
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
