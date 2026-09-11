import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LazyMonacoEditor from './LazyMonacoEditor';
import apiRequest from '../services/api';
import {
  FALLBACK_LANGUAGES,
  fetchSupportedLanguages,
  findLanguage,
  normalizeLanguageKey,
} from '../config/languages';

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 22, 24, 25, 28, 30];

// Judge0 status ids (GET /statuses). Colours match the coding-test page.
const ACCEPTED = 3;
const statusClass = (statusId, passed) =>
  (statusId === ACCEPTED || (statusId === undefined && passed))
    ? 'border-[#28c244]/40 bg-[#28c244]/10 text-[#28c244]'
    : 'border-[#ef4743]/40 bg-[#ef4743]/10 text-[#ef4743]';
const verdictColor = (statusId) => (statusId === ACCEPTED ? 'text-[#28c244]' : 'text-[#ef4743]');

const Metric = ({ label, value }) =>
  value === null || value === undefined || value === '' ? null : (
    <span className="text-[11px] text-slate-400">
      {label} <span className="text-slate-300">{value}</span>
    </span>
  );

const OutputBlock = ({ label, value, tone = 'text-slate-200' }) =>
  !value ? null : (
    <div className="mt-1">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <pre className={`whitespace-pre-wrap break-words text-xs ${tone}`}>{value}</pre>
    </div>
  );

