const mongoose = require("mongoose");

// Single-session enforcement used to live on `User.activeSessions`. Students now
// authenticate against the university's database, which ExamPro must not write
// to, so the active token is tracked here instead - one row per signed-in
// principal, whatever collection that principal came from.
const AuthSessionSchema = new mongoose.Schema(
  {
    principalId: { type: String, required: true, index: true },
    role: { type: String, enum: ["Student", "Mentor", "Admin"], required: true },
    token: { type: String, required: true, index: true },
    // Mongo clears the row on its own once the JWT it tracks has expired. The
    // auth middleware also checks it, because the TTL monitor only runs once a
    // minute and a renewed token's predecessor is cut short (see below).
    expiresAt: { type: Date, required: true },
    // Set while this sign-in is sitting a live proctored exam, kept fresh by the
    // proctoring heartbeat. A sign-in elsewhere does not revoke such a session:
    // being kicked out mid-paper cost students their work. See middleware/auth.js.
    inExamUntil: { type: Date, default: null },
    // Set when this token was swapped for a renewed one. It stays valid for a
    // short overlap so requests already in flight with it are not refused.
    replacedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "authsessions" }
);

AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AuthSession", AuthSessionSchema);
