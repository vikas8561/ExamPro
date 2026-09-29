import React, { useCallback, useEffect, useRef, useState } from 'react';
import LazyMonacoEditor from '../LazyMonacoEditor';
import QuestionText from '../QuestionText';
import { findLanguage } from '../../config/languages';
import { CustomDropdown, LcBox, Spinner } from './codingUi';
import {
  ACCEPTED,
  CODING_STYLES,
  DIFFICULTY_COLOR,
  FONT_SIZES,
  WRONG_ANSWER,
  submitVerdict,
  submittedAtLabel,
  tidyCode,
  verdictColor,
  verdictLabel,
} from './codingHelpers';

// The console can be dragged anywhere between "just its tab bar" and "leaves
// the editor MIN_EDITOR_PX tall". Heights are kept as a share of the column so
// the layout survives a window resize.
const CONSOLE_HEADER_PX = 40;
const HANDLE_PX = 10;
const MIN_EDITOR_PX = 120;
const MIN_OPEN_PX = CONSOLE_HEADER_PX + 60;
const DEFAULT_RATIO = 0.38;

// Per-viewer conveniences only. Storage can be missing or throw (private
// windows, blocked site data), and the workspace must work the same without it.
const PREFS_KEY = 'exampro.codingWorkspace';
const readPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {};
  } catch {
    return {};
  }
};
const writePrefs = (patch) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    // Not worth interrupting an exam over.
  }
};

const clampRatio = (value) => (Number.isFinite(value) && value > 0 && value < 1 ? value : DEFAULT_RATIO);

/**
 * The full-screen coding workspace: problem on the left, editor and console on
 * the right, Run / Submit in the top bar.
 *
 * Used by the coding test (TakeCodingTest.jsx) and for coding questions in any
 * other test (TakeTest.jsx), so a coding question looks and behaves the same
 * wherever it appears. The page owns the code, the language and the Judge0
 * state (see hooks/useCodingJudge.js); this component owns only how they are
 * shown.
 *
 * Props:
 *   title, headerLeft, headerRight  top bar content around the Run / Submit pair
 *   question, heading, chips         the problem being shown
 *   code, onCodeChange               the editor's contents
 *   language, onLanguageChange       the editor's language key
 *   supportedLanguages               from config/languages
 *   judge                            the useCodingJudge() result
 *   onResetCode                      optional; shows a reset button when given
 */
