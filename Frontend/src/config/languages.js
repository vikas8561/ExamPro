// Language registry for the coding editor.
//
// The authoritative list comes from the backend (GET /coding/languages), which
// resolves it against what the Judge0 instance can actually execute. The static
// table below is only a fallback for when that call fails, and must stay in
// sync with Backend/configs/languages.js.

export const FALLBACK_LANGUAGES = [
  {
    key: 'c',
    label: 'C',
    monacoLanguage: 'c',
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
  {
    key: 'cpp',
    label: 'C++',
    monacoLanguage: 'cpp',
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
  {
    key: 'java',
    label: 'Java',
    monacoLanguage: 'java',
    // Judge0 compiles the file as Main.java — the public class must be Main.
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
  {
    key: 'javascript',
    label: 'JavaScript',
    monacoLanguage: 'javascript',
    boilerplate: `const data = require('fs').readFileSync(0, 'utf8');

// \`data\` holds all of stdin. Print your answer with console.log.
const [a, b] = data.trim().split(/\\s+/).map(Number);
console.log(a + b);
`,
  },
  {
    key: 'typescript',
    label: 'TypeScript',
    monacoLanguage: 'typescript',
    // Judge0 runs a bare `tsc` with no @types/node, so Node globals are declared.
    boilerplate: `declare const require: any;

const data: string = require('fs').readFileSync(0, 'utf8');

// \`data\` holds all of stdin. Print your answer with console.log.
const [a, b]: number[] = data.trim().split(/\\s+/).map(Number);
console.log(a + b);
`,
  },
  {
    key: 'python',
    label: 'Python',
    monacoLanguage: 'python',
    boilerplate: `import sys

data = sys.stdin.read().split()

# \`data\` holds the whitespace-separated tokens from stdin. Print with print().
if data:
    a, b = int(data[0]), int(data[1])
    print(a + b)
`,
  },
];

// Aliases tolerated from older records / props.
const ALIASES = {
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
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

export const normalizeLanguageKey = (language) =>
  ALIASES[String(language || '').trim().toLowerCase()] || null;

let cache = null;
let inFlight = null;

/**
 * Languages this deployment can actually run. Cached for the page's lifetime;
 * falls back to the static table if the backend or judge is unreachable.
 */
export async function fetchSupportedLanguages() {
  if (cache) return cache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // Imported lazily so this module stays dependency-free: the pure parts
      // (FALLBACK_LANGUAGES, normalizeLanguageKey) are used by code that must
      // not drag in the API layer.
      const { default: apiRequest } = await import('../services/api');
      const response = await apiRequest('/coding/languages');
      const languages = response?.languages;
      if (Array.isArray(languages) && languages.length > 0) {
        cache = languages;
        return cache;
      }
      cache = FALLBACK_LANGUAGES;
      return cache;
    } catch {
      // Offline or judge down — the editor still works, Run/Submit will report it.
      cache = FALLBACK_LANGUAGES;
      return cache;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export const findLanguage = (languages, key) => {
  const normalized = normalizeLanguageKey(key);
  return (
    languages.find((language) => language.key === normalized) ||
    languages.find((language) => language.key === 'python') ||
    languages[0]
  );
};

export const getMonacoLanguage = (languages, key) => findLanguage(languages, key)?.monacoLanguage || 'plaintext';
export const getBoilerplate = (languages, key) => findLanguage(languages, key)?.boilerplate || '';
