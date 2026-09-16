#!/usr/bin/env node
'use strict';

/**
 * Read-only audit of coding question marks.
 *
 *   node scripts/auditCodingMarks.js
 *
 * Coding questions used to be worth the SUM of their hidden test case `marks`.
 * They are now worth their question-level `points`, split evenly across those
 * cases (services/grading.js). For a question where the two disagree, the
 * paper's total changes — most dangerously when `points` was never set and
 * silently defaulted to 1.
 *
 * This script only reads. It writes nothing and changes nothing; it prints the
 * questions whose worth changes so they can be corrected before an exam.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Test = require('../models/Test');
const { maxMarksForQuestion } = require('../services/grading');

const oldWorth = (question) => {
  const sum = (question.hiddenTestCases || [])
    .reduce((total, testCase) => total + (testCase.marks || 0), 0);
  return sum > 0 ? sum : Number(question.points ?? 1);
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, autoIndex: false });
  console.log('Connected (read-only).\n');

  const tests = await Test.find({ 'questions.kind': 'coding' })
    .select('title questions')
    .lean();

  const changed = [];
  let codingTotal = 0;

  for (const test of tests) {
    for (const question of test.questions || []) {
      if (question.kind !== 'coding') continue;
      codingTotal += 1;

      const before = oldWorth(question);
      const after = maxMarksForQuestion(question);
      if (before !== after) {
        changed.push({
          test: test.title,
          question: String(question.text || '').slice(0, 40),
          cases: (question.hiddenTestCases || []).length,
          pointsSet: question.points !== undefined && question.points !== null,
          before,
          after,
        });
      }
    }
  }

  console.log(`Coding questions examined: ${codingTotal}`);
  console.log(`Worth changes under the new rule: ${changed.length}\n`);

  if (changed.length) {
    console.log('test / question                              cases  points?   was -> now');
    console.log('-'.repeat(84));
    for (const row of changed) {
      const label = `${row.test} / ${row.question}`.slice(0, 44).padEnd(44);
      const flag = row.pointsSet ? 'set    ' : 'DEFAULT';
      console.log(`${label} ${String(row.cases).padStart(5)}  ${flag}  ${String(row.before).padStart(4)} -> ${row.after}`);
    }
    console.log('-'.repeat(84));
    console.log('\nRows marked DEFAULT never had `points` set, so they now fall back to 1.');
    console.log('Set `points` on those questions to the marks the question should carry.');
  } else {
    console.log('No question changes worth. Safe to deploy.');
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Audit failed:', error.message);
  process.exit(1);
});
