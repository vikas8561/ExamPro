const mongoose = require("mongoose");

const OptionSchema = new mongoose.Schema(
  { text: { type: String, required: true } },
  { _id: false }
);

const QuestionSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["mcq", "theoretical"], required: true },
    text: { type: String, required: true, trim: true },
    options: { type: [OptionSchema], default: undefined },
    answer: { type: String, default: "" },
    guidelines: { type: String, default: "" },
    points: { type: Number, default: 1, min: 0 },
  },
  { _id: true }
);

const TestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subject: { type: String, default: "" },
    type: { type: String, enum: ["mcq", "theoretical", "mixed"], default: "mixed" },
    instructions: { type: String, default: "" },
    timeLimit: { type: Number, default: 30, min: 1 },
    status: {
      type: String,
      enum: ["Draft", "Active", "Archived"],
      default: "Draft",
    },
    questions: { type: [QuestionSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Validation for MCQ questions
TestSchema.path("questions").validate(function (questions) {
  for (const q of questions || []) {
    if (q.kind === "mcq") {
      if (!Array.isArray(q.options) || q.options.length < 2) return false;
      if (!q.answer || typeof q.answer !== "string") return false;
    }
  }
  return true;
}, "Invalid MCQ questions payload.");

module.exports = mongoose.model("Test", TestSchema);
