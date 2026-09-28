#!/usr/bin/env node
'use strict';

/**
 * Coding answers that hold real code but were never graded by anything.
 *
 *   node scripts/auditUngradedCoding.js                 # report only, no judge
 *   node scripts/auditUngradedCoding.js --rerun         # grade them, writes nothing
 *   node scripts/auditUngradedCoding.js --rerun --apply # record the scores
 *
 * ---------------------------------------------------------------------------
 * There are two separate problems here and only one of them is fixable by a
 * script. The report separates them deliberately.
 *
 * A. GRADEABLE — the question has hidden test cases, so the judge could have
 *    marked it, but no verdict was ever recorded. The student wrote code and
 *    finalised the paper without pressing the per-question Submit that sends
 *    it to the judge (or the attempt was auto-submitted when time ran out, and
 *    they never got the chance). The code is sitting in the submission scoring
 *    zero. This script can grade it.
 *
 *    Whether it SHOULD is a policy decision, which is why --apply is separate
 *    and off by default: it awards marks for work never submitted for
 *    grading. Reasonable people differ. The tool does not decide.
 *
 * B. UNGRADEABLE — the question has no hidden test cases at all, so no
 *    submission to it can ever be auto-graded; /api/coding/submit rejects the
 *    question outright. Unless a mentor marked the paper by hand, every
 *    student scored zero on it while the question's `points` still counted
 *    towards maxScore, quietly depressing the whole cohort's totals. No script
 *    can fix that -- the question needs test cases, or the papers need marking.
 *    It is reported so it stops being invisible.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Test = require('../models/Test');
const TestSubmission = require('../models/TestSubmission');
const { runAgainstCases, infrastructureFailures } = require('../services/judge0');
const { LANGUAGES } = require('../configs/languages');
const { maxMarksForQuestion, codingMarksEarned, maxScoreForTest } = require('../services/grading');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const OPTIONS = {
  rerun: flag('rerun'),
  apply: flag('apply'),
  includeReviewed: flag('include-reviewed'),
  includeCancelled: flag('include-cancelled'),
  limit: Number(value('limit', Infinity)),
};

/** Boilerplate the editor seeds -- untouched, it is not an attempt. */
const BOILERPLATE = new Set(
  Object.values(LANGUAGES).map((language) => String(language.boilerplate || '').replace(/\s+/g, ''))
);

const isRealAttempt = (code) => {
  const squashed = String(code || '').replace(/\s+/g, '');
  return squashed !== '' && !BOILERPLATE.has(squashed);
};

async function collect() {
  const tests = await Test.find({ 'questions.kind': 'coding' })
    .select('title questions')
    .lean();

  const coding = new Map();
  for (const test of tests) {
    for (const question of test.questions || []) {
      if (question.kind !== 'coding') continue;
      coding.set(String(question._id), {
        test,
        question,
        cases: (question.hiddenTestCases || []).length,
        worth: maxMarksForQuestion(question),
      });
    }
  }

  const submissions = await TestSubmission.find({})
    .select('assignmentId userId testId responses mentorReviewed reviewStatus isFinalized '
      + 'autoSubmit cancelledDueToViolation')
    .lean();

  const gradeable = [];
  const ungradeable = new Map();   // questionId -> { entry, zeroed, marked }

  for (const submission of submissions) {
    for (const response of submission.responses || []) {
      // Null entries exist in real data; a sparse array stores its holes as null.
      if (!response || !response.questionId) continue;

      const entry = coding.get(String(response.questionId));
      if (!entry) continue;
      if (response.autoGraded) continue;
      if (!isRealAttempt(response.textAnswer)) continue;

      if (entry.cases === 0) {
        if (!ungradeable.has(String(entry.question._id))) {
          ungradeable.set(String(entry.question._id), { entry, zeroed: 0, marked: 0 });
        }
        const row = ungradeable.get(String(entry.question._id));
        if ((response.points || 0) > 0) row.marked += 1;
        else row.zeroed += 1;
        continue;
      }

      gradeable.push({ submission, response, ...entry });
    }
  }

  return { codingQuestions: coding.size, gradeable, ungradeable };
}

