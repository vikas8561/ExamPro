import React, { memo, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Editor from '@monaco-editor/react';
import { getMonacoState, loadMonaco, subscribeMonaco } from './loadMonaco';
import { Spinner } from './codingUi';

// How long the spinner may show before the student is handed the basic editor
// to start writing in. Monaco keeps loading behind it.
const SLOW_AFTER_MS = 10000;

const INDENT = '    ';

/**
 * Insert text at the caret as if typed, so the browser keeps its own undo
 * history and fires the input event React listens for. `execCommand` is
 * deprecated but still the only way to get both in Chrome and Edge; the manual
 * path is the fallback.
 */
function insertAtCaret(textarea, text, onChange) {
  textarea.focus();
  if (document.execCommand?.('insertText', false, text)) return;
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  onChange(value.slice(0, start) + text + value.slice(end));
  requestAnimationFrame(() => {
    textarea.selectionStart = start + text.length;
    textarea.selectionEnd = start + text.length;
  });
}

/**
 * A plain textarea that is always available. Used while Monaco is slow to
 * arrive or after it has failed, so a student is never left unable to write.
 * Tab indents and Enter keeps the current indentation, which is the minimum
 * needed to write Python in it.
 */
function BasicEditor({ value, onChange, theme, fontSize, onFocus }) {
  const dark = theme !== 'vs';

  const handleKeyDown = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const textarea = event.currentTarget;

    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      insertAtCaret(textarea, INDENT, onChange);
    } else if (event.key === 'Enter' && !event.shiftKey) {
      const lineStart = textarea.value.lastIndexOf('\n', textarea.selectionStart - 1) + 1;
      const indent = /^[ \t]*/.exec(textarea.value.slice(lineStart, textarea.selectionStart))[0];
      if (!indent) return;
      event.preventDefault();
      insertAtCaret(textarea, `\n${indent}`, onChange);
    }
  };

  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
      spellCheck={false}
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      wrap="off"
      aria-label="Code editor"
      className={`flex-1 min-h-0 w-full resize-none outline-none px-4 py-3 font-mono leading-relaxed ${
        dark ? 'bg-[#1e1e1e] text-[#d4d4d4]' : 'bg-white text-[#1e1e1e]'
      }`}
      style={{ fontSize, tabSize: 4 }}
    />
  );
}

function Banner({ children }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-[12px] bg-[#ffb800]/10 text-[#ffb800] border-b border-[#ffb800]/20 flex-shrink-0">
      {children}
    </div>
  );
}

/**
 * The code editor for one question.
 *
 * Memoised, and expects a stable `onChange`: the page re-renders every second
 * for its countdown, and none of that should reach Monaco. Before, every tick
 * and every keystroke passed Monaco a fresh options object and a fresh change
 * handler, which it re-applied and re-subscribed each time.
 */
function CodeEditor({ value, onChange, language, theme, fontSize }) {
  const { status } = useSyncExternalStore(subscribeMonaco, getMonacoState);
  const [slow, setSlow] = useState(false);
  // Set once the student starts writing in the basic editor, so Monaco
  // arriving later never yanks the editor out from under them mid-sentence.
  const [inBasic, setInBasic] = useState(false);

  useEffect(() => {
    if (status === 'idle') loadMonaco().catch(() => {});
  }, [status]);

  useEffect(() => {
    if (status === 'ready' || slow) return undefined;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [status, slow]);

  const options = useMemo(() => ({
    fontSize,
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
    fontFamily: "'Menlo', 'Monaco', 'Consolas', 'Courier New', monospace",
    lineHeight: 1.6,
    padding: { top: 12, bottom: 12 },
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
  }), [fontSize]);

  if (status === 'ready' && !inBasic) {
    return (
      <Editor
        height="100%"
        language={language}
        theme={theme}
        value={value}
        onChange={onChange}
        options={options}
        loading={<Spinner className="w-5 h-5 text-white/40" />}
      />
    );
  }

  const showBasic = inBasic || status === 'failed' || slow;
  if (!showBasic) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-[13px] text-white/50">
        <Spinner className="w-4 h-4" />
        Loading editor...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {status === 'ready' ? (
        <Banner>
          <span>The full editor is ready.</span>
          <button type="button" onClick={() => setInBasic(false)} className="underline hover:text-white">
            Switch to it
          </button>
        </Banner>
      ) : status === 'failed' ? (
        <Banner>
          <span>The full editor could not load. Keep writing here — your code is saved the same way.</span>
          <button type="button" onClick={() => loadMonaco().catch(() => {})} className="underline hover:text-white whitespace-nowrap">
            Try again
          </button>
        </Banner>
      ) : (
        <Banner>
          <span className="flex items-center gap-2">
            <Spinner className="w-3.5 h-3.5" />
            The full editor is still loading. You can start writing here — nothing will be lost.
          </span>
        </Banner>
      )}
      <BasicEditor
        value={value}
        onChange={onChange}
        theme={theme}
        fontSize={fontSize}
        onFocus={() => setInBasic(true)}
      />
    </div>
  );
}

export default memo(CodeEditor);
