import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";

/**
 * Proctoring Component
 * 
 * A reusable component for monitoring and enforcing test security during exams.
 * Features:
 * - Tab switch detection
 * - Fullscreen enforcement
 * - Violation tracking
 * - Resume modal
 * - Keyboard shortcuts blocking
 * - Context menu blocking
 * - Auto-submit on violation limit
 * 
 * @param {Object} props
 * @param {boolean} props.enabled - Whether proctoring is enabled
 * @param {Object} props.test - Test object with allowedTabSwitches property
 * @param {Function} props.onViolation - Callback when violation occurs (receives violation data)
 * @param {Function} props.onSubmit - Callback to submit test (receives cancelledDueToViolation flag)
 * @param {Function} props.onExitFullscreen - Callback when exiting fullscreen (for cleanup)
 * @param {boolean} props.isSubmitting - Whether test is currently being submitted
 * @param {boolean} props.blockKeyboardShortcuts - Whether to block keyboard shortcuts (default: true)
 * @param {boolean} props.blockContextMenu - Whether to block context menu (default: true)
 */
const Proctoring = forwardRef(({
  enabled = true,
  test = {},
  onViolation = () => {},
  onSubmit = () => {},
  onExitFullscreen = () => {},
  isSubmitting = false,
  blockKeyboardShortcuts = true,
  blockContextMenu = true,
}, ref) => {
  const [violationCount, setViolationCount] = useState(0);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [violations, setViolations] = useState([]);
  const fullscreenTimeoutRef = useRef(null);


  // Request fullscreen mode with better error handling
  const requestFullscreen = useCallback(async () => {
    try {
      // Check if already in fullscreen
      const isAlreadyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );
      
      if (isAlreadyFullscreen) {
        console.log("Already in fullscreen mode");
        return;
      }

      // Try standard fullscreen API first
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        console.log("✅ Entered fullscreen mode (standard API)");
      } else if (document.documentElement.webkitRequestFullscreen) {
        // Safari
        await document.documentElement.webkitRequestFullscreen();
        console.log("✅ Entered fullscreen mode (webkit API)");
      } else if (document.documentElement.msRequestFullscreen) {
        // IE/Edge
        await document.documentElement.msRequestFullscreen();
        console.log("✅ Entered fullscreen mode (ms API)");
      } else {
        console.warn("⚠️ Fullscreen API not supported in this browser");
      }
    } catch (error) {
      // Common error: user interaction required
      if (error.name === 'NotAllowedError' || error.message.includes('user gesture')) {
        console.warn("⚠️ Fullscreen requires user interaction. It will be requested when user interacts with the page.");
        // Don't throw - we'll retry later
      } else {
        console.error("❌ Failed to enter fullscreen mode:", error);
      }
      // Continue with test even if fullscreen fails
    }
  }, []);

  // Exit fullscreen mode
  const exitFullscreen = useCallback(async () => {
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
      onExitFullscreen();
    } catch (error) {
      console.error("Failed to exit fullscreen mode:", error);
      // Continue with navigation even if fullscreen exit fails
      onExitFullscreen();
    }
  }, [onExitFullscreen]);

  // Handle violation
  const handleViolation = useCallback((violationType, details) => {
    setViolationCount(prevCount => {
      const newViolationCount = prevCount + 1;
      
      const violation = {
        timestamp: new Date(),
        violationType,
        details,
        tabCount: newViolationCount,
      };
      
      setViolations(prevViolations => {
        const updatedViolations = [...prevViolations, violation];
        
        // Notify parent component
        onViolation({
          violationCount: newViolationCount,
          violation,
          violations: updatedViolations,
        });
        
        return updatedViolations;
      });

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
          // Auto-request fullscreen for fullscreen exit violations
          if (violationType === "fullscreen_exit") {
            if (fullscreenTimeoutRef.current) {
              clearTimeout(fullscreenTimeoutRef.current);
            }
            fullscreenTimeoutRef.current = setTimeout(() => {
              requestFullscreen();
            }, 1000);
          }
        } else if (newViolationCount >= allowedSwitches) {
          alert(
            `Test cancelled due to violations (${newViolationCount} violations detected, limit: ${allowedSwitches}).`
          );
          onSubmit(true); // cancelledDueToViolation = true
        }
      }
      
      return newViolationCount;
    });
  }, [test, onViolation, onSubmit, requestFullscreen]);

  // Tab switch detection
  useEffect(() => {
    console.log('🔒 Proctoring: Tab switch detection useEffect - enabled:', enabled);
    if (!enabled) {
      console.log('🔒 Proctoring: Disabled, not monitoring');
      return;
    }

    console.log('🔒 Proctoring: Setting up tab switch monitoring');
    const handleVisibilityChange = () => {
      console.log('🔒 Proctoring: Visibility change detected:', document.visibilityState);
      if (document.visibilityState === "hidden") {
        console.log('🔒 Proctoring: Tab switch violation triggered!');
        handleViolation("tab_switch", "Tab switched");
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, handleViolation]);

  // Fullscreen change detection
  useEffect(() => {
    console.log('🔒 Proctoring: Fullscreen detection useEffect - enabled:', enabled);
    if (!enabled) {
      console.log('🔒 Proctoring: Disabled, not monitoring fullscreen');
      return;
    }

    console.log('🔒 Proctoring: Setting up fullscreen monitoring');
    const handleFullscreenChange = () => {
      const isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );
      console.log('🔒 Proctoring: Fullscreen change detected:', isFullscreen);

      if (!isFullscreen && !isSubmitting) {
        console.log('Fullscreen exit violation triggered!');
        handleViolation("fullscreen_exit", "Fullscreen exited");
        
        // Auto-request fullscreen after violation (handled in handleViolation)
        // The timeout will be set in handleViolation based on violation count
      }
    };

    // Add event listeners for fullscreen changes
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("msfullscreenchange", handleFullscreenChange);

    return () => {
      // Clean up timeout on unmount
      if (fullscreenTimeoutRef.current) {
        clearTimeout(fullscreenTimeoutRef.current);
      }
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("msfullscreenchange", handleFullscreenChange);
    };
  }, [enabled, isSubmitting, handleViolation, requestFullscreen]);

  // Keyboard shortcuts blocking
  useEffect(() => {
    if (!enabled || !blockKeyboardShortcuts) return;

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

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [enabled, blockKeyboardShortcuts]);

  // Context menu blocking
  useEffect(() => {
    if (!enabled || !blockContextMenu) return;

    const handleContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [enabled, blockContextMenu]);

  // Handle resume test
  const handleResumeTest = () => {
    setShowResumeModal(false);
    // Immediately return to fullscreen mode when resuming
    setTimeout(() => {
      requestFullscreen();
    }, 100);
  };

  // Expose methods via useImperativeHandle (if ref is provided)
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
      {/* Resume Modal */}
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
    </>
  );
});

Proctoring.displayName = 'Proctoring';

export default Proctoring;