export default function Judge0CodeEditor({
  testId,
  questionId,
  assignmentId,
  initialLanguage = 'python',
  initialCode = '',
  onRun,
  onSubmit,
  className = '',
}) {
  const [languages, setLanguages] = useState(FALLBACK_LANGUAGES);
  const [language, setLanguage] = useState(normalizeLanguageKey(initialLanguage) || 'python');
  const [code, setCode] = useState(initialCode || '');
  const [customInput, setCustomInput] = useState('');
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runResults, setRunResults] = useState(null);
  const [submitResults, setSubmitResults] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState('testcase'); // 'testcase' | 'result'
  const [fontSize, setFontSize] = useState(14);

  // Tracks the boilerplate we last inserted, so switching language only
  // overwrites code the student has not actually touched.
  const lastBoilerplateRef = useRef(initialCode || '');

  useEffect(() => {
    let cancelled = false;
    fetchSupportedLanguages().then((supported) => {
      if (cancelled || !supported?.length) return;
      setLanguages(supported);

      // If the initial language is not offered by this deployment, fall back.
      const resolved = findLanguage(supported, language);
      if (resolved && resolved.key !== language) setLanguage(resolved.key);

      // Seed an empty editor with the boilerplate for the selected language.
      setCode((current) => {
        if (current && current.trim() !== '') return current;
        const boilerplate = findLanguage(supported, resolved?.key || language)?.boilerplate || '';
        lastBoilerplateRef.current = boilerplate;
        return boilerplate;
      });
    });
    return () => { cancelled = true; };
    // Intentionally run once: the picker is seeded from the deployment's list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeLanguage = useMemo(() => findLanguage(languages, language), [languages, language]);
  const monacoLanguage = activeLanguage?.monacoLanguage || 'plaintext';

  const handleLanguageChange = useCallback((nextKey) => {
    const nextBoilerplate = findLanguage(languages, nextKey)?.boilerplate || '';
    setCode((current) => {
      const untouched = current.trim() === '' || current === lastBoilerplateRef.current;
      if (!untouched) return current;
      lastBoilerplateRef.current = nextBoilerplate;
      return nextBoilerplate;
    });
    setLanguage(nextKey);
  }, [languages]);

  const execute = useCallback(async (endpoint, extraBody, setBusy, apply) => {
    if (!questionId) {
      setErrorMessage('This question is not ready yet — please reload the page.');
      return;
    }
    if (!code.trim()) {
      setErrorMessage('Write some code first.');
      return;
    }

    setBusy(true);
    setErrorMessage('');
    try {
      const result = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          assignmentId: assignmentId || null,
          testId: testId || null,
          questionId,
          sourceCode: code,
          language,
          ...extraBody,
        }),
      });
      apply(result);
      setActiveTab('result');
    } catch (error) {
      setErrorMessage(error?.message || 'Something went wrong. Please try again.');
      setActiveTab('result');
    } finally {
      setBusy(false);
    }
  }, [assignmentId, code, language, questionId, testId]);

  const handleRun = useCallback(() => execute(
    '/coding/run',
    { customInput: customInput || undefined },
    setRunning,
    (result) => { setRunResults(result); onRun?.(result); },
  ), [customInput, execute, onRun]);

  const handleSubmit = useCallback(() => execute(
    '/coding/submit',
    {},
    setSubmitting,
    (result) => { setSubmitResults(result); onSubmit?.(result); },
  ), [execute, onSubmit]);

  const busy = running || submitting;

  return (
    <div className={`h-full flex flex-col bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden shadow-lg ${className}`}>
      {/* Toolbar */}
      <div className="p-3 flex items-center gap-3 border-b border-slate-700 flex-wrap">
        <select
          value={language}
          onChange={(event) => handleLanguageChange(event.target.value)}
          disabled={busy}
          aria-label="Programming language"
          className="bg-slate-900 text-white p-2 pr-6 outline-none cursor-pointer border border-slate-700 rounded disabled:opacity-50"
        >
          {languages.map((entry) => (
            <option key={entry.key} className="bg-slate-900 text-white" value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-3 flex-wrap">
          <select
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
            aria-label="Editor font size"
            className="bg-slate-900 text-white p-2 pr-6 outline-none cursor-pointer border border-slate-700 rounded"
          >
            {FONT_SIZES.map((size) => (
              <option key={size} className="bg-slate-900 text-white" value={size}>{size} px</option>
            ))}
          </select>

          {runResults && (
            <span className="px-2 py-1 text-xs rounded-full bg-emerald-900/30 border border-emerald-700 text-emerald-300">
              Sample: {runResults.passed}/{runResults.total}
            </span>
          )}
          {submitResults && (
            <span className={`px-2 py-1 text-xs rounded-full border ${statusClass(submitResults.verdict?.id)}`}>
              {submitResults.verdict?.id === ACCEPTED ? 'Accepted' : (submitResults.verdict?.description || 'Wrong Answer')}
            </span>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <LazyMonacoEditor
          height="100%"
          language={monacoLanguage}
          theme="vs-dark"
          value={code}
          onChange={(value) => setCode(value ?? '')}
          options={{
            fontSize,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>

      {/* Console */}
      <div className="p-3 border-t border-slate-700 max-h-56 overflow-y-auto">
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setActiveTab('testcase')}
            className={`px-3 py-1.5 text-xs rounded-md border ${activeTab === 'testcase' ? 'bg-slate-700/60 border-slate-500 text-slate-100' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'}`}
          >
            Custom Input
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('result')}
            className={`px-3 py-1.5 text-xs rounded-md border ${activeTab === 'result' ? 'bg-slate-700/60 border-slate-500 text-slate-100' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'}`}
          >
            Results
          </button>
        </div>

        {activeTab === 'testcase' ? (
          <div>
            <label htmlFor="judge0-custom-input" className="block text-xs text-slate-400 mb-1">
              Optional input piped to your program's stdin when you press Run.
            </label>
            <textarea
              id="judge0-custom-input"
              className="w-full h-24 p-2 bg-slate-900 border border-slate-700 rounded text-sm font-mono"
              placeholder="Type custom input here..."
              value={customInput}
              onChange={(event) => setCustomInput(event.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-2">
            {errorMessage && (
              <div className="p-2 rounded border border-red-700 bg-red-900/20 text-red-300 text-xs">
                {errorMessage}
              </div>
            )}

            {/* Sample (visible) test cases */}
            {runResults?.results?.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-200">
                  Sample test cases — passed {runResults.passed}/{runResults.total}
                </div>
                {runResults.results.map((result, index) => (
                  <div key={index} className={`p-2 rounded border text-xs ${statusClass(result.status?.id, result.passed)}`}>
                    <div className="flex justify-between items-center gap-2 flex-wrap">
                      <span className="font-medium">Case {index + 1}</span>
                      <span className="flex items-center gap-3">
                        <Metric label="time" value={result.time ? `${result.time}s` : null} />
                        <Metric label="mem" value={result.memory ? `${result.memory} KB` : null} />
                        <span>{result.status?.description || (result.passed ? 'Passed' : 'Failed')}</span>
                      </span>
                    </div>
                    <OutputBlock label="Input" value={result.input} tone="text-slate-300" />
                    <OutputBlock label="Expected" value={result.expected} tone="text-slate-300" />
                    <OutputBlock label="Your output" value={result.stdout} />
                    <OutputBlock label="Compiler" value={result.compileOutput} tone="text-orange-300" />
                    <OutputBlock label="Runtime error" value={result.stderr} tone="text-red-300" />
                    <OutputBlock label="Note" value={result.message} tone="text-amber-300" />
                  </div>
                ))}
              </div>
            )}

            {/* Custom input run */}
            {runResults?.customResult && (
              <div className={`p-2 rounded border text-xs ${statusClass(runResults.customResult.status?.id, true)}`}>
                <div className="flex justify-between items-center gap-2 flex-wrap">
                  <span className="font-medium">Custom input</span>
                  <span className="flex items-center gap-3">
                    <Metric label="time" value={runResults.customResult.time ? `${runResults.customResult.time}s` : null} />
                    <span>{runResults.customResult.status?.description}</span>
                  </span>
                </div>
                <OutputBlock label="Input" value={runResults.customResult.input} tone="text-slate-300" />
                <OutputBlock label="Your output" value={runResults.customResult.stdout} />
                <OutputBlock label="Compiler" value={runResults.customResult.compileOutput} tone="text-orange-300" />
                <OutputBlock label="Runtime error" value={runResults.customResult.stderr} tone="text-red-300" />
              </div>
            )}

            {/* Hidden test cases — verdicts only, never the data */}
            {submitResults && (
              <div className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <span className={`text-base font-medium ${verdictColor(submitResults.verdict?.id)}`}>
                    {submitResults.verdict?.id === ACCEPTED ? 'Accepted' : (submitResults.verdict?.description || 'Wrong Answer')}
                  </span>
                  <span className="text-xs text-slate-400">
                    {submitResults.passedCount} / {submitResults.totalHidden} testcases passed
                  </span>
                </div>
                <div className="flex items-center gap-6 text-xs text-slate-400">
                  {submitResults.runtimeMs !== null && submitResults.runtimeMs !== undefined && (
                    <span>Runtime <span className="text-slate-200">{submitResults.runtimeMs} ms</span></span>
                  )}
                  {submitResults.memoryKb !== null && submitResults.memoryKb !== undefined && (
                    <span>Memory <span className="text-slate-200">{(submitResults.memoryKb / 1024).toFixed(1)} MB</span></span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {submitResults.results?.map((result, index) => (
                    <span
                      key={index}
                      title={result.status?.description}
                      className={`w-2 h-2 rounded-full ${result.passed ? 'bg-[#28c244]' : 'bg-[#ef4743]'}`}
                    />
                  ))}
                </div>
                <OutputBlock label="Compiler" value={submitResults.compileOutput} tone="text-orange-300" />
              </div>
            )}

            {!runResults && !submitResults && !errorMessage && (
              <div className="text-slate-400 text-sm">
                Press <span className="text-slate-200">Run</span> to check the sample cases, or{' '}
                <span className="text-slate-200">Submit</span> to grade against the hidden ones.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 py-2 border-t border-slate-700 flex-shrink-0 flex justify-end gap-2">
        <button
          type="button"
          onClick={handleRun}
          disabled={busy}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${busy ? 'bg-slate-700/60 cursor-not-allowed text-slate-300' : 'bg-slate-700 hover:bg-slate-600 text-white hover:scale-[1.01]'}`}
        >
          {running ? 'Running...' : 'Run'}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${busy ? 'bg-green-700/60 cursor-not-allowed text-white' : 'bg-green-600 hover:bg-green-700 text-white hover:scale-[1.01]'}`}
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
