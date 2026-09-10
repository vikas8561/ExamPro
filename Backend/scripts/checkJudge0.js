#!/usr/bin/env node
'use strict';

/**
 * Judge0 diagnostic.
 *
 *   npm run check-judge0            # connectivity + language resolution + smoke test
 *   npm run check-judge0 -- --quick # skip the per-language smoke test
 *
 * Run this from a host that can reach the judge (the API server itself is the
 * best place). Exits non-zero if anything is broken, so it can be used in CI
 * or as a deploy gate.
 */

require('dotenv').config();

const { checkHealth, runAgainstCases, JUDGE0_URL } = require('../services/judge0');
const { LANGUAGES, LANGUAGE_KEYS } = require('../configs/languages');

const quick = process.argv.includes('--quick');

const line = (char = '-') => console.log(char.repeat(66));
const ok = (message) => console.log(`  ✅ ${message}`);
const bad = (message) => console.log(`  ❌ ${message}`);
const info = (message) => console.log(`  •  ${message}`);

async function main() {
  line('=');
  console.log('Judge0 diagnostic');
  line('=');

  console.log('\nConfiguration');
  info(`JUDGE0_URL         ${JUDGE0_URL}`);
  info(`JUDGE0_AUTH_TOKEN  ${process.env.JUDGE0_AUTH_TOKEN ? 'set (hidden)' : 'NOT SET'}`);
  info(`JUDGE0_AUTH_HEADER ${process.env.JUDGE0_AUTH_HEADER || 'X-Auth-Token (default)'}`);
  info(`cpu/wall/memory    ${process.env.JUDGE0_CPU_TIME_LIMIT || 5}s / ${process.env.JUDGE0_WALL_TIME_LIMIT || 10}s / ${process.env.JUDGE0_MEMORY_LIMIT || 256000} KB`);

  console.log('\nConnectivity');
  const health = await checkHealth({ refresh: true });

  if (!health.ok) {
    bad(`Cannot reach Judge0: ${health.error}`);
    console.log('\n  Things to check, in order:');
    console.log('   1. Is the instance running?        curl -sS ' + JUDGE0_URL + '/about');
    console.log('   2. Does the AWS security group allow inbound from this server\'s IP');
    console.log('      on the port in JUDGE0_URL (443 for https, 2358 by default)?');
    console.log('   3. If the judge requires a token, is JUDGE0_AUTH_TOKEN correct, and');
    console.log('      does JUDGE0_AUTH_HEADER match the instance\'s AUTHN_HEADER setting?');
    console.log('   4. Is JUDGE0_URL free of a trailing path (no /api, no trailing slash)?');
    process.exitCode = 1;
    return;
  }

  ok(`Reachable — Judge0 v${health.version || 'unknown'} in ${health.latencyMs}ms`);
  ok(`Auth token ${health.authenticated ? 'sent' : 'not sent'}`);
  info(`Batch size ${health.batchSize}`);

  console.log('\nLanguage resolution');
  for (const key of LANGUAGE_KEYS) {
    const id = health.languages[key];
    if (id) ok(`${key.padEnd(11)} -> Judge0 language_id ${id}`);
    else bad(`${key.padEnd(11)} -> NOT AVAILABLE on this instance`);
  }
  if (health.missingLanguages?.length) process.exitCode = 1;

  if (quick) {
    console.log('\nSkipping smoke test (--quick).');
    return;
  }

  console.log('\nSmoke test — each language must compile, read stdin and print 5');
  let failures = 0;
  for (const key of LANGUAGE_KEYS) {
    if (!health.languages[key]) continue;
    try {
      const [result] = await runAgainstCases({
        sourceCode: LANGUAGES[key].boilerplate,
        language: key,
        cases: [{ input: '2 3\n', output: '5', marks: 1 }],
      });
      if (result.passed) {
        ok(`${key.padEnd(11)} ${result.status.description} (${result.time}s, ${result.memory} KB)`);
      } else {
        failures += 1;
        bad(`${key.padEnd(11)} ${result.status.description}`);
        if (result.compileOutput) console.log(`       compiler: ${result.compileOutput.trim().slice(0, 300)}`);
        if (result.stderr) console.log(`       stderr:   ${result.stderr.trim().slice(0, 300)}`);
        if (result.message) console.log(`       message:  ${result.message.trim().slice(0, 300)}`);
      }
    } catch (error) {
      failures += 1;
      bad(`${key.padEnd(11)} ${error.message}`);
    }
  }

  line();
  if (failures === 0 && !health.missingLanguages?.length) {
    console.log('All checks passed — the coding platform is ready.');
  } else {
    console.log(`${failures} language(s) failed the smoke test.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('\nDiagnostic crashed:', error);
  process.exit(1);
});