function report({ codingQuestions, gradeable, ungradeable }) {
  console.log(`Coding questions in the database : ${codingQuestions}`);
  console.log(`\nA. GRADEABLE, never graded       : ${gradeable.length} response(s)`);

  const byQuestion = new Map();
  for (const row of gradeable) {
    const key = String(row.question._id);
    if (!byQuestion.has(key)) byQuestion.set(key, { row, count: 0 });
    byQuestion.get(key).count += 1;
  }
  if (byQuestion.size) {
    console.log('   test / question                             cases  worth  responses');
    console.log('   ' + '-'.repeat(76));
    for (const { row, count } of byQuestion.values()) {
      const label = `${row.test.title} / ${String(row.question.text || '').replace(/\s+/g, ' ').slice(0, 26)}`;
      console.log(`   ${label.slice(0, 43).padEnd(44)}${String(row.cases).padStart(5)}${String(row.worth).padStart(7)}${String(count).padStart(11)}`);
    }
    console.log('\n   These can be graded now: --rerun to see what they would score.');
  }

  const zeroed = [...ungradeable.values()].reduce((sum, row) => sum + row.zeroed, 0);
  const marked = [...ungradeable.values()].reduce((sum, row) => sum + row.marked, 0);
  console.log(`\nB. UNGRADEABLE (no test cases)   : ${ungradeable.size} question(s), `
    + `${zeroed} response(s) scoring zero, ${marked} marked by a mentor`);
  if (ungradeable.size) {
    console.log('   test / question                             worth  zeroed  mentor-marked');
    console.log('   ' + '-'.repeat(76));
    for (const { entry, zeroed: z, marked: m } of ungradeable.values()) {
      const label = `${entry.test.title} / ${String(entry.question.text || '').replace(/\s+/g, ' ').slice(0, 26)}`;
      console.log(`   ${label.slice(0, 43).padEnd(44)}${String(entry.worth).padStart(5)}${String(z).padStart(8)}${String(m).padStart(15)}`);
    }
    console.log('\n   No script can grade these — the question has nothing to grade against.');
    console.log('   Either add hidden test cases and re-run this, or have a mentor mark them.');
    console.log('   Until then each one still counts towards maxScore, so every student on');
    console.log('   that paper is marked out of points nobody can award.');
  }
}

async function regrade(gradeable) {
  const shortlist = gradeable.slice(0, OPTIONS.limit);
  if (shortlist.length < gradeable.length) {
    console.log(`\nGrading the first ${shortlist.length} of ${gradeable.length} (--limit).`);
  }

  const outcomes = [];
  for (const [position, candidate] of shortlist.entries()) {
    const { response, question } = candidate;
    const cases = (question.hiddenTestCases || []).map((testCase) => ({
      input: testCase.input, output: testCase.output, marks: 0,
    }));

    let results;
    try {
      results = await runAgainstCases({
        sourceCode: response.textAnswer,
        language: response.language || question.language || 'python',
        cases,
      });
    } catch (error) {
      outcomes.push({ ...candidate, verdict: 'skipped', reason: error.message });
      console.log(`[${position + 1}/${shortlist.length}] skipped — ${error.message}`);
      continue;
    }

    if (infrastructureFailures(results).length) {
      outcomes.push({ ...candidate, verdict: 'skipped', reason: 'judge did not return every case' });
      console.log(`[${position + 1}/${shortlist.length}] skipped — incomplete`);
      continue;
    }

    const passedCount = results.filter((result) => result.passed).length;
    const points = codingMarksEarned(question, passedCount);
    outcomes.push({
      ...candidate, verdict: points > 0 ? 'scores' : 'zero',
      points, passedCount, total: cases.length,
    });
    console.log(`[${position + 1}/${shortlist.length}] ${String(response.points || 0)} -> ${points}  (${passedCount}/${cases.length} cases)`);
  }

  const scoring = outcomes.filter((o) => o.verdict === 'scores');
  const recovered = scoring.reduce((sum, o) => sum + (o.points - (o.response.points || 0)), 0);
  const autoSubmitted = scoring.filter((o) => o.submission.autoSubmit).length;
  const cancelled = scoring.filter((o) => o.submission.cancelledDueToViolation).length;
  const reviewed = scoring.filter((o) => o.submission.mentorReviewed).length;
  console.log(`\ngraded    : ${outcomes.length}`);
  console.log(`would score: ${scoring.length}`);
  console.log(`still zero : ${outcomes.filter((o) => o.verdict === 'zero').length}`);
  console.log(`skipped    : ${outcomes.filter((o) => o.verdict === 'skipped').length}`);
  console.log(`\nMarks that would be awarded: ${Math.round(recovered * 100) / 100}`);
  console.log(`  of those, on papers auto-submitted when time ran out : ${autoSubmitted}`);
  console.log(`  on papers cancelled for proctoring violations        : ${cancelled}  (held back by default)`);
  console.log(`  on mentor-reviewed papers                            : ${reviewed}  (held back by default)`);
  console.log('\nThese are marks for code that was never submitted for grading.');
  console.log('Awarding them is a policy decision — --apply writes them, nothing else does.');

  return outcomes;
}

