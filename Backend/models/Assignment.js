const mongoose = require("mongoose");

const TabViolationSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now
  },
  violationType: {
    type: String,
    enum: ["tab_switch", "window_open", "tab_close", "browser_switch"],
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

const PermissionSchema = new mongoose.Schema({
  cameraGranted: { type: Boolean, default: false },
  microphoneGranted: { type: Boolean, default: false },
  locationGranted: { type: Boolean, default: false },
  permissionRequestedAt: { type: Date, default: Date.now },
  permissionStatus: {
    type: String,
    enum: ["Pending", "Granted", "Partially Granted", "Denied"],
    default: "Pending"
  }
}, { _id: false });

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
    enum: ["Assigned", "In Progress", "Completed", "Overdue", "Cancelled"],
    default: "Assigned" 
  },
  startTime: {
    type: Date,
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  deadline: {
    type: Date,
    default: function() {
      // Calculate deadline based on startTime + duration
      if (this.startTime && this.duration) {
        const endTime = new Date(this.startTime);
        endTime.setMinutes(endTime.getMinutes() + this.duration);
        return endTime;
      }
      return null;
    }
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
  },
  // Tab monitoring fields
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
  lastViolationAt: Date,
  // Permission fields
  permissions: {
    type: PermissionSchema,
    default: null
  }
}, { timestamps: true });

// Indexes for efficient queries
AssignmentSchema.index({ userId: 1, status: 1 });
AssignmentSchema.index({ testId: 1, userId: 1 }, { unique: true });
AssignmentSchema.index({ mentorId: 1, status: 1 });
AssignmentSchema.index({ mentorId: 1, createdAt: -1 });
AssignmentSchema.index({ status: 1, deadline: 1 });
AssignmentSchema.index({ startTime: 1, deadline: 1 });
AssignmentSchema.index({ mentorId: 1, reviewStatus: 1 });
AssignmentSchema.index({ deadline: 1 });

module.exports = mongoose.model("Assignment", AssignmentSchema);
