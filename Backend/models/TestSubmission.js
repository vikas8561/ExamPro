const mongoose = require("mongoose");

const ResponseSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  selectedOption: { type: String, default: null },
  textAnswer: { type: String, default: null },
  isCorrect: { type: Boolean, default: false },
  points: { type: Number, default: 0 },
  autoGraded: { type: Boolean, default: false }
}, { _id: false });

const TestSubmissionSchema = new mongoose.Schema({
  assignmentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Assignment', 
    required: true 
  },
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
  submittedAt: { type: Date, default: Date.now },
  timeSpent: { type: Number, default: 0 },
  mentorReviewed: { type: Boolean, default: false },
  mentorScore: { type: Number, default: null },
  mentorFeedback: { type: String, default: null },
  reviewStatus: {
    type: String,
    enum: ["Pending", "In Review", "Reviewed"],
    default: "Pending"
  },
  reviewedAt: Date
}, { timestamps: true });

// Indexes for efficient queries
TestSubmissionSchema.index({ assignmentId: 1, userId: 1 }, { unique: true });
TestSubmissionSchema.index({ userId: 1, submittedAt: -1 });
TestSubmissionSchema.index({ testId: 1, submittedAt: -1 });
TestSubmissionSchema.index({ mentorReviewed: 1, reviewStatus: 1 });

module.exports = mongoose.model("TestSubmission", TestSubmissionSchema);
