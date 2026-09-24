import React from "react";

/**
 * The page Safe Exam Browser is pointed at once an exam is handed in.
 *
 * SEB is configured with this address as its quit URL, so simply arriving here
 * makes it close and give the machine back — no password, no confirmation. The
 * page exists for the moment before that happens, and for the case where a
 * student reaches it in an ordinary browser.
 *
 * It is a public route on purpose. SEB matches the quit URL exactly, and being
 * bounced to the login page would change the address, leaving a student who has
 * already submitted trapped in a locked kiosk with no way out.
 */
export default function SebExit() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
        <h1 className="mb-3 text-2xl font-bold text-white">Your test has been submitted</h1>
        <p className="mb-6 text-slate-300">
          Safe Exam Browser is closing. Your computer will return to normal in a
          moment.
        </p>
        <p className="text-xs text-slate-400">
          If this window is still open after a few seconds, quit Safe Exam Browser
          using the button in its toolbar.
        </p>
      </div>
    </div>
  );
}
