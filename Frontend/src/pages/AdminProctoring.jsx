import React, { useCallback, useEffect, useState } from "react";
import apiRequest from "../services/api";
import SebSettingsCard from "../components/SebSettingsCard";

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
      // Clipboard access fallback
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
    <div
      className="p-4 sm:p-6 lg:p-8 min-h-screen font-sans"
      style={{ backgroundColor: "#16181F" }}
    >
      <div className="max-w-6xl mx-auto w-full space-y-6">
        {/* Header Row - Synchronized 3.5rem baseline matching Sidebar */}
        <div
          className="flex items-center justify-between pb-5 mb-2"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", minHeight: "3.5rem" }}
        >
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Proctoring
            </h1>
            <p className="text-xs text-[#7E8594] mt-0.5">
              Settings that apply to every proctored test.
            </p>
          </div>
        </div>

        {/* Card 1: Access code */}
        <div className="w-full rounded-2xl border border-white/[0.06] bg-[#20242D] p-5 sm:p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">Access code</h2>
            <p className="text-xs text-[#7E8594] mt-0.5 leading-relaxed">
              Give this to a student whose camera, microphone or location is not working, so they can
              still sit the test. There is one code for the whole system.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left Column: Code display and controls */}
            <div className="lg:col-span-6 rounded-xl border border-white/[0.06] bg-[#181A22] p-5 sm:p-6 flex flex-col justify-between text-center min-h-[190px]">
              <div>
                <div className="text-[11px] font-medium text-[#7E8594] uppercase tracking-wider mb-1">
                  System Access Code
                </div>
                {loading ? (
                  <p className="text-xs text-[#7E8594] py-4">Loading…</p>
                ) : (
                  <div className="font-mono text-3xl sm:text-4xl font-bold tracking-[0.25em] text-white my-3">
                    {visible ? otp : "••••••"}
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-center flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => setVisible((v) => !v)}
                    className="rounded-xl border border-white/10 bg-[#2A2E39] hover:bg-[#343946] px-4 py-2 text-xs font-semibold text-white transition-all cursor-pointer"
                  >
                    {visible ? "Hide" : "Show"}
                  </button>
                  {visible && (
                    <button
                      type="button"
                      onClick={copy}
                      className="rounded-xl border border-white/10 bg-[#2A2E39] hover:bg-[#343946] px-4 py-2 text-xs font-semibold text-white transition-all cursor-pointer"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={rotate}
                    disabled={rotating}
                    className="rounded-xl bg-white hover:bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-950 transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {rotating ? "Generating…" : "Generate new code"}
                  </button>
                </div>

                {updatedAt && (
                  <p className="mt-3 text-[11px] text-[#7E8594]">
                    Last changed: {new Date(updatedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {/* Right Column: Explanatory / What this code does */}
            <div className="lg:col-span-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 flex flex-col justify-center">
              <p className="mb-2 text-xs font-bold text-amber-200">What this code does</p>
              <ul className="space-y-1.5 text-xs text-[#8E95A5] leading-relaxed">
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
        </div>

        {/* Card 2: Safe Exam Browser Card */}
        <SebSettingsCard />

        {/* Card 3: Violation Terminations & Re-enable */}
        <div className="w-full rounded-2xl border border-white/[0.06] bg-[#20242D] p-5 sm:p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">Re-enable Terminated Exams</h2>
            <p className="text-xs text-[#7E8594] mt-0.5 leading-relaxed">
              Exams auto-submitted because candidate reached maximum proctoring violation limits. Re-enabling resets active violations to 0 while keeping previous violation history and the original exam timer.
            </p>
          </div>

          {loadingTerminated ? (
            <p className="text-xs text-[#7E8594] py-4">Loading attempts…</p>
          ) : terminated.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-[#181A22] p-6 text-center text-xs text-[#7E8594]">
              No violation-terminated exams found.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-[#181A22]">
              <table className="w-full text-left text-xs text-[#8E95A5]">
                <thead className="bg-[#14161D] border-b border-white/[0.06] text-[#7E8594] uppercase tracking-wider text-[10px] font-semibold">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Test</th>
                    <th className="py-3 px-4">Violations</th>
                    <th className="py-3 px-4">Deadline</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {terminated.map((a) => {
                    const deadline = a.deadline || (a.startTime && a.duration ? new Date(new Date(a.startTime).getTime() + a.duration * 60000) : null);
                    const isExpired = deadline && new Date() >= new Date(deadline);
                    const isActive = a.status === "In Progress";
                    const violationCount = a.tabViolations?.length || a.tabViolationCount || 0;

                    return (
                      <tr key={a._id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{a.userId?.name || "Student"}</div>
                          <div className="text-[11px] text-[#7E8594]">{a.userId?.email}</div>
                        </td>
                        <td className="py-3 px-4 font-medium text-white">{a.testId?.title || "Test"}</td>
                        <td className="py-3 px-4">
                          <span className="text-rose-400 font-semibold">{violationCount} logged</span>
                        </td>
                        <td className="py-3 px-4 text-[#7E8594]">
                          {deadline ? new Date(deadline).toLocaleTimeString() : "—"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isActive ? (
                            <span className="text-emerald-400 font-semibold">Active (Re-enabled)</span>
                          ) : isExpired ? (
                            <span className="text-[#555C6D]">Deadline Passed</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleReEnable(a)}
                              className="rounded-xl bg-white hover:bg-slate-100 text-slate-950 px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
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
    </div>
  );
}
