/**
 * Matching a saved MCQ answer back to its option.
 *
 * MCQ answers are stored as the option's TEXT (that is what keeps shuffling
 * safe -- see Backend/services/questionOrder.js), so the text must travel
 * exactly as written. TakeTest's autosave used to "strip HTML" from it first by
 * pushing it through `innerHTML`, which turned `vector<int>` into `vector`,
 * `#include <stdio.h>` into `#include `, and `x<y` into `x`. The stripped text
 * matched no option, so on reload the student's choice silently disappeared,
 * and the expiry sweep -- which grades from autosaves -- marked it wrong. (The
 * `innerHTML` assignment also ran any `<img onerror>` in an option's text.)
 *
 * Autosave now sends the text untouched. What remains is the answers saved the
 * old way before that changed, which this module recognises.
 *
 * Kept in step with legacyStrippedText in Backend/services/grading.js, which
 * does the same for grading. Both are checked against the same cases, and
 * against a real browser's parser, by the scripts named in those tests.
 */

// The named character references an exam option plausibly contains. Browsers
// know about two thousand; one missing here only means an old answer using it
// is not recognised -- never that it is matched to the wrong option. Names are
// case-sensitive, as in HTML (&rarr; and &rArr; are different characters).
const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  copy: "©", reg: "®", trade: "™", deg: "°", plusmn: "±",
  times: "×", divide: "÷", micro: "µ", middot: "·", para: "¶", sect: "§",
  cent: "¢", pound: "£", euro: "€", yen: "¥", not: "¬",
  frac12: "½", frac14: "¼", frac34: "¾", sup2: "²", sup3: "³",
  hellip: "…", mdash: "—", ndash: "–", bull: "•",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  le: "≤", ge: "≥", ne: "≠", equiv: "≡", asymp: "≈", infin: "∞",
  larr: "←", rarr: "→", uarr: "↑", darr: "↓", harr: "↔",
  lArr: "⇐", rArr: "⇒", hArr: "⇔",
  sum: "∑", prod: "∏", radic: "√", part: "∂", nabla: "∇", int: "∫",
  forall: "∀", exist: "∃", empty: "∅", isin: "∈", notin: "∉",
  cap: "∩", cup: "∪", sub: "⊂", sup: "⊃", and: "∧", or: "∨", there4: "∴",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", theta: "θ",
  lambda: "λ", mu: "μ", pi: "π", sigma: "σ", tau: "τ", phi: "φ", omega: "ω",
  Delta: "Δ", Sigma: "Σ", Omega: "Ω", Theta: "Θ", Pi: "Π",
};

function decodeEntities(text) {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, body) ? ENTITIES[body] : whole;
  });
}

/**
 * What the old autosave turned an option's text into: the browser's
 * `textContent` after parsing it as HTML, falling back to the original text
 * when that came out empty. Only text containing "<" was ever touched.
 */
export function legacyStrippedText(text) {
  const original = String(text ?? "");
  if (!original.includes("<")) return original;

  // The HTML tokenizer starts a tag at "<" followed by a letter, "/" + letter,
  // "!" or "?", and swallows everything to the next ">" -- or to the end of the
  // text when there is none. A comment runs to "-->".
  const stripped = decodeEntities(
    original
      .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
      .replace(/<(?:[A-Za-z!?]|\/[A-Za-z])[^>]*(?:>|$)/g, "")
      .replace(/<\/>/g, "")
  );
  return stripped || original;
}

/**
 * The index of the option a saved answer refers to, or -1.
 *
 * An exact match always wins. Otherwise the answer may have been saved by the
 * old autosave, and is matched to the option whose stripped text it equals --
 * but only when exactly one option fits. `vector<int>` and `vector<char>` both
 * stripped to `vector`, and guessing between them would be worse than asking
 * the student to choose again.
 */
export function findOptionIndex(options, saved) {
  if (!Array.isArray(options) || typeof saved !== "string" || saved === "") return -1;

  const exact = options.findIndex((option) => option?.text === saved);
  if (exact !== -1) return exact;

  const matches = [];
  options.forEach((option, index) => {
    const text = option?.text;
    if (typeof text === "string" && text.includes("<") && legacyStrippedText(text) === saved) {
      matches.push(index);
    }
  });
  return matches.length === 1 ? matches[0] : -1;
}
