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

// Test case schemas for coding questions
const VisibleTestCaseSchema = new mongoose.Schema(
  {
    input: { type: String, required: true },
    output: { type: String, required: true }
  },
  { _id: true }
);

const HiddenTestCaseSchema = new mongoose.Schema(
  {
    input: { type: String, required: true },
    output: { type: String, required: true },
    marks: { type: Number, default: 1, min: 0 }
  },
  { _id: true }
);

const QuestionSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["mcq", "theory", "coding"], required: true },
    text: { type: String, required: true, trim: true },
    options: { type: [OptionSchema], default: undefined },
    answer: { type: String, default: "" },
    answers: { type: [String], default: [] }, // Removed MSQ support
    guidelines: { type: String, default: "" },
    examples: { type: [ExampleSchema], default: [] },
    points: { type: Number, default: 1, min: 0 },
    // Coding-only fields
    language: { type: String, default: "python", enum: ["python", "javascript", "java", "cpp", "c", "go"] },
    visibleTestCases: { type: [VisibleTestCaseSchema], default: [] },
    hiddenTestCases: { type: [HiddenTestCaseSchema], default: [] },
  },
  { _id: true }
);

const TestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subject: { type: String, default: "" },
    type: { type: String, enum: ["mcq", "theory", "coding", "mixed", "practice"], default: "mixed" },
    instructions: { type: String, default: "" },
    timeLimit: { type: Number, default: 30, min: 1 },
    negativeMarkingPercent: { type: Number, enum: [0, 0.25, 0.5, 0.75, 1], default: 0 },
    allowedTabSwitches: { 
      type: Number, 
      default: 0, 
      min: -1,
      max: 100,
      validate: {
        validator: function(value) {
          // Allow -1 (unlimited for practice tests) or 0-100
          return value === -1 || (value >= 0 && value <= 100);
        },
        message: 'allowedTabSwitches must be -1 (unlimited) or between 0 and 100'
      }
    },
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
    }
    if (q.kind === "coding") {
      // Hidden test cases can assign marks; total question points can be inferred on submit
      if (!Array.isArray(q.hiddenTestCases)) return false;
      // Ensure marks are non-negative numbers
      for (const h of q.hiddenTestCases) {
        if (typeof h.marks !== "number" || h.marks < 0) return false;
      }
      if (!Array.isArray(q.visibleTestCases)) return false;
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
