#!/usr/bin/env node
'use strict';

/**
 * Find — and optionally correct — coding scores awarded under the old, broken
 * output comparison.
 *
 *   node scripts/auditCodingVerdicts.js                 # stage 1: structural scan, no Judge0
 *   node scripts/auditCodingVerdicts.js --rerun         # stage 2: re-grade candidates, writes nothing
 *   node scripts/auditCodingVerdicts.js --rerun --apply # stage 3: raise under-counted scores
 *
 * ---------------------------------------------------------------------------
 * What went wrong
 * ---------------------------------------------------------------------------
 * services/judge0.js stripped trailing whitespace only from the END of the
 * whole output, while Judge0 strips it from EVERY line (isolate_job.rb):
 *
 *     text.split("\n").collect(&:rstrip).join("\n").rstrip
 *
 * A submission the judge accepted could therefore be recorded as failed, and
 * the score written was the under-count. Three narrower faults could produce a
 * wrong verdict the same way: an expectation of empty output was compared by
 * Judge0 as `"" == nil` and so could never be Accepted; a test case authored
 * with Windows line endings fed a stray \r into the program's stdin; and
 * results were paired to test cases by position rather than by token.
 *
 * ---------------------------------------------------------------------------
 * Why stage 1 is nearly free
 * ---------------------------------------------------------------------------
 * The old and new comparisons CANNOT disagree when the expected output is a
 * single line -- verified by brute force over every pair of short strings.
 * Divergence needs a second non-blank line, because whitespace-only trailing
 * lines were stripped by the old rule too. So a question whose hidden cases
 * all expect one line is provably unaffected, and stage 1 excludes it by
 * reading the test alone: no code is executed and no judge is contacted.
 *
 * Stage 2 only ever re-runs what stage 1 flagged.
 *
 * ---------------------------------------------------------------------------
 * Why stage 3 only raises
 * ---------------------------------------------------------------------------
 * The new rule is strictly more lenient, so for the same code against the same
 * test cases a re-run can only match or beat the old score. A LOWER score
 * therefore means something else moved -- the test was edited, the code is
 * non-deterministic, or a time limit flipped under different judge load -- and
 * is a thing to investigate, never a thing to write. Stage 3 refuses to lower
 * a score even when asked.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Test = require('../models/Test');
const TestSubmission = require('../models/TestSubmission');
const {
  runAgainstCases,
  infrastructureFailures,
  normalizeOutput,
} = require('../services/judge0');
const { maxMarksForQuestion, codingMarksEarned, maxScoreForTest } = require('../services/grading');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

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
  includeEditedTests: flag('include-edited-tests'),
  limit: Number(value('limit', Infinity)),
};

// ---------------------------------------------------------------------------
// Stage 1 — which questions could possibly have been mis-graded
// ---------------------------------------------------------------------------

/** Trailing whitespace on a line that is not the last one. */
const hasInteriorTrailingWhitespace = (text) => {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  return lines.slice(0, -1).some((line) => /[\s﻿\xA0]$/.test(line));
};

/**
 * Why one hidden test case could have produced a wrong verdict, or null if the
 * old and new rules provably agree on it.
 */
function riskOfCase(testCase) {
  const expected = normalizeOutput(testCase.output);

  // Judge0 compared this as `"" == nil`, so it could never be Accepted.
  if (expected === '') return 'empty-expectation';

  // The authored expectation itself carries whitespace the old rule kept.
  if (hasInteriorTrailingWhitespace(testCase.output)) return 'interior-trailing-ws';

  // A stray \r reached the program's stdin, so correct code could misparse.
  if (String(testCase.input ?? '').includes('\r')) return 'crlf-input';

  // Multi-line: divergence depends on what the student's program printed.
  if (expected.includes('\n')) return 'multi-line';

  // Single line, clean input: the two rules cannot disagree.
  return null;
}

function risksOfQuestion(question) {
  const risks = new Set();
  for (const testCase of question.hiddenTestCases || []) {
    const risk = riskOfCase(testCase);
    if (risk) risks.add(risk);
  }
  return [...risks];
}

async function stageOne() {
  const tests = await Test.find({ 'questions.kind': 'coding' })
    .select('title questions updatedAt')
    .lean();

  const atRisk = new Map();   // questionId -> { test, question, risks }
  let codingQuestions = 0;

  for (const test of tests) {
    for (const question of test.questions || []) {
      if (question.kind !== 'coding') continue;
      codingQuestions += 1;

      const risks = risksOfQuestion(question);
      if (risks.length) atRisk.set(String(question._id), { test, question, risks });
    }
  }

  // Only responses that fell SHORT of the question's worth can have been
  // under-counted; a full-marks answer cannot be raised by a laxer rule.
  const candidates = [];
  const submissions = await TestSubmission.find({ 'responses.autoGraded': true })
    .select('assignmentId userId testId responses submittedAt createdAt updatedAt mentorReviewed reviewStatus')
    .lean();

  for (const submission of submissions) {
    for (const response of submission.responses || []) {
      if (!response.autoGraded) continue;

      const entry = atRisk.get(String(response.questionId));
      if (!entry) continue;

      const worth = maxMarksForQuestion(entry.question);
      if ((response.points || 0) >= worth) continue;   // already full marks

      candidates.push({
        submission,
        response,
        test: entry.test,
        question: entry.question,
        risks: entry.risks,
        worth,
        testEditedAfter: entry.test.updatedAt > submission.createdAt,
      });
    }
  }

  return { codingQuestions, atRisk, candidates };
}

