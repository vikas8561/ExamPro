const mongoose = require("mongoose");

const ResponseSchema = new mongoose.Schema({
  questionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Question', 
    required: true 
  },
  selectedOption: { type: String, default: "" },
  textAnswer: { type: String, default: "" },
  isCorrect: { type: Boolean, default: false },
  points: { type: Number, default: 0 }
}, { _id: false });

const PracticeTestSubmissionSchema = new mongoose.Schema({
  testId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Test', 
    required: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  responses: { type: [ResponseSchema], default: [] },
  totalScore: { type: Number, default: 0 },
  maxScore: { type: Number, default: 0 },
  correctCount: { type: Number, default: 0 },
  incorrectCount: { type: Number, default: 0 },
  notAnsweredCount: { type: Number, default: 0 },
  savedAt: { type: Date, default: Date.now },
  timeSpent: { type: Number, default: 0 },
  attemptNumber: { type: Number, default: 1 }, // Track attempt number for multiple attempts
  isCompleted: { type: Boolean, default: false } // Track if student has completed the practice test
}, { timestamps: true });

// Indexes for efficient queries
PracticeTestSubmissionSchema.index({ testId: 1, userId: 1, attemptNumber: 1 }, { unique: true });
PracticeTestSubmissionSchema.index({ userId: 1, savedAt: -1 });
PracticeTestSubmissionSchema.index({ testId: 1, savedAt: -1 });

module.exports = mongoose.model("PracticeTestSubmission", PracticeTestSubmissionSchema);
