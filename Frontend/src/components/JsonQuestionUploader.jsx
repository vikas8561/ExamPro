import React, { useEffect, useRef, useState } from "react";
import {
  FALLBACK_LANGUAGES,
  fetchSupportedLanguages,
} from "../config/languages";
import { EXAMPLES, parseQuestionsJson } from "../utils/parseQuestionsJson";

/**
 * Bulk question upload — by file or by pasting JSON.
 *
 * Parsing lives in utils/parseQuestionsJson so it can be tested on its own.
 * Coding questions must carry visibleTestCases (shown to students on Run) and
 * hiddenTestCases with marks (what Submit is graded against) — anything that
 * would not grade is surfaced as a warning rather than silently dropped.
 */

const JsonQuestionUploader = ({ onQuestionsLoaded }) => {
  const [mode, setMode] = useState("file"); // 'file' | 'paste'
  const [pastedText, setPastedText] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [success, setSuccess] = useState(false);
  const [questionsCount, setQuestionsCount] = useState(0);
  const [languages, setLanguages] = useState(FALLBACK_LANGUAGES);
  const [exampleKind, setExampleKind] = useState("mcq");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef(null);

  // The judge decides which languages exist; validate uploads against that.
  useEffect(() => {
    let cancelled = false;
    fetchSupportedLanguages().then((supported) => {
      if (!cancelled && supported?.length) setLanguages(supported);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const languageKeys = languages.map((entry) => entry.key);
  const activeExample =
    EXAMPLES.find((entry) => entry.key === exampleKind) || EXAMPLES[0];

  const resetStatus = () => {
    setError("");
    setWarnings([]);
    setSuccess(false);
    setQuestionsCount(0);
  };

  /** Shared entry point for both input modes. */
  const loadFromText = (text, label) => {
    resetStatus();
    setLoading(true);
    setSourceName(label);

    try {
      if (!text || !text.trim())
        throw new Error("Nothing to read — the input is empty");

      const jsonData = JSON.parse(text);
      const { questions, warnings: found } = parseQuestionsJson(jsonData, {
        languageKeys,
      });

      setQuestionsCount(questions.length);
      setWarnings(found);
      onQuestionsLoaded(questions);
      setSuccess(true);
    } catch (parseError) {
      setError(
        parseError instanceof SyntaxError
          ? `Invalid JSON: ${parseError.message}`
          : parseError.message || "Invalid JSON format",
      );
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };
  const readFile = (file) => {
    if (!file) return;
    const looksLikeJson =
      file.type === "application/json" ||
      file.name.toLowerCase().endsWith(".json");
    if (!looksLikeJson) {
      resetStatus();
      setError("Please upload a valid .json file");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      resetStatus();
      setError("Could not read that file");
    };
    reader.onload = (event) => loadFromText(event.target.result, file.name);
    reader.readAsText(file);
  };

  const handleFileUpload = (event) => readFile(event.target.files?.[0]);

  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const handleDrop = (event) => {
    stop(event);
    readFile(event.dataTransfer.files?.[0]);
  };

  const clearAll = () => {
    resetStatus();
    setSourceName("");
    setPastedText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    clearAll();
  };

  const copyExample = async () => {
    try {
      await navigator.clipboard.writeText(activeExample.json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const useExample = () => {
    setMode("paste");
    resetStatus();
    setPastedText(activeExample.json);
  };

  const tabClass = (isActive) =>
    `px-3.5 py-1.5 text-xs font-semibold rounded-xl border transition-all duration-200 ${
      isActive
        ? "bg-white border-white text-slate-950 shadow-sm"
        : "bg-[#181A22] border-white/[0.06] text-[#7E8594] hover:text-white hover:border-white/10"
    }`;

  return (
    <div className="w-full rounded-2xl border border-white/[0.06] bg-[#20242D] p-5 sm:p-6 shadow-sm mb-6">
      <div className="mb-5">
        <h4 className="text-base sm:text-lg font-bold text-white tracking-tight">
          Bulk Upload Questions (JSON)
        </h4>
        <p className="text-xs text-[#7E8594] mt-0.5 leading-relaxed">
          Upload a formatted .json file or paste JSON directly to import multiple questions at once.
        </p>
      </div>

      {/* Input mode */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => switchMode("file")}
          className={tabClass(mode === "file")}
        >
          Upload File
        </button>
        <button
          type="button"
          onClick={() => switchMode("paste")}
          className={tabClass(mode === "paste")}
        >
          Paste JSON
        </button>
      </div>

      {/* File mode */}
      {mode === "file" && (
        <div
          className="relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 border-white/10 bg-[#181A22] hover:border-[#00C4B4]/40 hover:bg-[#181A22]/80"
          onDragOver={stop}
          onDragEnter={stop}
          onDragLeave={stop}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={loading}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-[#20242D] rounded-xl border border-white/[0.06]">
              <svg
                className="w-7 h-7 text-[#00C4B4]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <div className="text-white text-sm font-semibold">
              Drop your JSON file here
            </div>
            <div className="text-xs text-[#7E8594]">
              or click to browse files
            </div>
            <div className="text-[11px] text-[#555C6D]">
              Supports .json files only
            </div>
          </div>
        </div>
      )}

      {/* Paste mode */}
      {mode === "paste" && (
        <div>
          <label
            htmlFor="questions-json"
            className="block text-xs text-[#7E8594] mb-2"
          >
            Paste the JSON for your questions below.
          </label>
          <textarea
            id="questions-json"
            value={pastedText}
            onChange={(event) => setPastedText(event.target.value)}
            spellCheck="false"
            placeholder='{ "questions": [ ... ] }'
            className="w-full h-52 p-4 bg-[#181A22] border border-white/[0.08] rounded-xl text-xs font-mono text-white placeholder-[#555C6D] outline-none focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] resize-y"
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => loadFromText(pastedText, "pasted JSON")}
              disabled={loading || !pastedText.trim()}
              className={`px-4 py-2 rounded-xl font-semibold text-xs transition-all shadow-sm ${
                loading || !pastedText.trim()
                  ? "bg-white/10 text-white/40 cursor-not-allowed"
                  : "bg-white hover:bg-slate-100 text-slate-950 cursor-pointer active:scale-95"
              }`}
            >
              {loading ? "Loading…" : "Load Questions"}
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="px-4 py-2 rounded-xl font-semibold text-xs border border-white/10 bg-[#2A2E39] hover:bg-[#343946] text-white transition-all cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Status */}
      {loading && mode === "file" && (
        <div className="mt-4 flex items-center gap-2.5 text-[#00C4B4] text-xs">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#00C4B4] border-t-transparent"></div>
          Processing file…
        </div>
      )}

      {success && (
        <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <svg
              className="w-4 h-4 text-emerald-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-xs font-semibold text-emerald-300">
              {questionsCount} question{questionsCount !== 1 ? "s" : ""} loaded
              {sourceName ? ` from ${sourceName}` : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="px-3 py-1 text-xs bg-[#2A2E39] hover:bg-[#343946] border border-white/10 text-white rounded-lg transition-all"
          >
            Clear
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <svg
              className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <div className="text-xs text-rose-300 break-words">{error}</div>
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="px-3 py-1 text-xs bg-[#2A2E39] hover:bg-[#343946] border border-white/10 text-white rounded-lg transition-all flex-shrink-0"
          >
            Clear
          </button>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <svg
              className="w-4 h-4 text-amber-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
            <span className="font-semibold text-amber-200 text-xs">
              Loaded with {warnings.length} warning
              {warnings.length !== 1 ? "s" : ""}
            </span>
          </div>
          <ul className="ml-5 space-y-1 text-xs text-amber-200/80 list-disc">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* JSON Format Example */}
      <div className="mt-5 bg-[#181A22] rounded-xl border border-white/[0.06]">
        <details className="group">
          <summary className="flex items-center justify-between p-3.5 sm:p-4 cursor-pointer hover:bg-white/[0.02] transition-colors rounded-xl">
            <div className="flex items-center gap-2.5">
              <svg
                className="w-4 h-4 text-[#7E8594] group-open:rotate-90 transition-transform duration-200"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <span className="text-xs font-semibold text-white">
                JSON Format Example
              </span>
            </div>
            <div className="text-[11px] text-[#7E8594] bg-[#20242D] px-2 py-0.5 rounded border border-white/[0.06]">
              Click to expand
            </div>
          </summary>

          <div className="p-4 border-t border-white/[0.06]">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                {EXAMPLES.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setExampleKind(entry.key)}
                    className={tabClass(exampleKind === entry.key)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={useExample}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 bg-[#2A2E39] hover:bg-[#343946] text-white transition-all cursor-pointer"
                >
                  Use this
                </button>
                <button
                  type="button"
                  onClick={copyExample}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 bg-[#2A2E39] hover:bg-[#343946] text-white transition-all cursor-pointer"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="bg-[#14161D] rounded-xl p-4 border border-white/[0.04] overflow-x-auto">
              <pre className="text-xs text-[#8E95A5] font-mono leading-relaxed">
                {activeExample.json}
              </pre>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
};

export default JsonQuestionUploader;
