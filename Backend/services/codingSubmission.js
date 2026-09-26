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
 *   1. drop any response already recorded for this question,
 *   2. append the new one,
 *   3. recompute `totalScore` from the array the server itself just built.
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
  // the runtime/memory distribution, the re-grade audit -- would silently stop
  // finding the response.
  const cast = TestSubmission.castObject({ responses: [response] }).responses[0];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await TestSubmission.updateOne(filter, [
      {
        $set: {
          responses: {
            $concatArrays: [
              {
                $filter: {
                  input: { $ifNull: ['$responses', []] },
                  as: 'existing',
                  cond: { $ne: ['$$existing.questionId', cast.questionId] },
                },
              },
              [cast],
            ],
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

module.exports = {
  persistCodingResponse,
};
