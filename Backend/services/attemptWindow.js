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

module.exports = {
  SUBMISSION_GRACE_MS,
  assignmentWindowEndsAt,
  testTimeEndsAt,
  attemptEndsAt,
  isAttemptExpired,
};
