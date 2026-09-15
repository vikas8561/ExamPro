/**
 * Repoints ExamPro's own records from the legacy `users._id` at the university
 * student `_id` that the new login issues, so a student who signs in with their
 * UniversityUID still sees the tests they sat under the old email login.
 *
 *   node scripts/migrateLegacyIdentities.js            # dry run, writes nothing
 *   node scripts/migrateLegacyIdentities.js --apply    # performs the migration
 *
 * How a legacy account is paired with a university student:
 *   1. take each name from the university database
 *   2. find ExamPro users sharing at least two whole WORDS with it
 *   3. when several matches carry the same name they are duplicate signups of
 *      one person, so keep whichever submitted more tests
 *   4. anything still unresolved is left alone for a human
 *
 * The three safety checks below run again at apply time against live data, and
 * nothing is written unless all three pass - so a roster that changed between
 * the dry run and the real run aborts instead of writing a half-migration.
 *
 * Every pairing is recorded in `identitylinks` before any row moves. That
 * collection is keyed by the university id, which is what the new login carries,
 * so it stays useful long after the legacy `users` collection is dead - both to
 * audit this migration and to reverse it.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const APPLY = process.argv.includes("--apply");

// Two-letter words and punctuation carry no signal, and the roster writes names
// in a different order than ExamPro did ("PATEL JIVAN" vs "Jivan Patel"), so
// compare unordered sets of real words.
const words = (n) =>
  [...new Set(String(n || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 1))];
const nameKey = (n) => words(n).sort().join(" ");

// userId is an ObjectId on these, and a plain string on the other two.
const OID_COLLECTIONS = [
  ["assignments", "userId"],
  ["testsubmissions", "userId"],
  ["practicetestsubmissions", "userId"],
  ["proctorsessions", "userId"],
  ["dsaquestionnotes", "userId"],
];
const STR_COLLECTIONS = [
  ["reviews", "userId"],
  ["profiles", "principalId"],
];

async function buildMapping(exam, uni) {
  const roster = await uni
    .collection("students")
    .find({}, { projection: { studentName: 1, UniversityUID: 1, University: 1 } })
    .toArray();

  const legacy = (await exam.collection("users").find({}, { projection: { name: 1, email: 1 } }).toArray())
    .map((u) => ({ ...u, w: new Set(words(u.name)) }));

  // Only finalized submissions count as "submitted" - /api/coding/submit writes
  // interim per-question rows that are not finished work.
  const submitted = new Map();
  for (const r of await exam
    .collection("testsubmissions")
    .aggregate([{ $match: { isFinalized: { $ne: false } } }, { $group: { _id: "$userId", n: { $sum: 1 } } }])
    .toArray())
    submitted.set(String(r._id), r.n);

  const assigned = new Map();
  for (const a of await exam.collection("assignments").find({}, { projection: { userId: 1 } }).toArray())
    assigned.set(String(a.userId), (assigned.get(String(a.userId)) || 0) + 1);

  const mapping = [];
  const skipped = { ambiguous: [], none: 0 };

  for (const s of roster) {
    const sw = words(s.studentName);
    const candidates = legacy.filter((u) => {
      let shared = 0;
      for (const w of sw) if (u.w.has(w)) shared++;
      return shared >= 2;
    });

    if (!candidates.length) {
      skipped.none++;
      continue;
    }

    let chosen = null;
    if (candidates.length === 1) {
      chosen = candidates[0];
    } else if (new Set(candidates.map((u) => nameKey(u.name))).size === 1) {
      // Same person signed up twice - the account holding the work wins.
      chosen = [...candidates].sort(
        (a, b) =>
          (submitted.get(String(b._id)) || 0) - (submitted.get(String(a._id)) || 0) ||
          (assigned.get(String(b._id)) || 0) - (assigned.get(String(a._id)) || 0)
      )[0];
    } else {
      // Different people sharing common words ("kumar singh", "patel").
      skipped.ambiguous.push(`${s.studentName} [${s.UniversityUID}]`);
      continue;
    }

    mapping.push({
      legacyId: String(chosen._id),
      uniId: String(s._id),
      uid: String(s.UniversityUID),
      uniName: s.studentName,
      legacyName: chosen.name || "",
      legacyEmail: chosen.email || "",
      university: s.University || "",
      submitted: submitted.get(String(chosen._id)) || 0,
      assigned: assigned.get(String(chosen._id)) || 0,
      discarded: candidates.filter((u) => u !== chosen).map((u) => String(u._id)),
    });
  }

  // A legacy account that is the sole candidate for several roster students
  // cannot belong to all of them, and nothing in the data says which - so drop
  // every claim on it rather than guess.
  const claims = new Map();
  for (const m of mapping) claims.set(m.legacyId, (claims.get(m.legacyId) || 0) + 1);
  const contested = mapping.filter((m) => claims.get(m.legacyId) > 1);
  const resolved = mapping.filter((m) => claims.get(m.legacyId) === 1);

  return { mapping: resolved, contested, skipped };
}

async function runChecks(exam, mapping) {
  const problems = [];

  // 1. strictly one-to-one in both directions
  const byLegacy = new Map();
  const byUni = new Map();
  for (const m of mapping) {
    byLegacy.set(m.legacyId, (byLegacy.get(m.legacyId) || 0) + 1);
    byUni.set(m.uniId, (byUni.get(m.uniId) || 0) + 1);
  }
  const legacyDup = [...byLegacy.values()].filter((n) => n > 1).length;
  const uniDup = [...byUni.values()].filter((n) => n > 1).length;
  if (legacyDup) problems.push(`${legacyDup} legacy account(s) claimed by more than one roster student`);
  if (uniDup) problems.push(`${uniDup} roster student(s) claiming more than one legacy account`);

  // 2. the remap must not break {testId, userId} unique
  const toUni = new Map(mapping.map((m) => [m.legacyId, m.uniId]));
  const pairs = new Map();
  let remapped = 0;
  let untouched = 0;
  for (const a of await exam.collection("assignments").find({}, { projection: { testId: 1, userId: 1 } }).toArray()) {
    const to = toUni.get(String(a.userId));
    if (!to) {
      untouched++;
      continue;
    }
    remapped++;
    const k = `${String(a.testId)}|${to}`;
    pairs.set(k, (pairs.get(k) || 0) + 1);
  }
  const collisions = [...pairs.values()].filter((n) => n > 1).length;
  if (collisions) problems.push(`${collisions} (testId,userId) collision(s) would violate the unique index`);

  // 3. nothing may already sit on these university ids
  const already = await exam.collection("assignments").countDocuments({
    userId: { $in: mapping.map((m) => new mongoose.Types.ObjectId(m.uniId)) },
  });
  if (already) problems.push(`${already} assignment(s) already point at these university ids - migrate before cutover`);

  return { problems, remapped, untouched, already, collisions };
}

(async () => {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_URI_ONE) {
    console.error("MONGODB_URI and MONGODB_URI_ONE must both be set");
    process.exit(1);
  }

  const exam = await mongoose
    .createConnection(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000, autoIndex: false })
    .asPromise();
  const uni = await mongoose
    .createConnection(process.env.MONGODB_URI_ONE, { serverSelectionTimeoutMS: 20000, autoIndex: false })
    .asPromise();

  console.log(`mode: ${APPLY ? "APPLY - will write" : "DRY RUN - writes nothing"}`);
  console.log(`exampro: ${exam.name}   university: ${uni.name}\n`);

  const { mapping, contested, skipped } = await buildMapping(exam, uni);
  console.log(`resolved pairings           : ${mapping.length}`);
  console.log(`  excluded, contested       : ${contested.length}`);
  console.log(`  excluded, ambiguous       : ${skipped.ambiguous.length}`);
  console.log(`  roster with no legacy data: ${skipped.none}`);

  const { problems, remapped, untouched, already, collisions } = await runChecks(exam, mapping);
  console.log(`\nsafety checks`);
  console.log(`  assignment rows to remap  : ${remapped}`);
  console.log(`  rows left untouched       : ${untouched}`);
  console.log(`  index collisions          : ${collisions}`);
  console.log(`  already on university ids : ${already}`);

  if (problems.length) {
    console.error(`\nABORTED - nothing was written:`);
    problems.forEach((p) => console.error(`   - ${p}`));
    await Promise.all([exam.close(), uni.close()]);
    process.exit(1);
  }
  console.log(`  => all checks passed`);

  // Count what will move, per collection.
  const oids = mapping.map((m) => new mongoose.Types.ObjectId(m.legacyId));
  const strs = mapping.map((m) => m.legacyId);
  console.log(`\nrows to rewrite`);
  const planned = {};
  for (const [col, field] of OID_COLLECTIONS)
    planned[col] = await exam.collection(col).countDocuments({ [field]: { $in: oids } });
  for (const [col, field] of STR_COLLECTIONS)
    planned[col] = await exam.collection(col).countDocuments({ [field]: { $in: strs } });
  for (const [col, n] of Object.entries(planned)) console.log(`  ${col.padEnd(26)}: ${n}`);

  if (!APPLY) {
    console.log(`\nDry run complete. Re-run with --apply to perform the migration.`);
    await Promise.all([exam.close(), uni.close()]);
    process.exit(0);
  }

  // --- write phase ---
  // The links go in first: if a later step fails, the record of what was
  // intended still exists and the migration can be finished or reversed.
  console.log(`\nwriting identitylinks...`);
  const now = new Date();
  await exam.collection("identitylinks").bulkWrite(
    mapping.map((m) => ({
      updateOne: {
        filter: { universityStudentId: m.uniId },
        update: {
          $set: {
            universityStudentId: m.uniId,
            universityUID: m.uid,
            universityName: m.uniName,
            university: m.university,
            legacyUserId: m.legacyId,
            legacyName: m.legacyName,
            legacyEmail: m.legacyEmail,
            discardedLegacyUserIds: m.discarded,
            submittedTests: m.submitted,
            assignmentsAtMigration: m.assigned,
            migratedAt: now,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
  await exam.collection("identitylinks").createIndex({ universityStudentId: 1 }, { unique: true });
  await exam.collection("identitylinks").createIndex({ legacyUserId: 1 });
  console.log(`  ${mapping.length} links recorded`);

  const totals = {};
  for (const [col, field, cast] of [
    ...OID_COLLECTIONS.map(([c, f]) => [c, f, "oid"]),
    ...STR_COLLECTIONS.map(([c, f]) => [c, f, "str"]),
  ]) {
    if (!planned[col]) {
      totals[col] = 0;
      continue;
    }
    const ops = mapping.map((m) => ({
      updateMany: {
        filter: { [field]: cast === "oid" ? new mongoose.Types.ObjectId(m.legacyId) : m.legacyId },
        update: { $set: { [field]: cast === "oid" ? new mongoose.Types.ObjectId(m.uniId) : m.uniId } },
      },
    }));
    const res = await exam.collection(col).bulkWrite(ops, { ordered: false });
    totals[col] = res.modifiedCount;
    console.log(`  ${col.padEnd(26)}: ${res.modifiedCount} rewritten`);
  }

  // --- verify ---
  console.log(`\nverifying...`);
  const newOids = mapping.map((m) => new mongoose.Types.ObjectId(m.uniId));
  const leftBehind = await exam.collection("assignments").countDocuments({ userId: { $in: oids } });
  const nowOnUni = await exam.collection("assignments").countDocuments({ userId: { $in: newOids } });
  const dupes = await exam
    .collection("assignments")
    .aggregate([
      { $group: { _id: { t: "$testId", u: "$userId" }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $count: "c" },
    ])
    .toArray();

  console.log(`  assignments still on migrated legacy ids : ${leftBehind}  (expect 0)`);
  console.log(`  assignments now on university ids        : ${nowOnUni}  (expect ${planned.assignments})`);
  console.log(`  duplicate (testId,userId) pairs          : ${dupes[0]?.c || 0}  (expect 0)`);

  const ok = leftBehind === 0 && nowOnUni === planned.assignments && !(dupes[0]?.c || 0);
  console.log(`\n${ok ? "MIGRATION COMPLETE" : "MIGRATION FINISHED WITH WARNINGS - review the counts above"}`);

  await Promise.all([exam.close(), uni.close()]);
  process.exit(ok ? 0 : 2);
})().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
