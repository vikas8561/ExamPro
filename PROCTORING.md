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

Only a native lockdown application (Safe Exam Browser, or a custom kiosk app) can
close those gaps. That was considered and deliberately not built. The system
compensates by catching the consequence: you cannot alt-tab away without the exam
noticing you left and recording it.

**Do not describe this system as making cheating impossible.** It makes cheating
cost more than it is worth, which is the honest and achievable goal.

## Privacy

**No video, audio, screenshots or screen recordings are captured or stored at any
point.** There is no face recognition anywhere in the system — it was removed
entirely, including the stored face descriptors.

Camera, microphone and location are a permission gate: they are requested, the
grant is recorded as plain text, and access is held open only so that revoking it
mid-exam can be noticed. Nothing is read through them. Screen sharing works the
same way: it verifies the student shared their whole screen rather than a single
tab, and notices if they stop, but no frame is ever read.

The only thing stored is a text list of violations — timestamp, type, and a short
description — saved on the submission. Working session records clear themselves
after two days.

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
| `integrity.js` | Injected extension content, removed overlay |

The keyboard detector uses an **allowlist**: every key is blocked unless
explicitly permitted. The system it replaced used a blocklist, so anything the
list forgot still worked.

## Browser support

| Browser | Status |
|---|---|
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
