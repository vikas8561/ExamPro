/**
 * Who is allowed to sit an exam, by browser -- checked against real headers.
 *
 * Pure: no database, no API. Every case below is the User-Agent and client-hint
 * headers a real browser sends, because the point of services/browserRequirement
 * is to tell apart browsers that all claim to be "Chrome" in their User-Agent.
 *
 *   node scripts/security/browser-requirement-check.js
 */

const {
  identifyBrowser,
  checkBrowser,
  parseBrandList,
  normalizeDisplayReport,
  MIN_BROWSER_MAJOR,
} = require("../../services/browserRequirement");

let passed = 0;
let failed = 0;
const check = (cond, label, detail) => {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
};
const section = (title) => console.log(`\n── ${title}`);

const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)";
const CROS = "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko)";

const hints = (brands, { mobile = "?0", platform = '"Windows"' } = {}) => ({
  "sec-ch-ua": brands,
  "sec-ch-ua-mobile": mobile,
  "sec-ch-ua-platform": platform,
});

/** [label, headers, expected family, expected verdict code] */
const CASES = [
  // ── Allowed ──
  ["Chrome 130 on Windows", { "user-agent": `${WIN} Chrome/130.0.0.0 Safari/537.36`, ...hints('"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"') }, "chrome", "browser_ok"],
  ["Chrome 100 (the oldest allowed)", { "user-agent": `${WIN} Chrome/100.0.4896.60 Safari/537.36`, ...hints('" Not A;Brand";v="99", "Chromium";v="100", "Google Chrome";v="100"') }, "chrome", "browser_ok"],
  ["Chrome 109 on Windows 7 (last build for it)", { "user-agent": "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36", ...hints('"Not_A Brand";v="99", "Google Chrome";v="109", "Chromium";v="109"') }, "chrome", "browser_ok"],
  ["Chrome 116 on macOS 10.13 (last build for it)", { "user-agent": `${MAC} Chrome/116.0.0.0 Safari/537.36`, ...hints('"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"', { platform: '"macOS"' }) }, "chrome", "browser_ok"],
  ["Chrome 250 (a future version)", { "user-agent": `${WIN} Chrome/250.0.0.0 Safari/537.36`, ...hints('"Google Chrome";v="250", "Chromium";v="250", "Not.A/Brand";v="8"') }, "chrome", "browser_ok"],
  ["Chrome on Linux", { "user-agent": `${LINUX} Chrome/128.0.0.0 Safari/537.36`, ...hints('"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"', { platform: '"Linux"' }) }, "chrome", "browser_ok"],
  ["Chrome on a Chromebook", { "user-agent": `${CROS} Chrome/127.0.0.0 Safari/537.36`, ...hints('"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"', { platform: '"Chrome OS"' }) }, "chrome", "browser_ok"],
  ["Edge 130 on Windows", { "user-agent": `${WIN} Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0`, ...hints('"Chromium";v="130", "Microsoft Edge";v="130", "Not?A_Brand";v="99"') }, "edge", "browser_ok"],
  ["Edge 100", { "user-agent": `${WIN} Chrome/100.0.4896.60 Safari/537.36 Edg/100.0.1185.29`, ...hints('" Not A;Brand";v="99", "Chromium";v="100", "Microsoft Edge";v="100"') }, "edge", "browser_ok"],
  ["Edge on macOS", { "user-agent": `${MAC} Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0`, ...hints('"Microsoft Edge";v="129", "Not=A?Brand";v="8", "Chromium";v="129"', { platform: '"macOS"' }) }, "edge", "browser_ok"],
  // No client hints at all (an http origin): the User-Agent decides.
  ["Chrome with no client hints", { "user-agent": `${WIN} Chrome/120.0.0.0 Safari/537.36` }, "chrome", "browser_ok"],
  ["Edge with no client hints", { "user-agent": `${WIN} Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0` }, "edge", "browser_ok"],

  // ── Too old ──
  ["Chrome 99", { "user-agent": `${WIN} Chrome/99.0.4844.51 Safari/537.36`, ...hints('" Not A;Brand";v="99", "Chromium";v="99", "Google Chrome";v="99"') }, "chrome", "browser_outdated"],
  ["Chrome 80 (before client hints existed)", { "user-agent": `${WIN} Chrome/80.0.3987.149 Safari/537.36` }, "chrome", "browser_outdated"],
  ["Edge 92", { "user-agent": `${WIN} Chrome/92.0.4515.131 Safari/537.36 Edg/92.0.902.67`, ...hints('" Not;A Brand";v="99", "Microsoft Edge";v="92", "Chromium";v="92"') }, "edge", "browser_outdated"],

  // ── Other browsers, including Chromium ones whose User-Agent says Chrome ──
  ["Brave (User-Agent identical to Chrome)", { "user-agent": `${WIN} Chrome/130.0.0.0 Safari/537.36`, ...hints('"Chromium";v="130", "Brave";v="130", "Not?A_Brand";v="99"') }, "brave", "browser_unsupported"],
  ["Opera", { "user-agent": `${WIN} Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0`, ...hints('"Opera";v="115", "Chromium";v="129", "Not=A?Brand";v="8"') }, "opera", "browser_unsupported"],
  ["Opera GX", { "user-agent": `${WIN} Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0`, ...hints('"Opera GX";v="115", "Chromium";v="129", "Not=A?Brand";v="8"') }, "opera", "browser_unsupported"],
  ["Vivaldi (brands only say Chromium)", { "user-agent": `${WIN} Chrome/130.0.0.0 Safari/537.36`, ...hints('"Chromium";v="130", "Not?A_Brand";v="99"') }, "chromium", "browser_unsupported"],
  ["Yandex", { "user-agent": `${WIN} Chrome/128.0.0.0 YaBrowser/24.10.0.0 Safari/537.36`, ...hints('"Chromium";v="128", "Not;A=Brand";v="24", "YaBrowser";v="24.10"') }, "yandex", "browser_unsupported"],
  ["Plain Chromium on Linux", { "user-agent": `${LINUX} Chrome/130.0.0.0 Safari/537.36`, ...hints('"Chromium";v="130", "Not?A_Brand";v="99"', { platform: '"Linux"' }) }, "chromium", "browser_unsupported"],
  ["Headless Chrome", { "user-agent": `${LINUX} HeadlessChrome/130.0.0.0 Safari/537.36`, ...hints('"HeadlessChrome";v="130", "Chromium";v="130", "Not?A_Brand";v="99"', { platform: '"Linux"' }) }, "headless", "browser_unsupported"],
  ["Firefox", { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0" }, "firefox", "browser_unsupported"],
  ["Firefox on Linux", { "user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0" }, "firefox", "browser_unsupported"],
  ["Safari on macOS", { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15" }, "safari", "browser_unsupported"],
  ["Old EdgeHTML Edge", { "user-agent": `${WIN} Chrome/70.0.3538.102 Safari/537.36 Edge/18.19041` }, "edge_legacy", "browser_unsupported"],
  ["Internet Explorer 11", { "user-agent": "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko" }, "ie", "browser_unsupported"],
  ["No User-Agent at all", {}, "other", "browser_unsupported"],

  // ── Phones and tablets, even in Chrome or Edge ──
  ["Chrome on Android", { "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", ...hints('"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"', { mobile: "?1", platform: '"Android"' }) }, "chrome", "browser_mobile"],
  ["Chrome on an Android tablet (not ?1)", { "user-agent": "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", ...hints('"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"', { mobile: "?0", platform: '"Android"' }) }, "chrome", "browser_mobile"],
  ["Chrome on iPhone", { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.37 Mobile/15E148 Safari/604.1" }, "chrome", "browser_mobile"],
  ["Edge on Android", { "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0", ...hints('"Chromium";v="130", "Microsoft Edge";v="130", "Not?A_Brand";v="99"', { mobile: "?1", platform: '"Android"' }) }, "edge", "browser_mobile"],
];

section("identifyBrowser + checkBrowser, real headers");
for (const [label, headers, family, code] of CASES) {
  const id = identifyBrowser(headers);
  const verdict = checkBrowser(id);
  check(id.family === family && verdict.code === code, `${label} → ${family}, ${code}`, { id, verdict });
}

section("Client hints outrank the User-Agent");
{
  const id = identifyBrowser({
    "user-agent": `${WIN} Chrome/130.0.0.0 Safari/537.36`,
    ...hints('"Brave";v="130", "Chromium";v="130", "Not?A_Brand";v="99"'),
  });
  check(id.source === "client_hints" && id.family === "brave", "brand list is what decides", id);
  const viaUa = identifyBrowser({ "user-agent": `${WIN} Chrome/130.0.0.0 Safari/537.36` });
  check(viaUa.source === "user_agent", "falls back to the User-Agent when no brands arrive", viaUa);
}

section("parseBrandList");
{
  const list = parseBrandList('"Not?A_Brand";v="99", "Chromium";v="130", "Google Chrome";v="130"');
  check(list.length === 3 && list[2].brand === "Google Chrome" && list[2].major === 130, "three brands, versions as numbers", list);
  check(parseBrandList("").length === 0 && parseBrandList(undefined).length === 0, "empty and missing headers give an empty list", null);
  check(parseBrandList("garbage;;;").length === 0, "malformed header gives an empty list, never throws", null);
}

section("Minimum version is the display API's");
check(MIN_BROWSER_MAJOR === 100, "minimum is 100 (screen.isExtended shipped in Chrome/Edge 100)", MIN_BROWSER_MAJOR);
check(
  checkBrowser({ family: "chrome", major: null, mobile: false, label: "Google Chrome" }).ok === true,
  "an unreadable version is not refused here (the display check covers it)",
  null
);

section("normalizeDisplayReport");
const DISPLAY = [
  [{ isExtended: false, policyAllowed: true }, "single", "one screen"],
  [{ isExtended: false, policyAllowed: null }, "single", "one screen, browser cannot report the policy"],
  [{ isExtended: true, policyAllowed: true }, "multiple", "external monitor"],
  [{ isExtended: true, policyAllowed: null }, "multiple", "external monitor, no policy info"],
  [{ isExtended: false, policyAllowed: false }, "unverified", "blocked policy makes isExtended a meaningless false"],
  [{ isExtended: true, policyAllowed: false }, "unverified", "blocked policy, whatever it says"],
  [{ isExtended: null, policyAllowed: null }, "unverified", "Firefox / Safari: no API"],
  [{}, "unverified", "empty report"],
  [undefined, "unverified", "no report"],
  [null, "unverified", "null report"],
  ["single", "unverified", "a bare string is not a report"],
  [{ isExtended: "false" }, "unverified", "string 'false' is not false"],
  [{ isExtended: 0 }, "unverified", "0 is not false"],
];
for (const [report, expected, label] of DISPLAY) {
  const got = normalizeDisplayReport(report);
  check(got === expected, `${label} → ${expected}`, { report, got });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
