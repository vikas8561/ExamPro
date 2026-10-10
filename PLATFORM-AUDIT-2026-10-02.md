# ExamPro platform audit — 2026-10-02

I read the whole backend (server, middleware, every route, every service, the models), checked the frontend's exam pages, routing and API client, and ran ESLint and `npm audit` on both packages.

**How these were checked:** every finding comes from reading the code and tracing the request path. None of them were reproduced against a running server. The critical ones are clear-cut in the code (for example, an ownership check that is commented out), but each one should get a regression test when it's fixed.

Severity:
- **Critical:** a student can cheat, sabotage someone else, or lose marks in a normal exam.
- **High:** serious integrity, privacy or correctness gap.
- **Medium:** a real bug or weakness, but limited in reach.
- **Low:** cleanup or hygiene.

---

## 1. Critical

### C1. Any student can submit and finalise another student's exam

> **FIXED 2026-10-02.** Ownership is now enforced on every write and read path:
> - Submit, autosave and `/coding/submit` refuse anyone who doesn't own the assignment. That includes admins and mentors; `/coding/run` stays open to them.
> - The proctor guard now fails closed on `not_owner`.
> - `GET /assignments/:id` reads the owner before `attach()`.
> - `check-expiration` checks ownership.
>
> Regression test: `npm run test:ownership` (also part of `test:security`). It passes 42/42 on the fixed code and fails 27/42 on the old code. The full suite passed: 542/542.
- **Where:** `Backend/routes/testSubmissions.js:136-142`, and `Backend/middleware/proctorSession.js:68-71`.
- **Problem:** The ownership check is a no-op. The code literally says "We'll allow the submission". The proctor guard returns `required:false, ok:true` for `not_owner`, so it doesn't block either.
- **Impact:** Student A can POST `/api/test-submissions` with student B's `assignmentId` while B's attempt is "In Progress". This:
  - marks B's assignment **Completed**;
  - sets B's `autoScore` from A's answers;
  - closes B's exam mid-sitting.
- **Why it's easy:** Cohort assignments are created with `insertMany`, so their ObjectIds are close to sequential. A student can guess classmates' assignment ids from their own.
- **Fix:** return 403 when `assignment.userId !== req.user.userId`. Make `resolveProctorStatus` fail closed on `not_owner`.

### C2. The exam timer shows the wrong time whenever duration > time limit

> **FIXED 2026-10-02.** What changed:
> - **Server:** `/start` (both branches), `GET /assignments/:id` and `check-expiration` now send `attemptEndsAt` and `serverNow` (`attemptClock` in `services/attemptWindow.js`). That's the same rule the submit route and the sweep use. `check-expiration` also now fires at the time limit, not just at the window's end.
> - **Both exam pages** count down to that instant using the server's clock (`Frontend/src/utils/examClock.js`). This also fixes background-tab drift and wrong laptop clocks.
> - **Deploy order:** if the frontend ships first, it falls back to the same rule.
>
> Tests:
> - `npm run test:clock` in Backend: 23/23 on the fixed code; fails 10/23 on the old code (/start returned 118:59 for a 30-minute test).
> - `npm run test:clock` in Frontend: 21/21.
> - Full backend suite: 565/565. Frontend proctoring: 150/150 (one stale clipboard assertion from 05911eb updated).
- **Where:** `Frontend/src/pages/TakeTest.jsx:471-476` and `:514-519`, `Frontend/src/pages/TakeCodingTest.jsx:371-376` and `:425-430`, plus `POST /assignments/:id/start` (`Backend/routes/assignments.js:975-978`, `:1112-1116`).
- **Problem:** The countdown is computed as `startTime + duration − now`, which is the availability window. The server ends the attempt at the **earlier** of the window and `startedAt + timeLimit` (`Backend/services/attemptWindow.js:56`).
- **Impact:** The admin assign form accepts any duration ≥ time limit. Example: window 120 min, test 60 min. The student sees 120 minutes, but:
  - at 60 min the server rejects their submit ("Test time has expired");
  - about 5 minutes later the sweep finalises the attempt from autosaved answers.

  The student loses the second half of their work and gets a confusing error.
