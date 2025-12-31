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

      const response = await apiRequest("/test-submissions", {
        method: "POST",
        body: safeJSONStringify(submissionData),
      });

      // Exit fullscreen mode before navigating
      if (proctoringRef.current?.exitFullscreen) {
        await proctoringRef.current.exitFullscreen();
      }

      setIsSubmitting(false);
      navigate(`/student/assignments`);
    } catch (error) {
      console.error("Test submission failed:", error);
      alert(error.message || "Failed to submit test");
      setIsSubmitting(false);
      navigate("/student/assignments");
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
      console.log('Test data loaded in startTest:', response.test);
      console.log('Test allowedTabSwitches:', response.test?.allowedTabSwitches);

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
      setTimeout(() => {
        if (proctoringRef.current?.requestFullscreen) {
          proctoringRef.current.requestFullscreen();
        }
      }, 100);
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
        answersData = await apiRequest(`/answers/assignment/${assignmentId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

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
                console.log(`📥 Loading theory answer for question ${questionId}:`, longestAnswer);
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
          console.log(
            `[TakeTest] Restored ${
              Object.keys(existingAnswers).length
            } answers from existing answers`
          );
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
      console.log('Test data loaded in loadExistingTestData:', assignmentData.testId);
      console.log('Test allowedTabSwitches:', assignmentData.testId?.allowedTabSwitches);
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

    console.log(`🔄 handleAnswerChange called for question ${questionId}:`, { answerValue, questionKind: question?.kind });

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
      console.log(`⏰ Setting debounce timer for theory question ${questionId}, textAnswer:`, textAnswer);
      debounceTimers.current[questionId] = setTimeout(async () => {
        console.log(`⏰ Debounce timer triggered for theory question ${questionId}`);
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
        
        console.log(`🔄 Saving answer for question ${questionId}:`, payload);
        
        await apiRequest("/answers", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        console.log(`✅ Answer saved successfully for question ${questionId}:`, payload);
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
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading test...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-red-400 mb-4">Error: {error}</div>
          <button
            onClick={() => navigate("/student/assignments")}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md"
          >
            Back to Assignments
          </button>
        </div>
      </div>
    );
  }


  if (!testStarted || !test) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-xl">Preparing test...</div>
      </div>
    );
  }

  const question = test?.questions?.[currentQuestion];

  // Don't render question content if question is not loaded yet
  if (!question) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl">Loading question...</div>
        </div>
      </div>
    );
  }

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
        `}
      </style>
      <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8 p-4 bg-slate-800 rounded-lg">
          <div>
            <h1 className="text-2xl font-bold">{test.title}</h1>
            <p className="text-slate-400">
              Question {currentQuestion + 1} of {test?.questions?.length || 0}
            </p>
          </div>


          <div className="text-right">
            <div className="text-2xl font-mono bg-slate-700 px-4 py-2 rounded-md text-white">
              {formatTime(timeRemaining)}
            </div>
            <div className="text-sm text-slate-400 mt-1">Time Remaining</div>
          </div>
        </div>

        {test.instructions && (
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-300 mb-2">Instructions:</h3>
            <p className="text-blue-200">{test.instructions}</p>
          </div>
        )}

          {question.kind === "theory" ? (
            <div className="grid grid-cols-1 lg:grid-cols-[45%_45%_7%] gap-4.5" style={{ height: '70vh' }}>
              <div className="bg-slate-800 rounded-lg p-6 overflow-y-auto h-full">
              <div className="flex items-center gap-3 mb-4 justify-between">
                <span className="text-sm text-slate-400">
                  Question {currentQuestion + 1}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleAnswerChange(question._id, "")}
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-sm font-medium cursor-pointer transition-colors"
                  >
                    Clear Response
                  </button>
                  <button
                    onClick={() => {
                      const currentStatus = questionStatuses[question._id];
                      let newStatus;

                      if (currentStatus === "mark-for-review") {
                        const answer = answers[question._id];
                        const hasAnswer = answer && answer.trim() !== "";
                        newStatus = hasAnswer ? "answered" : "not-answered";
                      } else {
                        newStatus = "mark-for-review";
                      }

                      setQuestionStatuses((prev) => ({
                        ...prev,
                        [question._id]: newStatus,
                      }));
                    }}
                    className={`px-3 py-1 rounded-md text-sm font-medium cursor-pointer transition-colors ${
                      questionStatuses[question._id] === "mark-for-review"
                        ? "bg-orange-600 text-white hover:bg-orange-700"
                        : "bg-slate-700 hover:bg-slate-600"
                    }`}
                  >
                    {questionStatuses[question._id] === "mark-for-review"
                      ? "Unmark Review"
                      : "Mark for Review"}
                  </button>
                  <div className="bg-slate-700 px-3 py-1 rounded-md text-sm">
                    {question.points} point{question.points !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-6">{question.text}</h3>

              {question.guidelines && (
              <div className="bg-slate-700 p-4 rounded-lg mb-4 scrollbar-hide" style={{overflowY: 'auto'}}>
                <h4 className="font-semibold text-slate-300 mb-2">
                  Guidelines:
                </h4>
                <p className="text-slate-400">{question.guidelines}</p>
              </div>
              )}

              {question.examples && question.examples.length > 0 && (
              <div className="bg-slate-700 p-4 rounded-lg mb-4 scrollbar-hide" style={{maxHeight: '16rem', overflowY: 'auto'}}>
                <div>
                  {question.examples.map((example, idx) => (
                    <div key={idx} className="mb-3 p-3 bg-slate-600 rounded">
                      <div className="mb-1 font-semibold text-slate-300">Example {idx + 1}:</div>
                      <div className="mb-1 font-semibold text-slate-300">Input:</div>
                      <pre className="whitespace-pre-wrap text-slate-400 bg-slate-800 p-2 rounded">
                        {example.input}
                      </pre>
                      <div className="mt-2 mb-1 font-semibold text-slate-300">Output:</div>
                      <pre className="whitespace-pre-wrap text-slate-400 bg-slate-800 p-2 rounded">
                        {example.output}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
              )}
            </div>

            <div className="bg-slate-800 rounded-lg p-6 flex flex-col gap-2 max-h-[calc(100vh-160px)] overflow-y-auto scrollbar-hide order-last" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div className="flex flex-col gap-2 overflow-y-auto scrollbar-hide">
                {test?.questions?.map((q, index) => (
                  <button
                    key={q._id}
                    onClick={() => handleQuestionNavigation(index)}
                  className={`w-8 min-w-[40px] h-12 rounded-md text-sm font-semibold cursor-pointer transition-all duration-200 hover:scale-105 border-2 ${
                      currentQuestion === index
                        ? "bg-blue-600 text-white border-blue-400 shadow-lg"
                        : questionStatuses[q._id] === "answered"
                        ? "bg-green-600 text-white border-green-400 hover:border-green-300"
                        : questionStatuses[q._id] === "mark-for-review"
                        ? "bg-yellow-600 text-black border-yellow-400 hover:border-yellow-300"
                        : "bg-slate-700 hover:bg-slate-600 border-slate-600 hover:border-slate-500"
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg p-6 flex flex-col" style={{ height: '70vh' }}>
              <div className="flex-1">
                <textarea
                  className="w-full h-full p-4 bg-slate-800 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none resize-none"
                  value={answers[question._id] || ""}
                  onChange={(e) => handleAnswerChange(question._id, e.target.value)}
                  placeholder="Enter your answer here..."
                />
              </div>
              <div className="flex justify-between mt-4 gap-4">
                <button
                  onClick={handlePreviousQuestion}
                  disabled={currentQuestion === 0}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-md cursor-pointer"
                >
                  Previous
                </button>
                <button
                  onClick={handleNextQuestion}
                  disabled={currentQuestion === (test?.questions?.length || 0) - 1}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-md cursor-pointer"
                >
                  Next
                </button>
                <button
                  onClick={handleSubmitClick}
                  disabled={isSubmitting}
                  className={`flex-1 ${isSubmitting ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'} text-white py-2 rounded-md font-semibold ${!isSubmitting ? 'cursor-pointer' : ''}`}
                >
                  {isSubmitting ? 'Submitting Test...' : 'Submit Test'}
                </button>
              </div>
            </div>
          </div>
        ) : question.kind === "coding" ? (
          <div className="grid grid-cols-1 lg:grid-cols-[45%_45%_7%] gap-4.5" style={{ height: '70vh' }}>
            <div className="bg-slate-800 rounded-lg p-6 overflow-y-auto h-full">
              <div className="flex items-center gap-3 mb-4 justify-between">
                <span className="text-sm text-slate-400">
                  Question {currentQuestion + 1}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleAnswerChange(question._id, "")}
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-sm font-medium cursor-pointer transition-colors"
                  >
                    Clear Response
                  </button>
                  <button
                    onClick={() => {
                      const currentStatus = questionStatuses[question._id];
                      let newStatus;

                      if (currentStatus === "mark-for-review") {
                        const answer = answers[question._id];
                        const hasAnswer = answer && answer.trim() !== "";
                        newStatus = hasAnswer ? "answered" : "not-answered";
                      } else {
                        newStatus = "mark-for-review";
                      }

                      setQuestionStatuses((prev) => ({
                        ...prev,
                        [question._id]: newStatus,
                      }));
                    }}
                    className={`px-3 py-1 rounded-md text-sm font-medium cursor-pointer transition-colors ${
                      questionStatuses[question._id] === "mark-for-review"
                        ? "bg-orange-600 text-white hover:bg-orange-700"
                        : "bg-slate-700 hover:bg-slate-600"
                    }`}
                  >
                    {questionStatuses[question._id] === "mark-for-review"
                      ? "Unmark Review"
                      : "Mark for Review"}
                  </button>
                  <div className="bg-slate-700 px-3 py-1 rounded-md text-sm">
                    {question.points} point{question.points !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-6">{question.text}</h3>

              {question.guidelines && (
                <div className="bg-slate-700 p-4 rounded-lg mb-4 scrollbar-hide" style={{overflowY: 'auto'}}>
                  <h4 className="font-semibold text-slate-300 mb-2">
                    Guidelines:
                  </h4>
                  <p className="text-slate-400">{question.guidelines}</p>
                </div>
              )}

              {question.visibleTestCases && question.visibleTestCases.length > 0 && (
                <div className="bg-slate-700 p-4 rounded-lg mb-4 scrollbar-hide" style={{maxHeight: '16rem', overflowY: 'auto'}}>
                  <div className="text-slate-300 font-semibold mb-2">Normal Test Cases</div>
                  {question.visibleTestCases.map((tc, idx) => (
                    <div key={idx} className="mb-3 p-3 bg-slate-600 rounded">
                      <div className="mb-1 font-semibold text-slate-300">Case {idx + 1}:</div>
                      <div className="mb-1 font-semibold text-slate-300">Input:</div>
                      <pre className="whitespace-pre-wrap text-slate-400 bg-slate-800 p-2 rounded">
                        {tc.input}
                      </pre>
                      <div className="mt-2 mb-1 font-semibold text-slate-300">Output:</div>
                      <pre className="whitespace-pre-wrap text-slate-400 bg-slate-800 p-2 rounded">
                        {tc.output}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-800 rounded-lg p-6 flex flex-col" style={{ height: '70vh' }}>
              <div className="flex-1">
                <Judge0CodeEditor
                  testId={test._id}
                  questionId={question._id}
                  assignmentId={assignmentId}
                  initialLanguage={question.language || "python"}
                  initialCode={answers[question._id] || ""}
                  onRun={(res)=>{/* optional hook */}}
                  onSubmit={(res)=>{/* optional hook */}}
                />
              </div>
              <div className="flex justify-between mt-4 gap-4">
                <button
                  onClick={handlePreviousQuestion}
                  disabled={currentQuestion === 0}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-md cursor-pointer"
                >
                  Previous
                </button>
                <button
                  onClick={handleNextQuestion}
                  disabled={currentQuestion === (test?.questions?.length || 0) - 1}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-md cursor-pointer"
                >
                  Next
                </button>
                <button
                  onClick={handleSubmitClick}
                  disabled={isSubmitting}
                  className={`flex-1 ${isSubmitting ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'} text-white py-2 rounded-md font-semibold ${!isSubmitting ? 'cursor-pointer' : ''}`}
                >
                  {isSubmitting ? 'Submitting Test...' : 'Submit Test'}
                </button>
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg p-6 flex flex-col gap-2 max-h-[calc(100vh-160px)] overflow-y-auto scrollbar-hide order-last" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div className="flex flex-col gap-2 overflow-y-auto scrollbar-hide">
                {test?.questions?.map((q, index) => (
                  <button
                    key={q._id}
                    onClick={() => handleQuestionNavigation(index)}
                    className={`w-8 min-w-[40px] h-12 rounded-md text-sm font-semibold cursor-pointer transition-all duration-200 hover:scale-105 border-2 ${
                      currentQuestion === index
                        ? "bg-blue-600 text-white border-blue-400 shadow-lg"
                        : questionStatuses[q._id] === "answered"
                        ? "bg-green-600 text-white border-green-400 hover:border-green-300"
                        : questionStatuses[q._id] === "mark-for-review"
                        ? "bg-yellow-600 text-black border-yellow-400 hover:border-yellow-300"
                        : "bg-slate-700 hover:bg-slate-600 border-slate-600 hover:border-slate-500"
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="bg-slate-800 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4 justify-between">
                  <span className="text-sm text-slate-400">
                    Question {currentQuestion + 1}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (question.kind === "mcq") {
                          handleAnswerChange(question._id, undefined);
                        } else if (false) { // MSQ removed
                          handleAnswerChange(question._id, []);
                        } else if (question.kind === "theory" || question.kind === "coding") {
                          handleAnswerChange(question._id, "");
                        }
                      }}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-sm font-medium cursor-pointer transition-colors"
                    >
                      Clear Response
                    </button>
                    <button
                      onClick={() => {
                        const currentStatus = questionStatuses[question._id];
                        let newStatus;

                        if (currentStatus === "mark-for-review") {
                          // When unmarking, check if question has an answer
                          const answer = answers[question._id];
                          let hasAnswer = false;
                          if (question.kind === "mcq") {
                            hasAnswer = answer !== undefined && answer !== null && answer !== "";
                          } else if (false) { // MSQ removed
                            hasAnswer = false;
                          } else if (question.kind === "theory" || question.kind === "coding") {
                            hasAnswer = answer && answer.trim() !== "";
                          }

                          newStatus = hasAnswer ? "answered" : "not-answered";
                        } else {
                          // When marking for review, set to mark-for-review
                          newStatus = "mark-for-review";
                        }

                        setQuestionStatuses((prev) => ({
                          ...prev,
                          [question._id]: newStatus,
                        }));
                      }}
                      className={`px-3 py-1 rounded-md text-sm font-medium cursor-pointer transition-colors ${
                        questionStatuses[question._id] === "mark-for-review"
                          ? "bg-orange-600 text-white hover:bg-orange-700"
                          : "bg-slate-700 hover:bg-slate-600"
                      }`}
                    >
                      {questionStatuses[question._id] === "mark-for-review"
                        ? "Unmark Review"
                        : "Mark for Review"}
                    </button>
                    <div className="bg-slate-700 px-3 py-1 rounded-md text-sm">
                      {question.points} point{question.points !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                <h3 className="text-xl font-semibold mb-6">{question.text}</h3>

                {question.kind === "mcq" && (
                  <div className="space-y-3">
                    {question.options?.map((option, index) => (
                      <label
                        key={index}
                        className={`flex items-center p-4 rounded-lg cursor-pointer transition-colors ${
                          answers[question._id] === index
                            ? "bg-blue-600 text-white"
                            : "bg-slate-700 hover:bg-slate-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question-${question._id}`}
                          value={index}
                          checked={answers[question._id] === index}
                          onChange={() => handleAnswerChange(question._id, index)}
                          className="mr-3"
                        />
                        <span>{option.text}</span>
                      </label>
                    ))}
                  </div>
                )}


                {question.kind === "theory" && (
                  <>
                    {question.guidelines && (
                      <div className="bg-slate-700 p-4 rounded-lg mb-4">
                        <h4 className="font-semibold text-slate-300 mb-2">
                          Guidelines:
                        </h4>
                        <p className="text-slate-400">{question.guidelines}</p>
                      </div>
                    )}

                    {question.examples && question.examples.length > 0 && (
                <div className="bg-slate-700 p-4 rounded-lg mb-4 max-h-64 overflow-y-auto scrollbar-hide">
                  {question.examples.map((example, idx) => (
                    <div
                      key={idx}
                      className="mb-3 p-3 bg-slate-600 rounded"
                    >
                      <div className="mb-1 font-semibold text-slate-300">
                        Example {idx + 1}:
                      </div>
                      <div className="mb-1 font-semibold text-slate-300">
                        Input:
                      </div>
                      <pre className="whitespace-pre-wrap text-slate-400 bg-slate-800 p-2 rounded">
                        {example.input}
                      </pre>
                      <div className="mt-2 mb-1 font-semibold text-slate-300">
                        Output:
                      </div>
                      <pre className="whitespace-pre-wrap text-slate-400 bg-slate-800 p-2 rounded">
                        {example.output}
                      </pre>
                    </div>
                  ))}
                </div>
                    )}

                    <textarea
                      className="w-full p-4 bg-slate-800 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none resize-none"
                      style={{ height: "200px" }}
                      value={answers[question._id] || ""}
                      onChange={(e) => handleAnswerChange(question._id, e.target.value)}
                      placeholder="Enter your answer here..."
                    />
                  </>
                )}
              </div>
            </div>

            <div className="lg:col-span-1">
              <div className="bg-slate-800 rounded-lg p-6">
                <h3 className="font-semibold mb-4">Navigation</h3>

                <div
                  className="grid grid-cols-5 gap-2 mb-6 scrollbar-hide"
                  style={{ maxHeight: "21vh", overflowY: "auto" }}
                >
                  {test?.questions?.map((q, index) => (
                    <button
                      key={q._id}
                      onClick={() => handleQuestionNavigation(index)}
                      className={`w-8 h-8 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-200 hover:scale-105 border-2 ${
                        currentQuestion === index
                          ? "bg-blue-600 text-white border-blue-400 shadow-lg"
                          : questionStatuses[q._id] === "answered"
                          ? "bg-green-600 text-white border-green-400 hover:border-green-300"
                          : questionStatuses[q._id] === "mark-for-review"
                          ? "bg-yellow-600 text-black border-yellow-400 hover:border-yellow-300"
                          : "bg-slate-700 hover:bg-slate-600 border-slate-600 hover:border-slate-500"
                      }`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  <button
                    onClick={handlePreviousQuestion}
                    disabled={currentQuestion === 0}
                    className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-md cursor-pointer"
                  >
                    Previous
                  </button>

                  <button
                    onClick={handleNextQuestion}
                    disabled={currentQuestion === (test?.questions?.length || 0) - 1}
                    className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-md cursor-pointer"
                  >
                    Next
                  </button>

                  <button
                    onClick={handleSubmitClick}
                    disabled={isSubmitting}
                    className={`w-full ${isSubmitting ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'} text-white py-2 rounded-md font-semibold ${!isSubmitting ? 'cursor-pointer' : ''}`}
                  >
                    {isSubmitting ? 'Submitting Test...' : 'Submit Test'}
                  </button>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-700">
                  <div className="flex justify-between text-sm text-slate-400 mb-2">
                    <span>Answered</span>
                    <span>
                      {
                        test.questions.filter((q) => {
                          const answer = answers[q._id];
                          if (q.kind === "mcq") {
                            return (
                              answer !== undefined &&
                              answer !== null &&
                              answer !== ""
                            );
                          } else if (false) { // MSQ removed
                            return false;
                          } else if (q.kind === "theory" || q.kind === "coding") {
                            return answer && answer.trim() !== "";
                          }
                          return false;
                        }).length
                      }
                      /{test?.questions?.length || 0}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{
                        width: `${
                          (test.questions.filter((q) => {
                            const answer = answers[q._id];
                            if (q.kind === "mcq") {
                              return (
                                answer !== undefined &&
                                answer !== null &&
                                answer !== ""
                              );
                            } else if (false) { // MSQ removed
                              return false;
                            } else if (q.kind === "theory" || q.kind === "coding") {
                              return answer && answer.trim() !== "";
                            }
                            return false;
                          }).length /
                            (test?.questions?.length || 0)) *
                          100
                        }%`,
                      }}
                    ></div>
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
      />

      {showSubmitConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg p-8 max-w-md w-full text-center">
            <h2 className="text-2xl font-bold mb-6 text-white">
              Confirm Submission
            </h2>
            <p className="mb-8 text-white text-lg">
              Do you want to submit the test?
            </p>
            <div className="flex justify-center gap-6">
              <button
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className={`px-6 py-3 rounded-md font-semibold ${isSubmitting ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'} text-white`}
              >
                {isSubmitting ? 'Submitting...' : 'Confirm'}
              </button>
              <button
                onClick={handleCancelSubmit}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-md font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </>);
};

export default TakeTest;
