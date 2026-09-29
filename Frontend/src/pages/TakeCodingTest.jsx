import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiRequest from '../services/api';
import { API_BASE_URL } from '../config/api';
import ProctorProvider from '../proctoring/ProctorProvider';
import useProctor from '../proctoring/useProctor';
import CodingWorkspace from '../components/coding/CodingWorkspace';
import { TimerPill } from '../components/coding/codingUi';
import useCodingJudge from '../hooks/useCodingJudge';

import {
  FALLBACK_LANGUAGES,
  fetchSupportedLanguages,
  findLanguage,
  normalizeLanguageKey,
} from '../config/languages';

function TakeCodingTestInner({ submitRef }) {
  // Proctoring is centralised: the provider is mounted by the wrapper at the
  // bottom of this file, and this is the only handle the page needs.
  const proctor = useProctor();

  const { assignmentId } = useParams();
  const nav = useNavigate();

  const [test, setTest] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [codeByQ, setCodeByQ] = useState({});
  const [languageByQ, setLanguageByQ] = useState({});
  const [supportedLanguages, setSupportedLanguages] = useState(FALLBACK_LANGUAGES);

  // Judge0 execution state, kept per question so switching questions keeps
  // results. Shared with TakeTest.jsx -- see hooks/useCodingJudge.js.
  const judge = useCodingJudge(assignment?._id || assignmentId);
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
  const [showShortcuts, setShowShortcuts] = useState(false);
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
  // A ref, not state: the countdown can fire the auto-submit more than once in
  // a single tick, and `isSubmitting` would still read false in the second
  // call. TakeTest.jsx has always guarded this way; this page did not, so the
  // loser of the race got a 400 back and alerted "Failed to submit test" over
  // the student's own exam as it was submitting.
  const submitInFlight = useRef(false);


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

    // Wait for proctoring. The server withholds question content until a
    // proctoring session is running, so loading earlier returns an empty paper.
    if (!proctor.ready) return;

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
  }, [assignmentId, testStarted, proctor.ready]);


  const submitTest = async (cancelledDueToViolation = false, autoSubmit = false) => {
    if (isSubmitting || submitInFlight.current) return;
    submitInFlight.current = true;
    setIsSubmitting(true);

    // Whatever is still sitting in a debounce timer has to reach the server
    // before the paper does, or the last thing the student typed is not in it.
    await flushPendingSaves();

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
        // Overwritten server-side from the proctoring session record. What a
        // browser says about its own violations is not evidence.
        tabViolationCount: proctor.violationCount || 0,
        tabViolations: [],
        cancelledDueToViolation,
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

      // Closes the proctoring session, releases the screen share and camera,
      // and leaves fullscreen.
      await proctor.endSession();

      setIsSubmitting(false);
      // Under Safe Exam Browser the exit page is its configured quit URL, so
      // arriving there closes SEB and hands the machine back. Sending them to
      // the assignments list instead would leave them in a locked kiosk.
      nav(`/student/assignments`);
    } catch (error) {
      console.error('Error submitting test:', error);
      setIsSubmitting(false);
      // Released so the student can genuinely try again. The guard exists to
      // stop the timer double-firing, not to lock them out after a failure.
      submitInFlight.current = false;

      // An attempt the server has already finalised is not a failure the
      // student can do anything about, and telling them the submit failed when
      // their paper is in would be a lie. This happens when the expiry sweep
      // got there first, or when a second auto-submit lost the race.
      if (error.code === 'attempt_expired' || /already completed/i.test(error.message || '')) {
        nav('/student/assignments');
        return;
      }

      alert(error.message || 'Failed to submit test. Please try again or contact support.');
      // Don't navigate away - let user try again
    }
  };

  // Lets the provider trigger a submit when the server cancels this attempt.
  useEffect(() => {
    if (submitRef) submitRef.current = submitTest;
  });

  // Time's up. Guarded by a ref rather than `isSubmitting`, because the
  // countdown below can reach zero more than once before React has re-rendered.
  const handleTimeUp = useCallback(() => {
    if (submitInFlight.current) return;
    submitTest(false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment, test, codeByQ, languageByQ, timeSpent]);

  // Timer countdown
  useEffect(() => {
    if (!testStarted || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      // The submit is fired from outside the state updater. React may invoke an
      // updater more than once, and a submit is not something to run twice --
      // this page used to call submitTest() from inside it.
      setTimeRemaining(prev => {
        if (prev <= 1) {
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
      setTimeSpent(prev => prev + 1);
    }, 1000);

    // The server is the authority on whether time is up. Without this a
    // backgrounded tab -- whose setInterval browsers throttle to roughly once a
    // minute -- lets the exam run well past its deadline with nothing to correct
    // it. TakeTest.jsx has had this backstop; this page had none.
    const backendCheckTimer = setInterval(async () => {
      try {
        await apiRequest(`/assignments/check-expiration/${assignmentId}`);
      } catch (error) {
        if (error.code === "attempt_expired") handleTimeUp();
      }
    }, 30000);

    return () => {
      clearInterval(timer);
      clearInterval(backendCheckTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testStarted, timeRemaining, assignmentId]);


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

      // Calculate timeRemaining from scheduledStartTime + testDuration
      const testTimeLimit = response.test.timeLimit;
      const totalSeconds = (response.assignment.duration || testTimeLimit) * 60;
      const testStartTime = new Date(response.assignment.startTime);
      const currentTime = serverTime; // Use server time instead of client time
      const elapsedSeconds = Math.floor((currentTime - testStartTime) / 1000);
      const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);


      setTimeRemaining(remainingSeconds);
      setTestStarted(true);
      setLoading(false);


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

      // Calculate timeRemaining from scheduledStartTime + testDuration
      const testTimeLimit = assignmentData.testId.timeLimit;
      const totalSeconds = (assignmentData.duration || testTimeLimit) * 60;
      const testStartTime = new Date(assignmentData.startTime);
      const currentTime = serverTime;
      const elapsedSeconds = Math.floor((currentTime - testStartTime) / 1000);
      const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

      // Put back whatever was autosaved. Without this a student who refreshed,
      // or whose tab was killed, came back to an empty editor even though their
      // code was sitting on the server -- which is most of the point of saving
      // it in the first place.
      try {
        const saved = await apiRequest(`/answers/assignment/${finalAssignmentId}`);
        const savedResponses = Array.isArray(saved) ? saved : (saved?.responses || []);
        if (savedResponses.length) {
          const restoredCode = {};
          const restoredLangs = {};
          for (const response of savedResponses) {
            const questionId = String(response.questionId?._id || response.questionId || '');
            if (!questionId) continue;
            // Several rows can exist for one question; keep the longest, which
            // is the furthest the student actually got.
            //
            // `draftAnswer` first: once an answer has been graded, `textAnswer`
            // is frozen as the source of the best attempt and the draft is where
            // the student's current editing lives. Restoring the graded source
            // instead would silently roll their editor back to an older attempt.
            const text = response.draftAnswer || response.textAnswer || '';
            if (text && text.length >= (restoredCode[questionId]?.length || 0)) {
              restoredCode[questionId] = text;
            }
            if (response.language) restoredLangs[questionId] = normalizeLanguageKey(response.language);
          }
          if (Object.keys(restoredCode).length) {
            setCodeByQ(prev => ({ ...prev, ...restoredCode }));
            setLanguageByQ(prev => ({ ...prev, ...restoredLangs }));
          }
        }
      } catch (error) {
        // A failed restore must not stop the student getting back into the
        // exam; they keep the templates and their time.
        console.error('Could not restore saved code:', error);
      }

      // Violations are no longer restored or judged here. The server carries the
      // count forward when the proctoring session is opened, and refuses to open
      // one at all if the limit was already exceeded.

      setTimeRemaining(remainingSeconds);
      setTestStarted(true);
      setLoading(false);

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

  // Boilerplate comes from the shared registry so it always matches what the
  // judge expects (e.g. Java's public class must be named Main).
  const getLanguageTemplate = useCallback(
    (language) => findLanguage(supportedLanguages, language)?.boilerplate || '',
    [supportedLanguages]
  );

  // Auto-save.
  //
  // This used to be a stub that only moved the "Saved" timestamp forward --
  // `// Simulate auto-save (in real app, this would save to backend)` -- so the
  // page told students their work was safe while nothing left the browser. Code
  // lived in `codeByQ` and nowhere else, and a closed laptop or a dead tab took
  // all of it: the server-side expiry sweep would finalise the attempt with an
  // empty paper because there was nothing stored to recover.
  //
  // It now writes to the same /answers endpoint the MCQ and theory pages use,
  // debounced a second after typing stops, and only reports "Saved" once the
  // server has actually taken it.
  const saveCodeToBackend = useCallback(async (questionId, code, lang) => {
    if (!questionId) return;
    try {
      await apiRequest('/answers', {
        method: 'POST',
        body: JSON.stringify({
          assignmentId,
          questionId,
          selectedOption: null,
          textAnswer: code || '',
          language: lang || 'python',
        }),
      });
      setLastSaved(new Date());
    } catch (error) {
      // Deliberately quiet: this fires while the student is typing, and an
      // alert every time the network hiccups would be worse than a missed
      // save. The next keystroke schedules another attempt.
      console.error('Auto-save failed:', error);
    }
  }, [assignmentId]);

  /** Push anything still waiting in a debounce timer, and wait for it. */
  const flushPendingSaves = useCallback(async () => {
    const pending = Object.entries(debounceTimers.current);
    debounceTimers.current = {};
    await Promise.all(pending.map(([questionId, entry]) => {
      clearTimeout(entry.timer);
      return saveCodeToBackend(questionId, entry.code, entry.language);
    }));
  }, [saveCodeToBackend]);

  useEffect(() => {
    if (!autoSaveEnabled || !activeQ || !testStarted) return;

    const questionId = activeQ._id;
    const code = codeByQ[questionId];
    const lang = languageByQ[questionId];

    // Nothing to save until the editor has something in it.
    if (code === undefined) return;

    // Don't re-save the language template we inserted ourselves: that is not
    // the student's work, and storing it would mark an untouched question as
    // answered.
    if (code === insertedTemplateRef.current[questionId]) return;

    if (debounceTimers.current[questionId]) {
      clearTimeout(debounceTimers.current[questionId].timer);
    }
    debounceTimers.current[questionId] = {
      code,
      language: lang,
      timer: setTimeout(() => {
        delete debounceTimers.current[questionId];
        saveCodeToBackend(questionId, code, lang);
      }, 1000),
    };
  }, [codeByQ, languageByQ, activeQ, autoSaveEnabled, testStarted, saveCodeToBackend]);

  // A closing tab gets one last synchronous attempt. `keepalive` is what lets
  // the request outlive the page; a normal fetch would be cancelled.
  useEffect(() => {
    const handleUnload = () => {
      for (const [questionId, entry] of Object.entries(debounceTimers.current)) {
        clearTimeout(entry.timer);
        try {
          fetch(`${API_BASE_URL}/answers`, {
            method: 'POST',
            keepalive: true,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('token')}`,
            },
            body: JSON.stringify({
              assignmentId,
              questionId,
              selectedOption: null,
              textAnswer: entry.code || '',
              language: entry.language || 'python',
            }),
          });
        } catch {
          // Nothing useful to do while the page is going away.
        }
      }
      debounceTimers.current = {};
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [assignmentId]);

  // Switching language swaps in that language's starting code, but only if the
  // student has not written anything of their own.
  const handleLanguageChange = (newLang) => {
    if (!activeQ) return;
    const questionId = activeQ._id;
    setLanguageByQ(prev => ({ ...prev, [questionId]: newLang }));
    const currentCode = codeByQ[questionId] || '';
    const untouched = currentCode.trim() === ''
      || currentCode === insertedTemplateRef.current[questionId]
      || currentCode === getLanguageTemplate(languageByQ[questionId] || 'python');
    if (untouched) {
      const nextTemplate = getLanguageTemplate(newLang);
      insertedTemplateRef.current[questionId] = nextTemplate;
      setCodeByQ(prev => ({ ...prev, [questionId]: nextTemplate }));
    }
  };


  return (
    <>
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
        <>
          <CodingWorkspace
            title={test.title}
            headerLeft={(
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
            )}
            headerRight={(
              <>
                {testStarted && <TimerPill seconds={timeRemaining} />}
                <button
                  type="button"
                  onClick={handleSubmitClick}
                  disabled={isSubmitting}
                  className="h-8 px-3 rounded-md text-[13px] font-medium bg-[#28c244]/15 text-[#28c244] hover:bg-[#28c244]/25 disabled:opacity-40 transition-colors"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Test'}
                </button>
              </>
            )}
            question={activeQ}
            heading={`${activeIndex + 1}. ${activeQ?.title || test.title}`}
            code={codeByQ[activeQ?._id] || ''}
            onCodeChange={(val) => activeQ && setCodeByQ(prev => ({ ...prev, [activeQ._id]: val }))}
            language={languageByQ[activeQ?._id] || 'python'}
            onLanguageChange={handleLanguageChange}
            supportedLanguages={supportedLanguages}
            judge={judge}
          />

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
        </>
      )}
    </>
  );
}

/**
 * Proctoring wrapper.
 *
 * Mounted around the page rather than inside it because the server refuses to
 * hand out question content until a proctoring session exists -- the session has
 * to be opened before the page loads anything. The inner page waits on
 * `proctor.ready`.
 *
 * `submitRef` is how the provider reaches the submit function when the server
 * cancels an attempt.
 */
export default function TakeCodingTest() {
  const { assignmentId } = useParams();
  const submitRef = useRef(null);

  const handleTerminate = useCallback(() => {
    submitRef.current?.(true, true);
  }, []);

  return (
    <ProctorProvider
      enabled
      assignmentId={assignmentId}
      testKind="coding"
      onTerminate={handleTerminate}
    >
      <TakeCodingTestInner submitRef={submitRef} />
    </ProctorProvider>
  );
}