- **Fix:** have the server return `attemptEndsAt` and drive both timers from it.

### C3. Students can fetch the question paper before the exam starts

> **FIXED 2026-10-02.** One rule (`hasAttemptOpened` in `services/attemptWindow.js`) now applies on every route that can hand a student the paper:
> - opening a proctoring session;
> - `POST /assignments/:id/start` (both branches);
> - `GET /assignments/:id` (still answers, but with the paper withheld);
> - `GET /tests/:id` (even when a live session exists);
> - `/coding/run` and `/coding/submit`;
> - the results route `GET /test-submissions/assignment/:id`, which needed no session at all and leaked the paper both before and during the exam. A student now gets the paper there only once the attempt is over.
>
> The exam page shows a clear "This test has not started yet" screen.
>
> Tests:
> - `npm run test:paper` (part of `test:security`): 41/41 on the fixed code; fails 24/41 on the old code (full paper leaked 2h early through 4 routes, and a coding answer was graded before start).
> - Full backend suite: 606/606. Frontend proctoring 150/150; build OK.
- **Where:**
  - `POST /api/proctor/session/start` (`Backend/routes/proctor.js:262`) never checks `startTime`, and only rejects Completed and Cancelled.
  - `GET /api/assignments/:id` (`Backend/routes/assignments.js:715`) and `GET /api/tests/:id` (`Backend/routes/tests.js:221`) then serve questions to anyone with an active session.
- **Impact:** A student can open a session days early and download the full paper.

  When SEB is required, they also need C5 (spoofed user agent) to get in. When SEB is off, nothing stops them.
- **Fix:** refuse to start a session, and refuse to serve questions, before `startTime`, after the attempt has ended, or when the status isn't Assigned or In Progress.

### C4. Coding answers can still be submitted and re-graded after the exam ends

> **FIXED 2026-10-02.** `/coding/run` and `/coding/submit` now require all three of: attempt **In Progress**, time not run out (5s slack), and a live proctoring session. The session check uses the same rules and refusals as autosave (terminated, ended and stale-SEB sessions are refused), and is asked of the resolved assignment, so naming a `testId` instead of an `assignmentId` doesn't skip it. Reviewers can still Run for review.
>
> A grade that was submitted in time but finishes judging after the page auto-submits is kept, and `Assignment.autoScore` is synced to it (`syncFinalisedScore`).
>
> The frontend now keeps the server's message and `code` on 403s (it used to show only "Access forbidden").
>
> Tests:
> - `npm run test:codewindow` (part of `test:mixed`): 32/32 on the fixed code; fails 19/32 on the old code, which raised a handed-in score from 3 to 5.
> - Full backend suite: 638/638. Frontend proctoring 150/150; build OK.
>
> **Related, fixed after Vikas's decisions (2026-10-02):** a coding answer already graded by Judge0 now keeps its grade at hand-in whatever the editor holds, including blank. It is stored with the code that earned it; the editor's contents at hand-in are kept as `draftAnswer` (the rule autosave already followed), and the hidden-case pass count is kept. The expiry sweep follows the same rule. The review page labels the graded code, shows "passed X of Y" once results are released, and shows the final draft marked "not graded".
>
> Tests: `npm run test:blank-coding` (35/35; fails 30/35 on the old code) plus end-to-end cases in `test:codewindow`. Full suite: 687/687.
- **Where:** `POST /api/coding/submit` (`Backend/routes/coding.js:364`) and `persistCodingResponse` (`Backend/services/codingSubmission.js:47`).
- **Problem:** There is no status check, no time check and no proctor-session check.
- **Impact:** After an exam is Completed, even days later, a student can keep submitting better code. Best-wins grading raises the stored `TestSubmission.totalScore`, which is what the results pages show.
  - `/coding/run` also works with no proctoring.
  - A mentor or admin calling `/coding/submit` against a student's assignment writes into that student's score.
- **Fix:**
  - Require `status === "In Progress"`, `!isAttemptExpired`, and a live proctor session (same as `/api/answers`).
  - Don't persist when the caller isn't the owner.

