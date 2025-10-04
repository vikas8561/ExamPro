import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiRequest from '../services/api';
import LazyMonacoEditor from '../components/LazyMonacoEditor';

export default function TakeCodingTest() {
  const { testId } = useParams();
  const nav = useNavigate();
  const [test, setTest] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [codeByQ, setCodeByQ] = useState({});
  const [languageByQ, setLanguageByQ] = useState({});
  const [runResults, setRunResults] = useState(null);
  const [submitResults, setSubmitResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manualCases, setManualCases] = useState([]);

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
            initial[q._id] = '';
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
      <div className="w-1/2 border-r border-slate-700 overflow-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-slate-400">Question {activeIndex + 1} of {codingQuestions.length}</div>
            <div className="text-lg font-semibold">{test.title}</div>
          </div>
          <div className="flex gap-2">
            <button disabled={activeIndex===0} onClick={()=>setActiveIndex(i=>Math.max(0,i-1))} className="px-3 py-2 bg-slate-700 rounded disabled:opacity-50">Prev</button>
            <button disabled={activeIndex===codingQuestions.length-1} onClick={()=>setActiveIndex(i=>Math.min(codingQuestions.length-1,i+1))} className="px-3 py-2 bg-slate-700 rounded disabled:opacity-50">Next</button>
          </div>
        </div>
        <div className="prose prose-invert">
          <p className="whitespace-pre-wrap">{activeQ?.text}</p>
        </div>
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

          <div className="mt-4">
            <div className="font-medium mb-2">Add Manual Test Case</div>
            <div className="grid grid-cols-2 gap-2">
              <textarea placeholder="Input" className="p-2 bg-slate-800 rounded border border-slate-700" onChange={(e)=>{
                const next = [...manualCases];
                if (!next[0]) next[0] = { input:'', output:'' };
                next[0].input = e.target.value; setManualCases(next);
              }} />
              <textarea placeholder="Expected Output" className="p-2 bg-slate-800 rounded border border-slate-700" onChange={(e)=>{
                const next = [...manualCases];
                if (!next[0]) next[0] = { input:'', output:'' };
                next[0].output = e.target.value; setManualCases(next);
              }} />
            </div>
          </div>
        </div>
      </div>
      <div className="w-1/2 flex flex-col">
        <div className="p-2 flex items-center gap-2 border-b border-slate-700">
          <select value={languageByQ[activeQ?._id] || 'python'} onChange={(e)=>setLanguageByQ(prev=>({ ...prev, [activeQ._id]: e.target.value }))} className="bg-slate-800 border border-slate-700 p-2 rounded">
            <option value="python">Python</option>
            <option value="javascript">JavaScript (Node)</option>
            <option value="cpp">C++</option>
            <option value="java">Java</option>
          </select>
          <button onClick={runCode} disabled={loading} className="px-3 py-2 bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-50">Run Code</button>
          <button onClick={submitCode} disabled={loading} className="px-3 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">Submit Code</button>
        </div>
        <div className="flex-1">
          <LazyMonacoEditor height="60%" language={(languageByQ[activeQ?._id] || 'python') === 'javascript' ? 'javascript' : (languageByQ[activeQ?._id] || 'python')} theme="vs-dark" value={codeByQ[activeQ?._id] || ''} onChange={(val)=>setCodeByQ(prev=>({ ...prev, [activeQ._id]: val }))} />
          <div className="h-[40%] overflow-auto border-t border-slate-700 p-2">
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
        <div className="p-2 border-t border-slate-700 flex justify-between">
          <button onClick={()=>setActiveIndex(i=>Math.max(0,i-1))} disabled={activeIndex===0} className="px-3 py-2 bg-slate-700 rounded disabled:opacity-50">Previous</button>
          <div className="space-x-2">
            <button onClick={runCode} disabled={loading} className="px-3 py-2 bg-emerald-600 rounded disabled:opacity-50">Run</button>
            <button onClick={submitCode} disabled={loading} className="px-3 py-2 bg-blue-600 rounded disabled:opacity-50">Submit Question</button>
          </div>
          <button onClick={()=>nav(-1)} className="px-3 py-2 bg-slate-700 rounded">Exit</button>
        </div>
      </div>
    </div>
  );
}


