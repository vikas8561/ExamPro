const mongoose = require("mongoose");

const ResponseSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  selectedOption: { type: String, default: null },
  textAnswer: { type: String, default: null },
  language: { type: String, default: null }, // Language used for coding questions (python, javascript, java, cpp, c, go)
  isCorrect: { type: Boolean, default: false },
  points: { type: Number, default: 0 },
  totalMarks: { type: Number, default: 0, min: 0 }, // Max marks for this question (copied from Question.points at submission time)
  autoGraded: { type: Boolean, default: false },
  geminiFeedback: { type: String, default: null },
  correctAnswer: { type: String, default: null },
  errorAnalysis: { type: String, default: null },
  improvementSteps: { type: [String], default: [] },
  topicRecommendations: { type: [String], default: [] },
  
  evaluationStatus: {
    type: String,
    enum: ["Pending", "Evaluating", "Evaluated", "Failed"],
    default: "Pending"
  },
  // Judge0 measurements for coding answers. Recorded for the mentor's report
  // and for auditing a judge that may have been slow or starved of memory --
  // deliberately NOT sent back to the student, who is shown a verdict and a
  // pass count and nothing that invites re-submitting to shave off a
  // millisecond.
  runtimeMs: { type: Number, default: null },
  memoryKb: { type: Number, default: null },

  // How the best attempt scored, in cases rather than marks.
  //
  // Stored because grading a coding question is best-wins: deciding which of two
  // attempts to keep means comparing them, and comparing marks is a worse
  // question than comparing cases -- marks shift if an admin edits the
  // question's weight mid-test, cases do not. Also what the mentor's report
  // shows, instead of re-deriving a count from a score.
  passedCount: { type: Number, default: null },
  totalHidden: { type: Number, default: null },

  // The code the student is currently writing, which is NOT what was graded.
  //
  // Coding answers are graded best-wins, so `textAnswer` holds the attempt that
  // earned `points` and must survive the student carrying on typing. Autosave
  // therefore writes here once an answer has been graded, which keeps crash
  // recovery working without letting a work-in-progress draft quietly replace
  // the source behind a score. Null for MCQ and theory answers, where
  // `textAnswer` is simply the answer.
  draftAnswer: { type: String, default: null },

  // When the attempt that earned `points` was submitted.
  //
  // The document already carries a `submittedAt`, but that one belongs to the
  // paper as a whole and only means anything once the test is handed in. A
  // coding answer is submitted, graded and replaced repeatedly while the test
  // is still running, so it needs its own, and the student is shown it as their
  // receipt. Defaulted rather than required so the answers already in the
  // database keep loading.
  submittedAt: { type: Date, default: Date.now }
}, { _id: false });

const TabViolationSchema = new mongoose.Schema({
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  violationType: { 
    type: String, 
    // Extended, never renamed, so submissions made before the proctoring
    // rebuild still load and display correctly.
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
  // Student in the university's database - hydrate via services/principals.
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
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
  // Proctoring provenance, written at submit time from the server's own session
  // record rather than from anything the browser claims.
  proctorSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ProctorSession",
    default: null
  },
  // True when the global bypass code was used to waive the camera, microphone
  // and location checks, so a reviewer can always tell a bypassed attempt from
  // a clean one.
  proctorBypassUsed: {
    type: Boolean,
    default: false
  },
  // How this attempt stood in relation to Safe Exam Browser, so a reviewer can
  // tell a genuine locked-down attempt from one that fell back to the ordinary
  // browser-based proctoring:
  //   not_required — SEB was switched off system-wide when this was taken
  //   verified     — ran inside SEB and proved it on every check-in
  //   fallback     — SEB was required but unavailable; see proctorSebFallbackReason
  proctorSebStatus: {
    type: String,
    enum: ["not_required", "verified", "fallback"],
    default: "not_required"
  },
  proctorSebFallbackReason: {
    type: String,
    default: null
  },
  autoSubmit: {
    type: Boolean,
    default: false
  },
  // False while a student is still working: /api/coding/submit records
  // per-question Judge0 scores mid-test, and those records must not surface as
  // finished work. The final POST /api/test-submissions sets this true.
  // Legacy documents have no field at all, which reads as finalized.
  isFinalized: {
    type: Boolean,
    default: true
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

// Validation: givenMarks (points) must not exceed totalMarks for any response
TestSubmissionSchema.pre('save', function(next) {
  for (const response of this.responses || []) {
    // Null entries exist in stored submissions -- a sparse array serializes
    // its holes as null -- and reading a field off one threw here, so those
    // documents could not be save()d AT ALL. Every path that goes through
    // save() hit it: a mentor recording a review, a re-grade after a test
    // edit, the coding re-grade audit. An empty slot carries no marks, so
    // there is nothing here to validate.
    if (!response) continue;
    if (response.totalMarks > 0 && response.points > response.totalMarks) {
      return next(new Error(
        `Given marks (${response.points}) cannot exceed total marks (${response.totalMarks}) for question ${response.questionId}`
      ));
    }
    if (response.points < 0) {
      // Allow negative points only for MCQ with negative marking (points can be negative via negativeMarkingPercent)
      // This validator intentionally allows it since scoreCalculation.js applies negative marking
    }
  }
  next();
});

module.exports = mongoose.model("TestSubmission", TestSubmissionSchema);
