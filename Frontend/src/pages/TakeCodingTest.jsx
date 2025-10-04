import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiRequest from '../services/api';
import LazyMonacoEditor from '../components/LazyMonacoEditor';

export default function TakeCodingTest() {
  const { testId } = useParams();
  const nav = useNavigate();
  const [test, setTest] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('description');
  const [codeByQ, setCodeByQ] = useState({});
  const [languageByQ, setLanguageByQ] = useState({});
  const [runResults, setRunResults] = useState(null);
  const [submitResults, setSubmitResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manualCases, setManualCases] = useState([]);
  const [fontSize, setFontSize] = useState('medium');
  const [editorTheme, setEditorTheme] = useState('vs-dark');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const t = await apiRequest(`/tests/${testId}`);
        setTest(t);
        const initial = {};
        const langs = {};
        (t.questions || []).forEach(q => {
          if (q.kind === 'coding') {
            langs[q._id] = q.language || 'python';
            // Provide basic code template for the language
            initial[q._id] = getLanguageTemplate(langs[q._id]);
          }
        });
        setLanguageByQ(langs);
        setCodeByQ(initial);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [testId]);

  const codingQuestions = useMemo(() => (test?.questions || []).filter(q => q.kind === 'coding'), [test]);
  const activeQ = codingQuestions[activeIndex];

  const fontSizeMap = {
    'small': 16,
    'medium': 18,
    'large': 25,
    'extra-large': 30
  };

  const getLanguageTemplate = (language) => {
    switch (language) {
      case 'python':
        return `def solution():
    # Write your solution here
    pass

if __name__ == "__main__":
    solution()`;
      case 'javascript':
        return `function solution() {
    // Write your solution here
}

// Call the function
solution();`;
      case 'cpp':
        return `#include <iostream>
#include <vector>
#include <string>

using namespace std;

int main() {
    // Write your solution here
    return 0;
}`;
      case 'java':
        return `public class Solution {
    public static void main(String[] args) {
        // Write your solution here
    }
}`;
      default:
        return '';
    }
  };

  // Auto-save functionality
  useEffect(() => {
    if (!autoSaveEnabled || !activeQ) return;

    const timer = setTimeout(() => {
      // Simulate auto-save (in real app, this would save to backend)
      setLastSaved(new Date());
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(timer);
  }, [codeByQ, activeQ, autoSaveEnabled]);

  const formatCode = async () => {
    if (!activeQ) return;
    setIsFormatting(true);
    try {
      // Simulate code formatting (in real app, this would use a formatter API)
      const currentCode = codeByQ[activeQ._id] || '';
      // Simple formatting simulation - in real app, use prettier, black, etc.
      const formattedCode = currentCode.split('\n').map(line => line.trim()).join('\n');
      setCodeByQ(prev => ({ ...prev, [activeQ._id]: formattedCode }));
    } catch (e) {
      console.error('Formatting failed', e);
    } finally {
      setIsFormatting(false);
    }
  };

  const runCode = async () => {
    if (!activeQ) return;
    setLoading(true);
    try {
      const resp = await apiRequest('/coding/run', {
        method: 'POST',
        body: JSON.stringify({
          testId: test._id,
          questionId: activeQ._id,
          sourceCode: codeByQ[activeQ._id] || '',
          language: languageByQ[activeQ._id] || activeQ.language
        })
      });
      // Append manual cases locally by re-running expected comparison client-side (simple equality)
      const appended = [...(resp.results || [])];
      manualCases.forEach(tc => {
        appended.push({ input: tc.input, expected: tc.output, stdout: '', stderr: '', passed: false, status: { description: 'Manual' }, marks: 0 });
      });
      setRunResults({ ...resp, results: appended });
    } catch (e) {
      console.error(e);
      alert('Run failed');
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async () => {
    if (!activeQ) return;
    setLoading(true);
    try {
      const resp = await apiRequest('/coding/submit', {
        method: 'POST',
        body: JSON.stringify({
          assignmentId: null,
          // If you require assignment, replace null with actual assignment id
          questionId: activeQ._id,
          sourceCode: codeByQ[activeQ._id] || '',
          language: languageByQ[activeQ._id] || activeQ.language
        })
      });
      setSubmitResults(resp);
    } catch (e) {
      console.error(e);
      alert('Submit failed');
    } finally {
      setLoading(false);
    }
  };

  if (!test) return <div className="p-6">Loading...</div>;

  return (
    <div className="h-[calc(100vh-64px)] flex">
      <div className="w-1/2 border-r border-slate-700 overflow-auto p-4 flex flex-col">
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-slate-400">Question {activeIndex + 1} of {codingQuestions.length}</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold flex items-center gap-2">
              {test.title}
              {submitResults?.passedCount === submitResults?.totalHidden && submitResults?.totalHidden > 0 && (
                <span className="text-green-400 font-semibold text-sm flex items-center gap-1">
                  Solved
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button disabled={activeIndex===0} onClick={()=>setActiveIndex(i=>Math.max(0,i-1))} className="px-3 py-2 bg-slate-700 rounded disabled:opacity-50">Prev</button>
              <button disabled={activeIndex===codingQuestions.length-1} onClick={()=>setActiveIndex(i=>Math.min(codingQuestions.length-1,i+1))} className="px-3 py-2 bg-slate-700 rounded disabled:opacity-50">Next</button>
            </div>
            <button onClick={()=>nav(-1)} className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded transition-colors">End Test</button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {activeQ?.difficulty && (
              <span className="bg-green-600 text-white text-xs px-2 py-1 rounded">{activeQ.difficulty}</span>
            )}
            {activeQ?.topics && activeQ.topics.length > 0 && activeQ.topics.map((topic, idx) => (
              <span key={idx} className="bg-gray-600 text-white text-xs px-2 py-1 rounded">{topic}</span>
            ))}
            {activeQ?.companies && activeQ.companies.length > 0 && (
              <span className="bg-yellow-700 text-yellow-300 text-xs px-2 py-1 rounded flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 1.343-3 3v3h6v-3c0-1.657-1.343-3-3-3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m7-7h-2M5 12H3" />
                </svg>
                Companies
              </span>
            )}
            {activeQ?.hint && (
              <span className="bg-gray-700 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M12 3a9 9 0 110 18 9 9 0 010-18z" />
                </svg>
                Hint
              </span>
            )}
          </div>
        </div>

        <div className="mb-4 border-b border-slate-700">
          <nav className="flex space-x-4 text-sm font-medium text-slate-400" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('description')}
              className={`px-3 py-2 rounded-t-lg ${activeTab === 'description' ? 'bg-slate-800 text-white' : 'hover:bg-slate-700'}`}
            >
              Description
            </button>
            <button
              onClick={() => setActiveTab('submissions')}
              className={`px-3 py-2 rounded-t-lg ${activeTab === 'submissions' ? 'bg-slate-800 text-white' : 'hover:bg-slate-700'}`}
            >
              Submissions
            </button>
          </nav>
        </div>

        <div className="flex-1 overflow-auto">
          {activeTab === 'description' && (
            <div>
              <div className="prose prose-invert whitespace-pre-wrap mb-6">{activeQ?.text}</div>
              {activeQ?.examples && activeQ.examples.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white mb-3">Examples</h3>
                  {activeQ.examples.map((example, index) => (
                    <div key={index} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                      <div className="mb-2">
                        <span className="text-sm font-medium text-slate-300">Example {index + 1}:</span>
                      </div>
                      {example.input && (
                        <div className="mb-2">
                          <div className="text-sm text-slate-400 mb-1">Input:</div>
                          <pre className="bg-slate-900 border border-slate-600 rounded p-2 text-sm text-slate-200 whitespace-pre-wrap">{example.input}</pre>
                        </div>
                      )}
                      {example.output && (
                        <div className="mb-2">
                          <div className="text-sm text-slate-400 mb-1">Output:</div>
                          <pre className="bg-slate-900 border border-slate-600 rounded p-2 text-sm text-slate-200 whitespace-pre-wrap">{example.output}</pre>
                        </div>
                      )}
                      {example.explanation && (
                        <div>
                          <div className="text-sm text-slate-400 mb-1">Explanation:</div>
                          <div className="text-sm text-slate-200 whitespace-pre-wrap">{example.explanation}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {activeQ?.visibleTestCases && activeQ.visibleTestCases.length > 0 && (
                <div className="mt-4">
                  <div className="font-medium mb-2">Normal Test Cases</div>
                  <div className="space-y-2">
                    {(activeQ?.visibleTestCases || []).map((tc, i) => (
                      <div key={i} className="p-2 bg-slate-800 rounded border border-slate-700 text-sm">
                        <div className="text-slate-400">Input</div>
                        <pre className="whitespace-pre-wrap">{tc.input}</pre>
                        <div className="text-slate-400 mt-1">Expected Output</div>
                        <pre className="whitespace-pre-wrap">{tc.output}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {activeTab === 'submissions' && (
            <div>
              {/* TODO: Implement submissions list */}
              <p className="text-slate-400">No submissions yet.</p>
            </div>
          )}
        </div>
      </div>

      <div className="w-1/2 flex flex-col">
        <div className="p-2 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="text-slate-400 font-semibold">Code</div>
            {autoSaveEnabled && lastSaved && (
              <div className="text-xs text-green-400 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Auto-saved {lastSaved.toLocaleTimeString()}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={formatCode}
              disabled={isFormatting}
              className="bg-slate-800 border border-slate-700 p-2 rounded text-sm transition-colors hover:border-slate-600 hover:bg-slate-700 disabled:opacity-50"
              title="Format Code"
            >
              {isFormatting ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
            </button>
            <select value={languageByQ[activeQ?._id] || 'python'} onChange={(e)=>{
              const newLang = e.target.value;
              setLanguageByQ(prev=>({ ...prev, [activeQ._id]: newLang }));
              // Update code with new language template if code is empty or matches old template
              const currentCode = codeByQ[activeQ._id] || '';
              const oldTemplate = getLanguageTemplate(languageByQ[activeQ._id] || 'python');
              if (currentCode === '' || currentCode === oldTemplate) {
                setCodeByQ(prev=>({ ...prev, [activeQ._id]: getLanguageTemplate(newLang) }));
              }
            }} className="bg-slate-800 border border-slate-700 p-2 rounded text-sm transition-colors hover:border-slate-600">
              <option value="python">Python</option>
              <option value="javascript">JavaScript (Node)</option>
              <option value="cpp">C++</option>
              <option value="java">Java</option>
            </select>
            <select value={editorTheme} onChange={(e)=>setEditorTheme(e.target.value)} className="bg-slate-800 border border-slate-700 p-2 rounded text-sm transition-colors hover:border-slate-600">
              <option value="vs-dark">Dark</option>
              <option value="vs">Light</option>
              <option value="hc-black">High Contrast</option>
            </select>
            <select value={fontSize} onChange={(e)=>setFontSize(e.target.value)} className="bg-slate-800 border border-slate-700 p-2 rounded text-sm transition-colors hover:border-slate-600">
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
              <option value="extra-large">Extra Large</option>
            </select>
          </div>
        </div>
        <div className="flex-1">
          <LazyMonacoEditor
            height="60%"
            language={(languageByQ[activeQ?._id] || 'python') === 'javascript' ? 'javascript' : (languageByQ[activeQ?._id] || 'python')}
            theme={editorTheme}
            value={codeByQ[activeQ?._id] || ''}
            onChange={(val)=>setCodeByQ(prev=>({ ...prev, [activeQ._id]: val }))}
            options={{
              fontSize: fontSizeMap[fontSize],
              minimap: { enabled: true },
              lineNumbers: 'on',
              roundedSelection: false,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              insertSpaces: true,
              wordWrap: 'on',
              folding: true,
              foldingHighlight: true,
              showFoldingControls: 'mouseover',
              matchBrackets: 'always',
              autoClosingBrackets: 'always',
              autoClosingQuotes: 'always',
              suggestOnTriggerCharacters: true,
              acceptSuggestionOnEnter: 'on',
              quickSuggestions: { other: true, comments: true, strings: true },
              parameterHints: { enabled: true },
              hover: { enabled: true },
              contextmenu: true,
              mouseWheelZoom: true,
              smoothScrolling: true,
              cursorBlinking: 'blink',
              renderWhitespace: 'selection',
              renderControlCharacters: true,
              fontLigatures: true,
              fontFamily: "'Fira Code', 'Monaco', 'Consolas', 'Courier New', monospace",
              fontWeight: '400',
              letterSpacing: 0.5,
              lineHeight: 1.5,
              padding: { top: 16, bottom: 16 },
              // Enhanced syntax highlighting features
              semanticHighlighting: { enabled: true },
              colorDecorators: true,
              bracketPairColorization: { enabled: true },
              inlayHints: { enabled: 'on' },
              codeLens: true,
              semanticTokens: true,
              colorPicker: true,
              lightbulb: { enabled: 'on' },
              occurrencesHighlight: 'singleFile',
              selectionHighlight: true,
              definitionLinkOpensInPeek: true,
              showUnused: true,
              showDeprecated: true,
              guides: {
                bracketPairs: true,
                indentation: true
              }
            }}
          />
          <div className="h-[40%] overflow-auto border-t border-slate-700 p-2">
            {/* Visible Test Cases Section */}
            {activeQ?.visibleTestCases && activeQ.visibleTestCases.length > 0 && (
              <div className="mb-4">
                <h3 className="font-medium text-white mb-2">Visible Test Cases</h3>
                <div className="space-y-2">
                  {activeQ.visibleTestCases.map((tc, index) => (
                    <div key={index} className="bg-slate-800 border border-slate-700 rounded p-2">
                      <div className="mb-2">
                        <span className="text-sm font-medium text-slate-300">Case {index + 1}</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Input:</div>
                          <pre className="bg-slate-900 border border-slate-600 rounded p-1 text-xs text-slate-200 whitespace-pre-wrap">{tc.input}</pre>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Expected Output:</div>
                          <pre className="bg-slate-900 border border-slate-600 rounded p-1 text-xs text-slate-200 whitespace-pre-wrap">{tc.output}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {runResults && (
              <div className="mb-3">
                <div className="font-medium mb-1">Run Results: {runResults.passed}/{runResults.total} passed</div>
                <div className="space-y-2 text-xs">
                  {runResults.results.map((r, i) => (
                    <div key={i} className={`p-2 rounded border ${r.passed ? 'border-emerald-700 bg-emerald-900/20' : 'border-red-700 bg-red-900/20'}`}>
                      <div className="flex justify-between"><span>Case {i+1}</span><span>{r.passed ? 'Passed' : 'Failed'}</span></div>
                      <div className="mt-1 text-slate-400">Input</div>
                      <pre className="whitespace-pre-wrap">{r.input}</pre>
                      <div className="mt-1 text-slate-400">Expected</div>
                      <pre className="whitespace-pre-wrap">{r.expected}</pre>
                      {r.stdout && <>
                        <div className="mt-1 text-slate-400">Output</div>
                        <pre className="whitespace-pre-wrap">{r.stdout}</pre>
                      </>}
                      {r.stderr && <>
                        <div className="mt-1 text-slate-400">Error</div>
                        <pre className="whitespace-pre-wrap">{r.stderr}</pre>
                      </>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {submitResults && (
              <div>
                <div className="font-medium mb-1">Hidden Cases: {submitResults.passedCount}/{submitResults.totalHidden} passed</div>
                <div className="text-sm">Marks: {submitResults.earnedMarks}/{submitResults.totalMarks}</div>
              </div>
            )}
          </div>
        </div>
        <div className="p-2 border-t border-slate-700 flex justify-end space-x-2">
          <button
            onClick={runCode}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-50 transition-all duration-200 flex items-center gap-2 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                Running...
              </>
            ) : (
              <>
                Run Code
              </>
            )}
          </button>
          <button
            onClick={submitCode}
            disabled={loading}
            className="px-4 py-2 bg-white text-black hover:bg-gray-100 rounded disabled:opacity-50 transition-all duration-200 flex items-center gap-2 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                Submitting...
              </>
            ) : (
              <>
                Submit Code
              </>
            )}
          </button>
        </div>
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowShortcuts(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-slate-400 hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-300">Save</span>
                <kbd className="bg-slate-700 px-2 py-1 rounded text-xs">Ctrl+S</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Find</span>
                <kbd className="bg-slate-700 px-2 py-1 rounded text-xs">Ctrl+F</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Replace</span>
                <kbd className="bg-slate-700 px-2 py-1 rounded text-xs">Ctrl+H</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Command Palette</span>
                <kbd className="bg-slate-700 px-2 py-1 rounded text-xs">F1</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Toggle Comment</span>
                <kbd className="bg-slate-700 px-2 py-1 rounded text-xs">Ctrl+/</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Format Document</span>
                <kbd className="bg-slate-700 px-2 py-1 rounded text-xs">Shift+Alt+F</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Fold All</span>
                <kbd className="bg-slate-700 px-2 py-1 rounded text-xs">Ctrl+K Ctrl+0</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">Unfold All</span>
                <kbd className="bg-slate-700 px-2 py-1 rounded text-xs">Ctrl+K Ctrl+J</kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


