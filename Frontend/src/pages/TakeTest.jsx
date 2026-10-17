import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import apiRequest from "../services/api";
import { API_BASE_URL } from "../config/api";
import ProctorProvider from "../proctoring/ProctorProvider";
import useProctor from "../proctoring/useProctor";
import QuestionText from "../components/QuestionText";
import CodingWorkspace from "../components/coding/CodingWorkspace";
import { preloadMonaco } from "../components/coding/loadMonaco";
import { TimerPill } from "../components/coding/codingUi";
import { examClock, clockFromServer, secondsLeft } from "../utils/examClock";
import { findOptionIndex } from "../utils/mcqOption";
import { recordPending, recordSaved, pendingAnswers, clearPending } from "../utils/unsavedAnswers";
import SaveStatusBanner from "../components/SaveStatusBanner";
import { ExamStyles, ExamStatusScreen, McqOptions, QuestionNavigator } from "../components/exam/ExamParts";
import { isAnsweredValue, wordCount } from "../utils/examAnswers";
import useCodingJudge from "../hooks/useCodingJudge";
import {
  FALLBACK_LANGUAGES,
  fetchSupportedLanguages,
  findLanguage,
  normalizeLanguageKey,
} from "../config/languages";

/**
 * Jump-to-any-question grid for the coding workspace's top bar. The coding view
 * is full screen, so the side navigator the MCQ view uses has no room there.
 */