export default function CodingWorkspace({
  title,
  headerLeft = null,
  headerRight = null,
  question,
  heading,
  chips = [],
  code,
  onCodeChange,
  language,
  onLanguageChange,
  supportedLanguages,
  judge,
  onResetCode,
}) {
  const questionId = question?._id;
  const prefs = useRef(readPrefs()).current;

  const [leftTab, setLeftTab] = useState('description'); // 'description' | 'submission'
  const [consoleTab, setConsoleTab] = useState('result'); // 'result' | 'input'
  const [selectedCase, setSelectedCase] = useState(0);
  const [useCustomCase, setUseCustomCase] = useState(false);
  const [editorTheme, setEditorTheme] = useState(prefs.theme || 'vs-dark');
  const [fontSize, setFontSize] = useState(FONT_SIZES[prefs.fontSize] ? prefs.fontSize : 'medium');

  // ---- console sizing ----
  const columnRef = useRef(null);
  const [consoleRatio, setConsoleRatio] = useState(clampRatio(prefs.consoleRatio));
  const [consoleCollapsed, setConsoleCollapsed] = useState(Boolean(prefs.consoleCollapsed));
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setSelectedCase(0);
    setUseCustomCase(false);
  }, [questionId]);

  useEffect(() => { writePrefs({ theme: editorTheme }); }, [editorTheme]);
  useEffect(() => { writePrefs({ fontSize }); }, [fontSize]);
  useEffect(() => {
    if (!dragging) writePrefs({ consoleRatio, consoleCollapsed });
  }, [consoleRatio, consoleCollapsed, dragging]);

  const maxRatio = useCallback(() => {
    const height = columnRef.current?.getBoundingClientRect().height || 0;
    if (!height) return 0.8;
    return Math.max(0.2, (height - MIN_EDITOR_PX - HANDLE_PX) / height);
  }, []);

  /** Bring the console up so a result is visible; never shrinks it. */
  const openConsole = useCallback(() => {
    setConsoleCollapsed(false);
    setConsoleRatio((ratio) => Math.min(Math.max(ratio, DEFAULT_RATIO), maxRatio()));
  }, [maxRatio]);

  const toggleConsole = useCallback(() => {
    if (consoleCollapsed) openConsole();
    else setConsoleCollapsed(true);
  }, [consoleCollapsed, openConsole]);

  const resizeTo = useCallback((clientY) => {
    const rect = columnRef.current?.getBoundingClientRect();
    if (!rect || !rect.height) return;
    const px = rect.bottom - clientY - HANDLE_PX / 2;
    // Dragged most of the way down: snap shut to the tab bar.
    if (px < MIN_OPEN_PX - 20) {
      setConsoleCollapsed(true);
      return;
    }
    setConsoleCollapsed(false);
    const next = Math.max(MIN_OPEN_PX, px) / rect.height;
    setConsoleRatio(Math.min(next, maxRatio()));
  }, [maxRatio]);

  const onHandlePointerDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const onHandlePointerMove = (event) => {
    if (dragging) resizeTo(event.clientY);
  };
  const onHandlePointerUp = (event) => {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
  };
  const onHandleKeyDown = (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const step = event.key === 'ArrowUp' ? 0.05 : -0.05;
      if (consoleCollapsed) {
        if (step > 0) openConsole();
        return;
      }
      const next = consoleRatio + step;
      const rect = columnRef.current?.getBoundingClientRect();
      if (rect && next * rect.height < MIN_OPEN_PX) setConsoleCollapsed(true);
      else setConsoleRatio(Math.min(next, maxRatio()));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleConsole();
    }
  };

  // While dragging, the whole page shows the resize cursor and nothing selects.
  useEffect(() => {
    if (!dragging) return undefined;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragging]);

  // ---- judge ----
  const {
    runResultsByQ,
    submitResultsByQ,
    lastActionByQ,
    customInputByQ,
    setCustomInput,
    judgeBusy,
    judgeError,
    submitProgress,
    execute,
  } = judge;

  const activeRunResult = questionId ? runResultsByQ[questionId] : null;
  const activeSubmitResult = questionId ? submitResultsByQ[questionId] : null;
  const lastAction = questionId ? lastActionByQ[questionId] : null;
  const sampleCases = question?.visibleTestCases?.length
    ? question.visibleTestCases
    : (question?.examples || []);

  const run = async () => {
    if (!question || judgeBusy) return;
    setConsoleTab('result');
    openConsole();
    await execute({ mode: 'run', question, code, language });
    setSelectedCase(0);
  };

  const submit = async () => {
    if (!question || judgeBusy) return;
    setConsoleTab('result');
    setLeftTab('submission');
    openConsole();
    await execute({ mode: 'submit', question, code, language });
  };

  const formatCode = () => {
    const formatted = tidyCode(code);
    if (formatted !== (code || '')) onCodeChange(formatted);
  };

  const consoleHeight = consoleCollapsed ? `${CONSOLE_HEADER_PX}px` : `${consoleRatio * 100}%`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CODING_STYLES }} />

      <div className="h-screen flex flex-col bg-[#1a1a1a] text-[#f5f5f5] overflow-hidden">

        {/* ---------------- Top bar ---------------- */}
        <header className="h-12 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[14px] font-medium text-white/90 truncate max-w-[260px]" title={title}>{title}</span>
            {headerLeft}
          </div>

          {/* Run / Submit, centred like LeetCode's toolbar */}
          <div className="flex items-center gap-1 bg-white/[0.06] rounded-lg p-1">
            <button
              type="button"
              onClick={run}
              disabled={!!judgeBusy || !question}
              title="Run against the sample test cases"
              className="h-8 px-3 rounded-md text-[13px] text-white/90 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1.5 transition-colors"
            >
              {judgeBusy === 'run' ? <Spinner /> : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 4.4a1 1 0 011.02-.06l8 4.6a1 1 0 010 1.74l-8 4.6A1 1 0 016 14.42V5.58a1 1 0 01.3-1.18z" />
                </svg>
              )}
              Run
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!!judgeBusy || !question}
              title="Submit for grading against the hidden test cases"
              className="h-8 px-3 rounded-md text-[13px] text-[#28c244] hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1.5 transition-colors"
            >
              {judgeBusy === 'submit' ? <Spinner /> : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15V6a2 2 0 012-2h10a2 2 0 012 2v9M12 4v9m0-9l-3 3m3-3l3 3" />
                </svg>
              )}
              Submit
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 min-w-0">
            {headerRight}
          </div>
        </header>

        {/* ---------------- Workspace ---------------- */}
        <div className="flex-1 flex gap-1.5 px-1.5 pb-1.5 min-h-0">

          {/* ---- Description panel ---- */}
          <div className="w-1/2 flex flex-col min-h-0 bg-[#262626] rounded-lg border border-white/[0.04] overflow-hidden">
            <div className="h-10 flex items-center gap-4 px-4 border-b border-white/10 flex-shrink-0">
              <button
                type="button"
                onClick={() => setLeftTab('description')}
                className={`text-[14px] font-medium flex items-center gap-1.5 transition-colors ${leftTab === 'description' ? 'text-[#f5f5f5]' : 'text-white/60 hover:text-white/80'}`}
              >
                <svg className="w-4 h-4 text-[#46c6c2]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Description
              </button>
              <button
                type="button"
                onClick={() => setLeftTab('submission')}
                className={`text-[14px] font-medium flex items-center gap-1.5 transition-colors ${leftTab === 'submission' ? 'text-[#f5f5f5]' : 'text-white/60 hover:text-white/80'}`}
              >
                <svg className="w-4 h-4 text-[#ffb800]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Submission
              </button>
            </div>

            {leftTab === 'submission' ? (
              <div className="flex-1 overflow-y-auto lc-scroll px-5 py-4">
                {/* ---- live judging ---- */}
                {submitProgress ? (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Spinner className="w-4 h-4 text-[#ffb800]" />
                      <span className="text-[16px] font-medium text-[#ffb800]">
                        {submitProgress.phase === 'running' ? 'Judging' : 'Pending'}
                      </span>
                    </div>

                    <div className="text-[13px] text-white/60 mb-2">
                      {submitProgress.phase === 'running' && submitProgress.total > 0
                        ? `Running test case ${Math.min(submitProgress.finished + 1, submitProgress.total)} of ${submitProgress.total}...`
                        : submitProgress.phase === 'queued'
                          ? 'Your solution is in the queue. This usually takes a few seconds.'
                          : 'Sending your solution for evaluation...'}
                    </div>

                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-[#ffb800] transition-all duration-300 ease-out"
                        style={{ width: `${submitProgress.total ? Math.round((submitProgress.finished / submitProgress.total) * 100) : 8}%` }}
                      />
                    </div>
                    <div className="text-[12px] text-white/40 mt-1.5 tabular-nums">
                      {submitProgress.total
                        ? `${submitProgress.finished} of ${submitProgress.total} test cases completed`
                        : 'Preparing test cases...'}
                    </div>
                  </div>
                ) : activeSubmitResult ? (
                  <div>
                    {/* ---- verdict ---- */}
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className={`text-[22px] font-medium ${verdictColor(submitVerdict(activeSubmitResult).id)}`}>
                        {verdictLabel(submitVerdict(activeSubmitResult).id, submitVerdict(activeSubmitResult).description)}
                      </span>
                      <span className="text-[13px] text-white/50">
                        {activeSubmitResult.passedCount} / {activeSubmitResult.totalHidden} testcases passed
                      </span>
                    </div>
                    <div className="text-[12px] text-white/40 mb-3">
                      Submitted in {findLanguage(supportedLanguages, activeSubmitResult.language)?.label || activeSubmitResult.language}
                      {submittedAtLabel(activeSubmitResult.submittedAt)
                        ? ` at ${submittedAtLabel(activeSubmitResult.submittedAt)}`
                        : ''}
                    </div>

                    {/* Best-wins: persistCodingResponse keeps whichever attempt
                        passed more cases, so resubmitting can only ever help.
                        When an earlier attempt is the one standing, say so with
                        its number -- otherwise a student reading "6 / 10" at the
                        top takes it for their grade. */}
                    {activeSubmitResult.graded && !activeSubmitResult.graded.isThisAttempt ? (
                      <div className="text-[12px] mb-5 rounded-lg bg-[#28c244]/10 border border-[#28c244]/25 px-3 py-2">
                        <span className="text-white/70">Your best attempt is the one graded: </span>
                        <span className="text-[#28c244] font-medium">
                          {activeSubmitResult.graded.passedCount} / {activeSubmitResult.graded.totalHidden} testcases
                        </span>
                        <span className="text-white/50">. This attempt did not beat it, so it has not replaced it.</span>
                      </div>
                    ) : (
                      <div className="text-[12px] text-white/50 mb-5 rounded-lg bg-white/[0.04] px-3 py-2">
                        Your best submission is the one graded. Submitting again can only
                        improve your result, never lower it.
                      </div>
                    )}

                    {activeSubmitResult.compileOutput && (
                      <div className="mt-4">
                        <div className="text-[12px] text-white/50 mb-1.5">Compile Error</div>
                        <pre className="bg-white/[0.06] rounded-lg px-3 py-2.5 text-[13px] font-mono text-[#ef4743] whitespace-pre-wrap break-words">
                          {activeSubmitResult.compileOutput}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : judgeError ? (
                  <div className="text-[14px] text-[#ef4743]">{judgeError}</div>
                ) : (
                  <div className="text-[13px] text-white/40">
                    Submit your code to see the result here.
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto lc-scroll px-5 py-4">
                <h1 className="text-[22px] font-medium text-[#f5f5f5] leading-8 mb-3">
                  {heading}
                </h1>

                <div className="flex flex-wrap items-center gap-2 mb-5">
                  {chips.map((chip) => (
                    <span key={chip} className="px-2.5 py-1 rounded-full bg-white/10 text-[12px] text-white/70">{chip}</span>
                  ))}
                  {question?.difficulty && (
                    <span className={`px-2.5 py-1 rounded-full bg-white/10 text-[12px] ${DIFFICULTY_COLOR[String(question.difficulty).toLowerCase()] || 'text-white/70'}`}>
                      {question.difficulty}
                    </span>
                  )}
                  {(question?.topics || []).map((topic, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full bg-white/10 text-[12px] text-white/60">{topic}</span>
                  ))}
                  {question?.hint && (
                    <span className="px-2.5 py-1 rounded-full bg-white/10 text-[12px] text-white/60">Hint</span>
                  )}
                </div>

                <div className="lc-prose text-[14px] leading-6 text-[rgba(239,241,246,0.75)]">
                  <QuestionText text={question?.text} />
                </div>

                {sampleCases.length > 0 && (
                  <div className="mt-6 space-y-5">
                    {sampleCases.map((example, index) => (
                      <div key={index}>
                        <div className="text-[14px] text-white mb-2">Example {index + 1}:</div>
                        <pre className="border-l-2 border-white/[0.14] pl-4 font-mono text-[13px] leading-6 text-white/60 whitespace-pre-wrap break-words">
<span className="text-white/80 font-semibold">Input: </span>{example.input}
<span className="text-white/80 font-semibold">{'\n'}Output: </span>{example.output}{example.explanation ? (
<><span className="text-white/80 font-semibold">{'\n'}Explanation: </span>{example.explanation}</>
) : null}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}

                {question?.guidelines && (
                  <div className="mt-6">
                    <div className="text-[14px] text-white mb-2">Constraints:</div>
                    <div className="text-[13px] leading-6 text-white/60 whitespace-pre-wrap">{question.guidelines}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ---- Editor + console column ---- */}
          <div ref={columnRef} className="w-1/2 flex flex-col min-h-0">

            {/* Code panel */}
            <div className="flex-1 flex flex-col min-h-0 bg-[#262626] rounded-lg border border-white/[0.04] overflow-hidden">
              <div className="h-10 flex items-center justify-between gap-2 px-3 border-b border-white/10 flex-shrink-0">
                <span className="text-[14px] font-medium text-[#f5f5f5] flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Code
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="w-32">
                    <CustomDropdown
                      value={language || 'python'}
                      onChange={onLanguageChange}
                      options={supportedLanguages.map((entry) => ({ value: entry.key, label: entry.label }))}
                    />
                  </div>
                  <div className="w-28">
                    <CustomDropdown
                      value={editorTheme}
                      onChange={setEditorTheme}
                      options={[
                        { value: 'vs-dark', label: 'Dark' },
                        { value: 'vs', label: 'Light' },
                        { value: 'hc-black', label: 'Contrast' },
                      ]}
                    />
                  </div>
                  <div className="w-24">
                    <CustomDropdown
                      value={fontSize}
                      onChange={setFontSize}
                      options={[
                        { value: 'small', label: 'Small' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'large', label: 'Large' },
                        { value: 'extra-large', label: 'X-Large' },
                      ]}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={formatCode}
                    title="Format code"
                    className="w-8 h-8 rounded-md text-white/60 hover:bg-white/10 hover:text-white/90 flex items-center justify-center transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h14" />
                    </svg>
                  </button>
                  {onResetCode && (
                    <button
                      type="button"
                      onClick={onResetCode}
                      title="Reset to the starting code"
                      className="w-8 h-8 rounded-md text-white/60 hover:bg-white/10 hover:text-white/90 flex items-center justify-center transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-0">
                {/* One editor per question, never shared. A single editor fed
                    each question's code through `value` keeps one undo history
                    for all of them: Ctrl+Z on a new question undid the switch
                    itself and wrote the previous question's code into this one,
                    where it was saved and submitted as this question's answer. */}
                <LazyMonacoEditor
                  key={questionId || 'no-question'}
                  height="100%"
                  language={findLanguage(supportedLanguages, language || 'python')?.monacoLanguage || 'plaintext'}
                  theme={editorTheme}
                  value={code || ''}
                  onChange={(value) => onCodeChange(value ?? '')}
                  options={{
                    fontSize: FONT_SIZES[fontSize],
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 4,
                    insertSpaces: true,
                    wordWrap: 'on',
                    folding: true,
                    matchBrackets: 'always',
                    autoClosingBrackets: 'always',
                    autoClosingQuotes: 'always',
                    suggestOnTriggerCharacters: true,
                    quickSuggestions: { other: true, comments: false, strings: false },
                    parameterHints: { enabled: true },
                    renderLineHighlight: 'line',
                    smoothScrolling: true,
                    fontFamily: "'Menlo', 'Monaco', 'Consolas', 'Courier New', monospace",
                    lineHeight: 1.6,
                    padding: { top: 12, bottom: 12 },
                    bracketPairColorization: { enabled: true },
                    guides: { bracketPairs: true, indentation: true },
                    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                  }}
                />
              </div>
            </div>

            {/* Drag handle: pull the console down while writing, up to read results. */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize the test result panel"
              aria-valuenow={consoleCollapsed ? 0 : Math.round(consoleRatio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              title="Drag to resize · double-click to hide or show"
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
              onDoubleClick={toggleConsole}
              onKeyDown={onHandleKeyDown}
              className="group flex-shrink-0 flex items-center justify-center cursor-row-resize touch-none outline-none"
              style={{ height: HANDLE_PX }}
            >
              <div className={`h-1 rounded-full transition-all duration-150 ${
                dragging
                  ? 'w-20 bg-[#46c6c2]'
                  : 'w-12 bg-white/15 group-hover:w-20 group-hover:bg-white/40 group-focus-visible:w-20 group-focus-visible:bg-[#46c6c2]'
              }`} />
            </div>

            {/* Console panel */}
            <div
              className="flex flex-col min-h-0 flex-shrink-0 bg-[#262626] rounded-lg border border-white/[0.04] overflow-hidden"
              style={{
                height: consoleHeight,
                transition: dragging ? 'none' : 'height 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
              }}
            >
              <div className="h-10 flex items-center justify-between gap-4 px-4 border-b border-white/10 flex-shrink-0">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => { setConsoleTab('input'); if (consoleCollapsed) openConsole(); }}
                    className={`text-[14px] font-medium flex items-center gap-1.5 transition-colors ${consoleTab === 'input' ? 'text-[#f5f5f5]' : 'text-white/60 hover:text-white/80'}`}
                  >
                    <svg className="w-4 h-4 text-[#28c244]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    Testcase
                  </button>
                  <button
                    type="button"
                    onClick={() => { setConsoleTab('result'); if (consoleCollapsed) openConsole(); }}
                    className={`text-[14px] font-medium flex items-center gap-1.5 transition-colors ${consoleTab === 'result' ? 'text-[#f5f5f5]' : 'text-white/60 hover:text-white/80'}`}
                  >
                    {judgeBusy ? <Spinner className="w-4 h-4 text-[#ffb800]" /> : (
                      <svg className="w-4 h-4 text-[#46c6c2]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                    Test Result
                  </button>
                </div>
                <button
                  type="button"
                  onClick={toggleConsole}
                  title={consoleCollapsed ? 'Show the test result panel' : 'Hide the test result panel'}
                  className="w-7 h-7 rounded-md text-white/60 hover:bg-white/10 hover:text-white/90 flex items-center justify-center transition-colors"
                >
                  <svg className={`w-4 h-4 transition-transform ${consoleCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto lc-scroll px-4 py-3">
                {consoleTab === 'input' ? (
                  <div>
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      {sampleCases.map((_, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => { setUseCustomCase(false); setSelectedCase(index); }}
                          className={`px-3 py-1 rounded-lg text-[13px] transition-colors ${
                            !useCustomCase && selectedCase === index ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/[0.06]'
                          }`}
                        >
                          Case {index + 1}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setUseCustomCase(true)}
                        className={`px-3 py-1 rounded-lg text-[13px] transition-colors ${
                          useCustomCase ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/[0.06]'
                        }`}
                      >
                        + Custom
                      </button>
                    </div>

                    {useCustomCase ? (
                      <div>
                        <div className="text-[12px] text-white/50 mb-1.5">stdin</div>
                        <textarea
                          id="coding-custom-input"
                          value={customInputByQ[questionId] || ''}
                          onChange={(event) => setCustomInput(questionId, event.target.value)}
                          spellCheck="false"
                          placeholder="Type input for your program..."
                          className="w-full h-20 bg-white/[0.06] rounded-lg px-3 py-2.5 text-[13px] font-mono text-white/90 placeholder-white/30 outline-none focus:bg-white/[0.09] resize-none"
                        />
                        <div className="text-[12px] text-white/40 mt-2">Sent to your program on Run.</div>
                      </div>
                    ) : sampleCases[selectedCase] ? (
                      <div>
                        {!question?.visibleTestCases?.length && (
                          <div className="text-[12px] text-[#ffb800] mb-2">
                            Illustration from the question — Run has no sample cases to execute for this
                            question. Use Custom input to try your code.
                          </div>
                        )}
                        <LcBox label="Input" value={sampleCases[selectedCase].input} />
                        <LcBox label="Expected" value={sampleCases[selectedCase].output} />
                      </div>
                    ) : (
                      <div className="text-[13px] text-white/40">No sample test cases for this question.</div>
                    )}
                  </div>
                ) : (
                  <div>
                    {judgeError && (
                      <div className="text-[14px] text-[#ef4743] mb-2">{judgeError}</div>
                    )}

                    {judgeBusy && (
                      <div className="flex items-center gap-2 text-[13px] text-white/60 mb-3">
                        <Spinner className="w-4 h-4 text-[#ffb800]" />
                        {judgeBusy === 'run' ? 'Running your code...' : 'Judging your submission...'}
                      </div>
                    )}

                    {/* ---- Submit verdict (no marks shown) ---- */}
                    {!judgeBusy && lastAction === 'submit' && activeSubmitResult && (
                      <div>
                        <div className="flex items-baseline gap-3 mb-1">
                          <span className={`text-[18px] font-medium ${verdictColor(submitVerdict(activeSubmitResult).id)}`}>
                            {verdictLabel(submitVerdict(activeSubmitResult).id, submitVerdict(activeSubmitResult).description)}
                          </span>
                          {submitVerdict(activeSubmitResult).id !== ACCEPTED && (
                            <span className="text-[13px] text-white/50">
                              {activeSubmitResult.passedCount} / {activeSubmitResult.totalHidden} testcases passed
                            </span>
                          )}
                        </div>

                        {submitVerdict(activeSubmitResult).id === ACCEPTED && (
                          <div className="text-[13px] text-white/50 mb-1">
                            {activeSubmitResult.passedCount} / {activeSubmitResult.totalHidden} testcases passed
                          </div>
                        )}

                        {submittedAtLabel(activeSubmitResult.submittedAt) && (
                          <div className="text-[12px] text-white/40 mb-2">
                            Submitted at {submittedAtLabel(activeSubmitResult.submittedAt)}
                          </div>
                        )}

                        {/* Best-wins grading; see the note in the submission panel. */}
                        {activeSubmitResult.graded && !activeSubmitResult.graded.isThisAttempt ? (
                          <div className="text-[12px] text-[#28c244] mb-3">
                            Best attempt graded: {activeSubmitResult.graded.passedCount} / {activeSubmitResult.graded.totalHidden} testcases
                          </div>
                        ) : (
                          <div className="text-[12px] text-white/50 mb-3">
                            Your best submission is the one graded.
                          </div>
                        )}

                        {activeSubmitResult.compileOutput && (
                          <pre className="mt-3 bg-white/[0.06] rounded-lg px-3 py-2.5 text-[13px] font-mono text-[#ef4743] whitespace-pre-wrap break-words">
                            {activeSubmitResult.compileOutput}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* ---- Run results ---- */}
                    {!judgeBusy && lastAction === 'run' && activeRunResult && (
                      <div>
                        <div className="mb-3">
                          {/* `total === 0` means nothing was checked against an
                              expectation -- a question with no visible test
                              cases, or a custom-input-only run. Calling that
                              "Accepted" told students their code had passed
                              when not a single case had run. */}
                          {activeRunResult.total === 0 ? (
                            <span className="text-[18px] font-medium text-white/60">
                              {activeRunResult.customResult
                                ? 'Ran with your input'
                                : 'No sample test cases to run'}
                            </span>
                          ) : (
                            <span className={`text-[18px] font-medium ${verdictColor(activeRunResult.passed === activeRunResult.total ? ACCEPTED : WRONG_ANSWER)}`}>
                              {activeRunResult.passed === activeRunResult.total ? 'Accepted' : 'Wrong Answer'}
                            </span>
                          )}
                          {activeRunResult.total > 0 && (
                            <span className="ml-2 text-[13px] text-white/50">
                              {activeRunResult.passed}/{activeRunResult.total} sample cases passed
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          {activeRunResult.results?.map((result, index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => setSelectedCase(index)}
                              className={`px-3 py-1 rounded-lg text-[13px] flex items-center gap-1.5 transition-colors ${
                                selectedCase === index ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/[0.06]'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${result.passed ? 'bg-[#28c244]' : 'bg-[#ef4743]'}`} />
                              Case {index + 1}
                            </button>
                          ))}
                          {activeRunResult.customResult && (
                            <button
                              type="button"
                              onClick={() => setSelectedCase(-1)}
                              className={`px-3 py-1 rounded-lg text-[13px] transition-colors ${
                                selectedCase === -1 ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/[0.06]'
                              }`}
                            >
                              Custom
                            </button>
                          )}
                        </div>

                        {(() => {
                          const shown = selectedCase === -1
                            ? activeRunResult.customResult
                            : activeRunResult.results?.[selectedCase];
                          if (!shown) return null;
                          return (
                            <div>
                              {shown.compileOutput ? (
                                <LcBox label="Compile Error" value={shown.compileOutput} tone="text-[#ef4743]" />
                              ) : (
                                <>
                                  {selectedCase !== -1 && (
                                    <div className="mb-3 text-[13px]">
                                      <span className={shown.passed ? 'text-[#28c244]' : 'text-[#ef4743]'}>
                                        {shown.passed ? 'Accepted' : (shown.status?.description || 'Wrong Answer')}
                                      </span>
                                    </div>
                                  )}
                                  <LcBox label="Input" value={shown.input} />
                                  <LcBox label="Output" value={shown.stdout} />
                                  {selectedCase !== -1 && <LcBox label="Expected" value={shown.expected} />}
                                  <LcBox label="Stderr" value={shown.stderr} tone="text-[#ef4743]" />
                                  {shown.message && <LcBox label="Note" value={shown.message} tone="text-[#ffb800]" />}
                                </>
                              )}
                              <div className="flex items-center gap-6 text-[12px] text-white/50">
                                {shown.time && <span>Runtime <span className="text-white/80">{Math.round(Number(shown.time) * 1000)} ms</span></span>}
                                {shown.memory && <span>Memory <span className="text-white/80">{(shown.memory / 1024).toFixed(1)} MB</span></span>}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {!lastAction && !judgeError && !judgeBusy && (
                      <div className="text-[13px] text-white/40">
                        You must run your code first.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
