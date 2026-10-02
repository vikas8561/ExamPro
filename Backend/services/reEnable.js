/**
 * Reopening an exam that was handed in before its time was up.
 *
 * A test can end early for reasons that are nobody's fault, or that an
 * invigilator decides to forgive: proctoring cancelled it on a violation, the
 * exam page submitted it automatically, or the student pressed Submit by
 * mistake. An admin, or a mentor for a student in their batches, can reopen it
 * so the student carries on where they left off.
 *
 * Three rules hold everywhere, and this file is the only place that applies them:
 *
 *  1. **Only inside the attempt's time.** The deadline is `attemptEndsAt` from
 *     services/attemptWindow.js, the same function that decides when the submit
 *     route stops accepting the paper and when the expiry sweep takes over, so a
 *     reopened attempt is always one the student can still hand in. Once it has
 *     passed, nobody can reopen anything, whatever their role.
 *  2. **The clock never stops.** No time is added. The student gets back exactly
 *     what was left on the attempt they already had.
 *  3. **Nothing is lost.** Saved answers stay where they are, so the exam page
 *     restores them on resume. Violation history stays on the proctoring session.
 *     Only the *active* violation count is cleared, and only when proctoring was
 *     what ended the attempt, or the student would be cancelled again on arrival.
 */

const Assignment = require("../models/Assignment");
const Test = require("../models/Test");
const TestSubmission = require("../models/TestSubmission");
const ProctorSession = require("../models/ProctorSession");
const { attemptEndsAt } = require("./attemptWindow");
const policyService = require("./proctorPolicy");

/**
 * A reopened attempt needs time to be worth anything: a few seconds would
 * reopen it only for the student to find it already expired. Below this the
 * attempt is treated as over.
 */
const MIN_REMAINING_MS = 60 * 1000;

/** Statuses a handed-in attempt can have. */
const SUBMITTED_STATUSES = ["Completed", "Cancelled"];

const TEST_FIELDS = "title type timeLimit isPracticeTest practiceTestSettings";

/** Why did this attempt end? Read from the records, never from the browser. */
function endReason(assignment, submission) {
  if (
    assignment?.cancelledDueToViolation === true ||
    assignment?.status === "Cancelled" ||
    submission?.cancelledDueToViolation === true
  ) {
    return "violation";
  }
  if (submission?.autoSubmit === true) return "auto_submit";
  return "submitted";
}

/**
 * Can this attempt be reopened right now?
 *
 * Returns `null` when it can, or `{ code, message }` explaining why not. Pure, so
 * the listing on the Users page and the reopen itself apply the identical rule.
 */
function reEnableBlocker(assignment, test, now = Date.now()) {
  if (!assignment) {
    return { code: "not_found", message: "Assignment not found." };
  }
  if (!test) {
    return { code: "not_found", message: "The test for this assignment no longer exists." };
  }
  if (!policyService.isProctoredTest(test)) {
    return {
      code: "not_exam",
      message: "Practice tests are not timed exams and cannot be re-enabled.",
    };
  }
  if (!SUBMITTED_STATUSES.includes(assignment.status)) {
    return {
      code: "not_submitted",
      message:
        assignment.status === "In Progress"
          ? "This test is already open for the student."
          : "This test has not been submitted, so there is nothing to re-enable.",
    };
  }

  // Never reopen on missing data. An attempt whose end cannot be worked out
  // would be one the sweep never closes again.
  const endsAt = attemptEndsAt(assignment, test);
  if (!endsAt) {
    return {
      code: "no_window",
      message: "This attempt's time window cannot be determined, so it cannot be re-enabled.",
    };
  }

  const remainingMs = endsAt.getTime() - now;
  if (remainingMs <= MIN_REMAINING_MS) {
    return {
      code: "time_over",
      message:
        remainingMs <= 0
          ? "The time for this test has ended. It can no longer be re-enabled."
          : "Less than a minute of this test's time is left, so it can no longer be re-enabled.",
    };
  }

  return null;
}

