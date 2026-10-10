/**
 * Regression: "ALL" is how an admin gives a mentor every subject; it is not a
 * subject itself.
 *
 *  - A mentor assigned "ALL" gets every real subject in /mentor/me/subjects,
 *    and never "ALL" itself. A mentor without it gets only their own.
 *  - "ALL" stays out of the subject lists (/subjects, /subjects/public) except
 *    for the admin's ?includeAll=true, which the mentor-assignment screens use.
 *  - No test can be created with, or moved to, the subject "ALL".
 *
 * Runs against a local API and database only -- see scripts/lib/examHarness.js.
 */

const { api, makeUser, connect, disconnect } = require("../lib/examHarness");

const MARK = `allsubj-${Date.now()}`;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `\n        -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`); }
};
const section = (title) => console.log(`\n── ${title}`);
const names = (r) => (r.body?.subjects || []).map((s) => s.name);
const hasAll = (list) => list.some((n) => n.trim().toLowerCase() === "all");

(async () => {
  await connect();
  const Subject = require("../../models/Subject");
  const Test = require("../../models/Test");

  const bin = { subjects: [], tests: [] };

  try {
    const admin = await makeUser("Admin", "admin", { mark: MARK });

    // Reuse an existing "ALL" if the local database already has one: the name
    // is unique.
    let all = await Subject.findOne({ name: /^\s*all\s*$/i });
    if (!all) {
      all = await Subject.create({ name: "ALL", createdBy: admin.user._id });
      bin.subjects.push(all._id);
    }
    const math = await Subject.create({ name: `ZZ Math ${MARK}`, createdBy: admin.user._id });
    const phys = await Subject.create({ name: `ZZ Physics ${MARK}`, createdBy: admin.user._id });
    bin.subjects.push(math._id, phys._id);

    const allMentor = await makeUser("Mentor", "allm", { mark: MARK, subjects: [all._id] });
    const mathMentor = await makeUser("Mentor", "mathm", { mark: MARK, subjects: [math._id] });

    section("Mentor subject list");
    let r = await api("/mentor/me/subjects", { token: allMentor.token });
    let list = names(r);
    check("ALL mentor: 200", r.status === 200, r);
    check("ALL mentor: sees every real subject", list.includes(math.name) && list.includes(phys.name), list);
    check("ALL mentor: does not see ALL itself", !hasAll(list), list);

    r = await api("/mentor/me/subjects", { token: mathMentor.token });
    list = names(r);
    check("single-subject mentor: sees only their subject", list.length === 1 && list[0] === math.name, list);

    section("Subject lists");
    r = await api("/subjects", { token: admin.token });
    check("/subjects hides ALL", r.status === 200 && !hasAll(names(r)) && names(r).includes(math.name), names(r));
    r = await api("/subjects?includeAll=true", { token: admin.token });
    check("/subjects?includeAll=true shows ALL to admin", hasAll(names(r)), names(r));
    r = await api("/subjects?includeAll=true", { token: allMentor.token });
    check("/subjects?includeAll=true still hides ALL from a mentor", !hasAll(names(r)), names(r));
    r = await api("/subjects/public");
    check("/subjects/public hides ALL", r.status === 200 && !hasAll(names(r)), names(r));

    section("Tests cannot use ALL as their subject");
    const question = { kind: "mcq", text: "1+1?", options: [{ text: "1" }, { text: "2" }], answer: "2", points: 1 };
    const base = { title: `ZZ ${MARK}`, type: "mcq", timeLimit: 10, questions: [question] };

    r = await api("/tests", { token: allMentor.token, method: "POST", body: { ...base, subject: "ALL" } });
    check("mentor create with subject ALL -> 400", r.status === 400, r);
    r = await api("/tests", { token: admin.token, method: "POST", body: { ...base, subject: " all " } });
    check("admin create with subject ' all ' -> 400", r.status === 400, r);

    r = await api("/tests", { token: allMentor.token, method: "POST", body: { ...base, subject: phys.name } });
    check("ALL mentor can create a test in any real subject", r.status === 201, r);
    const testId = r.body?._id;
    if (testId) bin.tests.push(testId);

    if (testId) {
      r = await api(`/tests/${testId}`, { token: allMentor.token, method: "PUT", body: { subject: "ALL" } });
      check("update subject to ALL -> 400", r.status === 400, r);
      const stored = await Test.findById(testId).select("subject").lean();
      check("test subject unchanged after refused update", stored?.subject === phys.name, stored);
    }
  } catch (error) {
    fail++;
    console.error(error);
  } finally {
    await Test.deleteMany({ _id: { $in: bin.tests } });
    await Subject.deleteMany({ _id: { $in: bin.subjects } });
    await disconnect();
    console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  }
})();
