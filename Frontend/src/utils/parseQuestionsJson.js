// Parser for bulk question uploads.
//
// Kept as a pure function (no React, no DOM) so it can be tested directly and
// reused. It produces exactly the question shape CreateTest holds in state and
// later posts to /tests — including the visibleTestCases / hiddenTestCases that
// the Judge0 grading pipeline needs.

import { normalizeLanguageKey } from '../config/languages';

export const QUESTION_KINDS = ['mcq', 'theory', 'coding'];

/**
 * Examples shown in the UI, one per question kind. Each is a complete,
 * uploadable file on its own. Kept here so the same tests cover them.
 */
export const EXAMPLE_MCQ_JSON = `{
  "questions": [
    {
      "kind": "mcq",
      "text": "What is the output?\\n\\n\`\`\`js\\nconst a = [1, 2, 3];\\nconsole.log(a.map(x => x * 2));\\n\`\`\`",
      "options": ["[2, 4, 6]", "[1, 2, 3]", "[1, 4, 9]", "undefined"],
      "answer": "[2, 4, 6]",
      "points": 2
    }
  ]
}`;

export const EXAMPLE_THEORY_JSON = `{
  "questions": [
    {
      "kind": "theory",
      "text": "Explain the difference between \`let\`, \`const\` and \`var\` in JavaScript.",
      "points": 5
    }
  ]
}`;

export const EXAMPLE_CODING_JSON = `{
  "questions": [
    {
      "kind": "coding",
      "text": "Read two integers from standard input and print their sum.\\n\\n**Input:** two space-separated integers\\n\\n**Output:** a single integer",
      "language": "python",
      "guidelines": "Read from stdin, write the answer to stdout. Do not print anything else.",
      "examples": [
        { "input": "2 3", "output": "5" }
      ],
      "visibleTestCases": [
        { "input": "2 3", "output": "5" },
        { "input": "10 20", "output": "30" }
      ],
      "hiddenTestCases": [
        { "input": "-4 4", "output": "0", "marks": 2 },
        { "input": "1000000 1", "output": "1000001", "marks": 3 }
      ]
    }
  ]
}`;

export const EXAMPLES = [
  { key: 'mcq', label: 'MCQ', json: EXAMPLE_MCQ_JSON },
  { key: 'theory', label: 'Theory', json: EXAMPLE_THEORY_JSON },
  { key: 'coding', label: 'Coding', json: EXAMPLE_CODING_JSON },
];

/** Test case values must be strings — JSON authors routinely write numbers. */
const toText = (value) => {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
};

const newId = () =>
  (globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `q-${Date.now()}-${Math.random().toString(16).slice(2)}`);

function parseTestCases(list, { withMarks }, label, index, warnings) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) {
    throw new Error(`Question ${index + 1}: "${label}" must be an array`);
  }

  return list.map((testCase, caseIndex) => {
    const where = `Question ${index + 1}: ${label}[${caseIndex}]`;
    if (testCase === null || typeof testCase !== 'object' || Array.isArray(testCase)) {
      throw new Error(`${where} must be an object with "input" and "output"`);
    }
    if (testCase.output === undefined) {
      throw new Error(`${where} is missing "output"`);
    }
    if (typeof testCase.input !== 'string' || typeof testCase.output !== 'string') {
      warnings.push(`${where}: input/output was converted to text.`);
    }

    const parsed = { input: toText(testCase.input), output: toText(testCase.output) };

    if (withMarks) {
      const marks = testCase.marks === undefined ? NaN : Number(testCase.marks);
      if (!Number.isFinite(marks) || marks < 0) {
        throw new Error(`${where} needs a "marks" number of 0 or more`);
      }
      parsed.marks = marks;
    }
    return parsed;
  });
}

/**
 * @param {object} jsonData        parsed JSON from the uploaded file
 * @param {string[]} languageKeys  languages this deployment can actually run
 * @returns {{ questions: object[], warnings: string[] }}
 * @throws {Error} with a message naming the offending question
 */
