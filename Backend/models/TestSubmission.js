const mongoose = require("mongoose");

const ResponseSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  selectedOption: { type: String, default: null },
  textAnswer: { type: String, default: null },
  isCorrect: { type: Boolean, default: false },
  points: { type: Number, default: 0 },
  autoGraded: { type: Boolean, default: false },
  geminiFeedback: { type: String, default: null }
}, { _id: false });

const TabViolationSchema = new mongoose.Schema({
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  violationType: { 
    type: String, 
    enum: ["tab_switch", "window_open", "tab_close", "browser_switch", "fullscreen_exit"],
    required: true 
  },
  details: { 
    type: String, 
    default: "" 
  },
  tabCount: { 
    type: Number, 
    default: 1 
  }
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
  reviewedAt: Date,
  // Tab monitoring fields
  permissions: {
    cameraGranted: { type: Boolean, default: false },
    microphoneGranted: { type: Boolean, default: false },
    locationGranted: { type: Boolean, default: false },
    permissionRequestedAt: { type: Date, default: Date.now },
    permissionStatus: {
      type: String,
      enum: ["Pending", "Granted", "Partially Granted", "Denied"],
      default: "Pending"
    }
  },
  tabViolations: {
    type: [TabViolationSchema],
    default: []
  },
  tabViolationCount: {
    type: Number,
    default: 0
  },
  cancelledDueToViolation: {
    type: Boolean,
    default: false
  },
  autoSubmit: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Indexes for efficient queries
TestSubmissionSchema.index({ assignmentId: 1, userId: 1 }, { unique: true });
TestSubmissionSchema.index({ userId: 1, submittedAt: -1 });
TestSubmissionSchema.index({ testId: 1, submittedAt: -1 });
TestSubmissionSchema.index({ submittedAt: -1 });
TestSubmissionSchema.index({ mentorReviewed: 1, submittedAt: -1 });
TestSubmissionSchema.index({ reviewStatus: 1, submittedAt: -1 });
TestSubmissionSchema.index({ mentorReviewed: 1, reviewStatus: 1 });

module.exports = mongoose.model("TestSubmission", TestSubmissionSchema);