function reportStageOne({ codingQuestions, atRisk, candidates }) {
  const byRisk = {};
  for (const { risks } of atRisk.values()) {
    for (const risk of risks) byRisk[risk] = (byRisk[risk] || 0) + 1;
  }

  console.log(`Coding questions examined          : ${codingQuestions}`);
  console.log(`Questions that could be affected   : ${atRisk.size}`);
  for (const [risk, count] of Object.entries(byRisk)) {
    console.log(`    ${risk.padEnd(24)} ${count}`);
  }
  console.log(`Provably unaffected questions      : ${codingQuestions - atRisk.size}`);
  console.log(`Responses to re-check (max harm)   : ${candidates.length}`);

  const edited = candidates.filter((c) => c.testEditedAfter).length;
  if (edited) {
    console.log(`    of which the test was edited later: ${edited} (excluded from --apply)`);
  }

  if (!candidates.length) {
    console.log('\nNothing to re-grade. No stored coding score can have been affected.');
    return;
  }

  console.log('\ntest / question                                risks                      responses');
  console.log('-'.repeat(92));
  const perQuestion = new Map();
  for (const candidate of candidates) {
    const key = String(candidate.question._id);
    perQuestion.set(key, (perQuestion.get(key) || 0) + 1);
  }
  for (const [questionId, count] of perQuestion) {
    const { test, question, risks } = atRisk.get(questionId);
    const label = `${test.title} / ${String(question.text || '').slice(0, 30)}`.slice(0, 45).padEnd(45);
    console.log(`${label} ${risks.join(',').slice(0, 26).padEnd(26)} ${String(count).padStart(9)}`);
  }
  console.log('-'.repeat(92));
  console.log('\nThis is an UPPER BOUND: these responses could have been mis-graded, not');
  console.log('that they were. Run with --rerun to find out (writes nothing).');
}

// ---------------------------------------------------------------------------
// Stage 2 — re-grade the candidates under the fixed comparison
// ---------------------------------------------------------------------------

async function stageTwo(candidates) {
  const shortlist = candidates.slice(0, OPTIONS.limit);
  if (shortlist.length < candidates.length) {
    console.log(`\nRe-running the first ${shortlist.length} of ${candidates.length} (--limit).`);
  }

  const outcomes = [];

  for (const [position, candidate] of shortlist.entries()) {
    const { response, question } = candidate;
    const label = `[${position + 1}/${shortlist.length}]`;

    if (!response.textAnswer || !String(response.textAnswer).trim()) {
      outcomes.push({ ...candidate, verdict: 'skipped', reason: 'no stored source code' });
      continue;
    }

    const cases = (question.hiddenTestCases || []).map((testCase) => ({
      input: testCase.input,
      output: testCase.output,
      marks: 0,
    }));

    if (!cases.length) {
      outcomes.push({ ...candidate, verdict: 'skipped', reason: 'question has no hidden test cases' });
      continue;
    }

    let results;
    try {
      results = await runAgainstCases({
        sourceCode: response.textAnswer,
        language: response.language || question.language || 'python',
        cases,
      });
    } catch (error) {
      outcomes.push({ ...candidate, verdict: 'skipped', reason: `judge error: ${error.message}` });
      process.stdout.write(`${label} judge error\n`);
      continue;
    }

    // A case that never ran tells us nothing; scoring it would invent a result.
    if (infrastructureFailures(results).length) {
      outcomes.push({ ...candidate, verdict: 'skipped', reason: 'judge did not return every case' });
      process.stdout.write(`${label} incomplete\n`);
      continue;
    }

    const passedCount = results.filter((result) => result.passed).length;
    const newPoints = codingMarksEarned(question, passedCount);
    const oldPoints = response.points || 0;

    const verdict = newPoints > oldPoints ? 'raised'
      : newPoints < oldPoints ? 'LOWERED'
        : 'unchanged';

    outcomes.push({ ...candidate, verdict, oldPoints, newPoints, passedCount, total: cases.length });
    process.stdout.write(`${label} ${verdict.padEnd(9)} ${oldPoints} -> ${newPoints}\n`);
  }

  return outcomes;
}

