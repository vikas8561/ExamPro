const mongoose = require("mongoose");

/**
 * One live proctoring session per exam attempt.
 *
 * This is the server's own record of an exam in progress, and it is what makes
 * the rebuilt system hard to cheat: the violation count lives here, on the
 * server, not in the student's browser where it can be edited.
 *
 * It holds operational state only — no media, no images, no audio, ever. When
 * the exam finishes, the violation list is copied onto the submission and this
 * document is disposable; the TTL index below clears it automatically.
 */

const SessionViolationSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    violationType: { type: String, required: true },
    details: { type: String, default: "" },
    // What this violation cost the student. 0 means recorded but not charged.
    weight: { type: Number, default: 1 },
  },
  { _id: false }
);

const ProctorSessionSchema = new mongoose.Schema(
  {
    // Student in the university's database - hydrate via services/principals.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
      index: true,
    },
    testId: { type: mongoose.Schema.Types.ObjectId, ref: "Test", required: true },

    // Which exam surface opened this session, for the report.
    testKind: {
      type: String,
      enum: ["assigned", "coding"],
      default: "assigned",
    },

    status: {
      type: String,
      enum: ["active", "ended", "terminated"],
      default: "active",
      index: true,
    },

    // The rulebook this session started under, frozen at start time. If an admin
    // edits the test mid-exam, the student is still judged by the rules they
    // were shown.
    policy: { type: mongoose.Schema.Types.Mixed, default: {} },

    // The authoritative count. Weighted, so a devtools open costs more than a
    // brief loss of focus.
    violationCount: { type: Number, default: 0 },
    violations: { type: [SessionViolationSchema], default: [] },

    // Used to collapse repeat reports of the same thing — some browsers fire
    // several events for one action. Keyed by violation type.
    lastViolationByType: {
      type: Map,
      of: Date,
      default: () => new Map(),
    },

    // Whether the browser is still checking in. A browser that goes quiet is
    // treated as a browser that is hiding something.
    lastHeartbeatAt: { type: Date, default: Date.now },
    heartbeatLostCount: { type: Number, default: 0 },

    // Text record of what the student granted. No media is ever read.
    permissions: {
      screen: { type: Boolean, default: false },
      camera: { type: Boolean, default: false },
      microphone: { type: Boolean, default: false },
      location: { type: Boolean, default: false },
    },

    // Set when the global OTP was used to waive camera/mic/location, so a
    // reviewer can always tell a bypassed attempt from a clean one.
    bypass: {
      used: { type: Boolean, default: false },
      usedAt: { type: Date, default: null },
      scope: { type: [String], default: [] },
      // Wrong codes tried in this session, so the OTP cannot be guessed by
      // brute force one attempt at a time.
      failedAttempts: { type: Number, default: 0 },
      lockedUntil: { type: Date, default: null },
    },

    // Plain text notes about the browser, for the report and for support.
    // Nothing here identifies the machine beyond what the browser volunteers.
    environment: {
      browser: { type: String, default: "" },
      isBrave: { type: Boolean, default: false },
      platform: { type: String, default: "" },
      keyboardLockSupported: { type: Boolean, default: false },
      secondMonitor: { type: String, enum: ["yes", "no", "unknown"], default: "unknown" },
    },

    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    terminatedReason: { type: String, default: null },
  },
  { timestamps: true }
);

// The lookup the session guard does on every protected request.
ProctorSessionSchema.index({ userId: 1, assignmentId: 1, status: 1 });

// Sessions are working state, not records. Everything worth keeping is copied
// onto the submission at the end, so these clear themselves after two days —
// far longer than any exam, short enough that nothing lingers.
ProctorSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800 });

/** True when the browser has checked in recently enough to be trusted. */
ProctorSessionSchema.methods.isHealthy = function (graceMs) {
  if (this.status !== "active") return false;
  const grace = graceMs || (this.policy && this.policy.heartbeatGraceMs) || 20000;
  return Date.now() - new Date(this.lastHeartbeatAt).getTime() <= grace;
};

module.exports = mongoose.model("ProctorSession", ProctorSessionSchema);