const QuestionPalette = ({ questions, current, statuses, onSelect }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="All questions"
        className={`h-7 px-2 rounded flex items-center gap-1.5 text-[13px] transition-colors ${open ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/10 hover:text-white/90"}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
        Questions
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 w-72 rounded-lg border border-white/10 bg-[#303030] shadow-2xl p-3 animate-in">
          <div className="grid grid-cols-6 gap-1.5 max-h-64 overflow-y-auto lc-scroll">
            {questions.map((q, index) => {
              const status = statuses[q._id];
              return (
                <button
                  key={q._id}
                  type="button"
                  onClick={() => { setOpen(false); onSelect(index); }}
                  title={`Question ${index + 1} · ${q.kind === "coding" ? "Coding" : q.kind === "mcq" ? "MCQ" : "Theory"}`}
                  className={`relative h-9 rounded-md text-[13px] font-medium tabular-nums transition-colors ${
                    index === current
                      ? "bg-[#46c6c2] text-[#1a1a1a]"
                      : status === "answered"
                        ? "bg-[#28c244]/20 text-[#28c244] hover:bg-[#28c244]/30"
                        : status === "mark-for-review"
                          ? "bg-[#ffb800]/20 text-[#ffb800] hover:bg-[#ffb800]/30"
                          : "bg-white/[0.06] text-white/70 hover:bg-white/10"
                  }`}
                >
                  {index + 1}
                  {q.kind === "coding" && (
                    <span className="absolute top-0.5 right-1 text-[8px] leading-none opacity-70">{"</>"}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-2.5 border-t border-white/10 text-[11px] text-white/50">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#46c6c2]" /> Current</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#28c244]" /> Answered</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#ffb800]" /> Review</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-white/20" /> Not answered</span>
          </div>
        </div>
      )}
    </div>
  );
};

/** GET the saved answers, retrying a failed read twice before giving up. */
async function loadSavedAnswers(assignmentId) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await apiRequest(`/answers/assignment/${assignmentId}`);
    } catch (error) {
      lastError = error;
      if (error?.code === "signed_out") break;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

const TakeTestInner = ({ submitRef }) => {
  // Proctoring is centralised: this page mounts the provider (see the wrapper at
  // the bottom of this file) and reads its state through this one hook. There is
  // no proctoring logic in this file any more.
  const proctor = useProctor();
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [timeSpent, setTimeSpent] = useState(0);
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [questionStatuses, setQuestionStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testStarted, setTestStarted] = useState(false);
  const startRequestMade = useRef(false);
  const [showSubmitConfirmModal, setShowSubmitConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // A submit that failed, shown in the page. Not alert(): Chrome drops out of
  // fullscreen for every JavaScript dialog, so a submit that failed on a bad
  // connection also charged the student with leaving fullscreen.
  const [submitError, setSubmitError] = useState(null);
  const debounceTimers = useRef({});

  // Answers the server has not confirmed. Autosave failures used to go to the
  // console only, so a student kept answering into nothing and found out when
  // they came back to a blank paper. They are now kept in this browser
  // (utils/unsavedAnswers.js), retried, and shown -- see SaveStatusBanner.
  const studentIdRef = useRef(null);
  if (studentIdRef.current === null) {
    try {
      studentIdRef.current = localStorage.getItem("userId") || "";
    } catch {
      studentIdRef.current = "";
    }
  }
  const [unsavedIds, setUnsavedIds] = useState(() => new Set());
  const markUnsaved = useCallback((questionId, unsaved) => {
    setUnsavedIds((prev) => {
      if (prev.has(questionId) === unsaved) return prev;
      const next = new Set(prev);
      if (unsaved) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
  }, []);
  const [hasEnteredExam, setHasEnteredExam] = useState(() => {
    try {
      return sessionStorage.getItem(`exam_entered_${assignmentId}`) === "true";
    } catch {
      return false;
    }
  });

  const handleStartExam = () => {
    try {
      sessionStorage.setItem(`exam_entered_${assignmentId}`, "true");
    } catch {
      void 0;
    }
    setHasEnteredExam(true);
  };

  const [acknowledgedRules, setAcknowledgedRules] = useState(false);

  // No right-click anywhere on this page, at any stage -- the rules screen and
  // the pre-exam checks included, before proctoring's own guard is running
  // (detectors/clipboard.js). Silent: a mis-click is not a violation. The code
  // editor is left to that guard, since its menu is where cut/copy/paste live.
  useEffect(() => {
    const blockContextMenu = (event) => {
      if (event.target?.closest?.(".monaco-editor")) return;
      event.preventDefault();
    };
    document.addEventListener("contextmenu", blockContextMenu, true);
    return () => document.removeEventListener("contextmenu", blockContextMenu, true);
  }, []);

  // Coding questions. The code itself lives in `answers` like every other
  // answer; the language is tracked beside it so it can be saved with the code
  // and shown to the mentor. The ref mirrors the state for the save path, which
  // runs from debounce timers holding stale closures.
  const judge = useCodingJudge(assignmentId);
  const [supportedLanguages, setSupportedLanguages] = useState(FALLBACK_LANGUAGES);
  const [, setLanguageByQ] = useState({}); // re-renders on change; reads go through languageRef
  const languageRef = useRef({});
  const setQuestionLanguage = useCallback((questionId, language) => {
    languageRef.current = { ...languageRef.current, [questionId]: language };
    setLanguageByQ(languageRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSupportedLanguages().then((languages) => {
      if (!cancelled && languages?.length) setSupportedLanguages(languages);
    });
    return () => { cancelled = true; };
  }, []);

  // Every coding question starts in its own default language unless a saved
  // answer already said otherwise.
  useEffect(() => {
    if (!test?.questions) return;
    // Start fetching the code editor as soon as the paper turns out to have a
    // coding question, rather than when the student first navigates to one.
    if (test.questions.some((q) => q.kind === "coding")) preloadMonaco();
    const defaults = {};
    for (const q of test.questions) {
      if (q.kind === "coding" && !languageRef.current[q._id]) {
        defaults[q._id] = normalizeLanguageKey(q.language) || "python";
      }
    }
    if (Object.keys(defaults).length) {
      languageRef.current = { ...defaults, ...languageRef.current };
      setLanguageByQ(languageRef.current);
    }
  }, [test]);

  const languageFor = (question) =>
    languageRef.current[question._id] || normalizeLanguageKey(question.language) || "python";
  const templateFor = (language) => findLanguage(supportedLanguages, language)?.boilerplate || "";

  // Auto-submit modal state: null | 'time-up' | 'submitting' | 'success' | 'error'
  const [autoSubmitPhase, setAutoSubmitPhase] = useState(null);
  const [autoSubmitError, setAutoSubmitError] = useState('');
  const autoSubmitTriggered = useRef(false);
  // When this attempt ends, as the server computed it, plus the offset between
  // the server's clock and this machine's. See utils/examClock.js.
  const clockRef = useRef(null);

  // Zoom level state (80% to 150%, default 100%)
  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem('testZoomLevel');
    return saved ? parseInt(saved) : 100;
  });

  const handleZoomIn = () => {
    setZoomLevel(prev => {
      const next = Math.min(prev + 10, 150);
      localStorage.setItem('testZoomLevel', next);
      return next;
    });
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => {
      const next = Math.max(prev - 10, 80);
      localStorage.setItem('testZoomLevel', next);
      return next;
    });
  };

  const handleZoomReset = () => {
    setZoomLevel(100);
    localStorage.setItem('testZoomLevel', 100);
  };


  // Pending autosaves.
  //
  // This effect used to clear every debounce timer in its cleanup, and its
  // dependencies include `answers` -- so each keystroke scheduled a save and the
  // re-render it caused cancelled it a moment later. Theory and coding answers
  // only reached the server when the student changed question or submitted; a
  // crashed browser, or an attempt finalised by the expiry sweep, lost
  // everything typed since. Timers are now cleared only when the page goes away.
  //
  // A closing tab gets one last attempt for anything still pending. `keepalive`
  // is what lets the request outlive the page; an ordinary fetch is cancelled.
  useEffect(() => {
    const handleBeforeUnload = () => {
      for (const [questionId, timer] of Object.entries(debounceTimers.current)) {
        if (!timer) continue;
        clearTimeout(timer);
        const question = test?.questions?.find((q) => q._id === questionId);
        if (!question || (question.kind !== "theory" && question.kind !== "coding")) continue;
        try {
          fetch(`${API_BASE_URL}/answers`, {
            method: "POST",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify({
              assignmentId,
              questionId,
              selectedOption: undefined,
              textAnswer: answers[questionId] || "",
              ...(question.kind === "coding" ? { language: languageFor(question) } : {}),
            }),
          });
        } catch {
          // Nothing useful to do while the page is going away.
        }
      }
      debounceTimers.current = {};
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [test, answers]);

  useEffect(() => () => {
    Object.values(debounceTimers.current).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
  }, []);

  useEffect(() => {
    const checkExistingTest = async () => {
      // Wait for proctoring. The server now withholds question content until a
      // proctoring session is actually running, so loading the paper before the
      // student has passed the pre-exam gate would return nothing.
      if (!proctor.ready) return;

      if (assignmentId && !testStarted && !startRequestMade.current) {
        try {
          const assignmentData = await apiRequest(
            `/assignments/${assignmentId}`
          );
          if (assignmentData && assignmentData.startedAt) {
            // Test already started, load existing data
            await loadExistingTestData();
          } else {
            // Test not started, start it directly
            await startTest();
          }
        } catch (error) {
          console.error("Error checking for existing test:", error);
          setError(error.message || "Failed to load test");
          setLoading(false);
        }
      }
    };

    checkExistingTest();
  }, [assignmentId, testStarted, proctor.ready]);

  // Whether the countdown should be ticking. The effect below depends on this,
  // not on `timeRemaining` itself: depending on the remaining time tore both
  // intervals down and rebuilt them every second, so the 30-second server check
  // never once got to fire.
  const clockRunning = testStarted && timeRemaining > 0 && !isSubmitting;

  useEffect(() => {
    let timer;
    let backendCheckTimer;

    if (clockRunning && !autoSubmitTriggered.current) {
      // Counted down to the attempt's end instant, not decremented per tick: a
      // throttled background tab fires this rarely, and a decrementing counter
      // would come back from it with most of the elapsed time missing.
      timer = setInterval(() => {
        const left = secondsLeft(clockRef.current);
        setTimeRemaining(left);
        // Through the ref: this interval now outlives many renders, and the
        // submit must carry the answers as they are now, not as they were
        // when the interval was created.
        if (left <= 0) handleTimeUpRef.current();
        setTimeSpent((prev) => prev + 1);
      }, 1000);

      // The server is the authority on whether time is up. This backstop matters
      // because a backgrounded tab has its setInterval throttled to roughly once
      // a minute, so the local countdown above drifts slow and would otherwise
      // let the exam run over.
      //
      // It keys off `error.code`, not the message text. It used to test
      // `message.includes("Test time has expired")`, which no reply from this
      // route has ever contained -- so the backstop never fired at all.
      backendCheckTimer = setInterval(async () => {
        try {
          const status = await apiRequest(`/assignments/check-expiration/${assignmentId}`);
          // Every reply carries the server's clock, so a countdown that drifted
          // -- or an end time an admin has since changed -- is put right here.
          const fresh = clockFromServer(status);
          if (fresh) clockRef.current = fresh;
        } catch (error) {
          if (error.code === "attempt_expired" && !autoSubmitTriggered.current) {
            handleTimeUpRef.current();
          }
        }
      }, 30000);
    }

    return () => {
      clearInterval(timer);
      clearInterval(backendCheckTimer);
    };
  }, [clockRunning, assignmentId]);


  const submitTest = async (
    cancelledDueToViolation = false,
    autoSubmit = false
  ) => {
    setIsSubmitting(true);
    try {
      const submissionData = {
        assignmentId,
        responses: test?.questions?.map((question) => {
          const answer = answers[question._id];
          let selectedOption = undefined;
          let textAnswer = undefined;

          if (answer !== undefined) {
            if (question.kind === "mcq" && typeof answer === "number") {
              // For MCQ, answer is index, map to option text
              selectedOption = question.options[answer].text;
            } else if (false) { // MSQ removed
              // For MSQ, answer is array of indices, map to option texts
              selectedOption = answer.map(idx => question.options[idx].text).join(', ');
            } else if (
              (question.kind === "theory" || question.kind === "coding") &&
              typeof answer === "string"
            ) {
              // For theory and coding, answer is text
              textAnswer = answer;
            }
          }

          return {
            questionId: question._id.toString(),
            selectedOption,
            textAnswer,
            ...(question.kind === "coding" ? { language: languageFor(question) } : {}),
          };
        }),
        timeSpent,
        // The server overwrites these from its own proctoring session record --
        // a browser can be made to claim anything, so what it says about its own
        // violations is not evidence. They are sent only so unproctored paths
        // (practice tests) still populate the field.
        tabViolationCount: proctor.violationCount || 0,
        tabViolations: [],
        cancelledDueToViolation,
        autoSubmit,
      };

      const safeJSONStringify = (obj) => {
        const seen = new WeakSet();
        return JSON.stringify(obj, (key, value) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
              return "[Circular]";
            }
            seen.add(value);
          }
          if (
            value &&
            typeof value === "object" &&
            (value instanceof HTMLElement ||
              value instanceof Event ||
              value.nodeType !== undefined)
          ) {
            return "[DOM Element]";
          }
          return value;
        });
      };

      // Retry logic for test submission
      let response;
      let retries = 3;
      let lastError;

      while (retries > 0) {
        try {
          response = await apiRequest("/test-submissions", {
            method: "POST",
            body: safeJSONStringify(submissionData),
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

      try {
        sessionStorage.removeItem(`exam_entered_${assignmentId}`);
      } catch {
        void 0;
      }
      // Handed in: nothing is waiting to be saved any more.
      clearPending(studentIdRef.current, assignmentId);
      setUnsavedIds(new Set());

      setIsSubmitting(false);
      // Under Safe Exam Browser the exit page is its configured quit URL, so
      // arriving there closes SEB and hands the machine back. Sending them to
      // the assignments list instead would leave them in a locked kiosk.
      navigate(`/student/assignments`);
    } catch (error) {
      console.error("Test submission failed:", error);
      setIsSubmitting(false);
      // Show error to student so they know what happened
      setSubmitError(error.message || "Failed to submit test. Please try again.");
      // Don't navigate away - let user try again
    }
  };

  // Let the provider trigger a submit when the server cancels this attempt.
  // The provider lives outside this component, so it reaches the submit function
  // through this ref rather than through a prop chain.
  useEffect(() => {
    if (submitRef) submitRef.current = submitTest;
  });

  const startTest = async () => {
    try {
      setLoading(true);

      const response = await apiRequest(`/assignments/${assignmentId}/start`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (response.alreadyStarted) {
        await loadExistingTestData();
        return;
      }

      if (!response.assignment || !response.test) {
        console.error("Unexpected response format from backend:", response);
        throw new Error(
          "Unexpected response format from backend. Expected assignment and test data."
        );
      }

      setAssignment(response.assignment);
      setTest(response.test);

      // Initialize questionStatuses to 'not-answered' for all questions
      const initialStatuses = {};
      response.test.questions.forEach((q) => {
        initialStatuses[q._id] = "not-answered";
      });
      setQuestionStatuses(initialStatuses);

      // The server says when this attempt ends -- the earlier of the window
      // and the test's time limit. See utils/examClock.js.
      clockRef.current = examClock(response, response.assignment, response.test.timeLimit);
      const remainingSeconds = secondsLeft(clockRef.current);

      if (remainingSeconds <= 0) {
        setError("This test's time has expired.");
        setLoading(false);
        return;
      }

      setTimeRemaining(remainingSeconds);
      setTestStarted(true);
      setLoading(false);

    } catch (error) {
      if (error.message === "Test already started") {
        await loadExistingTestData();
      } else if (
        error.message.includes("400") &&
        error.message.includes("Bad Request")
      ) {
        await loadExistingTestData();
      } else {
        setError(error.message || "Failed to start test");
        setLoading(false);
      }
    }
  };

  const loadExistingTestData = async () => {
    try {

      const assignmentData = await apiRequest(`/assignments/${assignmentId}`);
      setAssignment(assignmentData);

      // Same clock as startTest, from the resumed assignment.
      clockRef.current = examClock(assignmentData, assignmentData, assignmentData.testId?.timeLimit);
      const remainingSeconds = secondsLeft(clockRef.current);

      if (remainingSeconds <= 0) {
        setError("This test's time has expired.");
        setLoading(false);
        return;
      }


      let answersData = [];
      try {
        // A failed read used to be logged and skipped, which handed the student
        // a blank paper over answers the server still had -- and pressing Submit
        // on it wiped them. Retried a few times, and if it still fails the page
        // says so instead of pretending there is nothing saved. (A 404, "nothing
        // saved yet", comes back as [] from apiRequest and is not a failure.)
        answersData = await loadSavedAnswers(assignmentId);

        if (answersData && answersData.length > 0) {
          const existingAnswers = {};

          // Group responses by questionId to handle multiple saves
          const responsesByQuestion = {};
          answersData.forEach((response) => {
            if (!responsesByQuestion[response.questionId]) {
              responsesByQuestion[response.questionId] = [];
            }
            responsesByQuestion[response.questionId].push(response);
          });

          // Process each question's responses
          Object.entries(responsesByQuestion).forEach(([questionId, responses]) => {
            const question = assignmentData.testId.questions.find(
              (q) => q._id.toString() === questionId
            );

            if (!question) return;

            // For theory and coding questions, get the longest/most complete answer
            if (question.kind === "theory" || question.kind === "coding") {
              // `draftAnswer` first for coding: once Judge0 has graded an answer
              // its `textAnswer` is frozen as the graded source, and the
              // student's current editing lives in the draft. Restoring the
              // graded source would roll the editor back to an older attempt.
              const textAnswers = responses
                .map(r => (question.kind === "coding" && r.draftAnswer) || r.textAnswer)
                .filter(text => text !== undefined && text !== null);

              if (question.kind === "coding") {
                const withLanguage = responses.find(r => r.language);
                if (withLanguage) {
                  languageRef.current = {
                    ...languageRef.current,
                    [questionId]: normalizeLanguageKey(withLanguage.language) || "python",
                  };
                  setLanguageByQ(languageRef.current);
                }
              }

              if (textAnswers.length > 0) {
                // Get the longest answer (most complete)
                const longestAnswer = textAnswers.reduce((longest, current) =>
                  current.length > longest.length ? current : longest
                );
                existingAnswers[questionId] = longestAnswer;
              }
            } else if (question.kind === "mcq") {
              // For MCQ, get the last response (most recent)
              const mcqResponse = responses.find(r => r.selectedOption);
              if (mcqResponse) {
                // Exact text, or an answer the old autosave stripped -- see
                // utils/mcqOption.js. Without the second, a student resuming
                // an exam saved before that fix lost their choice silently.
                const index = findOptionIndex(question.options, mcqResponse.selectedOption);
                if (index !== -1) {
                  existingAnswers[questionId] = index;
                }
              }
            }
          });
          setAnswers(existingAnswers);
        } else {
        }
      } catch (answersError) {
        console.error("[TakeTest] Error loading answers:", answersError);
        throw new Error(
          "Your saved answers could not be loaded. Nothing has been lost -- please reload the page to continue."
        );
      }

      // Answers this browser has that the server never confirmed -- typed while
      // the connection was down, or just before the page went away. They are
      // newer than the server's copy, so they go on top and are sent again.
      const local = pendingAnswers(studentIdRef.current, assignmentId);
      const overlay = {};
      for (const [questionId, saved] of Object.entries(local)) {
        const question = assignmentData.testId.questions.find((q) => q._id.toString() === questionId);
        if (!question) continue;
        if (question.kind === "mcq") {
          const index = findOptionIndex(question.options, saved.selectedOption);
          if (!saved.selectedOption) overlay[questionId] = undefined; // cleared here, not yet on the server
          else if (index !== -1) overlay[questionId] = index;
        } else if ((question.kind === "theory" || question.kind === "coding") && typeof saved.textAnswer === "string") {
          overlay[questionId] = saved.textAnswer;
          if (question.kind === "coding" && saved.language) {
            languageRef.current = { ...languageRef.current, [questionId]: normalizeLanguageKey(saved.language) || "python" };
            setLanguageByQ(languageRef.current);
          }
        }
      }
      const resend = Object.keys(overlay);
      if (resend.length) {
        setAnswers((prev) => ({ ...prev, ...overlay }));
        // The local versions replace the server's rows for these questions, so
        // a question cleared here is not shown as answered from the old row.
        answersData = [
          ...(answersData || []).filter((row) => !resend.includes(String(row.questionId))),
          ...resend.map((questionId) => ({ questionId, ...local[questionId] })),
        ];
        setUnsavedIds(new Set(resend));
      }

      // Violations are no longer restored or judged here. The server carries the
      // count forward when the proctoring session is opened, and refuses to open
      // one at all if the limit was already exceeded -- which is what stops a
      // student reloading the page to escape a cancellation.

      // Initialize questionStatuses based on existing answers
      const initialStatuses = {};
      assignmentData.testId.questions.forEach((q) => {
        if (
          answersData &&
          answersData.some(
            (a) => a.questionId === q._id && (a.selectedOption || a.textAnswer)
          )
        ) {
          initialStatuses[q._id] = "answered";
        } else {
          initialStatuses[q._id] = "not-answered";
        }
      });
      setQuestionStatuses(initialStatuses);

      if (answersData && answersData.some((a) => a.selectedOption || a.textAnswer)) {
        try {
          sessionStorage.setItem(`exam_entered_${assignmentId}`, "true");
        } catch {
          void 0;
        }
        setHasEnteredExam(true);
      }

      setTest(assignmentData.testId);
      setTimeRemaining(remainingSeconds);
      setTestStarted(true);
      setLoading(false);

    } catch (error) {
      console.error("[TakeTest] Error loading test data:", error);
      setError(error.message || "Failed to load test data");
      setLoading(false);
    }
  };

  const handleAnswerChange = async (questionId, answerValue) => {
    const question = test?.questions?.find((q) => q._id === questionId);
    let selectedOption = undefined;
    let textAnswer = undefined;
    let hasAnswer = false;


    if (question.kind === "mcq") {
      // For MCQ, answerValue is the index (number)
      if (
        answerValue !== undefined &&
        answerValue !== null &&
        answerValue !== ""
      ) {
        selectedOption = question.options[answerValue].text;
        hasAnswer = true;
      }
      setAnswers((prev) => ({
        ...prev,
        [questionId]: answerValue,
      }));
    } else if (question.kind === "theory" || question.kind === "coding") {
      // For theory and coding, answerValue is the text (string)
      // Always set textAnswer to the current value (even if empty)
      textAnswer = answerValue || "";
      hasAnswer = answerValue && answerValue.trim() !== "";

      setAnswers((prev) => ({
        ...prev,
        [questionId]: answerValue,
      }));
    }

    // Into the local backup at once, before any debounce: if the page goes away
    // in the next second, this is the only copy.
    recordPending(studentIdRef.current, assignmentId, questionId, {
      selectedOption,
      textAnswer: question.kind === "mcq" ? undefined : textAnswer,
      ...(question.kind === "coding" ? { language: languageFor(question) } : {}),
    });

    // Update question status to 'answered' when answer is provided. Left alone
    // when it is already right: this runs on every keystroke in the code
    // editor, and a fresh object each time re-renders everything that reads it.
    const nextStatus = hasAnswer ? "answered" : "not-answered";
    setQuestionStatuses((prev) =>
      prev[questionId] === nextStatus ? prev : { ...prev, [questionId]: nextStatus }
    );

    // Clear existing debounce timer for this question
    if (debounceTimers.current[questionId]) {
      clearTimeout(debounceTimers.current[questionId]);
    }

    // For coding questions, debounce the save operation to avoid excessive API calls
    if (question.kind === "coding") {
      debounceTimers.current[questionId] = setTimeout(async () => {
        delete debounceTimers.current[questionId];
        await saveAnswerToBackend(questionId, selectedOption, textAnswer, hasAnswer);
      }, 1000); // Wait 1 second after user stops typing
    } else if (question.kind === "theory") {
      // For theory questions, debounce with shorter delay to preserve more content
      debounceTimers.current[questionId] = setTimeout(async () => {
        delete debounceTimers.current[questionId];
        await saveAnswerToBackend(questionId, selectedOption, textAnswer, hasAnswer);
      }, 500); // Wait 500ms after user stops typing
    } else {
      // For MCQ questions, save immediately
      await saveAnswerToBackend(questionId, selectedOption, textAnswer, hasAnswer);
    }
  };

  const saveAnswerToBackend = async (questionId, selectedOption, textAnswer, hasAnswer) => {
    // For theory and coding questions, always save to backend (even empty answers)
    // This ensures that partial answers are preserved and answers are cleared properly
    const question = test?.questions?.find((q) => q._id === questionId);
    // Every change is saved, an MCQ "Clear response" included. A cleared MCQ
    // used to be skipped here, so the server kept the old choice: it came back
    // on reload, and the hand-in -- which falls back to saved answers wherever
    // the page is blank (Backend/services/answerMerge.js) -- graded it.
    const shouldSave = Boolean(question) || hasAnswer;

    if (shouldSave) {
      // The option's text goes exactly as written. It is the answer key's own
      // currency -- grading compares it character for character -- so nothing
      // may be "cleaned" out of it. This used to strip anything that looked
      // like HTML by assigning it to innerHTML, which turned `vector<int>` into
      // `vector` (lost on reload, marked wrong by the expiry sweep) and ran any
      // script an option carried. See utils/mcqOption.js.
      const payload = {
        assignmentId,
        questionId,
        selectedOption,
        textAnswer: textAnswer || "", // Ensure textAnswer is always a string
        ...(question.kind === "coding" ? { language: languageFor(question) } : {}),
      };
      await postAnswer(payload);
    }
  };

  /**
   * Send one answer, and keep the record of what is unsaved honest.
   *
   * A failure is shown (SaveStatusBanner) and retried below rather than logged
   * and forgotten. Refusals that retrying cannot fix -- the attempt is over or
   * was ended by proctoring -- are not retried: the hand-in carries the page's
   * answers, and the server keeps the saved ones (services/answerMerge.js).
   */
  const postAnswer = async (payload) => {
    const { questionId } = payload;
    const answer = {
      selectedOption: payload.selectedOption,
      textAnswer: payload.selectedOption ? undefined : payload.textAnswer,
      language: payload.language,
    };
    recordPending(studentIdRef.current, assignmentId, questionId, answer);
    try {
      await apiRequest("/answers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      recordSaved(studentIdRef.current, assignmentId, questionId, answer);
      // Still unsaved if the student changed it again while this was in flight.
      const left = pendingAnswers(studentIdRef.current, assignmentId);
      markUnsaved(questionId, Boolean(left[questionId]));
      return true;
    } catch (error) {
      console.error("❌ Failed to save answer:", error);
      const final = ["attempt_expired", "attempt_not_active", "terminated", "ended", "not_owner", "signed_out"];
      markUnsaved(questionId, !final.includes(error?.code));
      return false;
    }
  };

  // Retry whatever is unsaved: soon after a failure, then every few seconds.
  // Each retry sends the latest version of the answer, from the local backup.
  useEffect(() => {
    if (!testStarted || isSubmitting || unsavedIds.size === 0) return undefined;
    const timer = setTimeout(async () => {
      const pending = pendingAnswers(studentIdRef.current, assignmentId);
      for (const questionId of unsavedIds) {
        if (debounceTimers.current[questionId]) continue; // a save is already scheduled
        const saved = pending[questionId];
        if (!saved) {
          markUnsaved(questionId, false);
          continue;
        }
        const ok = await postAnswer({
          assignmentId,
          questionId,
          selectedOption: saved.selectedOption ?? undefined,
          textAnswer: saved.textAnswer || "",
          ...(saved.language ? { language: saved.language } : {}),
        });
        if (!ok) break; // still failing: wait for the next round
      }
      // A round that changed nothing would not re-run this effect; nudge it.
      setUnsavedIds((prev) => new Set(prev));
    }, 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsavedIds, testStarted, isSubmitting, assignmentId]);

  const saveCurrentQuestionAnswer = async () => {
    const currentQ = test?.questions?.[currentQuestion];
    if (currentQ && (currentQ.kind === "theory" || currentQ.kind === "coding")) {
      const answerValue = answers[currentQ._id];
      let selectedOption = undefined;
      let textAnswer = undefined;
      let hasAnswer = false;

      if (currentQ.kind === "theory" || currentQ.kind === "coding") {
        // Always set textAnswer to the current value (even if empty)
        textAnswer = answerValue || "";
        hasAnswer = answerValue && answerValue.trim() !== "";
      }

      // Clear any pending debounce timer and save immediately
      if (debounceTimers.current[currentQ._id]) {
        clearTimeout(debounceTimers.current[currentQ._id]);
        delete debounceTimers.current[currentQ._id];
      }

      await saveAnswerToBackend(currentQ._id, selectedOption, textAnswer, hasAnswer);
    }
  };

  const handleNextQuestion = async () => {
    if (currentQuestion < (test?.questions?.length || 0) - 1) {
      // Save current question answer before navigating
      await saveCurrentQuestionAnswer();
      setCurrentQuestion((prev) => prev + 1);
    }
  };

  const handlePreviousQuestion = async () => {
    if (currentQuestion > 0) {
      // Save current question answer before navigating
      await saveCurrentQuestionAnswer();
      setCurrentQuestion((prev) => prev - 1);
    }
  };

  const handleQuestionNavigation = async (questionIndex) => {
    // Save current question answer before navigating
    await saveCurrentQuestionAnswer();
    setCurrentQuestion(questionIndex);
  };

  const handleTimeUp = async () => {
    // Guard: prevent duplicate auto-submit calls (race condition protection)
    if (autoSubmitTriggered.current || isSubmitting) return;
    autoSubmitTriggered.current = true;

    // Phase 1: Show "Time Completed" popup
    setAutoSubmitPhase('time-up');

    // Brief delay so the student sees the "time completed" message
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Phase 2: Show "Submitting" state
    setAutoSubmitPhase('submitting');
    setIsSubmitting(true);

    try {
      // Build submission data inline (same as submitTest but without navigation/alerts)
      const submissionData = {
        assignmentId,
        responses: test?.questions?.map((question) => {
          const answer = answers[question._id];
          let selectedOption = undefined;
          let textAnswer = undefined;

          if (answer !== undefined) {
            if (question.kind === "mcq" && typeof answer === "number") {
              selectedOption = question.options[answer].text;
            } else if (
              (question.kind === "theory" || question.kind === "coding") &&
              typeof answer === "string"
            ) {
              textAnswer = answer;
            }
          }

          return {
            questionId: question._id.toString(),
            selectedOption,
            textAnswer,
            ...(question.kind === "coding" ? { language: languageFor(question) } : {}),
          };
        }),
        timeSpent,
        // Overwritten server-side from the proctoring session -- see submitTest.
        tabViolationCount: proctor.violationCount || 0,
        tabViolations: [],
        cancelledDueToViolation: false,
        autoSubmit: true,
      };

      const safeJSONStringify = (obj) => {
        const seen = new WeakSet();
        return JSON.stringify(obj, (key, value) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) return "[Circular]";
            seen.add(value);
          }
          if (
            value &&
            typeof value === "object" &&
            (value instanceof HTMLElement ||
              value instanceof Event ||
              value.nodeType !== undefined)
          ) {
            return "[DOM Element]";
          }
          return value;
        });
      };

      // Retry logic with exponential backoff
      let response;
      let retries = 3;
      let lastError;

      while (retries > 0) {
        try {
          response = await apiRequest("/test-submissions", {
            method: "POST",
            body: safeJSONStringify(submissionData),
          });
          break;
        } catch (error) {
          lastError = error;
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
          }
        }
      }

      if (!response && lastError) {
        throw lastError;
      }

      // Closes the proctoring session and leaves fullscreen.
      await proctor.endSession();
      clearPending(studentIdRef.current, assignmentId);
      setUnsavedIds(new Set());

      // Phase 3: Show success briefly
      setAutoSubmitPhase('success');
      setIsSubmitting(false);

      // Navigate after a brief success display. Under SEB this address is its
      // quit URL, so arriving there closes the kiosk.
      await new Promise(resolve => setTimeout(resolve, 1000));
      navigate(`/student/assignments`);

    } catch (error) {
      console.error("Auto-submit failed:", error);
      setAutoSubmitPhase('error');
      setAutoSubmitError(error.message || 'Failed to submit. Please try again.');
      setIsSubmitting(false);
    }
  };
  // The countdown and the server check call the latest handleTimeUp through
  // this, so an auto-submit always sends the answers as they currently are.
  const handleTimeUpRef = useRef(handleTimeUp);
  handleTimeUpRef.current = handleTimeUp;


  const handleSubmitClick = () => {
    // Fullscreen check removed to allow submission even if fullscreen is exited
    setShowSubmitConfirmModal(true);
  };

  const handleConfirmSubmit = () => {
    setIsSubmitting(true);
    setShowSubmitConfirmModal(false);
    submitTest();
  };

  const handleCancelSubmit = () => {
    setShowSubmitConfirmModal(false);
  };

  // Stable handles for the memoised parts of the exam screen
  // (components/exam/ExamParts.jsx). The handlers themselves are recreated
  // every render -- every second, for the countdown -- which would defeat the
  // memo; these forward to the latest one without changing identity.
  const navigateRef = useRef(handleQuestionNavigation);
  navigateRef.current = handleQuestionNavigation;
  const onNavigate = useCallback((index) => navigateRef.current(index), []);
  const answerChangeRef = useRef(handleAnswerChange);
  answerChangeRef.current = handleAnswerChange;
  const onSelectOption = useCallback((questionId, index) => answerChangeRef.current(questionId, index), []);

  // Each question opens at its top, not wherever the last one was scrolled to.
  const questionScrollRef = useRef(null);
  useEffect(() => {
    questionScrollRef.current?.scrollTo?.({ top: 0 });
  }, [currentQuestion]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return <ExamStatusScreen title="Loading your test…" detail="Preparing the exam environment." />;
  }

  if (error) {
    return (
      <ExamStatusScreen
        tone="error"
        title="Something went wrong"
        detail={error}
        action={
          <button
            onClick={() => navigate("/student/assignments")}
            className="h-11 rounded-xl px-5 text-sm font-medium text-slate-200 ring-1 ring-white/10 transition-colors hover:bg-white/[0.05]"
          >
            ← Back to assignments
          </button>
        }
      />
    );
  }


  if (!testStarted || !test) {
    return <ExamStatusScreen title="Preparing your test…" detail="Setting up the proctoring environment." />;
  }

  const question = test?.questions?.[currentQuestion];

  // Don't render question content if question is not loaded yet
  if (!question) {
    return <ExamStatusScreen title="Loading question…" />;
  }

  // Helper: count answered questions
  const answeredCount = test.questions.filter((q) => {
    const answer = answers[q._id];
    if (q.kind === "mcq") return answer !== undefined && answer !== null && answer !== "";
    if (q.kind === "theory" || q.kind === "coding") return answer && answer.trim() !== "";
    return false;
  }).length;
  const totalQuestions = test?.questions?.length || 0;
  const markedCount = test.questions.filter((q) => questionStatuses[q._id] === "mark-for-review").length;
  const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
  const isTimeLow = timeRemaining <= 300;
  const isTimeCritical = timeRemaining <= 60;

  const totalMarks = (typeof test?.totalMarks === "number" && test.totalMarks > 0)
    ? test.totalMarks
    : (Array.isArray(test?.questions) && test.questions.length > 0)
      ? test.questions.reduce((acc, q) => acc + (Number(q.points) || 1), 0)
      : null;

  const testDurationMinutes = assignment?.duration || test?.timeLimit || test?.duration || null;


  // Everything that can sit on top of either view: the time-up sequence and
  // the submit confirmation.
  const overlays = (
    <>
      <SaveStatusBanner unsavedCount={unsavedIds.size} />
      {/* ═══════════ SUBMIT FAILED ═══════════ */}
      {submitError && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4" role="alertdialog" aria-modal="true" aria-labelledby="submit-failed-title">
          <div className="exam-enter w-full max-w-sm rounded-2xl bg-[#121a28] p-7 text-center ring-1 ring-white/10 shadow-2xl">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 ring-1 ring-rose-400/30">
              <svg className="h-6 w-6 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            </div>
            <h2 id="submit-failed-title" className="text-lg font-semibold text-white">Your test was not submitted</h2>
            <p className="mt-2 break-words text-sm text-slate-300">{submitError}</p>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">Your answers are still here. Check your connection and submit again.</p>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              className="mt-6 h-11 w-full rounded-xl bg-white text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-200"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ AUTO-SUBMIT (TIME UP) ═══════════ */}
      {autoSubmitPhase && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 auto-submit-overlay">
          <div className="w-full max-w-sm rounded-2xl bg-[#121a28] p-8 text-center ring-1 ring-white/10 shadow-2xl auto-submit-card">
            {autoSubmitPhase === 'time-up' && (
              <>
                <div className="relative mx-auto mb-6 h-16 w-16">
                  <div className="absolute inset-0 rounded-full bg-rose-500/15 auto-submit-pulse-ring"></div>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10 ring-1 ring-rose-400/40">
                    <svg className="h-8 w-8 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                </div>
                <h2 className="text-xl font-semibold text-white">Time is up</h2>
                <p className="mt-2 text-sm text-slate-400">Your exam time has ended. Preparing to submit your answers…</p>
              </>
            )}
            {autoSubmitPhase === 'submitting' && (
              <>
                <div className="mx-auto mb-6 h-14 w-14 rounded-full border-[3px] border-white/10 border-t-white auto-submit-spinner"></div>
                <h2 className="text-xl font-semibold text-white">Submitting your exam</h2>
                <p className="mt-2 text-sm text-slate-400">Please wait and do not close this window.</p>
              </>
            )}
            {autoSubmitPhase === 'success' && (
              <>
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-400/40">
                  <svg className="h-8 w-8 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path className="auto-submit-checkmark" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
                <h2 className="text-xl font-semibold text-white">Exam submitted</h2>
                <p className="mt-2 text-sm text-slate-400">Your answers were submitted successfully. Taking you back to your tests…</p>
              </>
            )}
            {autoSubmitPhase === 'error' && (
              <>
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10 ring-1 ring-rose-400/40 auto-submit-shake">
                  <svg className="h-8 w-8 text-rose-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                </div>
                <h2 className="text-xl font-semibold text-white">Submission failed</h2>
                <p className="mt-2 mb-6 text-sm text-slate-400">{autoSubmitError}</p>
                <button
                  onClick={() => {
                    autoSubmitTriggered.current = false;
                    setAutoSubmitPhase(null);
                    setAutoSubmitError('');
                    handleTimeUp();
                  }}
                  className="h-11 w-full rounded-xl bg-white text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-200"
                >
                  Retry submission
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ SUBMIT CONFIRMATION ═══════════ */}
      {showSubmitConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="submit-confirm-title">
          <div className="exam-enter w-full max-w-md rounded-2xl bg-[#121a28] p-7 ring-1 ring-white/10 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-teal-500/10 ring-1 ring-teal-400/30">
                <svg className="h-5 w-5 text-teal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 id="submit-confirm-title" className="text-lg font-semibold text-white">Submit your test?</h2>
                <p className="mt-1 text-sm text-slate-400">You won't be able to change your answers after submitting.</p>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-xl bg-white/[0.03] py-3 ring-1 ring-white/[0.06]">
                <dd className="text-xl font-semibold tabular-nums text-emerald-300">{answeredCount}</dd>
                <dt className="mt-0.5 text-[11px] text-slate-400">Answered</dt>
              </div>
              <div className="rounded-xl bg-white/[0.03] py-3 ring-1 ring-white/[0.06]">
                <dd className="text-xl font-semibold tabular-nums text-slate-100">{totalQuestions - answeredCount}</dd>
                <dt className="mt-0.5 text-[11px] text-slate-400">Not answered</dt>
              </div>
              <div className="rounded-xl bg-white/[0.03] py-3 ring-1 ring-white/[0.06]">
                <dd className="text-xl font-semibold tabular-nums text-amber-300">{markedCount}</dd>
                <dt className="mt-0.5 text-[11px] text-slate-400">For review</dt>
              </div>
            </dl>
            {(answeredCount < totalQuestions || markedCount > 0) && (
              <p className="mt-4 rounded-xl bg-amber-400/[0.08] px-4 py-3 text-xs leading-relaxed text-amber-200 ring-1 ring-amber-400/25">
                {answeredCount < totalQuestions
                  ? `${totalQuestions - answeredCount} question${totalQuestions - answeredCount !== 1 ? "s are" : " is"} still unanswered.`
                  : ""}
                {answeredCount < totalQuestions && markedCount > 0 ? " " : ""}
                {markedCount > 0 ? `${markedCount} ${markedCount !== 1 ? "are" : "is"} marked for review.` : ""}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleCancelSubmit}
                className="h-11 flex-1 rounded-xl text-sm font-medium text-slate-200 ring-1 ring-white/10 transition-colors hover:bg-white/[0.05]"
              >
                Keep working
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className="h-11 flex-1 rounded-xl bg-teal-600 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {isSubmitting ? "Submitting…" : "Submit test"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const toggleReview = (q) => {
    const currentStatus = questionStatuses[q._id];
    let newStatus;
    if (currentStatus === "mark-for-review") {
      const answer = answers[q._id];
      let hasAnswer = false;
      if (q.kind === "mcq") { hasAnswer = answer !== undefined && answer !== null && answer !== ""; }
      else if (q.kind === "theory" || q.kind === "coding") { hasAnswer = answer && answer.trim() !== ""; }
      newStatus = hasAnswer ? "answered" : "not-answered";
    } else { newStatus = "mark-for-review"; }
    setQuestionStatuses((prev) => ({ ...prev, [q._id]: newStatus }));
  };

  // ═══════════ PRE-EXAM INSTRUCTIONS SCREEN ═══════════
  if (!hasEnteredExam) {
    const instructionsText = test?.instructions?.trim();
    const rules = [
      ["Single display only", "External or secondary monitors are not allowed."],
      ["Stay in fullscreen", "Switching apps or tabs is recorded as a violation."],
      ["No trackpad gestures", "Three- or four-finger swipes that switch apps or desktops count as leaving the exam. Right-click and swipe-back are disabled."],
      ["Continuous monitoring", "Screen sharing and the webcam stay on for the whole test."],
      ["Auto-save", "Answers save as you go, and the test submits itself when time runs out."],
    ];

    return (
      <div className="exam-scroll flex min-h-screen flex-col items-center justify-center overflow-y-auto bg-[#0a0e17] px-4 py-8 text-slate-100 antialiased sm:py-12" style={{ zoom: zoomLevel / 100 }}>
        <ExamStyles />
        {overlays}
        <div className="exam-enter mx-auto w-full max-w-3xl overflow-hidden rounded-2xl bg-[#111724] ring-1 ring-white/[0.06] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.6)]">
          {/* ── Header ── */}
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-6 py-5 sm:px-8">
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/15">
                <svg className="h-5 w-5 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-tight text-white">{test.title || "Examination"}</h1>
                <p className="mt-0.5 text-xs text-slate-400">Read the details below before you begin</p>
              </div>
            </div>
            <div
              className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 font-mono text-sm font-semibold tabular-nums ring-1 ${
                isTimeCritical ? "bg-rose-500/[0.12] text-rose-200 ring-rose-400/40" : isTimeLow ? "bg-amber-400/[0.1] text-amber-200 ring-amber-400/30" : "bg-white/[0.03] text-slate-200 ring-white/[0.08]"
              }`}
              title="Time left"
            >
              <svg className="h-4 w-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {formatTime(timeRemaining)}
            </div>
          </div>

          <div className="space-y-8 px-6 py-7 sm:px-8">
            {/* At a glance */}
            <dl className="grid grid-cols-3 gap-3">
              {[
                ["Questions", totalQuestions > 0 ? totalQuestions : "—"],
                ["Total marks", totalMarks != null ? totalMarks : "—"],
                ["Duration", testDurationMinutes > 0 ? `${testDurationMinutes} min` : "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white/[0.025] px-4 py-3.5 ring-1 ring-white/[0.06]">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-white">{value}</dd>
                </div>
              ))}
            </dl>

            {/* Instructions */}
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-200">Test instructions</h2>
              <div className="rounded-xl bg-white/[0.025] p-5 text-sm leading-relaxed text-slate-300 ring-1 ring-white/[0.06] sm:text-[0.95rem]">
                {instructionsText ? (
                  <p className="whitespace-pre-line">{instructionsText}</p>
                ) : (
                  <p className="italic text-slate-500">No special instructions have been provided.</p>
                )}
              </div>
            </section>

            {/* Rules */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-200">
                <svg className="h-4 w-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                Exam rules
              </h2>
              <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-xl ring-1 ring-white/[0.06]">
                {rules.map(([title, detail]) => (
                  <li key={title} className="flex gap-3.5 bg-white/[0.015] px-5 py-3.5">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-300/80" />
                    <p className="text-sm leading-relaxed text-slate-400">
                      <span className="font-medium text-slate-200">{title}.</span> {detail}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* ── Footer ── */}
          <div className="flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] bg-[#0f1521] px-6 py-5 sm:flex-row sm:px-8">
            <label className="group flex cursor-pointer select-none items-center gap-3">
              <input
                type="checkbox"
                checked={acknowledgedRules}
                onChange={(e) => setAcknowledgedRules(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded accent-slate-100"
              />
              <span className="text-sm leading-tight text-slate-400 transition-colors group-hover:text-slate-200">
                I have read and understood the instructions and exam rules.
              </span>
            </label>
            <button
              type="button"
              onClick={handleStartExam}
              disabled={isSubmitting || !acknowledgedRules}
              className="flex h-11 w-full flex-shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-slate-900 shadow-[0_8px_24px_-12px_rgba(255,255,255,0.35)] transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-slate-500 disabled:shadow-none sm:w-auto"
            >
              Start test
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════ CODING VIEW ═══════════
  // A coding question gets the same full-screen workspace as the coding test
  // (components/coding/CodingWorkspace.jsx), whatever else is in the paper.
  if (question.kind === "coding") {
    const language = languageFor(question);
    const template = templateFor(language);
    // Until the student types, the editor shows the language's starting code
    // without it counting as an answer or being saved.
    const shownCode = answers[question._id] !== undefined ? answers[question._id] : template;
    const isMarked = questionStatuses[question._id] === "mark-for-review";

    const handleLanguageChange = (newLanguage) => {
      const current = answers[question._id];
      const untouched = current === undefined || current.trim() === "" || current === template;
      setQuestionLanguage(question._id, newLanguage);
      if (untouched) {
        // Nothing of theirs to keep: show the new language's starting code.
        if (current !== undefined) {
          setAnswers((prev) => {
            const next = { ...prev };
            delete next[question._id];
            return next;
          });
        }
      } else {
        // Their code stays; record which language it is now in.
        saveAnswerToBackend(question._id, undefined, current, true);
      }
    };

    const handleResetCode = async () => {
      if (debounceTimers.current[question._id]) {
        clearTimeout(debounceTimers.current[question._id]);
        delete debounceTimers.current[question._id];
      }
      setAnswers((prev) => {
        const next = { ...prev };
        delete next[question._id];
        return next;
      });
      setQuestionStatuses((prev) => ({ ...prev, [question._id]: "not-answered" }));
      await saveAnswerToBackend(question._id, undefined, "", false);
    };

    return (
      <>
      <style>
        {`
          .scrollbar-hide {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
          @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 8px 0 rgba(239, 68, 68, 0.4); }
            50% { box-shadow: 0 0 20px 4px rgba(239, 68, 68, 0.6); }
          }
          .timer-critical {
            animation: pulse-glow 1s ease-in-out infinite;
          }
          @keyframes autoSubmitFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes autoSubmitScaleIn {
            from { opacity: 0; transform: scale(0.85) translateY(20px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes autoSubmitSpin {
            to { transform: rotate(360deg); }
          }
          @keyframes autoSubmitCheckmark {
            0% { stroke-dashoffset: 24; }
            100% { stroke-dashoffset: 0; }
          }
          @keyframes autoSubmitPulseRing {
            0% { transform: scale(0.8); opacity: 1; }
            100% { transform: scale(1.8); opacity: 0; }
          }
          @keyframes autoSubmitShake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-6px); }
            40%, 80% { transform: translateX(6px); }
          }
          .auto-submit-overlay {
            animation: autoSubmitFadeIn 0.3s ease-out forwards;
          }
          .auto-submit-card {
            animation: autoSubmitScaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          .auto-submit-spinner {
            animation: autoSubmitSpin 1s linear infinite;
          }
          .auto-submit-checkmark {
            stroke-dasharray: 24;
            stroke-dashoffset: 24;
            animation: autoSubmitCheckmark 0.5s ease-out 0.2s forwards;
          }
          .auto-submit-pulse-ring {
            animation: autoSubmitPulseRing 1s ease-out forwards;
          }
          .auto-submit-shake {
            animation: autoSubmitShake 0.5s ease-out;
          }
        `}
      </style>
        <CodingWorkspace
          title={test.title}
          headerLeft={(
            <div className="flex items-center gap-1 text-white/60">
              <button
                type="button"
                disabled={currentQuestion === 0}
                onClick={handlePreviousQuestion}
                className="w-7 h-7 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center"
                title="Previous question"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-[13px] tabular-nums">{currentQuestion + 1}<span className="text-white/40"> / {totalQuestions}</span></span>
              <button
                type="button"
                disabled={currentQuestion === totalQuestions - 1}
                onClick={handleNextQuestion}
                className="w-7 h-7 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center"
                title="Next question"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <QuestionPalette
                questions={test.questions}
                current={currentQuestion}
                statuses={questionStatuses}
                onSelect={handleQuestionNavigation}
              />
              <button
                type="button"
                onClick={() => toggleReview(question)}
                title={isMarked ? "Remove the review mark" : "Mark this question for review"}
                className={`h-7 px-2 rounded flex items-center gap-1 text-[13px] transition-colors ${isMarked ? "bg-[#ffb800]/15 text-[#ffb800]" : "text-white/60 hover:bg-white/10 hover:text-white/90"}`}
              >
                {isMarked ? "★" : "☆"} Review
              </button>
            </div>
          )}
          headerRight={(
            <>
              <TimerPill seconds={timeRemaining} />
              <button
                type="button"
                onClick={handleSubmitClick}
                disabled={isSubmitting}
                className="h-8 px-3 rounded-md text-[13px] font-medium bg-[#28c244]/15 text-[#28c244] hover:bg-[#28c244]/25 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {isSubmitting ? "Submitting..." : "Submit Test"}
              </button>
            </>
          )}
          question={question}
          heading={`${currentQuestion + 1}. ${question.title || "Coding Problem"}`}
          chips={[`${question.points} ${question.points !== 1 ? "points" : "point"}`]}
          code={shownCode}
          onCodeChange={(value) => handleAnswerChange(question._id, value)}
          language={language}
          onLanguageChange={handleLanguageChange}
          supportedLanguages={supportedLanguages}
          judge={judge}
          onResetCode={handleResetCode}
        />
        {overlays}
      </>
    );
  }

  // ── Main exam view ──
  const isMarked = questionStatuses[question._id] === "mark-for-review";
  const isCurrentAnswered = isAnsweredValue(question, answers[question._id]);
  const isLastQuestion = currentQuestion === totalQuestions - 1;
  const markForReviewAndNext = async () => {
    setQuestionStatuses((prev) => ({ ...prev, [question._id]: "mark-for-review" }));
    await handleNextQuestion();
  };

  return (
    <>
      <style>
        {`
          .scrollbar-hide {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
          @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 8px 0 rgba(239, 68, 68, 0.4); }
            50% { box-shadow: 0 0 20px 4px rgba(239, 68, 68, 0.6); }
          }
          .timer-critical {
            animation: pulse-glow 1s ease-in-out infinite;
          }
          @keyframes autoSubmitFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes autoSubmitScaleIn {
            from { opacity: 0; transform: scale(0.85) translateY(20px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes autoSubmitSpin {
            to { transform: rotate(360deg); }
          }
          @keyframes autoSubmitCheckmark {
            0% { stroke-dashoffset: 24; }
            100% { stroke-dashoffset: 0; }
          }
          @keyframes autoSubmitPulseRing {
            0% { transform: scale(0.8); opacity: 1; }
            100% { transform: scale(1.8); opacity: 0; }
          }
          @keyframes autoSubmitShake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-6px); }
            40%, 80% { transform: translateX(6px); }
          }
          .auto-submit-overlay {
            animation: autoSubmitFadeIn 0.3s ease-out forwards;
          }
          .auto-submit-card {
            animation: autoSubmitScaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          .auto-submit-spinner {
            animation: autoSubmitSpin 1s linear infinite;
          }
          .auto-submit-checkmark {
            stroke-dasharray: 24;
            stroke-dashoffset: 24;
            animation: autoSubmitCheckmark 0.5s ease-out 0.2s forwards;
          }
          .auto-submit-pulse-ring {
            animation: autoSubmitPulseRing 1s ease-out forwards;
          }
          .auto-submit-shake {
            animation: autoSubmitShake 0.5s ease-out;
          }
        `}
      </style>
      <ExamStyles />
      <div
        className="flex flex-col overflow-hidden bg-[#0a0e17] text-slate-100 antialiased"
        // `zoom` scales viewport units too, so the height is divided back out:
        // at 125% a plain 100vh would render 25% taller than the window.
        style={{ zoom: zoomLevel / 100, height: `${10000 / zoomLevel}vh` }}
      >
        {/* ═══════════ TOP BAR ═══════════ */}
        <header className="relative flex-shrink-0 border-b border-white/[0.06] bg-[#0d121d]">
          <div className="mx-auto flex h-[72px] max-w-[1680px] items-center gap-5 px-5 xl:px-8 [@media(max-height:760px)]:h-16">
            <div className="flex min-w-0 flex-1 items-center gap-3.5">
              <div className="hidden h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/15 sm:flex [@media(max-height:760px)]:h-10 [@media(max-height:760px)]:w-10">
                <svg className="h-5 w-5 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-semibold tracking-tight text-white xl:text-base" title={test.title}>{test.title}</h1>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {totalQuestions} questions{totalMarks ? ` · ${totalMarks} marks` : ""}{testDurationMinutes ? ` · ${testDurationMinutes} min` : ""}
                </p>
              </div>
            </div>

            {/* Text size, time and submit: one family of controls -- same height,
                same corner radius, same border weight, evenly spaced. */}
            <div className="flex flex-shrink-0 items-center gap-3">
              <div
                className="hidden h-11 items-center gap-0.5 rounded-xl bg-white/[0.03] px-1 ring-1 ring-inset ring-white/[0.08] md:flex [@media(max-height:760px)]:h-10"
                role="group"
                aria-label="Text size"
              >
                <button onClick={handleZoomOut} disabled={zoomLevel <= 80} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30 [@media(max-height:760px)]:h-8 [@media(max-height:760px)]:w-8" title="Smaller text" aria-label="Smaller text">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}><path strokeLinecap="round" d="M5 12h14" /></svg>
                </button>
                <button onClick={handleZoomReset} className="flex h-9 min-w-[3.5rem] items-center justify-center rounded-lg px-2 text-sm font-medium tabular-nums text-slate-200 transition-colors hover:bg-white/[0.08] hover:text-white [@media(max-height:760px)]:h-8" title="Reset text size">{zoomLevel}%</button>
                <button onClick={handleZoomIn} disabled={zoomLevel >= 150} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30 [@media(max-height:760px)]:h-8 [@media(max-height:760px)]:w-8" title="Larger text" aria-label="Larger text">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.25}><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>

              <div
                role="timer"
                aria-label="Time remaining"
                className={`flex h-11 items-center gap-3 rounded-xl px-4 ring-1 ring-inset transition-colors duration-300 [@media(max-height:760px)]:h-10 ${
                  isTimeCritical
                    ? "bg-rose-500/[0.12] text-rose-200 ring-rose-400/40 exam-timer-critical"
                    : isTimeLow
                      ? "bg-amber-400/[0.1] text-amber-200 ring-amber-400/30"
                      : "bg-white/[0.03] text-white ring-white/[0.08]"
                }`}
              >
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${isTimeCritical ? "bg-rose-400" : isTimeLow ? "bg-amber-400" : "bg-emerald-400"}`} />
                <span className="hidden text-[11px] font-medium uppercase tracking-[0.12em] opacity-60 lg:inline">Time left</span>
                <span className="min-w-[4.25rem] text-right font-mono text-lg font-semibold tabular-nums tracking-wide">{formatTime(timeRemaining)}</span>
              </div>

              <button
                onClick={handleSubmitClick}
                disabled={isSubmitting}
                className="flex h-11 items-center gap-2 rounded-xl bg-teal-600 px-5 text-sm font-semibold text-white ring-1 ring-inset ring-teal-300/25 shadow-[0_8px_24px_-10px_rgba(13,148,136,0.7)] transition-colors hover:bg-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none [@media(max-height:760px)]:h-10"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                {isSubmitting ? "Submitting…" : "Submit test"}
              </button>
            </div>
          </div>
          {/* Answered progress, as a hairline along the bottom edge. */}
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-transparent">
            <div className="h-full bg-gradient-to-r from-slate-200 to-emerald-400 transition-[width] duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
          </div>
        </header>

        <div className="mx-auto flex min-h-0 w-full max-w-[1680px] flex-1 flex-col gap-5 p-4 lg:flex-row xl:gap-6 xl:p-6 2xl:p-8 [@media(max-height:760px)]:p-3 [@media(max-height:760px)]:gap-4">
          {/* ═══════════ QUESTION ═══════════ */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-[#111724] ring-1 ring-white/[0.06] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.6)]">
            <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-6 py-4 xl:px-8 [@media(max-height:760px)]:py-3">
              <div className="flex items-center gap-3">
                <h2 className="text-[15px] font-semibold text-white">
                  Question {currentQuestion + 1}
                  <span className="font-normal text-slate-500"> of {totalQuestions}</span>
                </h2>
                <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 ring-1 ring-white/[0.08]">
                  {question.kind === "mcq" ? "Single choice" : "Written answer"}
                </span>
                <span className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-100 ring-1 ring-white/20">
                  {question.points} {question.points === 1 ? "mark" : "marks"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleReview(question)}
                  aria-pressed={isMarked}
                  className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium ring-1 transition-colors ${
                    isMarked ? "bg-amber-400/[0.12] text-amber-200 ring-amber-400/40" : "text-slate-300 ring-white/10 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill={isMarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  {isMarked ? "Marked for review" : "Mark for review"}
                </button>
                <button
                  onClick={() => handleAnswerChange(question._id, question.kind === "mcq" ? undefined : "")}
                  disabled={!isCurrentAnswered}
                  className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-slate-300 ring-1 ring-white/10 transition-colors hover:bg-white/[0.05] hover:text-white disabled:pointer-events-none disabled:opacity-35"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  Clear response
                </button>
              </div>
            </div>

            {question.kind === "theory" ? (
              /* Written answer: question and answer side by side, each scrolling on its own. */
              <div key={question._id} className="exam-enter grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div ref={questionScrollRef} className="exam-scroll min-h-0 overflow-y-auto border-b border-white/[0.06] px-6 py-8 xl:border-b-0 xl:border-r xl:px-10 xl:py-10">
                  <div className="text-[1.05rem] font-medium leading-relaxed text-slate-100 xl:text-lg">
                    <QuestionText text={question.text} />
                  </div>
                  {question.guidelines && (
                    <div className="mt-8 rounded-xl bg-white/[0.025] p-5 ring-1 ring-white/[0.06]">
                      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Guidelines</h4>
                      <p className="text-sm leading-relaxed text-slate-300">{question.guidelines}</p>
                    </div>
                  )}
                  {question.examples?.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {question.examples.map((example, idx) => (
                        <div key={idx} className="rounded-xl bg-white/[0.025] p-5 ring-1 ring-white/[0.06]">
                          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Example {idx + 1}</div>
                          <div className="mb-1.5 text-xs text-slate-500">Input</div>
                          <pre className="mb-3 whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-mono text-sm text-slate-200">{example.input}</pre>
                          <div className="mb-1.5 text-xs text-slate-500">Output</div>
                          <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 font-mono text-sm text-emerald-300">{example.output}</pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex min-h-[18rem] flex-col px-6 py-8 xl:px-10 xl:py-10">
                  <label htmlFor={`answer-${question._id}`} className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Your answer</span>
                    <span className="text-xs tabular-nums text-slate-500">{wordCount(answers[question._id])} words</span>
                  </label>
                  <textarea
                    id={`answer-${question._id}`}
                    className="exam-scroll min-h-0 flex-1 resize-none rounded-xl bg-black/25 p-5 text-[0.975rem] leading-7 text-slate-100 ring-1 ring-white/10 transition-shadow placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-white/40"
                    value={answers[question._id] || ""}
                    onChange={(e) => handleAnswerChange(question._id, e.target.value)}
                    placeholder="Write your answer here…"
                  />
                </div>
              </div>
            ) : (
              /* Single choice */
              <div ref={questionScrollRef} className="exam-scroll min-h-0 flex-1 overflow-y-auto">
                <div key={question._id} className="exam-enter mx-auto w-full max-w-[54rem] 2xl:max-w-[60rem] px-6 py-10 xl:px-10 xl:py-12 [@media(max-height:760px)]:py-6">
                  <div className="text-[1.05rem] font-medium leading-relaxed text-slate-100 xl:text-lg 2xl:text-xl">
                    <QuestionText text={question.text} />
                  </div>
                  <p className="mt-9 mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 [@media(max-height:760px)]:mt-6">Select one answer</p>
                  <McqOptions
                    question={question}
                    selected={answers[question._id]}
                    number={currentQuestion + 1}
                    onSelect={onSelectOption}
                  />
                </div>
              </div>
            )}

            {/* Navigation */}
            <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] bg-[#0f1521] px-6 py-4 xl:px-8 [@media(max-height:760px)]:py-3">
              <button
                onClick={handlePreviousQuestion}
                disabled={currentQuestion === 0}
                className="flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-slate-200 ring-1 ring-white/10 transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:pointer-events-none disabled:opacity-35"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Previous
              </button>
              <div className="flex items-center gap-2.5">
                {!isLastQuestion && (
                  <button
                    onClick={markForReviewAndNext}
                    className="hidden h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-amber-200 ring-1 ring-amber-400/30 transition-colors hover:bg-amber-400/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:flex"
                  >
                    Mark for review &amp; next
                  </button>
                )}
                {isLastQuestion ? (
                  <button
                    onClick={handleSubmitClick}
                    disabled={isSubmitting}
                    className="flex h-10 items-center gap-2 rounded-xl bg-teal-600 px-5 text-sm font-semibold text-white ring-1 ring-teal-400/30 transition-colors hover:bg-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    Finish &amp; submit
                  </button>
                ) : (
                  <button
                    onClick={handleNextQuestion}
                    className="flex h-10 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-slate-900 shadow-[0_8px_24px_-12px_rgba(255,255,255,0.35)] transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    Save &amp; next
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </button>
                )}
              </div>
            </footer>
          </main>

          {/* ═══════════ QUESTION NAVIGATOR ═══════════ */}
          <aside className="flex max-h-[42vh] min-h-0 flex-shrink-0 flex-col overflow-hidden rounded-2xl bg-[#111724] ring-1 ring-white/[0.06] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.6)] lg:max-h-none lg:w-[20rem] xl:w-[22rem] 2xl:w-[24rem]">
            <QuestionNavigator
              questions={test.questions}
              current={currentQuestion}
              statuses={questionStatuses}
              answers={answers}
              onNavigate={onNavigate}
            />
          </aside>
        </div>

        {overlays}
      </div>
    </>);
};

/**
 * Proctoring wrapper.
 *
 * The provider is mounted around the page rather than inside it for one
 * reason: the server refuses to hand out question content until a proctoring
 * session exists, so the session has to be opened before the page starts
 * loading anything. The inner page waits on `proctor.ready`.
 *
 * `submitRef` is how the provider reaches the submit function when the server
 * cancels an attempt -- it lives inside the inner component, out of reach of a
 * normal prop.
 */
const TakeTest = () => {
  const { assignmentId } = useParams();
  const submitRef = useRef(null);

  const handleTerminate = useCallback(() => {
    submitRef.current?.(true, true);
  }, []);

  return (
    <ProctorProvider
      enabled
      assignmentId={assignmentId}
      testKind="assigned"
      onTerminate={handleTerminate}
    >
      <TakeTestInner submitRef={submitRef} />
    </ProctorProvider>
  );
};

export default TakeTest;

