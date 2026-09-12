/**
 * Finalise attempts whose clock ran out with nobody watching.
 *
 * The exam page auto-submits the moment the timer hits zero, but that only
 * works while the page is still open. If the student closes the laptop, the tab
 * crashes, or the network drops, nothing ever finished the attempt: it sat at
 * "In Progress" with no score indefinitely, and the answers autosaved to its
 * TestSubmission were never graded or shown to anyone.
 *
 * This sweep is the server's own backstop. It only touches attempts that are
 * past SUBMISSION_GRACE_MS, so a browser that is still alive always gets to
 * submit first -- the grace window is deliberately far longer than the page's
 * own submit-and-retry takes.
 *
 * It marks the paper with services/submissionGrading.js, the same code path
 * POST /api/test-submissions uses, so a swept attempt scores exactly what it
 * would have scored had the student's browser submitted it.
 */

const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const TestSubmission = require("../models/TestSubmission");
const ProctorSession = require("../models/ProctorSession");
const { gradeSubmission } = require("./submissionGrading");
const { isAttemptExpired, SUBMISSION_GRACE_MS } = require("./attemptWindow");

/** Bound the work per run so one sweep can never monopolise the process. */
const MAX_PER_RUN = 200;

/**
 * Finalise one attempt.
 *
 * Ordering matters: grade first (pure, in memory), then claim the assignment
 * with a conditional update, and only write once the claim is won. If two
 * workers sweep at once they may both grade, but exactly one persists.
 *
 * @returns true if this call finalised the attempt
 */
async function finalizeAttempt(assignment, test) {
  // Whatever the student managed to autosave before they disappeared.
  const submission = await TestSubmission.findOne({
    assignmentId: assignment._id,
    userId: assignment.userId,
  }).lean();

  const priorAutoGraded = new Map(
    (submission?.responses || [])
      .filter((response) => response.autoGraded)
      .map((response) => [response.questionId.toString(), response])
  );

  const { processedResponses, totalScore, maxScore } = gradeSubmission({
    test,
    responses: submission?.responses || [],
    priorAutoGraded,
  });

  // Claim it. The status guard is what makes this safe to run concurrently and
  // safe to run alongside a student's own late submission: whoever gets here
  // first wins, and the loser does nothing.
  const claim = await Assignment.findOneAndUpdate(
    { _id: assignment._id, status: "In Progress" },
    {
      $set: {
        status: "Completed",
        completedAt: new Date(),
        autoScore: totalScore,
        reviewStatus: "Reviewed",
      },
    },
    { new: true }
  );

  if (!claim) return false;

  const proctorSession = await ProctorSession.findOne({ assignmentId: assignment._id }).lean();

  await TestSubmission.findOneAndUpdate(
    { assignmentId: assignment._id, userId: assignment.userId },
    {
      $set: {
        testId: test._id,
        responses: processedResponses,
        totalScore,
        maxScore,
        submittedAt: new Date(),
        isFinalized: true,
        // Recorded as an auto-submit because that is what it is -- the server
        // doing for the student what their browser was not there to do.
        autoSubmit: true,
        mentorReviewed: true,
        reviewStatus: "Reviewed",
        reviewedAt: new Date(),
        ...(proctorSession
          ? {
            proctorSessionId: proctorSession._id,
            proctorBypassUsed: proctorSession.bypass?.used === true,
            tabViolationCount: proctorSession.violationCount || 0,
            tabViolations: (proctorSession.violations || []).map((v) => ({
              timestamp: v.timestamp,
              violationType: v.violationType,
              details: v.details || "",
              tabCount: 1,
            })),
            cancelledDueToViolation: proctorSession.status === "terminated",
          }
          : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Close the session so the attempt cannot be reopened.
  await ProctorSession.updateOne(
    { assignmentId: assignment._id, status: { $ne: "terminated" } },
    { $set: { status: "ended", endedAt: new Date() } }
  ).catch(() => {
    // Best effort; the finalised submission is what matters.
  });

  return true;
}

/**
 * One pass over every attempt still marked "In Progress".
 *
 * @returns {{ examined: number, finalized: number, failed: number }}
 */
async function sweepExpiredAttempts({ graceMs = SUBMISSION_GRACE_MS } = {}) {
  const inProgress = await Assignment.find({ status: "In Progress" })
    .select("_id userId testId status startTime duration deadline startedAt")
    .limit(MAX_PER_RUN)
    .lean();

  let finalized = 0;
  let failed = 0;

  for (const assignment of inProgress) {
    try {
      // `questions` is needed to mark the paper, not just `timeLimit`.
      const test = await Test.findById(assignment.testId)
        .select("questions timeLimit negativeMarkingPercent")
        .lean();

      // No test, no defensible score -- leave it alone for a human to look at.
      if (!test) continue;
      if (!isAttemptExpired(assignment, test, graceMs)) continue;

      if (await finalizeAttempt(assignment, test)) finalized++;
    } catch (error) {
      failed++;
      console.error(`Sweep failed to finalise assignment ${assignment._id}:`, error.message);
    }
  }

  if (finalized || failed) {
    console.log(`🧹 Expired-attempt sweep: finalised ${finalized}, failed ${failed}, of ${inProgress.length} in progress`);
  }

  return { examined: inProgress.length, finalized, failed };
}

/** Run the sweep on a timer. Returns the handle so it can be stopped. */
function startExpiredAttemptSweep({ intervalMs = 60000 } = {}) {
  const handle = setInterval(() => {
    sweepExpiredAttempts().catch((error) => {
      console.error("Expired-attempt sweep crashed:", error.message);
    });
  }, intervalMs);

  // Never hold the process open just for the sweep.
  if (typeof handle.unref === "function") handle.unref();
  return handle;
}

module.exports = {
  SUBMISSION_GRACE_MS,
  MAX_PER_RUN,
  finalizeAttempt,
  sweepExpiredAttempts,
  startExpiredAttemptSweep,
};
