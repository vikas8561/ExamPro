/**
 * Copy, paste and right-click.
 *
 * Blocks the obvious routes for getting a question out of the exam or an answer
 * into it: copy, cut, paste, the context menu, dragging text out, and
 * select-all. Text selection itself is left alone inside answer fields, because
 * a student legitimately needs to select and correct their own writing.
 *
 * Worth being clear about the limit: this stops the clipboard, not the student.
 * Nothing here prevents someone photographing the screen or retyping a question
 * into another device. It raises the effort, which is the honest goal.
 *
 * ── Why paste inside an answer field is treated differently ──
 *
 * A paste used to be charged a violation wherever it happened, on the reasoning
 * that a paste is content arriving from outside the exam. That reasoning is
 * wrong for the one exam type where it matters most. Moving a block of code
 * from one place to another with cut and paste is not smuggling an answer in,
 * it is writing code, and with the default allowance of zero it ended the
 * attempt on the first try.
 *
 * So the clipboard now records what was copied from inside the exam, and a
 * paste is charged only when the text arriving is not something the student
 * copied here. Text is matched by hash rather than by a marker smuggled into
 * the clipboard, because custom clipboard MIME types survive inconsistently
 * across browsers and a marker appended to the text itself would corrupt what
 * the student pastes.
 *
 * The trade-off is deliberate and worth stating: for this to work the copy has
 * to genuinely reach the system clipboard, so a student can now carry their own
 * answer text out of the exam. Question text cannot go with it — it is still
 * unselectable, see handleSelectStart — and the answer is their own writing.
 * Deployments that would rather keep the clipboard shut entirely can set
 * `allowInternalClipboard: false` on the policy and get the old behaviour back.
 */

/** How many recent copies to remember. Bounded so a long exam cannot grow it. */
const PROVENANCE_LIMIT = 50;

/**
 * How many recent selections to remember, for the X11 middle-click paste.
 *
 * Kept in its own store rather than sharing the copy store, because dragging
 * out a selection produces one entry per step and would otherwise evict the
 * genuine copies -- turning a fix for one platform into a false accusation on
 * every other one.
 */
const SELECTION_LIMIT = 20;

/** Selections larger than this are not fingerprinted, to keep typing cheap. */
const MAX_TRACKED_SELECTION = 20000;

/** A set that forgets its oldest entry rather than growing without limit. */
function boundedSet(limit) {
  const entries = new Set();
  return {
    add(value) {
      if (entries.size >= limit) entries.delete(entries.values().next().value);
      entries.add(value);
    },
    has: (value) => entries.has(value),
    clear: () => entries.clear(),
  };
}

/**
 * Line endings differ between what is copied and what comes back.
 *
 * Not a theoretical concern: Monaco writes CRLF to the clipboard on Windows
 * (`getPlainTextToCopy` is called with `forceCRLF = isWindows`) while the model
 * itself holds LF, and Firefox hands back LF for text that was written as CRLF
 * -- a quirk Monaco documents in its own source. Both sides of the comparison
 * are normalised, so the text matches itself whichever way the platform
 * rewrote it in transit.
 */
function normalize(text) {
  return String(text).replace(/\r\n?/g, "\n");
}

/**
 * A short fingerprint of some text.
 *
 * Two independent hashes plus the length, because a collision here would mean a
 * paste from outside going uncharged. Deliberately synchronous: `crypto.subtle`
 * is promise-based and the decision has to be made inside the paste event, while
 * calling preventDefault still means anything.
 */
function hashOf(text) {
  let fnv = 0x811c9dc5;
  let djb = 5381;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    fnv ^= code;
    fnv = Math.imul(fnv, 0x01000193);
    djb = (Math.imul(djb, 33) + code) | 0;
  }
  return `${text.length}:${(fnv >>> 0).toString(36)}:${(djb >>> 0).toString(36)}`;
}

/** The selected text of an input or textarea, read before the cut removes it. */
function selectedTextIn(target) {
  if (!target || typeof target.value !== "string") return "";
  if (typeof target.selectionStart !== "number") return "";
  return target.value.slice(target.selectionStart, target.selectionEnd);
}

