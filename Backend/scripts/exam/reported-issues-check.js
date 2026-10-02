/**
 * The issues from "Testing / Issues Found", each as the thing the tester saw.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const { api, makeUser, connect, disconnect } = require("../lib/examHarness");
const mongoose = require("mongoose");
const MARK = `rep-${Date.now()}`;

let passed = 0, failed = 0;
const pass = (l) => { passed++; console.log(`  PASS  ${l}`); };
const fail = (l, d) => { failed++; console.log(`  FAIL  ${l}\n        ${d}`); };
const check = (c, l, d) => (c ? pass(l) : fail(l, d));

(async () => {
  await connect();
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");
  const Subject = require("../../models/Subject");

  const bin = { users: [], tests: [], assignments: [], subjects: [] };
  let seq = 0;

  const mkUser = (role = "Student") => makeUser(role, "", { mark: MARK });

  // A reviewer the server actually recognises: a mentor who teaches the test's
  // subject, is attached to the attempt, and has the student in their batch
  // (routes/testSubmissions.js, GET /assignment/:id). An arbitrary mentor is
  // rightly refused -- that check closed a hole where any signed-in user could
  // read any submission -- so this used to fail with a 403, not a wrong answer.
  const mkReviewer = async (test, assignmentIds) => {
    const subject = await Subject.create({ name: `ZZ subject ${MARK} ${bin.subjects.length}`, createdBy: test.createdBy });
    bin.subjects.push(subject._id);
    await Test.updateOne({ _id: test._id }, { $set: { subject: subject.name } });
    const mentor = await makeUser("Mentor", "reviewer", { mark: MARK, subjects: [subject._id] });
    await Assignment.updateMany({ _id: { $in: assignmentIds } }, { $set: { mentorId: mentor.user._id } });
    return mentor;
  };

  const mcqs = (n) => Array.from({ length: n }, (_, i) => ({
    kind: "mcq", text: `Question ${i}`,
    options: [{ text: `correct-${i}` }, { text: `wrong-${i}` }],
    answer: `correct-${i}`, points: 2,
  }));

  const sitDown = async (test, student, kind = "assigned") => {
    const a = await Assignment.create({
      testId: test._id, userId: student.user._id, status: "Assigned",
      startTime: new Date(Date.now() - 60000), duration: 240, mentorId: null,
    });
    bin.assignments.push(a._id);
    await api("/proctor/session/start", { token: student.token, method: "POST", body: { assignmentId: String(a._id), testKind: kind } });
    const r = await api(`/assignments/${a._id}/start`, { token: student.token, method: "POST" });
    return { a, served: r.body?.test?.questions || [] };
  };

  const ids = (qs) => (qs || []).map((q) => String(q._id));

  try {
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n════ 1. MCQ shuffle — and why it looked broken ════\n");
    {
      const owner = await mkUser("Admin");
      const test = await Test.create({
        title: `ZZ shuffle ${MARK}`, type: "mcq", timeLimit: 60, allowedTabSwitches: 100,
        status: "Active", createdBy: owner.user._id, shuffleQuestions: true, questions: mcqs(8),
      });
      bin.tests.push(test._id);
      const canonical = ids(test.questions);

      const a1 = await mkUser(), a2 = await mkUser();
      const s1 = await sitDown(test, a1), s2 = await sitDown(test, a2);

      check(ids(s1.served).join() !== ids(s2.served).join(),
        "two students sit demonstrably different papers", "both got the same order");

      // Both finish, then review their own paper.
      for (const [stu, sit] of [[a1, s1], [a2, s2]]) {
        await api("/test-submissions", {
          token: stu.token, method: "POST",
          body: {
            assignmentId: String(sit.a._id),
            responses: ids(sit.served).map((id) => ({ questionId: id, selectedOption: test.questions.id(id).answer })),
            timeSpent: 60,
          },
        });
        await Assignment.updateOne({ _id: sit.a._id }, { $set: { deadline: new Date(Date.now() - 60000) } });
      }

      const r1 = await api(`/test-submissions/assignment/${s1.a._id}`, { token: a1.token });
      const r2 = await api(`/test-submissions/assignment/${s2.a._id}`, { token: a2.token });
      const rev1 = ids(r1.body?.test?.questions), rev2 = ids(r2.body?.test?.questions);

      // THE BUG: both reviews used to come back canonical, so two shuffled
      // papers looked identical afterwards and the feature looked dead.
      check(rev1.join() === ids(s1.served).join(),
        "a student reviews the paper in the order they actually sat it",
        `sat ${ids(s1.served).join()}\n        saw ${rev1.join()}`);
      check(rev1.join() !== rev2.join(),
        "two students' reviews are no longer identical", "both reviews came back in the same order");

      const mentor = await mkReviewer(test, [s1.a._id]);
      const rm = await api(`/test-submissions/assignment/${s1.a._id}`, { token: mentor.token });
      check(ids(rm.body?.test?.questions).join() === canonical.join(),
        "a reviewer still sees canonical order, so Q3 means one fixed thing",
        `reviewer order differs from canonical`);
    }

    // ═══════════════════════════════════════════════════════════════════
    console.log("\n════ 2. The violation record is the proctor's ════\n");
    {
      const owner = await mkUser("Admin");
      const test = await Test.create({
        title: `ZZ viol ${MARK}`, type: "mcq", timeLimit: 60, allowedTabSwitches: 20,
        status: "Active", createdBy: owner.user._id, questions: mcqs(2),
      });
      bin.tests.push(test._id);
      const stu = await mkUser();
      const { a, served } = await sitDown(test, stu);

      const started = await api("/proctor/session/start", { token: stu.token, method: "POST", body: { assignmentId: String(a._id), testKind: "assigned" } });
      await api("/proctor/session/event", {
        token: stu.token, method: "POST",
        body: { sessionId: started.body.sessionId, events: [{ violationType: "tab_switch", details: "left the exam" }] },
      });
      await api("/test-submissions", {
        token: stu.token, method: "POST",
        body: { assignmentId: String(a._id), responses: ids(served).map((id) => ({ questionId: id, selectedOption: null })), timeSpent: 10 },
      });
      await Assignment.updateOne({ _id: a._id }, { $set: { deadline: new Date(Date.now() - 60000) } });

      const asStudent = await api(`/test-submissions/assignment/${a._id}`, { token: stu.token });
      const asMentor = await api(`/test-submissions/assignment/${a._id}`, { token: (await mkReviewer(test, [a._id])).token });

      const sSub = asStudent.body?.submission || {};
      const mSub = asMentor.body?.submission || {};

      check(sSub.tabViolations === undefined && sSub.tabViolationCount === undefined,
        "the student's results carry no violation log and no tally",
        `student got count=${sSub.tabViolationCount} list=${JSON.stringify(sSub.tabViolations)}`);
      check(sSub.proctorBypassUsed === undefined,
        "nor whether a proctor bypass was used", `got ${sSub.proctorBypassUsed}`);
      check(Array.isArray(mSub.tabViolations) && mSub.tabViolations.length >= 1,
        "the reviewer still gets the full record",
        `reviewer got ${JSON.stringify(mSub.tabViolations)}`);
      check(sSub.autoSubmit !== undefined || sSub.cancelledDueToViolation !== undefined,
        "the student is still told how their own paper was submitted",
        "the submission's own status went missing too");
    }

    // ═══════════════════════════════════════════════════════════════════
    console.log("\n════ 4. Stopping a screen share is ONE violation ════\n");
    {
      const owner = await mkUser("Admin");
      const test = await Test.create({
        title: `ZZ share ${MARK}`, type: "mcq", timeLimit: 60, allowedTabSwitches: 20,
        status: "Active", createdBy: owner.user._id, questions: mcqs(2),
      });
      bin.tests.push(test._id);
      const stu = await mkUser();
      const { a } = await sitDown(test, stu);
      const started = await api("/proctor/session/start", { token: stu.token, method: "POST", body: { assignmentId: String(a._id), testKind: "assigned" } });
      const before = (await ProctorSession.findById(started.body.sessionId).lean()).violationCount;

      // Exactly what the browser sends when the student clicks "Stop sharing":
      // the share ends, Chrome's bar steals focus, and fullscreen drops.
      await api("/proctor/session/event", {
        token: stu.token, method: "POST",
        body: {
          sessionId: started.body.sessionId,
          events: [
            { violationType: "screen_share_stopped", details: "Screen sharing was turned off" },
            { violationType: "window_blur", details: "Switched away from the exam tab" },
            { violationType: "fullscreen_exit", details: "Left fullscreen mode" },
          ],
        },
      });

      const after = await ProctorSession.findById(started.body.sessionId).lean();
      // "One charge" means one violation is billed, not that it is worth one
      // point. The weight itself is asserted below.
      const billed = after.violations.filter((v) => v.weight > 0);
      check(billed.length === 1 && billed[0].violationType === "screen_share_stopped",
        "one act bills one violation, the cause, not three",
        `billed ${JSON.stringify(after.violations.map((v) => `${v.violationType}:${v.weight}`))}`);
      // Scored 1, not 2. The exam is already blocked until the student shares
      // again, and that block is the enforcement -- charging twice over for one
      // act punished them for the same thing in two different ways.
      check(after.violationCount - before === 1,
        "and it costs exactly what stopping a share is worth (1)",
        `charged ${after.violationCount - before}`);
      check(after.violations.length >= 3,
        "all three are still recorded, so the reviewer sees the whole sequence",
        `${after.violations.length} recorded`);

      // A genuine, unrelated tab switch later must still cost the student.
      await new Promise((r) => setTimeout(r, 5200));
      await api("/proctor/session/event", {
        token: stu.token, method: "POST",
        body: { sessionId: started.body.sessionId, events: [{ violationType: "tab_switch", details: "actually left" }] },
      });
      const later = await ProctorSession.findById(started.body.sessionId).lean();
      check(later.violationCount - after.violationCount === 1,
        "a real tab switch outside that window is still charged",
        `charged ${later.violationCount - after.violationCount}`);
      check(later.violations.filter((v) => v.weight > 0).length === 2,
        "so two separate acts bill two violations", `${later.violations.filter((v) => v.weight > 0).length}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    console.log("\n════ 5. Assigned-tests count matches what is shown ════\n");
    {
      const stu = await mkUser();
      const owner = await mkUser("Admin");
      const made = [];
      for (const type of ["mcq", "theory", "coding"]) {
        const t = await Test.create({
          title: `ZZ count ${type} ${MARK}`, type, timeLimit: 30, status: "Active",
          createdBy: owner.user._id,
          questions: type === "mcq" ? mcqs(2)
            : type === "theory" ? [{ kind: "theory", text: "essay", expectedAnswer: "M", points: 5 }]
            : [{ kind: "coding", text: "solve", points: 5, language: "python", visibleTestCases: [], hiddenTestCases: [{ input: "1", output: "1", marks: 5 }] }],
        });
        bin.tests.push(t._id);
        made.push(t);
        const a = await Assignment.create({
          testId: t._id, userId: stu.user._id, status: "Assigned",
          startTime: new Date(Date.now() - 60000), duration: 240,
        });
        bin.assignments.push(a._id);
      }

      const page = await api("/assignments/student?page=1&limit=9&exclude=coding&forceRefresh=true", { token: stu.token });
      const list = page.body?.assignments || [];
      const total = page.body?.pagination?.totalItems;
      check(total === 2 && list.length === 2,
        "the header count and the cards agree (2 and 2), coding excluded",
        `total=${total}, shown=${list.length}`);
      check(!list.some((x) => x.testId?.type === "coding"),
        "no coding exam leaks into the assigned list", "a coding test was listed");

      const unfiltered = await api("/assignments/student?page=1&limit=9&forceRefresh=true", { token: stu.token });
      check(unfiltered.body?.pagination?.totalItems === 3,
        "without the filter all three are still counted, so nothing was lost",
        `total=${unfiltered.body?.pagination?.totalItems}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    console.log("\n════ 6. An expired attempt cannot be reopened ════\n");
    {
      const owner = await mkUser("Admin");
      const test = await Test.create({
        title: `ZZ expiry ${MARK}`, type: "mcq", timeLimit: 30, allowedTabSwitches: 100,
        status: "Active", createdBy: owner.user._id, questions: mcqs(3),
      });
      bin.tests.push(test._id);
      const stu = await mkUser();
      const { a, served } = await sitDown(test, stu);
      check(served.length === 3, "the paper is served while the attempt is live", `${served.length}`);

      // The tester's scenario: Start pressed, permissions never granted, and
      // the clock runs out with the attempt still "In Progress".
      const longAgo = new Date(Date.now() - 8 * 3600e3);
      await Assignment.updateOne({ _id: a._id }, { $set: { startedAt: longAgo, startTime: longAgo, deadline: new Date(Date.now() - 4 * 3600e3) } });

      const reopen = await api(`/assignments/${a._id}/start`, { token: stu.token, method: "POST" });
      // Either refusal is correct. Which one depends on whether the background
      // sweep has already finalised the attempt, so the assertion is on the
      // outcome -- refused, with a reason -- not on the race.
      const refused =
        reopen.status === 400 &&
        (reopen.body?.code === "attempt_expired" || /already completed/i.test(reopen.body?.message || ""));
      check(refused,
        "pressing Start again is refused with a reason the page can act on",
        `status ${reopen.status}: ${JSON.stringify(reopen.body)}`);

      const resume = await api(`/assignments/${a._id}`, { token: stu.token });
      check((resume.body?.testId?.questions || []).length === 0 && resume.body?.expired === true,
        "the resume path serves no questions either",
        `expired=${resume.body?.expired}, questions=${(resume.body?.testId?.questions || []).length}`);

      const admin = await mkUser("Admin");
      const asAdmin = await api(`/assignments/${a._id}`, { token: admin.token });
      check((asAdmin.body?.testId?.questions || []).length === 3,
        "an admin can still open the expired attempt to mark it",
        `admin saw ${(asAdmin.body?.testId?.questions || []).length} questions (status ${asAdmin.status})`);
    }

  } catch (e) {
    fail("script crashed", e.stack || String(e));
  } finally {
    await Promise.all([
      Test.deleteMany({ _id: { $in: bin.tests } }),
      Subject.deleteMany({ _id: { $in: bin.subjects } }),
      Assignment.deleteMany({ _id: { $in: bin.assignments } }),
      TestSubmission.deleteMany({ assignmentId: { $in: bin.assignments } }),
      ProctorSession.deleteMany({ assignmentId: { $in: bin.assignments } }),
    ]);
    await disconnect();
  }

  console.log(`\n${failed === 0 ? "ALL PASS" : "FAILURES"} — ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
