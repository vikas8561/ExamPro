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
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [manualCases, setManualCases] = useState([]);
  const [fontSize, setFontSize] = useState('medium');
  const [editorTheme, setEditorTheme] = useState('vs-dark');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const [activeTestCaseIndex, setActiveTestCaseIndex] = useState(0);
  const [outputVersion, setOutputVersion] = useState(0);

  useEffect(() => {
    // Check authentication first
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to access coding tests. You will be redirected to the login page.');
      window.location.href = '/login';
      return;
    }

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
        if (e.message && e.message.includes('Authentication required')) {
          alert('Your session has expired. Please log in again.');
          window.location.href = '/login';
        }
      }
    };
    load();
  }, [testId]);

  const codingQuestions = useMemo(() => (test?.questions || []).filter(q => q.kind === 'coding'), [test]);
  const activeQ = codingQuestions[activeIndex];

  const fontSizeMap = {
    'small': 18,
    'medium': 22,
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
      case 'c':
        return `#include <stdio.h>

int main() {
    // Write your solution here
    return 0;
}`;
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
    
    // Check authentication before making request
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to run code. You will be redirected to the login page.');
      window.location.href = '/login';
      return;
    }
    
    setLoadingRun(true);
    setRunResults(null); // Clear previous results to ensure UI updates
    setActiveTestCaseIndex(0); // Reset to first test case to show updated output
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
      setOutputVersion(v => v + 1); // Force re-render of output section
    } catch (e) {
      console.error(e);
      
      // Check for specific error types
      let errorMessage = 'Code execution failed. Please try again later.';
      if (e.message && e.message.includes('401')) {
        errorMessage = 'Authentication required. Please log in again.';
      } else if (e.message && e.message.includes('403')) {
        errorMessage = 'Access denied. Please check your permissions.';
      } else if (e.message && e.message.includes('503')) {
        errorMessage = 'Judge0 service is temporarily unavailable (sleeping). Please wait a moment and try again.';
      } else if (e.message && e.message.includes('429')) {
        errorMessage = 'Too many requests sent too quickly. Please wait a moment and try again.';
      } else if (e.message && e.message.includes('Judge0 error')) {
        errorMessage = 'Code execution service error. Please try again.';
      }
      
      alert(`Run failed: ${errorMessage}`);
      
      // Set error results to show in UI
      const errorResults = (activeQ?.visibleTestCases || []).map(tc => ({
        input: tc.input,
        expected: tc.output,
        stdout: '',
        stderr: errorMessage,
        passed: false,
        status: { description: 'Error' }
      }));
      setRunResults({ results: errorResults, passed: 0, total: errorResults.length });
      setOutputVersion(v => v + 1); // Force re-render of output section
    } finally {
      setLoadingRun(false);
    }
  };

  const submitCode = async () => {
    if (!activeQ) return;
    
    // Check authentication before making request
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to submit code. You will be redirected to the login page.');
      window.location.href = '/login';
      return;
    }
    
    setLoadingSubmit(true);
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
      setActiveTab('submissions'); // Automatically switch to submissions tab
    } catch (e) {
      console.error(e);
      
      // Check for specific error types
      let errorMessage = 'Submit failed. Please try again later.';
      if (e.message && e.message.includes('401')) {
        errorMessage = 'Authentication required. Please log in again.';
      } else if (e.message && e.message.includes('403')) {
        errorMessage = 'Access denied. Please check your permissions.';
      } else if (e.message && e.message.includes('503')) {
        errorMessage = 'Judge0 service is temporarily unavailable (sleeping). Please wait a moment and try again.';
      } else if (e.message && e.message.includes('429')) {
        errorMessage = 'Too many requests sent too quickly. Please wait a moment and try again.';
      } else if (e.message && e.message.includes('Judge0 error')) {
        errorMessage = 'Code execution service error. Please try again.';
      }
      
      alert(`Submit failed: ${errorMessage}`);
    } finally {
      setLoadingSubmit(false);
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
              <button
                disabled={activeIndex===0}
                onClick={()=>setActiveIndex(i=>Math.max(0,i-1))}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 shadow-lg shadow-purple-500/30 flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Prev
              </button>
              <button
                disabled={activeIndex===codingQuestions.length-1}
                onClick={()=>setActiveIndex(i=>Math.min(codingQuestions.length-1,i+1))}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 shadow-lg shadow-indigo-500/30 flex items-center gap-2"
              >
                Next
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <button
              onClick={()=>nav(-1)}
              className="px-4 py-2 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-red-500/30 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              End Test
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {activeQ?.difficulty && (
              <span className="bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs px-3 py-1 rounded-full shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {activeQ.difficulty}
              </span>
            )}
            {activeQ?.topics && activeQ.topics.length > 0 && activeQ.topics.map((topic, idx) => (
              <span key={idx} className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white text-xs px-3 py-1 rounded-full shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                {topic}
              </span>
            ))}
            {activeQ?.companies && activeQ.companies.length > 0 && (
              <span className="bg-gradient-to-r from-yellow-500 to-orange-600 text-yellow-100 text-xs px-3 py-1 rounded-full shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 1.343-3 3v3h6v-3c0-1.657-1.343-3-3-3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m7-7h-2M5 12H3" />
                </svg>
                Companies
              </span>
            )}
            {activeQ?.hint && (
              <span className="bg-gradient-to-r from-purple-500 to-pink-600 text-white text-xs px-3 py-1 rounded-full shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M12 3a9 9 0 110 18 9 9 0 010-18z" />
                </svg>
                Hint
              </span>
            )}
          </div>
        </div>

        <div className="mb-4 border-b border-gradient-to-r from-purple-500 to-pink-500">
          <nav className="flex space-x-2 text-sm font-medium" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('description')}
              className={`px-4 py-3 rounded-t-lg transition-all duration-300 transform hover:scale-105 flex items-center gap-2 ${
                activeTab === 'description'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/50'
                  : 'text-slate-400 hover:text-white hover:bg-gradient-to-r hover:from-slate-700 hover:to-slate-600 hover:shadow-md'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Description
            </button>
            <button
              onClick={() => setActiveTab('submissions')}
              className={`px-4 py-3 rounded-t-lg transition-all duration-300 transform hover:scale-105 flex items-center gap-2 ${
                activeTab === 'submissions'
                  ? 'bg-gradient-to-r from-green-600 to-teal-600 text-white shadow-lg shadow-green-500/50'
                  : 'text-slate-400 hover:text-white hover:bg-gradient-to-r hover:from-slate-700 hover:to-slate-600 hover:shadow-md'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
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
                  <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Examples
                  </h3>
                  {activeQ.examples.map((example, index) => (
                    <div key={index} className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-4 shadow-lg hover:shadow-xl transition-all duration-300 ">
                      <div className="mb-3">
                        <span className="text-sm font-semibold text-slate-200 bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">Example {index + 1}:</span>
                      </div>
                      {example.input && (
                        <div className="mb-3">
                          <div className="text-sm text-slate-400 mb-2 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                            </svg>
                            Input:
                          </div>
                          <pre className="bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-600 rounded-lg p-3 text-sm text-slate-200 whitespace-pre-wrap shadow-inner overflow-x-auto">{example.input}</pre>
                        </div>
                      )}
                      {example.output && (
                        <div className="mb-3">
                          <div className="text-sm text-slate-400 mb-2 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            Output:
                          </div>
                          <pre className="bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-600 rounded-lg p-3 text-sm text-slate-200 whitespace-pre-wrap shadow-inner overflow-x-auto">{example.output}</pre>
                        </div>
                      )}
                      {example.explanation && (
                        <div>
                          <div className="text-sm text-slate-400 mb-2 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M12 3a9 9 0 110 18 9 9 0 010-18z" />
                            </svg>
                            Explanation:
                          </div>
                          <div className="text-sm text-slate-200 whitespace-pre-wrap bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-600 rounded-lg p-3 shadow-inner">{example.explanation}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}
          {activeTab === 'submissions' && (
            <div>
              {submitResults ? (
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-white mb-4">Submission Results</h3>
                  <div className="space-y-1 max-h-96 overflow-y-auto">
                    {submitResults.results.map((result, idx) => (
                      <div key={idx} className={`flex items-center justify-between rounded-lg p-3 border transition-all duration-300 ${
                        result.passed
                          ? 'bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-green-700/50 shadow-lg shadow-green-500/10'
                          : 'bg-gradient-to-r from-red-900/20 to-pink-900/20 border-red-700/50 shadow-lg shadow-red-500/10'
                      }`}>
                        <span className="text-sm text-slate-200 font-medium">Test Case {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          {result.passed ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                          <span className={`text-sm font-semibold ${result.passed ? 'text-green-400' : 'text-red-400'}`}>
                            {result.passed ? 'Passed' : 'Failed'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-slate-400">No submissions yet.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="w-1/2 flex flex-col overflow-auto">
        <div className="p-3 flex items-center justify-between border-b border-slate-700 bg-gradient-to-r from-slate-800 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="text-slate-300 font-semibold text-lg flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Code
            </div>
            {autoSaveEnabled && lastSaved && (
              <div className=" text-green-400 flex items-center gap-1  px-1 py-0  border-green-700/50 shadow-md">
                  {/* <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg> */}
                Auto-saved {lastSaved.toLocaleTimeString()}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={formatCode}
              disabled={isFormatting}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 transform hover:scale-105 shadow-lg shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-2"
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
              Format
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
            }} className="bg-slate-800 border border-slate-600 text-slate-200 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 hover:border-slate-500 hover:shadow-md hover:shadow-slate-500/20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="c">C</option>
              <option value="cpp">C++</option>
              <option value="java">Java</option>
            </select>
            <select value={editorTheme} onChange={(e)=>setEditorTheme(e.target.value)} className="bg-slate-800 border border-slate-600 text-slate-200 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 hover:border-slate-500 hover:shadow-md hover:shadow-slate-500/20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="vs-dark">Dark</option>
              <option value="vs">Light</option>
              <option value="hc-black">High Contrast</option>
            </select>
            <select value={fontSize} onChange={(e)=>setFontSize(e.target.value)} className="bg-slate-800 border border-slate-600 text-slate-200 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 hover:border-slate-500 hover:shadow-md hover:shadow-slate-500/20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
              <option value="extra-large">Extra Large</option>
            </select>
          </div>
        </div>
        <div className="flex-1 flex flex-col">
          <LazyMonacoEditor
            height="100%"
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
          <div className="h-[30%] overflow-auto border-t border-slate-700 p-2">
            <div className="p-2 border-t border-slate-700 flex justify-end space-x-2">
              <button
                onClick={runCode}
                disabled={loadingRun}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 shadow-lg shadow-blue-500/30 flex items-center gap-2"
              >
                {loadingRun ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Running...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l.707.707A1 1 0 0012.414 11H13m-3 3a1 1 0 100-2 1 1 0 000 2z" />
                    </svg>
                    Run Code
                  </>
                )}
              </button>
              <button
                onClick={submitCode}
                disabled={loadingSubmit}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 shadow-lg shadow-green-500/30 flex items-center gap-2"
              >
                {loadingSubmit ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Submitting...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Submit Code
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        <div className="p-2 border-t border-slate-700">
          {/* Visible Test Cases Section with tabs */}
          {activeQ?.visibleTestCases && activeQ.visibleTestCases.length > 0 && runResults && (
            <div className="mb-4">
              <h3 className="font-medium text-white mb-2 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Test Cases
              </h3>
              <div className="flex space-x-2 mb-2 overflow-x-auto max-w-full no-scrollbar">
                {activeQ.visibleTestCases.map((_, idx) => {
                  const isCorrect = runResults ? runResults.results[idx]?.stdout?.trim() === activeQ.visibleTestCases[idx].output?.trim() : null;
                  const isSelected = activeTestCaseIndex === idx;
                  let bgClass, textClass, shadowClass;
                  if (runResults) {
                    if (isSelected) {
                      bgClass = 'bg-gradient-to-r from-slate-600 to-slate-700';
                      textClass = 'text-white';
                      shadowClass = 'shadow-lg shadow-slate-500/30';
                    } else {
                      bgClass = isCorrect ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-red-500 to-pink-600';
                      textClass = 'text-white';
                      shadowClass = isCorrect ? 'shadow-lg shadow-green-500/30' : 'shadow-lg shadow-red-500/30';
                    }
                  } else {
                    bgClass = 'bg-gradient-to-r from-slate-700 to-slate-800';
                    textClass = 'text-slate-400';
                    shadowClass = 'shadow-md shadow-slate-500/20';
                  }
                  const hoverClass = isSelected ? '' : 'hover:shadow-lg hover:scale-105 transition-all duration-300';
                  return (
                    <button
                      key={idx}
                      onClick={() => setActiveTestCaseIndex(idx)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${bgClass} ${textClass} ${shadowClass} ${hoverClass} flex items-center gap-1`}
                    >
                      {isCorrect !== null && (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={isCorrect ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} />
                        </svg>
                      )}
                      Case {idx + 1}
                    </button>
                  );
                })}
              </div>
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg p-4 shadow-lg flex-1 overflow-y-auto">
                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-slate-400 mb-2 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                      </svg>
                      Input:
                    </div>
                    <pre className="bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-600 rounded-lg p-3 text-sm text-slate-200 whitespace-pre-wrap overflow-x-auto shadow-inner">
                      {activeQ.visibleTestCases[activeTestCaseIndex].input}
                    </pre>
                  </div>
                  <div>
                    <div className="text-sm text-slate-400 mb-2 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Expected Output:
                    </div>
                    <pre className="bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-600 rounded-lg p-3 text-sm text-slate-200 whitespace-pre-wrap overflow-x-auto shadow-inner">
                      {activeQ.visibleTestCases[activeTestCaseIndex].output}
                    </pre>
                  </div>
                  <div>
                    <div className="text-sm text-slate-400 mb-2 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Your Output:
                    </div>
                    <pre key={`output-${outputVersion}-${activeTestCaseIndex}`} className="bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-600 rounded-lg p-3 text-sm text-slate-200 whitespace-pre-wrap overflow-x-auto shadow-inner">
                      {runResults?.results[activeTestCaseIndex]?.stdout || runResults?.results[activeTestCaseIndex]?.stderr || 'Run code to see output'}
                    </pre>
                  </div>
                  {runResults && (
                    <div>
                      <div className="text-sm text-slate-400 mb-2 flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Result:
                      </div>
                      <div className={`text-lg font-bold flex items-center gap-2 ${runResults.results[activeTestCaseIndex]?.stdout?.trim() === activeQ.visibleTestCases[activeTestCaseIndex].output?.trim() ? 'text-green-400' : 'text-red-400'}`}>
                        {runResults.results[activeTestCaseIndex]?.stdout?.trim() === activeQ.visibleTestCases[activeTestCaseIndex].output?.trim() ? (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Correct
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Incorrect
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
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
