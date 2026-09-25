# Proctoring

One proctoring system, used by Assigned Tests and Coding Tests.

## The idea in one line

> **The browser watches. The server decides.**

The browser reports what it observes. Every decision about what that means —
whether a violation counts, how many are left, whether to end the test — is made
on the server. A student who edits the exam page can change what they see on
screen and nothing else.

This is the difference from the system this replaced. That one kept every rule in
the browser and the server checked nothing, which meant a student could skip the
exam page entirely, fetch the questions with a direct API call, and post their
answers back with nothing but a login token. Fullscreen, tab detection, keyboard
blocking — all of it bypassed in one request. That hole is now closed.

## What it can and cannot stop

| Cheating method | Result |
|---|---|
| Direct API call to fetch questions or submit answers | 🟢 **Blocked** |
| Switching browser tabs | 🟢 Blocked + recorded |
| Leaving fullscreen | 🟢 Blocked + recorded |
| Copy / paste / right-click | 🟢 Blocked + recorded |
| Browser keyboard shortcuts | 🟢 Blocked |
| Editing the page to fake the violation count | 🟢 Useless — the server keeps the count |
| Closing the tab, killing JS, cutting the network | 🟢 Caught by the heartbeat |
| Reloading to escape a cancellation | 🟢 Blocked |
| Opening developer tools | 🟡 Detected, cannot be prevented |
| `Cmd+Tab` / `Alt+Tab` to another app | 🟡 **Cannot block.** Detected instantly |
| Second monitor | 🟡 Detected |
| Cheating browser extension | 🔴 **Cannot block.** Crude ones detected |
| Phone, second laptop, notes, another person in the room | 🔴 **Cannot detect** |

🟢 stopped · 🟡 always caught, cannot be prevented · 🔴 out of reach for a web app

### Why the red rows are red

A web page cannot block `Cmd+Tab`, `Alt+Tab`, the Windows key, `Print Screen`,
the macOS screenshot shortcuts, or `Ctrl+Alt+Del`. The operating system takes
those before the browser ever sees them. There is also no browser API that lists
or blocks extensions — an extension runs *above* the page and can read and change
anything it renders.

Only a native lockdown application can close those gaps. **Safe Exam Browser
support now exists and is documented below**, switched off by default. With it
on, the extension and alt-tab rows above become 🟢. The last row does not: a
phone on the desk is out of reach of SEB too.

Where SEB cannot run — Linux, chiefly — `integrity.js` does what a page can.
Three signals, all scored 0 and all reported for the reviewer rather than acted
on: content injected into the exam, a panel mounted inside a shadow root (how
current AI sidebars hide from a plain DOM scan), and `fetch`, `XMLHttpRequest` or
`attachShadow` having been replaced (how an extension reads or rewrites what the
exam sends). It can also probe for specific extension ids via
`policy.blockedExtensionIds`, though Manifest V3 lets extensions randomise those
URLs, so a silent result means "not detected", never "not installed".

None of it stops an extension that wants to hide. It raises the cost.

With SEB off, the system compensates by catching the consequence — you cannot
alt-tab away without the exam noticing you left and recording it.

**Do not describe this system as making cheating impossible**, with or without
SEB. It makes cheating cost more than it is worth, which is the honest and
achievable goal.

## Privacy

**A frame of the student's screen is captured and stored when a violation is
recorded.** This reverses what this system originally promised, and the reversal
was deliberate — but it is the single most sensitive thing here, so read this
section before changing anything near it.

No video, audio or screen *recording* is captured, and there is no face
recognition anywhere — that was removed entirely, including the stored face
descriptors.

Camera, microphone and location remain a permission gate: requested, the grant
recorded as plain text, access held open only so revoking it mid-exam is noticed.
**Nothing is read through them.**

Screen sharing is now different. The share is still verified as a whole screen
rather than a tab, but frames **are** read from it — on every violation,
including the weight-0 ones.