### C5. Safe Exam Browser can be bypassed by spoofing the user agent
- **Where:** `Backend/services/sebVerify.js:212-231` and `Backend/routes/proctor.js:199-201`.
- **Problem:** If the `User-Agent` doesn't contain "Windows" or "Mac", the server records `fallbackReason: "os_unsupported"`, and `sebFailureReason` then lets the session through with no SEB. The user agent is entirely client-controlled (a UA-switcher extension is enough).
- **Fix:** don't fall back automatically. Make an unsupported OS need an admin or invigilator override (for example the bypass OTP), and flag it prominently in the report.

### C6. MCQ answers containing `<` are autosaved wrong, then lost on refresh or graded wrong

> **FIXED 2026-10-02.** What changed:
> - **Autosave** sends the option text exactly as written. The `innerHTML` stripping is gone, which also closes the script-injection hole; a real browser confirmed the old code ran an `<img onerror>` in option text.
> - **Old stripped answers** (from attempts running when the fix ships, or already finalised by the sweep) are recognised and mapped back to their option, but only when exactly one option fits. An exact match always wins.
>   - On the exam page, via `Frontend/src/utils/mcqOption.js`, so reload restores the choice.
>   - On the server, via `Backend/services/legacyMcqText.js`, used by `markMcq`, which covers hand-in, the sweep and re-grade.
> - **Both helpers** reproduce the old stripping exactly; they match 41/41 cases captured from a real browser (`Backend/scripts/exam/fixtures/legacy-mcq-strip.json`).
>
> Tests:
> - `npm run test:mcq-text` in Backend: 18/18 on the fixed code. On the original code it fails 4/18: an all-correct student scored 1/4, and re-grading didn't repair it.
> - `npm run test:mcq-options` in Frontend: 12/12; the original page fails 3/12.
> - Full backend suite: 718/718. Frontend proctoring and clock tests pass; build OK.
>
> **Not recoverable:** an old answer where two options stripped to the same text (e.g. `vector<int>` vs `vector<char>`) stays as saved and is marked wrong. Already-finalised papers are only repaired when the test is re-graded (on edit), and `Assignment.autoScore` isn't updated by re-grade (see the medium item).
- **Where:** `Frontend/src/pages/TakeTest.jsx:718-727`.
- **Problem:** Before autosaving, option text is pushed through `innerHTML` to "strip HTML". Options like `vector<int>`, `#include <stdio.h>` or `x<y` become `vector`, `#include `, `x`.
  - **On refresh:** restore matches by exact text (`:584`), so the student's choice silently disappears.
  - **If the sweep finalises the attempt:** it grades the stripped text against `question.answer`, so the answer is marked **wrong**.
  - Only a successful final submit from the browser (which sends the raw text) grades correctly.
- **Also a security issue:** `innerHTML` on a detached div still runs `<img onerror>`, so a test author can inject script into students' browsers. The login token is in `localStorage`, so that script can steal it.
- **Fix:** remove the stripping. Send `question.options[i].text` exactly as it is, or better, send the option index.

---

## 2. High

### H1. Theory questions can never be graded
- **Problem:**
  - Submit and the sweep both set `mentorReviewed: true` and `reviewStatus: "Reviewed"` (`Backend/routes/testSubmissions.js:188-190`, `Backend/services/expiredAttempts.js:92-93`).
  - So `/mentor/submissions/pending` (filters `mentorReviewed:false`) is always empty for finished papers.
  - No frontend page calls either review endpoint (`PUT /test-submissions/:id/review`, `PUT /mentor/submissions/:id/review`).
  - There is no per-question marking API at all.
- **Impact:** CreateTest still offers "Theory Only" (`Frontend/src/pages/CreateTest.jsx:828`). Every theory answer scores 0, shown as "Reviewed".
- **Fix:** add per-question manual marking, and stop auto-marking theory papers as reviewed.

### H2. Answers can keep being saved after time runs out

