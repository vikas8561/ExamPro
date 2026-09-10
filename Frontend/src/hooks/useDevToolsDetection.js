import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * useDevToolsDetection
 * Continuously monitors and detects Developer Tools on protected routes:
 * - /login
 * - /student
 * - /student/*
 *
 * Runs detection in an active loop so if a user tries to open DevTools
 * at any point later, access is prevented.
 */
const useDevToolsDetection = () => {
  const location = useLocation();
  const lastTriggerTimeRef = useRef(0);

  useEffect(() => {
    const pathname = location.pathname;

    // Protected condition: /login, /student, /student/*
    const isProtected =
      pathname === "/login" ||
      pathname === "/student" ||
      pathname.startsWith("/student/");

    if (!isProtected) {
      return;
    }

    // Action taken when DevTools is detected
    const handleDevToolsDetected = () => {
      const now = Date.now();
      // 1-second cooldown to prevent spamming while continuously enforcing protection
      if (now - lastTriggerTimeRef.current < 1000) return;
      lastTriggerTimeRef.current = now;

      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.replace("/login");
      }
    };

    // Dimension heuristics for docked DevTools (outer vs inner dimensions)
    const isDockedDevToolsOpen = () => {
      const widthThreshold = 160;
      const heightThreshold = 160;
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      return widthDiff > widthThreshold || heightDiff > heightThreshold;
    };

    const checkDevTools = () => {
      if (isDockedDevToolsOpen()) {
        handleDevToolsDetected();
      }
    };

    // 1. Check immediately on route/page load
    checkDevTools();

    // 2. Continuous loop checking so if a user tries to open DevTools later,
    // they are unable to access
    const loopInterval = setInterval(checkDevTools, 300);

    // 3. Detect window resize (fires immediately when docked DevTools is opened/closed)
    const handleResize = () => {
      checkDevTools();
    };

    // 4. Intercept DevTools keyboard shortcuts (F12, Ctrl+Shift+I/J/C)
    const handleKeyDown = (e) => {
      const isF12 = e.key === "F12" || e.keyCode === 123;
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const keyUpper = (e.key || "").toUpperCase();
      const code = e.code || "";

      const isInspectKey =
        keyUpper === "I" ||
        keyUpper === "J" ||
        keyUpper === "C" ||
        code === "KeyI" ||
        code === "KeyJ" ||
        code === "KeyC";

      if (isF12 || (isCtrlOrMeta && isShift && isInspectKey)) {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch {
          // ignore
        }
        handleDevToolsDetected();
      }
    };

    // 5. Block right-click context menu on protected routes to prevent "Inspect Element"
    const handleContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("contextmenu", handleContextMenu, true);
    document.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("resize", handleResize);

    // Clean up on route change or unmount
    return () => {
      clearInterval(loopInterval);
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [location.pathname]);
};

export default useDevToolsDetection;