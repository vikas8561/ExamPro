/**
 * Staying signed in through an exam, and not losing answers when it fails
 * (src/utils/authToken.js, src/utils/unsavedAnswers.js, src/services/api.js,
 * the two exam pages).
 *
 * Reported 2026-10-16: students were signed out mid-exam or at Submit and came
 * back to a blank paper. The 24-hour token was never renewed; an expired one
 * made every autosave fail while the page carried on silently; and nothing kept
 * the answers that had not reached the server. The server half is checked by
 * Backend/scripts/exam/session-continuity-check.js.
 *
 * Run with:  npm run test:session
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));

// A stand-in localStorage, installed before the module under test loads.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { tokenExpiryMs, isTokenExpired, shouldRenewToken, loginRedirectUrl, RENEW_WHEN_LEFT_MS } = await import(
  "../src/utils/authToken.js"
);
const { recordPending, recordSaved, pendingAnswers, clearPending } = await import("../src/utils/unsavedAnswers.js");

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

const HOUR = 3600 * 1000;
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const tokenExpiringAt = (ms) => `${b64url({ alg: "HS256" })}.${b64url({ userId: "u", exp: Math.floor(ms / 1000) })}.sig`;

console.log("\n── When to renew the token ──\n");
{
  const now = Date.UTC(2026, 9, 16, 10, 0, 0);
  const fresh = tokenExpiringAt(now + 24 * HOUR);
  const yesterday = tokenExpiringAt(now + 5 * 60 * 1000); // signed in yesterday at 10:05
  const gone = tokenExpiringAt(now - 1000);

  check("Reads the expiry from a base64url payload", tokenExpiryMs(yesterday) === now + 5 * 60 * 1000);
  check("A fresh 24h token is not renewed", !shouldRenewToken(fresh, now));
  check("Yesterday's token with 5 minutes left IS renewed", shouldRenewToken(yesterday, now));
  check("…as is one just under the threshold", shouldRenewToken(tokenExpiringAt(now + RENEW_WHEN_LEFT_MS - 1000), now));
  check("An expired token is not renewed (the server would refuse it)", !shouldRenewToken(gone, now));
  check("…it is expired", isTokenExpired(gone, now) && !isTokenExpired(yesterday, now));
  check("Garbage is left to the server", tokenExpiryMs("nope") === null && !isTokenExpired("nope", now) && !shouldRenewToken(null, now));
}

console.log("\n── Where a signed-out student is sent ──\n");
{
  const url = new URL(loginRedirectUrl("session_timeout", { pathname: "/student/take-test/abc", search: "?n=1" }), "http://x");
  check("To the login page, told why", url.pathname === "/login" && url.searchParams.get("message") === "session_timeout");
  check("…and brought back to the exam afterwards, query intact (SEB's nonce)", url.searchParams.get("redirect") === "/student/take-test/abc?n=1");
  const fromLogin = new URL(loginRedirectUrl("session_expired", { pathname: "/login", search: "" }), "http://x");
  check("Never redirects back to the login page itself", !fromLogin.searchParams.has("redirect"));
  const evil = new URL(loginRedirectUrl("session_expired", { pathname: "//evil.example", search: "" }), "http://x");
  check("Never redirects off-site", !evil.searchParams.has("redirect"));
}

console.log("\n── Answers the server has not confirmed ──\n");
{
  const U = "student1";
  const A = "assignment1";
  recordPending(U, A, "q1", { selectedOption: "4" });
  recordPending(U, A, "q2", { textAnswer: "first draft" });
  check("Pending answers are kept", Object.keys(pendingAnswers(U, A)).length === 2);

  recordPending(U, A, "q2", { textAnswer: "first draft, and more" });
  recordSaved(U, A, "q2", { textAnswer: "first draft" });
  check("A save of an OLDER value does not drop the newer text", pendingAnswers(U, A).q2?.textAnswer === "first draft, and more");
  recordSaved(U, A, "q2", { textAnswer: "first draft, and more" });
  check("Saving the latest value clears it", !pendingAnswers(U, A).q2);
  recordSaved(U, A, "q1", { selectedOption: "4", textAnswer: undefined, language: undefined });
  check("undefined and null compare equal", !pendingAnswers(U, A).q1);
  check("Nothing pending leaves nothing in storage", ![...store.keys()].some((k) => k.startsWith("exampro_unsaved")));

  recordPending(U, A, "q3", { textAnswer: "code", language: "cpp" });
  check("Kept per student and per attempt", Object.keys(pendingAnswers("student2", A)).length === 0 && Object.keys(pendingAnswers(U, "other")).length === 0);
  check("The language comes back with the code", pendingAnswers(U, A).q3?.language === "cpp");
  clearPending(U, A);
  check("Cleared after hand-in", Object.keys(pendingAnswers(U, A)).length === 0);

  store.set(`exampro_unsaved:${U}:${A}`, "{not json");
  check("A corrupt entry reads as nothing rather than throwing", Object.keys(pendingAnswers(U, A)).length === 0);
  check("No student id: nothing is stored", (recordPending("", A, "q", { textAnswer: "x" }), Object.keys(pendingAnswers("", A)).length === 0));
}

console.log("\n── Wiring (source checks) ──\n");
{
  const read = (p) =>
    fs
      .readFileSync(path.resolve(here, p), "utf8")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join("\n");
  const api = read("../src/services/api.js");
  check("apiRequest renews the token before every request", /const apiRequest = async[\s\S]{0,120}await ensureFreshToken\(\)/.test(api));
  check("apiStream renews too", /export const apiStream = async[\s\S]{0,120}await ensureFreshToken\(\)/.test(api));
  check("A 401 sends the student to sign in (it used to clear the token and carry on)", /status === 401\) \{\s*endSignIn\('session_timeout'\)/.test(api));

  for (const page of ["TakeTest.jsx", "TakeCodingTest.jsx"]) {
    const src = read(`../src/pages/${page}`);
    check(`${page}: keeps unsaved answers locally`, /recordPending\(/.test(src) && /recordSaved\(/.test(src));
    check(`${page}: shows the save banner`, /<SaveStatusBanner unsavedCount=\{unsavedIds\.size\} \/>/.test(src));
    check(`${page}: puts local answers back on load`, /pendingAnswers\(studentIdRef\.current, (finalA|a)ssignmentId\)/.test(src));
    check(`${page}: clears them after hand-in`, /clearPending\(studentIdRef\.current, assignmentId\)/.test(src));
  }
  const coding = read("../src/pages/TakeCodingTest.jsx");
  check("TakeCodingTest: an untouched template is handed in as blank", /code !== insertedTemplateRef\.current\[questionId\] \? code : ''/.test(coding));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
