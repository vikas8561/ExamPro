/**
 * Security audit: does a student sitting an exam have any route to the answers?
 *
 * Each case is written as the attack a student would actually run: a logged-in
 * student, mid-exam, with nothing but their own token and a browser console.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const API = "http://localhost:4000/api";
const MARK = `sec-${Date.now()}`;

let held = 0, leaked = 0;
const secure = (label) => { held++; console.log(`  SECURE   ${label}`); };
const breach = (label, detail) => { leaked++; console.log(`  LEAK !!  ${label}\n           ${detail}`); };

async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require("../../models/User");
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");

  const bin = { users: [], tests: [], assignments: [] };

  const mkUser = async (name) => {
    const u = new User({ name: `ZZ ${name} ${MARK}`, email: `${MARK}-${name}@verify.invalid`, password: "x", role: "Student" });
    await u.save();
    const token = jwt.sign({ userId: u._id, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
    u.activeSessions = [token];
    await u.save();
    bin.users.push(u._id);
    return { user: u, token };
  };

  try {
    const victim = await mkUser("victim");
    const attacker = await mkUser("attacker");

    // A perfectly ordinary test: no mentor assigned, which is the default.
    const test = await Test.create({
      title: `ZZ Sec ${MARK}`, type: "mcq", timeLimit: 60, allowedTabSwitches: 100,
      status: "Active", createdBy: victim.user._id,
      questions: [
        { kind: "mcq", text: "Capital of France?", options: [{ text: "Berlin" }, { text: "Paris" }], answer: "Paris", points: 1 },
        { kind: "theory", text: "Explain recursion.", expectedAnswer: "THE MODEL ANSWER", points: 5 },
      ],
    });
    bin.tests.push(test._id);

    const assignment = await Assignment.create({
      testId: test._id, userId: victim.user._id, status: "In Progress",
      startedAt: new Date(), startTime: new Date(Date.now() - 60000),
      duration: 120, // deadline is an hour away -- the exam is very much live
      mentorId: null,
    });
    bin.assignments.push(assignment._id);

    // The student opens proctoring and starts answering, exactly as normal.
    const started = await api("/proctor/session/start", {
      token: victim.token, method: "POST",
      body: { assignmentId: String(assignment._id), testKind: "assigned" },
    });
    await api("/answers", {
      token: victim.token, method: "POST",
      body: { assignmentId: String(assignment._id), questionId: String(test.questions[0]._id), selectedOption: "Berlin" },
    });

    // Look for the secret FIELDS themselves. Matching on answer *text* gave
    // false positives: "Paris" is also an option label, which a student must
    // obviously be allowed to see in order to answer the question.
    const SECRET = ["answer", "answers", "expectedAnswer", "hiddenTestCases"];
    const exposes = (payload) => {
      const hits = new Set();
      const walk = (node) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== "object") return;
        for (const [k, v] of Object.entries(node)) {
          const empty = v === null || v === undefined || v === "" ||
                        (Array.isArray(v) && v.length === 0);
          if (SECRET.includes(k) && !empty) hits.add(k);
          walk(v);
        }
      };
      walk(payload);
      return [...hits];
    };

    console.log("\n════ 1. Can the student read the answers mid-exam? ════\n");

    let r = await api(`/test-submissions/assignment/${assignment._id}`, { token: victim.token });
    let found = exposes(r.body);
    if (r.body?.showResults === true && found.length) {
      breach("GET /test-submissions/assignment/:id returns the correct answers DURING the exam",
        `showResults=${r.body.showResults}, exposed: ${JSON.stringify(found)}`);
    } else secure("GET /test-submissions/assignment/:id withholds answers mid-exam");

    console.log("\n════ 2. Other routes that serve question data ════\n");

    for (const [label, path] of [
      ["GET /tests/:id", `/tests/${test._id}`],
      ["GET /assignments/:id", `/assignments/${assignment._id}`],
      ["GET /answers/assignment/:id", `/answers/assignment/${assignment._id}`],
    ]) {
      r = await api(path, { token: victim.token });
      found = exposes(r.body);
      if (found.length) breach(`${label} exposes answer content`, `exposed: ${JSON.stringify(found)}`);
      else secure(`${label} exposes no answers`);
    }

    console.log("\n════ 3. Can a student read ANOTHER student's submission? ════\n");

    r = await api(`/test-submissions/assignment/${assignment._id}`, { token: attacker.token });
    if (r.status === 200) {
      breach("A different student can read this assignment's submission",
        `status 200, showResults=${r.body?.showResults}, answers: ${JSON.stringify(exposes(r.body))}`);
    } else secure(`Another student is refused (status ${r.status})`);

    console.log("\n════ 4. Can a student erase their own violation record? ════\n");

    await api("/proctor/session/event", {
      token: victim.token, method: "POST",
      body: { sessionId: started.body.sessionId, events: [{ violationType: "tab_switch", details: "cheating" }] },
    });
    const wipe = await api("/test-submissions/sync-violations", {
      token: victim.token, method: "PUT",
      body: { assignmentId: String(assignment._id), tabViolationCount: 0, tabViolations: [] },
    });
    if (wipe.status === 200) {
      breach("PUT /test-submissions/sync-violations still accepts a student-supplied count",
        `status 200 -- a student can post a count of zero`);
    } else secure(`Student-writable violation endpoint is gone (${wipe.status})`);

    // The authority is the proctoring session, and it must hold the real count.
    const live = await ProctorSession.findOne({ assignmentId: assignment._id }).lean();
    if ((live?.violationCount ?? 0) >= 1) secure("The server's own violation count is intact");
    else breach("The server's violation count was lost", `count = ${live?.violationCount}`);

    console.log("\n════ 5. Mentor-only routes ════\n");

    for (const [label, path] of [
      ["GET /mentor/submissions", "/mentor/submissions"],
      ["GET /mentor-fast/assignments", "/mentor-fast/assignments"],
      ["GET /mentor/monitor/:id", `/mentor/monitor/${assignment._id}`],
      ["GET /users", "/users"],
      ["GET /debug/my-assignments", "/debug/my-assignments"],
      ["GET /test-submissions/stats/:testId", `/test-submissions/stats/${test._id}`],
    ]) {
      r = await api(path, { token: victim.token });
      if (r.status === 200) breach(`${label} is reachable by a student`, `status 200`);
      else secure(`${label} refused (${r.status})`);
    }
  } catch (err) {
    console.log("HARNESS ERROR:", err.stack);
    leaked++;
  } finally {
    const User = require("../../models/User");
    const Test = require("../../models/Test");
    const Assignment = require("../../models/Assignment");
    const TestSubmission = require("../../models/TestSubmission");
    const ProctorSession = require("../../models/ProctorSession");
    await TestSubmission.deleteMany({ assignmentId: { $in: bin.assignments } });
    await ProctorSession.deleteMany({ assignmentId: { $in: bin.assignments } });
    await Assignment.deleteMany({ _id: { $in: bin.assignments } });
    await Test.deleteMany({ _id: { $in: bin.tests } });
    await User.deleteMany({ _id: { $in: bin.users } });
    console.log(`\n──────────────\n${held} secure, ${leaked} LEAKS`);
    await mongoose.disconnect();
    process.exit(0);
  }
})();