/**
 * Every attempt that could be reopened right now, for these students.
 *
 * Returns a Map of studentId → list, used to put Re-enable buttons on the
 * student cards. Two queries for any number of students, so a page of cards
 * costs the same as one.
 */
async function listReEnableable(studentIds, now = Date.now()) {
  const result = new Map();
  if (!Array.isArray(studentIds) || studentIds.length === 0) return result;

  // A cheap pre-filter on the window end. `deadline` is set on every attempt
  // when it starts, so a handed-in attempt with no deadline is a legacy one the
  // precise check below still handles via startTime + duration.
  const assignments = await Assignment.find({
    userId: { $in: studentIds },
    status: { $in: SUBMITTED_STATUSES },
    $or: [{ deadline: { $gt: new Date(now) } }, { deadline: null }],
  })
    .select("userId testId status startTime duration deadline startedAt completedAt cancelledDueToViolation")
    .lean();

  if (assignments.length === 0) return result;

  const tests = await Test.find({ _id: { $in: [...new Set(assignments.map((a) => String(a.testId)))] } })
    .select(TEST_FIELDS)
    .lean();
  const testById = new Map(tests.map((t) => [String(t._id), t]));

  const open = assignments.filter((a) => !reEnableBlocker(a, testById.get(String(a.testId)), now));
  if (open.length === 0) return result;

  const submissions = await TestSubmission.find({ assignmentId: { $in: open.map((a) => a._id) } })
    .select("assignmentId cancelledDueToViolation autoSubmit submittedAt")
    .lean();
  const submissionByAssignment = new Map(submissions.map((s) => [String(s.assignmentId), s]));

  for (const assignment of open) {
    const test = testById.get(String(assignment.testId));
    const submission = submissionByAssignment.get(String(assignment._id));
    const endsAt = attemptEndsAt(assignment, test);
    const key = String(assignment.userId);

    if (!result.has(key)) result.set(key, []);
    result.get(key).push({
      assignmentId: assignment._id,
      testId: assignment.testId,
      testTitle: test.title,
      testType: test.type,
      reason: endReason(assignment, submission),
      submittedAt: submission?.submittedAt || assignment.completedAt || null,
      endsAt,
      // The deadline for pressing Re-enable, which is a minute earlier.
      reEnableUntil: new Date(endsAt.getTime() - MIN_REMAINING_MS),
    });
  }

  for (const list of result.values()) {
    list.sort((a, b) => new Date(a.endsAt) - new Date(b.endsAt));
  }
  return result;
}

/**
 * Reopen one attempt.
 *
 * `actor` is `{ id, role, name }` of the admin or mentor doing it. Whether they
 * may act on this student is the caller's job (services/principals.canManageStudent);
 * everything about the attempt itself is checked here.
 *
 * Order is what keeps this safe without a transaction:
 *
 *   1. The assignment is claimed with a conditional update that only matches a
 *      handed-in attempt. Two people pressing Re-enable at once, or a press
 *      racing the student's own late submit, cannot both win. The deadline
 *      check above needs no repeating here: it depends only on startTime,
 *      duration, deadline and startedAt, none of which change once an attempt
 *      has been handed in.
 *   2. Only then are the proctoring session and the submission reopened.
 *   3. If either of those fails, the claim is undone, so a half-reopened attempt
 *      is never left behind: an assignment "In Progress" with no session the
 *      student could resume would be a dead end.
 *
 * Returns `{ ok: true, assignment, remainingMs, reason }`, or
 * `{ ok: false, status, code, message }`.
 */
