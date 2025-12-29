import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import apiRequest from "../services/api";
import Judge0CodeEditor from "../components/Judge0CodeEditor";
import '../styles/TakeTestPermissionModal.mobile.css';

const TakeTest = () => {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [timeSpent, setTimeSpent] = useState(0);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [cameraPermission, setCameraPermission] = useState("prompt");
  const [microphonePermission, setMicrophonePermission] = useState("prompt");
  const [locationPermission, setLocationPermission] = useState("prompt");
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
  const [showPermissionModal, setShowPermissionModal] = useState(true);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState("");
  const [permissionsAttempted, setPermissionsAttempted] = useState(false);
  const fullscreenTimeoutRef = useRef(null);
  const debounceTimers = useRef({});
  const [faceVerificationStatus, setFaceVerificationStatus] = useState(null);
  const [faceVerifying, setFaceVerifying] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showNoProfileImageModal, setShowNoProfileImageModal] = useState(false);
  const cameraVideoRef = useRef(null);
  const cameraCanvasRef = useRef(null);

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
            setShowPermissionModal(true);
            setLoading(false);
          } else {
            setShowPermissionModal(true);
            setLoading(false);
          }
        } catch (error) {
(
            "Error checking for existing test, showing permission modal:",
            error
          );
          setShowPermissionModal(true);
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

  const requestFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        // Safari
        await document.documentElement.webkitRequestFullscreen();
      } else if (document.documentElement.msRequestFullscreen) {
        // IE/Edge
        await document.documentElement.msRequestFullscreen();
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
      } else if (document.webkitExitFullscreen) {
        // Safari
        await document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        // IE/Edge
        await document.msExitFullscreen();
      } else {
        console.warn("Fullscreen API not supported in this browser");
      }
    } catch (error) {
      console.error("Failed to exit fullscreen mode:", error);
      // Continue with navigation even if fullscreen exit fails
    }
  };

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
        cancelledDueToViolation: cancelledDueToViolation || (test?.allowedTabSwitches !== -1 && violationCount > (test?.allowedTabSwitches ?? 2)),
        autoSubmit,
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



  useEffect(() => {
    if (!testStarted) return;

    const handleVisibilityChange = () => {
      console.log('Visibility change detected:', document.visibilityState);
      if (document.visibilityState === "hidden") {
        console.log('Tab switch violation triggered!');
        setViolationCount(prev => {
          const newViolationCount = prev + 1;
          
          const violation = {
            timestamp: new Date(),
            violationType: "tab_switch",
            details: `Tab switched - violation ${newViolationCount}`,
            tabCount: newViolationCount,
          };
          
          setViolations(prevViolations => [...prevViolations, violation]);

          // Get the allowed tab switches from test data, default to 2 if not available
          const allowedSwitches = test?.allowedTabSwitches ?? 2;
          
          // Handle unlimited switches (practice tests with -1 value)
          if (allowedSwitches === -1) {
            // For practice tests, show warning but don't cancel
            if (newViolationCount === 1 || newViolationCount === 2) {
              setShowResumeModal(true);
            }
          } else {
            // For regular tests, enforce the limit
            if (newViolationCount < allowedSwitches) {
              setShowResumeModal(true);
            } else if (newViolationCount >= allowedSwitches) {
              alert(
                `Test cancelled due to tab violations (${newViolationCount} violations detected, limit: ${allowedSwitches}).`
              );
              submitTest(true);
            }
          }
          
          return newViolationCount;
        });
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [testStarted, submitTest]); // ✅ Fixed: Removed violationCount dependency, added submitTest

  useEffect(() => {
    if (!testStarted) return;

    const handleFullscreenChange = () => {
      const isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );
      console.log('Fullscreen change detected:', isFullscreen);

      if (!isFullscreen && testStarted && !isSubmitting) {
        console.log('Fullscreen exit violation triggered!');
        setViolationCount(prev => {
          const newViolationCount = prev + 1;
          
          const violation = {
            timestamp: new Date(),
            violationType: "fullscreen_exit",
            details: `Fullscreen exited - violation ${newViolationCount}`,
            tabCount: newViolationCount,
          };
          setViolations(prevViolations => [...prevViolations, violation]);

          // Get the allowed tab switches from test data, default to 2 if not available
          const allowedSwitches = test?.allowedTabSwitches ?? 2;
          
          // Handle unlimited switches (practice tests with -1 value)
          if (allowedSwitches === -1) {
            // For practice tests, show warning but don't cancel
            if (newViolationCount === 1 || newViolationCount === 2) {
              setShowResumeModal(true);
              // ✅ Fixed: Clear existing timeout and set new one
              if (fullscreenTimeoutRef.current) {
                clearTimeout(fullscreenTimeoutRef.current);
              }
              fullscreenTimeoutRef.current = setTimeout(() => {
                requestFullscreen();
              }, 1000);
            }
          } else {
            // For regular tests, enforce the limit
            if (newViolationCount < allowedSwitches) {
              setShowResumeModal(true);
              // ✅ Fixed: Clear existing timeout and set new one
              if (fullscreenTimeoutRef.current) {
                clearTimeout(fullscreenTimeoutRef.current);
              }
              fullscreenTimeoutRef.current = setTimeout(() => {
                requestFullscreen();
              }, 1000);
            } else if (newViolationCount >= allowedSwitches) {
              alert(
                `Test cancelled due to violations (${newViolationCount} violations detected, limit: ${allowedSwitches}).`
              );
              submitTest(true);
            }
          }
          
          return newViolationCount;
        });
      }
    };

    // Add event listeners for fullscreen changes
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("msfullscreenchange", handleFullscreenChange);

    return () => {
      // ✅ Fixed: Clean up timeout on unmount
      if (fullscreenTimeoutRef.current) {
        clearTimeout(fullscreenTimeoutRef.current);
      }
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
  }, [testStarted, isSubmitting, submitTest, requestFullscreen]); // ✅ Fixed: Removed violationCount dependency

  useEffect(() => {
    if (!testStarted) return;

    const handleKeyDown = (e) => {
      const isInEditor = e.target.closest('.monaco-editor');
      const isInTextarea = e.target.tagName === 'TEXTAREA';
      const isInInput = e.target.tagName === 'INPUT';

      if (isInEditor) {
        // In Monaco editor, block shortcuts
        const isFKey = (e.key && /^F\d+$/i.test(e.key) && parseInt(e.key.slice(1)) >= 1 && parseInt(e.key.slice(1)) <= 12) ||
                         (e.keyCode >= 112 && e.keyCode <= 123);
        if (
          e.ctrlKey ||
          e.altKey ||
          e.key === "Tab" || e.keyCode === 9 ||
          isFKey
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      } else if (!isInTextarea && !isInInput) {
        // Outside editor and not in textarea/input, block all keys except Tab
        if (e.key !== "Tab" && e.keyCode !== 9) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
      // Allow normal typing in textareas and inputs
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [testStarted]); // ✅ Fixed: Only depends on testStarted

  useEffect(() => {
    if (!testStarted) return;

    const handleKeyUp = (e) => {
      const isInEditor = e.target.closest('.monaco-editor');
      const isInTextarea = e.target.tagName === 'TEXTAREA';
      const isInInput = e.target.tagName === 'INPUT';

      // Only block shortcuts in Monaco editor, allow normal typing in textareas and inputs
      if (isInEditor) {
        const isFKey = (e.key && /^F\d+$/i.test(e.key) && parseInt(e.key.slice(1)) >= 1 && parseInt(e.key.slice(1)) <= 12) ||
                       (e.keyCode >= 112 && e.keyCode <= 123);
        if (
          e.ctrlKey ||
          e.altKey ||
          e.key === "Tab" || e.keyCode === 9 ||
          isFKey
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [testStarted]); // ✅ Fixed: Only depends on testStarted

  useEffect(() => {
    if (!testStarted) return;

    const handleContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [testStarted]);



  const verifyOTP = async () => {
    if (!otpInput.trim()) {
      if (!permissionsGranted) {
        setOtpError("Please enter the OTP");
        return;
      }
      // Allow empty OTP if permissions are granted (auto-start)
    } else if (otpInput.length !== 6 || !/^\d{6}$/.test(otpInput)) {
      setOtpError("OTP must be 6 digits");
      return;
    }

    try {
      setOtpError("");
      const response = await apiRequest(`/assignments/${assignmentId}/start`, {
        method: "POST",
        body: JSON.stringify({
          permissions: {
            camera: cameraPermission,
            microphone: microphonePermission,
            location: locationPermission,
          },
          otp: otpInput.trim(),
        }),
      });

      if (response.alreadyStarted) {
        await loadExistingTestData();
        return;
      }

      if (!response.assignment || !response.test) {
        throw new Error("Unexpected response format from backend. Expected assignment and test data.");
      }

      if (!permissionsGranted && !otpInput.trim()) {
        setOtpError("OTP is required when permissions are denied.");
        return;
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
      const testStartTime = new Date(response.assignment.startedAt || response.assignment.startTime);
      const currentTime = new Date(); // Use client time for OTP start
      const elapsedSeconds = Math.floor((currentTime - testStartTime) / 1000);
      const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

      setTimeRemaining(remainingSeconds);
      setTestStarted(true);
      setShowPermissionModal(false);
      setLoading(false);

      // Fullscreen will be requested by the Start Test button click handler
    } catch (error) {
      console.error("OTP verification failed:", error);
      setOtpError(error.message || "Invalid OTP. Please try again.");
    }
  };

  const verifyFaceMatch = async (capturedImage) => {
    try {
      setFaceVerifying(true);
      const response = await apiRequest("/auth/verify-face", {
        method: "POST",
        body: JSON.stringify({ image: capturedImage }),
      });
      
      console.log("Face verification response:", {
        match: response.match,
        confidence: response.confidence,
        threshold: response.threshold,
        message: response.message,
        warning: response.warning
      });
      
      // Check if this is a fallback response (bypassed verification)
      const isFallbackMode = response.warning && response.warning.includes("fallback");
      
      // Strict validation: match must be explicitly true
      // For fallback mode, accept any match regardless of confidence
      // For real verification, confidence must be >= 0.7
      const isValidMatch = response.match === true && (
        isFallbackMode || 
        (typeof response.confidence === 'number' && response.confidence >= 0.7)
      );
      
      if (isValidMatch) {
        if (isFallbackMode) {
          console.log("✅ Face verification bypassed (fallback mode):", response.message);
        } else {
          console.log("✅ Face verification successful:", response.confidence);
        }
        setFaceVerificationStatus("verified");
        return true;
      } else {
        console.log("❌ Face verification failed:", {
          match: response.match,
          confidence: response.confidence,
          reason: response.confidence < 0.7 ? "Confidence too low" : "Match is false"
        });
        setFaceVerificationStatus("failed");
        const errorMsg = response.message || 
                        `Face verification failed. Confidence: ${response.confidence?.toFixed(2) || 'N/A'}, Required: 0.70. The captured face does not match your profile image.`;
        alert(errorMsg);
        return false;
      }
    } catch (error) {
      console.error("Face verification error:", error);
      setFaceVerificationStatus("error");
      // Try to extract user-friendly message from error
      let errorMsg = "Face verification error. Please try again.";
      
      // Check if error has a response with message
      if (error.response && error.response.message) {
        errorMsg = error.response.message;
      } else if (error.message) {
        // If error message contains technical details, provide a generic message
        if (error.message.includes("Exception while processing") || error.message.includes("img2_path")) {
          errorMsg = "No face detected in the captured image. Please ensure your face is clearly visible and try again.";
        } else if (error.message.includes("img1_path")) {
          errorMsg = "No face detected in your profile image. Please ensure your face is clearly visible.";
        } else {
          // Use the error message if it's user-friendly, otherwise use generic
          errorMsg = error.message;
        }
      }
      
      alert(errorMsg);
      return false;
    } finally {
      setFaceVerifying(false);
    }
  };

  const captureImageForVerification = async () => {
    if (!cameraVideoRef.current || !cameraCanvasRef.current) return null;
    
    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;
    const ctx = canvas.getContext("2d");
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    return canvas.toDataURL("image/png");
  };

  const requestCameraPermission = async () => {
    // Check if user has a profile image in database
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      
      // Check if profileImage exists and is not empty
      if (!userData.profileImage || userData.profileImage.trim() === '') {
        setShowNoProfileImageModal(true);
        return;
      }
    } catch (error) {
      console.error("Error checking user profile:", error);
      // If we can't check, still try to proceed (fallback)
    }

    // Check if getUserMedia is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Camera access is not supported in your browser. Please use a modern browser with camera support.");
      setCameraPermission("denied");
      return;
    }

    try {
      // Request camera permission - this will show the browser's permission prompt
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraStream(stream);
      setShowCameraModal(true);
      // Wait for video to load
      setTimeout(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (error) {
      console.error("Camera permission error:", error);
      
      // Handle different error types
      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        // Camera not found - allow test to proceed without camera
        setCameraPermission("unavailable");
        setPermissionsAttempted(true);
        setTimeout(() => {
          checkAllPermissionsGranted();
        }, 100);
        // Don't show alert for missing camera - allow test to proceed
        return;
      } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setCameraPermission("denied");
        setPermissionsAttempted(true);
        alert("Camera permission was denied. Please allow camera access in your browser settings and try again.");
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setCameraPermission("denied");
        setPermissionsAttempted(true);
        alert("Camera is already in use by another application. Please close other apps using the camera and try again.");
      } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
        setCameraPermission("denied");
        setPermissionsAttempted(true);
        alert("Camera settings are not supported. Please try again.");
      } else if (error.name === 'SecurityError') {
        setCameraPermission("denied");
        setPermissionsAttempted(true);
        alert("Camera access is blocked for security reasons. Please ensure you're using HTTPS and try again.");
      } else {
        setCameraPermission("denied");
        setPermissionsAttempted(true);
        alert("Camera permission is required to start the test.");
      }
    }
  };

  const handleCaptureImage = async () => {
    const capturedImage = await captureImageForVerification();
    if (!capturedImage) {
      alert("Failed to capture image. Please try again.");
      return;
    }

    const verified = await verifyFaceMatch(capturedImage);
    if (verified) {
      // Create a new stream for the test (keep camera active)
      const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
      
      // Stop the modal camera stream
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        setCameraStream(null);
      }
      
      setShowCameraModal(false);
      setCameraPermission("granted");
      setStream(newStream);
      setIsVideoActive(true);
      setFaceVerificationStatus(null);
      
      // Check if all permissions are granted after state update
      setTimeout(() => {
        checkAllPermissionsGranted();
      }, 100);
    }
  };

  const checkAllPermissionsGranted = () => {
    setPermissionsAttempted(true);
  };

  // useEffect to watch permission changes and update permissionsGranted
  useEffect(() => {
    if (!permissionsAttempted) return;
    
    // Allow test to proceed if:
    // - Camera is granted OR unavailable (not found)
    // - Microphone is granted
    // - Location is granted
    const allGranted = 
      (cameraPermission === "granted" || cameraPermission === "unavailable") &&
      microphonePermission === "granted" &&
      locationPermission === "granted";
    
    setPermissionsGranted(allGranted);
  }, [cameraPermission, microphonePermission, locationPermission, permissionsAttempted]);

  const requestMicrophonePermission = async () => {
    // Check if getUserMedia is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Microphone access is not supported in your browser. Please use a modern browser with microphone support.");
      setMicrophonePermission("denied");
      setPermissionsAttempted(true);
      return;
    }

    try {
      // Request microphone permission - this will show the browser's permission prompt
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately as we only needed permission
      stream.getTracks().forEach(track => track.stop());
      setMicrophonePermission("granted");
      setPermissionsAttempted(true);
      setTimeout(() => {
        checkAllPermissionsGranted();
      }, 100);
    } catch (error) {
      console.error("Microphone permission error:", error);
      setMicrophonePermission("denied");
      setPermissionsAttempted(true);
      
      // Provide specific error messages based on error type
      let errorMessage = "Microphone permission is required to start the test.";
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = "Microphone permission was denied. Please allow microphone access in your browser settings and try again.";
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = "No microphone found. Please connect a microphone and try again.";
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage = "Microphone is already in use by another application. Please close other apps using the microphone and try again.";
      } else if (error.name === 'SecurityError') {
        errorMessage = "Microphone access is blocked for security reasons. Please ensure you're using HTTPS and try again.";
      }
      
      alert(errorMessage);
    }
  };

  const requestLocationPermission = async () => {
    try {
      if ("geolocation" in navigator) {
        await new Promise((resolve, reject) => {
          // Request location permission - this will show the browser's permission prompt
          navigator.geolocation.getCurrentPosition(
            (position) => {
              setLocationPermission("granted");
              setPermissionsAttempted(true);
              setTimeout(() => {
                checkAllPermissionsGranted();
                resolve();
              }, 100);
            },
            (error) => {
              console.error("Location permission error:", error);
              setLocationPermission("denied");
              setPermissionsAttempted(true);
              
              // Provide specific error messages based on error type
              let errorMessage = "Location permission is required to start the test.";
              
              if (error.code === error.PERMISSION_DENIED) {
                errorMessage = "Location permission was denied. Please allow location access in your browser settings and try again.";
              } else if (error.code === error.POSITION_UNAVAILABLE) {
                errorMessage = "Location information is unavailable. Please ensure location services are enabled on your device.";
              } else if (error.code === error.TIMEOUT) {
                errorMessage = "Location request timed out. Please try again.";
              }
              
              alert(errorMessage);
              reject(error);
            },
            {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 0
            }
          );
        });
      } else {
        setLocationPermission("denied");
        setPermissionsAttempted(true);
        alert("Geolocation is not supported in your browser.");
      }
    } catch (error) {
      setLocationPermission("denied");
      setPermissionsAttempted(true);
      console.error("Location permission error:", error);
      alert("An error occurred while requesting location permission. Please try again.");
    }
  };

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (showCameraModal && cameraStream && cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = cameraStream;
    }
  }, [showCameraModal, cameraStream]);

  useEffect(() => {
    const connectStreamToVideo = () => {
      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream;

        videoRef.current.onloadedmetadata = () => {
        };

        videoRef.current.onplay = () => {
        };

        videoRef.current.onerror = (e) => {
          console.error("Video error:", e);
        };
        return true;
      } else {
("Stream or videoRef not available:", {
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
      // Check if all permissions are granted before starting
      if (!permissionsGranted) {
        alert("Please enable all permissions before starting the test.");
        return;
      }

      setLoading(true);

      // Fetch current server time and browser timezone
      const timeResponse = await apiRequest("/time");
      const serverTime = new Date(timeResponse.serverTime);
      const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const response = await apiRequest(`/assignments/${assignmentId}/start`, {
      method: "POST",
      body: JSON.stringify({
        permissions: {
          camera: cameraPermission,
          microphone: microphonePermission,
          location: locationPermission,
        },
        otp: otpInput.trim()
      }),
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
      setShowPermissionModal(false);
      setLoading(false);

      // Request fullscreen mode after test starts
      setTimeout(async () => {
        try {
          await requestFullscreen();
        } catch (error) {
          console.error("Fullscreen failed, but continuing with test:", error);
          // Try again after a brief moment
          setTimeout(async () => {
            try {
              await requestFullscreen();
            } catch (retryError) {
              console.error("Fullscreen retry failed:", retryError);
            }
          }, 500);
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
      setShowPermissionModal(false);
      setLoading(false);

      // Request fullscreen mode when resuming existing test - after all state updates with small delay
      setTimeout(async () => {
        await requestFullscreen();
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

  const handleResumeTest = () => {
    setShowResumeModal(false);
    // Immediately return to fullscreen mode when resuming
    setTimeout(() => {
      requestFullscreen();
    }, 100); // Small delay to ensure modal is closed
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

  if (showPermissionModal) {
    return (
      <>
        <div className="permission-modal-mobile min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <div className="permission-modal-content bg-slate-800 rounded-lg p-8 max-w-md w-full">
            <h2 className="permission-modal-title text-2xl font-bold mb-6 text-center">Test Permissions</h2>

            <div className="permissions-list space-y-4 mb-6">
              <div className="permission-item flex items-center justify-between">
                <span className="permission-label">Camera Access</span>
                {cameraPermission === "granted" ? (
                  <button
                    disabled
                    className="permission-button permission-button-granted w-40 px-4 py-2 bg-white text-green-600 rounded-md font-semibold flex items-center justify-center gap-2 cursor-default whitespace-nowrap border-2 border-green-600"
                  >
                    <span className="text-xl">✓</span>
                  </button>
                ) : cameraPermission === "unavailable" ? (
                  <button
                    disabled
                    className="permission-button permission-button-granted w-40 px-4 py-2 bg-white text-blue-600 rounded-md font-semibold flex items-center justify-center gap-2 cursor-default whitespace-nowrap border-2 border-blue-600"
                  >
                    <span className="text-xl">N/A</span>
                  </button>
                ) : (
                  <button
                    onClick={requestCameraPermission}
                    disabled={faceVerifying}
                    className="permission-button permission-button-action w-40 px-4 py-2 bg-white hover:bg-gray-100 disabled:bg-gray-200 disabled:cursor-not-allowed text-slate-900 rounded-md font-semibold flex items-center justify-center gap-2 whitespace-nowrap border-2 border-slate-300"
                  >
                    {faceVerifying ? (
                      <>
                        <span className="animate-spin">⟳</span> Verifying...
                      </>
                    ) : (
                      "Capture Image"
                    )}
                  </button>
                )}
              </div>

              <div className="permission-item flex items-center justify-between">
                <span className="permission-label">Microphone Access</span>
                {microphonePermission === "granted" ? (
                  <button
                    disabled
                    className="permission-button permission-button-granted w-40 px-4 py-2 bg-white text-green-600 rounded-md font-semibold flex items-center justify-center gap-2 cursor-default whitespace-nowrap border-2 border-green-600"
                  >
                    <span className="text-xl">✓</span>
                  </button>
                ) : (
                  <button
                    onClick={requestMicrophonePermission}
                    className="permission-button permission-button-action w-40 px-4 py-2 bg-white hover:bg-gray-100 text-slate-900 rounded-md font-semibold whitespace-nowrap border-2 border-slate-300"
                  >
                    Enable Microphone
                  </button>
                )}
              </div>

              <div className="permission-item flex items-center justify-between">
                <span className="permission-label">Location Access</span>
                {locationPermission === "granted" ? (
                  <button
                    disabled
                    className="permission-button permission-button-granted w-40 px-4 py-2 bg-white text-green-600 rounded-md font-semibold flex items-center justify-center gap-2 cursor-default whitespace-nowrap border-2 border-green-600"
                  >
                    <span className="text-xl">✓</span>
                  </button>
                ) : (
                  <button
                    onClick={requestLocationPermission}
                    className="permission-button permission-button-action w-40 px-4 py-2 bg-white hover:bg-gray-100 text-slate-900 rounded-md font-semibold whitespace-nowrap border-2 border-slate-300"
                  >
                    Enable Location
                  </button>
                )}
              </div>
            </div>

            <div className="mb-4">
              {permissionsGranted ? (
                <>
                  <div className="permission-status-message permission-status-success text-green-400 text-center mb-4">
                    All permissions granted! Click the button below to start the test.
                  </div>
                  <button
                    onClick={startTest}
                    className="start-test-button w-full bg-white hover:bg-gray-100 text-slate-900 py-3 rounded-md font-semibold border-2 border-slate-300"
                  >
                    Start Test
                  </button>
                </>
              ) : (
                <div className="permission-status-message permission-status-warning text-yellow-400 text-center mb-4">
                  Please enable all permissions to start the test.
                </div>
              )}

              {!permissionsGranted && (
                <div className="permission-status-message permission-status-info text-slate-400 text-sm text-center">
                  All permissions must be enabled before starting the test.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Camera Modal for Face Verification */}
        {showCameraModal && (
          <div className="face-verification-modal fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className="face-verification-content bg-slate-800 rounded-lg p-6 max-w-md w-full">
              <h3 className="face-verification-title text-xl font-bold mb-4 text-center">Face Verification</h3>
              <p className="face-verification-text text-slate-300 text-sm mb-4 text-center">
                Please position your face in the camera frame. We need to verify your identity before starting the test.
              </p>
              
              <div className="relative mb-4">
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  playsInline
                  className="face-verification-video w-full rounded-lg"
                  style={{ maxHeight: "400px" }}
                />
                <canvas ref={cameraCanvasRef} className="hidden" />
              </div>

              <div className="face-verification-buttons flex gap-3">
                <button
                  onClick={handleCaptureImage}
                  disabled={faceVerifying}
                  className="face-verification-button flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 rounded-md font-semibold"
                >
                  {faceVerifying ? "Verifying..." : "Capture & Verify"}
                </button>
                <button
                  onClick={() => {
                    if (cameraStream) {
                      cameraStream.getTracks().forEach(track => track.stop());
                      setCameraStream(null);
                    }
                    setShowCameraModal(false);
                    setFaceVerificationStatus(null);
                  }}
                  className="face-verification-button flex-1 bg-slate-600 hover:bg-slate-700 text-white py-2 rounded-md font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* No Profile Image Modal */}
        {showNoProfileImageModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full">
              <div className="text-center mb-6">
                <div className="mx-auto w-16 h-16 bg-yellow-500 rounded-full flex items-center justify-center mb-4">
                  <span className="text-3xl">⚠️</span>
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">Profile Image Required</h3>
                <p className="text-slate-300 text-sm mb-2">
                  To ensure test security and identity verification, you need to upload your profile image first.
                </p>
                <p className="text-slate-400 text-sm mb-4">
                  Your profile image will be used to verify your identity before starting the test. Please upload your photo in the profile section to continue.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowNoProfileImageModal(false);
                    navigate("/student/profile");
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-md font-semibold"
                >
                  Go to Profile Section
                </button>
                <button
                  onClick={() => {
                    setShowNoProfileImageModal(false);
                  }}
                  className="flex-1 bg-slate-600 hover:bg-slate-700 text-white py-3 rounded-md font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </>
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
                {test?.allowedTabSwitches !== undefined && test.allowedTabSwitches !== -1 && (
                  <span className="block text-slate-400 text-sm mt-1">
                    (Limit: {test.allowedTabSwitches} switches)
                  </span>
                )}
              </p>
              <p className="text-slate-400 text-sm">
                {test?.allowedTabSwitches === -1 
                  ? "This is a practice test - tab switching is allowed but monitored."
                  : violationCount === 1
                  ? "First warning: Please remain focused on the test."
                  : violationCount < (test?.allowedTabSwitches ?? 2)
                  ? `Warning: ${violationCount} of ${test?.allowedTabSwitches ?? 2} allowed switches used.`
                  : "Final warning: This is your last allowed switch."}
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
