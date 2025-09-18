import React, { useEffect, useState, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Tests from "./pages/Tests";
import Users from "./pages/Users";

import CreateTest from "./pages/CreateTest";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import StudentDashboard from "./pages/StudentDashboard";
import StudentAssignments from "./pages/StudentAssignments";
import StudentResults from "./pages/StudentResults";
import TakeTest from "./pages/TakeTest";
import StudentSidebar from "./components/StudentSidebar";
import MentorLayout from "./components/MentorLayout";
import MentorAssignments from "./pages/MentorAssignments";
import MentorAssignmentsUltraFast from "./pages/MentorAssignmentsUltraFast";
import MentorDashboard from "./pages/MentorDashboard";
import MentorSubmissions from "./pages/MentorSubmissions";
import ViewCompletedTest from "./pages/ViewCompletedTest";

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  if (!user.email) {
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
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
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
      <main className="flex-1">
        {/* Mobile Header with Hamburger */}
        <div className="lg:hidden bg-slate-800 p-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Proctoring App</h1>
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
          <Route path="/users" element={<Users />} />
          <Route path="*" element={<div className="p-6">Not Found</div>} />
        </Routes>
      </main>
    </div>
  );
};

// Student Layout Component with routes
const StudentRoutes = () => {
  const location = useLocation();
  const isTakeTest = location.pathname.includes('/take-test');

  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex">
      {!isTakeTest && <StudentSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />}
      <main className={`flex-1 ${isTakeTest ? 'w-full' : ''}`}>
        {/* Mobile Header with Hamburger */}
        {!isTakeTest && (
          <div className="lg:hidden bg-slate-800 p-4 border-b border-slate-700">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold">Student Portal</h1>
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
        )}

        <Routes>
          <Route path="/" element={<StudentDashboard />} />
          <Route path="/assignments" element={<StudentAssignments />} />
          <Route path="/take-test/:assignmentId" element={<TakeTest />} />
          <Route path="/view-test/:assignmentId" element={<ViewCompletedTest />} />
          <Route path="/results" element={<StudentResults />} />
          <Route path="*" element={<div className="p-6">Not Found</div>} />
        </Routes>
      </main>
    </div>
  );
};

// Mentor Layout Component with routes
const MentorRoutes = () => {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex">
      <MentorLayout />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<MentorDashboard />} />
          <Route path="/assignments" element={<MentorAssignmentsUltraFast />} />
          <Route path="/submissions" element={<MentorSubmissions />} />
          <Route path="/view-test/:assignmentId" element={<ViewCompletedTest />} />
          <Route path="*" element={<div className="p-6">Not Found</div>} />
        </Routes>
      </main>
    </div>
  );
};

export default function App() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

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
