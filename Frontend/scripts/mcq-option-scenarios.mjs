/**
 * MCQ option text on the exam page (src/utils/mcqOption.js, src/pages/TakeTest.jsx).
 *
 * The bug: TakeTest's autosave pushed the chosen option's text through
 * innerHTML to "strip HTML", so `vector<int>` was saved as `vector`. On reload
 * the choice vanished; the expiry sweep, which grades from autosaves, marked it
 * wrong; and the innerHTML assignment ran any <img onerror> an option carried.
 *
 * Run with:  npm run test:mcq-options
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { legacyStrippedText, findOptionIndex } from "../src/utils/mcqOption.js";

const here = path.dirname(fileURLToPath(import.meta.url));

let pass = 0,
  fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail !== "" ? `  -> ${JSON.stringify(detail)}` : ""}`);
  }
};

console.log("\n── The old stripping, reproduced exactly (real-browser ground truth) ──\n");
{
  const fixture = JSON.parse(
    fs.readFileSync(path.resolve(here, "../../Backend/scripts/exam/fixtures/legacy-mcq-strip.json"), "utf8")
  );
  const differ = fixture.cases.filter(([input, browser]) => legacyStrippedText(input) !== browser);
  check(`All ${fixture.cases.length} browser cases reproduced`, differ.length === 0,
    differ.map(([i, b]) => ({ input: i, browser: b, ours: legacyStrippedText(i) })));
}

console.log("\n── Restoring a saved answer on reload ──\n");
{
  const options = [
    { text: "vector<int>" },
    { text: "vector<char>" },
    { text: "#include <stdio.h>" },
    { text: "a < b" },
    { text: "Map<String, List<Integer>>" },
  ];
  check("Exact text (what autosave sends now) finds its option", findOptionIndex(options, "vector<int>") === 0);
  check("…every option, including ones with angle brackets",
    options.every((option, index) => findOptionIndex(options, option.text) === index));
  check("Old stripped answer '#include ' finds '#include <stdio.h>'", findOptionIndex(options, "#include ") === 2);
  check("Old stripped answer 'Map>' finds its option", findOptionIndex(options, "Map>") === 4);
  check("Ambiguous old answer 'vector' (from vector<int> OR vector<char>) is NOT guessed",
    findOptionIndex(options, "vector") === -1);
  check("Unknown text finds nothing", findOptionIndex(options, "something else") === -1);
  check("Blank / missing finds nothing",
    findOptionIndex(options, "") === -1 && findOptionIndex(options, null) === -1 && findOptionIndex(null, "x") === -1);

  const exactWins = [{ text: "x" }, { text: "x<y" }];
  check("An option whose exact text equals another's stripped form is matched exactly, never re-mapped",
    findOptionIndex(exactWins, "x") === 0);
}

console.log("\n── The exam page no longer strips or injects ──\n");
{
  const takeTest = fs.readFileSync(path.resolve(here, "../src/pages/TakeTest.jsx"), "utf8");
  const code = takeTest.split("\n").filter((line) => !/^\s*(\/\/|\*)/.test(line)).join("\n");
  check("TakeTest.jsx assigns no innerHTML", !/\.innerHTML\s*=/.test(code));
  check("TakeTest.jsx restores answers through findOptionIndex", /findOptionIndex\(question\.options/.test(code));
  check("Autosave sends selectedOption as given", /selectedOption,\s*\n\s*textAnswer:/.test(code));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
