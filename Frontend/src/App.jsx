import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Tests from "./pages/Tests";
import Users from "./pages/Users";
import Assignments from "./pages/Assignments";
import Reviews from "./pages/Reviews";
import CreateTest from "./pages/CreateTest";
import Login from "./pages/Login";
import StudentDashboard from "./pages/StudentDashboard";
import StudentAssignments from "./pages/StudentAssignments";
import StudentResults from "./pages/StudentResults";
import TakeTest from "./pages/TakeTest";
import StudentLayout from "./components/StudentLayout";
import MentorLayout from "./components/MentorLayout";
import MentorAssignments from "./pages/MentorAssignments";
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
  return (
    <div className="min-h-screen bg-slate-900 text-white flex">
      <Sidebar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tests" element={<Tests />} />
          <Route path="/tests/create" element={<CreateTest />} />
          <Route path="/users" element={<Users />} />
          <Route path="/assignments" element={<Assignments />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="*" element={<div className="p-6">Not Found</div>} />
        </Routes>
      </main>
    </div>
  );
};

// Student Layout Component with routes
const StudentRoutes = () => {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex">
      <StudentLayout />
      <main className="flex-1">
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
          <Route path="/assignments" element={<MentorAssignments />} />
          <Route path="/submissions" element={<MentorSubmissions />} />
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
