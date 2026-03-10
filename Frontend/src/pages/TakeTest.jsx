import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import apiRequest from "../services/api";
import Judge0CodeEditor from "../components/Judge0CodeEditor";
import Proctoring from "../components/Proctoring";

const TakeTest = () => {
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
  const debounceTimers = useRef({});

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

  // Proctoring state
  const [proctoringData, setProctoringData] = useState({
    violationCount: 0,
    violations: [],
  });

  // Cleanup debounce timers on unmount and save pending answers
  useEffect(() => {
    const handleBeforeUnload = async (event) => {
      // Save any pending answers before page unload
      const pendingSaves = Object.entries(debounceTimers.current).map(async ([questionId, timer]) => {
        if (timer) {
          clearTimeout(timer);
          const question = test?.questions?.find((q) => q._id === questionId);
          if (question && (question.kind === "theory" || question.kind === "coding")) {
            const answerValue = answers[questionId];
            let selectedOption = undefined;
            let textAnswer = undefined;
            let hasAnswer = false;

            if (question.kind === "theory" || question.kind === "coding") {
              // Always set textAnswer to the current value (even if empty)
              textAnswer = answerValue || "";
              hasAnswer = answerValue && answerValue.trim() !== "";
            }

            // Force save the current answer
            await saveAnswerToBackend(questionId, selectedOption, textAnswer, hasAnswer);
          }
        }
      });

      // Wait for all saves to complete
      await Promise.all(pendingSaves);
    };

    // Add event listener for page unload
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      // Cleanup
      window.removeEventListener('beforeunload', handleBeforeUnload);
      Object.values(debounceTimers.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
  }, [test, answers]);

  useEffect(() => {
    const checkExistingTest = async () => {
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
  }, [assignmentId, testStarted]);

  useEffect(() => {
    let timer;
    let backendCheckTimer;

    if (testStarted && timeRemaining > 0 && !isSubmitting) {
      timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            handleTimeUp();
            return 0;
          }
          return prev - 1;
        });
        setTimeSpent((prev) => prev + 1);
      }, 1000);

      backendCheckTimer = setInterval(async () => {
        try {
          await apiRequest(`/assignments/check-expiration/${assignmentId}`);
        } catch (error) {
          if (
            error.message.includes("Test time has expired") &&
            !isSubmitting
          ) {
            await submitTest(false, true);
          }
        }
      }, 30000);
    }

    return () => {
      clearInterval(timer);
      clearInterval(backendCheckTimer);
    };
  }, [testStarted, timeRemaining, isSubmitting]);

  // Proctoring ref for accessing fullscreen methods
  const proctoringRef = useRef(null);

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
          };
        }),
        timeSpent,
        tabViolationCount: proctoringData.violationCount,
        tabViolations: proctoringData.violations.map((violation) => ({
          timestamp:
            violation.timestamp instanceof Date
              ? violation.timestamp.toISOString()
              : String(violation.timestamp),
          violationType: String(violation.violationType),
          details: String(violation.details),
          tabCount: Number(violation.tabCount),
        })),
        cancelledDueToViolation: cancelledDueToViolation || (test?.allowedTabSwitches !== -1 && proctoringData.violationCount > (test?.allowedTabSwitches ?? 2)),
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

      // Exit fullscreen mode before navigating
      if (proctoringRef.current?.exitFullscreen) {
        await proctoringRef.current.exitFullscreen();
      }

      setIsSubmitting(false);
      navigate(`/student/assignments`);
    } catch (error) {
      console.error("Test submission failed:", error);
      alert(error.message || "Failed to submit test. Please try again or contact support.");
      setIsSubmitting(false);
      // Don't navigate away - let user try again
    }
  };

  // Proctoring handlers (defined after submitTest)
  const handleProctoringViolation = useCallback(async (violationData) => {
    setProctoringData({
      violationCount: violationData.violationCount,
      violations: violationData.violations,
    });

    // Sync to backend immediately to ensure persistence
    try {
      if (assignmentId) {
        await apiRequest("/test-submissions/sync-violations", {
          method: "PUT",
          body: JSON.stringify({
            assignmentId,
            tabViolationCount: violationData.violationCount,
            tabViolations: violationData.violations.map(v => ({
              ...v,
              timestamp: v.timestamp instanceof Date ? v.timestamp.toISOString() : v.timestamp
            }))
          })
        });
      }
    } catch (err) {
      console.error("Failed to sync violations:", err);
    }
  }, [assignmentId]);

  const handleProctoringSubmit = useCallback((cancelledDueToViolation) => {
    submitTest(cancelledDueToViolation, false);
  }, [submitTest]);

  const handleProctoringExitFullscreen = useCallback(() => {
    // Optional: Add any cleanup logic here
  }, []);

  const startTest = async () => {
    try {
      setLoading(true);

      // Fetch current server time and browser timezone
      const timeResponse = await apiRequest("/time");
      const serverTime = new Date(timeResponse.serverTime);
      const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

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

      const assignmentDuration = response.assignment.duration;
      const testTimeLimit = response.test.timeLimit;

      // Always use test.timeLimit as timer duration
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
        }
      }, 300);
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

      // Fetch current server time and browser timezone
      const timeResponse = await apiRequest("/time");
      const serverTime = new Date(timeResponse.serverTime);
      const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const assignmentData = await apiRequest(`/assignments/${assignmentId}`);
      setAssignment(assignmentData);

      const assignmentDuration = assignmentData.duration;
      const testTimeLimit = assignmentData.testId.timeLimit;

      // Always use test.timeLimit as timer duration
      const totalSeconds = testTimeLimit * 60;
      const testStartTime = new Date(
        assignmentData.startedAt || assignmentData.startTime
      );
      const currentTime = serverTime; // Use server time instead of client time
      const elapsedSeconds = Math.floor((currentTime - testStartTime) / 1000);
      const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);


      let answersData = [];
      try {
        answersData = await apiRequest(`/answers/assignment/${assignmentId}`);

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
              const textAnswers = responses
                .filter(r => r.textAnswer !== undefined && r.textAnswer !== null)
                .map(r => r.textAnswer);

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
                const index = question.options.findIndex(
                  (opt) => opt.text === mcqResponse.selectedOption
                );
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
        if (
          answersError.message.includes("404") ||
          answersError.message.includes("not found") ||
          answersError.message.includes("Resource not found")
        ) {
          (
            "[TakeTest] No existing answers found (404 error) - this is expected when test is in progress but no answers saved yet"
          );
        } else {
          console.error("[TakeTest] Error loading answers:", answersError);
        }
      }

      // Fetch existing violation data using the dedicated violations endpoint
      let existingViolationCount = 0;
      try {
        const violationsResponse = await apiRequest(`/test-submissions/violations/${assignmentId}`);
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
        // Set loading to false and test started before submitting
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

      setTest(assignmentData.testId);
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

    // Update question status to 'answered' when answer is provided
    setQuestionStatuses((prev) => ({
      ...prev,
      [questionId]: hasAnswer ? "answered" : "not-answered",
    }));

    // Clear existing debounce timer for this question
    if (debounceTimers.current[questionId]) {
      clearTimeout(debounceTimers.current[questionId]);
    }

    // For coding questions, debounce the save operation to avoid excessive API calls
    if (question.kind === "coding") {
      debounceTimers.current[questionId] = setTimeout(async () => {
        await saveAnswerToBackend(questionId, selectedOption, textAnswer, hasAnswer);
      }, 1000); // Wait 1 second after user stops typing
    } else if (question.kind === "theory") {
      // For theory questions, debounce with shorter delay to preserve more content
      debounceTimers.current[questionId] = setTimeout(async () => {
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
    const shouldSave = question && (question.kind === "theory" || question.kind === "coding") ? true : hasAnswer;

    if (shouldSave) {
      // Sanitize selectedOption to extract plain text from HTML if needed
      let sanitizedSelectedOption = selectedOption;
      if (typeof selectedOption === "object" && selectedOption !== null) {
        sanitizedSelectedOption = String(selectedOption);
      }

      // If selectedOption contains HTML, extract plain text
      if (
        typeof sanitizedSelectedOption === "string" &&
        sanitizedSelectedOption.includes("<")
      ) {
        // Create a temporary DOM element to extract text content
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = sanitizedSelectedOption;
        sanitizedSelectedOption =
          tempDiv.textContent || tempDiv.innerText || sanitizedSelectedOption;
      }

      try {
        const payload = {
          assignmentId,
          questionId,
          selectedOption: sanitizedSelectedOption,
          textAnswer: textAnswer || "", // Ensure textAnswer is always a string
        };


        await apiRequest("/answers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } catch (error) {
        console.error("❌ Failed to save answer:", error);
        // Don't show alert for coding questions as it's too frequent
        // The answer will be saved on next successful attempt
      }
    }
  };

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
    await submitTest(false, true); // cancelledDueToViolation=false, autoSubmit=true
    alert("Time is up! Your test has been submitted automatically.");
  };


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

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-slate-700"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 animate-spin"></div>
          </div>
          <div className="text-xl font-semibold text-slate-200">Loading test...</div>
          <p className="text-slate-500 text-sm mt-2">Preparing your exam environment</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="text-xl font-semibold text-red-300 mb-2">Something went wrong</div>
          <p className="text-slate-400 mb-6 text-sm">{error}</p>
          <button
            onClick={() => navigate("/student/assignments")}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-600 font-medium transition-all duration-200"
          >
            ← Back to Assignments
          </button>
        </div>
      </div>
    );
  }


  if (!testStarted || !test) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-slate-700"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 animate-spin"></div>
          </div>
          <div className="text-xl font-semibold text-slate-200">Preparing test...</div>
          <p className="text-slate-500 text-sm mt-2">Setting up proctoring environment</p>
        </div>
      </div>
    );
  }

  const question = test?.questions?.[currentQuestion];

  // Don't render question content if question is not loaded yet
  if (!question) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-slate-700"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 animate-spin"></div>
          </div>
          <div className="text-xl font-semibold text-slate-200">Loading question...</div>
        </div>
      </div>
    );
  }

  // Helper: count answered questions
  const answeredCount = test.questions.filter((q) => {
    const answer = answers[q._id];
    if (q.kind === "mcq") return answer !== undefined && answer !== null && answer !== "";
    if (q.kind === "theory" || q.kind === "coding") return answer && answer.trim() !== "";
    return false;
  }).length;
  const totalQuestions = test?.questions?.length || 0;
  const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
  const isTimeLow = timeRemaining <= 300;
  const isTimeCritical = timeRemaining <= 60;

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
        `}
      </style>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 lg:p-6" style={{ zoom: zoomLevel / 100 }}>
        <div className="max-w-7xl mx-auto">

          {/* ═══════════ HEADER BAR ═══════════ */}
          <div className="flex justify-between items-start mb-6 p-4 lg:p-5 bg-slate-800/60 backdrop-blur-sm rounded-2xl border border-slate-700/40 shadow-xl">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl lg:text-2xl font-bold text-white truncate pr-4">{test.title}</h1>
              <p className="text-slate-400 text-sm mt-1">
                Question {currentQuestion + 1} of {totalQuestions}
              </p>
              <div className="flex items-center gap-1.5 mt-2.5">
                <button onClick={handleZoomOut} disabled={zoomLevel <= 80} className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-700/70 hover:bg-slate-600 text-slate-300 hover:text-white font-bold text-sm border border-slate-600/50 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed" title="Zoom Out">−</button>
                <button onClick={handleZoomReset} className="px-2.5 h-7 flex items-center justify-center rounded-lg bg-slate-700/70 hover:bg-slate-600 text-slate-400 hover:text-white text-xs font-semibold border border-slate-600/50 transition-all duration-200 min-w-[44px]" title="Reset Zoom">{zoomLevel}%</button>
                <button onClick={handleZoomIn} disabled={zoomLevel >= 150} className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-700/70 hover:bg-slate-600 text-slate-300 hover:text-white font-bold text-sm border border-slate-600/50 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed" title="Zoom In">+</button>
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className={`text-2xl lg:text-3xl font-mono px-5 py-2.5 rounded-xl font-bold tracking-wider ${isTimeCritical ? 'bg-red-500/20 text-red-300 border border-red-500/40 timer-critical' : isTimeLow ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-slate-700/60 text-white border border-slate-600/40'}`}>
                {formatTime(timeRemaining)}
              </div>
              <div className="text-xs text-slate-500 mt-1.5 font-medium tracking-wide uppercase">Time Remaining</div>
            </div>
          </div>

          {/* Instructions Banner */}
          {test.instructions && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 mb-6 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className="p-1.5 bg-blue-500/15 rounded-lg flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <h3 className="font-semibold text-blue-300 text-sm mb-1">Instructions</h3>
                  <p className="text-blue-200/70 text-sm leading-relaxed">{test.instructions}</p>
                </div>
              </div>
            </div>
          )}

          {question.kind === "theory" ? (
            <div className="grid grid-cols-1 lg:grid-cols-[45%_45%_7%] gap-4" style={{ height: '70vh' }}>
              {/* Question Panel */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-5 lg:p-6 overflow-y-auto h-full border border-slate-700/30 shadow-lg">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-bold tracking-wide">Q{currentQuestion + 1}</span>
                    <span className="px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600/30 text-slate-300 text-xs font-semibold">{question.points} {question.points !== 1 ? "pts" : "pt"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleAnswerChange(question._id, "")} className="px-3.5 py-1.5 bg-slate-700/60 hover:bg-slate-600/80 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition-all duration-200 border border-slate-600/40">Clear</button>
                    <button
                      onClick={() => {
                        const currentStatus = questionStatuses[question._id];
                        let newStatus;
                        if (currentStatus === "mark-for-review") {
                          const answer = answers[question._id];
                          const hasAnswer = answer && answer.trim() !== "";
                          newStatus = hasAnswer ? "answered" : "not-answered";
                        } else { newStatus = "mark-for-review"; }
                        setQuestionStatuses((prev) => ({ ...prev, [question._id]: newStatus }));
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border ${questionStatuses[question._id] === "mark-for-review" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-slate-700/60 text-slate-300 border-slate-600/40 hover:bg-slate-600/80"}`}
                    >{questionStatuses[question._id] === "mark-for-review" ? "★ Marked" : "☆ Review"}</button>
                  </div>
                </div>
                <h3 className="text-lg lg:text-xl font-semibold mb-5 text-slate-100 leading-relaxed">{question.text}</h3>

                {question.guidelines && (
                  <div className="bg-slate-700/30 p-4 rounded-xl mb-4 border border-slate-600/20">
                    <h4 className="font-semibold text-slate-300 mb-2 text-sm flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      Guidelines
                    </h4>
                    <p className="text-slate-400 text-sm leading-relaxed">{question.guidelines}</p>
                  </div>
                )}

                {question.examples && question.examples.length > 0 && (
                  <div className="bg-slate-700/30 p-4 rounded-xl mb-4 scrollbar-hide border border-slate-600/20" style={{ maxHeight: '16rem', overflowY: 'auto' }}>
                    {question.examples.map((example, idx) => (
                      <div key={idx} className="mb-3 last:mb-0 p-3 bg-slate-800/50 rounded-xl border border-slate-600/20">
                        <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Example {idx + 1}</div>
                        <div className="mb-1 text-xs font-semibold text-slate-400">Input:</div>
                        <pre className="whitespace-pre-wrap text-slate-300 bg-slate-900/60 p-2.5 rounded-lg text-sm font-mono mb-2">{example.input}</pre>
                        <div className="mb-1 text-xs font-semibold text-slate-400">Output:</div>
                        <pre className="whitespace-pre-wrap text-emerald-300 bg-slate-900/60 p-2.5 rounded-lg text-sm font-mono">{example.output}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Question Nav Strip */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-4 flex flex-col gap-2 max-h-[calc(100vh-160px)] overflow-y-auto scrollbar-hide order-last border border-slate-700/30 shadow-lg">
                <div className="flex flex-col gap-2 overflow-y-auto scrollbar-hide">
                  {test?.questions?.map((q, index) => (
                    <button key={q._id} onClick={() => handleQuestionNavigation(index)}
                      className={`w-10 h-10 rounded-xl text-sm font-bold transition-all duration-200 hover:scale-110 border-2 flex items-center justify-center ${currentQuestion === index
                        ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/30"
                        : questionStatuses[q._id] === "answered"
                          ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-500/20"
                          : questionStatuses[q._id] === "mark-for-review"
                            ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white border-amber-400 shadow-md shadow-amber-500/20"
                            : "bg-slate-800/80 hover:bg-slate-700 border-slate-600/50 hover:border-slate-500 text-slate-300"
                        }`}
                    >{index + 1}</button>
                  ))}
                </div>
              </div>

              {/* Answer Panel */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-5 lg:p-6 flex flex-col border border-slate-700/30 shadow-lg" style={{ height: '70vh' }}>
                <div className="flex-1">
                  <textarea
                    className="w-full h-full p-4 bg-slate-900/60 text-white rounded-xl border border-slate-600/30 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none resize-none transition-all duration-200 placeholder-slate-500 text-sm leading-relaxed"
                    value={answers[question._id] || ""}
                    onChange={(e) => handleAnswerChange(question._id, e.target.value)}
                    placeholder="Type your answer here..."
                  />
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={handlePreviousQuestion} disabled={currentQuestion === 0} className="flex-1 flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/90 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold transition-all duration-200 border border-slate-600/40">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Previous
                  </button>
                  <button onClick={handleNextQuestion} disabled={currentQuestion === totalQuestions - 1} className="flex-1 flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/90 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold transition-all duration-200 border border-slate-600/40">
                    Next<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                  <button onClick={handleSubmitClick} disabled={isSubmitting} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold transition-all duration-200 border ${isSubmitting ? 'bg-slate-700 text-slate-400 cursor-not-allowed border-slate-600' : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white border-emerald-500/50 shadow-lg shadow-emerald-500/20'}`}>
                    {isSubmitting ? 'Submitting...' : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Submit</>}
                  </button>
                </div>
              </div>
            </div>
          ) : question.kind === "coding" ? (
            /* ═══════════ CODING LAYOUT ═══════════ */
            <div className="grid grid-cols-1 lg:grid-cols-[45%_45%_7%] gap-4" style={{ height: '70vh' }}>
              {/* Question Panel */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-5 lg:p-6 overflow-y-auto h-full border border-slate-700/30 shadow-lg">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-bold tracking-wide">Q{currentQuestion + 1}</span>
                    <span className="px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600/30 text-slate-300 text-xs font-semibold">{question.points} {question.points !== 1 ? "pts" : "pt"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleAnswerChange(question._id, "")} className="px-3.5 py-1.5 bg-slate-700/60 hover:bg-slate-600/80 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition-all duration-200 border border-slate-600/40">Clear</button>
                    <button
                      onClick={() => {
                        const currentStatus = questionStatuses[question._id];
                        let newStatus;
                        if (currentStatus === "mark-for-review") {
                          const answer = answers[question._id];
                          const hasAnswer = answer && answer.trim() !== "";
                          newStatus = hasAnswer ? "answered" : "not-answered";
                        } else { newStatus = "mark-for-review"; }
                        setQuestionStatuses((prev) => ({ ...prev, [question._id]: newStatus }));
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border ${questionStatuses[question._id] === "mark-for-review" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-slate-700/60 text-slate-300 border-slate-600/40 hover:bg-slate-600/80"}`}
                    >{questionStatuses[question._id] === "mark-for-review" ? "★ Marked" : "☆ Review"}</button>
                  </div>
                </div>
                <h3 className="text-lg lg:text-xl font-semibold mb-5 text-slate-100 leading-relaxed">{question.text}</h3>

                {question.guidelines && (
                  <div className="bg-slate-700/30 p-4 rounded-xl mb-4 border border-slate-600/20">
                    <h4 className="font-semibold text-slate-300 mb-2 text-sm flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      Guidelines
                    </h4>
                    <p className="text-slate-400 text-sm leading-relaxed">{question.guidelines}</p>
                  </div>
                )}

                {question.visibleTestCases && question.visibleTestCases.length > 0 && (
                  <div className="bg-slate-700/30 p-4 rounded-xl mb-4 scrollbar-hide border border-slate-600/20" style={{ maxHeight: '16rem', overflowY: 'auto' }}>
                    <div className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                      Test Cases
                    </div>
                    {question.visibleTestCases.map((tc, idx) => (
                      <div key={idx} className="mb-3 last:mb-0 p-3 bg-slate-800/50 rounded-xl border border-slate-600/20">
                        <div className="text-xs font-bold text-slate-400 mb-2">Case {idx + 1}</div>
                        <div className="mb-1 text-xs font-semibold text-slate-400">Input:</div>
                        <pre className="whitespace-pre-wrap text-slate-300 bg-slate-900/60 p-2.5 rounded-lg text-sm font-mono mb-2">{tc.input}</pre>
                        <div className="mb-1 text-xs font-semibold text-slate-400">Output:</div>
                        <pre className="whitespace-pre-wrap text-emerald-300 bg-slate-900/60 p-2.5 rounded-lg text-sm font-mono">{tc.output}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Code Editor Panel */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-5 lg:p-6 flex flex-col border border-slate-700/30 shadow-lg" style={{ height: '70vh' }}>
                <div className="flex-1">
                  <Judge0CodeEditor
                    testId={test._id}
                    questionId={question._id}
                    assignmentId={assignmentId}
                    initialLanguage={question.language || "python"}
                    initialCode={answers[question._id] || ""}
                    onRun={(res) => {/* optional hook */ }}
                    onSubmit={(res) => {/* optional hook */ }}
                  />
                </div>
                <div className="flex gap-3 mt-5">
                  <button onClick={handlePreviousQuestion} disabled={currentQuestion === 0} className="flex-1 flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/90 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold transition-all duration-200 border border-slate-600/40">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Previous
                  </button>
                  <button onClick={handleNextQuestion} disabled={currentQuestion === totalQuestions - 1} className="flex-1 flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/90 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold transition-all duration-200 border border-slate-600/40">
                    Next<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                  <button onClick={handleSubmitClick} disabled={isSubmitting} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold transition-all duration-200 border ${isSubmitting ? 'bg-slate-700 text-slate-400 cursor-not-allowed border-slate-600' : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white border-emerald-500/50 shadow-lg shadow-emerald-500/20'}`}>
                    {isSubmitting ? 'Submitting...' : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Submit</>}
                  </button>
                </div>
              </div>

              {/* Question Nav Strip */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-4 flex flex-col gap-2 max-h-[calc(100vh-160px)] overflow-y-auto scrollbar-hide order-last border border-slate-700/30 shadow-lg">
                <div className="flex flex-col gap-2 overflow-y-auto scrollbar-hide">
                  {test?.questions?.map((q, index) => (
                    <button key={q._id} onClick={() => handleQuestionNavigation(index)}
                      className={`w-10 h-10 rounded-xl text-sm font-bold transition-all duration-200 hover:scale-110 border-2 flex items-center justify-center ${currentQuestion === index
                        ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/30"
                        : questionStatuses[q._id] === "answered"
                          ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-500/20"
                          : questionStatuses[q._id] === "mark-for-review"
                            ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white border-amber-400 shadow-md shadow-amber-500/20"
                            : "bg-slate-800/80 hover:bg-slate-700 border-slate-600/50 hover:border-slate-500 text-slate-300"
                        }`}
                    >{index + 1}</button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ═══════════ MCQ LAYOUT ═══════════ */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Question + Options */}
              <div className="lg:col-span-2">
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-5 lg:p-6 border border-slate-700/30 shadow-lg">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-bold tracking-wide">Q{currentQuestion + 1}</span>
                      <span className="px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600/30 text-slate-300 text-xs font-semibold">{question.points} {question.points !== 1 ? "pts" : "pt"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (question.kind === "mcq") { handleAnswerChange(question._id, undefined); }
                          else { handleAnswerChange(question._id, ""); }
                        }}
                        className="px-3.5 py-1.5 bg-slate-700/60 hover:bg-slate-600/80 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition-all duration-200 border border-slate-600/40"
                      >Clear</button>
                      <button
                        onClick={() => {
                          const currentStatus = questionStatuses[question._id];
                          let newStatus;
                          if (currentStatus === "mark-for-review") {
                            const answer = answers[question._id];
                            let hasAnswer = false;
                            if (question.kind === "mcq") { hasAnswer = answer !== undefined && answer !== null && answer !== ""; }
                            else if (question.kind === "theory" || question.kind === "coding") { hasAnswer = answer && answer.trim() !== ""; }
                            newStatus = hasAnswer ? "answered" : "not-answered";
                          } else { newStatus = "mark-for-review"; }
                          setQuestionStatuses((prev) => ({ ...prev, [question._id]: newStatus }));
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border ${questionStatuses[question._id] === "mark-for-review" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-slate-700/60 text-slate-300 border-slate-600/40 hover:bg-slate-600/80"}`}
                      >{questionStatuses[question._id] === "mark-for-review" ? "★ Marked" : "☆ Review"}</button>
                    </div>
                  </div>
                  <h3 className="text-lg lg:text-xl font-semibold mb-6 text-slate-100 leading-relaxed">{question.text}</h3>

                  {question.kind === "mcq" && (
                    <div className="space-y-3">
                      {question.options?.map((option, index) => (
                        <label
                          key={index}
                          className={`flex items-center p-4 rounded-xl cursor-pointer transition-all duration-200 border-2 group ${answers[question._id] === index
                            ? "bg-blue-500/15 text-white border-blue-500/40 shadow-md shadow-blue-500/10"
                            : "bg-slate-800/40 hover:bg-slate-700/50 border-slate-600/20 hover:border-slate-500/40"
                            }`}
                        >
                          <div className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center mr-4 flex-shrink-0 transition-all duration-200 text-sm font-bold ${answers[question._id] === index
                            ? "bg-blue-500 border-blue-400 text-white" : "border-slate-500/50 text-slate-400 group-hover:border-slate-400"
                            }`}>{String.fromCharCode(65 + index)}</div>
                          <input type="radio" name={`question-${question._id}`} value={index} checked={answers[question._id] === index} onChange={() => handleAnswerChange(question._id, index)} className="sr-only" />
                          <span className="text-sm lg:text-base leading-relaxed">{option.text}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {question.kind === "theory" && (
                    <>
                      {question.guidelines && (
                        <div className="bg-slate-700/30 p-4 rounded-xl mb-4 border border-slate-600/20">
                          <h4 className="font-semibold text-slate-300 mb-2 text-sm">Guidelines:</h4>
                          <p className="text-slate-400 text-sm leading-relaxed">{question.guidelines}</p>
                        </div>
                      )}
                      {question.examples && question.examples.length > 0 && (
                        <div className="bg-slate-700/30 p-4 rounded-xl mb-4 max-h-64 overflow-y-auto scrollbar-hide border border-slate-600/20">
                          {question.examples.map((example, idx) => (
                            <div key={idx} className="mb-3 last:mb-0 p-3 bg-slate-800/50 rounded-xl border border-slate-600/20">
                              <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Example {idx + 1}</div>
                              <div className="mb-1 text-xs font-semibold text-slate-400">Input:</div>
                              <pre className="whitespace-pre-wrap text-slate-300 bg-slate-900/60 p-2.5 rounded-lg text-sm font-mono mb-2">{example.input}</pre>
                              <div className="mb-1 text-xs font-semibold text-slate-400">Output:</div>
                              <pre className="whitespace-pre-wrap text-emerald-300 bg-slate-900/60 p-2.5 rounded-lg text-sm font-mono">{example.output}</pre>
                            </div>
                          ))}
                        </div>
                      )}
                      <textarea
                        className="w-full p-4 bg-slate-900/60 text-white rounded-xl border border-slate-600/30 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:outline-none resize-none transition-all duration-200 placeholder-slate-500 text-sm leading-relaxed"
                        style={{ height: "200px" }}
                        value={answers[question._id] || ""}
                        onChange={(e) => handleAnswerChange(question._id, e.target.value)}
                        placeholder="Type your answer here..."
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Navigation Sidebar */}
              <div className="lg:col-span-1">
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-5 lg:p-6 border border-slate-700/30 shadow-lg">
                  <h3 className="font-bold mb-4 text-sm uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                    Questions
                  </h3>

                  <div className="grid grid-cols-5 gap-2 overflow-y-auto scrollbar-hide" style={{ maxHeight: "21vh" }}>
                    {test?.questions?.map((q, index) => (
                      <button key={q._id} onClick={() => handleQuestionNavigation(index)}
                        className={`w-9 h-9 rounded-xl text-sm font-bold transition-all duration-200 hover:scale-110 border-2 flex items-center justify-center ${currentQuestion === index
                          ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white border-blue-400 shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/30"
                          : questionStatuses[q._id] === "answered"
                            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-500/20"
                            : questionStatuses[q._id] === "mark-for-review"
                              ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white border-amber-400 shadow-md shadow-amber-500/20"
                              : "bg-slate-800/80 hover:bg-slate-700 border-slate-600/50 hover:border-slate-500 text-slate-300"
                          }`}
                      >{index + 1}</button>
                    ))}
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-slate-700/40">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400"><div className="w-3 h-3 rounded bg-blue-500"></div> Current</div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400"><div className="w-3 h-3 rounded bg-emerald-500"></div> Answered</div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400"><div className="w-3 h-3 rounded bg-amber-500"></div> Review</div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400"><div className="w-3 h-3 rounded bg-slate-700"></div> Unanswered</div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 mt-5">
                    <button onClick={handlePreviousQuestion} disabled={currentQuestion === 0} className="flex-1 flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/90 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold transition-all duration-200 border border-slate-600/40">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Previous
                    </button>
                    <button onClick={handleNextQuestion} disabled={currentQuestion === totalQuestions - 1} className="flex-1 flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/90 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold transition-all duration-200 border border-slate-600/40">
                      Next<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                    <button onClick={handleSubmitClick} disabled={isSubmitting} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold transition-all duration-200 border ${isSubmitting ? 'bg-slate-700 text-slate-400 cursor-not-allowed border-slate-600' : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white border-emerald-500/50 shadow-lg shadow-emerald-500/20'}`}>
                      {isSubmitting ? 'Submitting...' : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Submit</>}
                    </button>
                  </div>

                  {/* Progress */}
                  <div className="mt-5 pt-4 border-t border-slate-700/40">
                    <div className="flex justify-between text-xs text-slate-400 mb-2 font-semibold">
                      <span>Progress</span>
                      <span className="text-slate-300">{answeredCount}/{totalQuestions}</span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-2.5 overflow-hidden">
                      <div className="h-2.5 rounded-full transition-all duration-500 ease-out" style={{
                        width: `${progressPercent}%`,
                        background: progressPercent === 100 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                      }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Proctoring Component */}
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
          initialViolationCount={proctoringData.violationCount}
        />

        {/* ═══════════ SUBMIT CONFIRMATION MODAL ═══════════ */}
        {showSubmitConfirmModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800/95 backdrop-blur-xl rounded-2xl p-8 max-w-md w-full text-center border border-slate-700/50 shadow-2xl">
              <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold mb-3 text-white">Submit Test?</h2>
              <p className="text-slate-400 mb-3 text-sm">
                You have answered <span className="text-white font-semibold">{answeredCount}</span> out of <span className="text-white font-semibold">{totalQuestions}</span> questions.
              </p>
              {answeredCount < totalQuestions && (
                <p className="text-amber-400/80 text-xs mb-6 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                  ⚠ {totalQuestions - answeredCount} question{totalQuestions - answeredCount !== 1 ? 's' : ''} left unanswered
                </p>
              )}
              {answeredCount >= totalQuestions && <div className="mb-6"></div>}
              <div className="flex gap-3">
                <button onClick={handleCancelSubmit} className="flex-1 px-6 py-3 rounded-xl font-semibold bg-slate-700/80 hover:bg-slate-600 text-white border border-slate-600/50 transition-all duration-200">
                  Go Back
                </button>
                <button onClick={handleConfirmSubmit} disabled={isSubmitting}
                  className={`flex-1 px-6 py-3 rounded-xl font-bold transition-all duration-200 border ${isSubmitting ? 'bg-slate-700 text-slate-400 cursor-not-allowed border-slate-600' : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white border-emerald-500/50 shadow-lg shadow-emerald-500/20'}`}
                >
                  {isSubmitting ? 'Submitting...' : 'Confirm Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>);
};

export default TakeTest;