### What that means in practice

A whole-screen capture is *whole screen*. Whatever else the student had open is
in the frame. It cannot be narrowed to the exam window without becoming useless,
because the evidence is precisely what else was in front of them.

Four things constrain it, and all four are code rather than policy:

| | |
|---|---|
| Deletion | A MongoDB TTL index on `ProctorScreenshot` removes them after **72 hours**. Not a cron job somebody has to remember |
| Size | Downscaled to 1280px, JPEG quality 0.5 — enough to identify an application, not to read correspondence |
| Rate | Minimum 5s between captures, maximum 60 per sitting, enforced **server-side** — a browser sending more is the one not to trust |
| Access | Admins and mentors, loaded on an explicit click, never with the report itself |

Students are told before they consent, on the pre-exam screen. The screen-share
row used to end *"Nothing is recorded or saved"*; that sentence was removed, and
a plain statement put in its place. A permission granted for monitoring is not
consent to be photographed, and the gate is the only place that consent can
honestly be taken.

Captures are off inside Safe Exam Browser — it supports no `getDisplayMedia` on
any platform, so there is no share to read. SEB's own lockdown is what replaces
the evidence there.

Besides the images, the only thing stored is a text list of violations —
timestamp, type, and a short description — saved on the submission. Working
session records clear themselves after two days.

*Trade-off to be aware of:* because the camera stream is held open, the camera
indicator light stays on for the exam even though nothing is looking through it.

## How it fits together

### Backend

| File | Job |
|---|---|
| `Backend/services/proctorPolicy.js` | **The rulebook.** Every rule, weight and threshold. Change a rule here and it changes everywhere. |
| `Backend/routes/proctor.js` | **The referee.** Applies the rulebook and returns verdicts. |
| `Backend/middleware/proctorSession.js` | **The lock on the door.** |
| `Backend/models/ProctorSession.js` | One live session per attempt. Holds the authoritative violation count. |
| `Backend/models/ProctorSetting.js` | The single global bypass code. |

Endpoints under `/api/proctor`:

| Endpoint | Purpose |
|---|---|
| `POST /session/start` | Open or resume a session; returns the rulebook |
| `POST /session/heartbeat` | "Still here", every 5 seconds |
| `POST /session/event` | Report violations; returns `continue` / `warn` / `terminate` |
| `POST /session/permissions` | Record what was granted (text only) |
| `POST /session/bypass` | Redeem the global access code |
| `POST /session/end` | Close the session on a normal submit |
| `GET /settings/otp` | *Admin only.* Read the global code |
| `POST /settings/otp/rotate` | *Admin only.* Generate a new one |

**Guarded routes.** `POST /api/test-submissions` and `POST /api/answers` are hard
blocked without a session. `GET /api/tests/:id` is blocked for students without
one. `GET /api/assignments/:id` and `POST /api/assignments/:id/start` still work —
the dashboard's Start Test button calls them before the exam page mounts — but
they return an empty question list until proctoring is live.

**The heartbeat** catches what a page cannot report about itself: closing the tab,
killing its JavaScript, pausing it in devtools, or cutting the network so
violation reports never arrive. Going quiet is itself charged as a violation, so
silencing the reporting does not help.

### Frontend

Everything lives in `Frontend/src/proctoring/`. An exam page mounts one thing:

```jsx
<ProctorProvider enabled assignmentId={id} testKind="assigned" onTerminate={fn}>
  <YourExamPage />
</ProctorProvider>
```

and reads state through one hook:

```js
const { ready, violationCount, endSession } = useProctor();
```

`ready` is the important one — the server withholds questions until a session is
running, so a page must wait for it before fetching the paper.

Each detector in `detectors/` is a small file with `start()` and `stop()`. Adding
a check later means adding one file.

