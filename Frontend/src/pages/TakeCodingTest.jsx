import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiRequest, { apiStream } from '../services/api';
import LazyMonacoEditor from '../components/LazyMonacoEditor';
import Proctoring from '../components/Proctoring';
import QuestionText from '../components/QuestionText';

// recharts is heavy, and most of a test is spent writing code — only pull it in
// once a submission actually needs to draw its distribution.
const SubmissionChart = React.lazy(() => import('../components/SubmissionChart'));
import {
  FALLBACK_LANGUAGES,
  fetchSupportedLanguages,
  findLanguage,
  normalizeLanguageKey,
} from '../config/languages';

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
        className="w-full flex items-center justify-between gap-1 px-3 h-8 rounded-md text-[13px] text-white/90 bg-white/[0.06] hover:bg-white/10 transition-colors"
      >
        <span className="truncate">{selectedOption.label}</span>
        <svg className={`w-3.5 h-3.5 shrink-0 text-white/50 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 rounded-lg border border-white/10 bg-[#3c3c3c] shadow-2xl overflow-hidden animate-in">
          <div className="max-h-60 overflow-y-auto lc-scroll py-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`w-full text-left px-3 py-1.5 text-[13px] transition-colors flex items-center justify-between ${
                  value === option.value ? 'text-white bg-white/10' : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                <span>{option.label}</span>
                {value === option.value && (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Judge0 status ids (GET /statuses). Colours follow LeetCode's verdict palette.
const ACCEPTED = 3;

const verdictColor = (statusId) => (statusId === ACCEPTED ? 'text-[#28c244]' : 'text-[#ef4743]');

const verdictLabel = (statusId, description) => {
  if (statusId === ACCEPTED) return 'Accepted';
  return description || 'Wrong Answer';
};

const DIFFICULTY_COLOR = {
  easy: 'text-[#46c6c2]',
  medium: 'text-[#ffb800]',
  hard: 'text-[#f63737]',
};

/** LeetCode-style labelled value box used for Input / Output / Expected. */
const LcBox = ({ label, value, tone = 'text-white/90' }) =>
  value === null || value === undefined || value === '' ? null : (
    <div className="mb-3">
      <div className="text-[12px] text-white/50 mb-1.5">{label}</div>
      <pre className={`bg-white/[0.06] rounded-lg px-3 py-2.5 text-[13px] font-mono whitespace-pre-wrap break-words ${tone}`}>
        {value}
      </pre>
    </div>
  );

export default function TakeCodingTest() {

  const { assignmentId } = useParams();
  const nav = useNavigate();

  const [test, setTest] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [codeByQ, setCodeByQ] = useState({});
  const [languageByQ, setLanguageByQ] = useState({});
  const [supportedLanguages, setSupportedLanguages] = useState(FALLBACK_LANGUAGES);

  // Judge0 execution state, kept per question so switching questions keeps results.
  const [runResultsByQ, setRunResultsByQ] = useState({});
  const [submitResultsByQ, setSubmitResultsByQ] = useState({});
  const [customInputByQ, setCustomInputByQ] = useState({});
  const [judgeBusy, setJudgeBusy] = useState(null);   // 'run' | 'submit' | null
  const [judgeError, setJudgeError] = useState('');
  const [consoleTab, setConsoleTab] = useState('result'); // 'result' | 'input'
  const [lastActionByQ, setLastActionByQ] = useState({}); // 'run' | 'submit'
  const [leftTab, setLeftTab] = useState('description'); // 'description' | 'submission'
  const [submitProgress, setSubmitProgress] = useState(null); // live judge progress
  const [distributionByQ, setDistributionByQ] = useState({});
  const [statMetric, setStatMetric] = useState('runtime'); // 'runtime' | 'memory'
  const [selectedCase, setSelectedCase] = useState(0);
  const [useCustomCase, setUseCustomCase] = useState(false);
  // The exact boilerplate we last inserted per question. Comparing against this
  // (rather than re-deriving it) means a language switch still replaces an
  // untouched template even if the served boilerplate changes mid-session.
  const insertedTemplateRef = useRef({});

  // Ask the backend which languages this Judge0 deployment can actually run.
  useEffect(() => {
    let cancelled = false;
    fetchSupportedLanguages().then((languages) => {
      if (!cancelled && languages?.length) setSupportedLanguages(languages);
    });
    return () => { cancelled = true; };
  }, []);
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
          if (assignment.startedAt) {
            // Test already started, load existing data
            await loadExistingTestData();
          } else if (assignment.status === 'Assigned') {
            // Test not started, start it directly
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
          if (!assignmentId) {
            setError('Assignment ID not found in URL');
            setLoading(false);
            return;
          }

          // Load assignment first
          const assignmentData = await apiRequest(`/assignments/${assignmentId}`);
          setAssignment(assignmentData);

          // Check if assignment is already completed
          if (assignmentData.status === 'Completed') {
            setError('This test has already been completed. Redirecting to results...');
            setTimeout(() => {
              nav(`/student/view-test/${assignmentData._id}`);
            }, 2000);
            setLoading(false);
            return;
          }

          // Load test from assignment
          const t = await apiRequest(`/tests/${assignmentData.testId._id}`);
          setTest(t);

          const initial = {};
          const langs = {};
          (t.questions || []).forEach(q => {
            if (q.kind === 'coding') {
              // Use question's language from database, fallback to 'python'
              langs[q._id] = normalizeLanguageKey(q.language) || 'python';
              // Provide basic code template for the language
              initial[q._id] = getLanguageTemplate(langs[q._id]);
              insertedTemplateRef.current[q._id] = initial[q._id];
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

      // Retry logic for test submission
      let response;
      let retries = 3;
      let lastError;

      while (retries > 0) {
        try {
          response = await apiRequest('/test-submissions', {
            method: 'POST',
            body: JSON.stringify(submissionData),
          });
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error;
          retries--;
          if (retries > 0) {
            console.warn(`⚠️ Submission failed, retrying... (${retries} attempts remaining)`);
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
          }
        }
      }

      if (!response && lastError) {
        throw lastError;
      }

      // Exit fullscreen mode before navigating
      if (proctoringRef.current?.exitFullscreen) {
        await proctoringRef.current.exitFullscreen();
      }

      setIsSubmitting(false);
      nav(`/student/assignments`);
    } catch (error) {
      console.error('Error submitting test:', error);
      setIsSubmitting(false);
      alert(error.message || 'Failed to submit test. Please try again or contact support.');
      // Don't navigate away - let user try again
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
      return;
    }
    startRequestMade.current = true;

    try {

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


      // Check if assignment is already completed
      const assignmentCheck = assignment || await apiRequest(`/assignments/${finalAssignmentId}`);
      if (assignmentCheck?.status === 'Completed') {
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


      setTimeRemaining(remainingSeconds);
      setTestStarted(true);
      setLoading(false);


      // Request fullscreen mode after test starts (via proctoring component)
      // Use longer timeout and ensure it's triggered after user interaction
      setTimeout(async () => {
        if (proctoringRef.current?.requestFullscreen) {
          try {
            await proctoringRef.current.requestFullscreen();
          } catch (error) {
            console.warn("Fullscreen request failed (may require user interaction):", error);
            // Try again after a short delay - sometimes browser needs more time
            setTimeout(async () => {
              if (proctoringRef.current?.requestFullscreen) {
                try {
                  await proctoringRef.current.requestFullscreen();
                } catch (retryError) {
                  console.warn("Fullscreen retry also failed:", retryError);
                }
              }
            }, 500);
          }
        } else {
          console.error('❌ Proctoring ref requestFullscreen not available!');
        }
      }, 300);
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

      // Use assignmentId from URL, fallback to assignment._id
      const finalAssignmentId = assignmentId || assignment?._id;

      if (!finalAssignmentId) {
        console.error('❌ No assignment ID available for resume!');
        setError('Assignment ID not found');
        return;
      }


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

      // Fetch existing violation data using the dedicated violations endpoint
      let existingViolationCount = 0;
      try {
        const violationsResponse = await apiRequest(`/test-submissions/violations/${finalAssignmentId}`);
        console.log("🔍 Violations response:", violationsResponse);
        if (violationsResponse) {
          existingViolationCount = violationsResponse.tabViolationCount || 0;
          console.log("✅ Restoring existing violations:", existingViolationCount);
          setProctoringData({
            violationCount: existingViolationCount,
            violations: violationsResponse.tabViolations || []
          });
        }
      } catch (err) {
        console.warn("Error fetching violation data:", err);
      }

      // Check if existing violations already exceed allowed limit - trigger auto-submit
      // This prevents users from bypassing the violation limit by refreshing the page
      const allowedTabSwitches = assignmentData.testId.allowedTabSwitches ?? 2;
      const isUnlimited = allowedTabSwitches === -1;

      if (!isUnlimited && existingViolationCount > allowedTabSwitches) {
        console.log(`🚨 Existing violations (${existingViolationCount}) exceed allowed limit (${allowedTabSwitches}) - auto-submitting test`);
        // Set state before submitting
        setTest(assignmentData.testId);
        setTimeRemaining(remainingSeconds);
        setTestStarted(true);
        setLoading(false);

        // Delay slightly to ensure state is set, then auto-submit
        setTimeout(() => {
          submitTest(true, true); // cancelledDueToViolation=true, autoSubmit=true
        }, 500);
        return; // Exit early, don't continue with normal test flow
      }

      setTimeRemaining(remainingSeconds);
      setTestStarted(true);
      setLoading(false);

      // Request fullscreen mode when resuming existing test (via proctoring component)
      // Use longer timeout and ensure it's triggered after user interaction
      setTimeout(async () => {
        if (proctoringRef.current?.requestFullscreen) {
          try {
            await proctoringRef.current.requestFullscreen();
          } catch (error) {
            console.warn("Fullscreen request failed (may require user interaction):", error);
            // Try again after a short delay - sometimes browser needs more time
            setTimeout(async () => {
              if (proctoringRef.current?.requestFullscreen) {
                try {
                  await proctoringRef.current.requestFullscreen();
                } catch (retryError) {
                  console.warn("Fullscreen retry also failed:", retryError);
                }
              }
            }, 500);
          }
        }
      }, 300);
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
  const activeRunResult = activeQ ? runResultsByQ[activeQ._id] : null;
  const activeSubmitResult = activeQ ? submitResultsByQ[activeQ._id] : null;
  const lastAction = activeQ ? lastActionByQ[activeQ._id] : null;
  const activeDistribution = activeQ ? distributionByQ[activeQ._id] : null;
  const sampleCases = activeQ?.visibleTestCases?.length
    ? activeQ.visibleTestCases
    : (activeQ?.examples || []);

  const formatClock = (seconds) => {
    const total = Math.max(0, seconds || 0);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
    const sec = (total % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  const fontSizeMap = {
    'small': 12,
    'medium': 14,
    'large': 16,
    'extra-large': 18
  };

  // Boilerplate comes from the shared registry so it always matches what the
  // judge expects (e.g. Java's public class must be named Main).
  const getLanguageTemplate = useCallback(
    (language) => findLanguage(supportedLanguages, language)?.boilerplate || '',
    [supportedLanguages]
  );

  /**
   * Send the current question's code to Judge0.
   *  - 'run'    grades against the visible test cases (plus any custom input)
   *  - 'submit' grades against the hidden test cases and records the score
   */
  const executeCode = useCallback(async (mode) => {
    if (!activeQ || judgeBusy) return;

    const sourceCode = codeByQ[activeQ._id] || '';
    if (!sourceCode.trim()) {
      setJudgeError('Write some code before running it.');
      setConsoleTab('result');
      return;
    }

    const questionId = activeQ._id;
    const payload = {
      assignmentId: assignment?._id || assignmentId,
      questionId,
      sourceCode,
      language: languageByQ[questionId] || 'python',
    };

    setJudgeBusy(mode);
    setJudgeError('');

    if (mode === 'run') {
      setConsoleTab('result');
      const customInput = customInputByQ[questionId] || '';
      try {
        const result = await apiRequest('/coding/run', {
          method: 'POST',
          body: JSON.stringify({ ...payload, ...(customInput ? { customInput } : {}) }),
        });
        setRunResultsByQ((prev) => ({ ...prev, [questionId]: result }));
        setSelectedCase(0);
        setLastActionByQ((prev) => ({ ...prev, [questionId]: 'run' }));
      } catch (error) {
        setJudgeError(error?.message || 'Could not reach the code execution service. Please try again.');
      } finally {
        setJudgeBusy(null);
      }
      return;
    }

    // Submitting opens the submission panel on the left and streams the judge's
    // real progress (how many hidden test cases have actually finished).
    setLeftTab('submission');
    setSubmitProgress({ phase: 'submitting', finished: 0, total: activeQ.hiddenTestCaseCount || 0 });
    setSubmitResultsByQ((prev) => ({ ...prev, [questionId]: null }));

    let finalResult = null;
    let failure = null;
    try {
      await apiStream('/coding/submit?stream=1', {
        body: payload,
        onEvent: (event, data) => {
          if (event === 'progress') setSubmitProgress(data);
          else if (event === 'result') finalResult = data;
          else if (event === 'failed') failure = data.message;
        },
      });

      if (failure) throw new Error(failure);
      if (!finalResult) throw new Error('The judge closed the connection before returning a result.');

      setSubmitResultsByQ((prev) => ({ ...prev, [questionId]: finalResult }));
      setLastActionByQ((prev) => ({ ...prev, [questionId]: 'submit' }));

      // Where this result sits against everyone else's accepted submissions.
      try {
        const distribution = await apiRequest(`/coding/distribution/${questionId}`);
        setDistributionByQ((prev) => ({ ...prev, [questionId]: distribution }));
      } catch {
        // The chart is a nice-to-have; a failure here must not hide the verdict.
      }
    } catch (error) {
      setJudgeError(error?.message || 'Could not reach the code execution service. Please try again.');
    } finally {
      setSubmitProgress(null);
      setJudgeBusy(null);
    }
  }, [activeQ, assignment, assignmentId, codeByQ, customInputByQ, judgeBusy, languageByQ]);

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
    .lc-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
    .lc-scroll::-webkit-scrollbar-track { background: transparent; }
    .lc-scroll::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.16);
      border-radius: 4px;
    }
    .lc-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.28); }
    .lc-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.16) transparent; }

    /* Markdown inside the description, matching LeetCode's typography */
    .lc-prose p { margin: 0 0 1rem 0; }
    .lc-prose strong, .lc-prose b { color: #fff; font-weight: 600; }
    .lc-prose ul, .lc-prose ol { margin: 0 0 1rem 1.25rem; list-style: revert; }
    .lc-prose li { margin: 0.25rem 0; }
    .lc-prose a { color: #46c6c2; }
    .lc-prose code {
      background: rgba(255, 255, 255, 0.07);
      color: rgba(239, 241, 246, 0.75);
      font-family: Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      padding: 2px 4px;
      border-radius: 5px;
    }
    .lc-prose pre {
      background: rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      padding: 12px;
      overflow-x: auto;
    }
    .lc-prose pre code { background: transparent; padding: 0; font-size: 13px; }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-in { animation: fadeIn 0.15s ease-out; }
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
      <style dangerouslySetInnerHTML={{ __html: scrollbarStyles }} />

      {showSubmitConfirmModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#262626] border border-white/10 rounded-lg p-6 max-w-sm w-full">
            <h2 className="text-[16px] font-medium mb-2 text-white">Submit test?</h2>
            <p className="text-[13px] text-white/60 mb-5">
              This ends the test for every question and cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSubmitConfirmModal(false)}
                className="h-9 px-4 rounded-md text-[13px] text-white/80 bg-white/[0.06] hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className="h-9 px-4 rounded-md text-[13px] font-medium bg-[#28c244]/15 text-[#28c244] hover:bg-[#28c244]/25 disabled:opacity-40 transition-colors"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="h-screen bg-[#1a1a1a] text-white/50 flex items-center justify-center text-[14px]">Loading...</div>}
      {error && <div className="h-screen bg-[#1a1a1a] text-[#ef4743] flex items-center justify-center text-[14px]">{error}</div>}
      {!test && !loading && !error && <div className="h-screen bg-[#1a1a1a] text-white/50 flex items-center justify-center text-[14px]">Loading...</div>}

      {!loading && !error && test && (
        <div className="h-screen flex flex-col bg-[#1a1a1a] text-[#f5f5f5] overflow-hidden">

          {/* ---------------- Top bar ---------------- */}
          <header className="h-12 flex items-center justify-between gap-3 px-3 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[14px] font-medium text-white/90 truncate max-w-[220px]">{test.title}</span>
              <div className="flex items-center gap-1 text-white/60">
                <button
                  type="button"
                  disabled={activeIndex === 0}
                  onClick={() => setActiveIndex(i => Math.max(0, i - 1))}
                  className="w-7 h-7 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center"
                  title="Previous question"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-[13px] tabular-nums">{activeIndex + 1}<span className="text-white/40"> / {codingQuestions.length}</span></span>
                <button
                  type="button"
                  disabled={activeIndex === codingQuestions.length - 1}
                  onClick={() => setActiveIndex(i => Math.min(codingQuestions.length - 1, i + 1))}
                  className="w-7 h-7 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center"
                  title="Next question"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Run / Submit, centred like LeetCode's toolbar */}
            <div className="flex items-center gap-1 bg-white/[0.06] rounded-lg p-1">
              <button
                type="button"
                onClick={() => executeCode('run')}
                disabled={!!judgeBusy}
                className="h-8 px-3 rounded-md text-[13px] text-white/90 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1.5 transition-colors"
              >
                {judgeBusy === 'run' ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 4.4a1 1 0 011.02-.06l8 4.6a1 1 0 010 1.74l-8 4.6A1 1 0 016 14.42V5.58a1 1 0 01.3-1.18z" />
                  </svg>
                )}
                Run
              </button>
              <button
                type="button"
                onClick={() => executeCode('submit')}
                disabled={!!judgeBusy}
                className="h-8 px-3 rounded-md text-[13px] text-[#28c244] hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1.5 transition-colors"
              >
                {judgeBusy === 'submit' ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15V6a2 2 0 012-2h10a2 2 0 012 2v9M12 4v9m0-9l-3 3m3-3l3 3" />
                  </svg>
                )}
                Submit
              </button>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {testStarted && (
                <div className={`h-8 px-3 rounded-md flex items-center gap-1.5 text-[13px] font-medium tabular-nums ${
                  timeRemaining <= 60 ? 'bg-[#ef4743]/15 text-[#ef4743]'
                    : timeRemaining <= 300 ? 'bg-[#ffb800]/15 text-[#ffb800]'
                      : 'bg-white/[0.06] text-white/80'
                }`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formatClock(timeRemaining)}
                </div>
              )}
              <button
                type="button"
                onClick={handleSubmitClick}
                disabled={isSubmitting}
                className="h-8 px-3 rounded-md text-[13px] font-medium bg-[#28c244]/15 text-[#28c244] hover:bg-[#28c244]/25 disabled:opacity-40 transition-colors"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Test'}
              </button>
            </div>
          </header>

          {/* ---------------- Workspace ---------------- */}
          <div className="flex-1 flex gap-1.5 px-1.5 pb-1.5 min-h-0">

            {/* ---- Description panel ---- */}
            <div className="w-1/2 flex flex-col min-h-0 bg-[#262626] rounded-lg overflow-hidden">
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
                        <svg className="w-4 h-4 animate-spin text-[#ffb800]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
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
                        <span className={`text-[22px] font-medium ${verdictColor(activeSubmitResult.verdict?.id)}`}>
                          {verdictLabel(activeSubmitResult.verdict?.id, activeSubmitResult.verdict?.description)}
                        </span>
                        <span className="text-[13px] text-white/50">
                          {activeSubmitResult.passedCount} / {activeSubmitResult.totalHidden} testcases passed
                        </span>
                      </div>
                      <div className="text-[12px] text-white/40 mb-5">
                        Submitted in {findLanguage(supportedLanguages, activeSubmitResult.language)?.label || activeSubmitResult.language}
                      </div>

                      {/* ---- runtime / memory stat cards, LeetCode style ---- */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {[
                          {
                            key: 'runtime',
                            label: 'Runtime',
                            value: activeSubmitResult.runtimeMs === null || activeSubmitResult.runtimeMs === undefined
                              ? 'N/A' : `${activeSubmitResult.runtimeMs} ms`,
                            beats: activeDistribution?.runtime?.beats,
                          },
                          {
                            key: 'memory',
                            label: 'Memory',
                            value: activeSubmitResult.memoryKb === null || activeSubmitResult.memoryKb === undefined
                              ? 'N/A' : `${(activeSubmitResult.memoryKb / 1024).toFixed(1)} MB`,
                            beats: activeDistribution?.memory?.beats,
                          },
                        ].map((card) => (
                          <button
                            key={card.key}
                            type="button"
                            onClick={() => setStatMetric(card.key)}
                            className={`text-left rounded-lg px-4 py-3 border transition-colors ${
                              statMetric === card.key
                                ? 'bg-white/[0.08] border-white/20'
                                : 'bg-white/[0.04] border-transparent hover:bg-white/[0.06]'
                            }`}
                          >
                            <div className="text-[12px] text-white/50 mb-0.5">{card.label}</div>
                            <div className="text-[18px] font-medium text-white/90">{card.value}</div>
                            {card.beats !== null && card.beats !== undefined && (
                              <div className="text-[12px] text-white/50 mt-0.5">
                                Beats <span className="text-[#28c244]">{card.beats}%</span>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* ---- distribution chart ---- */}
                      <div className="rounded-lg bg-white/[0.04] p-3">
                        <React.Suspense fallback={<div className="h-[150px] flex items-center justify-center text-[13px] text-white/40">Loading chart...</div>}>
                          {statMetric === 'runtime' ? (
                            <SubmissionChart
                              summary={activeDistribution?.runtime}
                              unit="Runtime (ms)"
                              format={(value) => `${Math.round(value)}`}
                            />
                          ) : (
                            <SubmissionChart
                              summary={activeDistribution?.memory}
                              unit="Memory (MB)"
                              format={(value) => (value / 1024).toFixed(1)}
                              accent="#46c6c2"
                            />
                          )}
                        </React.Suspense>
                      </div>

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
                  {activeIndex + 1}. {activeQ?.title || test.title}
                </h1>

                <div className="flex flex-wrap items-center gap-2 mb-5">
                  {activeQ?.difficulty && (
                    <span className={`px-2.5 py-1 rounded-full bg-white/10 text-[12px] ${DIFFICULTY_COLOR[String(activeQ.difficulty).toLowerCase()] || 'text-white/70'}`}>
                      {activeQ.difficulty}
                    </span>
                  )}
                  {(activeQ?.topics || []).map((topic, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-full bg-white/10 text-[12px] text-white/60">{topic}</span>
                  ))}
                  {activeQ?.hint && (
                    <span className="px-2.5 py-1 rounded-full bg-white/10 text-[12px] text-white/60">Hint</span>
                  )}
                </div>

                <div className="lc-prose text-[14px] leading-6 text-[rgba(239,241,246,0.75)]">
                  <QuestionText text={activeQ?.text} />
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

                {activeQ?.guidelines && (
                  <div className="mt-6">
                    <div className="text-[14px] text-white mb-2">Constraints:</div>
                    <div className="text-[13px] leading-6 text-white/60 whitespace-pre-wrap">{activeQ.guidelines}</div>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* ---- Editor + console column ---- */}
            <div className="w-1/2 flex flex-col gap-1.5 min-h-0">

              {/* Code panel */}
              <div className="flex-1 flex flex-col min-h-0 bg-[#262626] rounded-lg overflow-hidden">
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
                        value={languageByQ[activeQ?._id] || 'python'}
                        onChange={(newLang) => {
                          setLanguageByQ(prev => ({ ...prev, [activeQ._id]: newLang }));
                          // Only replace the code if the student has not touched it.
                          const currentCode = codeByQ[activeQ._id] || '';
                          const untouched = currentCode.trim() === ''
                            || currentCode === insertedTemplateRef.current[activeQ._id]
                            || currentCode === getLanguageTemplate(languageByQ[activeQ._id] || 'python');
                          if (untouched) {
                            const nextTemplate = getLanguageTemplate(newLang);
                            insertedTemplateRef.current[activeQ._id] = nextTemplate;
                            setCodeByQ(prev => ({ ...prev, [activeQ._id]: nextTemplate }));
                          }
                        }}
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
                          { value: 'hc-black', label: 'Contrast' }
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
                          { value: 'extra-large', label: 'X-Large' }
                        ]}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={formatCode}
                      disabled={isFormatting}
                      title="Format code"
                      className="w-8 h-8 rounded-md text-white/60 hover:bg-white/10 hover:text-white/90 disabled:opacity-40 flex items-center justify-center transition-colors"
                    >
                      <svg className={`w-4 h-4 ${isFormatting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        {isFormatting
                          ? <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h14" />}
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0">
                  <LazyMonacoEditor
                    height="100%"
                    language={findLanguage(supportedLanguages, languageByQ[activeQ?._id] || 'python')?.monacoLanguage || 'plaintext'}
                    theme={editorTheme}
                    value={codeByQ[activeQ?._id] || ''}
                    onChange={(val) => setCodeByQ(prev => ({ ...prev, [activeQ._id]: val }))}
                    options={{
                      fontSize: fontSizeMap[fontSize],
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

              {/* Console panel */}
              <div className="h-[38%] flex flex-col min-h-0 bg-[#262626] rounded-lg overflow-hidden">
                <div className="h-10 flex items-center gap-4 px-4 border-b border-white/10 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setConsoleTab('input')}
                    className={`text-[14px] font-medium transition-colors ${consoleTab === 'input' ? 'text-[#f5f5f5]' : 'text-white/60 hover:text-white/80'}`}
                  >
                    Testcase
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsoleTab('result')}
                    className={`text-[14px] font-medium transition-colors ${consoleTab === 'result' ? 'text-[#f5f5f5]' : 'text-white/60 hover:text-white/80'}`}
                  >
                    Test Result
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
                            value={customInputByQ[activeQ?._id] || ''}
                            onChange={(event) => setCustomInputByQ((prev) => ({ ...prev, [activeQ._id]: event.target.value }))}
                            spellCheck="false"
                            placeholder="Type input for your program..."
                            className="w-full h-20 bg-white/[0.06] rounded-lg px-3 py-2.5 text-[13px] font-mono text-white/90 placeholder-white/30 outline-none focus:bg-white/[0.09] resize-none"
                          />
                          <div className="text-[12px] text-white/40 mt-2">Sent to your program on Run.</div>
                        </div>
                      ) : sampleCases[selectedCase] ? (
                        <div>
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

                      {/* ---- Submit verdict (no marks shown) ---- */}
                      {lastAction === 'submit' && activeSubmitResult && (
                        <div>
                          <div className="flex items-baseline gap-3 mb-1">
                            <span className={`text-[18px] font-medium ${verdictColor(activeSubmitResult.verdict?.id)}`}>
                              {verdictLabel(activeSubmitResult.verdict?.id, activeSubmitResult.verdict?.description)}
                            </span>
                            {activeSubmitResult.verdict?.id !== 3 && (
                              <span className="text-[13px] text-white/50">
                                {activeSubmitResult.passedCount} / {activeSubmitResult.totalHidden} testcases passed
                              </span>
                            )}
                          </div>

                          {activeSubmitResult.verdict?.id === 3 && (
                            <div className="text-[13px] text-white/50 mb-3">
                              {activeSubmitResult.passedCount} / {activeSubmitResult.totalHidden} testcases passed
                            </div>
                          )}

                          <div className="flex items-center gap-6 mb-3">
                            {activeSubmitResult.runtimeMs !== null && activeSubmitResult.runtimeMs !== undefined && (
                              <div>
                                <div className="text-[12px] text-white/50">Runtime</div>
                                <div className="text-[14px] text-white/90">{activeSubmitResult.runtimeMs} ms</div>
                              </div>
                            )}
                            {activeSubmitResult.memoryKb !== null && activeSubmitResult.memoryKb !== undefined && (
                              <div>
                                <div className="text-[12px] text-white/50">Memory</div>
                                <div className="text-[14px] text-white/90">{(activeSubmitResult.memoryKb / 1024).toFixed(1)} MB</div>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {activeSubmitResult.results?.map((result, index) => (
                              <span
                                key={index}
                                title={result.status?.description}
                                className={`w-2 h-2 rounded-full ${result.passed ? 'bg-[#28c244]' : 'bg-[#ef4743]'}`}
                              />
                            ))}
                          </div>

                          {activeSubmitResult.compileOutput && (
                            <pre className="mt-3 bg-white/[0.06] rounded-lg px-3 py-2.5 text-[13px] font-mono text-[#ef4743] whitespace-pre-wrap break-words">
                              {activeSubmitResult.compileOutput}
                            </pre>
                          )}
                        </div>
                      )}

                      {/* ---- Run results ---- */}
                      {lastAction === 'run' && activeRunResult && (
                        <div>
                          <div className="mb-3">
                            <span className={`text-[18px] font-medium ${verdictColor(activeRunResult.passed === activeRunResult.total ? 3 : 4)}`}>
                              {activeRunResult.passed === activeRunResult.total ? 'Accepted' : 'Wrong Answer'}
                            </span>
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

                      {!lastAction && !judgeError && (
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

          {/* Keyboard Shortcuts Modal */}
          {showShortcuts && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowShortcuts(false)}>
              <div className="bg-[#262626] border border-white/10 rounded-lg p-5 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-medium text-white">Keyboard Shortcuts</h3>
                  <button onClick={() => setShowShortcuts(false)} className="text-white/50 hover:text-white">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-2.5 text-[13px]">
                  {[['Find','Ctrl+F'],['Replace','Ctrl+H'],['Command Palette','F1'],['Toggle Comment','Ctrl+/'],['Format Document','Shift+Alt+F'],['Fold All','Ctrl+K Ctrl+0'],['Unfold All','Ctrl+K Ctrl+J']].map(([label, keys]) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className="text-white/70">{label}</span>
                      <kbd className="bg-white/10 px-2 py-0.5 rounded text-[12px] text-white/80">{keys}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