function reportStageTwo(outcomes) {
  const group = (name) => outcomes.filter((outcome) => outcome.verdict === name);
  const raised = group('raised');
  const lowered = group('LOWERED');

  console.log(`\nre-graded : ${outcomes.length}`);
  console.log(`unchanged : ${group('unchanged').length}`);
  console.log(`raised    : ${raised.length}`);
  console.log(`LOWERED   : ${lowered.length}`);
  console.log(`skipped   : ${group('skipped').length}`);

  if (raised.length) {
    const marks = raised.reduce((sum, o) => sum + (o.newPoints - o.oldPoints), 0);
    console.log(`\nUnder-counted marks to restore: ${Math.round(marks * 100) / 100}`);
    console.log('\nuser                     test / question                        was -> now  cases');
    console.log('-'.repeat(92));
    for (const outcome of raised) {
      const label = `${outcome.test.title} / ${String(outcome.question.text || '').slice(0, 24)}`.slice(0, 38).padEnd(38);
      const flags = [
        outcome.testEditedAfter ? 'test-edited' : '',
        outcome.submission.mentorReviewed ? 'reviewed' : '',
      ].filter(Boolean).join(',');
      console.log(
        `${String(outcome.submission.userId).padEnd(24)} ${label} ` +
        `${String(outcome.oldPoints).padStart(4)} -> ${String(outcome.newPoints).padEnd(5)} ` +
        `${outcome.passedCount}/${outcome.total} ${flags}`
      );
    }
    console.log('-'.repeat(92));
  }

  if (lowered.length) {
    console.log('\n⚠️  Some re-runs scored LOWER than what is stored. The fixed comparison is');
    console.log('    strictly more lenient, so this cannot be caused by the fix. Investigate');
    console.log('    before applying anything — edited test cases, non-deterministic code or');
    console.log('    a flaky time limit are the usual explanations. These are never written.');
    for (const outcome of lowered) {
      console.log(`    user=${outcome.submission.userId} question=${outcome.question._id} ${outcome.oldPoints} -> ${outcome.newPoints}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 3 — write the raised scores back
// ---------------------------------------------------------------------------

async function stageThree(outcomes) {
  const eligible = outcomes.filter((outcome) => {
    if (outcome.verdict !== 'raised') return false;
    if (outcome.testEditedAfter && !OPTIONS.includeEditedTests) return false;
    if (outcome.submission.mentorReviewed && !OPTIONS.includeReviewed) return false;
    return true;
  });

  const held = outcomes.filter((o) => o.verdict === 'raised').length - eligible.length;

  console.log(`\nApplying ${eligible.length} raised score(s).`);
  if (held) {
    console.log(`Holding back ${held}: reviewed papers need --include-reviewed, and`);
    console.log('submissions whose test was edited afterwards need --include-edited-tests.');
  }

  let written = 0;
  for (const outcome of eligible) {
    // Re-read, so a score written since the re-run is never clobbered, and so
    // the response is matched by question id exactly as the live path does.
    const submission = await TestSubmission.findById(outcome.submission._id);
    if (!submission) continue;

    const target = submission.responses.find(
      (response) => String(response.questionId) === String(outcome.question._id)
    );
    if (!target) continue;

    // Never lower. If something raised it further in the meantime, leave it.
    if ((target.points || 0) >= outcome.newPoints) continue;

    const before = target.points || 0;
    target.points = outcome.newPoints;
    target.isCorrect = outcome.passedCount === outcome.total;

    submission.totalScore = submission.responses.reduce((sum, r) => sum + (r.points || 0), 0);
    // The paper's worth by the shared rule, so maxScore can never sit below a
    // score just awarded -- see services/grading.js.
    const test = await Test.findById(submission.testId).select('questions').lean();
    if (test) submission.maxScore = maxScoreForTest(test.questions);

    await submission.save();
    written += 1;

    console.log(
      `updated submission=${submission._id} user=${submission.userId} ` +
      `question=${outcome.question._id} points ${before} -> ${outcome.newPoints} ` +
      `total=${submission.totalScore}/${submission.maxScore}`
    );
  }

  console.log(`\nWrote ${written} response score(s).`);
}

// ---------------------------------------------------------------------------

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exitCode = 1;
    return;
  }

  if (OPTIONS.apply && !OPTIONS.rerun) {
    console.error('--apply needs --rerun: there is nothing to apply without re-grading first.');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, autoIndex: false });
  console.log(OPTIONS.apply ? 'Connected (WILL WRITE).\n' : 'Connected (read-only).\n');

  const stage1 = await stageOne();
  reportStageOne(stage1);

  if (OPTIONS.rerun && stage1.candidates.length) {
    const outcomes = await stageTwo(stage1.candidates);
    reportStageTwo(outcomes);

    if (OPTIONS.apply) await stageThree(outcomes);
    else if (outcomes.some((outcome) => outcome.verdict === 'raised')) {
      console.log('\nNothing was written. Re-run with --apply to restore the marks above.');
    }
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Audit failed:', error.message);
  process.exitCode = 1;
  mongoose.disconnect().catch(() => {});
});