async function reEnableAttempt(assignmentId, actor, now = Date.now()) {
  const assignment = await Assignment.findById(assignmentId).lean();
  const test = assignment
    ? await Test.findById(assignment.testId).select(TEST_FIELDS).lean()
    : null;

  const blocker = reEnableBlocker(assignment, test, now);
  if (blocker) {
    return {
      ok: false,
      status: blocker.code === "not_found" ? 404 : 400,
      ...blocker,
    };
  }

  const submission = await TestSubmission.findOne({ assignmentId: assignment._id }).lean();
  const reason = endReason(assignment, submission);
  const endedByProctoring = reason === "violation";
  const endsAt = attemptEndsAt(assignment, test);
  const remainingMs = endsAt.getTime() - now;

  // ── 1. Claim ────────────────────────────────────────────────────────────
  const reopened = await Assignment.findOneAndUpdate(
    {
      _id: assignment._id,
      status: assignment.status,
      // The same status AND the same completion it had when it was checked
      // above. Anything else means something changed in between: refuse rather
      // than reopen an attempt nobody looked at.
      completedAt: assignment.completedAt ?? null,
    },
    {
      $set: {
        status: "In Progress",
        completedAt: null,
        autoScore: null,
        reviewStatus: "Pending",
        cancelledDueToViolation: false,
        ...(endedByProctoring ? { tabViolationCount: 0 } : {}),
      },
      $push: {
        reEnableHistory: {
          at: new Date(now),
          byId: actor.id,
          byRole: actor.role,
          byName: actor.name || "",
          reason,
          previousStatus: assignment.status,
          previousScore: assignment.autoScore ?? null,
          previousViolationCount: assignment.tabViolationCount || 0,
          remainingMs,
        },
      },
    },
    { new: true }
  );

  if (!reopened) {
    return {
      ok: false,
      status: 409,
      code: "changed",
      message: "This attempt changed while it was being re-enabled. Refresh and try again.",
    };
  }

  // ── 2. Reopen the proctoring session and the submission ─────────────────
  try {
    // The most recent session is the one every guard consults (see
    // middleware/proctorSession.js). Sessions expire two days after creation;
    // if this one has, the student simply opens a fresh one on arrival, which
    // carries forward the assignment's violation count set above.
    const session = await ProctorSession.findOne({ assignmentId: assignment._id })
      .sort({ createdAt: -1 })
      .select("_id")
      .lean();

    if (session) {
      await ProctorSession.updateOne(
        { _id: session._id },
        {
          $set: {
            status: "active",
            endedAt: null,
            terminatedReason: null,
            // The time spent closed is not the student going quiet. Without this
            // the first heartbeat would charge the whole gap as `heartbeat_lost`.
            lastHeartbeatAt: new Date(now),
            // Violation *history* stays on the session and on the final report.
            ...(endedByProctoring ? { violationCount: 0 } : {}),
          },
        }
      );
    }

    if (submission) {
      // Answers are left exactly as they are: the exam page restores them from
      // here when the student comes back. `isFinalized: false` takes the paper
      // back out of scores, averages and the mentor review queue until it is
      // handed in again, at which point the submit route regrades all of it.
      await TestSubmission.updateOne(
        { _id: submission._id },
        {
          $set: {
            isFinalized: false,
            cancelledDueToViolation: false,
            autoSubmit: false,
            ...(endedByProctoring ? { tabViolationCount: 0 } : {}),
          },
        }
      );
    }
  } catch (error) {
    // Put the assignment back as it was, history entry included, so a retry
    // starts from a clean handed-in attempt.
    await Assignment.updateOne(
      { _id: assignment._id, status: "In Progress" },
      {
        $set: {
          status: assignment.status,
          completedAt: assignment.completedAt ?? null,
          autoScore: assignment.autoScore ?? null,
          reviewStatus: assignment.reviewStatus || "Pending",
          cancelledDueToViolation: assignment.cancelledDueToViolation === true,
          tabViolationCount: assignment.tabViolationCount || 0,
        },
        $pop: { reEnableHistory: 1 },
      }
    ).catch((rollbackError) => {
      console.error(
        `Re-enable of ${assignment._id} failed and could not be rolled back:`,
        rollbackError.message
      );
    });
    throw error;
  }

  return { ok: true, assignment: reopened, remainingMs, reason, testTitle: test.title };
}

module.exports = {
  MIN_REMAINING_MS,
  SUBMITTED_STATUSES,
  endReason,
  reEnableBlocker,
  listReEnableable,
  reEnableAttempt,
};
