/**
 * Regression: an exam cannot start in a browser other than Chrome or Edge, or
 * while an external monitor is connected -- enforced by the server, not just
 * the exam page.
 *
 * What is proved here, against the running API:
 *   - Firefox, Safari, Brave, Opera, old Chrome and phones cannot open a
 *     session, and nothing is created when they try.
 *   - In Chrome or Edge the question paper is withheld until the page reports
 *     exactly one screen; "can't tell" is withheld too.
 *   - A monitor reported mid-exam withholds the paper again, but never blocks
 *     saving answers or handing in. Connecting one is charged once.
 *   - A Chrome session cannot be resumed, or have its paper fetched, from
 *     Firefox.
 *   - A session opened before the rule existed is let finish in any browser.
 *   - Safe Exam Browser and practice tests are untouched.
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const { api, makeUser, connect, disconnect } = require("../lib/examHarness");

const mongoose = require("mongoose");
const MARK = `disp-${Date.now()}`;
const MIN = 60 * 1000;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail !== "" ? `\n        -> ${JSON.stringify(detail).slice(0, 600)}` : ""}`); }
};
const section = (title) => console.log(`\n── ${title}`);

// Real headers, as each browser sends them.
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)";
const B = {
  chrome: { "User-Agent": `${WIN} Chrome/130.0.0.0 Safari/537.36`, "Sec-CH-UA": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"', "Sec-CH-UA-Mobile": "?0", "Sec-CH-UA-Platform": '"Windows"' },
  edge: { "User-Agent": `${WIN} Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0`, "Sec-CH-UA": '"Chromium";v="130", "Microsoft Edge";v="130", "Not?A_Brand";v="99"', "Sec-CH-UA-Mobile": "?0", "Sec-CH-UA-Platform": '"Windows"' },
  chromeLinux: { "User-Agent": `${LINUX} Chrome/130.0.0.0 Safari/537.36`, "Sec-CH-UA": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"', "Sec-CH-UA-Mobile": "?0", "Sec-CH-UA-Platform": '"Linux"' },
  chrome99: { "User-Agent": `${WIN} Chrome/99.0.4844.51 Safari/537.36`, "Sec-CH-UA": '" Not A;Brand";v="99", "Chromium";v="99", "Google Chrome";v="99"' },
  brave: { "User-Agent": `${WIN} Chrome/130.0.0.0 Safari/537.36`, "Sec-CH-UA": '"Chromium";v="130", "Brave";v="130", "Not?A_Brand";v="99"' },
  opera: { "User-Agent": `${WIN} Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0`, "Sec-CH-UA": '"Opera";v="115", "Chromium";v="129", "Not=A?Brand";v="8"' },
  firefox: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0" },
  firefoxLinux: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0" },
  safari: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15" },
  android: { "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", "Sec-CH-UA": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"', "Sec-CH-UA-Mobile": "?1", "Sec-CH-UA-Platform": '"Android"' },
};

const ONE = { isExtended: false, policyAllowed: true };
const TWO = { isExtended: true, policyAllowed: true };
const BLOCKED = { isExtended: false, policyAllowed: false };
const NO_API = { isExtended: null, policyAllowed: null };

(async () => {
  await connect();
  const Test = require("../../models/Test");
  const Assignment = require("../../models/Assignment");
  const TestSubmission = require("../../models/TestSubmission");
  const ProctorSession = require("../../models/ProctorSession");

  const bin = { tests: [], assignments: [] };
  let admin;
  let sebSwitched = false;

  try {
    admin = await makeUser("Admin", "admin", { mark: MARK });
    const test = await Test.create({
      title: `ZZ Display ${MARK}`, type: "mcq", status: "Active", timeLimit: 30,
      allowedTabSwitches: 3, sebEnabled: false, createdBy: admin.user._id,
      questions: [
        { kind: "mcq", text: "2+2?", options: [{ text: "3" }, { text: "4" }], answer: "4", points: 1 },
        { kind: "mcq", text: "3+3?", options: [{ text: "6" }, { text: "7" }], answer: "6", points: 1 },
      ],
    });
    bin.tests.push(test._id);
    const q0 = String(test.questions[0]._id);
    const TID = String(test._id);

    /** A student with an open attempt at `onTest`, started from the dashboard. */
    async function student(label, onTest = test) {
      const s = await makeUser("Student", label, { mark: MARK });
      const startTime = new Date(Date.now() - MIN);
      const a = await Assignment.create({
        testId: onTest._id, userId: s.user._id, status: "Assigned", startTime, duration: 60,
        deadline: new Date(startTime.getTime() + 60 * MIN),
      });
      bin.assignments.push(a._id);
      return { s, a, A: String(a._id), token: s.token };
    }
    const dashboardStart = (who, headers = B.chrome) =>
      api(`/assignments/${who.A}/start`, { token: who.token, method: "POST", body: {}, headers });
    const open = (who, headers, display) =>
      api("/proctor/session/start", {
        token: who.token, method: "POST", headers,
        body: { assignmentId: who.A, testKind: "assigned", environment: { display } },
      });
    const paper = (who, headers = B.chrome) => api(`/assignments/${who.A}`, { token: who.token, headers });
    const testPaper = (who, headers = B.chrome) => api(`/tests/${TID}`, { token: who.token, headers });
    const questionsIn = (r) => r.body?.testId?.questions?.length || 0;
    const sessionsFor = (who) => ProctorSession.countDocuments({ assignmentId: who.a._id });

    // ── 1. Browsers that cannot sit the exam ─────────────────────────────
    section("Browsers other than Chrome and Edge cannot open a session");
    for (const [name, headers, code] of [
      ["Firefox", B.firefox, "browser_unsupported"],
      ["Safari", B.safari, "browser_unsupported"],
      ["Brave (User-Agent identical to Chrome)", B.brave, "browser_unsupported"],
      ["Opera", B.opera, "browser_unsupported"],
      ["Chrome 99", B.chrome99, "browser_outdated"],
      ["Chrome on an Android phone", B.android, "browser_mobile"],
    ]) {
      const who = await student(name.split(" ")[0].toLowerCase());
      await dashboardStart(who, headers);
      const r = await open(who, headers, ONE);
      check(`${name}: refused (403 ${code}) with a message`, r.status === 403 && r.body?.code === code && /Chrome|Edge|computer/.test(r.body?.message || ""), { status: r.status, body: r.body });
      check(`${name}: no session was created`, (await sessionsFor(who)) === 0);
      const p = await paper(who, headers);
      check(`${name}: and the paper is not served`, questionsIn(p) === 0, questionsIn(p));
    }

    // ── 2. Chrome, but the screens are not confirmed ──────────────────────
    section("Chrome: the paper waits for a clear 'one screen'");
    const ann = await student("ann");
    await dashboardStart(ann);
    let r = await open(ann, B.chrome, TWO);
    check("Chrome with a monitor attached: session opens (200)", r.status === 200 && r.body?.sessionId, r.body);
    check("…and its rulebook tells the page to block monitors", r.body?.policy?.blockExternalDisplay === true, r.body?.policy);
    const annSession = r.body?.sessionId;
    let doc = await ProctorSession.findById(annSession).lean();
    check("…session records enforced, state 'multiple', browser Google Chrome 130 from client hints",
      doc?.display?.enforced === true && doc?.display?.state === "multiple" && doc?.browser?.label === "Google Chrome" && doc?.browser?.major === 130 && doc?.browser?.source === "client_hints",
      { display: doc?.display, browser: doc?.browser });
    r = await paper(ann);
    check("GET /assignments/:id withholds the questions while a monitor is attached", questionsIn(r) === 0 && r.body?.proctoringRequired === true, { q: questionsIn(r), flag: r.body?.proctoringRequired });
    r = await testPaper(ann);
    check("GET /tests/:id refuses with reason external_display", r.status === 403 && r.body?.reason === "external_display", r.body);

    r = await api("/proctor/session/display", { token: ann.token, method: "POST", headers: B.chrome, body: { sessionId: annSession, display: BLOCKED } });
    check("Blocked window-management policy is 'unverified', not 'one screen'", r.body?.state === "unverified" && r.body?.allowed === false && /could not confirm/.test(r.body?.message || ""), r.body);
    r = await testPaper(ann);
    check("…and the paper stays withheld (display_unverified)", r.status === 403 && r.body?.reason === "display_unverified", r.body);

    r = await api("/proctor/session/display", { token: ann.token, method: "POST", headers: B.chrome, body: { sessionId: annSession, display: NO_API } });
    check("A browser with no display API is 'unverified'", r.body?.state === "unverified" && r.body?.allowed === false, r.body);

    r = await api("/proctor/session/display", { token: ann.token, method: "POST", headers: B.chrome, body: { sessionId: annSession } });
    check("A display report with nothing in it is 'unverified'", r.body?.state === "unverified", r.body);

    r = await api("/proctor/session/display", { token: ann.token, method: "POST", headers: B.chrome, body: { sessionId: annSession, display: ONE } });
    check("Monitor removed: /session/display says allowed", r.status === 200 && r.body?.state === "single" && r.body?.allowed === true, r.body);
    r = await paper(ann);
    check("…GET /assignments/:id now serves the questions", questionsIn(r) === 2, questionsIn(r));
    r = await testPaper(ann);
    check("…GET /tests/:id now serves the questions", r.status === 200 && (r.body?.questions || []).length === 2, { status: r.status, body: r.body?.message });

    r = await paper(ann, B.firefox);
    check("The same Chrome session's paper cannot be fetched from Firefox", questionsIn(r) === 0, questionsIn(r));
    r = await testPaper(ann, B.firefox);
    check("…/tests/:id from Firefox refused with browser_unsupported", r.status === 403 && r.body?.reason === "browser_unsupported", r.body);

    r = await api("/proctor/session/display", { token: ann.token, method: "POST", headers: B.chrome, body: { sessionId: "0".repeat(24), display: ONE } });
    check("/session/display on a session that is not yours: 404", r.status === 404, r.status);

    // ── 3. Mid-exam ───────────────────────────────────────────────────────
    section("Mid-exam: a monitor connected later");
    r = await api("/proctor/session/heartbeat", { token: ann.token, method: "POST", headers: B.chrome, body: { sessionId: annSession, display: TWO } });
    check("Heartbeat carrying a monitor: recorded, reply says not allowed", r.status === 200 && r.body?.display?.state === "multiple" && r.body?.display?.allowed === false, r.body);
    r = await testPaper(ann);
    check("…the paper is withheld again", r.status === 403 && r.body?.reason === "external_display", r.body);
    r = await api("/answers", { token: ann.token, method: "POST", headers: B.chrome, body: { assignmentId: ann.A, questionId: q0, selectedOption: "4" } });
    check("…but saving an answer still works (never lose work)", r.status === 200 || r.status === 201, { status: r.status, body: r.body });
    r = await api("/proctor/session/event", { token: ann.token, method: "POST", headers: B.chrome, body: { sessionId: annSession, violationType: "second_monitor_detected", details: "An external monitor was connected during the test" } });
    check("Connecting a monitor mid-exam is charged once (warn, count 1)", r.body?.action === "warn" && r.body?.count === 1, r.body);
    r = await api("/proctor/session/heartbeat", { token: ann.token, method: "POST", headers: B.chrome, body: { sessionId: annSession } });
    doc = await ProctorSession.findById(annSession).lean();
    check("A heartbeat without a display report leaves the state alone", doc?.display?.state === "multiple", doc?.display);
    r = await api("/proctor/session/heartbeat", { token: ann.token, method: "POST", headers: B.chrome, body: { sessionId: annSession, display: ONE } });
    check("Heartbeat after removal: allowed again", r.body?.display?.allowed === true, r.body);
    r = await testPaper(ann);
    check("…and the paper is served again", r.status === 200, r.status);

    // ── 4. Resuming ───────────────────────────────────────────────────────
    section("Resuming a session");
    const before = await ProctorSession.findById(annSession).lean();
    r = await open(ann, B.firefox, NO_API);
    check("Resuming a Chrome session from Firefox: refused (browser_unsupported)", r.status === 403 && r.body?.code === "browser_unsupported", r.body);
    const after = await ProctorSession.findById(annSession).lean();
    check("…and the session was not touched", after.violationCount === before.violationCount && after.display.state === before.display.state && after.policy.blockExternalDisplay === true, { before: before.display, after: after.display });
    r = await open(ann, B.chrome, TWO);
    check("Resuming in Chrome with a monitor: resumes, state 'multiple'", r.status === 200 && r.body?.resumed === true, r.body);
    r = await testPaper(ann);
    check("…paper withheld until the monitor goes", r.status === 403 && r.body?.reason === "external_display", r.body);
    r = await open(ann, B.edge, ONE);
    check("Resuming in Edge with one screen: resumes", r.status === 200 && r.body?.resumed === true, r.body);
    r = await testPaper(ann, B.edge);
    check("…paper served in Edge", r.status === 200, r.status);

    // ── 5. Handing in with a monitor attached ─────────────────────────────
    section("Hand-in is never blocked by the display rule");
    await api("/proctor/session/display", { token: ann.token, method: "POST", headers: B.chrome, body: { sessionId: annSession, display: TWO } });
    r = await api("/test-submissions", { token: ann.token, method: "POST", headers: B.chrome, body: { assignmentId: ann.A, timeSpent: 60, responses: [{ questionId: q0, selectedOption: "4" }] } });
    check("Submit with a monitor attached: accepted (201)", r.status === 201, { status: r.status, body: r.body });
    const sub = await TestSubmission.findOne({ assignmentId: ann.a._id }).lean();
    check("…and the monitor violation is on the handed-in record", (sub?.tabViolations || []).some((v) => v.violationType === "second_monitor_detected"), sub?.tabViolations);

    // ── 6. Edge from the start ────────────────────────────────────────────
    section("Microsoft Edge");
    const ed = await student("ed");
    await dashboardStart(ed, B.edge);
    r = await open(ed, B.edge, ONE);
    check("Edge with one screen: session opens", r.status === 200 && r.body?.policy?.blockExternalDisplay === true, r.body);
    r = await paper(ed, B.edge);
    check("…paper served straight away", questionsIn(r) === 2, questionsIn(r));

    // ── 7. Sessions opened before the rule existed ────────────────────────
    section("A session opened before the rule is let finish");
    const old = await student("old");
    await dashboardStart(old);
    r = await open(old, B.chrome, ONE);
    const oldSession = r.body?.sessionId;
    // Make it look like a pre-deploy session: no display or browser record.
    await ProctorSession.collection.updateOne({ _id: new mongoose.Types.ObjectId(oldSession) }, { $unset: { display: "", browser: "" } });
    r = await open(old, B.firefox, NO_API);
    check("Pre-rule session resumed in Firefox: allowed (200)", r.status === 200 && r.body?.resumed === true, r.body);
    check("…its rulebook no longer blocks monitors", r.body?.policy?.blockExternalDisplay === false, r.body?.policy);
    check("…and a second display is not charged there", r.body?.policy?.violationWeights?.second_monitor_detected === 0, r.body?.policy?.violationWeights);
    r = await paper(old, B.firefox);
    check("…paper served (the old rules apply)", questionsIn(r) === 2, questionsIn(r));
    doc = await ProctorSession.findById(oldSession).lean();
    check("…and it is marked not enforced, so it is not re-checked", doc?.display?.enforced === false, doc?.display);

    const old2 = await student("oldchrome");
    await dashboardStart(old2);
    r = await open(old2, B.chrome, ONE);
    await ProctorSession.collection.updateOne({ _id: new mongoose.Types.ObjectId(r.body?.sessionId) }, { $unset: { display: "", browser: "" } });
    r = await open(old2, B.chrome, TWO);
    check("Pre-rule session resumed in Chrome: brought under the rule", r.status === 200 && r.body?.policy?.blockExternalDisplay === true, r.body?.policy);
    r = await paper(old2);
    check("…and a monitor now withholds its paper", questionsIn(r) === 0, questionsIn(r));

    // ── 8. Practice tests ─────────────────────────────────────────────────
    section("Practice tests are untouched");
    const practice = await Test.create({
      title: `ZZ Practice ${MARK}`, type: "practice", isPracticeTest: true, status: "Active", timeLimit: 30,
      allowedTabSwitches: -1, createdBy: admin.user._id,
      questions: [{ kind: "mcq", text: "1+1?", options: [{ text: "2" }, { text: "3" }], answer: "2", points: 1 }],
    });
    bin.tests.push(practice._id);
    const pr = await student("practice", practice);
    r = await open(pr, B.firefox, NO_API);
    check("Practice test in Firefox: opens, proctoring off", r.status === 200 && r.body?.policy?.enabled === false, r.body);

    // ── 9. Safe Exam Browser ──────────────────────────────────────────────
    section("Safe Exam Browser tests");
    const seb = await api("/proctor/settings/seb", { token: admin.token, method: "PUT", body: { required: true } });
    sebSwitched = seb.status === 200;
    check("(SEB switched on system-wide for this section)", sebSwitched, seb.body);
    const sebTest = await Test.create({
      title: `ZZ SEB ${MARK}`, type: "mcq", status: "Active", timeLimit: 30, allowedTabSwitches: 3,
      sebEnabled: true, createdBy: admin.user._id,
      questions: [{ kind: "mcq", text: "5+5?", options: [{ text: "10" }, { text: "11" }], answer: "10", points: 1 }],
    });
    bin.tests.push(sebTest._id);
    const winFf = await student("sebwin", sebTest);
    r = await open(winFf, B.firefox, NO_API);
    check("SEB test, Windows Firefox: not told to use Chrome (they are sent to SEB)", r.status === 200 && r.body?.seb?.required === true && r.body?.seb?.verified === false, r.body);
    check("…and the display rule is off for a session waiting on SEB", r.body?.policy?.blockExternalDisplay === false, r.body?.policy);
    const linFf = await student("seblinff", sebTest);
    r = await open(linFf, B.firefoxLinux, NO_API);
    check("SEB test, Linux Firefox (no SEB for Linux): refused, use Chrome or Edge", r.status === 403 && r.body?.code === "browser_unsupported", r.body);
    const linCh = await student("seblinch", sebTest);
    r = await open(linCh, B.chromeLinux, ONE);
    check("SEB test, Linux Chrome: browser rules apply and it opens", r.status === 200 && r.body?.seb?.fallbackReason === "os_unsupported" && r.body?.policy?.blockExternalDisplay === true, r.body);
  } catch (error) {
    fail++;
    console.log(`  FAIL  script crashed: ${error.stack}`);
  } finally {
    if (sebSwitched) await api("/proctor/settings/seb", { token: admin.token, method: "PUT", body: { required: false } });
    await TestSubmission.deleteMany({ assignmentId: { $in: bin.assignments } });
    await ProctorSession.deleteMany({ assignmentId: { $in: bin.assignments } });
    await Assignment.deleteMany({ _id: { $in: bin.assignments } });
    await Test.deleteMany({ _id: { $in: bin.tests } });
    await disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
