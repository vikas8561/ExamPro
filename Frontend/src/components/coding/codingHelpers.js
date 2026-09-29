/**
 * Plain helpers shared by the coding workspace and the pages that host it.
 * Components live in codingUi.jsx.
 */

// Judge0 status ids (GET /statuses). Colours follow LeetCode's verdict palette.
export const ACCEPTED = 3;
export const WRONG_ANSWER = 4;

export const verdictColor = (statusId) => (statusId === ACCEPTED ? 'text-[#28c244]' : 'text-[#ef4743]');

export const verdictLabel = (statusId, description) => {
  if (statusId === ACCEPTED) return 'Accepted';
  return description || 'Wrong Answer';
};

/**
 * The verdict to show for a submission.
 *
 * The headline and the pass count must tell the same story. The judge reports
 * Accepted on its own comparison, so an "Accepted" sitting beside
 * "3 / 5 testcases passed" was possible; the count is what the score was
 * computed from, so the count wins.
 */
export const submitVerdict = (result) => {
  const verdict = result?.verdict || { id: WRONG_ANSWER, description: 'Wrong Answer' };
  const allPassed = result?.totalHidden > 0 && result.passedCount === result.totalHidden;
  if (verdict.id === ACCEPTED && !allPassed) {
    return { id: WRONG_ANSWER, description: 'Wrong Answer' };
  }
  return verdict;
};

/**
 * The clock time a submission was accepted, as the student's own clock reads it.
 *
 * The instant comes from the server -- the browser's clock belongs to the
 * student -- but it is rendered in their locale, because the point of a receipt
 * is that it matches the clock they are looking at. Returns null rather than a
 * placeholder when the server did not send one, so an older cached result shows
 * no time instead of "Invalid Date".
 */
export const submittedAtLabel = (iso) => {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const DIFFICULTY_COLOR = {
  easy: 'text-[#46c6c2]',
  medium: 'text-[#ffb800]',
  hard: 'text-[#f63737]',
};

export const FONT_SIZES = {
  small: 12,
  medium: 14,
  large: 16,
  'extra-large': 18,
};

/** h:mm:ss, the countdown format both exam pages show. */
export const formatClock = (seconds) => {
  const total = Math.max(0, seconds || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
  const sec = (total % 60).toString().padStart(2, '0');
  return `${h}:${m}:${sec}`;
};

/**
 * Tidy whitespace. Deliberately NOT a reformatter.
 *
 * An earlier version ran `line.trim()` over every line, which strips leading
 * indentation -- pressing Format silently destroyed any Python submission
 * and reduced C-family code to one flat block. There is no formatter for
 * six languages on the client, so this does only what is provably safe:
 * normalise line endings, drop trailing whitespace, collapse runs of blank
 * lines, and end the file with a single newline. Indentation is untouched.
 */
export const tidyCode = (code) => (code || '')
  .replace(/\r\n/g, '\n')
  .split('\n')
  .map((line) => line.replace(/[ \t]+$/, ''))
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/\s*$/, '\n');

export const CODING_STYLES = `
  .lc-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
  .lc-scroll::-webkit-scrollbar-track { background: transparent; }
  .lc-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.16);
    border-radius: 4px;
  }
  .lc-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.28); }
  .lc-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.16) transparent; }

  /* Markdown inside the description, matching LeetCode's typography */
  .lc-prose p { margin: 0 0 1rem 0; }
  .lc-prose strong, .lc-prose b { color: #fff; font-weight: 600; }
  .lc-prose ul, .lc-prose ol { margin: 0 0 1rem 1.25rem; list-style: revert; }
  .lc-prose li { margin: 0.25rem 0; }
  .lc-prose a { color: #46c6c2; }
  .lc-prose code {
    background: rgba(255, 255, 255, 0.07);
    color: rgba(239, 241, 246, 0.75);
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 5px;
  }
  .lc-prose pre {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 12px;
    overflow-x: auto;
  }
  .lc-prose pre code { background: transparent; padding: 0; font-size: 13px; }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-in { animation: fadeIn 0.15s ease-out; }
`;
