const mongoose = require("mongoose");

/**
 * A frame of the student's screen, captured when a violation was recorded.
 *
 * This is the one place in the system that stores an image of anything, and it
 * is a deliberate reversal of what the proctoring system promised before it
 * existed. Read that as a warning rather than a footnote: a whole-screen capture
 * is *whole screen*. Whatever else the student had open — messages, mail,
 * medical or banking pages behind the exam window — is in the frame too. The
 * evidence is only useful because it shows what else was on screen, so it cannot
 * be narrowed to the exam window without becoming pointless.
 *
 * Three consequences are built into this schema rather than left to policy:
 *
 *   - It deletes itself. The TTL index below is the mechanism, not a cron job
 *     somebody has to remember to run and nobody notices has stopped.
 *   - It is small. Frames arrive downscaled and JPEG-compressed, which is enough
 *     to see which application is in front and not enough to read someone's
 *     account balance over their shoulder.
 *   - It is bounded. The route that writes these enforces a minimum gap between
 *     captures, so a detector that misfires in a loop cannot fill the database.
 */

const ProctorScreenshotSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProctorSession",
      required: true,
      index: true,
    },
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
      index: true,
    },
    // Student in the university's database — no `ref`, hydrate via principals.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    /** What was being recorded when this was taken. */
    violationType: { type: String, required: true },
    details: { type: String, default: "" },

    /** Whether the violation counted against the student, for the reviewer. */
    charged: { type: Boolean, default: false },

    image: { type: Buffer, required: true },
    contentType: { type: String, default: "image/jpeg" },
    bytes: { type: Number, default: 0 },

    takenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

/**
 * Seventy-two hours, enforced by MongoDB itself.
 *
 * A TTL index deletes these whether or not the application is running, whether
 * or not anyone remembers, and whether or not a sweep job silently died. For
 * data this sensitive that difference matters more than the exact number.
 */
ProctorScreenshotSchema.index({ takenAt: 1 }, { expireAfterSeconds: 72 * 60 * 60 });

/** The reviewer's lookup: everything captured during one attempt, in order. */
ProctorScreenshotSchema.index({ assignmentId: 1, takenAt: 1 });

module.exports = mongoose.model("ProctorScreenshot", ProctorScreenshotSchema);
