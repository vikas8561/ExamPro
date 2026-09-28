import React, { useCallback, useEffect, useState } from "react";
import apiRequest from "../services/api";

export default function SebSettingsCard() {
  const [required, setRequired] = useState(false);
  const [urlFilter, setUrlFilter] = useState(true);
  const [configKey, setConfigKey] = useState(null);
  const [quitPassword, setQuitPassword] = useState(null);
  const [quitVisible, setQuitVisible] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [minVersions, setMinVersions] = useState({ windows: "3.10.0", macos: "3.6.0" });
  const [updatedAt, setUpdatedAt] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest("/proctor/settings/seb");
      setRequired(data.required === true);
      setUrlFilter(data.urlFilter !== false);
      setConfigKey(data.configKey || null);
      setQuitPassword(data.quitPassword || null);
      setConfigured(data.configured === true);
      setMinVersions(data.minVersions || { windows: "3.10.0", macos: "3.6.0" });
      setUpdatedAt(data.updatedAt);
    } catch (err) {
      setError(err.message || "Could not load the Safe Exam Browser settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const data = await apiRequest("/proctor/settings/seb", {
        method: "PUT",
        body: JSON.stringify({ required, urlFilter, minVersions }),
      });
      setRequired(data.required === true);
      setUrlFilter(data.urlFilter !== false);
      setUpdatedAt(data.updatedAt);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || "Could not save the Safe Exam Browser settings.");
    } finally {
      setSaving(false);
    }
  }, [required, urlFilter, minVersions]);

  const rotateQuitPassword = useCallback(async () => {
    if (
      !window.confirm(
        "Issue a new quit password?\n\nThe current one stops working as soon as students download a fresh configuration. Anyone mid-exam keeps using the old one until they relaunch."
      )
    ) {
      return;
    }
    setRotating(true);
    setError(null);
    try {
      const data = await apiRequest("/proctor/settings/seb/quit-password/rotate", {
        method: "POST",
      });
      setQuitPassword(data.quitPassword);
      setQuitVisible(true);
      await load();
    } catch (err) {
      setError(err.message || "Could not issue a new quit password.");
    } finally {
      setRotating(false);
    }
  }, [load]);

  const downloadConfig = useCallback(async () => {
    setError(null);
    try {
      const { config } = await apiRequest("/proctor/settings/seb/config");
      const url = URL.createObjectURL(new Blob([config], { type: "application/seb" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "exampro.seb";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Could not build the configuration file.");
    }
  }, []);

  return (
    <div className="w-full rounded-2xl border border-white/[0.06] bg-[#20242D] p-5 sm:p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">Safe Exam Browser</h2>
        <p className="text-xs text-[#7E8594] mt-0.5 leading-relaxed">
          Runs exams inside a locked-down browser that blocks other applications,
          browser extensions and additional screens. Applies to every proctored test.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-xs text-[#7E8594] py-4">Loading…</p>
      ) : (
        <div className="space-y-4">
          {/* Checkboxes Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-[#181A22] p-4 hover:border-white/10 transition-colors">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#00C4B4] rounded cursor-pointer"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-white">
                  Require Safe Exam Browser
                </span>
                <span className="mt-1 block text-[11px] text-[#7E8594] leading-relaxed">
                  Students on Windows and macOS must launch exams through Safe Exam
                  Browser. Students on Linux, where it has never been available, keep
                  the standard browser-based proctoring and their submissions record
                  that.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-[#181A22] p-4 hover:border-white/10 transition-colors">
              <input
                type="checkbox"
                checked={urlFilter}
                onChange={(e) => setUrlFilter(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#00C4B4] rounded cursor-pointer"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-white">
                  Confine Safe Exam Browser to this site
                </span>
                <span className="mt-1 block text-[11px] text-[#7E8594] leading-relaxed">
                  Stops students browsing anywhere else inside Safe Exam Browser. Turn
                  it off if students can reach the login page but cannot sign in — that
                  is what a filter blocking the API looks like, and this isolates it in
                  one step.
                </span>
              </span>
            </label>
          </div>

          {/* Verification Key & Quit Password Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Verification Key */}
            <div className="rounded-xl border border-white/[0.06] bg-[#181A22] p-4 flex flex-col justify-between">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-white">
                    Verification key
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                      configured
                        ? "border-[#34D399]/30 bg-[#19382C] text-[#34D399]"
                        : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                    }`}
                  >
                    {configured ? "Ready" : "Not available"}
                  </span>
                </div>
                {configured ? (
                  <>
                    <p className="mb-2 text-[11px] text-[#7E8594] leading-relaxed">
                      Calculated automatically from the configuration below. Nothing to
                      set up, and nothing to redo when Safe Exam Browser updates — this
                      key is the same on Windows and macOS.
                    </p>
                    <code className="block break-all rounded-lg bg-[#16181F] border border-white/[0.04] p-2.5 font-mono text-[11px] text-[#00C4B4]">
                      {configKey}
                    </code>
                  </>
                ) : (
                  <p className="text-xs text-rose-300">
                    FRONTEND_URL is not set on the API server, so no configuration can
                    be built and no student could be verified. Set it before switching
                    this on.
                  </p>
                )}
              </div>
            </div>

            {/* Quit Password */}
            <div className="rounded-xl border border-white/[0.06] bg-[#181A22] p-4 flex flex-col justify-between">
              <div>
                <p className="mb-1 text-xs font-semibold text-white">Quit password</p>
                <p className="mb-3 text-[11px] text-[#7E8594] leading-relaxed">
                  Without this a student can press Quit, look something up, and relaunch.
                  With it, leaving Safe Exam Browser mid-exam needs an invigilator. Read
                  it out only to let somebody out of an exam — never before one.
                  Submitting normally still closes Safe Exam Browser without any prompt.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <code className="rounded-lg bg-[#16181F] border border-white/[0.04] px-3 py-1.5 font-mono text-xs tracking-widest text-white">
                  {quitVisible ? quitPassword || "—" : "••••••••••••"}
                </code>
                <button
                  type="button"
                  onClick={() => setQuitVisible((v) => !v)}
                  className="rounded-xl border border-white/10 bg-[#2A2E39] hover:bg-[#343946] px-3 py-1.5 text-xs font-semibold text-white transition-all cursor-pointer"
                >
                  {quitVisible ? "Hide" : "Show"}
                </button>
                <button
                  type="button"
                  onClick={rotateQuitPassword}
                  disabled={rotating}
                  className="rounded-xl border border-[#00C4B4]/30 bg-[#133B42] hover:bg-[#1A4C55] px-3 py-1.5 text-xs font-semibold text-[#00C4B4] transition-all cursor-pointer disabled:opacity-50"
                >
                  {rotating ? "Issuing…" : "New password"}
                </button>
              </div>
            </div>
          </div>

          {/* Minimum Versions Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block p-3.5 rounded-xl border border-white/[0.06] bg-[#181A22]">
              <span className="mb-1.5 block text-xs font-semibold text-white">
                Minimum version — Windows
              </span>
              <input
                type="text"
                value={minVersions.windows}
                onChange={(e) =>
                  setMinVersions((v) => ({ ...v, windows: e.target.value }))
                }
                className="w-full rounded-xl border border-white/[0.08] bg-[#16181F] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00C4B4]/50"
              />
            </label>
            <label className="block p-3.5 rounded-xl border border-white/[0.06] bg-[#181A22]">
              <span className="mb-1.5 block text-xs font-semibold text-white">
                Minimum version — macOS
              </span>
              <input
                type="text"
                value={minVersions.macos}
                onChange={(e) => setMinVersions((v) => ({ ...v, macos: e.target.value }))}
                className="w-full rounded-xl border border-white/[0.08] bg-[#16181F] px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00C4B4]/50"
              />
            </label>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-xl bg-white hover:bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-950 transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
              <button
                type="button"
                onClick={downloadConfig}
                className="rounded-xl border border-white/10 bg-[#2A2E39] hover:bg-[#343946] px-4 py-2 text-xs font-semibold text-white transition-all cursor-pointer"
              >
                Download .seb file
              </button>
              {saved && <span className="text-xs font-semibold text-[#34D399]">Saved.</span>}
            </div>

            {updatedAt && (
              <span className="text-xs text-[#7E8594]">
                Last changed: {new Date(updatedAt).toLocaleString()}
              </span>
            )}
          </div>

          {/* Callout */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="mb-2 text-xs font-bold text-amber-200">
              What students need to do
            </p>
            <ul className="space-y-1.5 text-xs text-[#8E95A5] leading-relaxed">
              <li>
                • Install Safe Exam Browser — Windows {minVersions.windows} or newer,
                macOS {minVersions.macos} or newer.
              </li>
              <li>
                • Start the exam from their assignments page. They are shown a
                launch button, and Safe Exam Browser opens with the right settings
                on its own.
              </li>
              <li>
                • They will sign in again inside Safe Exam Browser. That is expected.
              </li>
              <li>
                • Safe Exam Browser blocks extensions, other applications and extra
                screens. It cannot do anything about a phone on the desk.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
