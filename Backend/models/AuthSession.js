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
    // Mongo clears the row on its own once the JWT it tracks has expired.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "authsessions" }
);

AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AuthSession", AuthSessionSchema);
