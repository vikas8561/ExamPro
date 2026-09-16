/**
 * Deep audit: auto-submit, shuffling, and marking under shuffling.
 *
 * The existing scripts check that each feature works. This one goes after the
 * properties that only break under pressure -- distribution quality of the
 * shuffle, grading that follows question ids rather than positions, order
 * stability across the whole student journey, and what the server-side sweep
 * can actually recover for each kind of exam.
 *
 * Needs the API running on :4000 and MONGODB_URI set.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { grantSession, revokeSessions } = require("../lib/testAuth");

const API = "http://localhost:4000/api";
const MARK = `deep-${Date.now()}`;

let passed = 0, failed = 0;
const pass = (l) => { passed++; console.log(`  PASS  ${l}`); };
const fail = (l, d) => { failed++; console.log(`  FAIL  ${l}\n        ${d}`); };
const check = (c, l, d) => (c ? pass(l) : fail(l, d));
const note = (l) => console.log(`  NOTE  ${l}`);

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
  const { sweepExpiredAttempts } = require("../../services/expiredAttempts");

  const bin = { users: [], tests: [], assignments: [] };
  let seq = 0;

  const mkUser = async (role = "Student") => {
    const n = `u${seq++}`;
    const u = new User({ name: `ZZ ${n} ${MARK}`, email: `${MARK}-${n}@verify.invalid`, password: "x", role });
    await u.save();
    const token = jwt.sign({ userId: u._id, email: u.email, role: u.role }, process.env.JWT_SECRET, { expiresIn: "2h" });
    await grantSession(u, token); bin.users.push(u._id);
    return { user: u, token };
  };

  /** MCQs whose options are unique per question, so a copied answer cannot fit. */
  const distinctMcqs = (n, points = 2) => Array.from({ length: n }, (_, i) => ({
    kind: "mcq",
    text: `Question ${i}`,
    options: [{ text: `correct-${i}` }, { text: `wrong-${i}` }, { text: `other-${i}` }],
    answer: `correct-${i}`,
    points,
  }));

  const mkTest = async (owner, opts) => {
    const t = await Test.create({
      title: `ZZ ${MARK} ${seq++}`, type: opts.type || "mcq", timeLimit: 60, allowedTabSwitches: 100,
      status: "Active", createdBy: owner, shuffleQuestions: opts.shuffle !== false,
      negativeMarkingPercent: opts.negative || 0, questions: opts.questions,
    });
    bin.tests.push(t._id);
    return t;
  };

  const sitDown = async (test, student, testKind = "assigned") => {
    const a = await Assignment.create({
      testId: test._id, userId: student.user._id, status: "Assigned",
      startTime: new Date(Date.now() - 60000), duration: 240, mentorId: null,
    });
    bin.assignments.push(a._id);
    await api("/proctor/session/start", { token: student.token, method: "POST", body: { assignmentId: String(a._id), testKind } });
    const r = await api(`/assignments/${a._id}/start`, { token: student.token, method: "POST" });
    return { a, served: r.body?.test?.questions || [] };
  };

  const ids = (qs) => (qs || []).map((q) => String(q._id));

  try {
    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n╔══ A. AUTO-SUBMIT ════════════════════════════════════════╗\n");

    console.log("── A1. The sweep recovers what each kind of exam autosaved ──\n");

    for (const kind of ["mcq", "theory"]) {
      const s = await mkUser();
      const questions = kind === "mcq"
        ? distinctMcqs(3)
        : [{ kind: "theory", text: "essay one", expectedAnswer: "M", points: 5 },
           { kind: "theory", text: "essay two", expectedAnswer: "M", points: 5 },
           { kind: "theory", text: "essay three", expectedAnswer: "M", points: 5 }];
      const test = await mkTest(s.user._id, { type: kind, questions, shuffle: false });
      const { a, served } = await sitDown(test, s);

      // Two of three answered, then the browser dies.
      for (const q of served.slice(0, 2)) {
        await api("/answers", {
          token: s.token, method: "POST",
          body: kind === "mcq"
            ? { assignmentId: String(a._id), questionId: String(q._id), selectedOption: test.questions.id(q._id).answer }
            : { assignmentId: String(a._id), questionId: String(q._id), textAnswer: `essay for ${q._id}` },
        });
      }
      const longAgo = new Date(Date.now() - 8 * 3600e3);
      await Assignment.updateOne({ _id: a._id }, { $set: { startedAt: longAgo, startTime: longAgo, deadline: new Date(Date.now() - 4 * 3600e3) } });

      await sweepExpiredAttempts();
      const sub = await TestSubmission.findOne({ assignmentId: a._id }).lean();
      const asg = await Assignment.findById(a._id).lean();
      const recovered = (sub?.responses || []).filter((r) => r.selectedOption || r.textAnswer).length;

      check(asg.status === "Completed" && recovered === 2,
        `${kind}: abandoned attempt finalised with both autosaved answers recovered`,
        `status ${asg.status}, recovered ${recovered}, score ${sub?.totalScore}/${sub?.maxScore}`);
      if (kind === "mcq") {
        check(sub.totalScore === 4 && sub.maxScore === 6,
          "mcq: the recovered answers were actually marked (4 of 6)",
          `${sub.totalScore}/${sub.maxScore}`);
      }
    }

    console.log("\n── A2. A coding exam recovers its autosaved code ──\n");
    {
      const s = await mkUser();
      const test = await mkTest(s.user._id, {
        type: "coding", shuffle: false,
        questions: [
          { kind: "coding", text: "solve A", points: 5, language: "python", visibleTestCases: [], hiddenTestCases: [{ input: "1", output: "1", marks: 5 }] },
          { kind: "coding", text: "solve B", points: 5, language: "python", visibleTestCases: [], hiddenTestCases: [{ input: "2", output: "2", marks: 5 }] },
        ],
      });
      const { a, served } = await sitDown(test, s, "coding");

      // What the coding page now does while the student types. It used to keep
      // the code in memory only and merely move a "Saved" timestamp, so an
      // abandoned attempt finalised empty and every line was lost.
      await api("/answers", {
        token: s.token, method: "POST",
        body: {
          assignmentId: String(a._id), questionId: String(served[0]._id),
          selectedOption: null, textAnswer: "def solve():\n    return 1", language: "javascript",
        },
      });

      const longAgo = new Date(Date.now() - 8 * 3600e3);
      await Assignment.updateOne({ _id: a._id }, { $set: { startedAt: longAgo, startTime: longAgo, deadline: new Date(Date.now() - 4 * 3600e3) } });
      await sweepExpiredAttempts();

      const sub = await TestSubmission.findOne({ assignmentId: a._id }).lean();
      const asg = await Assignment.findById(a._id).lean();
      const row = (sub?.responses || []).find((r) => String(r.questionId) === String(served[0]._id));

      check(asg.status === "Completed", "coding: the abandoned attempt is finalised", `status ${asg.status}`);
      check(row?.textAnswer === "def solve():\n    return 1",
        "coding: the student's autosaved code survives the sweep",
        `recovered ${JSON.stringify(row?.textAnswer)}`);
      check(row?.language === "javascript",
        "coding: the language is recovered too, so the mentor reads it correctly",
        `language ${JSON.stringify(row?.language)}`);
      check(sub?.maxScore === 10, "coding: still marked out of the hidden test case marks", `${sub?.maxScore}`);

      const untouched = (sub?.responses || []).find((r) => String(r.questionId) === String(served[1]._id));
      check(untouched && !untouched.textAnswer,
        "coding: the question never attempted is recorded as unanswered, not invented",
        `${JSON.stringify(untouched?.textAnswer)}`);
    }

    console.log("\n── A3. A double submit cannot corrupt a score ──\n");
    {
      const s = await mkUser();
      const test = await mkTest(s.user._id, { questions: distinctMcqs(4), shuffle: false });
      const { a, served } = await sitDown(test, s);
      const payload = {
        assignmentId: String(a._id),
        responses: served.map((q) => ({ questionId: String(q._id), selectedOption: test.questions.id(q._id).answer })),
        timeSpent: 60, autoSubmit: true,
      };
      // Fire both at once, as a timer firing twice in one tick would.
      const [r1, r2] = await Promise.all([
        api("/test-submissions", { token: s.token, method: "POST", body: payload }),
        api("/test-submissions", { token: s.token, method: "POST", body: payload }),
      ]);
      const subs = await TestSubmission.find({ assignmentId: a._id }).lean();
      const sub = subs[0];
      check(subs.length === 1, "only one submission document exists", `${subs.length} submissions`);
      check(sub.totalScore === 8 && sub.maxScore === 8,
        "the score is correct and not doubled",
        `${sub.totalScore}/${sub.maxScore} (statuses ${r1.status}/${r2.status})`);
      check(sub.responses.length === 4, "responses are not duplicated", `${sub.responses.length} rows`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n╔══ B. SHUFFLE (MCQ) ══════════════════════════════════════╗\n");

    const N_STUDENTS = 24;
    const N_QUESTIONS = 8;
    let shuffleTest = await mkTest((await mkUser("Admin")).user._id, { questions: distinctMcqs(N_QUESTIONS) });
    const canonical = ids(shuffleTest.questions);
    const papers = [];

    for (let i = 0; i < N_STUDENTS; i++) {
      const s = await mkUser();
      const { a, served } = await sitDown(shuffleTest, s);
      papers.push({ s, a, served, order: ids(served) });
    }

    console.log(`── B1. Distribution across ${N_STUDENTS} students, ${N_QUESTIONS} questions ──\n`);
    {
      const distinctOrders = new Set(papers.map((p) => p.order.join(","))).size;
      check(distinctOrders >= N_STUDENTS - 2,
        `orders are near-all-distinct (${distinctOrders}/${N_STUDENTS})`,
        `only ${distinctOrders} distinct permutations`);

      // Every question should land in a spread of positions, not drift to one.
      const positions = new Map(canonical.map((id) => [id, new Set()]));
      for (const p of papers) p.order.forEach((id, idx) => positions.get(id)?.add(idx));
      const spreads = [...positions.values()].map((set) => set.size);
      check(Math.min(...spreads) >= 4,
        `every question appeared in at least 4 different positions (min ${Math.min(...spreads)}, max ${Math.max(...spreads)})`,
        `spreads ${JSON.stringify(spreads)}`);

      const canonicalCount = papers.filter((p) => p.order.join(",") === canonical.join(",")).length;
      check(canonicalCount <= 1, "almost nobody receives the canonical order", `${canonicalCount} students got it`);

      const firstQuestions = new Set(papers.map((p) => p.order[0])).size;
      check(firstQuestions >= 5, `the opening question varies (${firstQuestions} different ones)`, `only ${firstQuestions}`);
    }

    console.log("\n── B2. Every paper is the same exam, only reordered ──\n");
    {
      const sameSet = papers.every((p) => JSON.stringify([...p.order].sort()) === JSON.stringify([...canonical].sort()));
      check(sameSet, "every student got exactly the same set of questions", "a paper differed in content");
      check(papers.every((p) => p.order.length === N_QUESTIONS), "every paper is complete", "a paper was short");
      check(papers.every((p) => new Set(p.order).size === N_QUESTIONS), "no paper repeats a question", "a paper had duplicates");

      // Content must travel with the id, or a shuffled paper would mislabel itself.
      const textMatches = papers.every((p) => p.served.every((q) => {
        const real = shuffleTest.questions.id(q._id);
        return real && real.text === q.text;
      }));
      check(textMatches, "each question's text still matches its own id", "text and id disagree somewhere");

      // Options are deliberately NOT shuffled: the answer key is option text.
      const optionsIntact = papers.every((p) => p.served.every((q) => {
        const real = shuffleTest.questions.id(q._id);
        return JSON.stringify(q.options.map((o) => o.text)) === JSON.stringify(real.options.map((o) => o.text));
      }));
      check(optionsIntact, "option order within each question is untouched, as designed", "options were reordered");

      check(papers.every((p) => p.served.every((q) => q.answer === undefined)),
        "no shuffled paper leaks an answer key", "an answer field survived");
    }

    console.log("\n── B3. The order holds for the whole sitting ──\n");
    {
      const p = papers[0];
      const restart = await api(`/assignments/${p.a._id}/start`, { token: p.s.token, method: "POST" });
      const reload = await api(`/assignments/${p.a._id}`, { token: p.s.token });
      const viaTest = await api(`/tests/${shuffleTest._id}`, { token: p.s.token });
      check(ids(restart.body?.test?.questions).join() === p.order.join(), "re-entering the exam returns the same order", "order changed on restart");
      check(ids(reload.body?.testId?.questions).join() === p.order.join(), "the resume path returns the same order", "order changed on reload");
      check(ids(viaTest.body?.questions).join() === p.order.join(), "the test route returns the same order", "order changed via /tests");

      // Now that a test edit preserves question ids, an edit must not reshuffle.
      const admin = await mkUser("Admin");
      const edit = shuffleTest.questions.map((q) => ({
        _id: String(q._id), kind: q.kind, text: q.text, points: q.points,
        options: q.options.map((o) => ({ text: o.text })), answer: q.answer,
      }));
      edit[0].text = "Question 0 (reworded)";
      const put = await api(`/tests/${shuffleTest._id}`, { token: admin.token, method: "PUT", body: { questions: edit } });
      const afterEdit = await api(`/assignments/${p.a._id}`, { token: p.s.token });
      check(put.status === 200 && ids(afterEdit.body?.testId?.questions).join() === p.order.join(),
        "a mid-exam edit does not reshuffle the paper (ids now survive edits)",
        `status ${put.status}; order now ${ids(afterEdit.body?.testId?.questions).join()}`);

      // The edit just changed a question's wording, so the local fixture is now
      // stale. Everything below compares against the test as it really is.
      shuffleTest = await Test.findById(shuffleTest._id);
    }

    console.log("\n── B4. Shuffling applies to theory and coding papers too ──\n");
    {
      for (const type of ["theory", "coding"]) {
        const owner = await mkUser("Admin");
        const questions = type === "theory"
          ? Array.from({ length: 6 }, (_, i) => ({ kind: "theory", text: `Essay ${i}`, expectedAnswer: "M", points: 5 }))
          : Array.from({ length: 6 }, (_, i) => ({
              kind: "coding", text: `Problem ${i}`, points: 5, language: "python",
              visibleTestCases: [], hiddenTestCases: [{ input: "1", output: "1", marks: 3 }],
            }));
        const t = await mkTest(owner.user._id, { type, questions });
        const canon = ids(t.questions);
        const orders = [];
        for (let i = 0; i < 8; i++) {
          const s2 = await mkUser();
          const { served } = await sitDown(t, s2, type === "coding" ? "coding" : "assigned");
          orders.push(ids(served));
        }
        const distinct = new Set(orders.map((o) => o.join())).size;
        check(distinct >= 6, `${type}: papers are shuffled per student (${distinct}/8 distinct)`, `only ${distinct} distinct`);
        check(orders.every((o) => JSON.stringify([...o].sort()) === JSON.stringify([...canon].sort())),
          `${type}: every paper still holds the same questions`, "a paper differed in content");
        check(orders.every((o) => o.length === 6), `${type}: no question is dropped`, "a paper was short");
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    console.log("\n╔══ C. MARKING UNDER SHUFFLE ══════════════════════════════╗\n");

    console.log("── C1. Copying a neighbour's answers by position fails ──\n");
    {
      // This is the entire point of the feature. A and B sit the same exam in
      // different orders. A answers everything correctly. B writes down A's
      // answers in A's order -- exactly what copying off a neighbour looks like.
      const a = papers[0], b = papers.find((p) => p.order.join() !== papers[0].order.join());

      const aResponses = a.order.map((id) => ({ questionId: id, selectedOption: shuffleTest.questions.id(id).answer }));
      // B submits A's nth answer against B's nth question.
      const bResponses = b.order.map((id, idx) => ({
        questionId: id,
        selectedOption: shuffleTest.questions.id(a.order[idx]).answer,
      }));

      await api("/test-submissions", { token: a.s.token, method: "POST", body: { assignmentId: String(a.a._id), responses: aResponses, timeSpent: 60 } });
      await api("/test-submissions", { token: b.s.token, method: "POST", body: { assignmentId: String(b.a._id), responses: bResponses, timeSpent: 60 } });

      const aSub = await TestSubmission.findOne({ assignmentId: a.a._id }).lean();
      const bSub = await TestSubmission.findOne({ assignmentId: b.a._id }).lean();

      // B is right only where the shuffle happened to agree with A.
      const overlap = b.order.filter((id, idx) => id === a.order[idx]).length;
      const max = N_QUESTIONS * 2;

      check(aSub.totalScore === max, "the student answering their own paper scores full marks", `${aSub.totalScore}/${max}`);
      check(bSub.totalScore === overlap * 2,
        `the copier scores only the ${overlap} question(s) where the two papers happened to align`,
        `expected ${overlap * 2}, got ${bSub.totalScore}`);
      check(bSub.totalScore < aSub.totalScore, "copying by position no longer works", `copier got ${bSub.totalScore}, same as the source`);
    }

    console.log("\n── C2. Identical answers by id score identically, whatever the order ──\n");
    {
      const cohort = papers.slice(2, 12);
      const results = [];
      for (const p of cohort) {
        // Right on questions 0-2, wrong on 3-4, blank on the rest -- keyed by id.
        const responses = p.order.map((id) => {
          const q = shuffleTest.questions.id(id);
          const n = Number(q.text.split(" ")[1]);
          if (n <= 2) return { questionId: id, selectedOption: q.answer };
          if (n <= 4) return { questionId: id, selectedOption: `wrong-${n}` };
          return { questionId: id, selectedOption: null };
        });
        await api("/test-submissions", { token: p.s.token, method: "POST", body: { assignmentId: String(p.a._id), responses, timeSpent: 60 } });
        const sub = await TestSubmission.findOne({ assignmentId: p.a._id }).lean();
        results.push({ total: sub.totalScore, max: sub.maxScore, correct: sub.responses.filter((r) => r.isCorrect).length });
      }
      const first = JSON.stringify(results[0]);
      check(results.every((r) => JSON.stringify(r) === first),
        `all ${cohort.length} students scored identically despite ${new Set(cohort.map((p) => p.order.join())).size} different orders`,
        JSON.stringify(results));
      check(results[0].total === 6 && results[0].max === 16 && results[0].correct === 3,
        "and the score is the arithmetically right one (3 x 2 = 6 of 16)",
        JSON.stringify(results[0]));
    }

    console.log("\n── C3. Marks land on the right question in the results view ──\n");
    {
      const p = papers[2];
      const admin = await mkUser("Admin");
      const res = await api(`/test-submissions/assignment/${p.a._id}`, { token: admin.token });
      const rows = res.body?.test?.questions || [];
      check(rows.length === N_QUESTIONS, "every question appears in the review", `${rows.length} rows`);

      const misfiled = rows.filter((row) => {
        const real = shuffleTest.questions.id(row._id);
        if (!real) return true;
        if (row.text !== real.text) return true;
        if (row.answer && row.answer !== real.answer) return true;
        if (!row.selectedOption) return false;
        return row.isCorrect !== (row.selectedOption === real.answer);
      });
      check(misfiled.length === 0,
        "every row's text, answer key and correctness belong to that row's own question",
        `${misfiled.length} misfiled: ${JSON.stringify(misfiled.slice(0, 2).map((r) => r.text))}`);

      const reviewOrder = ids(rows).join();
      check(reviewOrder === canonical.join(),
        "the reviewer sees canonical order, not the student's shuffle",
        `review order differs from canonical`);
    }

    console.log("\n── C4. Negative marking under shuffle ──\n");
    {
      const owner = await mkUser("Admin");
      const negTest = await mkTest(owner.user._id, { questions: distinctMcqs(6), negative: 0.5 });
      const marks = [];
      for (let i = 0; i < 6; i++) {
        const s = await mkUser();
        const { a, served } = await sitDown(negTest, s);
        const responses = served.map((q) => {
          const real = negTest.questions.id(q._id);
          const n = Number(real.text.split(" ")[1]);
          if (n <= 1) return { questionId: String(q._id), selectedOption: real.answer };   // 2 right  = +4
          if (n <= 3) return { questionId: String(q._id), selectedOption: `wrong-${n}` };  // 2 wrong  = -2
          return { questionId: String(q._id), selectedOption: null };                      // 2 blank  =  0
        });
        await api("/test-submissions", { token: s.token, method: "POST", body: { assignmentId: String(a._id), responses, timeSpent: 60 } });
        const sub = await TestSubmission.findOne({ assignmentId: a._id }).lean();
        marks.push({ total: sub.totalScore, max: sub.maxScore, blanks: sub.responses.filter((r) => r.points === 0 && !r.selectedOption).length });
      }
      check(marks.every((m) => m.total === 2 && m.max === 12),
        "every student scores 2 of 12 (+4 correct, -2 penalty, 0 for blanks)",
        JSON.stringify(marks));
      check(marks.every((m) => m.blanks === 2),
        "unanswered questions take no penalty, whatever position they landed in",
        JSON.stringify(marks));
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
