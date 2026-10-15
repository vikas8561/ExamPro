/**
 * Regression: "a function, class or structure written outside main() does not
 * work".
 *
 * Nothing on ExamPro's side drops or rewrites code -- the source reaches Judge0
 * byte for byte. What students hit are real compile errors from habits formed
 * on older, more forgiving compilers:
 *
 *   C     a function, struct, typedef or global below main(): GCC 14 (Judge0
 *         id 103, which the judge prefers) rejects the implicit declaration of a
 *         function, which GCC 9 only warned about, and no C compiler accepts a
 *         struct used before its definition.
 *   C++   the same, rejected by every compiler.
 *   Java  helper without `static`, nested class without `static`, a method
 *         written outside the class, or a second `public class`.
 *
 * services/sourceFixups.js builds repaired versions of these, and
 * services/judge0.js tries them only when every case failed to compile, keeping
 * one only if it compiled. This checks both halves:
 *
 *   1. The repairs themselves: what changes, that line numbers survive, and
 *      that code which needs no repair is left alone.
 *   2. The retry, against a stand-in Judge0: a compiling program runs once and
 *      is never touched; a repairable one passes with a note; one with a real
 *      mistake as well shows that mistake, not the placement error hiding it.
 *
 * The repairs were also compiled and run for real against GCC 14.1 and JDK 17
 * (and GCC 9.2) while this was built; this script needs no compiler.
 *
 *   node scripts/exam/source-repair-check.js
 */

process.env.JUDGE0_URL = 'http://judge0.stand-in';
process.env.JUDGE0_POLL_INTERVAL_MS = '5';

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail !== '' ? `\n        -> ${JSON.stringify(detail).slice(0, 600)}` : ''}`); }
};
const section = (title) => console.log(`\n── ${title}`);

// ── A stand-in Judge0 ──────────────────────────────────────────────────────
let batchesCreated = 0;
const store = new Map();
const b64 = (s) => Buffer.from(String(s ?? ''), 'utf8').toString('base64');
const unb64 = (s) => Buffer.from(String(s ?? ''), 'base64').toString('utf8');
const compileError = (text) => ({ status: { id: 6, description: 'Compilation Error' }, compile_output: b64(text), stdout: null });

/**
 * C/C++ "compiles" when add() -- and struct Point, if the program uses it -- is
 * defined above main(). Java "compiles" when add() is static inside Main. A
 * program using `not_defined` never compiles: a genuine mistake.
 */
function judge(languageId, source) {
  const mistake = () => compileError("m.cpp:7:25: error: 'not_defined' was not declared in this scope");

  if (languageId === 91) {
    const ok = /class\s+Main[\s\S]*static\s+int\s+add\s*\(/.test(source) && !/public\s+class\s+(?!Main\b)/.test(source);
    return ok ? { status: { id: 3, description: 'Accepted' }, stdout: b64('5\n') } : compileError('Main.java:4: error: non-static method add(int,int) cannot be referenced from a static context');
  }

  // Like a real compiler, a use before its definition is reported first.
  const before = source.slice(0, source.search(/\bint\s+main\s*\(/));
  if (/\bPoint\b/.test(source) && !/struct\s+Point\s*\{/.test(before)) return compileError("m.cpp:5:5: error: 'Point' was not declared in this scope");
  if (!/\badd\s*\([^)]*\)\s*[;{]/.test(before)) return compileError("m.cpp:5:13: error: 'add' was not declared in this scope");
  const helper = source.search(/\bint\s+helper\s*\(/);
  if (helper >= 0 && !/\btwice\s*\([^)]*\)\s*[;{]/.test(source.slice(0, helper))) return compileError("m.cpp:3:28: error: 'twice' was not declared in this scope");
  if (/\bnot_defined\b/.test(source)) return mistake();
  return { status: { id: 3, description: 'Accepted' }, stdout: b64('5\n') };
}

globalThis.fetch = async (url, options = {}) => {
  const { pathname, searchParams } = new URL(url);
  const reply = (body) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
  if (pathname === '/languages') {
    return reply([{ id: 103, name: 'C (GCC 14.1.0)' }, { id: 105, name: 'C++ (GCC 14.1.0)' }, { id: 91, name: 'Java (JDK 17.0.6)' }, { id: 71, name: 'Python (3.8.1)' }]);
  }
  if (pathname === '/config_info') return reply({ max_submission_batch_size: 20, enable_compiler_options: true });
  if (pathname === '/about') return reply({ version: 'stand-in' });
  if (pathname === '/submissions/batch' && options.method === 'POST') {
    batchesCreated += 1;
    const { submissions } = JSON.parse(options.body);
    return reply(submissions.map((s) => {
      const token = `t${store.size + 1}`;
      store.set(token, { token, ...judge(s.language_id, unb64(s.source_code)) });
      return { token };
    }));
  }
  if (pathname === '/submissions/batch') {
    const tokens = (searchParams.get('tokens') || '').split(',');
    return reply({ submissions: tokens.map((t) => store.get(t)) });
  }
  return { ok: false, status: 404, headers: { get: () => 'application/json' }, json: async () => ({}), text: async () => '' };
};

const { repairCandidates, repairForCompile } = require('../../services/sourceFixups');
const { runAgainstCases } = require('../../services/judge0');

const CPP_BELOW = `#include <bits/stdc++.h>
using namespace std;
// a { brace } in a comment, and "{" in a string below
int main() {
    int a, b; cin >> a >> b;
    cout << add(a, b) << "{" << "\\n";
}
int add(int a, int b) { return a + b; }
`;

const CPP_TYPES_BELOW = `#include <bits/stdc++.h>
using namespace std;
int main() {
    int a, b; cin >> a >> b;
    Point p{a, b};
    Calc c;
    total = c.add(p.x, p.y);
    cout << total << "\\n";
}
struct Point { int x, y; };
class Calc { public: int add(int a, int b) { return a + b; } };
int total = 0;
typedef long long ll;
`;

const C_BELOW = `#include <stdio.h>
int main(void) {
    int a, b; scanf("%d %d", &a, &b);
    show(add(a, b));
    return 0;
}
int add(int a, int b) { return a + b; }
void show(int x) { printf("%d\\n", x); }
`;

const CPP_ABOVE_CALLS_BELOW = `#include <bits/stdc++.h>
using namespace std;
int helper(int x) { return twice(x) + 1; }
int main() { cout << helper(add(2, 3)) << "\\n"; }
int add(int a, int b) { return a + b; }
int twice(int x) { return 2 * x; }
`;

const JAVA_INSTANCE = `import java.util.*;
public class Main {
    int add(int a, int b) { return a + b; }
    class Pair { int a, b; }
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println(add(sc.nextInt(), sc.nextInt()));
    }
}
`;

const JAVA_OUTSIDE = `import java.util.*;
int add(int a, int b) { return a + b; }
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println(add(sc.nextInt(), sc.nextInt()));
    }
}
`;

const JAVA_PUBLIC_NODE = `import java.util.*;
public class Node { int val; Node(int v) { val = v; } }
public class Main {
    static int add(int a, int b) { return a + b; }
    public static void main(String[] args) { System.out.println(add(new Node(2).val, 3)); }
}
`;

/** Does every line outside main() keep its number, with main() under a #line? */
function mainMovedFaithfully(original, repaired) {
  const before = original.split('\n');
  const after = repaired.split('\n');
  const mainLine = before.findIndex((line) => /\bint\s+main\s*\(/.test(line));
  const closing = before.findIndex((line, i) => i > mainLine && /^}/.test(line));
  // The empty string after a file's final newline is not a line.
  const count = before[before.length - 1] === '' ? before.length - 1 : before.length;
  for (let i = 0; i < count; i += 1) {
    if (i >= mainLine && i <= closing) continue;
    if (before[i] !== after[i]) return false;
  }
  const marker = after.findIndex((line) => line === `#line ${mainLine + 1}`);
  return marker > closing && after[marker + 1] === before[mainLine];
}

