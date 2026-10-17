/**
 * Answers the server has not confirmed yet, kept in this browser.
 *
 * Autosave failures used to be logged to the console and nothing else. The page
 * kept showing every answer as "answered", the student kept working, and the
 * first sign anything was wrong was a blank paper after signing back in --
 * because the only copy of everything since the failure had been the page's
 * memory, and signing in again reloads the page.
 *
 * Every answer is written here the moment it changes and removed once the
 * server has stored that exact value. So at any time this holds precisely the
 * answers that would be lost if the page went away now. The exam pages:
 *
 *  - show the student when something is waiting, and keep retrying it;
 *  - on loading an attempt, put these back over the server's copy and send
 *    them again -- they are newer than anything the server has.
 *
 * Entries are per student and per attempt, and are cleared once the paper is
 * handed in. Storage failing (private mode, full, blocked) just means no
 * backup: the pages behave exactly as before.
 *
 * No imports on purpose, so scripts/unsaved-answers-scenarios.mjs can load
 * this under plain Node with a stand-in localStorage.
 */

const PREFIX = "exampro_unsaved";

function storage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function keyFor(userId, assignmentId) {
  return userId && assignmentId ? `${PREFIX}:${userId}:${assignmentId}` : null;
}

function read(key) {
  const store = storage();
  if (!store || !key) return {};
  try {
    const parsed = JSON.parse(store.getItem(key) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function write(key, entries) {
  const store = storage();
  if (!store || !key) return;
  try {
    if (Object.keys(entries).length === 0) store.removeItem(key);
    else store.setItem(key, JSON.stringify(entries));
  } catch {
    // Full or blocked: no local backup, nothing else changes.
  }
}

/** The fields that make up an answer, normalised so equal answers compare equal. */
function normalise(answer) {
  return {
    selectedOption: answer?.selectedOption ?? null,
    textAnswer: answer?.textAnswer ?? null,
    language: answer?.language ?? null,
  };
}

function sameAnswer(a, b) {
  const x = normalise(a);
  const y = normalise(b);
  return x.selectedOption === y.selectedOption && x.textAnswer === y.textAnswer && x.language === y.language;
}

/** This answer has changed and the server does not have it yet. */
export function recordPending(userId, assignmentId, questionId, answer) {
  const key = keyFor(userId, assignmentId);
  if (!key || !questionId) return;
  const entries = read(key);
  entries[questionId] = { ...normalise(answer), at: Date.now() };
  write(key, entries);
}

/**
 * The server stored this answer. Removed only if it is still the latest one --
 * a save that lands after the student has typed more must not drop the newer
 * text from the backup.
 */
export function recordSaved(userId, assignmentId, questionId, answer) {
  const key = keyFor(userId, assignmentId);
  if (!key || !questionId) return;
  const entries = read(key);
  if (entries[questionId] && sameAnswer(entries[questionId], answer)) {
    delete entries[questionId];
    write(key, entries);
  }
}

/** Every answer still waiting for the server: `{ questionId: answer }`. */
export function pendingAnswers(userId, assignmentId) {
  const entries = read(keyFor(userId, assignmentId));
  const result = {};
  for (const [questionId, entry] of Object.entries(entries)) {
    if (entry && typeof entry === "object") result[questionId] = normalise(entry);
  }
  return result;
}

/** The paper was handed in: nothing is waiting any more. */
export function clearPending(userId, assignmentId) {
  write(keyFor(userId, assignmentId), {});
}
