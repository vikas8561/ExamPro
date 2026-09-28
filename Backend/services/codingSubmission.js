'use strict';

/**
 * Recording a graded coding answer.
 *
 * This lives outside routes/coding.js for the same reason services/grading.js
 * does: it is a rule about how a score is written, it has to be right, and a
 * rule that cannot be tested on its own tends not to stay right.
 */

const TestSubmission = require('../models/TestSubmission');

/**
 * Write one graded coding response, without losing a concurrently written one.
 *
 * The original was a read-modify-write: find the submission, splice the
 * response into its array, recompute `totalScore` from that in-memory copy,
 * save. Two submissions racing -- two browser tabs, a double click, a retry
 * after a flaky stream -- both read the same snapshot, and the second save
 * overwrote `totalScore` with a figure computed before the first one's marks
 * existed. The response survived in the array while the score silently did
 * not, and the total no longer added up to its own parts.
 *
 * Optimistic concurrency was the first fix, and it was the wrong one: with
 * writers contending, retries ran out and a graded score was dropped
 * altogether. Measured against a real MongoDB, ten simultaneous writes lost
 * four of them -- a worse failure than the bug being fixed, because the
 * student gets an error instead of a mark.
 *
 * So the read-modify-write is gone instead. One update does the lot, server
 * side, with no snapshot to go stale:
 *
 *   1. set aside any response already recorded for this question,
 *   2. keep whichever of it and the new one passed more cases,
 *   3. recompute `totalScore` from the array the server itself just built.
 *
 * Step 2 used to be a plain append -- last submission wins. It is now best-wins,
 * and the comparison happens inside the pipeline for the same reason the rest of
 * it does: reading the existing attempt into Node to compare it would reintroduce
 * exactly the read-modify-write race described above, and the thing being raced
 * over would be a student's best mark.
 *
 * MongoDB applies that atomically per document, so concurrent writers queue
 * rather than collide, and step 3 can only ever see the array as it really is.
 * Needs MongoDB 4.2+ for pipeline updates (the cluster runs 8.0).
 */
async function persistCodingResponse({ assignment, test, response, maxScore, earnedMarks, attempts = 3 }) {
  const filter = { assignmentId: assignment._id, userId: assignment.userId };

  // Cast through the schema before writing. `save()` casts a subdocument array
  // on assignment, but an update does NOT: `questionId` would be stored as the
  // string it arrives as, and every lookup that matches it as an ObjectId --
  // the re-grade audit, the mentor's submission report -- would silently stop
  // finding the response.
  const cast = TestSubmission.castObject({ responses: [response] }).responses[0];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await TestSubmission.updateOne(filter, [
      {
        $set: {
          responses: {
            $let: {
              vars: {
                previous: {
                  $first: {
                    $filter: {
                      input: { $ifNull: ['$responses', []] },
                      as: 'existing',
                      cond: { $eq: ['$$existing.questionId', cast.questionId] },
                    },
                  },
                },
                others: {
                  $filter: {
                    input: { $ifNull: ['$responses', []] },
                    as: 'existing',
                    cond: { $ne: ['$$existing.questionId', cast.questionId] },
                  },
                },
              },
              in: {
                $concatArrays: [
                  '$$others',
                  [
                    {
                      $cond: [
                        previousIsBetter(cast),
                        // The earlier attempt stands. Its source, its marks and
                        // its timestamp are left exactly as they were -- but the
                        // code just submitted is kept as the draft, so a student
                        // whose latest attempt scored worse still does not lose
                        // what they wrote.
                        { $mergeObjects: ['$$previous', { draftAnswer: cast.textAnswer }] },
                        cast,
                      ],
                    },
                  ],
                ],
              },
            },
          },
          maxScore,
        },
      },
      // A second stage, so `$responses` here is the array the stage above
      // produced rather than the one the document started with.
      { $set: { totalScore: { $round: [{ $sum: '$responses.points' }, 2] } } },
    ]);

    if (result.matchedCount > 0) return;

    // No submission yet. `{ assignmentId, userId }` is unique, so a racing
    // creator turns into a duplicate key error -- then the update above will
    // find the document on the next pass.
    try {
      await TestSubmission.create({
        ...filter,
        testId: test._id,
        responses: [response],
        totalScore: earnedMarks,
        maxScore,
        timeSpent: 0,
        mentorReviewed: false,
        reviewStatus: 'Pending',
        // The student is still mid-test; the final submit flips this.
        isFinalized: false,
      });
      return;
    } catch (error) {
      if (error?.code !== 11000 || attempt === attempts) throw error;
    }
  }

  throw new Error('Could not record the graded response');
}

/**
 * The attempt that currently counts for one question.
 *
 * Read back after the write rather than inferred from it: the update decides
 * best-wins server side, and a concurrent submission could have been the one
 * that won. Asking the database what it actually holds is the only answer that
 * cannot be wrong, and this is the number the student is shown as their grade.
 */
