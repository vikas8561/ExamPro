const mongoose = require("mongoose");

const OptionSchema = new mongoose.Schema(
  { text: { type: String, required: true } },
  { _id: false }
);

const ExampleSchema = new mongoose.Schema(
  {
    input: { type: String, default: "" },
    output: { type: String, default: "" }
  },
  { _id: false }
);

const QuestionSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["mcq", "msq", "theory", "coding"], required: true },
    text: { type: String, required: true, trim: true },
    options: { type: [OptionSchema], default: undefined },
    answer: { type: String, default: "" },
    answers: { type: [String], default: [] }, // For MSQ - multiple correct answers
    guidelines: { type: String, default: "" },
    examples: { type: [ExampleSchema], default: [] },
    points: { type: Number, default: 1, min: 0 },
  },
  { _id: true }
);

const TestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subject: { type: String, default: "" },
    type: { type: String, enum: ["mcq", "msq", "theory", "coding", "mixed", "practice"], default: "mixed" },
    instructions: { type: String, default: "" },
    timeLimit: { type: Number, default: 30, min: 1 },
    negativeMarkingPercent: { type: Number, enum: [0, 0.25, 0.5, 0.75, 1], default: 0 },
    allowedTabSwitches: { type: Number, default: 0, min: -1 },
    otp: { type: String, default: null }, // 6-digit OTP for permission bypass
    isPracticeTest: { type: Boolean, default: false }, // Flag to identify practice tests
    practiceTestSettings: {
      allowMultipleAttempts: { type: Boolean, default: true },
      showCorrectAnswers: { type: Boolean, default: false }, // For practice tests, don't show correct answers
      allowTabSwitching: { type: Boolean, default: true }, // Practice tests allow tab switching
      noProctoring: { type: Boolean, default: true } // Practice tests have no proctoring
    },
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

// Indexes for efficient queries
TestSchema.index({ createdBy: 1, status: 1 });
TestSchema.index({ status: 1, createdAt: -1 });
TestSchema.index({ type: 1, status: 1 });

// Virtual field for questionCount
TestSchema.virtual('questionCount').get(function() {
  return this.questions ? this.questions.length : 0;
});

// Ensure virtual fields are serialized
TestSchema.set('toJSON', { virtuals: true });
TestSchema.set('toObject', { virtuals: true });

// Validation for questions
TestSchema.path("questions").validate(function (questions) {
  for (const q of questions || []) {
    if (q.kind === "mcq") {
      if (!Array.isArray(q.options) || q.options.length < 2) return false;
      if (!q.answer || typeof q.answer !== "string") return false;
    } else if (q.kind === "msq") {
      if (!Array.isArray(q.options) || q.options.length < 2) return false;
      if (!Array.isArray(q.answers) || q.answers.length === 0) return false;
    }
  }
  return true;
}, "Invalid questions payload.");

// Validation for practice tests - only MCQ questions allowed
TestSchema.pre('save', function(next) {
  if (this.type === 'practice') {
    // Ensure all questions are MCQ for practice tests
    for (const q of this.questions || []) {
      if (q.kind !== 'mcq') {
        return next(new Error('Practice tests can only contain MCQ questions'));
      }
    }
  }
  next();
});

module.exports = mongoose.model("Test", TestSchema);
