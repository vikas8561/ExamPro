import React, { useMemo, useState } from 'react';
import LazyMonacoEditor from './LazyMonacoEditor';
import apiRequest from '../services/api';

export default function Judge0CodeEditor({
  testId,
  questionId,
  assignmentId,
  initialLanguage = 'python',
  initialCode = '',
  onRun,
  onSubmit,
  className = ''
}) {
  const boilerplates = {
    python: `# Write your Python solution here\n`,
    javascript: `// Write your JavaScript solution here\n`,
    c: `#include <stdio.h>\n\nint main() {\n    // Write your C solution here\n    return 0;\n}\n`,
    cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main(){\n    // Write your C++ solution here\n    return 0;\n}\n`,
    java: `public class Main {\n    public static void main(String[] args) {\n        // Write your Java solution here\n    }\n}\n`
  };

  const [language, setLanguage] = useState(initialLanguage);
  const [code, setCode] = useState(initialCode || boilerplates[initialLanguage] || "");
  const [manualCase, setManualCase] = useState({ input: '', output: '' });
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runResults, setRunResults] = useState(null);
  const [submitResults, setSubmitResults] = useState(null);
  const [activeTab, setActiveTab] = useState('testcase'); // 'testcase' | 'result'
  const [fontSize, setFontSize] = useState(14);

  const monacoLang = useMemo(() => {
    if (language === 'javascript') return 'javascript';
    if (language === 'cpp') return 'cpp';
    if (language === 'c') return 'cpp'; // use C++ syntax highlighting for C
    if (language === 'java') return 'java';
    return 'python';
  }, [language]);

  const lastBoilerRef = React.useRef(boilerplates[initialLanguage] || "");
  const handleLanguageChange = (nextLang) => {
    // If current code equals previous boilerplate or is empty, replace with new boilerplate
    const current = code || "";
    if (current.trim() === "" || current === lastBoilerRef.current) {
      const bp = boilerplates[nextLang] || "";
      setCode(bp);
      lastBoilerRef.current = bp;
    }
    setLanguage(nextLang);
  };

  const handleRun = async () => {
    if (!testId || !questionId) {
      alert('Missing test/question.');
      return;
    }
    setRunning(true);
    try {
      const resp = await apiRequest('/coding/run', {
        method: 'POST',
        body: JSON.stringify({ testId, questionId, sourceCode: code, language })
      });
      const appended = [...(resp.results || [])];
      if (manualCase.input || manualCase.output) {
        appended.push({ input: manualCase.input, expected: manualCase.output, stdout: '', stderr: '', passed: false, status: { description: 'Manual' }, marks: 0 });
      }
      const result = { ...resp, results: appended };
      setRunResults(result);
      onRun && onRun(result);
      setActiveTab('result');
    } catch (e) {
      console.error(e);
      alert('Run failed');
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!questionId) {
      alert('Missing question.');
      return;
    }
    setSubmitting(true);
    try {
      const resp = await apiRequest('/coding/submit', {
        method: 'POST',
        body: JSON.stringify({ assignmentId: assignmentId || null, questionId, sourceCode: code, language })
      });
      setSubmitResults(resp);
      onSubmit && onSubmit(resp);
      setActiveTab('result');
    } catch (e) {
      console.error(e);
      alert('Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`h-full flex flex-col bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden shadow-lg ${className}`}>
      <div className="p-3 flex items-center gap-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <select value={language} onChange={(e)=>handleLanguageChange(e.target.value)} className="bg-slate-900 text-white p-2 pr-6 outline-none cursor-pointer border border-slate-700 rounded">
            <option className="bg-slate-900 text-white" value="python">Python</option>
            <option className="bg-slate-900 text-white" value="javascript">JavaScript</option>
            <option className="bg-slate-900 text-white" value="c">C</option>
            <option className="bg-slate-900 text-white" value="cpp">C++</option>
            <option className="bg-slate-900 text-white" value="java">Java</option>
          </select>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <select
              value={fontSize}
              onChange={(e)=>setFontSize(Number(e.target.value))}
              className="bg-slate-900 text-white p-2 pr-6 outline-none cursor-pointer border border-slate-700 rounded"
            >
              <option className="bg-slate-900 text-white" value={12}>12 px</option>
              <option className="bg-slate-900 text-white" value={13}>13 px</option>
              <option className="bg-slate-900 text-white" value={14}>14 px</option>
              <option className="bg-slate-900 text-white" value={15}>15 px</option>
              <option className="bg-slate-900 text-white" value={16}>16 px</option>
              <option className="bg-slate-900 text-white" value={18}>18 px</option>
              <option className="bg-slate-900 text-white" value={20}>20 px</option>
              <option className="bg-slate-900 text-white" value={22}>22 px</option>
              <option className="bg-slate-900 text-white" value={24}>24 px</option>
              <option className="bg-slate-900 text-white" value={25}>25 px</option>
              <option className="bg-slate-900 text-white" value={28}>28 px</option>
              <option className="bg-slate-900 text-white" value={30}>30 px</option>
            </select>
          </div>
          {runResults && (
            <span className="px-2 py-1 text-xs rounded-full bg-emerald-900/30 border border-emerald-700 text-emerald-300">Run: {runResults.passed}/{runResults.total}</span>
          )}
          {submitResults && (
            <span className="px-2 py-1 text-xs rounded-full bg-blue-900/30 border border-blue-700 text-blue-300">Hidden: {submitResults.passedCount}/{submitResults.totalHidden}</span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <LazyMonacoEditor
          height="100%"
          language={monacoLang}
          theme="vs-dark"
          value={code}
          onChange={(val)=>setCode(val)}
          options={{ fontSize, minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 12, bottom: 12 } }}
        />
      </div>

      <div className="p-3 border-t border-slate-700 max-h-40 overflow-y-auto">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={()=>setActiveTab('testcase')} className={`px-3 py-1.5 text-xs rounded-md border ${activeTab==='testcase' ? 'bg-slate-700/60 border-slate-500 text-slate-100' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'}`}>Testcase</button>
          <button onClick={()=>setActiveTab('result')} className={`px-3 py-1.5 text-xs rounded-md border ${activeTab==='result' ? 'bg-slate-700/60 border-slate-500 text-slate-100' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'}`}>Test Result</button>
        </div>
        {activeTab==='result' ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="overflow-auto max-h-32 p-2 bg-slate-900/50 rounded-lg border border-slate-700">
              {runResults && (
                <div>
                  <div className="text-sm font-medium mb-2">Passed {runResults.passed}/{runResults.total}</div>
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
                <div className="text-sm mt-2">
                  <div className="mb-1">Hidden Cases Passed {submitResults.passedCount}/{submitResults.totalHidden}</div>
                  <div>Marks: {submitResults.earnedMarks}/{submitResults.totalMarks}</div>
                </div>
              )}
              {!runResults && (
                <div className="text-slate-400 text-sm">Run your code to see results here.</div>
              )}
              {!submitResults && (
                <div className="text-slate-400 text-sm">Submit your code to evaluate hidden test cases.</div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 text-slate-400 text-sm">Use Testcase tab to add custom cases.</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <textarea className="p-2 bg-slate-900 border border-slate-700 rounded" placeholder="Input" value={manualCase.input} onChange={(e)=>setManualCase(mc=>({ ...mc, input: e.target.value }))} />
            <textarea className="p-2 bg-slate-900 border border-slate-700 rounded" placeholder="Expected Output" value={manualCase.output} onChange={(e)=>setManualCase(mc=>({ ...mc, output: e.target.value }))} />
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-slate-700 flex-shrink-0 flex justify-end gap-2">
        <button onClick={handleRun} disabled={running}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${running ? 'bg-slate-700/60 cursor-not-allowed text-slate-300' : 'bg-slate-700 hover:bg-slate-600 text-white hover:scale-[1.01]'}`}>
          {running ? 'Running...' : 'Run'}
        </button>
        <button onClick={handleSubmit} disabled={submitting}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${submitting ? 'bg-green-700/60 cursor-not-allowed text-white' : 'bg-green-600 hover:bg-green-700 text-white hover:scale-[1.01]'}`}>
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </div>
  );
}


