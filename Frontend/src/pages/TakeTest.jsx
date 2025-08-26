import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import apiRequest from "../services/api";

const TakeTest = () => {
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
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [timeSpent, setTimeSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testStarted, setTestStarted] = useState(false);
  const startRequestMade = useRef(false);
  const [tabCount, setTabCount] = useState(1); // State to track the number of tabs
  const [stream, setStream] = useState(null); // State to manage the video stream
  const [isVideoActive, setIsVideoActive] = useState(false); // State to track video status
  const videoRef = useRef(null); // Ref for the video element

  useEffect(() => {
    // Only start the test if we haven't already made the request
    if (assignmentId && !testStarted && !startRequestMade.current) {
      startRequestMade.current = true;
      startTest();
    }
  }, [assignmentId, testStarted]);

  useEffect(() => {
    let timer;
    if (testStarted && timeRemaining > 0) {
      timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            handleTimeUp();
            return 0;
          }
          return prev - 1;
        });
        setTimeSpent(prev => prev + 1);
      }, 1000);
    }

    return () => clearInterval(timer);
  }, [testStarted, timeRemaining]);

  // Tab monitoring effect
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setTabCount(prev => prev + 1);
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (tabCount >= 2) {
      alert("Test cancelled due to multiple tabs opened.");
      submitTest(); // Submit the test or handle cancellation
    }
  }, [tabCount]);

  const checkCameraPermission = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
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
      stream.getTracks().forEach(track => track.stop());
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
      startTest();
    } else {
      setPermissionsGranted(false);
    }
  };

  useEffect(() => {
    requestPermissions();
    
    // Cleanup function to stop video stream when component unmounts
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

    // Effect to connect stream to video element when both are available
    useEffect(() => {
        const connectStreamToVideo = () => {
            if (stream && videoRef.current) {
                console.log("Connecting stream to video element");
                videoRef.current.srcObject = stream;

                // Add event listeners to debug video element
                videoRef.current.onloadedmetadata = () => {
                    console.log("Video metadata loaded");
                };

                videoRef.current.onplay = () => {
                    console.log("Video started playing");
                };

                videoRef.current.onerror = (e) => {
                    console.error("Video error:", e);
                };
                return true; // Connection successful
            } else {
                console.log("Stream or videoRef not available:", {
                    streamAvailable: !!stream,
                    videoRefAvailable: !!videoRef.current
                });
                return false; // Connection not successful
            }
        };

        // Try to connect immediately
        const connected = connectStreamToVideo();
        
        // If not connected, set up a more controlled interval (every 500ms instead of 100ms)
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
      console.log(`Current user ID from localStorage: ${localStorage.getItem('userId')}`);
      console.log(`Current user token: ${localStorage.getItem('token')}`);
      
      const response = await apiRequest(`/assignments/${assignmentId}/start`, {
        method: "POST"
      });

      // Check if test was already started (new backend response format)
      if (response.alreadyStarted) {
        console.log("Test already in progress, fetching existing data...");
        await loadExistingTestData();
        return;
      }

      setAssignment(response.assignment);
      setTest(response.test);
      setTimeRemaining(response.test.timeLimit * 60);
      setTestStarted(true);
      setLoading(false);
    } catch (error) {
      // Handle other errors (fallback for old backend version)
      if (error.message === "Test already started") {
        console.log("Test already in progress, fetching existing data...");
        await loadExistingTestData();
      } else if (error.message.includes("400") && error.message.includes("Bad Request")) {
        // Handle other 400 errors without showing them as console errors
        console.log("Test start request failed:", error.message);
        await loadExistingTestData();
      } else {
        // Only show actual errors to the user
        setError(error.message || "Failed to start test");
        setLoading(false);
      }
    }
  };

  const loadExistingTestData = async () => {
    try {
      // Fetch the existing assignment data
      const assignmentData = await apiRequest(`/assignments/${assignmentId}`);
      setAssignment(assignmentData);
      
      // Calculate remaining time based on when the test was started
      const timeLimitMinutes = assignmentData.testId.timeLimit;
      const totalSeconds = timeLimitMinutes * 60;
      const startedAt = new Date(assignmentData.startedAt);
      const elapsedSeconds = Math.floor((new Date() - startedAt) / 1000);
      const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
      
      // Try to fetch any existing submission to restore answers
      try {
        console.log(`Fetching existing submission for assignment ID: ${assignmentId}`);
        const submissionData = await apiRequest(`/test-submissions/assignment/${assignmentId}`);
        console.log("Submission API response:", submissionData);
        
        if (submissionData && submissionData.submission) {
          console.log("Existing submission found, restoring answers");
          // Restore answers from existing submission
          const existingAnswers = {};
          submissionData.test.questions.forEach(question => {
            if (question.selectedOption) {
              existingAnswers[question._id] = question.selectedOption;
            } else if (question.textAnswer) {
              existingAnswers[question._id] = question.textAnswer;
            }
          });
          setAnswers(existingAnswers);
          console.log(`Restored ${Object.keys(existingAnswers).length} answers from existing submission`);
        } else {
          console.log("No existing submission found (API returned null), starting fresh");
        }
      } catch (submissionError) {
        // Handle different types of errors
        if (submissionError.message.includes("404") || 
            submissionError.message.includes("not found") ||
            submissionError.message.includes("Resource not found")) {
          // Expected 404 - no submission exists yet
          console.log("No existing submission found (404 error), starting fresh");
        } else {
          // Unexpected error
          console.error("Error loading submission:", submissionError);
        }
      }
      
      setTest(assignmentData.testId);
      setTimeRemaining(remainingSeconds);
      setTestStarted(true);
      setLoading(false);
    } catch (error) {
      setError(error.message || "Failed to load test data");
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId, answer) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const handleNextQuestion = () => {
    if (currentQuestion < test.questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  const handleTimeUp = async () => {
    await submitTest();
  };

  const submitTest = async () => {
    try {
      const responses = Object.entries(answers).map(([questionId, answer]) => ({
        questionId,
        selectedOption: typeof answer === 'string' ? answer : undefined,
        textAnswer: typeof answer === 'string' ? undefined : answer
      }));

      const response = await apiRequest("/test-submissions", {
        method: "POST",
        body: JSON.stringify({
          assignmentId,
          responses,
          timeSpent,
          tabCount, // Include tab count in submission
          permissions: {
            camera: cameraPermission,
            microphone: microphonePermission,
            location: locationPermission
          }
        })
      });

      // Navigate to results page or assignments after submission
      navigate(`/view-completed-test/${assignmentId}`);
    } catch (error) {
      alert(error.message || "Failed to submit test");
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
          <h2 className="text-2xl font-bold mb-6 text-center">Permission Requirements</h2>
          
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between p-4 bg-slate-700 rounded-lg">
              <div>
                <h3 className="font-semibold">Camera Access</h3>
                <p className="text-slate-400 text-sm">Required for test monitoring</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm ${
                cameraPermission === "granted" ? "bg-green-600" : 
                cameraPermission === "denied" ? "bg-red-600" : "bg-yellow-600"
              }`}>
                {cameraPermission === "granted" ? "✓ Granted" : 
                 cameraPermission === "denied" ? "✗ Denied" : "Pending"}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-700 rounded-lg">
              <div>
                <h3 className="font-semibold">Microphone Access</h3>
                <p className="text-slate-400 text-sm">Required for audio monitoring</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm ${
                microphonePermission === "granted" ? "bg-green-600" : 
                microphonePermission === "denied" ? "bg-red-600" : "bg-yellow-600"
              }`}>
                {microphonePermission === "granted" ? "✓ Granted" : 
                 microphonePermission === "denied" ? "✗ Denied" : "Pending"}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-700 rounded-lg">
              <div>
                <h3 className="font-semibold">Location Access</h3>
                <p className="text-slate-400 text-sm">Required for location verification</p>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm ${
                locationPermission === "granted" ? "bg-green-600" : 
                locationPermission === "denied" ? "bg-red-600" : "bg-yellow-600"
              }`}>
                {locationPermission === "granted" ? "✓ Granted" : 
                 locationPermission === "denied" ? "✗ Denied" : "Pending"}
              </div>
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={requestPermissions}
              disabled={permissionsGranted}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-green-600 disabled:cursor-not-allowed text-white px-8 py-3 rounded-md font-semibold"
            >
              {permissionsGranted ? "All Permissions Granted ✓" : "Request Permissions"}
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
        {/* Header */}
        <div className="flex justify-between items-center mb-8 p-4 bg-slate-800 rounded-lg">
          <div>
            <h1 className="text-2xl font-bold">{test.title}</h1>
            <p className="text-slate-400">Question {currentQuestion + 1} of {test.questions.length}</p>
          </div>
          
          <div className="text-right">
            <div className="text-2xl font-mono bg-red-600 px-4 py-2 rounded-md">
              {formatTime(timeRemaining)}
            </div>
            <div className="text-sm text-slate-400 mt-1">Time Remaining</div>
          </div>
        </div>

        {/* Test Instructions */}
        {test.instructions && (
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-300 mb-2">Instructions:</h3>
            <p className="text-blue-200">{test.instructions}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Question Area */}
          <div className="lg:col-span-2">
            <div className="bg-slate-800 rounded-lg p-6">
              {/* Question Header */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-sm text-slate-400">Question {currentQuestion + 1}</span>
                  <h3 className="text-xl font-semibold mt-1">{question.text}</h3>
                </div>
                <div className="bg-slate-700 px-3 py-1 rounded-md text-sm">
                  {question.points} point{question.points !== 1 ? 's' : ''}
                </div>
              </div>

              {/* MCQ Options */}
              {question.kind === "mcq" && (
                <div className="space-y-3">
                  {question.options?.map((option, index) => (
                    <label
                      key={index}
                      className={`flex items-center p-4 rounded-lg cursor-pointer transition-colors ${
                        answers[question._id] === option.text
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 hover:bg-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question-${question._id}`}
                        value={option.text}
                        checked={answers[question._id] === option.text}
                        onChange={() => handleAnswerChange(question._id, option.text)}
                        className="mr-3"
                      />
                      <span>{option.text}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Theoretical Answer */}
              {question.kind === "theoretical" && (
                <div>
                  {question.guidelines && (
                    <div className="bg-slate-700 p-4 rounded-lg mb-4">
                      <h4 className="font-semibold text-slate-300 mb-2">Guidelines:</h4>
                      <p className="text-slate-400">{question.guidelines}</p>
                    </div>
                  )}
                  <textarea
                    value={answers[question._id] || ''}
                    onChange={(e) => handleAnswerChange(question._id, e.target.value)}
                    placeholder="Write your answer here..."
                    className="w-full h-48 p-4 bg-slate-700 border border-slate-600 rounded-lg text-white resize-none focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Navigation Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="font-semibold mb-4">Navigation</h3>
              
              {/* Question Grid */}
              <div className="grid grid-cols-5 gap-2 mb-6">
                {test.questions.map((q, index) => (
                  <button
                    key={q._id}
                    onClick={() => setCurrentQuestion(index)}
                    className={`w-8 h-8 rounded-md text-sm font-medium ${
                      currentQuestion === index
                        ? 'bg-blue-600 text-white'
                        : answers[q._id]
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-700 hover:bg-slate-600'
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>

              {/* Video Element */}
              {isVideoActive && (
                <div className="mb-4">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-auto rounded-lg border border-slate-600"
                  />
                </div>
              )}
              
              {/* Navigation Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handlePreviousQuestion}
                  disabled={currentQuestion === 0}
                  className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-md"
                >
                  Previous
                </button>

                <button
                  onClick={handleNextQuestion}
                  disabled={currentQuestion === test.questions.length - 1}
                  className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-md"
                >
                  Next
                </button>

                <button
                  onClick={submitTest}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-md font-semibold"
                >
                  Submit Test
                </button>
              </div>

              {/* Progress */}
              <div className="mt-6 pt-4 border-t border-slate-700">
                <div className="flex justify-between text-sm text-slate-400 mb-2">
                  <span>Answered</span>
                  <span>{Object.keys(answers).length}/{test.questions.length}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(Object.keys(answers).length / test.questions.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TakeTest;
