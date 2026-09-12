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
 * POST /api/test-submissions has always accepted a submission while EITHER is
 * still open, so an attempt is finished only once BOTH have closed. That rule
 * now lives here, because the sweep that finalises abandoned attempts has to
 * apply exactly the same one -- a sweep that thought an attempt was over
 * sooner than the submit route did would lock students out mid-exam.
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
 * The moment an attempt is finished: the later of the two clocks, matching the
 * submit route's "allow while either is open".
 *
 * Returns null when neither can be determined, which is treated as "not
 * expired" everywhere -- never finalise an attempt on missing data.
 */
function attemptEndsAt(assignment, test) {
  const ends = [assignmentWindowEndsAt(assignment), testTimeEndsAt(assignment, test)]
    .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));

  if (ends.length === 0) return null;
  return new Date(Math.max(...ends.map((d) => d.getTime())));
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
