/**
 * Verification: recording a graded coding answer.
 *
 * services/codingSubmission.js writes the score for one coding question while
 * the student is still mid-test. Two things have to hold and neither can be
 * checked without a real database:
 *
 *   - the response must be stored with `questionId` as an ObjectId. `save()`
 *     casts a subdocument array on assignment; an update does NOT. Stored as
 *     the string it arrives as, the response stays readable by String()
 *     comparison but disappears from every ObjectId lookup -- the runtime and
 *     memory distribution, and the re-grade audit.
 *
 *   - concurrent writes must not lose a score. The original read-modify-write
 *     recomputed `totalScore` from a stale snapshot, so a second submission
 *     landing during the first overwrote the total while leaving the response
 *     in place, and the total stopped adding up to its own parts. Optimistic
 *     concurrency replaced it and was worse: under contention the retries ran
 *     out and a graded score was dropped entirely. Case 3 is what settled
 *     that -- ten simultaneous writes lost four of them -- and why the write
 *     is now a single server-side pipeline update.
 *
 * Needs a THROWAWAY MongoDB. It drops the database it connects to, so it
 * refuses to run against anything that is not local and obviously disposable:
 *
 *   mongod --dbpath /tmp/verify-db --port 27077 --fork \
 *          --logpath /tmp/verify-db/log
 *   VERIFY_MONGODB_URI=mongodb://127.0.0.1:27077/exampro_verify \
 *          node scripts/exam/coding-persistence-check.js
 */

const mongoose = require('mongoose');
const Test = require('../../models/Test');
const TestSubmission = require('../../models/TestSubmission');
const { persistCodingResponse } = require('../../services/codingSubmission');

const URI = process.env.VERIFY_MONGODB_URI;

/**
 * This script calls dropDatabase(). Deliberately paranoid about where: a
 * throwaway URI has to be passed in its own variable (never MONGODB_URI), on
 * a local host, with a database name that says what it is.
 */
function refuseUnlessDisposable(uri) {
  if (!uri) {
    return 'VERIFY_MONGODB_URI is not set. This check drops the database it connects to, '
      + 'so it will not read MONGODB_URI. See the header for how to start a throwaway mongod.';
  }
  const match = /^mongodb:\/\/([^/?]+)\/([^/?]+)/.exec(uri);
  if (!match) return `Could not parse VERIFY_MONGODB_URI. Expected mongodb://host:port/dbname.`;

  const [, host, database] = match;
  const local = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host);
  if (!local) return `Refusing to drop a database on "${host}". Local hosts only.`;
  if (!/verify|scratch|throwaway/i.test(database)) {
    return `Refusing to drop database "${database}". Name it so it is obviously disposable `
      + '(something containing "verify", "scratch" or "throwaway").';
  }
  return null;
}

