/**
 * Letting a locked-out student back in.
 *
 * Three wrong passwords lock a student out for thirty minutes, and an admin has
 * to be able to undo that from the Users page. Two things about how that works
 * make it worth pinning down here rather than finding out during an exam:
 *
 *   1. The lockout is not a flag on the student. It is a counter in
 *      services/loginLockout keyed by *what was typed at the login form*, and a
 *      student can sign in with a UniversityUID or a roll number. Clear the wrong
 *      key and the Unblock button appears to work while the student stays locked
 *      out.
 *
 *   2. Resetting the password is the one write ExamPro makes to the university's
 *      database. It has to touch `password` on one document and nothing else — a
 *      stray field or a wrong filter would corrupt records ExamPro does not own
 *      and cannot restore.
 *
 * Nothing here talks to a real database. The university's student collection is
 * stubbed, so this check can never reset an actual student's password, and every
 * write the route attempts is recorded and asserted against instead.
 *
 * Run with:  npm run test:lockout
 */

const path = require("path");
const express = require("express");
const bcrypt = require("bcrypt");

let pass = 0,
  fail = 0;
const check = (label, ok) => {
  if (ok) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}`);
  }
};

// ── Stubs ───────────────────────────────────────────────────────────────────
//
// models/Student cannot be loaded for real: it opens the university connection
// from MONGODB_URI_ONE at require time. Injecting into require.cache before
// routes/users is loaded gives both it and services/principals the fake.

const stub = (relative, exports) => {
  const resolved = require.resolve(path.join(__dirname, "..", "..", relative));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

// A query object that answers .select().lean().maxTimeMS() with a fixed result,
// the same chain the routes use.
const query = (result) => {
  const q = {
    select: () => q,
    lean: () => q,
    maxTimeMS: () => q,
    populate: () => q,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
};

const REAL_PASSWORD = "her-own-password";

const STUDENT = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  studentName: "Asha Verma",
  studentEmail: "asha@example.edu",
  UniversityUID: "24BTCSE095",
  rollno: "RU-2024-0095",
  University: "Rai University",
  password: bcrypt.hashSync(REAL_PASSWORD, 10),
};

const writes = [];
const sessionDeletes = [];

// Enough students to fill the first page and push staff onto the second, which is
// the shape that made the admin panel's KPI row report "Mentors 0, Admins 0".
const EXTRA_STUDENTS = Array.from({ length: 11 }, (_, i) => ({
  _id: `bbbbbbbbbbbbbbbbbbbb${String(i).padStart(4, "0")}`,
  studentName: `Filler Student ${i}`,
  studentEmail: `filler${i}@example.edu`,
  UniversityUID: `24BTCSE1${String(i).padStart(2, "0")}`,
  rollno: `RU-2024-1${String(i).padStart(3, "0")}`,
  University: "Rai University",
  password: "$2b$10$x",
}));

const MENTORS = [
  { _id: "cccccccccccccccccccccc01", name: "Dr Rao", email: "rao@exampro.edu", subjects: [] },
  { _id: "cccccccccccccccccccccc02", name: "Dr Iyer", email: "iyer@exampro.edu", subjects: [] },
];
const ADMINS = [{ _id: "dddddddddddddddddddddd01", name: "Registrar", email: "registrar@exampro.edu" }];

stub("models/Student", {
  findById: (id) => query(String(id) === STUDENT._id ? { ...STUDENT } : null),
  find: () => query([{ ...STUDENT }, ...EXTRA_STUDENTS]),
  countDocuments: () => query(1 + EXTRA_STUDENTS.length),
  // The login route looks the student up by whichever identifier was typed.
  findOne: (filter) => {
    const matches = (filter.$or || []).some(
      (clause) =>
        clause.UniversityUID?.test?.(STUDENT.UniversityUID) || clause.rollno?.test?.(STUDENT.rollno)
    );
    return query(matches ? { ...STUDENT } : null);
  },
  // Applied to the document as well as recorded, so a password reset is followed
  // by a real login attempt against the value the route actually stored.
  updateOne: async (filter, update) => {
    writes.push({ filter, update });
    if (String(filter._id) !== STUDENT._id) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    Object.assign(STUDENT, update.$set);
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  },
});

// Present in the directory listing, but never matched by a login: these tests sign
// in as a student, and staff logins go through the same route by email.
const staff = (rows) => ({
  find: () => query(rows.map((r) => ({ ...r }))),
  findOne: () => query(null),
  countDocuments: () => query(rows.length),
  findById: () => query(null),
});
stub("models/Mentor", staff(MENTORS));
stub("models/Admin", staff(ADMINS));
stub("models/Profile", { find: () => query([]), findOne: () => query(null) });
// The Users directory also lists each student's re-enableable tests, which
// reads assignments. Out of scope here, and like everything else in this check
// it must not touch a database.
stub("services/reEnable", { listReEnableable: async () => new Map() });
stub("models/AuthSession", {
  deleteMany: async (filter) => {
    sessionDeletes.push(filter);
    return { deletedCount: 1 };
  },
});

// Signing a real JWT would test the auth middleware, which is not what this is
// about; the routes' own `requireRole("Admin")` is exercised by every other
// admin route already.
stub("middleware/auth", {
  authenticateToken: (req, _res, next) => {
    req.user = { userId: "admin1", role: "Admin" };
    next();
  },
  requireRole: () => (_req, _res, next) => next(),
  startSession: async () => {},
  endSession: async () => {},
  generateToken: () => "t",
  TOKEN_TTL_HOURS: 1,
});

const lockout = require("../../services/loginLockout");
const usersRouter = require("../../routes/users");
const authRouter = require("../../routes/auth");

(async () => {
  console.log("\n════ The counter itself ════\n");

  // A student typing their UID in lower case must not get a fresh three attempts.
  lockout.recordFailure("24BTCSE095");
  lockout.recordFailure("24btcse095");
  lockout.recordFailure("  24BtcSe095  ");
  check("case and surrounding space do not buy extra attempts", lockout.remainingFor("24BTCSE095") > 0);

  // Attempts that keep arriving must not push the release time further out, or a
  // script hammering the form would extend the lockout indefinitely.
  const before = lockout.remainingFor("24BTCSE095");
  lockout.recordFailure("24BTCSE095");
  lockout.recordFailure("24BTCSE095");
  check(
    "further attempts do not extend an existing lockout",
    Math.abs(lockout.remainingFor("24BTCSE095") - before) < 1000
  );

  check("the lockout is ~30 minutes", Math.round(before / 60000) === 30);
  lockout.clear("24BTCSE095");
  check("clearing releases the identifier", lockout.remainingFor("24BTCSE095") === 0);

  // Two failures then silence: the window closes and the count is forgotten,
  // rather than joining up with an attempt an hour later to make three.
  lockout.recordFailure("stale@example.edu");
  lockout.recordFailure("stale@example.edu");
  check("attempts below the limit do not lock", lockout.remainingFor("stale@example.edu") === 0);
  check(
    "a counted-but-not-locked identifier still reports its attempts",
    lockout.statusFor(["stale@example.edu"]).failedLoginAttempts === 2
  );
  lockout.clear("stale@example.edu");

  // statusFor collapses every identifier one person owns into one answer.
  lockout.recordFailure("RU-2024-0095");
  lockout.recordFailure("RU-2024-0095");
  lockout.recordFailure("RU-2024-0095");
  const status = lockout.statusFor([STUDENT.UniversityUID, STUDENT.rollno, STUDENT.studentEmail]);
  check("a lock on the roll number shows on the student as a whole", status.isLocked);
  check("and reports when it lifts", new Date(status.lockedUntil) > new Date());

  console.log("\n════ Login, lockout, unblock ════\n");

  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  // Mirrors server.js: an unreachable database becomes a 503, not a 500.
  app.use((err, _req, res, _next) => res.status(503).json({ code: "db_unavailable", message: err.message }));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (url, options) => {
    const res = await fetch(url, options);
    return { status: res.status, body: await res.json() };
  };
  const base = `${origin}/api/users`;
  const login = (identifier, password) =>
    call(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });

  // Clear the counter left over from the unit section above.
  lockout.clearAll([STUDENT.UniversityUID, STUDENT.rollno, STUDENT.studentEmail]);

  check("the right password signs the student in", (await login(STUDENT.rollno, REAL_PASSWORD)).status === 200);

  // Three wrong passwords against the same identifier. The third is still answered
  // as bad credentials - the limit is reached by it, not before it - and the
  // lockout shows on the attempt after.
  for (const attempt of [1, 2]) {
    check(`wrong password ${attempt} is rejected as bad credentials`, (await login(STUDENT.rollno, "nope")).status === 401);
  }
  check("the 3rd wrong password reaches the limit", (await login(STUDENT.rollno, "nope")).status === 401);

  const locked = await login(STUDENT.rollno, "nope");
  check("the next attempt is refused as a lockout, not as bad credentials", locked.status === 403);
  check("and says how long to wait", /minute/.test(locked.body.message));

  // The point of the whole refactor: the login route and the admin panel read one
  // counter. If these were separate Maps this is where it would show.
  const correctWhileLocked = await login(STUDENT.rollno, REAL_PASSWORD);
  check("even the correct password is refused while locked out", correctWhileLocked.status === 403);

  // Worth being explicit about, because the admin card does not work this way: the
  // counter is keyed by what was typed, so the lock is on the roll number alone
  // and the UniversityUID still has its own allowance. The card and the Unblock
  // button deliberately aggregate instead - a student locked on either identifier
  // reads as locked, and unblocking clears both - so an admin is never shown
  // "Active" for someone who cannot get in.
  check(
    "the lock is on the identifier that was typed",
    lockout.remainingFor(STUDENT.rollno) > 0 && lockout.remainingFor(STUDENT.UniversityUID) === 0
  );

  const listed = await call(base);
  const row = listed.body.find((u) => u.role === "Student");
  check("the admin directory shows that student as locked out", row?.isLocked === true);
  check("and says how long is left, for the card to show", row.lockRemainingMs > 0);
  check("and counts the attempts", row.failedLoginAttempts >= 3);

  // Unblock: clears the lock, touches nothing else.
  const writesBefore = writes.length;
  const unblock = await call(`${base}/${STUDENT._id}/unblock`, { method: "POST" });
  check("unblock answers 200", unblock.status === 200);
  check("unblock reports the student as no longer locked", unblock.body.isLocked === false);
  check("unblock writes nothing to the university's database", writes.length === writesBefore);
  check(
    "the student can sign in again, with the password they always had",
    (await login(STUDENT.rollno, REAL_PASSWORD)).status === 200
  );

  const relisted = await call(base);
  check(
    "and the directory now shows them as active",
    relisted.body.find((u) => u.role === "Student").isLocked === false
  );

  console.log("\n════ Password reset ════\n");

  // Locked out again, and this time they have forgotten the password too.
  for (const attempt of [1, 2, 3]) await login(STUDENT.UniversityUID, `wrong-${attempt}`);
  check("locked out again", (await login(STUDENT.UniversityUID, REAL_PASSWORD)).status === 403);
  check("which the admin card reflects", (await call(base)).body.find((u) => u.role === "Student").isLocked === true);

  const reset = await call(`${base}/${STUDENT._id}/reset-password`, { method: "POST" });
  check("reset answers 200", reset.status === 200);
  check("reset tells the admin the new password", reset.body.defaultPassword === "123456");

  const write = writes[writes.length - 1];
  check("reset writes exactly once", writes.length === writesBefore + 1);
  check("reset targets the one student by _id", String(write.filter._id) === STUDENT._id);
  check("reset filters on nothing else", Object.keys(write.filter).length === 1);
  check("reset uses $set and only $set", Object.keys(write.update).join() === "$set");
  check("reset sets only `password`", Object.keys(write.update.$set).join() === "password");
  check(
    "the stored value is a bcrypt hash, not the default in the clear",
    write.update.$set.password !== "123456" && (await bcrypt.compare("123456", write.update.$set.password))
  );
  check("and is salted at the same cost as the rest of the app", /^\$2[aby]\$10\$/.test(write.update.$set.password));

  check(
    "reset signs the student out everywhere",
    sessionDeletes.some((f) => String(f.principalId) === STUDENT._id)
  );

  // A reset that left the lockout standing would look like it had not worked.
  check("the student can sign in with the default straight away", (await login(STUDENT.UniversityUID, "123456")).status === 200);
  check("by roll number as well as UID", (await login(STUDENT.rollno, "123456")).status === 200);
  check("and the old password no longer works", (await login(STUDENT.rollno, REAL_PASSWORD)).status === 401);
  lockout.clearAll([STUDENT.UniversityUID, STUDENT.rollno, STUDENT.studentEmail]);

  console.log("\n════ Directory counts (the admin KPI row) ════\n");

  // 12 students, 2 mentors, 1 admin. A page holds nine rows and the listing sorts
  // students first, so page one is nothing but students - which is exactly why
  // counting the returned page reported "Mentors 0, Admins 0" no matter how many
  // there were.
  const first = await call(`${base}/profiles?page=1&limit=9`);
  check("a page holds only what fits", first.body.users.length === 9);
  check("and page one is all students, as the sort intends", first.body.users.every((u) => u.role === "Student"));

  const c = first.body.counts;
  check("the counts are not the page's counts", c.students === 12 && c.mentors === 2 && c.admins === 1);
  check("the total matches the paginated total", c.total === first.body.pagination.totalUsers);
  check("and the three roles add up to it", c.students + c.mentors + c.admins === c.total);

  // The figures must not drift as the admin pages through the directory.
  const second = await call(`${base}/profiles?page=2&limit=9`);
  check(
    "the counts are the same on page two",
    JSON.stringify(second.body.counts) === JSON.stringify(c)
  );
  check("even though page two is where the staff appear", second.body.users.some((u) => u.role !== "Student"));

  // Narrowing the directory narrows the figures with it, so the row still adds up.
  const mentorsOnly = await call(`${base}/profiles?filter=Mentor`);
  check(
    "filtering to mentors counts only mentors",
    mentorsOnly.body.counts.mentors === 2 &&
      mentorsOnly.body.counts.students === 0 &&
      mentorsOnly.body.counts.admins === 0
  );
  check("and the total follows the filter", mentorsOnly.body.counts.total === 2);

  const adminsOnly = await call(`${base}/profiles?filter=Admin`);
  check("filtering to admins counts only admins", adminsOnly.body.counts.admins === 1 && adminsOnly.body.counts.total === 1);

  const cohort = await call(`${base}/profiles?filter=students:ru`);
  check(
    "a student cohort filter drops the staff from the figures",
    cohort.body.counts.students === 12 && cohort.body.counts.mentors === 0 && cohort.body.counts.admins === 0
  );

  // An unrecognised cohort key must not quietly widen to the whole roster.
  const bogus = await call(`${base}/profiles?filter=students:not-a-cohort`);
  check("an unknown cohort counts nobody rather than everybody", bogus.body.counts.total === 0);

  console.log("\n════ Guards ════\n");

  // A wrong id must not be mistaken for a student, and must not write.
  const writesAfterReset = writes.length;
  const missing = await call(`${base}/bbbbbbbbbbbbbbbbbbbbbbbb/reset-password`, { method: "POST" });
  check("an unknown student id is a 404", missing.status === 404);
  const garbage = await call(`${base}/not-an-objectid/reset-password`, { method: "POST" });
  check("an id that is not an ObjectId is a 404, not a cast error", garbage.status === 404);
  const badUnblock = await call(`${base}/not-an-objectid/unblock`, { method: "POST" });
  check("the same for unblock", badUnblock.status === 404);
  check("and none of them wrote anything", writes.length === writesAfterReset);

  // Students remain uncreatable and uneditable: the reset is the one exception.
  const created = await call(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "X", email: "x@y.z", password: "secret1", role: "Student" }),
  });
  check("creating a student is still refused", created.status === 400);
  const bulk = await call(`${base}/bulk`, { method: "POST" });
  check("bulk student upload is still refused", bulk.status === 400);

  server.close();

  console.log("\n──────────────");
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error("\nCheck crashed:", err);
  process.exit(1);
});
