import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import * as faceapi from "face-api.js";
import apiRequest from "../services/api";

// Helper component for warning modal with dev tools and fullscreen check
const WarningModalWithDevToolsCheck = ({ currentWarning, devToolsOpen, setDevToolsOpen, onClose, requestFullscreen }) => {
  // Continuously check if dev tools are open or fullscreen is exited while modal is showing
  useEffect(() => {
    if (!currentWarning) return;

    const checkConditions = () => {
      // Check dev tools
      if (currentWarning.violationType === 'devtools_opened') {
        const widthThreshold = 160;
        const isDevToolsOpen = window.outerWidth - window.innerWidth > widthThreshold ||
          window.outerHeight - window.innerHeight > widthThreshold;
        setDevToolsOpen(isDevToolsOpen);
      }

      // Check fullscreen
      if (currentWarning.violationType === 'fullscreen_exit') {
        const isFullscreen = !!(
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.msFullscreenElement
        );
        setDevToolsOpen(!isFullscreen); // Use same state for fullscreen check
      }
    };

    // Check immediately
    checkConditions();

    // Check every 500ms while modal is open
    const interval = setInterval(checkConditions, 500);

    return () => clearInterval(interval);
  }, [currentWarning?.violationType, setDevToolsOpen]);

  const handleContinue = async () => {
    // Check if dev tools are still open for devtools violations
    if (currentWarning.violationType === 'devtools_opened') {
      const widthThreshold = 160;
      const isDevToolsOpen = window.outerWidth - window.innerWidth > widthThreshold ||
        window.outerHeight - window.innerHeight > widthThreshold;

      if (isDevToolsOpen) {
        setDevToolsOpen(true);
        return; // Don't close modal if dev tools are still open
      }
    }

    // Check if fullscreen is still exited for fullscreen violations
    if (currentWarning.violationType === 'fullscreen_exit') {
      const isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );

      if (!isFullscreen) {
        // Try to re-enter fullscreen
        try {
          await requestFullscreen();
          // Wait a bit and check again
          setTimeout(() => {
            const stillFullscreen = !!(
              document.fullscreenElement ||
              document.webkitFullscreenElement ||
              document.msFullscreenElement
            );
            if (!stillFullscreen) {
              setDevToolsOpen(true);
              return; // Don't close if still not fullscreen
            }
            setDevToolsOpen(false);
            onClose();
          }, 500);
          return;
        } catch (error) {
          setDevToolsOpen(true);
          return; // Don't close if fullscreen request failed
        }
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] p-4">
      <div className="bg-slate-800 rounded-lg p-8 max-w-md w-full">
        <h2 className={`text-2xl font-bold mb-4 text-center ${currentWarning.type === 'auto_submit' ? 'text-red-400' :
          currentWarning.type === 'final_warning' ? 'text-orange-400' :
            'text-yellow-400'
          }`}>
          {currentWarning.type === 'auto_submit' ? '⚠️ Test Will Be Submitted' :
            currentWarning.type === 'final_warning' ? '⚠️ Final Warning' :
              '⚠️ Warning'}
        </h2>
        <p className="text-slate-300 mb-6 text-center">
          {currentWarning.message}
        </p>
        <p className="text-slate-400 text-sm mb-6 text-center">
          {currentWarning.limit === 'unlimited'
            ? `Violation count: ${currentWarning.count} (Practice test - unlimited allowed)`
            : `Violation count: ${currentWarning.count} of ${currentWarning.limit}`
          }
        </p>
        {/* Show error if dev tools are still open or fullscreen is exited */}
        {currentWarning.violationType === 'devtools_opened' && devToolsOpen && (
          <p className="text-red-400 text-sm mb-4 text-center font-semibold">
            ⚠️ Developer tools are still open. Please close them before continuing.
          </p>
        )}
        {currentWarning.violationType === 'fullscreen_exit' && devToolsOpen && (
          <p className="text-red-400 text-sm mb-4 text-center font-semibold">
            ⚠️ Fullscreen mode is not active. Please ensure fullscreen mode is enabled before continuing.
          </p>
        )}
        <div className="flex gap-4">
          <button
            onClick={handleContinue}
            disabled={(currentWarning.violationType === 'devtools_opened' || currentWarning.violationType === 'fullscreen_exit') && devToolsOpen}
            className={`flex-1 py-3 rounded-md font-semibold ${((currentWarning.violationType === 'devtools_opened' || currentWarning.violationType === 'fullscreen_exit') && devToolsOpen)
              ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
              : 'bg-white/90 hover:bg-white text-black'
              }`}
          >
            {currentWarning.type === 'auto_submit' ? 'Understood' : 'Continue Exam'}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Proctoring Component - Complete Proctoring System
 * 
 * Features:
 * - Screen sharing monitoring
 * - Face matching using face-api.js
 * - Microphone permission
 * - Location permission
 * - Tab switch detection
 * - Fullscreen enforcement
 * - Copy/paste blocking
 * - DevTools detection
 * - Warning system (1st warning, 2nd final warning, 3rd auto submit)
 * 
 * IMPORTANT: All detection mechanisms work INDEPENDENTLY of fullscreen state.
 * - Tab/window switch detection uses visibilitychange and focus events (works without fullscreen)
 * - DevTools detection uses window dimension checks (works without fullscreen)
 * - Copy/paste blocking uses event listeners (works without fullscreen)
 * - Keyboard blocking uses keydown events (works without fullscreen)
 * Fullscreen is only for UI enforcement, NOT for detection. Detection continues even if fullscreen fails.
 * 
 * @param {Object} props
 * @param {boolean} props.enabled - Whether proctoring is enabled
 * @param {Object} props.test - Test object
 * @param {Function} props.onViolation - Callback when violation occurs
 * @param {Function} props.onSubmit - Callback to submit test
 * @param {Function} props.onExitFullscreen - Callback when exiting fullscreen
 * @param {boolean} props.isSubmitting - Whether test is currently being submitted
 */
const Proctoring = forwardRef(({
  enabled = true,
  test = {},
  onViolation = () => { },
  onSubmit = () => { },
  onExitFullscreen = () => { },
  isSubmitting = false,
  initialViolationCount = 0,
}, ref) => {
  const navigate = useNavigate();

  // Permission states
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissions, setPermissions] = useState({
    screenShare: false,
    faceMatch: false,
    microphone: false,
    location: false,
  });
  const [permissionErrors, setPermissionErrors] = useState({});
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // OTP bypass states
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpBypassActive, setOtpBypassActive] = useState(false);

  // Monitoring states
  const [violationCount, setViolationCount] = useState(initialViolationCount);
  const [violations, setViolations] = useState([]);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [currentWarning, setCurrentWarning] = useState(null);

  // Sync violation count with prop when it changes (for resuming tests)
  useEffect(() => {
    if (initialViolationCount > 0 && violationCount === 0) {
      setViolationCount(initialViolationCount);
    }
  }, [initialViolationCount, violationCount]);

  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const [devToolsDetected, setDevToolsDetected] = useState(false); // For blocking test start

  // Refs
  const screenStreamRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const faceDetectionIntervalRef = useRef(null);
  const devToolsCheckIntervalRef = useRef(null);
  const fullscreenTimeoutRef = useRef(null);
  const modelsLoadedRef = useRef(false);
  const initialFaceDescriptorRef = useRef(null);
  const profileImageDescriptorRef = useRef(null);
  const hasRequestedPermissionsRef = useRef(false);
  const [profileImageLoadedRef] = useState({ current: false }); // Using ref pattern for consistency with existing code

  // Verification state for pre-exam check
  const [verificationStatus, setVerificationStatus] = useState('pending'); // 'pending', 'verifying', 'success', 'failed'

  // CRITICAL: Shared cooldown timestamp across ALL detection mechanisms to prevent duplicate violations
  const lastViolationTimeRef = useRef(0);

  // Load face-api.js models
  useEffect(() => {
    const loadModels = async () => {
      if (modelsLoadedRef.current) return;

      try {
        setIsLoadingModels(true);
        const MODEL_URL = '/models'; // Models should be in public/models folder

        console.log('🔄 Loading face-api.js models from:', MODEL_URL);

        // Load models sequentially to avoid race conditions and ensure proper loading
        console.log('Loading tinyFaceDetector...');
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        console.log('✅ tinyFaceDetector loaded');

        console.log('Loading faceLandmark68Net...');
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        console.log('✅ faceLandmark68Net loaded');

        console.log('Loading faceRecognitionNet...');
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        console.log('✅ faceRecognitionNet loaded');

        modelsLoadedRef.current = true;
        setIsLoadingModels(false);
        console.log('✅ Face-api.js models loaded successfully');
      } catch (error) {
        console.error('❌ Error loading face-api.js models:', error);
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        setIsLoadingModels(false);

        // Provide more detailed error message
        let errorMessage = 'Failed to load face detection models. ';
        if (error.message) {
          errorMessage += `Error: ${error.message}. `;
        }
        errorMessage += 'Please ensure models are downloaded and placed in /public/models folder. See README for instructions.';

        setPermissionErrors(prev => ({
          ...prev,
          faceMatch: errorMessage
        }));
      }
    };

    // Load models as soon as component mounts (don't wait for enabled)
    if (!modelsLoadedRef.current) {
      loadModels();
    }
  }, []);

  // Load face descriptor from database for face matching (SECURE: only descriptor, not image)
  useEffect(() => {
    const loadFaceDescriptor = async () => {
      if (profileImageLoadedRef.current || !modelsLoadedRef.current) return;

      try {
        // Fetch face descriptor from secure endpoint (descriptor only, not the image)
        const response = await apiRequest('/auth/profile/face-descriptor');

        if (!response.faceDescriptor || !Array.isArray(response.faceDescriptor)) {
          console.warn('⚠️ No face descriptor found in database');
          setPermissionErrors(prev => ({
            ...prev,
            faceMatch: 'Face descriptor not found. Please upload a profile image first.'
          }));
          return;
        }

        // Convert array to Float32Array for face-api.js
        profileImageDescriptorRef.current = new Float32Array(response.faceDescriptor);
        profileImageLoadedRef.current = true;
        console.log('✅ Face descriptor loaded from database (secure, non-reversible)');

        // Update permission status - face recognition is ready (descriptor loaded)
        // The actual activation will happen when camera is accessed during exam
        setPermissions(prev => ({ ...prev, faceMatch: true }));
      } catch (error) {
        console.error('❌ Error loading face descriptor:', error);
        setPermissionErrors(prev => ({
          ...prev,
          faceMatch: 'Face descriptor not found. Please upload a profile image first.'
        }));
      }
    };

    // Check periodically if models are loaded, then load face descriptor
    const checkAndLoad = setInterval(() => {
      if (modelsLoadedRef.current && !profileImageLoadedRef.current) {
        clearInterval(checkAndLoad);
        loadFaceDescriptor();
      }
    }, 500);

    return () => clearInterval(checkAndLoad);
  }, []);

  // Show permission modal when proctoring is enabled
  // This will show for both new tests and continuing tests
  useEffect(() => {
    if (enabled && !hasRequestedPermissionsRef.current && !isSubmitting) {
      // Check if permissions were already granted (for continuing tests, we still need to verify)
      // For now, always show modal to ensure permissions are active
      setPermissions({
        screenShare: false,
        faceMatch: false,
        microphone: false,
        location: false,
      });
      setShowPermissionModal(true);
      hasRequestedPermissionsRef.current = true;
    }
  }, [enabled, isSubmitting]);

  // Reset permission request flag when proctoring is disabled (for new test sessions)
  useEffect(() => {
    if (!enabled) {
      hasRequestedPermissionsRef.current = false;
    }
  }, [enabled]);

  // Detect devtools during permission modal phase to block test start
  useEffect(() => {
    if (!showPermissionModal) return;

    const checkDevTools = () => {
      const widthThreshold = 160;
      const isOpen = window.outerWidth - window.innerWidth > widthThreshold ||
        window.outerHeight - window.innerHeight > widthThreshold;
      setDevToolsDetected(isOpen);
    };

    // Check immediately
    checkDevTools();

    // Check every 500ms
    const intervalId = setInterval(checkDevTools, 500);

    return () => clearInterval(intervalId);
  }, [showPermissionModal]);

  // Handle violations (defined early to avoid initialization order issues)
  const handleViolation = useCallback((violationType, details) => {
    let newViolationCount;
    let violation;

    setViolationCount(prevCount => {
      newViolationCount = prevCount + 1;

      // Get allowed tab switches from test (default to 2 if not set)
      // -1 means unlimited (practice tests)
      const allowedSwitches = test?.allowedTabSwitches ?? 2;
      const isUnlimited = allowedSwitches === -1;

      violation = {
        timestamp: new Date().toISOString(),
        violationType,
        details,
        count: newViolationCount,
      };

      setViolations(prevViolations => {
        const updatedViolations = [...prevViolations, violation];

        // Notify parent component - defer to avoid React warning about updating during render
        setTimeout(() => {
          onViolation({
            violationCount: newViolationCount,
            violation,
            violations: updatedViolations,
          });
        }, 0);

        return updatedViolations;
      });

      return newViolationCount;
    });

    // Show warning modal after state update completes
    // First close any existing modal, then show new one
    setShowWarningModal(false);
    setCurrentWarning(null);
    setDevToolsOpen(false);

    // Use setTimeout to ensure state has been updated and modal is closed
    setTimeout(() => {
      const allowedSwitches = test?.allowedTabSwitches ?? 2;
      const isUnlimited = allowedSwitches === -1;

      // Warning system based on allowedTabSwitches
      if (isUnlimited) {
        // For practice tests (-1), show warnings but don't auto-submit
        if (newViolationCount === 1) {
          setCurrentWarning({
            type: 'warning',
            message: `First Warning: ${details}`,
            count: 1,
            limit: 'unlimited',
            violationType: violationType
          });
          setShowWarningModal(true);
          // Check if dev tools are open for devtools violations
          if (violationType === 'devtools_opened') {
            const widthThreshold = 160;
            const isDevToolsOpen = window.outerWidth - window.innerWidth > widthThreshold ||
              window.outerHeight - window.innerHeight > widthThreshold;
            setDevToolsOpen(isDevToolsOpen);
          }
        } else if (newViolationCount === 2) {
          setCurrentWarning({
            type: 'final_warning',
            message: `Warning: ${details}`,
            count: 2,
            limit: 'unlimited',
            violationType: violationType
          });
          setShowWarningModal(true);
          // Check if dev tools are open for devtools violations
          if (violationType === 'devtools_opened') {
            const widthThreshold = 160;
            const isDevToolsOpen = window.outerWidth - window.innerWidth > widthThreshold ||
              window.outerHeight - window.innerHeight > widthThreshold;
            setDevToolsOpen(isDevToolsOpen);
          }
        }
        // No auto-submit for practice tests
      } else if (allowedSwitches === 0) {
        // No violations allowed - auto-submit immediately
        setCurrentWarning({
          type: 'auto_submit',
          message: `Test will be automatically submitted. No violations are allowed for this test.`,
          count: newViolationCount,
          limit: 0,
          violationType: violationType
        });
        setShowWarningModal(true);
        setTimeout(() => {
          onSubmit(true); // cancelledDueToViolation = true
        }, 2000);
      } else {
        // For regular tests, use the allowedTabSwitches limit
        if (newViolationCount === 1) {
          setCurrentWarning({
            type: 'warning',
            message: `First Warning: ${details}`,
            count: 1,
            limit: allowedSwitches,
            violationType: violationType
          });
          setShowWarningModal(true);
          // Check if dev tools are open for devtools violations
          if (violationType === 'devtools_opened') {
            const widthThreshold = 160;
            const isDevToolsOpen = window.outerWidth - window.innerWidth > widthThreshold ||
              window.outerHeight - window.innerHeight > widthThreshold;
            setDevToolsOpen(isDevToolsOpen);
          }
        } else if (newViolationCount < allowedSwitches) {
          // Intermediate warnings (2 to limit-1)
          setCurrentWarning({
            type: 'warning',
            message: `Warning #${newViolationCount}: ${details}`,
            count: newViolationCount,
            limit: allowedSwitches,
            violationType: violationType
          });
          setShowWarningModal(true);
          // Check if dev tools are open for devtools violations
          if (violationType === 'devtools_opened') {
            const widthThreshold = 160;
            const isDevToolsOpen = window.outerWidth - window.innerWidth > widthThreshold ||
              window.outerHeight - window.innerHeight > widthThreshold;
            setDevToolsOpen(isDevToolsOpen);
          }
        } else if (newViolationCount === allowedSwitches) {
          // Final warning when reaching the limit
          setCurrentWarning({
            type: 'final_warning',
            message: `Final Warning: ${details}. This is your last allowed violation.`,
            count: newViolationCount,
            limit: allowedSwitches,
            violationType: violationType
          });
          setShowWarningModal(true);
          // Check if dev tools are open for devtools violations
          if (violationType === 'devtools_opened') {
            const widthThreshold = 160;
            const isDevToolsOpen = window.outerWidth - window.innerWidth > widthThreshold ||
              window.outerHeight - window.innerHeight > widthThreshold;
            setDevToolsOpen(isDevToolsOpen);
          }
        } else if (newViolationCount > allowedSwitches) {
          // Auto-submit when exceeding the limit
          setCurrentWarning({
            type: 'auto_submit',
            message: `Test will be automatically submitted. You have exceeded the allowed violation limit (${allowedSwitches}).`,
            count: newViolationCount,
            limit: allowedSwitches,
            violationType: violationType
          });
          setShowWarningModal(true);
          setTimeout(() => {
            onSubmit(true); // cancelledDueToViolation = true
          }, 2000);
        }
      }
    }, 50); // Small delay to ensure modal closes first
  }, [test, onViolation, onSubmit]);

  // Request screen sharing permission
  const requestScreenShare = useCallback(async () => {
    // Check if screen sharing is already active
    if (permissions.screenShare && screenStreamRef.current) {
      const tracks = screenStreamRef.current.getVideoTracks();
      if (tracks.length > 0 && tracks[0].readyState === 'live') {
        console.log('✅ Screen sharing already active, skipping request');
        return true;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 5,
          cursor: 'always',
          displaySurface: 'monitor' // Prefer entire screen (monitor)
        },
        audio: false
      });

      // Check if user selected entire screen (monitor) or window/tab
      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      const displaySurface = settings.displaySurface;

      // Reject if user selected window or browser tab instead of entire screen
      if (displaySurface && displaySurface !== 'monitor') {
        // Stop the stream immediately
        videoTrack.stop();
        stream.getTracks().forEach(track => track.stop());

        setPermissionErrors(prev => ({
          ...prev,
          screenShare: 'You must share your ENTIRE SCREEN, not a window or tab. Please try again and select "Entire Screen".'
        }));
        return false;
      }

      screenStreamRef.current = stream;

      // Monitor if user stops sharing
      videoTrack.onended = () => {
        if (handleViolation) {
          handleViolation('screen_share_stopped', 'Screen sharing was stopped');
        }
        setPermissions(prev => ({ ...prev, screenShare: false }));
      };

      setPermissions(prev => ({ ...prev, screenShare: true }));
      setPermissionErrors(prev => ({ ...prev, screenShare: null }));
      return true;
    } catch (error) {
      console.error('Screen share error:', error);
      setPermissionErrors(prev => ({
        ...prev,
        screenShare: error.message || 'Failed to start screen sharing'
      }));
      return false;
    }
  }, [handleViolation, permissions.screenShare]);

  // Request microphone permission
  const requestMicrophone = useCallback(async () => {
    // Check if microphone permission is already granted
    if (permissions.microphone) {
      console.log('✅ Microphone permission already granted, skipping request');
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Stop the stream immediately, we just needed permission
      stream.getTracks().forEach(track => track.stop());

      setPermissions(prev => ({ ...prev, microphone: true }));
      setPermissionErrors(prev => ({ ...prev, microphone: null }));
      return true;
    } catch (error) {
      console.error('Microphone error:', error);
      setPermissionErrors(prev => ({
        ...prev,
        microphone: error.message || 'Failed to access microphone'
      }));
      return false;
    }
  }, [permissions.microphone]);

  // Request location permission
  const requestLocation = useCallback(async () => {
    // Check if location permission is already granted
    if (permissions.location) {
      console.log('✅ Location permission already granted, skipping request');
      return true;
    }

    try {
      if (!navigator.geolocation) {
        throw new Error('Geolocation is not supported by your browser');
      }

      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setPermissions(prev => ({ ...prev, location: true }));
            setPermissionErrors(prev => ({ ...prev, location: null }));
            resolve(position);
          },
          (error) => {
            reject(error);
          },
          { timeout: 10000 }
        );
      });
      return true;
    } catch (error) {
      console.error('Location error:', error);
      setPermissionErrors(prev => ({
        ...prev,
        location: error.message || 'Failed to access location'
      }));
      return false;
    }
  }, [permissions.location]);

  // Manual face capture and verification (Single Shot)
  const captureAndVerifyFace = useCallback(async () => {
    if (!videoRef.current || !modelsLoadedRef.current) {
      console.warn('Camera or models not ready');
      return;
    }

    setVerificationStatus('verifying');

    // Check if profile image is available
    const referenceDescriptor = profileImageDescriptorRef.current;
    if (!referenceDescriptor) {
      console.warn('No reference face descriptor available');
      setPermissionErrors(prev => ({
        ...prev,
        faceMatch: 'Profile image not loaded. Please wait or reload.'
      }));
      setVerificationStatus('failed');
      return;
    }

    try {
      // Single shot detection with Robust Retry Strategy
      let detection = null;

      // Attempt 1: Standard (Balanced)
      try {
        detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.3 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
      } catch (e) {
        console.log("Attempt 1 failed", e);
      }

      // Attempt 2: High Resolution (For faces further away)
      if (!detection) {
        try {
          detection = await faceapi
            .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.3 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
        } catch (e) {
          console.log("Attempt 2 failed", e);
        }
      }

      // Attempt 3: Low Resolution / High Sensitivity (For blurry/darker frames)
      if (!detection) {
        try {
          detection = await faceapi
            .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.2 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
        } catch (e) {
          console.log("Attempt 3 failed", e);
        }
      }

      if (detection) {
        const distance = faceapi.euclideanDistance(
          referenceDescriptor,
          detection.descriptor
        );

        // Threshold: 0.6 is a good balance (lower = stricter)
        if (distance < 0.6) {
          // MATCH FOUND!
          setVerificationStatus('success');
          setPermissions(prev => ({ ...prev, faceMatch: true }));
          setPermissionErrors(prev => ({ ...prev, faceMatch: null }));
          console.log('✅ Face verified successfully');
        } else {
          // Face detected but not matching
          setVerificationStatus('failed');
          setPermissions(prev => ({ ...prev, faceMatch: false }));
          setPermissionErrors(prev => ({
            ...prev,
            faceMatch: 'Face does not match profile picture. Please try again.'
          }));
        }
      } else {
        // No face detected
        setVerificationStatus('failed');
        setPermissions(prev => ({ ...prev, faceMatch: false }));
        setPermissionErrors(prev => ({
          ...prev,
          faceMatch: 'No face detected. Ensure your face is clearly visible.'
        }));
      }
    } catch (error) {
      console.error('Face verification error:', error);
      setVerificationStatus('failed');
      setPermissionErrors(prev => ({
        ...prev,
        faceMatch: 'Detection error. Please try again.'
      }));
    }
  }, []);

  // Request camera permission and start video stream
  const requestCamera = useCallback(async () => {
    // Check if camera permission is already granted
    if (permissions.camera) {
      console.log('✅ Camera permission already granted, skipping request');
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setPermissions(prev => ({ ...prev, camera: true }));
      setPermissionErrors(prev => ({ ...prev, camera: null }));

      console.log('✅ Camera access granted');



      return true;
    } catch (error) {
      console.error('Camera error:', error);
      setPermissionErrors(prev => ({
        ...prev,
        camera: error.message || 'Camera access denied. Please allow camera access to continue.'
      }));
      return false;
    }
  }, [permissions.camera]);



  // Initialize face detection
  // This is now largely handled by requestCamera and runPreExamVerification
  const initializeFaceDetection = useCallback(async () => {
    if (!modelsLoadedRef.current) {
      console.warn('Models not loaded yet');
      return;
    }
    console.log('Face detection system ready');
  }, []);

  // Request fullscreen (defined early to avoid initialization order issues)
  const requestFullscreen = useCallback(async () => {
    try {
      const isAlreadyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );

      if (isAlreadyFullscreen) return;

      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        await document.documentElement.webkitRequestFullscreen();
      } else if (document.documentElement.msRequestFullscreen) {
        await document.documentElement.msRequestFullscreen();
      }
    } catch (error) {
      // Silently fail - fullscreen requires user gesture
      // Don't log errors for automatic fullscreen requests
      if (error.name !== 'NotAllowedError' && error.message !== 'Permissions check failed') {
        console.warn('Fullscreen request failed:', error);
      }
    }
  }, []);

  // Exit fullscreen
  const exitFullscreen = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen();
      }
      onExitFullscreen();
    } catch (error) {
      console.error('Failed to exit fullscreen:', error);
      onExitFullscreen();
    }
  }, [onExitFullscreen]);

  // Request all permissions
  const requestAllPermissions = useCallback(async () => {
    const results = {
      screenShare: await requestScreenShare(),
      microphone: await requestMicrophone(),
      camera: await requestCamera(),
      location: await requestLocation(),
      faceMatch: permissions.faceMatch, // Use current state (set by verification)
    };

    return results;
  }, [requestScreenShare, requestMicrophone, requestLocation, requestCamera, permissions.faceMatch]);

  // Handle permission modal continue
  const handleContinue = useCallback(async () => {
    const results = await requestAllPermissions();
    console.log('🔍 continue check:', results, 'verificationStatus:', verificationStatus);

    // Check if all critical permissions are granted
    // Camera AND Face Match are now REQUIRED
    // CRITICAL: Ensure verificationStatus is strictly 'success'
    const isVerified = verificationStatus === 'success';

    if (results.screenShare && results.microphone && results.location && results.camera && isVerified) {
      setShowPermissionModal(false);
      setPermissions(prev => ({
        ...prev,
        screenShare: results.screenShare,
        microphone: results.microphone,
        location: results.location,
        camera: results.camera,
        faceMatch: results.faceMatch,
      }));

      // Stop the face verification interval before starting - NO continuous monitoring during exam
      if (faceDetectionIntervalRef.current) {
        clearInterval(faceDetectionIntervalRef.current);
      }

      // Request fullscreen after permissions
      setTimeout(() => {
        requestFullscreen();
      }, 500);
    } else {
      const missing = [];
      if (!results.screenShare) missing.push('Screen Sharing');
      if (!results.microphone) missing.push('Microphone');
      if (!results.location) missing.push('Location');
      if (!results.camera) missing.push('Camera Access');
      if (!isVerified) missing.push('Face Verification');
      alert(`Please grant all required permissions to continue: ${missing.join(', ')}`);
    }
  }, [requestAllPermissions, requestFullscreen, verificationStatus]);

  // Verify OTP for permission bypass
  const handleVerifyOtp = useCallback(async () => {
    if (!otpValue.trim()) {
      setOtpError('Please enter the OTP');
      return;
    }

    setIsVerifyingOtp(true);
    setOtpError('');

    try {
      const response = await apiRequest(`/tests/${test._id}/verify-otp`, {
        method: 'POST',
        body: JSON.stringify({ otp: otpValue.trim() }),
      });

      if (response.success) {
        // OTP verified - set bypass active
        setOtpBypassActive(true);
        setShowOtpModal(false);
        setOtpValue('');
        console.log('✅ OTP verified - bypass mode activated');
      }
    } catch (error) {
      setOtpError(error.message || 'Invalid OTP. Please try again.');
    } finally {
      setIsVerifyingOtp(false);
    }
  }, [otpValue, test._id]);

  // Handle continue with OTP bypass - only requires screen share
  const handleContinueWithOtpBypass = useCallback(async () => {
    // Only request screen share for OTP bypass
    const screenShareResult = await requestScreenShare();

    if (screenShareResult && !devToolsDetected) {
      setShowPermissionModal(false);
      setPermissions(prev => ({
        ...prev,
        screenShare: true,
        // Mark other permissions as bypassed (not actually granted but OK for OTP flow)
        microphone: true,
        location: true,
        camera: true,
        faceMatch: true,
      }));

      // Request fullscreen after screen share is granted
      setTimeout(() => {
        requestFullscreen();
      }, 500);
    } else if (!screenShareResult) {
      alert('Screen sharing is required even with OTP bypass. Please share your entire screen.');
    } else if (devToolsDetected) {
      alert('Please close Developer Tools before continuing.');
    }
  }, [requestScreenShare, requestFullscreen, devToolsDetected]);


  // Tab switch, window switch, and application switch detection
  // This MUST work regardless of fullscreen state - detection never stops
  // CRITICAL: State tracking must properly reset to detect repeated violations
  useEffect(() => {
    if (!enabled || showPermissionModal) return;

    // Initialize with current state
    let lastVisibilityState = document.visibilityState;
    let lastFocusState = document.hasFocus();
    // Use the shared cooldown ref to prevent duplicate violations across all detection mechanisms
    const VIOLATION_COOLDOWN = 1500; // 1.5 seconds cooldown shared with other detectors

    console.log('🔵 Detection initialized:', {
      initialFocus: lastFocusState,
      initialVisibility: lastVisibilityState
    });

    const handleVisibilityChange = () => {
      const currentState = document.visibilityState;
      // Detect when tab becomes hidden (regardless of fullscreen state)
      // CRITICAL: Check for transition from visible to hidden
      if (currentState === "hidden" && lastVisibilityState === "visible") {
        const now = Date.now();
        if (now - lastViolationTimeRef.current > VIOLATION_COOLDOWN) {
          // CRITICAL: Update shared timestamp BEFORE calling handleViolation to prevent race condition
          lastViolationTimeRef.current = now;
          console.log('🔴 [visibilitychange] Tab switch detected - violation triggered');
          handleViolation("tab_switch", "Tab switched or window minimized");
          // Try to re-enter fullscreen if exited
          requestFullscreen().catch(() => { });
        }
      } else if (currentState === "visible" && lastVisibilityState === "hidden") {
        // User returned - reset state for next detection
        console.log('✅ [visibilitychange] Tab returned - state reset');
      }
      // CRITICAL: Always update state to current state
      // This allows us to detect the next transition
      lastVisibilityState = currentState;
    };

    const handleBlur = () => {
      // Window lost focus (user switched to another window/application)
      const currentFocus = document.hasFocus();
      // CRITICAL: Check for transition from focused to unfocused
      if (currentFocus === false && lastFocusState === true) {
        const now = Date.now();
        if (now - lastViolationTimeRef.current > VIOLATION_COOLDOWN) {
          // CRITICAL: Update shared timestamp BEFORE calling handleViolation to prevent race condition
          lastViolationTimeRef.current = now;
          console.log('🔴 [blur] Window switch detected - violation triggered');
          handleViolation("window_switch", "Window or application switched");
          // Try to re-enter fullscreen if exited
          requestFullscreen().catch(() => { });
        }
      }
      // CRITICAL: Always update state
      lastFocusState = currentFocus;
    };

    const handleFocus = () => {
      // When window regains focus, reset state so we can detect next violation
      const currentFocus = document.hasFocus();
      if (currentFocus) {
        console.log('✅ [focus] Window focus returned - resetting state for next detection');
        const isFullscreen = !!(
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.msFullscreenElement
        );
        if (!isFullscreen) {
          // Immediately try to re-enter fullscreen
          requestFullscreen().catch(() => { });
        }
      }
      // CRITICAL: Update state when focus returns
      // This resets the state so we can detect the next violation
      lastFocusState = currentFocus;
      // Also update visibility state when focus returns
      lastVisibilityState = document.visibilityState;
    };

    // Periodic state tracking and fullscreen re-entry
    // IMPORTANT: This interval does NOT trigger violations - only event listeners do
    // The interval only tracks state changes and handles fullscreen re-entry
    const focusCheckInterval = setInterval(() => {
      const currentFocus = document.hasFocus();
      const currentVisibility = document.visibilityState;

      // Update focus state tracking (no violation triggering here)
      if (currentFocus !== lastFocusState) {
        if (currentFocus === true && lastFocusState === false) {
          console.log('✅ [interval] Window focus returned - state reset for next detection');
        }
        lastFocusState = currentFocus;
      }

      // Update visibility state tracking (no violation triggering here)
      if (currentVisibility !== lastVisibilityState) {
        if (currentVisibility === "visible" && lastVisibilityState === "hidden") {
          console.log('✅ [interval] Tab visibility returned - state reset for next detection');
        }
        lastVisibilityState = currentVisibility;
      }

      // If we have focus but not fullscreen, try to re-enter
      if (currentFocus && currentVisibility === "visible") {
        const isFullscreen = !!(
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.msFullscreenElement
        );
        if (!isFullscreen) {
          requestFullscreen().catch(() => { });
        }
      }
    }, 500); // Check every 500ms for state tracking and fullscreen re-entry

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(focusCheckInterval);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [enabled, showPermissionModal, handleViolation, requestFullscreen]);

  // Fullscreen change detection - show warning modal like devtools
  // This MUST continue running even if fullscreen is exited to keep detection active
  useEffect(() => {
    if (!enabled || showPermissionModal) return;

    let wasFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement
    );
    // Use the shared cooldown ref - same as tab/window detection
    const VIOLATION_COOLDOWN = 1500; // Must match other detectors

    const handleFullscreenChange = () => {
      const isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );

      // User exited fullscreen
      if (!isFullscreen && wasFullscreen && !isSubmitting) {
        const now = Date.now();
        if (now - lastViolationTimeRef.current > VIOLATION_COOLDOWN) {
          // CRITICAL: Update shared timestamp BEFORE calling handleViolation
          lastViolationTimeRef.current = now;
          handleViolation("fullscreen_exit", "Fullscreen mode exited");
        }

        // Immediately try to re-enter fullscreen (aggressive)
        setTimeout(() => {
          requestFullscreen().catch(() => {
            // If fullscreen request fails, keep trying
          });
        }, 50);
      }

      wasFullscreen = isFullscreen;
    };

    // Periodic fullscreen re-entry check - NO violation triggering here
    // Violations are only triggered by the fullscreenchange event
    const fullscreenCheckInterval = setInterval(() => {
      const isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );

      // Just try to re-enter fullscreen if needed (no violation triggering)
      if (!isFullscreen && !isSubmitting) {
        requestFullscreen().catch(() => { });
      }

      wasFullscreen = isFullscreen;
    }, 500); // Check every 500ms for fullscreen re-entry

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("msfullscreenchange", handleFullscreenChange);

    return () => {
      clearInterval(fullscreenCheckInterval);
      if (fullscreenTimeoutRef.current) {
        clearTimeout(fullscreenTimeoutRef.current);
      }
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("msfullscreenchange", handleFullscreenChange);
    };
  }, [enabled, showPermissionModal, isSubmitting, handleViolation, requestFullscreen]);

  // Copy/paste blocking - works regardless of fullscreen state
  // This blocking is completely independent of fullscreen mode
  useEffect(() => {
    if (!enabled || showPermissionModal) return;

    const handleCopy = (e) => e.preventDefault();
    const handlePaste = (e) => e.preventDefault();
    const handleCut = (e) => e.preventDefault();
    const handleContextMenu = (e) => e.preventDefault();

    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("cut", handleCut);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [enabled, showPermissionModal]);

  // DevTools detection - works regardless of fullscreen state
  // This detection is completely independent of fullscreen mode
  useEffect(() => {
    if (!enabled || showPermissionModal) return;

    let lastViolationTime = 0;
    const VIOLATION_COOLDOWN = 2000; // Prevent spam violations

    devToolsCheckIntervalRef.current = setInterval(() => {
      const widthThreshold = 160;
      const isDevToolsOpen = window.outerWidth - window.innerWidth > widthThreshold ||
        window.outerHeight - window.innerHeight > widthThreshold;

      if (isDevToolsOpen) {
        const now = Date.now();
        if (now - lastViolationTime > VIOLATION_COOLDOWN) {
          handleViolation("devtools_opened", "Developer tools detected");
          lastViolationTime = now;
          // Try to re-enter fullscreen if exited (but detection works regardless)
          requestFullscreen().catch(() => { });
        }
      }
    }, 1000);

    return () => {
      if (devToolsCheckIntervalRef.current) {
        clearInterval(devToolsCheckIntervalRef.current);
      }
    };
  }, [enabled, showPermissionModal, handleViolation, requestFullscreen]);

  // Click handler to ensure fullscreen is active on any interaction
  useEffect(() => {
    if (!enabled || showPermissionModal) return;

    const handleClick = () => {
      // Check if fullscreen is active
      const isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );

      // If not fullscreen, try to re-enter immediately
      if (!isFullscreen) {
        requestFullscreen().catch(() => { });
      }
    };

    // Use capture phase to catch clicks early
    document.addEventListener("click", handleClick, true);
    document.addEventListener("mousedown", handleClick, true);
    document.addEventListener("touchstart", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("mousedown", handleClick, true);
      document.removeEventListener("touchstart", handleClick, true);
    };
  }, [enabled, showPermissionModal, requestFullscreen]);

  // Keyboard shortcuts blocking - including ESC to prevent fullscreen exit
  useEffect(() => {
    if (!enabled || showPermissionModal) return;

    const handleKeyDown = (e) => {
      const isInEditor = e.target.closest('.monaco-editor');
      const isInTextarea = e.target.tagName === 'TEXTAREA';
      const isInInput = e.target.tagName === 'INPUT';

      // Block ESC key to prevent fullscreen exit
      if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        // Immediately try to re-enter fullscreen if user tries to exit
        requestFullscreen().catch(() => { });
        return;
      }

      // Block F11 (fullscreen toggle)
      if (e.key === 'F11' || e.keyCode === 122) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (isInEditor) {
        const isFKey = (e.key && /^F\d+$/i.test(e.key) && parseInt(e.key.slice(1)) >= 1 && parseInt(e.key.slice(1)) <= 12) ||
          (e.keyCode >= 112 && e.keyCode <= 123);
        if (
          e.ctrlKey ||
          e.altKey ||
          e.key === "Tab" || e.keyCode === 9 ||
          isFKey ||
          (e.ctrlKey && e.shiftKey && e.key === 'I') || // Ctrl+Shift+I
          (e.ctrlKey && e.shiftKey && e.key === 'J') || // Ctrl+Shift+J
          (e.ctrlKey && e.shiftKey && e.key === 'C') || // Ctrl+Shift+C
          (e.key === 'F12')
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      } else if (!isInTextarea && !isInInput) {
        if (e.key !== "Tab" && e.keyCode !== 9) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true); // Use capture phase for better blocking
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [enabled, showPermissionModal, requestFullscreen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop screen sharing
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }

      // Stop video stream
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }

      // Clear intervals
      if (faceDetectionIntervalRef.current) {
        clearInterval(faceDetectionIntervalRef.current);
      }
      if (devToolsCheckIntervalRef.current) {
        clearInterval(devToolsCheckIntervalRef.current);
      }
      if (fullscreenTimeoutRef.current) {
        clearTimeout(fullscreenTimeoutRef.current);
      }
    };
  }, []);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    violationCount,
    violations,
    requestFullscreen,
    exitFullscreen,
    resetViolations: () => {
      setViolationCount(0);
      setViolations([]);
    },
  }), [violationCount, violations, requestFullscreen, exitFullscreen]);

  return (
    <>
      {/* Permission Modal - Blocks all interaction until permissions granted */}
      {showPermissionModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] p-4"
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-slate-800 rounded-lg max-w-2xl w-full max-h-[95vh] flex flex-col">
            <div className="p-6 pb-4 flex-shrink-0">
              <h2 className="text-xl font-bold text-white text-center">
                Proctoring System - Permission Required
              </h2>
            </div>

            <div className="px-6 overflow-y-auto flex-1 space-y-4 pb-4">
              {/* Screen Sharing */}
              <div className="bg-slate-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-base font-semibold text-white">Screen Sharing</h3>
                  {permissions.screenShare ? (
                    <span className="text-green-400">✓ Granted</span>
                  ) : (
                    <button
                      onClick={requestScreenShare}
                      className="bg-white/90 hover:bg-white text-black px-4 py-2 rounded-md text-sm font-semibold"
                    >
                      Grant Permission
                    </button>
                  )}
                </div>
                <p className="text-slate-300 text-sm">
                  You must share your ENTIRE SCREEN (not a window or tab) for monitoring during the exam.
                </p>
                {permissionErrors.screenShare && (
                  <p className="text-red-400 text-sm mt-1">{permissionErrors.screenShare}</p>
                )}
              </div>

              {/* Face Matching */}
              <div className="bg-slate-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-base font-semibold text-white">Face Recognition (Pre-Check)</h3>
                  {isLoadingModels ? (
                    <span className="text-yellow-400">Loading models...</span>
                  ) : verificationStatus === 'success' ? (
                    <span className="text-green-400">✓ Verified</span>
                  ) : verificationStatus === 'failed' ? (
                    <span className="text-red-400">❌ Failed</span>
                  ) : !permissions.camera ? (
                    <button
                      onClick={requestCamera}
                      className="bg-white/90 hover:bg-white text-black px-4 py-2 rounded-md text-sm font-semibold transition-colors"
                    >
                      Grant Permission
                    </button>
                  ) : (
                    <span className="text-slate-400">Ready to Verify</span>
                  )}
                </div>

                <p className="text-slate-300 text-sm mb-3">
                  {!permissions.camera
                    ? "Camera access is required for identity verification."
                    : "Please look at the camera and click Verify to match your profile picture."}
                </p>

                {/* Manual Verify Button */}
                {permissions.camera && verificationStatus !== 'success' && !isLoadingModels && (
                  <button
                    onClick={captureAndVerifyFace}
                    disabled={verificationStatus === 'verifying'}
                    className={`w-full py-2 rounded-md font-semibold text-sm mb-2 ${verificationStatus === 'verifying'
                      ? 'bg-blue-600/50 text-blue-200 cursor-wait'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                  >
                    {verificationStatus === 'verifying' ? 'Verifying...' : 'Capture & Verify Face'}
                  </button>
                )}

                {permissionErrors.faceMatch && (
                  <p className="text-red-400 text-sm mb-2">{permissionErrors.faceMatch}</p>
                )}
                <p className="text-slate-300 text-sm">
                  Your face will be monitored to ensure you are the one taking the exam.
                </p>
                {permissionErrors.faceMatch && (
                  <div className="mt-2">
                    <p className="text-red-400 text-sm mb-2">{permissionErrors.faceMatch}</p>
                    {(permissionErrors.faceMatch.includes('Face descriptor not found') ||
                      permissionErrors.faceMatch.includes('No face descriptor') ||
                      permissionErrors.faceMatch.includes('Failed to load face descriptor') ||
                      permissionErrors.faceMatch.includes('upload a profile image')) && (
                        <button
                          onClick={() => navigate('/student/profile')}
                          className="bg-white/90 hover:bg-white text-black px-4 py-2 rounded-md text-sm font-semibold transition-colors w-full"
                        >
                          Go to Profile Settings
                        </button>
                      )}
                  </div>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              {/* Microphone */}
              <div className="bg-slate-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-base font-semibold text-white">Microphone</h3>
                  {permissions.microphone ? (
                    <span className="text-green-400">✓ Granted</span>
                  ) : (
                    <button
                      onClick={requestMicrophone}
                      className="bg-white/90 hover:bg-white text-black px-4 py-2 rounded-md text-sm font-semibold"
                    >
                      Grant Permission
                    </button>
                  )}
                </div>
                <p className="text-slate-300 text-sm">
                  Microphone access is required for audio monitoring.
                </p>
                {permissionErrors.microphone && (
                  <p className="text-red-400 text-sm mt-1">{permissionErrors.microphone}</p>
                )}
              </div>

              {/* Location */}
              <div className="bg-slate-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-base font-semibold text-white">Location</h3>
                  {permissions.location ? (
                    <span className="text-green-400">✓ Granted</span>
                  ) : (
                    <button
                      onClick={requestLocation}
                      className="bg-white/90 hover:bg-white text-black px-4 py-2 rounded-md text-sm font-semibold"
                    >
                      Grant Permission
                    </button>
                  )}
                </div>
                <p className="text-slate-300 text-sm">
                  Location access is required for exam security.
                </p>
                {permissionErrors.location && (
                  <p className="text-red-400 text-sm mt-1">{permissionErrors.location}</p>
                )}
              </div>

            </div>

            <div className="p-6 pt-4 flex-shrink-0 border-t border-slate-700">
              {/* DevTools Warning */}
              {devToolsDetected && (
                <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-red-400 text-xl">⚠️</span>
                    <h4 className="text-red-400 font-bold">Developer Tools Detected!</h4>
                  </div>
                  <p className="text-red-300 text-sm">
                    Please close the Developer Tools (press F12 or right-click → Inspect) before starting the exam.
                    Developer tools are not allowed during the test for security reasons.
                  </p>
                </div>
              )}

              {/* OTP Bypass Active - Only need screen share */}
              {otpBypassActive ? (
                <div className="space-y-3">
                  <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-green-300 text-sm font-medium">OTP Verified - Only screen sharing required</span>
                    </div>
                  </div>
                  <button
                    onClick={handleContinueWithOtpBypass}
                    disabled={!permissions.screenShare || devToolsDetected}
                    className={`w-full py-2.5 px-6 rounded-md font-semibold ${permissions.screenShare && !devToolsDetected
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                  >
                    {devToolsDetected ? 'Close Developer Tools to Continue' : 'Continue to Exam'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={handleContinue}
                    disabled={!permissions.screenShare || !permissions.microphone || !permissions.location || !permissions.camera || verificationStatus !== 'success' || devToolsDetected}
                    className={`w-full py-2.5 px-6 rounded-md font-semibold ${permissions.screenShare && permissions.microphone && permissions.location && permissions.camera && verificationStatus === 'success' && !devToolsDetected
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                  >
                    {devToolsDetected ? 'Close Developer Tools to Continue' : 'Continue to Exam'}
                  </button>

                  {/* OTP Bypass Option */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-600"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-slate-800 text-slate-400">or</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShowOtpModal(true);
                      setOtpError('');
                      setOtpValue('');
                    }}
                    className="w-full py-2.5 px-6 rounded-md font-semibold bg-slate-700 hover:bg-slate-600 text-white border border-slate-500"
                  >
                    Continue with OTP
                  </button>
                  <p className="text-xs text-slate-400 text-center">
                    Have an OTP from your instructor? Click above to bypass permission requirements.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* OTP Input Modal */}
      {showOtpModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[10000] p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-slate-800 rounded-lg w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-white mb-4 text-center">Enter OTP</h3>
            <p className="text-slate-300 text-sm mb-4 text-center">
              Enter the 6-digit OTP provided by your instructor to bypass permission requirements.
            </p>

            <input
              type="text"
              value={otpValue}
              onChange={(e) => {
                // Only allow numbers and limit to 6 characters
                const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                setOtpValue(value);
                setOtpError('');
              }}
              placeholder="Enter 6-digit OTP"
              className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none text-center text-2xl font-mono tracking-widest"
              maxLength={6}
              autoFocus
            />

            {otpError && (
              <p className="text-red-400 text-sm mt-2 text-center">{otpError}</p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowOtpModal(false);
                  setOtpValue('');
                  setOtpError('');
                }}
                className="flex-1 py-2.5 px-4 rounded-md font-semibold bg-slate-700 hover:bg-slate-600 text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyOtp}
                disabled={otpValue.length !== 6 || isVerifyingOtp}
                className={`flex-1 py-2.5 px-4 rounded-md font-semibold ${otpValue.length === 6 && !isVerifyingOtp
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
              >
                {isVerifyingOtp ? 'Verifying...' : 'Verify OTP'}
              </button>
            </div>

            <p className="text-xs text-slate-400 text-center mt-4">
              Screen sharing will still be required for proctoring
            </p>
          </div>
        </div>
      )}

      {/* Warning Modal */}
      {showWarningModal && currentWarning && (
        <WarningModalWithDevToolsCheck
          currentWarning={currentWarning}
          devToolsOpen={devToolsOpen}
          setDevToolsOpen={setDevToolsOpen}
          requestFullscreen={requestFullscreen}
          onClose={() => {
            setShowWarningModal(false);
            setCurrentWarning(null);
            setDevToolsOpen(false);
          }}
        />
      )}

      {/* Live Video Preview - Positioned in header area (top center) */}
      {/* Video element always rendered for face detection, visibility controlled by wrapper */}
      <div className={`fixed top-[1.65rem] left-1/2 transform -translate-x-1/2 z-40 ${enabled && !showPermissionModal && permissions.faceMatch ? '' : 'hidden'}`}>
        <div className="bg-slate-700 rounded-lg p-1 shadow-lg border border-slate-600 flex items-center gap-2">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-36 h-24 rounded object-cover bg-slate-900"
            style={{ transform: 'scaleX(-1)' }}
          />
          <div className="text-xs text-green-400 flex items-center gap-1 pr-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
            Live
          </div>
        </div>
      </div>
    </>
  );
});

Proctoring.displayName = 'Proctoring';

export default Proctoring;