let passed = 0, failed = 0;
const check = (cond, label, detail) => {
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}\n        ${detail}`); }
};
const oid = () => new mongoose.Types.ObjectId();

(async () => {
  const refusal = refuseUnlessDisposable(URI);
  if (refusal) {
    console.error(`\n${refusal}\n`);
    process.exit(1);
  }

  await mongoose.connect(URI, { serverSelectionTimeoutMS: 10000 });
  await mongoose.connection.dropDatabase();

  const userId = oid();
  const assignment = { _id: oid(), userId };
  const test = await Test.create({
    title: 'Persistence check', type: 'coding', createdBy: oid(), status: 'Active',
    questions: [
      { kind: 'coding', text: 'Q', points: 1, language: 'cpp', visibleTestCases: [], hiddenTestCases: [{ input: '1', output: '1' }] },
      { kind: 'mcq', text: 'M', options: [{ text: 'a' }, { text: 'b' }], answer: 'a', points: 5 },
    ],
  });
  const [coding, mcq] = test.questions;

  const write = (questionId, points) => persistCodingResponse({
    assignment, test, maxScore: 6, earnedMarks: points,
    response: {
      questionId: String(questionId), textAnswer: 'code', language: 'cpp',
      isCorrect: false, points, autoGraded: true,
      improvementSteps: [], topicRecommendations: [],
    },
  });

  console.log('\n1. A graded response is stored so that every lookup still finds it');
  await write(coding._id, 0.4);
  let doc = await TestSubmission.findOne({ assignmentId: assignment._id }).lean();
  check(!!doc && doc.responses.length === 1, 'the response was written', 'nothing stored');
  check(doc.totalScore === 0.4, 'totalScore recorded', `totalScore=${doc.totalScore}`);
  check(doc.responses[0].questionId instanceof mongoose.Types.ObjectId,
    'questionId is an ObjectId, not a string',
    `stored as ${doc.responses[0].questionId?.constructor?.name} — ObjectId lookups would miss it`);
  check(!!(await TestSubmission.findOne({ 'responses.questionId': coding._id }).lean()),
    'findable by ObjectId query (distribution chart, re-grade audit)',
    'the response is invisible to every ObjectId query');

  console.log('\n2. Re-submitting one question replaces its response');
  await write(coding._id, 1);
  doc = await TestSubmission.findOne({ assignmentId: assignment._id }).lean();
  check(doc.responses.length === 1, 'still exactly one response', `found ${doc.responses.length}`);
  check(doc.totalScore === 1, 'total reflects the replacement, not the sum', `totalScore=${doc.totalScore}`);

  console.log('\n3. Concurrent writes neither collide nor lose a score');
  await TestSubmission.deleteMany({});
  let outcomes = await Promise.allSettled([write(coding._id, 0.4), write(mcq._id, 5)]);
  let rejected = outcomes.filter((o) => o.status === 'rejected');
  doc = await TestSubmission.findOne({ assignmentId: assignment._id }).lean();
  check(rejected.length === 0 && doc.responses.length === 2,
    'two simultaneous writes both land',
    `${rejected.length} rejected, ${doc?.responses.length} stored`);
  check(doc.totalScore === 5.4, 'totalScore adds up to its own parts',
    `totalScore=${doc.totalScore}, responses sum to ${doc.responses.reduce((s, r) => s + r.points, 0)}`);

  await TestSubmission.deleteMany({});
  const ids = Array.from({ length: 10 }, oid);
  outcomes = await Promise.allSettled(ids.map((id, i) => write(id, i + 1)));
  rejected = outcomes.filter((o) => o.status === 'rejected');
  doc = await TestSubmission.findOne({ assignmentId: assignment._id }).lean();
  check(rejected.length === 0 && doc?.responses.length === 10,
    'ten simultaneous writes all land',
    `${rejected.length} rejected, ${doc?.responses.length ?? 0} stored — a dropped write is a lost mark`);
  check(doc?.totalScore === 55, 'ten-way race totals correctly (55)', `totalScore=${doc?.totalScore}`);

  // The write is a pipeline update, which Mongoose documents as NOT receiving
  // some of the treatment an ordinary update gets. These four say what it must
  // still do, because "the score is right" is not the only thing that matters
  // about the document it is written into.
  console.log('\n4. A pipeline update still behaves like an update');
  await TestSubmission.deleteMany({});
  await write(coding._id, 0.2);
  const first = await TestSubmission.findOne({}).lean();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await write(coding._id, 0.6);
  const second = await TestSubmission.findOne({}).lean();
  check(+second.createdAt === +first.createdAt, 'createdAt is not rewritten',
    `${first.createdAt} -> ${second.createdAt}`);
  check(+second.updatedAt > +first.updatedAt, 'updatedAt still advances',
    `stuck at ${second.updatedAt} — timestamps are not being applied`);

  await TestSubmission.updateOne({}, { $set: { isFinalized: true, proctorBypassUsed: true, timeSpent: 999 } });
  await write(coding._id, 0.8);
  const kept = await TestSubmission.findOne({}).lean();
  check(kept.isFinalized === true && kept.proctorBypassUsed === true && kept.timeSpent === 999,
    'fields the update does not mention are left alone',
    JSON.stringify({ isFinalized: kept.isFinalized, bypass: kept.proctorBypassUsed, timeSpent: kept.timeSpent }));

  console.log('\n5. Documents that predate the current shape');
  await TestSubmission.deleteMany({});
  // Inserted raw, so it has no `responses` array at all.
  await TestSubmission.collection.insertOne({
    assignmentId: assignment._id, userId, testId: test._id, totalScore: 0, maxScore: 6,
  });
  await write(coding._id, 0.5);
  doc = await TestSubmission.findOne({}).lean();
  check(doc.responses?.length === 1 && doc.totalScore === 0.5,
    'a document with no responses array is handled',
    JSON.stringify({ responses: doc.responses?.length, totalScore: doc.totalScore }));

  await TestSubmission.deleteMany({});
  await TestSubmission.collection.insertOne({
    assignmentId: assignment._id, userId, testId: test._id,
    responses: [{ questionId: oid(), autoGraded: false }], totalScore: 0, maxScore: 6,
  });
  await write(coding._id, 0.4);
  doc = await TestSubmission.findOne({}).lean();
  check(doc.responses.length === 2 && doc.totalScore === 0.4,
    'a legacy response carrying no points does not poison the total',
    `totalScore=${doc.totalScore}`);

  console.log('\n6. The total carries no binary-float noise');
  await TestSubmission.deleteMany({});
  await write(oid(), 0.1);
  await write(oid(), 0.2);
  doc = await TestSubmission.findOne({}).lean();
  check(doc.totalScore === 0.3, '0.1 + 0.2 is stored as 0.3', `totalScore=${doc.totalScore}`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error('Persistence check failed:', error);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
