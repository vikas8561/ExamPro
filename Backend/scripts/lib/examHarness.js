/**
 * Shared set-up for the scripts in scripts/exam and scripts/security that drive
 * the running API with real fixtures.
 *
 * Three jobs, all of which used to be copied into every script and had drifted:
 *
 *  1. **Refuse anything but a throwaway local database.** These scripts create
 *     students, and students live in the university's database (MONGODB_URI_ONE).
 *     Run against Backend/.env as it stands, they would write into it.
 *  2. **Refuse an API that is not using that same database.** The scripts used
 *     to hard-code http://localhost:4000/api — which is where a developer's own
 *     `npm run dev` listens, connected to whatever .env points at. Every request
 *     then fails authentication and the script reports dozens of misleading
 *     FAILs. `connect()` proves the API shares this database (and JWT secret) by
 *     creating a probe account and asking the API who it is, before any script
 *     writes a single fixture.
 *  3. **Create people the way they exist today.** Students are `Student`
 *     documents on the university connection; admins and mentors are `Admin` and
 *     `Mentor`. The scripts still built everyone from the legacy `User` model,
 *     which nothing authenticates against any more.
 *
 * To run:
 *
 *   mongod --dbpath /tmp/exampro-e2e --port 27999
 *
 *   # API, in one terminal
 *   MONGODB_URI=mongodb://127.0.0.1:27999/exampro_e2e \
 *   MONGODB_URI_ONE=mongodb://127.0.0.1:27999/students_e2e \
 *   PORT=4199 JWT_SECRET=local-e2e FRONTEND_URL=http://localhost:5173 node server.js
 *
 *   # scripts, in another, with the same four values plus
 *   EXAM_API=http://127.0.0.1:4199/api npm run test:exam
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const LOCAL_MONGO = /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//;
const LOCAL_API = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/api$/;

function refuse(lines) {
  console.error(["", "Refusing to run.", ...lines, "", "See Backend/scripts/lib/examHarness.js for how to start a local API.", ""].join("\n"));
  process.exit(2);
}

// Checked at require time, before any model file opens a connection.
for (const name of ["MONGODB_URI", "MONGODB_URI_ONE"]) {
  const uri = process.env[name] || "";
  if (!LOCAL_MONGO.test(uri)) {
    refuse([
      `${name} is not a local database (${uri.replace(/\/\/[^@]*@/, "//***@") || "unset"}).`,
      "These checks create students, and students live in the university's database.",
    ]);
  }
}

const API = (process.env.EXAM_API || "").replace(/\/+$/, "");
if (!LOCAL_API.test(API)) {
  refuse([
    `EXAM_API must be set to a local API, e.g. http://127.0.0.1:4199/api (got "${process.env.EXAM_API || ""}").`,
    "There is deliberately no default: :4000 is usually your own dev server, on your real database.",
  ]);
}

const mongoose = require("mongoose");
const { generateToken } = require("../../middleware/auth");
const { grantSession, revokeSessions } = require("./testAuth");
const Student = require("../../models/Student");
const Mentor = require("../../models/Mentor");
const Admin = require("../../models/Admin");

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36";

/** Call the API. Same shape every script already used. */
async function api(path, { token, method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Everything a harness created, for cleanup. */
const created = { Student: [], Mentor: [], Admin: [] };
let seq = 0;

/**
 * Create a signed-in person. Returns `{ user, token }`, where `user` has
 * `_id`, `name`, `email` and `role` — the shape the scripts' old `mkUser` gave,
 * so call sites need no other change.
 *
 * `role` is "Student", "Mentor" or "Admin". Students default to the Rai
 * University cohort; pass `{ university }` for another. Mentors default to the
 * matching `ru` batch so they can see their students.
 */
async function makeUser(role = "Student", label = "", { mark = "e2e", university = "Rai University", batches = ["ru"], subjects = [] } = {}) {
  const n = `${label || role.toLowerCase()}${++seq}`;
  const name = `ZZ ${n} ${mark}`;
  const email = `${mark}-${n}@verify.invalid`.toLowerCase();
  let doc;

  if (role === "Student") {
    doc = await Student.create({
      studentName: name,
      studentEmail: email,
      UniversityUID: `${mark}-${n}`,
      rollno: `${mark}-${n}`,
      University: university,
      role: "Student",
    });
  } else if (role === "Mentor") {
    doc = await Mentor.create({ name, email, password: "local-e2e-only", batches, subjects });
  } else if (role === "Admin") {
    doc = await Admin.create({ name, email, password: "local-e2e-only" });
  } else {
    throw new Error(`makeUser: unknown role "${role}"`);
  }

  created[role].push(doc._id);
  const user = { _id: doc._id, name, email, role };
  const token = generateToken(user);
  await grantSession(user, token);
  return { user, token, doc };
}

/**
 * Connect to the local database and prove the API is using it too.
 *
 * Fails fast with one clear message instead of letting a script run against the
 * wrong server and report every check as a FAIL.
 */
async function connect() {
  await mongoose.connect(process.env.MONGODB_URI);

  const probe = await makeUser("Admin", "probe");
  let r;
  try {
    r = await api("/auth/profile", { token: probe.token });
  } catch (error) {
    await cleanup();
    refuse([`Could not reach the API at ${API}: ${error.message}`]);
  }
  const ok = r.status === 200 && JSON.stringify(r.body || {}).includes(probe.user.email);
  if (!ok) {
    await cleanup();
    refuse([
      `The API at ${API} did not recognise an account just created in ${process.env.MONGODB_URI}`,
      `(status ${r.status}). It is running against a different database or JWT_SECRET.`,
      "Start it with the same MONGODB_URI, MONGODB_URI_ONE and JWT_SECRET as this script.",
    ]);
  }
  return mongoose;
}

/** Remove every person this run created, and their sign-in sessions. */
async function cleanup() {
  const all = [...created.Student, ...created.Mentor, ...created.Admin];
  await Promise.all([
    Student.deleteMany({ _id: { $in: created.Student } }),
    Mentor.deleteMany({ _id: { $in: created.Mentor } }),
    Admin.deleteMany({ _id: { $in: created.Admin } }),
    revokeSessions(all),
  ]);
  created.Student = []; created.Mentor = []; created.Admin = [];
}

/** Clean up and close both connections, so the process can exit. */
async function disconnect() {
  await cleanup().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  await Student.db.close().catch(() => {});
}

module.exports = { API, api, makeUser, connect, cleanup, disconnect, USER_AGENT };