async function apply(outcomes) {
  const eligible = outcomes.filter((outcome) => {
    if (outcome.verdict !== 'scores') return false;
    // A paper cancelled for proctoring violations must not be quietly marked
    // UP by a maintenance script. Whether a cancelled attempt deserves marks
    // at all is a disciplinary decision, not a grading one.
    if (outcome.submission.cancelledDueToViolation && !OPTIONS.includeCancelled) return false;
    if (outcome.submission.mentorReviewed && !OPTIONS.includeReviewed) return false;
    return true;
  });

  const scoring = outcomes.filter((o) => o.verdict === 'scores');
  const heldCancelled = scoring.filter((o) => o.submission.cancelledDueToViolation && !OPTIONS.includeCancelled).length;
  const heldReviewed = scoring.length - eligible.length - heldCancelled;

  console.log(`\nApplying ${eligible.length} score(s).`);
  if (heldCancelled) console.log(`Holding back ${heldCancelled} on papers CANCELLED for violations — --include-cancelled to override.`);
  if (heldReviewed) console.log(`Holding back ${heldReviewed} on mentor-reviewed papers — --include-reviewed for those.`);

  let written = 0;
  for (const outcome of eligible) {
    const submission = await TestSubmission.findById(outcome.submission._id);
    if (!submission) continue;

    const target = submission.responses.find(
      (response) => response && String(response.questionId) === String(outcome.question._id)
    );
    if (!target) continue;
    // Never lower a score that already exists.
    if ((target.points || 0) >= outcome.points) continue;

    const before = target.points || 0;
    target.points = outcome.points;
    target.isCorrect = outcome.passedCount === outcome.total;
    target.autoGraded = true;

    submission.totalScore = submission.responses
      .reduce((sum, response) => sum + (response?.points || 0), 0);
    const test = await Test.findById(submission.testId).select('questions').lean();
    if (test) submission.maxScore = maxScoreForTest(test.questions);

    await submission.save();
    written += 1;
    console.log(`updated submission=${submission._id} user=${submission.userId} `
      + `question=${outcome.question._id} ${before} -> ${outcome.points} `
      + `total=${submission.totalScore}/${submission.maxScore}`);
  }

  console.log(`\nWrote ${written} score(s).`);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set.');
    process.exitCode = 1;
    return;
  }
  if (OPTIONS.apply && !OPTIONS.rerun) {
    console.error('--apply needs --rerun: there is nothing to apply without grading first.');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, autoIndex: false });
  console.log(OPTIONS.apply ? 'Connected (WILL WRITE).\n' : 'Connected (read-only).\n');

  const collected = await collect();
  report(collected);

  if (OPTIONS.rerun && collected.gradeable.length) {
    const outcomes = await regrade(collected.gradeable);
    if (OPTIONS.apply) await apply(outcomes);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Audit failed:', error.message);
  process.exitCode = 1;
  mongoose.disconnect().catch(() => {});
});