| Detector | Catches |
|---|---|
| `focus.js` | Tab switch, window switch, `Cmd+Tab`, minimise |
| `fullscreen.js` | Leaving fullscreen |
| `keyboard.js` | All keys, via an allowlist, plus the Keyboard Lock API |
| `clipboard.js` | Copy, cut, paste, right-click, drag |
| `devtools.js` | Developer tools, via three independent signals |
| `screen.js` | Screen sharing stopped, wrong share type, second monitor |
| `permissions.js` | Camera / microphone / location revoked mid-exam |
| `network.js` | Connection loss (recorded, never charged) |
| `integrity.js` | Injected extension content, hidden shadow-DOM panels, patched page functions, removed overlay |

The keyboard detector uses an **allowlist**: every key is blocked unless
explicitly permitted. The system it replaced used a blocklist, so anything the
list forgot still worked.

## Browser support

| Browser | Status |
|---|---|
| **Safe Exam Browser** | Windows 3.10+ / macOS 3.6+. See the SEB section below |
| Chrome, Edge, **Brave** | Full support, including keyboard locking |
| Firefox, Safari | Works, but no Keyboard Lock — `Escape` can leave fullscreen; it is detected, recorded, and the student is asked to return |
| Phones and tablets | Blocked with an explanation |

**Keyboard Lock needs HTTPS.** On plain HTTP it fails silently. Serve production
over HTTPS or that protection is quietly absent.

**Brave** is detected explicitly via `navigator.brave.isBrave()`. Its
anti-fingerprinting may withhold `screen.isExtended`; when it does, the second
monitor is recorded as "unknown" rather than treated as an accusation. Brave was
previously the worst-supported browser here because its canvas protections
corrupt the pixel reads face-api.js depended on — removing face recognition
removed that failure mode entirely.

Every detector degrades honestly: a missing API reports "unavailable", never
blocks the student, and never invents a violation.

## Configuring it

**Violations allowed** is the existing "Allowed Tab Switches" field on a test:

- `-1` — unlimited; warn but never cancel
- `0` — cancel on the first violation
- `n` — warn up to `n`, cancel on `n+1`

Violations are weighted (`Backend/services/proctorPolicy.js`). Opening devtools
costs 2 because nobody does it by accident; right-click, blocked keys and network
loss cost 0 and are recorded for context only.

**The access code** lives at **Admin → Proctoring**. One code for the whole
system. It waives camera, microphone and location only — fullscreen, tab
switching, keyboard and clipboard rules stay fully active, screen sharing stays
mandatory, and its use is recorded on the student's submission.

To make screen sharing waivable too, add `"screen"` to `BYPASSABLE_PERMISSIONS`
in `proctorPolicy.js`.

## Safe Exam Browser

Off by default. Switched on system-wide at **Admin → Proctoring**, where the
Browser Exam Keys also live.

### What it changes

SEB is a separate, locked-down browser. It blocks other applications, browser
extensions, `Alt+Tab`, `Print Screen`, virtual machines and additional displays
at the operating-system level, which is where a web page cannot reach.

### Leaving mid-exam

SEB is configured with a **quit password**, so a student cannot press Quit, look
something up, and relaunch. Leaving needs an invigilator, who reads the password
from **Admin → Proctoring**. Submitting normally still closes SEB without any
prompt, because SEB exits on reaching its `quitURL` regardless.

The file students download contains only the password's SHA-256, so opening it
tells them nothing.

What that still does not stop is powering the machine off. That path costs them:
the exam clock is `startedAt + timeLimit` on the server and keeps running, every
guarded route refuses them within `SEB_GRACE_MS` of SEB going quiet, and the gap
is charged as `heartbeat_lost` and shown on the report. They lose time and gain a
violation — but a determined student can still do it, and no web application can
prevent that.

### What it cannot change

SEB exists for **Windows and macOS only. There has never been a Linux build.**
Linux students fall back to the browser-based proctoring above, and their
submission records `proctorSebStatus: "fallback"` so a reviewer can tell the
difference. And a phone on the desk defeats SEB exactly as it defeats everything
else here.

