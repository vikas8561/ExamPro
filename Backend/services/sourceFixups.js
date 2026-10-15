'use strict';

/**
 * Repairs for programs that fail to compile only because of where a function
 * was written relative to main().
 *
 * Students write helper functions the way they were taught on older, more
 * forgiving compilers, and the judge rejects them:
 *
 *   C     A function defined below main() with no prototype. GCC 9 accepted
 *         this with a warning; GCC 14, which the judge prefers, makes implicit
 *         declarations a hard error: "implicit declaration of function 'add'".
 *   C++   The same, which no C++ compiler has ever accepted: "'add' was not
 *         declared in this scope".
 *   Java  A helper written without `static` (or a nested class without it),
 *         called from the static main: "non-static method add(int,int) cannot be
 *         referenced from a static context". Or a method written outside the
 *         class altogether: "class, interface, enum, or record expected".
 *
 * The same goes for everything else written below main(): a struct, class,
 * union, enum or typedef, or a global variable, that main() uses. C and C++
 * need a type's full definition before code that uses it, so no declaration
 * can help there -- main() itself has to be compiled after it.
 *
 * To the student, "a function, class or structure outside main does not work".
 *
 * These repairs are only ever used as a second attempt, after the original
 * source has already failed to compile -- see runAgainstCases in judge0.js. A
 * program that compiles is never altered, and if the repaired program fails to
 * compile as well, the student is shown the errors from their own code. So a
 * repair can only turn a compile error into a working program; it can never
 * make a working program behave differently.
 *
 * Line numbers in any later compiler error or stack trace still match what
 * the student sees in the editor: insertions are made on an existing line, and
 * when main() is moved to the end of a C or C++ file a `#line` directive tells
 * the compiler where it really was.
 */

/**
 * The source with comments, string and character literals and (for C/C++)
 * preprocessor lines blanked to spaces. Same length, same newlines, so an
 * offset in one is the same place in the other. Structure -- braces,
 * parentheses, semicolons -- can then be read without being fooled by a "{"
 * inside a string or a comment.
 */
function mask(source, lang) {
  const out = source.split('');
  const n = source.length;
  const cFamily = lang === 'c' || lang === 'cpp';
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };
  const isWord = (ch) => /[0-9A-Za-z_]/.test(ch || '');

  let i = 0;
  let lineStart = true;
  while (i < n) {
    const c = source[i];
    const d = source[i + 1];

    if (c === '\n') { lineStart = true; i += 1; continue; }

    // A preprocessor directive, continuation lines included.
    if (cFamily && lineStart && c === '#') {
      let j = i;
      while (j < n && !(source[j] === '\n' && source[j - 1] !== '\\')) j += 1;
      blank(i, j);
      i = j;
      continue;
    }
    if (c !== ' ' && c !== '\t' && c !== '\r') lineStart = false;

    if (c === '/' && d === '/') {
      let j = i;
      while (j < n && source[j] !== '\n') j += 1;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      const end = source.indexOf('*/', i + 2);
      const j = end < 0 ? n : end + 2;
      blank(i, j);
      i = j;
      continue;
    }

    // C++ raw string: R"delim( ... )delim"
    if (lang === 'cpp' && c === 'R' && d === '"' && !isWord(source[i - 1])) {
      const m = /^R"([^()\\\s]{0,16})\(/.exec(source.slice(i, i + 20));
      if (m) {
        const end = source.indexOf(`)${m[1]}"`, i + m[0].length);
        const j = end < 0 ? n : end + m[1].length + 2;
        blank(i, j);
        i = j;
        continue;
      }
    }

    // Java text block: """ ... """
    if (lang === 'java' && source.startsWith('"""', i)) {
      const end = source.indexOf('"""', i + 3);
      const j = end < 0 ? n : end + 3;
      blank(i, j);
      i = j;
      continue;
    }

    // A quote after a digit or letter in C++ is a digit separator (1'000'000),
    // not the start of a character literal.
    const isQuote = c === '"' || (c === "'" && !(lang === 'cpp' && isWord(source[i - 1])));
    if (isQuote) {
      let j = i + 1;
      while (j < n && source[j] !== c && source[j] !== '\n') {
        if (source[j] === '\\') j += 1;
        j += 1;
      }
      j = Math.min(n, j + 1);
      blank(i, j);
      i = j;
      continue;
    }

    i += 1;
  }
  return out.join('');
}

