/**
 * When is an attempt over?
 *
 * Two clocks bound a sitting and they are not the same:
 *
 *   the assignment window  `deadline`, or startTime + duration -- when the exam
 *                          is available at all;
 *   the test time limit    startedAt + test.timeLimit -- the countdown the
 *                          student actually watches.
 *
 * An attempt is over as soon as EITHER clock closes -- the earlier of the
 * two (see attemptEndsAt). It used to be the later, which let a student who
 * started near the end of the window run past it; f14bc8e changed that.
 *
 * The rule lives here, and only here, because three places must agree on it
 * exactly: the submit route (when it stops accepting a paper), the sweep that
 * finalises abandoned attempts (when it takes over), and services/reEnable.js
 * (when an attempt can no longer be reopened). If any of them disagreed, a
 * student could be locked out mid-exam or handed an attempt they cannot submit.
 */

/**
 * How long past expiry the server leaves an attempt alone.
 *
 * The student's own page auto-submits the moment the clock hits zero and
 * retries three times, so this only has to outlast a slow network. Until it
 * elapses the browser owns the submission; after it, the server does.
 */
const SUBMISSION_GRACE_MS = 5 * 60 * 1000;

/** End of the availability window. */
function assignmentWindowEndsAt(assignment) {
  if (!assignment) return null;
  if (assignment.deadline) return new Date(assignment.deadline);
  if (!assignment.startTime || !assignment.duration) return null;

  const end = new Date(assignment.startTime);
  end.setMinutes(end.getMinutes() + assignment.duration);
  return end;
}

/** End of the student's countdown, if they have started. */
function testTimeEndsAt(assignment, test) {
  if (!assignment?.startedAt || !test?.timeLimit) return null;
  return new Date(new Date(assignment.startedAt).getTime() + test.timeLimit * 60000);
}

/**
 * The moment an attempt is finished: the earlier of the two clocks, so that
 * the test always ends at startTime + duration regardless of when the student
 * started.
 *
 * Returns null when neither can be determined, which is treated as "not
 * expired" everywhere -- never finalise an attempt on missing data.
 */
function attemptEndsAt(assignment, test) {
  const ends = [assignmentWindowEndsAt(assignment), testTimeEndsAt(assignment, test)]
    .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));

  if (ends.length === 0) return null;
  return new Date(Math.min(...ends.map((d) => d.getTime())));
}

/** Has the attempt run out, allowing `graceMs` of slack? */
function isAttemptExpired(assignment, test, graceMs = 0) {
  const endsAt = attemptEndsAt(assignment, test);
  if (!endsAt) return false;
  return Date.now() > endsAt.getTime() + graceMs;
}

/**
 * Has this attempt's window opened yet?
 *
 * The other half of the rule above, and it guards the paper itself. Nothing
 * used to check it except the /start route, so a student could open a
 * proctoring session days early and read the questions through
 * GET /assignments/:id or GET /tests/:id, or read them with no session at all
 * through the results route. Every route that hands a student question content
 * asks this first.
 *
 * Fails closed: an assignment with no usable startTime has not opened. The
 * field is required by the schema, so this only matters for damaged data, and
 * there the safe answer is to withhold the paper.
 */
function attemptOpensAt(assignment) {
  if (!assignment?.startTime) return null;
  const opensAt = new Date(assignment.startTime);
  return Number.isNaN(opensAt.getTime()) ? null : opensAt;
}

function hasAttemptOpened(assignment, now = Date.now()) {
  const opensAt = attemptOpensAt(assignment);
  if (!opensAt) return false;
  return now >= opensAt.getTime();
}

/**
 * The refusal every route sends for a paper requested before its window opens.
 * One shape, so the exam page can recognise it by `code` wherever it comes from.
 */
function notStartedBody(assignment) {
  const opensAt = attemptOpensAt(assignment);
  return {
    message: opensAt
      ? `This test has not started yet. It opens at ${opensAt.toISOString()}.`
      : "This test has not started yet.",
    code: "not_started",
    opensAt: opensAt ? opensAt.toISOString() : null,
    serverNow: new Date().toISOString(),
  };
}

/**
 * The attempt's clock, as the exam page needs it.
 *
 * The page used to work its countdown out for itself as startTime + duration --
 * the availability window alone. Whenever the window was longer than the test's
 * time limit, the student watched a timer with far more time on it than they
 * had: the server stopped accepting their paper at the time limit and the sweep
 * finalised it from autosaves, while the page still said there was an hour to go.
 *
 * So the page no longer derives anything. It is handed the one moment every
 * part of the server already agrees on (attemptEndsAt) together with the
 * server's own clock, and counts down to that.
 *
 * `serverNow` lets the page correct for a student's machine clock being wrong;
 * `remainingSeconds` is the same figure precomputed for callers that only want
 * a number.
 */
function attemptClock(assignment, test, now = new Date()) {
  const endsAt = attemptEndsAt(assignment, test);
  return {
    attemptEndsAt: endsAt ? endsAt.toISOString() : null,
    serverNow: now.toISOString(),
    remainingSeconds: endsAt
      ? Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000))
      : null,
  };
}

/**
 * When a student may see how they did: once their own availability window has
 * closed (plus the same 5-second buffer the results page always used).
 *
 * Until then, nothing about correctness reaches them -- not the per-question
 * right/wrong, not the answer key, and not the total score. A student who
 * finished early used to learn all of it from the hand-in response while
 * classmates in the same window were still sitting the paper.
 *
 * Fails closed: an assignment whose window cannot be determined is not released.
 */
const RESULTS_RELEASE_BUFFER_MS = 5000;

function resultsReleaseAt(assignment) {
  const end = assignmentWindowEndsAt(assignment);
  if (!end || Number.isNaN(end.getTime())) return null;
  return new Date(end.getTime() + RESULTS_RELEASE_BUFFER_MS);
}

function areResultsReleased(assignment, now = Date.now()) {
  const at = resultsReleaseAt(assignment);
  return Boolean(at) && now >= at.getTime();
}

module.exports = {
  RESULTS_RELEASE_BUFFER_MS,
  resultsReleaseAt,
  areResultsReleased,
  SUBMISSION_GRACE_MS,
  assignmentWindowEndsAt,
  testTimeEndsAt,
  attemptEndsAt,
  isAttemptExpired,
  attemptClock,
  attemptOpensAt,
  hasAttemptOpened,
  notStartedBody,
};
