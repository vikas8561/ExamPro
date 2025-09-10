import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import apiRequest from "../services/api";

const TakeTest = () => {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [timeSpent, setTimeSpent] = useState(0);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [cameraPermission, setCameraPermission] = useState("prompt");
  const [microphonePermission, setMicrophonePermission] = useState("prompt");
  const [locationPermission, setLocationPermission] = useState("prompt");
  const [showPermissionModal, setShowPermissionModal] = useState(true);
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
  const [violationCount, setViolationCount] = useState(0);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [showSubmitConfirmModal, setShowSubmitConfirmModal] = useState(false);
  const [violations, setViolations] = useState([]);
  const [stream, setStream] = useState(null);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const videoRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const checkExistingTest = async () => {
      if (assignmentId && !testStarted && !startRequestMade.current) {
        try {
          const assignmentData = await apiRequest(
            `/assignments/${assignmentId}`
          );
          if (assignmentData && assignmentData.startedAt) {
            console.log("Existing test found, loading data...");
            await loadExistingTestData();
          } else {
            startRequestMade.current = true;
            startTest();
          }
        } catch (error) {
          console.log(
            "Error checking for existing test, starting new test:",
            error
          );
          startRequestMade.current = true;
          startTest();
        }
      }
    };

    checkExistingTest();
  }, [assignmentId, testStarted]);

  useEffect(() => {
    let timer;
    let backendCheckTimer;

    if (testStarted && timeRemaining > 0) {
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
          if (error.message.includes("Test time has expired")) {
            await submitTest();
          }
        }
      }, 30000);
    }

    return () => {
      clearInterval(timer);
      clearInterval(backendCheckTimer);
    };
  }, [testStarted, timeRemaining]);

  const requestFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        console.log("Fullscreen mode activated");
      } else if (document.documentElement.webkitRequestFullscreen) {
        // Safari
        await document.documentElement.webkitRequestFullscreen();
        console.log("Fullscreen mode activated (Safari)");
      } else if (document.documentElement.msRequestFullscreen) {
        // IE/Edge
        await document.documentElement.msRequestFullscreen();
        console.log("Fullscreen mode activated (IE/Edge)");
      } else {
        console.warn("Fullscreen API not supported in this browser");
      }
    } catch (error) {
      console.error("Failed to enter fullscreen mode:", error);
      // Continue with test even if fullscreen fails
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
        console.log("Fullscreen mode exited");
      } else if (document.webkitExitFullscreen) {
        // Safari
        await document.webkitExitFullscreen();
        console.log("Fullscreen mode exited (Safari)");
      } else if (document.msExitFullscreen) {
        // IE/Edge
        await document.msExitFullscreen();
        console.log("Fullscreen mode exited (IE/Edge)");
      } else {
        console.warn("Fullscreen API not supported in this browser");
      }
    } catch (error) {
      console.error("Failed to exit fullscreen mode:", error);
      // Continue with navigation even if fullscreen exit fails
    }
  };

  const checkCameraPermission = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      setCameraPermission("granted");
      setStream(mediaStream);
      setIsVideoActive(true);
    } catch (error) {
      setCameraPermission("denied");
      setIsVideoActive(false);
    }
  };

  const checkMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicrophonePermission("granted");
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      setMicrophonePermission("denied");
    }
  };

  const checkLocationPermission = async () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => setLocationPermission("granted"),
        () => setLocationPermission("denied")
      );
    } else {
      setLocationPermission("denied");
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        const newViolationCount = violationCount + 1;
        setViolationCount(newViolationCount);

        const violation = {
          timestamp: new Date(),
          violationType: "tab_switch",
          details: `Tab switched - violation ${newViolationCount}`,
          tabCount: newViolationCount,
        };
        setViolations((prev) => [...prev, violation]);

        if (newViolationCount === 1 || newViolationCount === 2) {
          setShowResumeModal(true);
        } else if (newViolationCount >= 3) {
          alert(
            "Test cancelled due to multiple tab violations (3+ violations detected)."
          );
          submitTest(true);
        }
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [violationCount]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );

      if (!isFullscreen && testStarted && !isSubmitting) {
        console.log("Fullscreen mode exited - treating as violation");
        const newViolationCount = violationCount + 1;
        setViolationCount(newViolationCount);

        const violation = {
          timestamp: new Date(),
          violationType: "fullscreen_exit",
          details: `Fullscreen exited - violation ${newViolationCount}`,
          tabCount: newViolationCount,
        };
        setViolations((prev) => [...prev, violation]);

        if (newViolationCount === 1 || newViolationCount === 2) {
          setShowResumeModal(true);
          // Attempt to re-enter fullscreen mode
          setTimeout(() => {
            requestFullscreen();
          }, 1000);
        } else if (newViolationCount >= 3) {
          alert(
            "Test cancelled due to multiple violations (3+ violations detected)."
          );
          submitTest(true);
        }
      }
    };

    // Add event listeners for fullscreen changes
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("msfullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "msfullscreenchange",
        handleFullscreenChange
      );
    };
  }, [testStarted, violationCount, isSubmitting]);

  const requestPermissions = async () => {
    await checkCameraPermission();
    await checkMicrophonePermission();
    await checkLocationPermission();

    if (
      cameraPermission === "granted" &&
      microphonePermission === "granted" &&
      locationPermission === "granted"
    ) {
      setPermissionsGranted(true);
      setShowPermissionModal(false);

      // Request fullscreen mode after permissions are granted
      await requestFullscreen();

      if (!testStarted && !startRequestMade.current) {
        startRequestMade.current = true;
        startTest();
      }
    } else {
      setPermissionsGranted(false);
    }
  };

  useEffect(() => {
    requestPermissions();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    const connectStreamToVideo = () => {
      if (stream && videoRef.current) {
        console.log("Connecting stream to video element");
        videoRef.current.srcObject = stream;

        videoRef.current.onloadedmetadata = () => {
          console.log("Video metadata loaded");
        };

        videoRef.current.onplay = () => {
          console.log("Video started playing");
        };

        videoRef.current.onerror = (e) => {
          console.error("Video error:", e);
        };
        return true;
      } else {
        console.log("Stream or videoRef not available:", {
          streamAvailable: !!stream,
          videoRefAvailable: !!videoRef.current,
        });
        return false;
      }
    };

    const connected = connectStreamToVideo();

    let interval;
    if (!connected) {
      interval = setInterval(() => {
        const connectedNow = connectStreamToVideo();
        if (connectedNow) {
          clearInterval(interval);
        }
      }, 500);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [stream, videoRef]);

  const startTest = async () => {
    try {
      setLoading(true);
      console.log(`Starting test for assignment ID: ${assignmentId}`);

      const response = await apiRequest(`/assignments/${assignmentId}/start`, {
        method: "POST",
      });
      console.log("[startTest] Response:", response);

      if (response.alreadyStarted) {
        console.log("Test already in progress, fetching existing data...");
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

      const timeLimitMinutes = response.test.timeLimit;
      const totalSeconds = timeLimitMinutes * 60;
      const testStartTime = new Date(response.assignment.startTime);
      const currentTime = new Date();
      const elapsedSeconds = Math.floor((currentTime - testStartTime) / 1000);
      const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

      setTimeRemaining(remainingSeconds);
      setTestStarted(true);
      setLoading(false);
    } catch (error) {
      if (error.message === "Test already started") {
        console.log("Test already in progress, fetching existing data...");
        await loadExistingTestData();
      } else if (
        error.message.includes("400") &&
        error.message.includes("Bad Request")
      ) {
        console.log("Test start request failed:", error.message);
        await loadExistingTestData();
      } else {
        setError(error.message || "Failed to start test");
        setLoading(false);
      }
    }
  };

  const loadExistingTestData = async () => {
    console.log("Loading existing test data for assignment ID:", assignmentId);
    try {
      console.log(
        `[TakeTest] Loading existing test data for assignment: ${assignmentId}`
      );

      const assignmentData = await apiRequest(`/assignments/${assignmentId}`);
      console.log(`[TakeTest] Assignment data loaded:`, assignmentData);
      setAssignment(assignmentData);

      const timeLimitMinutes = assignmentData.testId.timeLimit;
      const totalSeconds = timeLimitMinutes * 60;
      const testStartTime = new Date(assignmentData.startTime);
      const currentTime = new Date();
      const elapsedSeconds = Math.floor((currentTime - testStartTime) / 1000);
      const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

      console.log(
        `[TakeTest] Time calculation - Limit: ${timeLimitMinutes}m, Elapsed: ${elapsedSeconds}s, Remaining: ${remainingSeconds}s`
      );

      let answersData = [];
      try {
        console.log(
          `[TakeTest] Fetching existing answers for assignment ID: ${assignmentId}`
        );
        answersData = await apiRequest(`/answers/assignment/${assignmentId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });
        console.log("[TakeTest] Answers API response:", answersData);

        if (answersData && answersData.length > 0) {
          console.log("[TakeTest] Existing answers found, restoring answers");
          const existingAnswers = {};
          answersData.forEach((response) => {
            if (response.selectedOption) {
              existingAnswers[response.questionId] = response.selectedOption;
            } else if (response.textAnswer) {
              existingAnswers[response.questionId] = response.textAnswer;
            }
          });
          setAnswers(existingAnswers);
          console.log(
            `[TakeTest] Restored ${
              Object.keys(existingAnswers).length
            } answers from existing answers`
          );
        } else {
          console.log("[TakeTest] No existing answers found, starting fresh");
        }
      } catch (answersError) {
        if (
          answersError.message.includes("404") ||
          answersError.message.includes("not found") ||
          answersError.message.includes("Resource not found")
        ) {
          console.log(
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
      setTimeRemaining(remainingSeconds);
      setTestStarted(true);
      setLoading(false);
      console.log("[TakeTest] Test data loaded successfully, test started");
    } catch (error) {
      console.error("[TakeTest] Error loading test data:", error);
      setError(error.message || "Failed to load test data");
      setLoading(false);
    }
  };

  const handleAnswerChange = async (questionId, answer) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));

    // Update question status to 'answered' when answer is provided
    setQuestionStatuses((prev) => ({
      ...prev,
      [questionId]: answer ? "answered" : "not-answered",
    }));

    try {
      await apiRequest("/answers", {
        method: "POST",
        body: JSON.stringify({
          assignmentId,
          questionId,
          selectedOption: typeof answer === "string" ? answer : undefined,
          textAnswer: typeof answer === "string" ? undefined : answer,
        }),
      });
      console.log("Answer saved successfully for question:", questionId);
    } catch (error) {
      console.error("Failed to save answer:", error);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestion < test.questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion((prev) => prev - 1);
    }
  };

  const handleTimeUp = async () => {
    await submitTest();
    alert("Time is up! Your test has been submitted automatically.");
  };

  const handleResumeTest = () => {
    setShowResumeModal(false);
    // Immediately return to fullscreen mode when resuming
    setTimeout(() => {
      requestFullscreen();
    }, 100); // Small delay to ensure modal is closed
  };

  const submitTest = async (cancelledDueToViolation = false) => {
    setIsSubmitting(true);
    try {
      const submissionData = {
        assignmentId,
        responses: test.questions.map((question) => ({
          questionId: question._id.toString(),
          selectedOption:
            answers[question._id] && typeof answers[question._id] === "string"
              ? answers[question._id]
              : undefined,
          textAnswer:
            answers[question._id] && typeof answers[question._id] !== "string"
              ? answers[question._id]
              : undefined,
        })),
        timeSpent,
        tabViolationCount: violationCount,
        tabViolations: violations.map((violation) => ({
          timestamp:
            violation.timestamp instanceof Date
              ? violation.timestamp.toISOString()
              : String(violation.timestamp),
          violationType: String(violation.violationType),
          details: String(violation.details),
          tabCount: Number(violation.tabCount),
        })),
        cancelledDueToViolation: cancelledDueToViolation || violationCount >= 3,
        permissions: {
          camera: String(cameraPermission),
          microphone: String(microphonePermission),
          location: String(locationPermission),
        },
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
      await exitFullscreen();

      setIsSubmitting(false);
      navigate(`/student/assignments`);
    } catch (error) {
      console.error("Test submission failed:", error);
      alert(error.message || "Failed to submit test");
      setIsSubmitting(false);
      navigate("/student/assignments");
    }
  };

  const handleSubmitClick = () => {
    const isFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
    );

    if (isFullscreen) {
      setShowSubmitConfirmModal(true);
    } else {
      alert("Please return to fullscreen mode to submit the test.");
    }
  };

  const handleConfirmSubmit = () => {
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

  if (showPermissionModal) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <div className="max-w-2xl bg-slate-800 rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-6 text-center">
            Permission Requirements
          </h2>

          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between p-4 bg-slate-700 rounded-lg">
              <div>
                <h3 className="font-semibold">Camera Access</h3>
                <p className="text-slate-400 text-sm">
                  Required for test monitoring
                </p>
              </div>
              <div
                className={`px-3 py-1 rounded-full text-sm ${
                  cameraPermission === "granted"
                    ? "bg-green-600"
                    : cameraPermission === "denied"
                    ? "bg-red-600"
                    : "bg-yellow-600"
                }`}
              >
                {cameraPermission === "granted"
                  ? "✓ Granted"
                  : cameraPermission === "denied"
                  ? "✗ Denied"
                  : "Pending"}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-700 rounded-lg">
              <div>
                <h3 className="font-semibold">Microphone Access</h3>
                <p className="text-slate-400 text-sm">
                  Required for audio monitoring
                </p>
              </div>
              <div
                className={`px-3 py-1 rounded-full text-sm ${
                  microphonePermission === "granted"
                    ? "bg-green-600"
                    : microphonePermission === "denied"
                    ? "bg-red-600"
                    : "bg-yellow-600"
                }`}
              >
                {microphonePermission === "granted"
                  ? "✓ Granted"
                  : microphonePermission === "denied"
                  ? "✗ Denied"
                  : "Pending"}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-700 rounded-lg">
              <div>
                <h3 className="font-semibold">Location Access</h3>
                <p className="text-slate-400 text-sm">
                  Required for location verification
                </p>
              </div>
              <div
                className={`px-3 py-1 rounded-full text-sm ${
                  locationPermission === "granted"
                    ? "bg-green-600"
                    : locationPermission === "denied"
                    ? "bg-red-600"
                    : "bg-yellow-600"
                }`}
              >
                {locationPermission === "granted"
                  ? "✓ Granted"
                  : locationPermission === "denied"
                  ? "✗ Denied"
                  : "Pending"}
              </div>
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={requestPermissions}
              disabled={permissionsGranted}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-green-600 disabled:cursor-not-allowed text-white px-8 py-3 rounded-md font-semibold cursor-pointer"
            >
              {permissionsGranted
                ? "All Permissions Granted ✓"
                : "Request Permissions"}
            </button>

            {!permissionsGranted && (
              <p className="text-slate-400 mt-4 text-sm">
                All permissions must be granted to start the test
              </p>
            )}
          </div>
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

  const question = test.questions[currentQuestion];

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8 p-4 bg-slate-800 rounded-lg">
          <div>
            <h1 className="text-2xl font-bold">{test.title}</h1>
            <p className="text-slate-400">
              Question {currentQuestion + 1} of {test.questions.length}
            </p>
          </div>

          {isVideoActive && (
            <div className="flex-shrink-0">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-40 h-auto rounded-lg border border-slate-600"
              />
            </div>
          )}

          <div className="text-right">
            <div className="text-2xl font-mono bg-red-600 px-4 py-2 rounded-md">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-slate-800 rounded-lg p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-sm text-slate-400">
                    Question {currentQuestion + 1}
                  </span>
                  <h3 className="text-xl font-semibold mt-1">
                    {question.text}
                  </h3>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const currentStatus = questionStatuses[question._id];
                      const newStatus =
                        currentStatus === "mark-for-review"
                          ? "not-answered"
                          : "mark-for-review";
                      setQuestionStatuses((prev) => ({
                        ...prev,
                        [question._id]: newStatus,
                      }));
                    }}
                    className={`px-3 py-1 rounded-md text-sm font-medium cursor-pointer transition-colors ${
                      questionStatuses[question._id] === "mark-for-review"
                        ? "bg-yellow-600 text-black hover:bg-yellow-700"
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

              {question.kind === "mcq" && (
                <div className="space-y-3">
                  {question.options?.map((option, index) => (
                    <label
                      key={index}
                      className={`flex items-center p-4 rounded-lg cursor-pointer transition-colors ${
                        answers[question._id] === option.text
                          ? "bg-blue-600 text-white"
                          : "bg-slate-700 hover:bg-slate-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question-${question._id}`}
                        value={option.text}
                        checked={answers[question._id] === option.text}
                        onChange={() =>
                          handleAnswerChange(question._id, option.text)
                        }
                        className="mr-3"
                      />
                      <span>{option.text}</span>
                    </label>
                  ))}
                </div>
              )}

              {question.kind === "theoretical" && (
                <div>
                  {question.guidelines && (
                    <div className="bg-slate-700 p-4 rounded-lg mb-4">
                      <h4 className="font-semibold text-slate-300 mb-2">
                        Guidelines:
                      </h4>
                      <p className="text-slate-400">{question.guidelines}</p>
                    </div>
                  )}
                  <textarea
                    value={answers[question._id] || ""}
                    onChange={(e) =>
                      handleAnswerChange(question._id, e.target.value)
                    }
                    placeholder="Write your answer here..."
                    className="w-full h-48 p-4 bg-slate-700 border border-slate-600 rounded-lg text-white resize-none focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="font-semibold mb-4">Navigation</h3>

              <div
                className="grid grid-cols-5 gap-2 mb-6"
                style={{ maxHeight: "21vh", overflowY: "auto" }}
              >
                {test.questions.map((q, index) => (
                  <button
                    key={q._id}
                    onClick={() => setCurrentQuestion(index)}
                    className={`w-8 h-8 rounded-md text-sm font-medium cursor-pointer ${
                      currentQuestion === index
                        ? "bg-blue-600 text-white"
                        : questionStatuses[q._id] === "answered"
                        ? "bg-green-600 text-white"
                        : questionStatuses[q._id] === "mark-for-review"
                        ? "bg-yellow-600 text-black"
                        : "bg-slate-700 hover:bg-slate-600"
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
                  disabled={currentQuestion === test.questions.length - 1}
                  className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-md cursor-pointer"
                >
                  Next
                </button>

                <button
                  onClick={handleSubmitClick}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-md font-semibold cursor-pointer"
                >
                  Submit Test
                </button>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-700">
                <div className="flex justify-between text-sm text-slate-400 mb-2">
                  <span>Answered</span>
                  <span>
                    {
                      Object.values(questionStatuses).filter(
                        (status) => status === "answered"
                      ).length
                    }
                    /{test.questions.length}
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${
                        (Object.values(questionStatuses).filter(
                          (status) => status === "answered"
                        ).length /
                          test.questions.length) *
                        100
                      }%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showResumeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4 text-red-400">
              ⚠️ Tab Switch Detected
            </h2>

            <div className="mb-6">
              <p className="text-slate-300 mb-2">
                You have switched tabs/windows {violationCount} time(s) during
                this test.
              </p>
              <p className="text-slate-400 text-sm">
                {violationCount === 1
                  ? "First warning: Please remain focused on the test."
                  : "Second warning: This is your final warning."}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleResumeTest}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md font-medium"
              >
                Resume Exam
              </button>
            </div>
          </div>
        </div>
      )}

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
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-md font-semibold"
              >
                Confirm
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
  );
};

export default TakeTest;
