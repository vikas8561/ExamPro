'use strict';

/**
 * Single source of truth for the programming languages the coding platform
 * supports. The backend resolves `judge0Ids` against GET /languages at runtime
 * (IDs differ between Judge0 images), and the frontend picker is built from
 * GET /api/coding/languages so the UI can never drift from the judge.
 *
 * `judge0Ids` are ordered newest runtime first — the first id the instance
 * actually offers wins.
 *
 * Boilerplates read the whole of stdin and print to stdout, which is the
 * contract Judge0 test cases use.
 */

const LANGUAGES = {
  c: {
    label: 'C',
    monacoLanguage: 'c',
    extension: 'c',
    // GCC builds first (bits/stdc++-style toolchain students expect), Clang after.
    judge0Ids: [103, 50, 49, 48, 104, 110, 75],
    compilerOptions: '-std=c11 -O2',
    boilerplate: `#include <stdio.h>

int main(void) {
    // Read input with scanf, print your answer with printf.
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("%d\\n", a + b);
    }
    return 0;
}
`,
  },

  cpp: {
    label: 'C++',
    monacoLanguage: 'cpp',
    extension: 'cpp',
    judge0Ids: [105, 54, 53, 52, 76],
    compilerOptions: '-std=c++17 -O2',
    boilerplate: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // Read input with cin, print your answer with cout.
    int a, b;
    if (cin >> a >> b) {
        cout << a + b << "\\n";
    }
    return 0;
}
`,
  },

  java: {
    label: 'Java',
    monacoLanguage: 'java',
    extension: 'java',
    judge0Ids: [91, 62],
    compilerOptions: null,
    // Judge0 always writes the source to Main.java, so the public class MUST be
    // called Main or compilation fails with "class X is public, should be
    // declared in a file named X.java".
    boilerplate: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        Scanner sc = new Scanner(System.in);

        // Read input with the scanner, print your answer with System.out.
        if (sc.hasNextInt()) {
            int a = sc.nextInt();
            int b = sc.nextInt();
            System.out.println(a + b);
        }
    }
}
`,
  },

  javascript: {
    label: 'JavaScript',
    monacoLanguage: 'javascript',
    extension: 'js',
    judge0Ids: [102, 97, 93, 63],
    compilerOptions: null,
    boilerplate: `const data = require('fs').readFileSync(0, 'utf8');

// \`data\` holds all of stdin. Print your answer with console.log.
const [a, b] = data.trim().split(/\\s+/).map(Number);
console.log(a + b);
`,
  },

  typescript: {
    label: 'TypeScript',
    monacoLanguage: 'typescript',
    extension: 'ts',
    judge0Ids: [101, 94, 74],
    // Judge0 runs a bare `tsc script.ts` with no @types/node and no tsconfig.
    // Passing --lib/--target here overrides the default lib and breaks even
    // `console`, so we declare the Node globals in the boilerplate instead.
    compilerOptions: null,
    boilerplate: `declare const require: any;

const data: string = require('fs').readFileSync(0, 'utf8');

// \`data\` holds all of stdin. Print your answer with console.log.
const [a, b]: number[] = data.trim().split(/\\s+/).map(Number);
console.log(a + b);
`,
  },

  python: {
    label: 'Python',
    monacoLanguage: 'python',
    extension: 'py',
    judge0Ids: [113, 109, 100, 92, 71],
    compilerOptions: null,
    boilerplate: `import sys

data = sys.stdin.read().split()

# \`data\` holds the whitespace-separated tokens from stdin. Print with print().
if data:
    a, b = int(data[0]), int(data[1])
    print(a + b)
`,
  },
};

// Display / selection order, matching how the picker is presented.
const LANGUAGE_KEYS = ['c', 'cpp', 'java', 'javascript', 'typescript', 'python'];

/**
 * IDs present in every Judge0 1.13.x build. Used only when GET /languages is
 * unreachable, so grading degrades rather than stopping.
 */
const FALLBACK_LANGUAGE_IDS = {
  c: 50,          // C (GCC 9.2.0)
  cpp: 54,        // C++ (GCC 9.2.0)
  java: 62,       // Java (OpenJDK 13.0.1)
  javascript: 63, // JavaScript (Node.js 12.14.0)
  typescript: 74, // TypeScript (3.7.4)
  python: 71,     // Python (3.8.1)
};

// Tolerate the various spellings that already exist in the database and UI.
const LANGUAGE_ALIASES = {
  c: 'c',
  'c11': 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  cplusplus: 'cpp',
  'c++17': 'cpp',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  node: 'javascript',
  nodejs: 'javascript',
  typescript: 'typescript',
  ts: 'typescript',
  python: 'python',
  python3: 'python',
  py: 'python',
};

/** Normalize any user/db supplied language string to a canonical key, or null. */
function normalizeLanguageKey(language) {
  const raw = String(language || '').trim().toLowerCase();
  return LANGUAGE_ALIASES[raw] || null;
}

module.exports = {
  LANGUAGES,
  LANGUAGE_KEYS,
  FALLBACK_LANGUAGE_IDS,
  LANGUAGE_ALIASES,
  normalizeLanguageKey,
};
