const mongoose = require("mongoose");

const AssignmentSchema = new mongoose.Schema({
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
  mentorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  status: { 
    type: String, 
    enum: ["Assigned", "In Progress", "Completed", "Overdue"],
    default: "Assigned" 
  },
  deadline: { 
    type: Date, 
    required: true 
  },
  startedAt: Date,
  completedAt: Date,
  score: { 
    type: Number, 
    default: null 
  },
  autoScore: { 
    type: Number, 
    default: null 
  },
  mentorScore: {
    type: Number,
    default: null
  },
  mentorFeedback: {
    type: String,
    default: null
  },
  reviewStatus: {
    type: String,
    enum: ["Pending", "In Review", "Reviewed"],
    default: "Pending"
  },
  timeSpent: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Index for efficient queries
AssignmentSchema.index({ userId: 1, status: 1 });
AssignmentSchema.index({ testId: 1, userId: 1 }, { unique: true });
AssignmentSchema.index({ mentorId: 1, reviewStatus: 1 });
AssignmentSchema.index({ deadline: 1 });

module.exports = mongoose.model("Assignment", AssignmentSchema);
