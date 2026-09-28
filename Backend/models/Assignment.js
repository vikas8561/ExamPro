const mongoose = require("mongoose");

const TabViolationSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now
  },
  violationType: {
    type: String,
    // Extended, never renamed, so historical assignments still load.
    enum: ["tab_switch", "window_open", "tab_close", "browser_switch", "fullscreen_exit",
      "window_blur", "devtools_opened", "copy_attempt", "paste_attempt", "paste_internal",
      "context_menu",
      "blocked_key", "screen_share_stopped", "screen_share_wrong_surface",
      "second_monitor_detected", "permission_revoked", "heartbeat_lost",
      "page_tampered", "network_lost", "seb_integrity_lost"],
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
  // A student in the university's database. That lives on a separate
  // connection, so there is no ref to populate through - services/principals
  // hydrates it into { _id, name, email } instead.
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  mentorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mentor',
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
    default: function () {
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
  // The order this student's questions were served in, when the test has
  // shuffling enabled. Stored so a refresh mid-exam returns the same paper
  // rather than reshuffling under the student. Empty means "not shuffled yet".
  questionOrder: {
    type: [mongoose.Schema.Types.ObjectId],
    default: []
  },
  // Permission fields
  permissions: {
    type: PermissionSchema,
    default: null
  },
  // Safe Exam Browser launch details for this attempt.
  //
  // SEB hashes its Browser Exam Key with the URL of the page it is showing, so
  // that hash is a fixed value per URL. Giving every attempt its own nonce — and
  // therefore its own exam URL — is what stops one student reading the hash once
  // and the rest of the class replaying it from an ordinary browser.
  //
  // Minted once and then reused for the whole attempt: rotating it would break
  // verification for a student whose machine restarted and relaunched SEB.
  sebLaunch: {
    nonce: { type: String, default: null },
    examUrl: { type: String, default: null },
    issuedAt: { type: Date, default: null }
  }
}, { timestamps: true });

// Indexes for efficient queries
AssignmentSchema.index({ userId: 1, status: 1 });
// The student's own card list: GET /api/assignments/student matches on userId
// and sorts by startTime, newest first. Without the sort key in the index Mongo
// has to pull every one of the student's assignments and sort them in memory
// before it can hand back a page of nine.
AssignmentSchema.index({ userId: 1, startTime: -1, createdAt: -1 });
AssignmentSchema.index({ testId: 1, userId: 1 }, { unique: true });
AssignmentSchema.index({ mentorId: 1, status: 1 });
AssignmentSchema.index({ mentorId: 1, createdAt: -1 });
AssignmentSchema.index({ status: 1, deadline: 1 });
AssignmentSchema.index({ startTime: 1, deadline: 1 });
AssignmentSchema.index({ mentorId: 1, reviewStatus: 1 });
AssignmentSchema.index({ deadline: 1 });

module.exports = mongoose.model("Assignment", AssignmentSchema);