> **FIXED 2026-10-02.**
> - **Autosave** (`routes/answers.js`) now requires status In Progress and time remaining (5s slack), on top of the proctor session and ownership (C1).
> - **Readers that fetch one attempt's submission** read only the owner's row: mentor monitor, re-enable (both the list and the action), and the mentor-fast list.
> - **Rows written by non-owners before C1** may still exist in production. `npm run audit-foreign-submissions` reports them read-only; `-- --apply` moves them into `testsubmissions_foreign_quarantine` before removing them. Until that's run, test-wide stats, the results download and mentor lists can still count them.
>
> Tests: `npm run test:answer-window` (in `test:exam`): 27/27 on the fixed code; fails 9/27 on the old code, where answers changed 2 minutes after time ended were graded 2/2 instead of 0. Full suite: 745/745.
- **Where:** `POST /api/answers` (`Backend/routes/answers.js:20`).
- **Problem:** The only gate is an active proctor session. The session stays active after expiry until the sweep runs, which is 5 minutes of grace plus up to 60 seconds. There is no status or time check.
- **Impact:** A student can keep answering after the clock ends, and the sweep grades those answers.
- **Also:** a non-owner gets a junk `TestSubmission` row created on someone else's `assignmentId` (`Backend/routes/answers.js:44-65`). Several readers look submissions up by `assignmentId` alone and can pick that row up: `Backend/routes/mentor.js:569`, `Backend/routes/mentorAssignmentsFast.js:47`, `Backend/services/reEnable.js:211`.

### H3. The browser's `autoSubmit` flag buys 5 extra minutes

> **FIXED 2026-10-02.** Within 5 seconds of the end, a hand-in is taken as sent. Past that, only an auto-submit inside the grace window is accepted, and it is graded from the answers the server saved in time, never from the request. The attempt still finishes immediately and gets exactly the mark the sweep would give. The response says `answersFrom: "saved"`. Late manual hand-ins and anything past the grace window are still refused.
>
> Tests: `npm run test:late-autosubmit` (in `test:exam`): 15/15 on the fixed code; fails 9/15 on the old code, where answers changed 2 minutes after time scored 2/2 instead of 0. Full suite: 760/760.
- **Where:** `Backend/routes/testSubmissions.js:106`.
- **Problem:** `autoSubmit: true` comes from the client and widens the late-submit grace from 5 seconds to 5 minutes.
- **Impact:** Any student can submit edited answers up to 5 minutes after time ends.

### H4. Results and correctness leak before results are released

> **FIXED 2026-10-02.** Vikas's decisions: the score is hidden until release, and release happens at the student's **own** deadline. A single rule (`areResultsReleased` in `services/attemptWindow.js`, window end + 5s) now governs every student-facing view:
> - The hand-in reply is a receipt (with `resultsReleased` / `resultsAt`), and the autosave reply is a bare acknowledgement.
> - Answer read-back never carries marks.
> - The results list withholds the score until release and never sends per-question responses.
> - Assignment cards and the dashboard average withhold scores until release; the average counts only released results.
> - `GET /assignments/:id` and `/start` withhold the assignment's score fields.
> - The results page uses the shared rule.
> - The frontend Results page follows the server's `resultsReleased` flag.
>
> Tests: `npm run test:results-release` (in `test:security`): 22/22 on the fixed code; fails 16/22 on the old code. Seven existing scripts now read scores from the database instead of the hand-in reply. Full suite: 783/783.
>
> Not changed, by decision: cohorts sitting the same test at different times still see results at their own deadline, so an early cohort can pass on the answer key.
- **Problem:**
  - The submit response returns the whole graded submission, with per-question `isCorrect`, `points` and `totalScore` (`Backend/routes/testSubmissions.js:336-341`).
  - `GET /api/answers/assignment/:id` returns the same afterwards (`Backend/routes/answers.js:134`).
- **Impact:** A student who finishes early learns which answers were right while classmates are still sitting. The "results after deadline" rule is only cosmetic.
- **A related integrity gap:** once *their own* deadline passes, a student sees the full answer key. If the same test is assigned to cohorts at different times, the early cohort can pass answers to the later one.

### H5. Hidden test cases can reach students