(async () => {
  try {
    section('1. C and C++: main() compiled after what is written below it');

    let r = repairForCompile('cpp', CPP_BELOW);
    check('C++ function below main(): main() moved to the end', r && mainMovedFaithfully(CPP_BELOW, r.source), r?.source);
    check('…and the braces in the comment and the string did not confuse it', r && r.names.join() === 'add()', r?.names);

    r = repairForCompile('cpp', CPP_TYPES_BELOW);
    check('C++ struct, class, global and typedef below main(): main() moved to the end', r && mainMovedFaithfully(CPP_TYPES_BELOW, r.source), r?.source);
    check('…and the note names what main() was missing', r && /struct Point/.test(r.note) && /class Calc/.test(r.note) && /ll/.test(r.note), r?.note);

    r = repairForCompile('c', C_BELOW);
    check('C functions below main(): main() moved to the end', r && mainMovedFaithfully(C_BELOW, r.source), r?.source);

    let all = repairCandidates('cpp', CPP_ABOVE_CALLS_BELOW);
    check('A function above main() calling one below: the second repair also declares it',
      all.length === 2 && /int add\(int a, int b\); int twice\(int x\); int helper/.test(all[1].source), all.map((c) => c.source));

    check('Nothing below main(): nothing to repair', repairForCompile('cpp', 'int add(int a, int b) { return a + b; }\nint main() { return add(1, 2); }\n') === null);

    all = repairCandidates('cpp', 'int main() { return add(2); }\nint add(int a, int b = 3) { return a + b; }\n');
    check('Default arguments below main(): moved, but never re-declared (that would break the definition)',
      all.length === 1 && !/int add\(int a, int b = 3\);/.test(all[0].source), all.map((c) => c.source));

    all = repairCandidates('cpp', 'struct Foo { int bar(); };\nint main() { Foo f; return f.bar(); }\nint Foo::bar() { return 1; }\n');
    check('An out-of-class member definition is never declared at file scope', all.every((c) => !/Foo::bar\(\);/.test(c.source)), all.map((c) => c.source));

    section('2. Java');

    r = repairForCompile('java', JAVA_INSTANCE);
    check('The instance method and inner class are made static', r && /static int add/.test(r.source) && /static class Pair/.test(r.source), r?.source);
    check('…with no line moved', r && r.source.split('\n').length === JAVA_INSTANCE.split('\n').length);

    r = repairForCompile('java', JAVA_OUTSIDE);
    check('A method outside the class is moved into Main', r && /class Main[\s\S]*static int add\(int a, int b\)[\s\S]*\}\s*$/.test(r.source) && !/^int add/m.test(r.source), r?.source);

    r = repairForCompile('java', JAVA_PUBLIC_NODE);
    check('A second public class loses `public`, in place', r && /^\s+class Node/m.test(r.source.split('\n')[1]) && r.source.split('\n').length === JAVA_PUBLIC_NODE.split('\n').length, r?.source);

    check('Java that is already right: nothing to repair',
      repairForCompile('java', 'public class Main {\n    static int add(int a, int b) { return a + b; }\n    public static void main(String[] a) { System.out.println(add(2, 3)); }\n}\n') === null);
    check('Languages where placement never matters are not touched', repairForCompile('python', 'print(1)\n') === null);

    section('3. The retry, against a stand-in judge');
    const cases = [{ input: '2 3', output: '5', marks: 1 }, { input: '2 3', output: '5', marks: 1 }];

    batchesCreated = 0;
    let results = await runAgainstCases({ sourceCode: CPP_BELOW.replace('int main() {', 'int add(int a, int b);\nint main() {'), language: 'cpp', cases });
    check('A program that compiles runs once and is never retried', batchesCreated === 1 && results.every((x) => x.passed && !x.repairedForCompile), { batchesCreated, results });

    batchesCreated = 0;
    results = await runAgainstCases({ sourceCode: CPP_TYPES_BELOW.replace('total = c.add(p.x, p.y);', 'total = add(p.x, p.y);') + 'int add(int a, int b) { return a + b; }\n', language: 'cpp', cases });
    check('Struct and function below main(): compiles on the retry and every case passes', results.every((x) => x.passed && x.repairedForCompile), results);
    check('…at the cost of one probe case and one full run', batchesCreated === 3, batchesCreated);
    check('…and the student is told what was done and why', /written below it/.test(results[0].message || '') && /written below it/.test(results[0].repairNote || ''), results[0]);

    results = await runAgainstCases({ sourceCode: CPP_ABOVE_CALLS_BELOW, language: 'cpp', cases });
    check('A function above main() calling one below: passes on the second repair', results.every((x) => x.passed) && /declaration was added|declarations were added/.test(results[0].message || ''), results);

    results = await runAgainstCases({ sourceCode: JAVA_INSTANCE, language: 'java', cases });
    check('Java instance helper: passes on the retry, with a note', results.every((x) => x.passed) && /made static/.test(results[0].message || ''), results);

    results = await runAgainstCases({ sourceCode: JAVA_PUBLIC_NODE, language: 'java', cases });
    check('Java second public class: passes on the retry, with a note', results.every((x) => x.passed) && /one public class per file/.test(results[0].message || ''), results);

    const withMistake = CPP_TYPES_BELOW.replace('cout << total', 'cout << total + not_defined');
    results = await runAgainstCases({ sourceCode: withMistake, language: 'cpp', cases });
    check('A struct below main() AND a real mistake: the real mistake is what the student sees',
      results.every((x) => x.status.id === 6 && /not_defined/.test(x.compileOutput) && !/'Point' was not declared/.test(x.compileOutput)), results[0]);
    check('…prefaced by what was already taken care of', /compiled after that code/.test(results[0].compileOutput), results[0].compileOutput);

    batchesCreated = 0;
    results = await runAgainstCases({ sourceCode: '#include <cstdio>\nint main() { return not_defined; }\n', language: 'cpp', cases });
    check('A plain mistake with nothing below main(): one run, the original error, untouched',
      batchesCreated === 1 && results.every((x) => x.status.id === 6 && !/compiled after/.test(x.compileOutput)), { batchesCreated, results });
  } catch (error) {
    fail++;
    console.error('\nCRASH', error);
  } finally {
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
