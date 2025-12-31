import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiRequest from '../services/api';
import LazyMonacoEditor from '../components/LazyMonacoEditor';
import Proctoring from '../components/Proctoring';

// Custom Dropdown Component
function CustomDropdown({ value, onChange, options, className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value) || options[0];

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 text-slate-200 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer flex items-center justify-between"
      >
        <span>{selectedOption.label}</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'transform rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 border border-slate-600 rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-h-60 overflow-y-auto custom-dropdown-scrollbar">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`w-full text-left px-4 py-3 text-sm font-medium transition-all duration-200 ${
                  value === option.value
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white'
                    : 'text-slate-200 hover:bg-gradient-to-r hover:from-slate-700 hover:to-slate-600 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{option.label}</span>
                  {value === option.value && (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TakeCodingTest() {
  const { assignmentId } = useParams();
  const nav = useNavigate();
  
  // Debug logging for assignmentId
  console.log('🔍 TakeCodingTest component - assignmentId from useParams:', assignmentId);
  const [test, setTest] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [codeByQ, setCodeByQ] = useState({});
  const [languageByQ, setLanguageByQ] = useState({});
  const [fontSize, setFontSize] = useState('medium');
  const [editorTheme, setEditorTheme] = useState('vs-dark');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  
  // Test state
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [timeSpent, setTimeSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testStarted, setTestStarted] = useState(false);
  const startRequestMade = useRef(false);
  const [showSubmitConfirmModal, setShowSubmitConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const debounceTimers = useRef({});
  
  // Proctoring state
  const [proctoringData, setProctoringData] = useState({
    violationCount: 0,
    violations: [],
  });
  const proctoringRef = useRef(null);

  // Auto-start test if already started, or start it automatically
  useEffect(() => {
    const checkExistingTest = async () => {
      if (assignmentId && !testStarted && !startRequestMade.current && assignment && test) {
        try {
          console.log('🔍 Checking if test is already started...', assignment);
          
          if (assignment.startedAt) {
            // Test already started, load existing data
            console.log('✅ Test already started, loading existing data...');
            await loadExistingTestData();
          } else if (assignment.status === 'Assigned') {
            // Test not started, start it directly
            console.log('🚀 Test not started, starting now...');
            await startTest();
          }
        } catch (error) {
          console.error("Error checking for existing test:", error);
          setError(error.message || "Failed to load test");
          setLoading(false);
          startRequestMade.current = false;
        }
      }
    };

    checkExistingTest();
  }, [assignmentId, testStarted, assignment, test]);

  useEffect(() => {
    console.log('🔄 useEffect triggered with assignmentId:', assignmentId);
    
    // Check authentication first
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to access coding tests. You will be redirected to the login page.');
      window.location.href = '/login';
      return;
    }

    // Only load assignment/test data if not already started
    if (!testStarted) {
      const load = async () => {
        try {
          console.log('📋 Loading assignment with ID:', assignmentId);
          if (!assignmentId) {
            setError('Assignment ID not found in URL');
            setLoading(false);
            return;
          }
          
          // Load assignment first
          const assignmentData = await apiRequest(`/assignments/${assignmentId}`);
          console.log('✅ Assignment loaded:', assignmentData);
          setAssignment(assignmentData);
          
          // Check if assignment is already completed
          if (assignmentData.status === 'Completed') {
            console.log('📋 Assignment already completed, redirecting to results...');
            setError('This test has already been completed. Redirecting to results...');
            setTimeout(() => {
              nav(`/student/view-test/${assignmentData._id}`);
            }, 2000);
            setLoading(false);
            return;
          }
          
          // Load test from assignment
          const t = await apiRequest(`/tests/${assignmentData.testId._id}`);
          console.log('✅ Test loaded:', t);
          setTest(t);
          
          const initial = {};
          const langs = {};
          (t.questions || []).forEach(q => {
            if (q.kind === 'coding') {
              // Use question's language from database, fallback to 'python'
              langs[q._id] = q.language || 'python';
              console.log(`🔤 Question ${q._id} language: ${langs[q._id]}`);
              // Provide basic code template for the language
              initial[q._id] = getLanguageTemplate(langs[q._id]);
            }
          });
          setLanguageByQ(langs);
          setCodeByQ(initial);
          setLoading(false);
        } catch (e) {
          console.error('Error loading assignment/test:', e);
          setError(e.message || 'Failed to load assignment');
          setLoading(false);
          if (e.message && e.message.includes('Authentication required')) {
            alert('Your session has expired. Please log in again.');
            window.location.href = '/login';
          }
        }
      };
      load();
    }
  }, [assignmentId, testStarted]);


  const submitTest = async (cancelledDueToViolation = false, autoSubmit = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const submissionData = {
        assignmentId: assignment._id,
        responses: Object.entries(codeByQ).map(([questionId, code]) => ({
          questionId,
          selectedOption: null,
          textAnswer: code || '',
          language: languageByQ[questionId] || test?.questions?.find(q => q._id === questionId)?.language || 'python', // Save language for mentor review
          isCorrect: false,
          points: 0,
          autoGraded: false,
          geminiFeedback: null,
          correctAnswer: null,
          errorAnalysis: null,
          improvementSteps: [],
          topicRecommendations: []
        })),
        totalScore: 0,
        maxScore: 0,
        submittedAt: new Date().toISOString(),
        timeSpent,
        mentorReviewed: false,
        reviewStatus: 'Pending',
        tabViolationCount: proctoringData.violationCount,
        tabViolations: proctoringData.violations.map((violation) => ({
          timestamp: violation.timestamp instanceof Date
            ? violation.timestamp.toISOString()
            : String(violation.timestamp),
          violationType: String(violation.violationType),
          details: String(violation.details),
          tabCount: Number(violation.tabCount),
        })),
        cancelledDueToViolation: cancelledDueToViolation || (test?.allowedTabSwitches !== -1 && proctoringData.violationCount > (test?.allowedTabSwitches ?? 2)),
        autoSubmit,
      };

      await apiRequest('/test-submissions', {
        method: 'POST',
        body: JSON.stringify(submissionData),
      });

      // Exit fullscreen mode before navigating
      if (proctoringRef.current?.exitFullscreen) {
        await proctoringRef.current.exitFullscreen();
      }

      setIsSubmitting(false);
      nav(`/student/assignments`);
    } catch (error) {
      console.error('Error submitting test:', error);
      setIsSubmitting(false);
      alert('Failed to submit test. Please try again.');
    }
  };

  // Proctoring handlers (defined after submitTest)
  const handleProctoringViolation = useCallback((violationData) => {
    setProctoringData({
      violationCount: violationData.violationCount,
      violations: violationData.violations,
    });
  }, []);

  const handleProctoringSubmit = useCallback((cancelledDueToViolation) => {
    submitTest(cancelledDueToViolation, false);
  }, [submitTest]);

  const handleProctoringExitFullscreen = useCallback(() => {
    // Optional: Add any cleanup logic here
  }, []);

  // Timer countdown
  useEffect(() => {
    if (!testStarted || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Time's up - auto submit
          submitTest(false, true);
          return 0;
        }
        return prev - 1;
      });
      setTimeSpent(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [testStarted, timeRemaining, submitTest]);


  const startTest = async () => {
    if (startRequestMade.current) {
      console.log('⚠️ Start request already made, skipping...');
      return;
    }
    startRequestMade.current = true;

    try {
      console.log('🚀 startTest called');
      console.log('🚀 assignmentId from useParams:', assignmentId);
      console.log('🚀 assignment state:', assignment);
      console.log('🚀 assignment._id:', assignment?._id);
      
      setLoading(true);
      
      // Use assignmentId from URL, fallback to assignment._id
      const finalAssignmentId = assignmentId || assignment?._id;
      
      if (!finalAssignmentId) {
        console.error('❌ No assignment ID available!');
        console.error('❌ assignmentId from URL:', assignmentId);
        console.error('❌ assignment._id:', assignment?._id);
        setError('Assignment ID not found');
        setLoading(false);
        startRequestMade.current = false;
        return;
      }
      
      console.log('✅ Using assignmentId:', finalAssignmentId);
      
      // Check if assignment is already completed
      const assignmentCheck = assignment || await apiRequest(`/assignments/${finalAssignmentId}`);
      if (assignmentCheck?.status === 'Completed') {
        console.log('❌ Cannot start completed test');
        setError('This test has already been completed. Redirecting to results...');
        setTimeout(() => {
          nav(`/student/view-test/${assignmentCheck._id}`);
        }, 2000);
        setLoading(false);
        startRequestMade.current = false;
        return;
      }
      
      // Fetch current server time (same as TakeTest.jsx)
      const timeResponse = await apiRequest("/time");
      const serverTime = new Date(timeResponse.serverTime);
      
      const response = await apiRequest(`/assignments/${finalAssignmentId}/start`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (response.alreadyStarted) {
        await loadExistingTestData();
        return;
      }

      if (!response.assignment || !response.test) {
        throw new Error("Unexpected response format from backend. Expected assignment and test data.");
      }

      setAssignment(response.assignment);
      setTest(response.test);

      // Calculate timeRemaining the same way as TakeTest.jsx
      const testTimeLimit = response.test.timeLimit;
      const totalSeconds = testTimeLimit * 60;
      const testStartTime = new Date(
        response.assignment.startedAt || response.assignment.startTime
      );
      const currentTime = serverTime; // Use server time instead of client time
      const elapsedSeconds = Math.floor((currentTime - testStartTime) / 1000);
      const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

      console.log('⏰ Time calculation:', {
        testTimeLimit,
        totalSeconds,
        testStartTime: testStartTime.toISOString(),
        currentTime: currentTime.toISOString(),
        elapsedSeconds,
        remainingSeconds
      });

      setTimeRemaining(remainingSeconds);
      setTestStarted(true);
      setLoading(false);

      console.log('🚀 Test started! testStarted:', true, 'test:', test);
      console.log('🚀 Proctoring ref:', proctoringRef.current);

      // Request fullscreen mode after test starts (via proctoring component)
      setTimeout(() => {
        console.log('🚀 Requesting fullscreen via proctoring ref:', proctoringRef.current);
        if (proctoringRef.current?.requestFullscreen) {
          proctoringRef.current.requestFullscreen();
        } else {
          console.error('❌ Proctoring ref requestFullscreen not available!');
        }
      }, 100);
    } catch (error) {
      console.error("Error starting test:", error);
      
      // Handle completed test error
      if (error.message === "Test already completed") {
        setError("This test has already been completed. Redirecting to results...");
        setTimeout(() => {
          nav(`/student/view-test/${assignment?._id}`);
        }, 2000);
        return;
      }
      
      setError(error.message || "Failed to start test");
      startRequestMade.current = false;
    }
  };


  const loadExistingTestData = async () => {
    try {
      console.log('📋 Loading existing test data');
      console.log('📋 assignmentId from URL:', assignmentId);
      console.log('📋 assignment._id:', assignment?._id);
      
      // Use assignmentId from URL, fallback to assignment._id
      const finalAssignmentId = assignmentId || assignment?._id;
      
      if (!finalAssignmentId) {
        console.error('❌ No assignment ID available for resume!');
        setError('Assignment ID not found');
        return;
      }
      
      console.log('✅ Using assignmentId for resume:', finalAssignmentId);
      
      // Fetch current server time (same as TakeTest.jsx)
      const timeResponse = await apiRequest("/time");
      const serverTime = new Date(timeResponse.serverTime);
      
      // Get assignment data (same as TakeTest.jsx loadExistingTestData)
      const assignmentData = await apiRequest(`/assignments/${finalAssignmentId}`);
      setAssignment(assignmentData);
      setTest(assignmentData.testId);

      // Calculate timeRemaining the same way as TakeTest.jsx
      const testTimeLimit = assignmentData.testId.timeLimit;
      const totalSeconds = testTimeLimit * 60;
      const testStartTime = new Date(
        assignmentData.startedAt || assignmentData.startTime
      );
      const currentTime = serverTime;
      const elapsedSeconds = Math.floor((currentTime - testStartTime) / 1000);
      const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

      console.log('⏰ Time calculation (resume):', {
        testTimeLimit,
        totalSeconds,
        testStartTime: testStartTime.toISOString(),
        currentTime: currentTime.toISOString(),
        elapsedSeconds,
        remainingSeconds
      });

      setTimeRemaining(remainingSeconds);
      setTestStarted(true);
      setLoading(false);

      // Request fullscreen mode when resuming existing test (via proctoring component)
      setTimeout(() => {
        if (proctoringRef.current?.requestFullscreen) {
          proctoringRef.current.requestFullscreen();
        }
      }, 100);
    } catch (error) {
      console.error("Error loading test data:", error);
      setError(error.message || "Failed to load test data");
      setLoading(false);
    }
  };


  const handleSubmitClick = () => {
    if (isSubmitting) return; // Prevent opening modal if already submitting
    setShowSubmitConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (isSubmitting) return; // Prevent multiple clicks
    setIsSubmitting(true);
    setShowSubmitConfirmModal(false);
    await submitTest();
  };

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

  // CSS styles for scrollbars
  const scrollbarStyles = `
    .coding-test-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    
    .coding-test-scrollbar::-webkit-scrollbar-track {
      background: rgba(30, 41, 59, 0.3);
      border-radius: 10px;
    }
    
    .coding-test-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.4);
      border-radius: 10px;
      transition: background 0.2s ease;
    }
    
    .coding-test-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(148, 163, 184, 0.6);
    }
    
    .coding-test-scrollbar {
      scrollbar-width: thin;
      scrollbar-color: rgba(148, 163, 184, 0.4) rgba(30, 41, 59, 0.3);
    }

    .custom-dropdown-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    
    .custom-dropdown-scrollbar::-webkit-scrollbar-track {
      background: rgba(30, 41, 59, 0.3);
      border-radius: 10px;
    }
    
    .custom-dropdown-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(148, 163, 184, 0.4);
      border-radius: 10px;
      transition: background 0.2s ease;
    }
    
    .custom-dropdown-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(148, 163, 184, 0.6);
    }
    
    .custom-dropdown-scrollbar {
      scrollbar-width: thin;
      scrollbar-color: rgba(148, 163, 184, 0.4) rgba(30, 41, 59, 0.3);
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .animate-in {
      animation: fadeIn 0.2s ease-out;
    }
  `;

  return (
    <>
      {/* Proctoring Component - Always rendered, enabled when testStarted */}
      <Proctoring
        ref={proctoringRef}
        enabled={testStarted}
        test={test}
        onViolation={handleProctoringViolation}
        onSubmit={handleProctoringSubmit}
        onExitFullscreen={handleProctoringExitFullscreen}
        isSubmitting={isSubmitting}
        blockKeyboardShortcuts={true}
        blockContextMenu={true}
      />

      {/* Custom Scrollbar Styles */}
      <style dangerouslySetInnerHTML={{__html: scrollbarStyles}} />

      {showSubmitConfirmModal && (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-lg p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-6 text-center">Confirm Submission</h2>
            <p className="text-slate-300 mb-6">
              Are you sure you want to submit your test? This action cannot be undone.
            </p>
            <div className="flex space-x-4">
              <button
                onClick={() => setShowSubmitConfirmModal(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-3 rounded-md font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className={`flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-md font-semibold ${
                  isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="p-6">Loading...</div>}
      {error && <div className="p-6 text-red-400">Error: {error}</div>}
      {!test && !loading && <div className="p-6">Loading...</div>}

      {!loading && !error && test && (
        <div className="h-[calc(100vh-4px)] flex overflow-hidden">
          <div className="w-1/2 border-r border-slate-700 flex flex-col h-full">
            <div className="p-4 flex-shrink-0">
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-slate-400">Question {activeIndex + 1} of {codingQuestions.length}</div>
                  {testStarted && (
                    <div className={`
                      px-6 py-3 rounded-xl font-mono font-bold text-xl shadow-2xl
                      flex items-center justify-center gap-2
                      border-2 backdrop-blur-sm
                      transition-all duration-300
                      ${
                        timeRemaining <= 60 
                          ? 'bg-black text-white border-white animate-pulse shadow-white/50' 
                          : timeRemaining <= 300
                          ? 'bg-gray-900 text-white border-gray-300 shadow-gray-400/50'
                          : 'bg-white text-black border-black shadow-black/30'
                      }
                    `}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="tracking-wider">
                        {Math.floor((timeRemaining || 0) / 3600)}:{Math.floor(((timeRemaining || 0) % 3600) / 60).toString().padStart(2, '0')}:{((timeRemaining || 0) % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold flex items-center gap-2">
                    {test.title}
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
                    onClick={handleSubmitClick}
                    disabled={isSubmitting}
                    className={`px-4 py-2 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-red-500/30 flex items-center gap-2 ${
                      isSubmitting ? 'opacity-50 cursor-not-allowed transform-none' : ''
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    {isSubmitting ? 'Submitting...' : 'Submit Test'}
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
            </div>

            <div className="flex-1 overflow-y-auto p-4 pt-0 coding-test-scrollbar">
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
            </div>
          </div>

          <div className="w-1/2 flex flex-col h-full">
            <div className="p-3 flex items-center justify-between border-b border-slate-700 bg-gradient-to-r from-slate-800 to-slate-900 flex-shrink-0">
              <div className="flex items-center gap-6">
                <div className="text-slate-300 font-semibold text-lg flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Code
                </div>
              </div>
              <div className="flex items-center gap-4">
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
                <div className="w-32">
                  <CustomDropdown
                    value={languageByQ[activeQ?._id] || 'python'}
                    onChange={(newLang) => {
                      setLanguageByQ(prev=>({ ...prev, [activeQ._id]: newLang }));
                      // Update code with new language template if code is empty or matches old template
                      const currentCode = codeByQ[activeQ._id] || '';
                      const oldTemplate = getLanguageTemplate(languageByQ[activeQ._id] || 'python');
                      if (currentCode === '' || currentCode === oldTemplate) {
                        setCodeByQ(prev=>({ ...prev, [activeQ._id]: getLanguageTemplate(newLang) }));
                      }
                    }}
                    options={[
                      { value: 'python', label: 'Python' },
                      { value: 'javascript', label: 'JavaScript' },
                      { value: 'c', label: 'C' },
                      { value: 'cpp', label: 'C++' },
                      { value: 'java', label: 'Java' }
                    ]}
                  />
                </div>
                <div className="w-32">
                  <CustomDropdown
                    value={editorTheme}
                    onChange={setEditorTheme}
                    options={[
                      { value: 'vs-dark', label: 'Dark' },
                      { value: 'vs', label: 'Light' },
                      { value: 'hc-black', label: 'High Contrast' }
                    ]}
                  />
                </div>
                <div className="w-36">
                  <CustomDropdown
                    value={fontSize}
                    onChange={setFontSize}
                    options={[
                      { value: 'small', label: 'Small' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'large', label: 'Large' },
                      { value: 'extra-large', label: 'Extra Large' }
                    ]}
                  />
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-col min-h-0">
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
      )}
        </>
      );
    }
