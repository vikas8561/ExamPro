import React, { useCallback, useEffect, useState } from "react";
import apiRequest from "../services/api";
import SebSettingsCard from "../components/SebSettingsCard";

/**
 * Proctoring settings.
 *
 * The one place the global bypass code lives. It replaces the old per-test OTP,
 * which was generated for every test, printed in the admin test list, and
 * searchable through the tests API — so in practice it was neither secret nor
 * revocable.
 *
 * There is now a single code for the whole system. It is admin-only, never sent
 * to a student, and it waives the camera, microphone and location checks and
 * nothing else: fullscreen, tab switching, keyboard and clipboard rules stay in
 * force for a student who uses it, and the fact that it was used is recorded on
 * their submission.
 */
export default function AdminProctoring() {
  const [otp, setOtp] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Terminated attempts state
  const [terminated, setTerminated] = useState([]);
  const [loadingTerminated, setLoadingTerminated] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest("/proctor/settings/otp");
      setOtp(data.otp);
      setUpdatedAt(data.updatedAt);
    } catch (err) {
      setError(err.message || "Could not load the proctoring settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTerminated = useCallback(async () => {
    setLoadingTerminated(true);
    try {
      const data = await apiRequest("/assignments/terminated-violations");
      setTerminated(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load terminated attempts:", err);
    } finally {
      setLoadingTerminated(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadTerminated();
  }, [load, loadTerminated]);

  const rotate = useCallback(async () => {
    if (
      !window.confirm(
        "Generate a new access code?\n\nThe current code stops working immediately. Anyone who already has it will not be able to use it."
      )
    ) {
      return;
    }

    setRotating(true);
    setError(null);
    try {
      const data = await apiRequest("/proctor/settings/otp/rotate", { method: "POST" });
      setOtp(data.otp);
      setUpdatedAt(data.updatedAt);
      setVisible(true);
    } catch (err) {
      setError(err.message || "Could not generate a new code.");
    } finally {
      setRotating(false);
    }
  }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(otp || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the code is on screen either way.
    }
  }, [otp]);

  const handleReEnable = async (a) => {
    const studentName = a.userId?.name || "the student";
    if (
      !window.confirm(
        `Re-enable exam for ${studentName}?\n\n• Active violations will reset to 0.\n• All previous violation records remain saved in history.\n• The original exam timer continues (no extra time granted).\n• Student will see "Continue" on their dashboard.`
      )
    ) {
      return;
    }

    try {
      await apiRequest(`/assignments/${a._id}/re-enable`, { method: "POST" });
      alert(`Exam re-enabled for ${studentName}.`);
      loadTerminated();
    } catch (err) {
      alert(err.message || "Failed to re-enable exam.");
    }
  };

  return (
    <div className="p-6">
      <h1 className="mb-2 text-2xl font-bold text-white">Proctoring</h1>
      <p className="mb-8 text-sm text-slate-400">
        Settings that apply to every proctored test.
      </p>

      <div className="max-w-2xl rounded-xl border border-slate-700 bg-slate-800/50 p-6">
        <h2 className="mb-1 text-lg font-semibold text-white">Access code</h2>
        <p className="mb-6 text-sm text-slate-400">
          Give this to a student whose camera, microphone or location is not working, so they can
          still sit the test. There is one code for the whole system.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mb-6 rounded-lg border border-slate-600 bg-slate-900 p-6 text-center">
          {loading ? (
            <p className="text-slate-500">Loading…</p>
          ) : (
            <>
              <div className="mb-4 font-mono text-4xl font-bold tracking-[0.3em] text-white">
                {visible ? otp : "••••••"}
              </div>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setVisible((v) => !v)}
                  className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  {visible ? "Hide" : "Show"}
                </button>
                {visible && (
                  <button
                    type="button"
                    onClick={copy}
                    className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={rotate}
                  disabled={rotating}
                  className="rounded-md bg-white/90 px-4 py-2 text-sm font-semibold text-black hover:bg-white disabled:opacity-50"
                >
                  {rotating ? "Generating…" : "Generate new code"}
                </button>
              </div>
            </>
          )}
        </div>

        {updatedAt && (
          <p className="mb-6 text-xs text-slate-500">
            Last changed: {new Date(updatedAt).toLocaleString()}
          </p>
        )}

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-200">What this code does</p>
          <ul className="space-y-1.5 text-sm text-slate-300">
            <li>• Skips the camera, microphone and location checks only.</li>
            <li>
              • Does <strong>not</strong> relax anything else. Fullscreen, tab switching, keyboard
              and clipboard rules stay fully active.
            </li>
            <li>• Screen sharing is still required and cannot be skipped.</li>
            <li>• Its use is recorded on the student's submission for the reviewer to see.</li>
            <li>• Wrong guesses are rate limited, so it cannot be brute forced.</li>
          </ul>
        </div>
      </div>

      <SebSettingsCard />

      {/* Violation Terminations & Re-enable */}
      <div className="mt-8 max-w-4xl rounded-xl border border-slate-700 bg-slate-800/50 p-6">
        <h2 className="mb-1 text-lg font-semibold text-white">Re-enable Terminated Exams</h2>
        <p className="mb-6 text-sm text-slate-400">
          Exams auto-submitted because candidate reached maximum proctoring violation limits. Re-enabling resets active violations to 0 while keeping previous violation history and the original exam timer.
        </p>

        {loadingTerminated ? (
          <p className="text-sm text-slate-500">Loading attempts…</p>
        ) : terminated.length === 0 ? (
          <p className="text-sm text-slate-500">No violation-terminated exams found.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900 border-b border-slate-700 text-slate-400">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Test</th>
                  <th className="py-3 px-4">Violations</th>
                  <th className="py-3 px-4">Deadline</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 bg-slate-800/30">
                {terminated.map((a) => {
                  const deadline = a.deadline || (a.startTime && a.duration ? new Date(new Date(a.startTime).getTime() + a.duration * 60000) : null);
                  const isExpired = deadline && new Date() >= new Date(deadline);
                  const isActive = a.status === "In Progress";
                  const violationCount = a.tabViolations?.length || a.tabViolationCount || 0;

                  return (
                    <tr key={a._id} className="hover:bg-slate-700/20">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{a.userId?.name || "Student"}</div>
                        <div className="text-[11px] text-slate-400">{a.userId?.email}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-white">{a.testId?.title || "Test"}</td>
                      <td className="py-3 px-4">
                        <span className="text-red-400 font-semibold">{violationCount} logged</span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {deadline ? new Date(deadline).toLocaleTimeString() : "—"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isActive ? (
                          <span className="text-emerald-400 font-semibold">Active (Re-enabled)</span>
                        ) : isExpired ? (
                          <span className="text-slate-500">Deadline Passed</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleReEnable(a)}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors"
                          >
                            Re-enable Exam
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