export function parseQuestionsJson(jsonData, { languageKeys = [] } = {}) {
  // Accept either { "questions": [...] } or a bare [...] — pasting just the
  // array is a natural thing to do.
  const list = Array.isArray(jsonData) ? jsonData : jsonData?.questions;

  if (!jsonData || typeof jsonData !== 'object') {
    throw new Error('JSON must be an object containing a "questions" array');
  }
  if (!Array.isArray(list)) {
    throw new Error('JSON must contain a "questions" array');
  }
  if (list.length === 0) {
    throw new Error('The "questions" array is empty');
  }

  const warnings = [];

  const questions = list.map((question, index) => {
    if (!question || typeof question !== 'object' || Array.isArray(question)) {
      throw new Error(`Question ${index + 1} must be an object`);
    }

    const kind = question.kind === 'theoretical' ? 'theory' : question.kind;
    if (!QUESTION_KINDS.includes(kind)) {
      throw new Error(`Question ${index + 1}: "kind" must be "mcq", "theory" or "coding"`);
    }
    if (typeof question.text !== 'string' || question.text.trim() === '') {
      throw new Error(`Question ${index + 1} must have a non-empty "text" string`);
    }

    const points = Number(question.points);
    const base = {
      id: newId(),
      kind,
      text: question.text,
      points: Number.isFinite(points) && points > 0 ? points : 1,
    };

    if (kind === 'mcq') {
      if (!Array.isArray(question.options) || question.options.length < 2) {
        throw new Error(`Question ${index + 1} (mcq) needs at least 2 options`);
      }
      const options = question.options.map(toText);
      if (options.some((option) => option.trim() === '')) {
        throw new Error(`Question ${index + 1} (mcq) has an empty option`);
      }
      if (question.answer === undefined || question.answer === null || question.answer === '') {
        throw new Error(`Question ${index + 1} (mcq) needs an "answer"`);
      }
      const answer = toText(question.answer);
      if (!options.includes(answer)) {
        throw new Error(`Question ${index + 1} (mcq): "answer" must exactly match one of the options`);
      }
      return { ...base, options, answer };
    }

    if (kind === 'theory') {
      return base;
    }

    // --- coding -------------------------------------------------------------
    const visibleTestCases = parseTestCases(question.visibleTestCases, { withMarks: false }, 'visibleTestCases', index, warnings);
    const hiddenTestCases = parseTestCases(question.hiddenTestCases, { withMarks: true }, 'hiddenTestCases', index, warnings);
    const examples = parseTestCases(question.examples, { withMarks: false }, 'examples', index, warnings);

    let language;
    if (question.language !== undefined && question.language !== null && question.language !== '') {
      language = normalizeLanguageKey(question.language);
      if (!language) {
        throw new Error(
          `Question ${index + 1} (coding): language "${question.language}" is not supported.`
          + (languageKeys.length ? ` Use one of: ${languageKeys.join(', ')}` : '')
        );
      }
      if (languageKeys.length && !languageKeys.includes(language)) {
        warnings.push(`Question ${index + 1}: language "${language}" is not available on this judge; students can still pick another.`);
      }
    }

    // These do not stop the upload — the admin can still fill them in by hand —
    // but the question would silently be ungradeable, so say so loudly.
    if (hiddenTestCases.length === 0) {
      warnings.push(`Question ${index + 1} (coding) has no hiddenTestCases — it cannot be graded until you add some.`);
    } else if (hiddenTestCases.every((testCase) => testCase.marks === 0)) {
      warnings.push(`Question ${index + 1} (coding): every hidden test case is worth 0 marks, so it scores nothing.`);
    }
    if (visibleTestCases.length === 0) {
      warnings.push(`Question ${index + 1} (coding) has no visibleTestCases — students get nothing to try with "Run".`);
    }

    return {
      ...base,
      ...(language ? { language } : {}),
      ...(question.guidelines ? { guidelines: toText(question.guidelines) } : {}),
      examples,
      visibleTestCases,
      hiddenTestCases,
    };
  });

  return { questions, warnings };
}
