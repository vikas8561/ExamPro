#!/usr/bin/env node
'use strict';

/**
 * Find (and optionally quarantine) submission rows written by someone other
 * than the student whose attempt they sit on.
 *
 *   node scripts/auditForeignSubmissions.js            # read-only report
 *   node scripts/auditForeignSubmissions.js --apply    # quarantine them
 *
 * Until the ownership checks on hand-in and autosave (routes/testSubmissions.js,
 * routes/answers.js), any signed-in user could save answers or hand in against
 * another student's assignment id. Each such request left a TestSubmission row
 * on that assignment under the CALLER's id. Those rows can no longer be
 * created, but any made before the fix are still in the database, and readers
 * that list submissions by test or by assignment -- test statistics, the results
 * download, mentor lists -- count them as if they were real.
 *
 * A row is "foreign" when its assignment exists and belongs to someone else.
 * Rows whose assignment has been deleted are reported separately and left
 * alone: they are orphans, not forgeries.
 *
 * --apply copies every foreign row into the `testsubmissions_foreign_quarantine`
 * collection first, then deletes it from `testsubmissions`. Nothing is lost:
 * the quarantine keeps the full document plus when and why it was moved.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const QUARANTINE = 'testsubmissions_foreign_quarantine';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, autoIndex: false });
  const db = mongoose.connection.db;
  const host = uri.replace(/\/\/[^@]*@/, '//***@').replace(/\?.*$/, '');
  console.log(`Connected to ${host} (${APPLY ? 'APPLY: foreign rows will be quarantined' : 'read-only'}).\n`);

  const rows = await db.collection('testsubmissions').aggregate([
    { $lookup: { from: 'assignments', localField: 'assignmentId', foreignField: '_id', as: 'assignment' } },
    { $unwind: { path: '$assignment', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        assignmentId: 1, userId: 1, testId: 1, totalScore: 1, submittedAt: 1, isFinalized: 1,
        owner: '$assignment.userId',
        hasAssignment: { $ne: [{ $ifNull: ['$assignment._id', null] }, null] },
      },
    },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: ['$hasAssignment', false] },
            { $ne: ['$userId', '$owner'] },
          ],
        },
      },
    },
  ]).toArray();

  const foreign = rows.filter((r) => r.hasAssignment);
  const orphans = rows.filter((r) => !r.hasAssignment);

  console.log(`Foreign rows (written by someone other than the attempt's student): ${foreign.length}`);
  for (const r of foreign) {
    console.log(`  submission ${r._id}  assignment ${r.assignmentId}  written by ${r.userId}  owner ${r.owner}  score ${r.totalScore}  at ${r.submittedAt ? new Date(r.submittedAt).toISOString() : '-'}`);
  }
  console.log(`\nOrphan rows (assignment no longer exists; left alone): ${orphans.length}`);

  if (!foreign.length) {
    console.log('\nNothing to do.');
    return;
  }
  if (!APPLY) {
    console.log(`\nRead-only. Re-run with --apply to move these ${foreign.length} row(s) into ${QUARANTINE}.`);
    return;
  }

  const ids = foreign.map((r) => r._id);
  const full = await db.collection('testsubmissions').find({ _id: { $in: ids } }).toArray();
  const movedAt = new Date();
  // Copy first, so nothing is deleted that was not safely written elsewhere.
  for (const doc of full) {
    await db.collection(QUARANTINE).replaceOne(
      { _id: doc._id },
      { ...doc, quarantinedAt: movedAt, quarantineReason: 'written_by_non_owner' },
      { upsert: true }
    );
  }
  const copied = await db.collection(QUARANTINE).countDocuments({ _id: { $in: ids } });
  if (copied !== ids.length) {
    console.error(`\nOnly ${copied} of ${ids.length} rows reached ${QUARANTINE}; nothing was deleted.`);
    process.exitCode = 1;
    return;
  }
  const { deletedCount } = await db.collection('testsubmissions').deleteMany({ _id: { $in: ids } });
  console.log(`\nQuarantined ${copied} row(s) in ${QUARANTINE} and removed ${deletedCount} from testsubmissions.`);
}

main()
  .catch((error) => {
    console.error('Audit failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => {}));
