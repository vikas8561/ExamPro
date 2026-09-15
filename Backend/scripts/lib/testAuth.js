const AuthSession = require("../../models/AuthSession");

/**
 * Make a token live, the way logging in does.
 *
 * Single-session enforcement used to be `User.activeSessions`, so every test
 * harness wrote the token there. It now lives in the `authsessions` collection
 * (see Backend/middleware/auth.js), because students authenticate against the
 * university's database and ExamPro must not write to it. Harnesses that still
 * set `activeSessions` produce tokens the server rejects, and every request in
 * them comes back 403 — which reads as a catastrophic failure of whatever was
 * being tested rather than as a stale fixture.
 *
 * One helper, so the next change to how sessions are stored lands in one place.
 */
async function grantSession(user, token, { hours = 2 } = {}) {
  await AuthSession.create({
    principalId: String(user._id),
    role: user.role,
    token,
    expiresAt: new Date(Date.now() + hours * 3600_000),
  });
  return token;
}

/** Remove the sessions created for a set of users. Call it from cleanup. */
async function revokeSessions(userIds) {
  if (!userIds || userIds.length === 0) return;
  await AuthSession.deleteMany({ principalId: { $in: userIds.map(String) } });
}

module.exports = { grantSession, revokeSessions };