export function createClipboardDetector({
  report,
  isPaused,
  blockContextMenu = true,
  allowInternalClipboard = true,
}) {
  let running = false;

  const active = () => running && !isPaused?.();

  // Fingerprints of text copied from inside an answer field, oldest first.
  const copied = boundedSet(PROVENANCE_LIMIT);

  // Fingerprints of text merely SELECTED inside an answer field. Only X11 makes
  // this reachable -- see handleSelectionChanged.
  const selected = boundedSet(SELECTION_LIMIT);

  /**
   * The fingerprints some text could be recognised by.
   *
   * The trimmed variant as well as the exact one: an editor may or may not
   * carry the trailing newline of a whole-line copy, and a paste wrongly
   * charged is the exact failure this whole mechanism exists to prevent.
   * Lenient by design, and the leniency is bounded -- it admits the student's
   * own text with different surrounding whitespace, nothing else.
   */
  const fingerprints = (text) => {
    if (typeof text !== "string") return [];
    const normalized = normalize(text);
    if (!normalized.trim()) return [];
    return [...new Set([normalized, normalized.trim()])].map(hashOf);
  };

  const remember = (store, text) => {
    for (const print of fingerprints(text)) store.add(print);
  };

  const cameFromExam = (text) =>
    fingerprints(text).some((print) => copied.has(print) || selected.has(print));

  const isAnswerField = (target) =>
    Boolean(
      target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable ||
          (typeof target.closest === "function" && target.closest(".monaco-editor")))
    );

  // Copying inside an answer field is the student copying their own writing.
  // It is not counted against them, for two reasons. The question text cannot
  // be selected in the first place (see handleSelectStart), so there is nothing
  // incriminating to copy from there; and copy_attempt costs a violation each
  // time while the default budget is zero, so a single reflexive Ctrl+C would
  // have cancelled the exam. This matters now that the keyboard detector lets
  // Ctrl+C through to the editor rather than swallowing it first.
  //
  // It is also allowed to complete, rather than merely going unreported, so
  // that the text reaches the clipboard and the matching paste can be
  // recognised as the student's own.
  const handleCopy = (event) => {
    if (!active()) return;
    if (allowInternalClipboard && isAnswerField(event.target)) return;
    event.preventDefault();
    if (isAnswerField(event.target)) return;
    report("copy_attempt", "Tried to copy content during the exam");
  };

  const handleCut = (event) => {
    if (!active()) return;
    if (allowInternalClipboard && isAnswerField(event.target)) return;
    event.preventDefault();
    if (isAnswerField(event.target)) return;
    report("copy_attempt", "Tried to cut content during the exam");
  };

  /**
   * Record what an allowed copy or cut actually put on the clipboard.
   *
   * Runs on the bubble phase, unlike everything else here, and that is the
   * whole point: by the time the event has reached the document again, a code
   * editor that handles its own copying has already called `setData`, so the
   * text can be read back. Editors that leave the copy to the browser set
   * nothing, and for those the selection is read directly from the field —
   * still intact at this point, because the cut has not been applied yet.
   */
  const handleCopyCompleted = (event) => {
    if (!active() || !allowInternalClipboard) return;
    if (!isAnswerField(event.target)) return;
    remember(copied, event.clipboardData?.getData("text/plain"));
    remember(copied, selectedTextIn(event.target));
    remember(copied, window.getSelection?.()?.toString());
  };

  /**
   * Track what is selected inside an answer field, for X11's second clipboard.
   *
   * On Linux under X11, selecting text puts it on the PRIMARY selection and a
   * middle click pastes it — no Ctrl+C involved, so nothing the copy handler
   * above would ever have seen. Monaco mirrors the editor's selection into its
   * hidden textarea for screen readers, which means the student's own code
   * really does end up on PRIMARY and really can be middle-clicked back in.
   *
   * Without this the gesture would arrive as a paste of unrecognised text and
   * cancel the exam, and it would do so only on Linux, only under X11, and only
   * for students who use the gesture at all. That is precisely the class of
   * platform-dependent misfire this system has a standing rule against: a
   * heuristic that is wrong on one desktop environment must not be able to end
   * somebody's exam.
   *
   * Cheap on the hot path. Moving the cursor leaves the selection empty and
   * returns before any string is touched, so ordinary typing costs a comparison.
   *
   * Listened for on the capture phase, which is not incidental: browsers
   * disagree about whether `selectionchange` fires at the document or at the
   * form control itself, and the element-targeted one does not bubble. A
   * capture listener on the document sees both, since the capture phase runs
   * from the document down to the target.
   */
  const handleSelectionChanged = () => {
    if (!active() || !allowInternalClipboard) return;
    const target = document.activeElement;
    if (!isAnswerField(target)) return;
    if (typeof target.selectionStart !== "number") return;
    if (target.selectionStart === target.selectionEnd) return;
    if (target.selectionEnd - target.selectionStart > MAX_TRACKED_SELECTION) return;
    remember(selected, selectedTextIn(target));
  };

  // A paste is charged only when the text did not come from inside the exam.
  // Anything the student copied here is theirs to move around; anything else is
  // content arriving from outside, which is the one thing here actually worth a
  // mentor's attention, so it stays blocked and on the record.
  //
  // Both outcomes are reported. An internal paste is weight 0 on the server —
  // recorded for the reviewer, never charged — so a paper that was assembled by
  // pasting still shows the reviewer that it was.
  const handlePaste = (event) => {
    if (!active()) return;

    const pasted = event.clipboardData?.getData("text/plain") || "";

    if (allowInternalClipboard && isAnswerField(event.target) && cameFromExam(pasted)) {
      report("paste_internal", "Pasted text copied from inside the exam");
      return;
    }

    event.preventDefault();
    report("paste_attempt", "Tried to paste content into the exam");
  };

  const handleContextMenu = (event) => {
    if (!active() || !blockContextMenu) return;
    event.preventDefault();
    report("context_menu", "Opened the right-click menu");
  };

  const handleDragStart = (event) => {
    if (!active()) return;
    event.preventDefault();
  };

  const handleDrop = (event) => {
    if (!active()) return;
    event.preventDefault();
  };

  // Selecting the question text is the first step in copying it, so it is
  // blocked everywhere except where the student writes their own answer.
  const handleSelectStart = (event) => {
    if (!active()) return;
    if (isAnswerField(event.target)) return;
    event.preventDefault();
  };

  return {
    name: "clipboard",

    start() {
      running = true;
      document.addEventListener("copy", handleCopy, true);
      document.addEventListener("cut", handleCut, true);
      document.addEventListener("copy", handleCopyCompleted, false);
      document.addEventListener("cut", handleCopyCompleted, false);
      document.addEventListener("selectionchange", handleSelectionChanged, true);
      document.addEventListener("select", handleSelectionChanged, true);
      document.addEventListener("paste", handlePaste, true);
      document.addEventListener("contextmenu", handleContextMenu, true);
      document.addEventListener("dragstart", handleDragStart, true);
      document.addEventListener("drop", handleDrop, true);
      document.addEventListener("selectstart", handleSelectStart, true);
    },

    stop() {
      running = false;
      copied.clear();
      selected.clear();
      document.removeEventListener("copy", handleCopy, true);
      document.removeEventListener("cut", handleCut, true);
      document.removeEventListener("copy", handleCopyCompleted, false);
      document.removeEventListener("cut", handleCopyCompleted, false);
      document.removeEventListener("selectionchange", handleSelectionChanged, true);
      document.removeEventListener("select", handleSelectionChanged, true);
      document.removeEventListener("paste", handlePaste, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      document.removeEventListener("dragstart", handleDragStart, true);
      document.removeEventListener("drop", handleDrop, true);
      document.removeEventListener("selectstart", handleSelectStart, true);
    },
  };
}
