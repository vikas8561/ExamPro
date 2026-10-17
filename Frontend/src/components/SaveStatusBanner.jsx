import React from "react";

/**
 * Tells a student, during an exam, that some answers have not reached the server.
 *
 * Autosave failures used to be silent: the page went on marking questions as
 * answered while nothing was being stored, and the student found out only when
 * they came back to a blank paper. The exam pages now keep the unsaved answers
 * in this browser and retry them (utils/unsavedAnswers.js); this is the part the
 * student sees. It disappears on its own once everything is saved.
 *
 * Deliberately a banner, not a dialog: Chrome leaves fullscreen for a modal
 * JavaScript dialog, which proctoring would charge as a violation.
 */
export default function SaveStatusBanner({ unsavedCount }) {
  if (!unsavedCount) return null;
  const plural = unsavedCount === 1 ? "answer has" : "answers have";
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[65] max-w-[calc(100vw-2rem)] w-[30rem] rounded-xl border border-amber-400/40 bg-amber-950/95 px-4 py-2.5 text-amber-100 shadow-2xl"
    >
      <p className="text-sm font-semibold">
        {unsavedCount} {plural} not been saved to the server yet. Retrying…
      </p>
      <p className="text-xs text-amber-200/80 mt-0.5">
        Keep working and keep this tab open. They are kept on this computer and will be sent as soon as the
        connection is back. If this does not clear, tell your invigilator before submitting.
      </p>
    </div>
  );
}
