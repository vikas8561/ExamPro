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
 */

export function createClipboardDetector({ report, isPaused, blockContextMenu = true }) {
  let running = false;

  const active = () => running && !isPaused?.();

  const isAnswerField = (target) =>
    Boolean(
      target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable ||
          (typeof target.closest === "function" && target.closest(".monaco-editor")))
    );

  const handleCopy = (event) => {
    if (!active()) return;
    event.preventDefault();
    report("copy_attempt", "Tried to copy content during the exam");
  };

  const handleCut = (event) => {
    if (!active()) return;
    event.preventDefault();
    report("copy_attempt", "Tried to cut content during the exam");
  };

  const handlePaste = (event) => {
    if (!active()) return;
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
      document.addEventListener("paste", handlePaste, true);
      document.addEventListener("contextmenu", handleContextMenu, true);
      document.addEventListener("dragstart", handleDragStart, true);
      document.addEventListener("drop", handleDrop, true);
      document.addEventListener("selectstart", handleSelectStart, true);
    },

    stop() {
      running = false;
      document.removeEventListener("copy", handleCopy, true);
      document.removeEventListener("cut", handleCut, true);
      document.removeEventListener("paste", handlePaste, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      document.removeEventListener("dragstart", handleDragStart, true);
      document.removeEventListener("drop", handleDrop, true);
      document.removeEventListener("selectstart", handleSelectStart, true);
    },
  };
}