async function readGradedAttempt({ assignment, questionId }) {
  const submission = await TestSubmission.findOne(
    { assignmentId: assignment._id, userId: assignment.userId },
    { responses: 1 }
  ).lean();

  const stored = (submission?.responses || []).find(
    (response) => String(response.questionId) === String(questionId)
  );
  if (!stored) return null;

  return {
    passedCount: typeof stored.passedCount === 'number' ? stored.passedCount : null,
    totalHidden: typeof stored.totalHidden === 'number' ? stored.totalHidden : null,
    submittedAt: stored.submittedAt || null,
  };
}

/**
 * Does the attempt already stored beat the one being submitted?
 *
 * Best-wins, measured in test cases: the student keeps the attempt that solved
 * more of the problem. Expressed as an aggregation expression rather than
 * JavaScript so the comparison happens inside the same atomic update as the
 * write, where no other submission can interleave between reading the old score
 * and deciding to discard it.
 *
 * Two details worth stating, because both are decisions rather than accidents:
 *
 * Ties go to the NEW attempt. Equal cases means equal marks, so nothing is lost
 * by taking the newer one, and taking it keeps the stored source in step with
 * what the student last chose to submit. Strictly greater-than is what makes
 * that happen.
 *
 * Rows written before best-wins existed have no `passedCount`, so for those the
 * comparison falls back to marks, which every row has and which move in step
 * with cases for a given question. The fallback is not merely for tidiness: if
 * an older row compared as if it had passed zero cases, the first resubmission
 * after deploying this would quietly throw away a student's existing mark.
 */
function previousIsBetter(cast) {
  const submittedCases = { $literal: typeof cast.passedCount === 'number' ? cast.passedCount : null };
  const submittedMarks = { $literal: Number(cast.points) || 0 };

  return {
    $cond: [
      // Nothing recorded yet: the new attempt is all there is.
      { $eq: [{ $ifNull: ['$$previous', null] }, null] },
      false,
      {
        $cond: [
          {
            $and: [
              { $ne: [{ $ifNull: ['$$previous.passedCount', null] }, null] },
              { $ne: [submittedCases, null] },
            ],
          },
          { $gt: ['$$previous.passedCount', submittedCases] },
          { $gt: [{ $ifNull: ['$$previous.points', 0] }, submittedMarks] },
        ],
      },
    ],
  };
}

/**
 * What a student is allowed to learn about their own submission.
 *
 * An allowlist, and deliberately a function rather than an object literal built
 * at the call site. The rule it enforces is easy to state and easy to undo by
 * accident: a student may know HOW MUCH of the problem they have solved, and
 * never WHICH hidden case failed or WHY. Per-case pass/fail, per-case statuses,
 * the inputs, the expected outputs, the stderr, the runtime and the memory are
 * all absent, and a test asserts the exact key set so that widening it has to
 * be a decision somebody makes on purpose.
 *
 * This runs on the server because the payload travels to a student who, in a
 * coding exam, is by definition capable of opening the network tab. Anything
 * left out of the interface but present in the response is not left out at all.
 *
 * `compileOutput` is the considered exception: a compile error comes from the
 * student's own source before any test input exists, so it reveals nothing
 * about the hidden cases, and withholding it would fail somebody for a missing
 * semicolon they were never allowed to see.
 *
 * The score and the question's worth are absent too. Both are computed and
 * stored; neither is shown while the test is still running.
 */
function studentSubmissionView({
  verdict,
  passedCount,
  totalHidden,
  language,
  compileOutput,
  submittedAt,
  graded,
}) {
  const iso = (value) => (value instanceof Date ? value.toISOString() : value || null);

  // What counts, after best-wins has had its say. Falls back to this attempt
  // when the read-back found nothing, so the screen degrades to describing the
  // submission in front of the student rather than showing a blank grade.
  const gradedPassed = typeof graded?.passedCount === 'number' ? graded.passedCount : passedCount;
  const gradedTotal = typeof graded?.totalHidden === 'number' ? graded.totalHidden : totalHidden;

  return {
    verdict,
    passedCount,
    totalHidden,
    language,
    compileOutput: compileOutput || null,
    submittedAt: iso(submittedAt),

    // The attempt that now counts, which is not necessarily this one. Telling a
    // student their submission passed 6 of 10 and stopping there would read as
    // "you have scored 6" when the 10 they earned earlier is what stands -- so
    // the grade is stated separately and explicitly.
    graded: {
      passedCount: gradedPassed,
      totalHidden: gradedTotal,
      submittedAt: iso(graded?.submittedAt) || iso(submittedAt),
      // True when THIS submission is the one being graded.
      isThisAttempt: gradedPassed === passedCount && iso(graded?.submittedAt || submittedAt) === iso(submittedAt),
    },
  };
}

module.exports = {
  persistCodingResponse,
  readGradedAttempt,
  studentSubmissionView,
  previousIsBetter,
};