> **FIXED 2026-10-02.** What changed:
> - **Shared helper:** `reviewQuestion()` (`services/questionSanitizer.js`) keeps the answer key and model answer for a student's review, never hidden test cases, and adds their count.
> - **Results route:** both branches (with and without a submission) use it, plus a backstop that strips hidden cases from any reply this route sends a non-reviewer.
> - **Practice paper:** `GET /practice-tests/:testId` now uses the shared sanitizer; it used to remove only `answer`.
>
> Tests: `npm run test:hidden-cases` (in `test:security`): 12/12 on the fixed code; fails 3/12 on the old code (all four hidden cases leaked through results, plus hidden cases and the model answer through practice). Full suite: 795/795.
- **Where:** `GET /test-submissions/assignment/:id`, branch where there is no submission and results are shown (`Backend/routes/testSubmissions.js:710-724`).
- **Problem:** That branch sends `question.toObject()` unfiltered, so `hiddenTestCases` and `expectedAnswer` go out. This happens for Completed assignments with no submission row (51 such rows exist, according to the comment at `Backend/routes/assignments.js:322`).

### H6. SEB proof can be forged from an ordinary browser
- **Problem:** Verification is `SHA-256(examUrl + ConfigKey)`.
  - The Config Key is derived from the `.seb` file every student can download.
  - The exam URL is given to the student (`/api/seb/exam-url`).
  - The code says as much at `Backend/routes/proctor.js:172-177`.
- **Impact:** A technically capable student can compute the hash in a normal browser and send it with every heartbeat.
- **Fix:** consider the Browser Exam Key (it includes the SEB binary), or a per-attempt secret delivered only inside SEB.

### H7. Proctoring is self-reported and can be reset