### How a student is verified

SEB's HTTP headers stopped being usable around 2020 — neither WebKit nor Chromium
lets it add headers to cross-origin requests, and this app's API is a different
origin from its frontend. Verification uses SEB's JavaScript API instead, which
hands the page `SHA256(page URL + Config Key)`. The server recomputes that and
compares.

Two details carry the whole design:

1. **Each attempt has its own exam URL.** The hash is a fixed value per URL, so
   without a per-attempt nonce a student could open a classmate's exam address
   inside SEB, read the hash the API reports for it, and hand it over. The nonce
   lives in the `?n=` query string, which is why `ProtectedRoute` and the login
   page preserve the destination across sign-in.

   **The nonce is never in the `.seb` file.** SEB derives the Browser Exam Key
   from its own configuration, so anything student-specific in that file would
   give every student a different key and no key an admin pasted could match. The
   config is byte-identical for everyone and starts at the assignments list; the
   exam page then reloads itself at its nonced address, and SEB recomputes the
   hash on that page load. `npm run test:seb` asserts the config cannot vary.
2. **The proof expires.** SEB re-proves itself on every heartbeat, and
   `resolveProctorStatus` refuses a session whose proof is older than
   `SEB_GRACE_MS`. Verifying only at session start would be bypassable in one
   move: sit the gate in SEB, copy the token and session id into Chrome, and stop
   checking in.

Losing the proof **blocks** the exam and never terminates it — `seb_integrity_lost`
is weight 0. SEB's key API answers asynchronously on older builds and can read
back empty for a moment, and a momentary blank must not end someone's paper. The
block lifts the instant SEB checks in again.

### What runs where

| File | Job |
|---|---|
| `Backend/services/sebVerify.js` | Key verification, launch tokens, platform detection |
| `Backend/services/sebConfig.js` | Generates the `.seb` plist handed to the student |
| `Backend/routes/seb.js` | `POST /api/seb/launch`, `GET /api/seb/config/:id.seb` |
| `Frontend/src/proctoring/seb.js` | Reads SEB's JavaScript API |
| `Frontend/src/proctoring/SebLaunchScreen.jsx` | "Start in Safe Exam Browser" |

Under a verified SEB session the policy drops screen sharing, camera, microphone
and the Fullscreen API requirement — SEB supports none of them, and the fullscreen
detector would otherwise raise an overlay the student could never satisfy. The
keyboard allowlist, clipboard rules, focus reporting and tamper detection all stay
on, because only the page knows a textarea from a radio button.

### Keys — there is nothing to configure

Verification uses SEB's **Config Key**, which is derived from the settings in the
config file. Since this server writes that file, it derives the same key itself.
One value, identical on Windows and macOS and across SEB releases.

The alternative, SEB's Browser Exam Key, also hashes SEB's own binary — so it
differs per platform and per release, and can only be read out of SEB's
Configuration Tool by hand. That means owning a machine of each kind and redoing
it at every SEB update. Not worth it when the Config Key is free.

The canonical serialisation is exact and unforgiving. `services/sebConfig.js`
implements it, `npm run test:seb` asserts each rule separately — sorted
case-insensitively, no whitespace, and **no character escaping**, which is where
`JSON.stringify` would silently produce the wrong hash.

```bash
cd Backend && npm run test:seb
```

## Reviewing an attempt

`Frontend/src/components/ProctoringReport.jsx` shows the violation record on the
completed-test view: a clean pass, or a timeline with each violation, its time,
and whether it counted. Violations were recorded on every submission long before
this rebuild and were never displayed anywhere.

## After deploying

Run once, to clear the biometric data left by the removed face recognition:

```bash
cd Backend && node scripts/dropFaceDescriptors.js
```

Profile photos are left untouched.
