import React from "react";
import { Link, useLocation } from "react-router-dom";

export default function MentorLayout() {
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="w-64 h-screen bg-slate-800 border-r border-slate-700 flex flex-col">
      <div className="p-6">
        <h1 className="text-xl font-bold text-white">Mentor Panel</h1>
      </div>
      
      <nav className="flex-1 px-4">
        <Link
          to="/mentor"
          className={`flex items-center px-4 py-3 mb-2 rounded-lg transition-colors ${
            isActive("/mentor") && !isActive("/mentor/assignments") && !isActive("/mentor/submissions")
              ? "bg-slate-700 text-white"
              : "text-slate-300 hover:bg-slate-700 hover:text-white"
          }`}
        >
          <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Dashboard
        </Link>
        
        <Link
          to="/mentor/assignments"
          className={`flex items-center px-4 py-3 mb-2 rounded-lg transition-colors ${
            isActive("/mentor/assignments")
              ? "bg-slate-700 text-white"
              : "text-slate-300 hover:bg-slate-700 hover:text-white"
          }`}
        >
          <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Test Assignments
        </Link>
        
        <Link
          to="/mentor/submissions"
          className={`flex items-center px-4 py-3 mb-2 rounded-lg transition-colors ${
            isActive("/mentor/submissions")
              ? "bg-slate-700 text-white"
              : "text-slate-300 hover:bg-slate-700 hover:text-white"
          }`}
        >
          <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Student Submissions
        </Link>
      </nav>
      
      <div className="p-4 mt-auto border-t border-slate-700">
        <button
          onClick={() => {
            localStorage.removeItem("user");
            window.location.href = "/login";
          }}
          className="w-full flex items-center px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </div>
    </aside>
  );
}
