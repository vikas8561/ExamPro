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
    `px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-200 ${
      isActive
        ? "bg-slate-600/60 border-slate-400/60 text-white"
        : "bg-slate-800/60 border-slate-600/50 text-slate-300 hover:bg-slate-700/60 hover:text-white"
    }`;

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-600/50 p-6 rounded-xl mb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-green-600/20 rounded-lg">
          <svg
            className="w-6 h-6 text-green-400"
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
        <div>
          <h4 className="text-xl font-semibold">
            Bulk Upload Questions (JSON)
          </h4>
          <p className="text-sm text-slate-400">
            Upload a file or paste JSON directly
          </p>
        </div>
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
          className="relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 border-slate-500/50 bg-slate-700/30 hover:border-slate-400/50 hover:bg-slate-700/50"
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
          <div className="flex flex-col items-center gap-4">
            <div className="p-3 bg-slate-600/50 rounded-full">
              <svg
                className="w-8 h-8 text-slate-400"
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
            <div className="text-slate-300 font-medium">
              Drop your JSON file here
            </div>
            <div className="text-sm text-slate-400">
              or click to browse files
            </div>
            <div className="text-xs text-slate-500">
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
            className="block text-sm text-slate-400 mb-2"
          >
            Paste the JSON for your questions below.
          </label>
          <textarea
            id="questions-json"
            value={pastedText}
            onChange={(event) => setPastedText(event.target.value)}
            spellCheck="false"
            placeholder='{ "questions": [ ... ] }'
            className="w-full h-56 p-3 bg-slate-900/70 border border-slate-600/50 rounded-lg text-sm font-mono text-slate-200 placeholder-slate-600 outline-none focus:border-slate-400/60 resize-y"
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => loadFromText(pastedText, "pasted JSON")}
              disabled={loading || !pastedText.trim()}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                loading || !pastedText.trim()
                  ? "bg-green-700/40 text-white/60 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            >
              {loading ? "Loading..." : "Load Questions"}
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="px-4 py-2 rounded-lg font-medium text-sm bg-slate-700 hover:bg-slate-600 text-white transition-all duration-200"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Status */}
      {loading && mode === "file" && (
        <div className="mt-4 flex items-center gap-3 text-blue-400 text-sm">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
          Processing file...
        </div>
      )}

      {success && (
        <div className="mt-4 bg-green-900/20 border border-green-500/40 rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <svg
              className="w-5 h-5 text-green-400 flex-shrink-0"
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
            <span className="text-sm text-green-300">
              {questionsCount} question{questionsCount !== 1 ? "s" : ""} loaded
              {sourceName ? ` from ${sourceName}` : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="px-3 py-1.5 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-all duration-200"
          >
            Clear
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 bg-red-900/20 border border-red-500/40 rounded-lg p-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
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
            <div className="text-sm text-red-300 break-words">{error}</div>
          </div>
          <button
            type="button"
            onClick={clearAll}
            className="px-3 py-1.5 text-xs bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-all duration-200 flex-shrink-0"
          >
            Clear
          </button>
        </div>
      )}

      {/* Warnings — the upload worked, but something will not grade as expected */}
      {warnings.length > 0 && (
        <div className="mt-4 bg-amber-900/20 border border-amber-500/40 rounded-lg p-4">
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
            <span className="font-medium text-amber-300 text-sm">
              Loaded with {warnings.length} warning
              {warnings.length !== 1 ? "s" : ""}
            </span>
          </div>
          <ul className="ml-6 space-y-1 text-xs text-amber-200/90 list-disc">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* JSON Format Example */}
      <div className="mt-6 bg-slate-700/30 rounded-lg border border-slate-500/30">
        <details className="group">
          <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-600/30 transition-all duration-200">
            <div className="flex items-center gap-3">
              <svg
                className="w-5 h-5 text-slate-400 group-open:rotate-90 transition-transform duration-200"
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
              <span className="font-medium text-slate-200">
                JSON Format Example
              </span>
            </div>
            <div className="text-xs text-slate-400 bg-slate-600/50 px-2 py-1 rounded">
              Click to expand
            </div>
          </summary>

          <div className="p-4 border-t border-slate-500/30">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
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
                  className="px-3 py-1.5 text-xs rounded-md border border-slate-500/50 bg-slate-800/60 text-slate-200 hover:bg-slate-700 transition-all duration-200"
                >
                  Use this
                </button>
                <button
                  type="button"
                  onClick={copyExample}
                  className="px-3 py-1.5 text-xs rounded-md border border-slate-500/50 bg-slate-800/60 text-slate-200 hover:bg-slate-700 transition-all duration-200"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-slate-300 font-mono leading-relaxed">
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
