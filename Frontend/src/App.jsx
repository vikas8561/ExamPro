import React, { useEffect, useState, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Tests from "./pages/Tests";
import Users from "./pages/Users";
import AdminProctoring from "./pages/AdminProctoring";
import "./styles/StudentSidebar.mobile.css";

import CreateTest from "./pages/CreateTest";
import Login from "./pages/Login";
import SebExit from "./pages/SebExit";
import StudentDashboard from "./pages/StudentDashboard";
import StudentAssignments from "./pages/StudentAssignments";
import StudentResults from "./pages/StudentResults";
import TakeTest from "./pages/TakeTest";
import PracticeTests from "./pages/PracticeTests";
import TakePracticeTest from "./pages/TakePracticeTest";
import PracticeTestResults from "./pages/PracticeTestResults";
import StudentCodingTests from "./pages/StudentCodingTests";
import TakeCodingTest from "./pages/TakeCodingTest";
import StudentProfile from "./pages/StudentProfile";
import StudentSidebar from "./components/StudentSidebar";
import MentorLayout from "./components/MentorLayout";
import MentorAssignments from "./pages/MentorAssignments";
import MentorDashboard from "./pages/MentorDashboard";
import MentorSubmissions from "./pages/MentorSubmissions";
import ViewCompletedTest from "./pages/ViewCompletedTest";
import AdminSidebar from "./components/AdminSidebar";
import AdminDSAPractice from "./pages/AdminDSAPractice";

// Protected Route Component - uses JWT payload for role check (defense-in-depth)
const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const location = useLocation();

  // Where to send them back to once they have signed in. This matters more than
  // convenience for Safe Exam Browser: SEB opens the exam in its own browser
  // with no saved session, so the student always lands on the login page first,
  // and the exam URL carries the per-attempt nonce that SEB's exam key is hashed
  // against. Losing the query string here would lose the nonce, and verification
  // would fail for every SEB student.
  const returnTo = `${location.pathname}${location.search}`;

  // Must have a token to be authenticated. Identity is checked on `_id`, not
  // email: students sign in with a UniversityUID or roll number and many have
  // no email address recorded at all.
  if (!token || !user._id) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(returnTo)}`} replace />;
  }

  // Read role from JWT payload (can't be tampered without the secret key)
  if (allowedRoles) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const tokenRole = payload.role;
      if (!allowedRoles.includes(tokenRole)) {
        return <Navigate to="/" replace />;
      }
    } catch {
      // Invalid token format — redirect to login
      return <Navigate to={`/login?redirect=${encodeURIComponent(returnTo)}`} replace />;
    }
  }

  return children;
};

// Admin Layout Component
const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex">
      <AdminSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
      <main className="flex-1">
        {/* Mobile Header with Hamburger */}
        <div className="lg:hidden bg-slate-800 p-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Admin Panel</h1>
            <button
              onClick={toggleSidebar}
              className="p-2 hover:bg-slate-700 rounded-md"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tests" element={<Tests />} />
          <Route path="/tests/create" element={<CreateTest />} />
          <Route path="/dsa-practice" element={<AdminDSAPractice />} />
          <Route path="/users" element={<Users />} />
          <Route path="/proctoring" element={<AdminProctoring />} />
          <Route path="/view-test/:assignmentId" element={<ViewCompletedTest />} />
          <Route path="*" element={<div className="p-6">Not Found</div>} />
        </Routes>
      </main>
    </div>
  );
};

// Student Sidebar Context for desktop collapse and mobile drawer
export const StudentSidebarContext = React.createContext({
  sidebarOpen: false,
  toggleSidebar: () => {},
  isCollapsed: false,
  toggleCollapse: () => {},
});

export const useStudentSidebar = () => React.useContext(StudentSidebarContext);

// Student Layout Component with routes
const StudentRoutes = () => {
  const location = useLocation();
  const isTakeTest = location.pathname.includes('/take-test') || location.pathname.includes('/take-coding');

  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [isCollapsed, setIsCollapsed] = React.useState(() => {
    try {
      return localStorage.getItem("student_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("student_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  // Keyboard shortcut Cmd+B / Ctrl+B for macOS / Windows
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <StudentSidebarContext.Provider value={{ sidebarOpen, toggleSidebar, isCollapsed, toggleCollapse }}>
      <div className="h-[100dvh] bg-[#16181F] text-slate-100 flex overflow-hidden">
        {!isTakeTest && (
          <StudentSidebar
            isOpen={sidebarOpen}
            onToggle={toggleSidebar}
            isCollapsed={isCollapsed}
            onToggleCollapse={toggleCollapse}
          />
        )}
        <main
          className={`flex-1 min-w-0 h-[100dvh] overflow-y-auto ${isTakeTest ? "w-full" : ""}`}
          style={{
            transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
            willChange: "width, margin",
          }}
        >
          {/* Mobile Header with Hamburger */}
          {!isTakeTest && (
            <div className="mobile-header lg:hidden bg-[#191B22] p-4 border-b border-white/5">
              <div className="flex items-center justify-between">
                <h1 className="mobile-header-title text-lg font-bold">Student Portal</h1>
                <button
                  onClick={toggleSidebar}
                  className="mobile-hamburger-btn p-2 hover:bg-slate-700 rounded-md"
                  aria-label="Open menu"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          <Routes>
            <Route path="/" element={<StudentDashboard />} />
            <Route path="/assignments" element={<StudentAssignments />} />
            <Route path="/coding-tests" element={<StudentCodingTests />} />
            <Route path="/take-coding/:assignmentId" element={<TakeCodingTest />} />
            <Route path="/practice-tests" element={<PracticeTests />} />
            <Route path="/practice-test/:testId" element={<TakePracticeTest />} />
            <Route path="/practice-test-results/:testId" element={<PracticeTestResults />} />
            <Route path="/take-test/:assignmentId" element={<TakeTest />} />
            <Route path="/view-test/:assignmentId" element={<ViewCompletedTest />} />
            <Route path="/results" element={<StudentResults />} />
            <Route path="/profile" element={<StudentProfile />} />
            <Route path="*" element={<div className="p-6">Not Found</div>} />
          </Routes>
        </main>
      </div>
    </StudentSidebarContext.Provider>
  );
};

// Mentor Sidebar Context for desktop collapse and mobile drawer
export const MentorSidebarContext = React.createContext({
  sidebarOpen: false,
  toggleSidebar: () => {},
  isCollapsed: false,
  toggleCollapse: () => {},
});

export const useMentorSidebar = () => React.useContext(MentorSidebarContext);

// Mentor Layout Component with routes
const MentorRoutes = () => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [isCollapsed, setIsCollapsed] = React.useState(() => {
    try {
      return localStorage.getItem("mentor_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("mentor_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  // Keyboard shortcut Cmd+B / Ctrl+B for macOS / Windows
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <MentorSidebarContext.Provider value={{ sidebarOpen, toggleSidebar, isCollapsed, toggleCollapse }}>
      <div className="h-[100dvh] bg-[#16181F] text-slate-100 flex overflow-hidden">
        <MentorLayout
          isOpen={sidebarOpen}
          onToggle={toggleSidebar}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />
        <main
          className="flex-1 min-w-0 h-[100dvh] overflow-y-auto"
          style={{
            transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
            willChange: "width, margin",
          }}
        >
          {/* Mobile Header with Hamburger */}
          <div className="mobile-header lg:hidden bg-[#191B22] p-4 border-b border-white/5">
            <div className="flex items-center justify-between">
              <h1 className="mobile-header-title text-lg font-bold">Mentor Portal</h1>
              <button
                onClick={toggleSidebar}
                className="mobile-hamburger-btn p-2 hover:bg-slate-700 rounded-md"
                aria-label="Open menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>

          <Routes>
            <Route path="/" element={<MentorDashboard />} />
            <Route path="/assignments" element={<MentorAssignments />} />
            <Route path="/submissions" element={<MentorSubmissions />} />
            <Route path="/view-test/:assignmentId" element={<ViewCompletedTest />} />
            <Route path="*" element={<div className="p-6">Not Found</div>} />
          </Routes>
        </main>
      </div>
    </MentorSidebarContext.Provider>
  );
};

export default function App() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Where Safe Exam Browser is sent after a submit, so it closes itself and
          hands the machine back. Deliberately outside ProtectedRoute: SEB
          watches for this exact URL, and a bounce to /login would change it and
          leave the student stuck in a locked kiosk. */}
      <Route path="/student/seb-exit" element={<SebExit />} />

      {/* Admin Routes */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRoles={['Admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      />

      {/* Mentor Routes */}
      <Route
        path="/mentor/*"
        element={
          <ProtectedRoute allowedRoles={['Mentor']}>
            <MentorRoutes />
          </ProtectedRoute>
        }
      />

      {/* Student Routes */}
      <Route
        path="/student/*"
        element={
          <ProtectedRoute allowedRoles={['Student']}>
            <StudentRoutes />
          </ProtectedRoute>
        }
      />

      {/* Default redirect to login */}
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
