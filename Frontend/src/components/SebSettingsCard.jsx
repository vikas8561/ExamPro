import React, { useCallback, useEffect, useState } from "react";
import apiRequest from "../services/api";

/**
 * Safe Exam Browser settings.
 *
 * Deliberately a switch and not much else. Verification uses SEB's Config Key,
 * which the server derives from the configuration file it generates, so there is
 * no key to obtain, paste or keep up to date. The alternative — SEB's Browser
 * Exam Key — would have to be read out of SEB's Configuration Tool by hand on a
 * Windows machine and again on a Mac, and redone at every SEB release.
 *
 * The config file is downloadable anyway, because an administrator will want to
 * see exactly what is being applied to their students' computers.
 */
export default function SebSettingsCard() {
  const [required, setRequired] = useState(false);
  const [urlFilter, setUrlFilter] = useState(true);
  const [configKey, setConfigKey] = useState(null);
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

  /**
   * Fetched as JSON and turned into a file here rather than linked directly: a
   * browser download cannot carry the Authorization header this endpoint needs.
   */
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
    <div className="mt-8 max-w-2xl rounded-xl border border-slate-700 bg-slate-800/50 p-6">
      <h2 className="mb-1 text-lg font-semibold text-white">Safe Exam Browser</h2>
      <p className="mb-6 text-sm text-slate-400">
        Runs exams inside a locked-down browser that blocks other applications,
        browser extensions and additional screens. Applies to every proctored test.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-600 bg-slate-900 p-4">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-100">
                Require Safe Exam Browser
              </span>
              <span className="mt-1 block text-xs text-slate-400">
                Students on Windows and macOS must launch exams through Safe Exam
                Browser. Students on Linux, where it has never been available, keep
                the standard browser-based proctoring and their submissions record
                that.
              </span>
            </span>
          </label>

          <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-600 bg-slate-900 p-4">
            <input
              type="checkbox"
              checked={urlFilter}
              onChange={(e) => setUrlFilter(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-100">
                Confine Safe Exam Browser to this site
              </span>
              <span className="mt-1 block text-xs text-slate-400">
                Stops students browsing anywhere else inside Safe Exam Browser. Turn
                it off if students can reach the login page but cannot sign in — that
                is what a filter blocking the API looks like, and this isolates it in
                one step.
              </span>
            </span>
          </label>

          <div className="mb-6 rounded-lg border border-slate-600 bg-slate-900 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-200">
                Verification key
              </span>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  configured
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-red-500/40 bg-red-500/10 text-red-300"
                }`}
              >
                {configured ? "Ready" : "Not available"}
              </span>
            </div>
            {configured ? (
              <>
                <p className="mb-2 text-xs text-slate-400">
                  Calculated automatically from the configuration below. Nothing to
                  set up, and nothing to redo when Safe Exam Browser updates — this
                  key is the same on Windows and macOS.
                </p>
                <code className="block break-all rounded bg-slate-800 px-3 py-2 font-mono text-[11px] text-slate-400">
                  {configKey}
                </code>
              </>
            ) : (
              <p className="text-xs text-red-300">
                FRONTEND_URL is not set on the API server, so no configuration can
                be built and no student could be verified. Set it before switching
                this on.
              </p>
            )}
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-300">
                Minimum version — Windows
              </span>
              <input
                type="text"
                value={minVersions.windows}
                onChange={(e) =>
                  setMinVersions((v) => ({ ...v, windows: e.target.value }))
                }
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-300">
                Minimum version — macOS
              </span>
              <input
                type="text"
                value={minVersions.macos}
                onChange={(e) => setMinVersions((v) => ({ ...v, macos: e.target.value }))}
                className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
            </label>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-white/90 px-4 py-2 text-sm font-semibold text-black hover:bg-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
            <button
              type="button"
              onClick={downloadConfig}
              className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Download .seb file
            </button>
            {saved && <span className="text-sm text-emerald-400">Saved.</span>}
            {updatedAt && (
              <span className="text-xs text-slate-500">
                Last changed: {new Date(updatedAt).toLocaleString()}
              </span>
            )}
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="mb-2 text-sm font-semibold text-amber-200">
              What students need to do
            </p>
            <ul className="space-y-1.5 text-sm text-slate-300">
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
        </>
      )}
    </div>
  );
}
