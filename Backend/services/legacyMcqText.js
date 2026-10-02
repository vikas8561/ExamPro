/**
 * Recognising MCQ answers saved by the old exam-page autosave.
 *
 * MCQ answers are stored and graded as the option's exact TEXT. TakeTest's
 * autosave used to "strip HTML" from that text by assigning it to innerHTML, so
 * an option like `vector<int>` was saved as `vector`. The page now sends the
 * text untouched, but answers saved the old way still exist -- in attempts that
 * were running when the fix shipped, and in ones the expiry sweep finalised
 * from those autosaves -- and an exact comparison marks every one of them wrong.
 *
 * canonicalOption() maps such an answer back to its option, and only when
 * exactly one option fits: `vector<int>` and `vector<char>` both became
 * `vector`, and guessing between them would award marks the student may not
 * have earned. An exact match always wins, so no answer saved correctly can
 * change meaning.
 *
 * legacyStrippedText() is a copy of the same function in
 * Frontend/src/utils/mcqOption.js -- the two deploy separately. Both are checked
 * against Backend/scripts/exam/fixtures/legacy-mcq-strip.json, which records
 * what a real browser produced, so they cannot drift apart unnoticed.
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
function legacyStrippedText(text) {
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
 * The option text a saved answer refers to: itself when it is an option, the
 * one option it is the old stripped form of, or itself unchanged otherwise.
 */
function canonicalOption(question, selected) {
  if (typeof selected !== "string" || selected === "") return selected;
  const texts = (question?.options || []).map((option) => option?.text).filter((text) => typeof text === "string");
  if (texts.includes(selected)) return selected;

  const matches = texts.filter((text) => text.includes("<") && legacyStrippedText(text) === selected);
  return matches.length === 1 ? matches[0] : selected;
}

module.exports = { legacyStrippedText, canonicalOption };