/**
 * The blocks and statements directly inside a region of masked source, in
 * order: `{ head, headStart, open, close }` for a braced block (close is the
 * index of its `}`) and `{ head, headStart, end }` for a statement ended by
 * `;`. `head` is the masked text before the `{` or `;`.
 */
function members(masked, from, to) {
  const found = [];
  let segStart = from;
  let i = from;
  let parens = 0;

  const headInfo = (endIndex) => {
    const head = masked.slice(segStart, endIndex);
    const offset = head.search(/\S/);
    return { head, headStart: offset < 0 ? endIndex : segStart + offset };
  };

  while (i < to) {
    const c = masked[i];
    if (c === '(') parens += 1;
    else if (c === ')') parens = Math.max(0, parens - 1);
    else if (c === ';' && parens === 0) {
      found.push({ ...headInfo(i), end: i });
      segStart = i + 1;
    } else if (c === '{' && parens === 0) {
      const close = matchingBrace(masked, i, to);
      if (close < 0) return found;
      found.push({ ...headInfo(i), open: i, close });
      i = close;
      segStart = close + 1;
    }
    i += 1;
  }
  return found;
}

function matchingBrace(masked, open, to) {
  let depth = 0;
  for (let i = open; i < to; i += 1) {
    if (masked[i] === '{') depth += 1;
    else if (masked[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const NOT_FUNCTION_NAMES = new Set([
  'if', 'for', 'while', 'switch', 'return', 'sizeof', 'catch', 'decltype',
  'alignof', 'typeof', '__attribute__', 'do', 'else', 'new', 'delete',
]);

/**
 * Read a function definition's head: `{ name, params, prefix }`, or null when
 * the head is anything else (a struct, an initializer list, a lambda, a
 * namespace, a macro call). Conservative: when in doubt, it is not a function,
 * and the worst outcome of that is the student seeing their own compile error.
 */
function readFunctionHead(head) {
  // The parameter list is the first parenthesised group at the top level.
  let open = -1;
  for (let i = 0; i < head.length; i += 1) {
    if (head[i] === '(') { open = i; break; }
  }
  if (open < 0) return null;

  let depth = 0;
  let close = -1;
  for (let i = open; i < head.length; i += 1) {
    if (head[i] === '(') depth += 1;
    else if (head[i] === ')') {
      depth -= 1;
      if (depth === 0) { close = i; break; }
    }
  }
  if (close < 0) return null;

  const before = head.slice(0, open);
  const nameMatch = /([A-Za-z_]\w*)\s*$/.exec(before);
  if (!nameMatch) return null;
  const name = nameMatch[1];
  if (NOT_FUNCTION_NAMES.has(name)) return null;

  const prefix = before.slice(0, nameMatch.index);
  // `Foo::bar` is a member defined out of class; `x = f(...)` is a variable.
  if (/::\s*$/.test(prefix) || prefix.includes('=') || /\boperator\b/.test(prefix)) return null;

  // Only what may legitimately follow a free function's parameter list.
  const after = head.slice(close + 1);
  if (!/^\s*(noexcept\b[\s\S]*|throw\s*\([\s\S]*\)|->[\s\S]*|throws\s+[\w.,\s]+)?\s*$/.test(after)) return null;

  return { name, prefix, params: head.slice(open + 1, close), text: head };
}

const oneLine = (text) => text.replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// C and C++: compile main() after what is written below it
// ---------------------------------------------------------------------------

const lineOf = (text, offset) => text.slice(0, offset).split('\n').length;
const plural = (list, one, many) => (list.length === 1 ? one : many);

/** Name what a top-level block or statement defines, for the note. */
function describeMember(member) {
  const fn = member.open !== undefined ? readFunctionHead(member.head) : null;
  if (fn) return `${fn.name}()`;
  const type = /\b(struct|class|union|enum)\s+(?:class\s+|struct\s+)?([A-Za-z_]\w*)/.exec(member.head);
  if (type) return `${type[1]} ${type[2]}`;
  const alias = /\btypedef\b[\s\S]*?([A-Za-z_]\w*)\s*$/.exec(member.head) || /\busing\s+([A-Za-z_]\w*)\s*=/.exec(member.head);
  if (alias) return alias[1];
  return null;
}

/**
 * The repairs for a C or C++ program, most conservative first:
 *
 *   1. main() moved to the end of the file, so everything written below it --
 *      structs, classes, typedefs, global variables, functions -- is defined
 *      before main() is compiled. Its original place is left as blank lines and
 *      a `#line` directive restores its line numbers, so nothing a compiler or a
 *      stack trace reports moves.
 *   2. The same, plus a declaration of every function written below main(),
 *      placed before the first function in the file, for a function written
 *      above main() that calls one written below it.
 */
function cFamilyCandidates(source, lang) {
  const masked = mask(source, lang);
  const top = members(masked, 0, masked.length);
  const withFn = top.map((m) => ({ ...m, fn: m.open !== undefined ? readFunctionHead(m.head) : null }));

  const main = withFn.find((m) => m.fn && m.fn.name === 'main');
  if (!main) return [];

  const below = withFn.filter((m) => m.headStart > main.close);
  if (below.length === 0 || !masked.slice(main.close + 1).trim()) return [];

  const names = [...new Set(below.map(describeMember).filter(Boolean))];
  const what = names.length ? names.join(', ') : 'the code written below it';

  // main() blanked where it stood -- newlines kept, so every later line keeps
  // its number -- and appended at the end under a #line directive.
  const mainText = source.slice(main.headStart, main.close + 1);
  const blanked = source.slice(0, main.headStart) +
    mainText.replace(/[^\n]/g, ' ') +
    source.slice(main.close + 1);
  const moved = (prefixed) => `${prefixed}${prefixed.endsWith('\n') ? '' : '\n'}#line ${lineOf(source, main.headStart)}\n${mainText}\n`;

  const candidates = [{
    source: moved(blanked),
    names,
    note: `main() uses ${what}, written below it. In C and C++ everything must be defined before the code that uses it, ` +
      'so main() was compiled after the code below it. Next time, write these above main().',
    // Nothing added or changed, only compiled in a different order, with every
    // line number kept. So if it still fails, its errors are the student's
    // real remaining mistakes -- more useful than the placement errors that
    // would otherwise hide them, and that look like the platform's fault.
    stillFailingNote: `main() uses ${what}, written below it, so it was compiled after that code. ` +
      'These errors remain in your code:',
  }];

  // Functions below main(), declared up front for callers above main().
  const functionsBelow = below.filter((m) =>
    m.fn &&
    m.fn.prefix.trim() !== '' &&
    !m.fn.params.includes('=') &&
    !(/\btemplate\b/.test(m.fn.prefix) && m.fn.prefix.includes('='))
  );
  const firstFunction = withFn.find((m) => m.fn);
  if (functionsBelow.length && firstFunction) {
    const declarations = [...new Set(functionsBelow.map((m) => `${oneLine(m.fn.text)};`))].join(' ');
    const at = firstFunction.headStart;
    const declared = `${blanked.slice(0, at)}${declarations} ${blanked.slice(at)}`;
    const fnNames = [...new Set(functionsBelow.map((m) => `${m.fn.name}()`))];
    candidates.push({
      source: moved(declared),
      names,
      note: `${fnNames.join(', ')} ${plural(fnNames, 'is', 'are')} written below main() and used above it, ` +
        `so ${plural(fnNames, 'a declaration was', 'declarations were')} added and main() was compiled after the code below it. ` +
        'In C and C++ everything must be declared before the code that uses it.',
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Java: let main() reach the helpers in class Main
// ---------------------------------------------------------------------------

const JAVA_TYPE_DECLARATION = /\b(class|interface|enum|record)\b/;

function fixJava(source) {
  const masked = mask(source, 'java');
  const topLevel = members(masked, 0, masked.length);

  const mainClass = topLevel.find((m) => m.open !== undefined && /\bclass\s+Main\b/.test(m.head));
  if (!mainClass) return null;

  const edits = [];        // { at, text } insertions
  const blanks = [];       // [from, to) ranges to blank out
  const madeStatic = [];
  const moved = [];

  // Members of Main that main() cannot reach without `static`.
  for (const member of members(masked, mainClass.open + 1, mainClass.close)) {
    const head = member.head;
    if (!head.trim()) continue;                              // initializer block
    if (/\bstatic\b/.test(head)) continue;
    if (/\babstract\b|@Override\b|\bdefault\b/.test(head)) continue;
    if (/\b(interface|enum|record)\b/.test(head)) continue;  // already implicitly static

    if (member.open !== undefined && /\bclass\b/.test(head)) {
      edits.push({ at: member.headStart, text: 'static ' });
      madeStatic.push(/\bclass\s+(\w+)/.exec(head)?.[1] || 'class');
      continue;
    }

    const fn = member.open !== undefined ? readFunctionHead(head) : null;
    if (fn) {
      // A constructor has no return type: nothing before its name but modifiers.
      if (fn.name === 'Main') continue;
      edits.push({ at: member.headStart, text: 'static ' });
      madeStatic.push(`${fn.name}()`);
      continue;
    }

    // A field. Static as well, or the helpers that use it -- now static --
    // could not see it. (A `;`-ended member with a parameter list and no
    // initializer is a bodiless method declaration, and is left alone.)
    const isField = member.end !== undefined && (!head.includes('(') || head.includes('='));
    if (isField) edits.push({ at: member.headStart, text: 'static ' });
  }

  // A second public top-level type. Java allows one per file, named after the
  // file -- Main.java -- so `public class Node` beside Main does not compile:
  // "class Node is public, should be declared in a file named Node.java".
  const unpublished = [];
  for (const member of topLevel) {
    if (member.open === undefined || member === mainClass) continue;
    const type = /\bpublic\s+((?:(?:abstract|final|sealed|static|strictfp)\s+)*)(class|interface|enum|record)\s+(\w+)/.exec(member.head);
    if (!type) continue;
    const at = member.head.indexOf(type[0]);
    // Blank the word `public` in place: same length, same line.
    blanks.push([member.headStart - (member.head.search(/\S/)) + at, member.headStart - (member.head.search(/\S/)) + at + 'public'.length]);
    unpublished.push(`${type[2]} ${type[3]}`);
  }

  // Methods written outside any class: move them into Main.
  for (const member of topLevel) {
    if (member.open === undefined || member === mainClass) continue;
    if (JAVA_TYPE_DECLARATION.test(member.head)) continue;
    const fn = readFunctionHead(member.head);
    if (!fn) continue;
    const text = source.slice(member.headStart, member.close + 1);
    blanks.push([member.headStart, member.close + 1]);
    moved.push({ text: /\bstatic\b/.test(fn.prefix) ? text : `static ${text}`, name: `${fn.name}()` });
  }
  if (moved.length) {
    // Just before Main's closing brace, so nothing above it changes line.
    edits.push({ at: mainClass.close, text: `\n${moved.map((m) => m.text).join('\n\n')}\n` });
  }

  if (edits.length === 0 && blanks.length === 0) return null;

  let out = source.split('');
  for (const [from, to] of blanks) {
    for (let k = from; k < to; k += 1) if (out[k] !== '\n') out[k] = ' ';
  }
  out = out.join('');
  for (const edit of [...edits].sort((a, b) => b.at - a.at)) {
    out = out.slice(0, edit.at) + edit.text + out.slice(edit.at);
  }

  const parts = [];
  if (madeStatic.length) {
    parts.push(`${madeStatic.join(', ')} ${madeStatic.length === 1 ? 'was' : 'were'} made static so main() can use ${madeStatic.length === 1 ? 'it' : 'them'}. ` +
      'main() is static, so in Java it can only call static methods and create static nested classes.');
  }
  if (moved.length) {
    parts.push(`${moved.map((m) => m.name).join(', ')} ${moved.length === 1 ? 'was' : 'were'} written outside class Main and ${moved.length === 1 ? 'was' : 'were'} moved inside it. ` +
      'In Java every method belongs to a class.');
  }
  if (unpublished.length) {
    parts.push(`${unpublished.join(', ')} ${plural(unpublished, 'was', 'were')} declared public outside class Main, and Java allows only one public class per file. ` +
      `${plural(unpublished, 'It was', 'They were')} compiled without \`public\`.`);
  }
  return {
    source: out,
    names: [...madeStatic, ...moved.map((m) => m.name), ...unpublished],
    note: parts.join(' '),
  };
}

/**
 * Repaired copies of a program that failed to compile, to be tried in order;
 * empty when there is nothing this module knows how to repair.
 *
 * @returns {Array<{ source: string, note: string, names: string[] }>}
 */
function repairCandidates(language, source) {
  try {
    const text = String(source || '');
    let candidates = [];
    if (language === 'c' || language === 'cpp') candidates = cFamilyCandidates(text, language);
    else if (language === 'java') {
      const fixed = fixJava(text);
      candidates = fixed ? [fixed] : [];
    }
    return candidates.filter((candidate) => candidate && candidate.source !== text);
  } catch {
    // A repair is a courtesy. It must never be the reason a run fails.
    return [];
  }
}

/** The first repair, or null. */
function repairForCompile(language, source) {
  return repairCandidates(language, source)[0] || null;
}

module.exports = { repairCandidates, repairForCompile, mask };
