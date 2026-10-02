/**
 * Rules for a coding answer already graded by Judge0, at hand-in:
 *   - the earned grade survives a blank final answer;
 *   - it is stored with the code that earned it, and the editor's contents at
 *     hand-in are kept as draftAnswer (the rule autosave already follows);
 *   - the hidden-case pass count is kept.
 *
 * Originally: a coding grade earned on Judge0 survived only a non-blank answer.
 *
 * gradeSubmission (services/submissionGrading.js) only looked up an earlier
 * Judge0 grade for a question the hand-in had ANSWERED. A student who scored,
 * then cleared the editor -- or whose editor came back empty after a reload --
 * handed the question in blank, and the earned marks were dropped to zero.
 *
 * Pure: drives gradeSubmission directly, no database or API. The end-to-end
 * version of the same case is in scripts/exam/coding-window-check.js.
 *
 * Run with: node scripts/exam/blank-coding-grade-check.js
 */

const mongoose = require("mongoose");
const { gradeSubmission } = require("../../services/submissionGrading");

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail !== "" ? `\n        -> ${JSON.stringify(detail)}` : ""}`); }
};

const id = () => new mongoose.Types.ObjectId();
const mcq = { _id: id(), kind: "mcq", text: "2+2?", options: [{ text: "3" }, { text: "4" }], answer: "4", points: 1 };
const coding = { _id: id(), kind: "coding", text: "Echo", points: 4, hiddenTestCases: [{}, {}] };
const neverJudged = { _id: id(), kind: "coding", text: "Other", points: 3, hiddenTestCases: [{}] };
const test = { questions: [mcq, coding, neverJudged], negativeMarkingPercent: 0.25 };

const GRADED_SOURCE = "print(input())";
const judged = (over = {}) => new Map([[String(coding._id), {
  questionId: coding._id, textAnswer: GRADED_SOURCE, language: "python",
  isCorrect: false, points: 2, autoGraded: true, passedCount: 1, totalHidden: 2, ...over,
}]]);

const row = (result, q) => result.processedResponses.find((r) => String(r.questionId) === String(q._id));
const mcqRight = { questionId: String(mcq._id), selectedOption: "4" };

console.log("\n── An earned grade survives every kind of blank ──\n");
const blanks = {
  "textAnswer is an empty string": { questionId: String(coding._id), textAnswer: "" },
  "textAnswer is whitespace only": { questionId: String(coding._id), textAnswer: "   \n\t" },
  "textAnswer is null": { questionId: String(coding._id), textAnswer: null },
  "the question is missing from the hand-in": null,
};
for (const [label, codingResponse] of Object.entries(blanks)) {
  const result = gradeSubmission({
    test,
    responses: [mcqRight, ...(codingResponse ? [codingResponse] : [])],
    priorAutoGraded: judged(),
  });
  const r = row(result, coding);
  check(`${label}: earned 2 marks kept`, r.points === 2 && r.autoGraded === true, r);
  check(`${label}: stored with the source that earned them, not the blank`, r.textAnswer === GRADED_SOURCE, r.textAnswer);
  check(`${label}: progress kept (1 of 2 cases)`, r.passedCount === 1 && r.totalHidden === 2, r);
  check(`${label}: paper total 1 + 2 = 3`, result.totalScore === 3 && result.maxScore === 8, result.totalScore);
  check(`${label}: counted as attempted, not as unanswered`, result.notAnsweredCount === 1 && result.incorrectCount === 1,
    { notAnswered: result.notAnsweredCount, incorrect: result.incorrectCount });
}

console.log("\n── Edges ──\n");
{
  const full = gradeSubmission({
    test, responses: [mcqRight, { questionId: String(coding._id), textAnswer: "" }],
    priorAutoGraded: judged({ points: 4, isCorrect: true, passedCount: 2 }),
  });
  check("A full marks grade survives a blank too (4, correct)", row(full, coding).points === 4 && row(full, coding).isCorrect === true, row(full, coding));
  check("  …and counts as correct", full.correctCount === 2, full.correctCount);

  const zero = gradeSubmission({
    test, responses: [mcqRight], priorAutoGraded: judged({ points: 0, passedCount: 0 }),
  });
  check("A judged attempt that passed nothing stays 0 -- the rule never adds marks",
    row(zero, coding).points === 0 && zero.totalScore === 1, row(zero, coding));

  const none = gradeSubmission({ test, responses: [mcqRight], priorAutoGraded: new Map() });
  check("Never judged and blank: still unanswered, 0 (unchanged)",
    row(none, coding).points === 0 && row(none, coding).textAnswer === null && row(none, coding).autoGraded === false, row(none, coding));

  check("A coding question that was never judged is not given another question's grade",
    row(gradeSubmission({ test, responses: [mcqRight], priorAutoGraded: judged() }), neverJudged).points === 0);

  const blankMcq = gradeSubmission({ test, responses: [], priorAutoGraded: judged() });
  check("A blank MCQ is still unanswered and never penalised (unchanged)",
    row(blankMcq, mcq).points === 0 && row(blankMcq, mcq).selectedOption === null, row(blankMcq, mcq));

}

console.log("\n── A non-blank hand-in: graded code kept, editor kept as a draft ──\n");
{
  const EDITOR = "# still tinkering\nprint(input().strip())";
  const answered = gradeSubmission({
    test, responses: [mcqRight, { questionId: String(coding._id), textAnswer: EDITOR, language: "javascript" }],
    priorAutoGraded: judged(),
  });
  const r = row(answered, coding);
  check("The earned grade is kept (2)", r.points === 2 && r.autoGraded === true, r);
  check("textAnswer is the code that earned it, not the editor's contents", r.textAnswer === GRADED_SOURCE, r.textAnswer);
  check("The editor's contents are kept as draftAnswer", r.draftAnswer === EDITOR, r.draftAnswer);
  check("The pass count is kept (1 of 2) -- hand-in used to drop it", r.passedCount === 1 && r.totalHidden === 2, r);
  check("language is the graded code's (python), not the editor's later switch", r.language === "python", r.language);

  const same = gradeSubmission({
    test, responses: [mcqRight, { questionId: String(coding._id), textAnswer: GRADED_SOURCE }],
    priorAutoGraded: judged(),
  });
  check("Editor unchanged since grading: no draft stored", row(same, coding).draftAnswer === null && row(same, coding).textAnswer === GRADED_SOURCE, row(same, coding));

  const blankDraft = gradeSubmission({
    test, responses: [mcqRight, { questionId: String(coding._id), textAnswer: "" }],
    priorAutoGraded: judged(),
  });
  check("Blank editor: no draft stored", row(blankDraft, coding).draftAnswer === null, row(blankDraft, coding));
}

console.log("\n── The expiry sweep regrades stored rows ──\n");
{
  // What the sweep passes in: the stored rows, where a graded answer's
  // textAnswer is already the graded source and later editing is in draftAnswer.
  const stored = { questionId: coding._id, textAnswer: GRADED_SOURCE, draftAnswer: "# edited after grading", language: "python", autoGraded: true, points: 2, passedCount: 1, totalHidden: 2 };
  const swept = gradeSubmission({ test, responses: [mcqRight, stored], priorAutoGraded: new Map([[String(coding._id), stored]]) });
  const r = row(swept, coding);
  check("Sweep keeps the grade, the graded source and the draft",
    r.points === 2 && r.textAnswer === GRADED_SOURCE && r.draftAnswer === "# edited after grading" && r.passedCount === 1, r);

  const noDraft = { ...stored, draftAnswer: null };
  const swept2 = gradeSubmission({ test, responses: [mcqRight, noDraft], priorAutoGraded: new Map([[String(coding._id), noDraft]]) });
  check("Sweep with no later editing: no draft", row(swept2, coding).draftAnswer === null && row(swept2, coding).textAnswer === GRADED_SOURCE, row(swept2, coding));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