> **FIXED 2026-10-02 (the reset half).**
> - `POST /proctor/session/end` is refused (409) while the attempt is running; it works after hand-in or once time is up.
> - Every away-gap beyond the 20s heartbeat grace is written to the violation log at **weight 0**: recorded for the reviewer, never counted (Vikas's decision). That covers a closed-and-reopened tab, a new session after an earlier one stopped, and a page that stayed open but went silent.
> - The audit's assumption that a silent page was "charged once for the gap" was wrong. It was neither charged nor recorded; it is now recorded.
>
> Tests: `npm run test:proctor-gap` (in `test:security`): 15/15 on the fixed code; fails 8/15 on the old code. The C4 coding test now sets an ended session directly. Full suite: 810/810.
>
> **Not fixable here:** browser proctoring is self-reported, so a modified page can simply not report violations. Only SEB (C5/H6) changes that. Gaps are also never charged by decision, so "close the tab, look things up, reopen" now leaves a dated record but doesn't cost a violation.
- **Problem:**
  - Violations are only counted if the page sends them (`/session/event`). A patched client that sends heartbeats and no events gets zero violations. This is a limit of browser proctoring; only SEB really fixes it.
  - `POST /session/end` (`Backend/routes/proctor.js:735`) lets a student end their own session at any time without submitting. A new `/session/start` then opens a fresh session with no `heartbeat_lost` charge for the gap.
- **Fix:** only end sessions via submit.

### H8. Production secret is in public git history
- **Problem:**
  - `github.com/vikas8561/ExamPro` is public (the API returns 200 unauthenticated).
  - `Backend/.env` was committed in `7b4cb1e`…`6b48f41` and removed in `a5cac30`.
  - The **current** `MONGODB_URI` is byte-identical to the one in history (compared by hash; not printed).
  - SMTP password, Gemini key and Redis URL from that history should be treated as leaked too.
- **Fix:** rotate the Atlas user/password (and the SMTP and Gemini secrets) **now**. Optionally purge history with `git filter-repo` and make the repo private.

### H9. Any student can lock a classmate out right before an exam
- **Where:** `Backend/routes/auth.js:49-59` and `Backend/services/loginLockout.js`.
- **Problem:** Three wrong passwords against someone else's roll number locks that student out for 30 minutes. Roll numbers are predictable.
- **Impact:** A 3-request attack can block someone from an exam. Unblock exists, but needs an admin or mentor to notice.
- **Fix:**
  - Key the lockout by identifier + IP, or use progressive delay instead of a hard lock.
  - Show a "locked" badge in the invigilator view.

### H10. Shared default password `123456` with no way to change it
- **Where:** `Backend/routes/users.js:38`.
- **Problem:**
  - A reset sets the student's university password to `123456`.
  - There is no change-password endpoint or page anywhere in ExamPro.
  - The response message tells the student to change it, but they can only do that in the university system.
- **Impact:**
  - Every reset account stays `123456` until someone acts, and classmates know that.
  - Because the write is to the university DB, it also opens their attendance account.
  - Mentors can trigger it (by design), which also lets a mentor sign in as the student.
- **Fix:** add a forced change-password flow on first login after a reset, or generate a random one-time password.

---

## 3. Medium

### Backend correctness
- **Practice tests lose their practice flag on any edit that omits `type`.** In `PUT /api/tests/:id`, the `else` branch (`Backend/routes/tests.js:584-588`) sets `isPracticeTest=false` and clears `practiceTestSettings` when `type` is missing. A status-only update (Archive) quietly turns a practice test into a proctored exam.
- **Test list shows blank "created by".** `GET /api/tests` does `$lookup` from the legacy `users` collection (`Backend/routes/tests.js:138-156`). Admins and mentors now live in `admins` and `mentors`, so the author is blank for every new test.
- **Test list is slow.** The same endpoint looks up *all* submissions for *every* matching test before paginating (`:98-134`).
- **Student dashboard breaks after a test is deleted.** `GET /assignments/student/recent-activity` crashes on `test.testId.title` when the test is gone (`Backend/routes/assignments.js:619-647`).
- **Two scoring rules disagree.**
  - The rule is now "a coding question is worth its `points`" (`Backend/services/grading.js:37`).
  - But the dashboard `maxMarks` aggregation still sums hidden-case marks (`Backend/routes/assignments.js:327-362`).
  - The sanitizer still tells students `totalMarks` = the sum of hidden marks (`Backend/services/questionSanitizer.js:44`).
  - So dashboard percentages and the marks shown to students are wrong for coding questions.
- **Re-grade after a test edit leaves stale and slow data.** `recalculateScoresForTest` doesn't update `Assignment.autoScore`, and it saves every submission one by one inside the HTTP request (`Backend/services/scoreCalculation.js`).
- **Expired attempts can go unfinalised during big exams.** The sweep reads the first 200 "In Progress" rows with no expiry filter and no sort (`Backend/services/expiredAttempts.js:132`). With more than 200 live attempts, expired ones further along can starve. The query should filter on `deadline < now − grace`.
- **A 0 mark can't be given.** Both review routes reject `mentorScore` 0 (`!mentorScore`) (`Backend/routes/testSubmissions.js:770`, `Backend/routes/mentor.js:666`).
- **`/test-submissions/stats/:testId` is broken** (`Backend/routes/testSubmissions.js:869-877`):
  - It uses `mentorScore` (null) because every submission is `mentorReviewed`, so all scores count as 0.
  - A score of 100 writes to `scoreDistribution[10]`, which is out of range (NaN).
- **Mentors can set any status on an assignment.** `PUT /mentor/assignments/:id/review` writes `status` with no validation (`Backend/routes/mentor.js:599-617`). `findByIdAndUpdate` skips enum validators.
- **Mentors can credit tests to another mentor.** `assign-cohort` and `assign-manual` accept any `mentorId` from the request (`Backend/routes/assignments.js:1323`, `:1496`).
- **Renaming a subject breaks access to its tests.** Tests store the subject *name*, so mentors lose access and filters break. `PUT /api/subjects/:id` doesn't cascade.
- **Deleting a test erases all student results immediately.** It hard-deletes every assignment and submission, with no soft-delete or archive. Proctor sessions and screenshots are left orphaned (`Backend/routes/tests.js:619-651`).
- **Practice history is silently deleted after 30 days.** A `setInterval` inside the route module does this (`Backend/routes/practiceTests.js:20`). The setting `allowMultipleAttempts` is also fiction: each save overwrites the single attempt.
- **Small leak.** `GET /assignments/check-expiration/:id` has no ownership check.

### Privacy and access
- **Any mentor can see any student's proctoring screenshots.** `/proctor/screenshots/:assignmentId` and `/screenshots/image/:id` aren't scoped by batch or subject (`Backend/routes/proctor.js:907-982`).
- **Mentors can read the SEB quit password.** `GET /proctor/settings/seb` allows mentors (`Backend/routes/proctor.js:1051-1054`), although the comment says "Admin only".
- **The bypass OTP is weak.**
  - It's one global code that never auto-rotates.
  - It's generated with `Math.random` (`Backend/models/ProctorSetting.js:92`).
  - The per-session attempt counter resets by ending and restarting the session.
- **Socket.IO has no authentication.** Any client can `join` any user's room and receive their events (`Backend/server.js:395-403`).
- **Proctoring evidence is deleted quickly.** Sessions expire after 48h and screenshots after 72h. That is likely shorter than a misconduct review cycle.

### Server / config
- **CORS is too loose** (`Backend/server.js`):
  - Production allows any origin containing `localhost` (`:122`).
  - The second CORS middleware echoes any `*vercel.app` origin with credentials (`:228`).
  - `app.options("*")` reflects any origin (`:164-170`).
  - There are three overlapping CORS layers.
- **Deploys may run in development mode.** The Dockerfile deliberately doesn't set `NODE_ENV`. If the deploy doesn't either, CORS allows every origin.
- **Passwords can end up in logs.** The global error handler logs `req.body` (`Backend/server.js:427-434`). A login that hits a DB outage logs the plaintext password, and any error logs exam answers.
- **`helmet` is installed but never used.** There are no security headers.
- **Heavy hot-path logging.**
  - `Backend/routes/answers.js:25` logs every autosave's answer text.
  - Submit logs about 6 lines per call.
  - `Backend/routes/tests.js:316`, `:421` log the full test, answers included.
  - `/assignments/:id/start` logs timing blobs.

  At 500 students this is a lot of I/O and puts answers in the logs.
- **Single-instance only.** Lockout, the session cache, the SEB config cache and the Judge0 concurrency limiter are all in-process state. Scaling to more than one instance breaks unblock and makes limits per-instance.

### Performance (500-student exam)
- **Student login scans the university collection.** It uses a case-insensitive regex `$or` on UID/rollno (`Backend/routes/auth.js:86-89`), which can't use an index cleanly, and `autoIndex` is off there.
- **Users directory loads everyone on every page.** `GET /api/users/profiles` loads the *entire* directory (every university student) per page, then slices (`Backend/routes/users.js:250`).
- **Mentor pages recompute scope every request.** `getMentorScope` loads every student id in the mentor's batches plus every matching assignment on each request (`Backend/routes/mentor.js:56-205`).
- **Admin assignment list is unpaginated.** `GET /api/assignments` loads all assignments.
- **Judge0 throughput is low.** It's 8 concurrent requests per process against one private judge, with a 90s poll timeout. A burst of simultaneous coding submits will queue.
- **Fake GC calls.** `global.gc` "cleanup" every 5 minutes does nothing without `--expose-gc` (`Backend/server.js:59-85`).

### Frontend
- **Token stored in `localStorage`.** Any XSS (C6 is one) takes over the account for 24h.
- **Students can't reach DSA Practice.** `StudentDSAPractice.jsx` isn't routed in `App.jsx`, even though admins manage DSA questions.
- **Review queue page is dead and broken.** `Reviews.jsx` calls `/reviews` without an auth header (it would always 401) and isn't routed.

---

## 4. Low / hygiene

- **Unescaped regex search.** `GET /api/tests` passes the search to `$regex` without escaping (`Backend/routes/tests.js:84`). It's for admins and mentors only, and an invalid pattern gives a 500.
- **`/api/answers` is mounted twice** (`Backend/server.js:357`, `:359`).
- **`/api/debug/*` routes are live in production.** They are admin-only.
- **Connection count drifts.** `activeConnections` is decremented on both `error` and `disconnect` (`Backend/server.js:405-416`).
- **Dead endpoints with no UI callers:** `/test-submissions/stats/:testId`, `/api/mentor-fast/*`, `/mentor/monitor/:id`, both review routes, `/practice-tests/cleanup`, `/api/reviews`.
- **Unused backend code and dependencies:** `services/emailService.js`, `models/User.js` (only legacy scripts), `@google/generative-ai`, `redis`, `multer`, `csv-parser`, `cookie-parser`, `list`, `node-fetch`, `@monaco-editor/react` (a frontend package), `helmet` (installed but unused).
- **Unused frontend files:** `pages/Reviews.jsx`, `pages/Assignments.jsx`, `pages/ViewTestResults.jsx`, `pages/StudentDSAPractice.jsx` (see above), `components/StudentTable.jsx`, `components/ProfileSection.jsx`, `components/StudentLayout.jsx`, `hooks/useDebounce.js`.
- **Server packages in the frontend's dependencies:** `socket.io` and `nodemailer`.
- **Committed junk:**
  - `Backend/debug_output.txt` contains a real student email.
  - `Backend/debug_assignments.js`.
  - `Backend/node_modules` (macOS binaries).
  - `Frontend/.env` (`BACKEND_URL`, never read: Vite only exposes `VITE_*`).
  - There is no root `.gitignore`.
- **Proxy default points at a stale host.** `Frontend/vite.config.js` defaults the dev proxy to `cg-test-app.onrender.com`.
- **Small schema/API mismatches:**
  - `Test` language enum has no `go`, but `TestSubmission` mentions it.
  - Practice grading uses `points || 1` while the main grader uses `?? 1`.
  - Mentors with batch `"all"` are handled everywhere, but admins can't assign it.
- **Lint:** ESLint reports **55 errors / 16 warnings**:
  - 35 unused variables;
  - 16 missing hook dependencies, which can cause stale-closure timer and autosave bugs in the exam pages;
  - 3 constant-condition branches, for example `else if (false)` in `Frontend/src/pages/TakeTest.jsx:332`.
- **`npm audit` (production dependencies):**

  | Package | Critical | High | Moderate |
  |---|---|---|---|
  | Frontend | 1 (`tar`) | 11 (`react-router`, `vite`, `socket.io-parser`, `ws`, …) | 2 |
  | Backend | 0 | 10 (`express`/`path-to-regexp`, `jws`, `mongoose`, `multer`, `socket.io-parser`, `ws`, …) | 4 |

---

## 5. Features at a glance

| Feature | Status | Main issues |
|---|---|---|
| Login / sessions | Works | H9 targeted lockout, H10 default password, no change-password, regex scan perf |
| Admin user directory | Works | Loads whole roster per page |
| Test authoring | Works | Practice-flag reset, blank author, regex, logs answers, hard delete |
| Assigning (cohort/manual) | Works | Mentor can set any `mentorId` |
| MCQ exam | **Broken in edge cases** | C1, C2, C3, C6, H2, H3, H4 |
| Theory exam | **Broken** | H1: never graded |
| Coding exam / Judge0 | Works; **integrity gap** | C4, wrong `totalMarks` display, Judge0 throughput |
| Mixed exam | Inherits MCQ + coding issues | — |
| Auto-submit sweep | Works | Starvation above 200 live attempts |
| Proctoring (browser) | Works | H7 self-reported / resettable, screenshot scoping, short evidence TTL |
| Safe Exam Browser | **Bypassable** | C5 UA spoof, H6 forgeable proof, quit password readable by mentors |
| Re-enable | Works | Picks up junk submissions (H2) |
| Results / review | **Partly broken** | H4 leaks, H5 hidden cases, no manual grading UI, stats endpoint wrong |
| Practice tests | Works | 30-day silent deletion, single attempt only |
| DSA practice | **Student page unreachable** | Not routed |
| Real-time (Socket.IO) | Works | Unauthenticated rooms |
| Deployment | Risky | H8 leaked DB credentials, NODE_ENV/CORS, no helmet |

## 6. Suggested fix order

1. **Today:** rotate the MongoDB credentials (H8).
2. **Before the next exam:** C1, C2, C6, C4, C3, H2, H3. These are all small, local changes in the exam flow. After them, run the full `Backend/scripts/exam/` suite against local Mongo.
3. **Next:**
   - SEB hardening (C5, H6);
   - lockout abuse (H9);
   - default-password flow (H10);
   - theory grading (H1);
   - result leaks (H4, H5).
4. **Then:** the medium items, the perf work for 500-student exams, and the cleanup/upgrade pass (`npm audit`, lint, dead code).
