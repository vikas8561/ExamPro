/**
 * Verification: submitting works for all three kinds of exam.
 *
 * Each test type reaches the server by a different route through the UI, and
 * they do not all build the same payload:
 *
 *   mcq / theory   TakeTest.jsx  -> answers[] keyed by question id, sent as
 *                                   selectedOption (option TEXT) or textAnswer
 *   coding         TakeCodingTest.jsx -> codeByQ keyed by question id, sent as
 *                                   textAnswer + language
 *
 * This script replays each of those payloads against the real API and checks
 * the answer actually lands and is marked. It also covers the auto-submit path
 * for each, since that is a separate branch of the same handler.
 *
 * Needs the API running on :4000 and MONGODB_URI set, like the other scripts.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const API = "http://localhost:4000/api";
const MARK = `kinds-${Date.now()}`;

let passed = 0, failed = 0;
const pass = (l) => { passed++; console.log(`  PASS  ${l}`); };
const fail = (l, d) => { failed++; console.log(`  FAIL  ${l}\n        ${d}`); };
const check = (c, l, d) => (c ? pass(l) : fail(l, d));

async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

  let seq = 0;
  const mkUser = async () => {
    const n = `s${seq++}`;
    const u = new User({ name: `ZZ ${n} ${MARK}`, email: `${MARK}-${n}@verify.invalid`, password: "x", role: "Student" });
    await u.save();
    const token = jwt.sign({ userId: u._id, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
    u.activeSessions = [token]; await u.save(); bin.users.push(u._id);
    return { user: u, token };
  };

  const QUESTIONS = {
    mcq: [
      { kind: "mcq", text: "right one", options: [{ text: "alpha" }, { text: "beta" }], answer: "alpha", points: 2 },
      { kind: "mcq", text: "wrong one", options: [{ text: "gamma" }, { text: "delta" }], answer: "gamma", points: 2 },
    ],
    theory: [
      { kind: "theory", text: "explain recursion", expectedAnswer: "MODEL", points: 5 },
      { kind: "theory", text: "explain closures", expectedAnswer: "MODEL", points: 5 },
    ],
    coding: [
      {
        kind: "coding", text: "sum two numbers", points: 5, language: "python",
        visibleTestCases: [{ input: "1 2", output: "3" }],
        hiddenTestCases: [{ input: "40 2", output: "42", marks: 7 }],
      },
    ],
  };

  /** Set up one attempt: test of `type`, assigned, proctored, started. */
  const sitDown = async (type) => {
    const s = await mkUser();
    const test = await Test.create({
      title: `ZZ ${type} ${MARK} ${seq}`, type, timeLimit: 60, allowedTabSwitches: 100,
      status: "Active", createdBy: s.user._id, questions: QUESTIONS[type],
    });
    bin.tests.push(test._id);
    const a = await Assignment.create({
      testId: test._id, userId: s.user._id, status: "Assigned",
      startTime: new Date(Date.now() - 60000), duration: 240, mentorId: null,
    });
    bin.assignments.push(a._id);
    await api("/proctor/session/start", { token: s.token, method: "POST", body: { assignmentId: String(a._id), testKind: type === "coding" ? "coding" : "assigned" } });
    const started = await api(`/assignments/${a._id}/start`, { token: s.token, method: "POST" });
    return { s, test, a, served: started.body?.test?.questions || [] };
  };

  const stored = async (a) => TestSubmission.findOne({ assignmentId: a._id }).lean();

  try {
    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 1. MCQ test (TakeTest payload) ════\n");
    {
      const { s, test, a, served } = await sitDown("mcq");
      check(served.length === 2, "the paper was served", `${served.length} questions`);

      // TakeTest maps its option INDEX back to the option TEXT at submit time.
      const r = await api("/test-submissions", {
        token: s.token, method: "POST",
        body: {
          assignmentId: String(a._id),
          responses: served.map((q) => {
            const full = test.questions.id(q._id);
            const pick = full.text === "right one" ? 0 : 1; // right, then wrong
            return { questionId: String(q._id), selectedOption: q.options[pick].text, textAnswer: undefined };
          }),
          timeSpent: 60,
        },
      });
      check(r.status === 201, "submit accepted", `${r.status}: ${JSON.stringify(r.body?.message)}`);
      const sub = await stored(a);
      check(sub?.responses?.length === 2, "both answers stored", `${sub?.responses?.length}`);
      check(sub?.totalScore === 2 && sub?.maxScore === 4, "marked 2 out of 4 (one right, one wrong)", `${sub?.totalScore}/${sub?.maxScore}`);
      check(sub.responses.filter((x) => x.isCorrect).length === 1, "exactly one marked correct", JSON.stringify(sub.responses.map((x) => x.isCorrect)));
      check(sub.responses.every((x) => x.selectedOption), "each row kept the chosen option text", JSON.stringify(sub.responses.map((x) => x.selectedOption)));
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 2. Theory test (TakeTest payload) ════\n");
    {
      const { s, a, served } = await sitDown("theory");
      const r = await api("/test-submissions", {
        token: s.token, method: "POST",
        body: {
          assignmentId: String(a._id),
          responses: served.map((q, i) => ({ questionId: String(q._id), selectedOption: undefined, textAnswer: `my essay ${i}` })),
          timeSpent: 60,
        },
      });
      check(r.status === 201, "submit accepted", `${r.status}: ${JSON.stringify(r.body?.message)}`);
      const sub = await stored(a);
      check(sub?.responses?.length === 2, "both answers stored", `${sub?.responses?.length}`);
      check(sub.responses.every((x) => (x.textAnswer || "").startsWith("my essay")), "the written text is stored verbatim", JSON.stringify(sub.responses.map((x) => x.textAnswer)));
      check(sub?.totalScore === 0 && sub?.maxScore === 10, "unscored pending the mentor, out of 10", `${sub?.totalScore}/${sub?.maxScore}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 3. Coding test (TakeCodingTest payload) ════\n");
    {
      const { s, a, served } = await sitDown("coding");
      const r = await api("/test-submissions", {
        token: s.token, method: "POST",
        body: {
          assignmentId: String(a._id),
          responses: served.map((q) => ({ questionId: String(q._id), selectedOption: null, textAnswer: "print(sum(map(int,input().split())))", language: "python" })),
          timeSpent: 60,
        },
      });
      check(r.status === 201, "submit accepted", `${r.status}: ${JSON.stringify(r.body?.message)}`);
      const sub = await stored(a);
      check(sub?.responses?.length === 1, "the answer stored", `${sub?.responses?.length}`);
      check((sub?.responses?.[0]?.textAnswer || "").includes("print("), "the student's code is stored", JSON.stringify(sub?.responses?.[0]?.textAnswer));
      check(sub?.responses?.[0]?.language === "python", "the language is stored for the mentor", `${sub?.responses?.[0]?.language}`);
      check(sub?.maxScore === 7, "worth the hidden test case marks (7), not points (5)", `${sub?.maxScore}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 4. Auto-submit, for each of the three ════\n");
    for (const type of ["mcq", "theory", "coding"]) {
      const { s, a, served } = await sitDown(type);
      const body = {
        assignmentId: String(a._id),
        responses: served.map((q) => (
          type === "mcq"
            ? { questionId: String(q._id), selectedOption: q.options[0].text }
            : { questionId: String(q._id), selectedOption: null, textAnswer: "written under the wire", language: "python" }
        )),
        timeSpent: 3600, autoSubmit: true,
      };
      const r = await api("/test-submissions", { token: s.token, method: "POST", body });
      const sub = await stored(a);
      const asg = await Assignment.findById(a._id).lean();
      const landed = (sub?.responses || []).some((x) => x.selectedOption || x.textAnswer);
      check(r.status === 201 && asg.status === "Completed" && landed,
        `${type}: auto-submit lands, assignment Completed, answers stored`,
        `status ${r.status}, assignment ${asg.status}, answers landed ${landed}`);
    }

    // ───────────────────────────────────────────────────────────────────────
    console.log("\n════ 5. A coding question rendered by TakeTest.jsx ════\n");
    {
      // TakeTest.jsx used to render Judge0CodeEditor with no way to read the
      // code back, so `answers[question._id]` stayed undefined and this payload
      // went out with textAnswer: undefined -- the student's work silently lost.
      // The editor now reports changes through onCodeChange, so the page builds
      // the same shape as any other answer. Both halves are checked here.
      const { s, a, served } = await sitDown("coding");

      const empty = await api("/test-submissions", {
        token: s.token, method: "POST",
        body: {
          assignmentId: String(a._id),
          responses: served.map((q) => ({ questionId: String(q._id), selectedOption: undefined, textAnswer: undefined })),
          timeSpent: 60,
        },
      });
      const afterEmpty = await stored(a);
      check(empty.status === 201 && !afterEmpty?.responses?.[0]?.textAnswer,
        "an uncaptured answer stores as blank -- the shape of the old bug",
        `textAnswer ${JSON.stringify(afterEmpty?.responses?.[0]?.textAnswer)}`);

      // And what the page sends now that the editor reports the code.
      const { s: s2, a: a2, served: served2 } = await sitDown("coding");
      const captured = await api("/test-submissions", {
        token: s2.token, method: "POST",
        body: {
          assignmentId: String(a2._id),
          responses: served2.map((q) => ({ questionId: String(q._id), selectedOption: undefined, textAnswer: "def solve(): pass" })),
          timeSpent: 60,
        },
      });
      const afterCapture = await stored(a2);
      check(captured.status === 201 && afterCapture?.responses?.[0]?.textAnswer === "def solve(): pass",
        "the payload TakeTest now builds stores the student's code",
        `textAnswer ${JSON.stringify(afterCapture?.responses?.[0]?.textAnswer)}`);
      check(afterCapture?.maxScore === 7,
        "and it is still marked out of the hidden test case marks",
        `${afterCapture?.maxScore}`);
    }

  } catch (e) {
    fail("script crashed", e.stack || String(e));
  } finally {
    await Promise.all([
      User.deleteMany({ _id: { $in: bin.users } }), Test.deleteMany({ _id: { $in: bin.tests } }),
      Assignment.deleteMany({ _id: { $in: bin.assignments } }),
      TestSubmission.deleteMany({ assignmentId: { $in: bin.assignments } }),
      ProctorSession.deleteMany({ assignmentId: { $in: bin.assignments } }),
    ]);
    await mongoose.disconnect();
  }

  console.log(`\n${failed === 0 ? "ALL PASS" : "FAILURES"} — ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
