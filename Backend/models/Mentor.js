const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const MentorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    // A mentor teaches one or more of the subjects ExamPro already knows about,
    // so these point at the `subjects` collection rather than free text.
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
  },
  { timestamps: true, collection: "mentors" }
);

MentorSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("Mentor", MentorSchema);
