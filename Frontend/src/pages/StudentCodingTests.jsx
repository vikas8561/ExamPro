import React, { useEffect, useState } from 'react';
import apiRequest from '../services/api';
import { Link, useNavigate } from 'react-router-dom';

// Add custom styles for card animations
const cardAnimationStyles = `
  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-slide-in-up {
    animation: slideInUp 0.6s ease-out forwards;
    opacity: 0;
  }
`;

// Custom Countdown Timer Component
const CountdownTimer = ({ startTime, onTimerComplete }) => {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  function calculateTimeLeft() {
    const now = new Date();
    const start = new Date(startTime);
    const difference = start - now;

    if (difference <= 0) {
      return { completed: true };
    }

    return {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
      completed: false
    };
  }

  useEffect(() => {
    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft();
      setTimeLeft(newTimeLeft);

      if (newTimeLeft.completed) {
        clearInterval(timer);
        onTimerComplete();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime, onTimerComplete]);

  if (timeLeft.completed) {
    return (
      <div className="text-green-400 font-semibold text-center">
        Test is now available!
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="text-sm text-slate-400 mb-2">Test will start in:</div>
      <div className="flex justify-center space-x-2">
        {timeLeft.days > 0 && (
          <div className="bg-slate-700 px-2 py-1 rounded">
            <div className="text-lg font-bold">{timeLeft.days}</div>
            <div className="text-xs">days</div>
          </div>
        )}
        <div className="bg-slate-700 px-2 py-1 rounded">
          <div className="text-lg font-bold">{String(timeLeft.hours).padStart(2, '0')}</div>
          <div className="text-xs">hours</div>
        </div>
        <div className="bg-slate-700 px-2 py-1 rounded">
          <div className="text-lg font-bold">{String(timeLeft.minutes).padStart(2, '0')}</div>
          <div className="text-xs">min</div>
        </div>
        <div className="bg-slate-700 px-2 py-1 rounded">
          <div className="text-lg font-bold">{String(timeLeft.seconds).padStart(2, '0')}</div>
          <div className="text-xs">sec</div>
        </div>
      </div>
    </div>
  );
};

export default function StudentCodingTests() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const allAssignments = await apiRequest('/assignments/student');
        const codingAssignments = (allAssignments || []).filter(a => a.testId?.type === 'coding');
        setTests(codingAssignments);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return "Not scheduled";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isDeadlinePassed = (startTime, duration) => {
    if (!startTime || !duration) return false;
    const currentTime = new Date();
    const startTimeDate = new Date(startTime);
    const endTime = new Date(startTimeDate.getTime() + duration * 60000);
    return currentTime >= endTime;
  };

  const isTestAvailable = (startTime, duration) => {
    if (!startTime || !duration) return false;
    const currentTime = new Date();
    const startTimeDate = new Date(startTime);
    const endTime = new Date(startTimeDate.getTime() + duration * 60000);
    return currentTime >= startTimeDate && currentTime <= endTime;
  };

  const isTestNotStarted = (startTime) => {
    if (!startTime) return false;
    const currentTime = new Date();
    const startTimeDate = new Date(startTime);
    return currentTime < startTimeDate;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Assigned": return "bg-yellow-900/50 text-yellow-300";
      case "In Progress": return "bg-blue-900/50 text-blue-300";
      case "Completed": return "bg-green-900/50 text-green-300";
      case "Overdue": return "bg-red-900/50 text-red-300";
      default: return "bg-gray-900/50 text-gray-300";
    }
  };

  const handleStartTest = (assignmentId) => {
    // Navigate to take test page where permissions will be requested
    nav(`/student/take-coding/${assignmentId}`);
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <style>{cardAnimationStyles}</style>
      <div className="max-w-6xl mx-auto">
        {/* Header Section with Gradient Background */}
        <div className="sticky top-0 z-50 relative mb-8">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 via-pink-600/10 to-indigo-600/10 rounded-2xl blur-xl"></div>
          <div className="relative bg-slate-800/95 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg">
                <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                  Coding Tests
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                  {tests.length} coding test{tests.length !== 1 ? 's' : ''} available
                </p>
              </div>
            </div>
          </div>
        </div>

        {tests.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-2xl text-slate-400 mb-4">No coding tests available</div>
            <p className="text-slate-500">You don't have any coding test assignments yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tests.map((assignment, index) => (
              <div
                key={assignment._id}
                className="group relative bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 hover:border-purple-500/50 transition-all duration-500 transform hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/10 cursor-pointer animate-slide-in-up"
                style={{ animationDelay: `${index * 100}ms` }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                {/* Animated Background Gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-pink-500/5 to-indigo-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                {/* Floating Elements */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-2 group-hover:translate-y-0">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                </div>

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3 ml-1">
                      <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg shadow-lg group-hover:shadow-purple-500/25 transition-all duration-300 transform group-hover:rotate-6">
                        <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white group-hover:text-purple-300 transition-colors duration-300">
                          {assignment.testId?.title || "Coding Test"}
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">Coding Challenge</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(assignment.status)} border border-current/30 backdrop-blur-sm`}>
                      {assignment.status}
                    </span>
                  </div>

                  {/* Test Details with Enhanced Badges */}
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-700/20 to-slate-600/20 rounded-xl hover:from-purple-500/10 hover:to-pink-500/10 border border-slate-600/30 hover:border-purple-400/50 transition-all duration-300 group/item transform hover:scale-[1.02]">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg shadow-lg group-hover/item:shadow-purple-500/25 transition-all duration-300 transform group-hover/item:rotate-12">
                          <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm font-medium">Subject</span>
                      </div>
                      <span className="px-3 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 rounded-full text-sm font-semibold border border-purple-400/30 group-hover/item:from-purple-500/30 group-hover/item:to-pink-500/30 group-hover/item:text-purple-200 transition-all duration-300">
                        {assignment.testId?.subject || "General"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-700/20 to-slate-600/20 rounded-xl hover:from-amber-500/10 hover:to-orange-500/10 border border-slate-600/30 hover:border-amber-400/50 transition-all duration-300 group/item transform hover:scale-[1.02]">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg shadow-lg group-hover/item:shadow-amber-500/25 transition-all duration-300 transform group-hover/item:rotate-12">
                          <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm font-medium">Time Limit</span>
                      </div>
                      <span className="px-3 py-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 rounded-full text-sm font-semibold border border-amber-400/30 group-hover/item:from-amber-500/30 group-hover/item:to-orange-500/30 group-hover/item:text-amber-200 transition-all duration-300">
                        {assignment.testId?.timeLimit} min
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-700/20 to-slate-600/20 rounded-xl hover:from-cyan-500/10 hover:to-blue-500/10 border border-slate-600/30 hover:border-cyan-400/50 transition-all duration-300 group/item transform hover:scale-[1.02]">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg shadow-lg group-hover/item:shadow-cyan-500/25 transition-all duration-300 transform group-hover/item:rotate-12">
                          <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm font-medium">Questions</span>
                      </div>
                      <span className="px-3 py-1 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 rounded-full text-sm font-semibold border border-cyan-400/30 group-hover/item:from-cyan-500/30 group-hover/item:to-blue-500/30 group-hover/item:text-cyan-200 transition-all duration-300">
                        {assignment.testId?.questionCount || 0}
                      </span>
                    </div>
                  </div>

                  {assignment.mentorId && (
                    <div className="flex justify-between text-sm mb-3">
                      <span className="text-slate-400">Mentor:</span>
                      <span className="text-slate-300">{assignment.mentorId?.name || "Not assigned"}</span>
                    </div>
                  )}

                  {assignment.score !== null && (
                    <div className="flex justify-between text-sm mb-3">
                      <span className="text-slate-400">Score:</span>
                      <span className="font-semibold text-green-400">{assignment.score}%</span>
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  {assignment.status === "Assigned" && isTestNotStarted(assignment.startTime) && (
                    <CountdownTimer
                      startTime={assignment.startTime}
                      onTimerComplete={() => window.location.reload()}
                    />
                  )}

                  {assignment.status === "Assigned" && isTestAvailable(assignment.startTime, assignment.duration) && (
                    <button
                      onClick={() => handleStartTest(assignment._id)}
                      className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white py-3 px-4 rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                      style={{ border: '2px solid transparent', zIndex: 9999, position: 'relative' }}
                    >
                      Start Coding Challenge
                    </button>
                  )}

                  {assignment.status === "Assigned" && isDeadlinePassed(assignment.startTime, assignment.duration) && (
                    <button
                      disabled
                      className="w-full bg-red-600 text-white py-3 px-4 rounded-xl font-semibold opacity-50 cursor-not-allowed"
                    >
                      Deadline Passed
                    </button>
                  )}

                  {assignment.status === "In Progress" && (
                    isDeadlinePassed(assignment.startTime, assignment.duration) ? (
                      <button
                        onClick={() => nav(`/student/view-test/${assignment._id}`)}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-xl font-semibold transition-colors cursor-pointer"
                        style={{ border: '2px solid green', zIndex: 9999, position: 'relative' }}
                      >
                        View Results
                      </button>
                    ) : (
                      <button
                        onClick={() => nav(`/student/take-coding/${assignment._id}`)}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white py-3 px-4 rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                        style={{ border: '2px solid transparent', zIndex: 9999, position: 'relative' }}
                      >
                        Continue Coding Challenge
                      </button>
                    )
                  )}

                  {assignment.status === "Completed" && (
                    isDeadlinePassed(assignment.startTime, assignment.duration) ? (
                      assignment.reviewStatus === "Reviewed" ? (
                        <button
                          onClick={() => nav(`/student/view-test/${assignment._id}`)}
                          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-xl font-semibold transition-colors"
                          style={{ border: '2px solid green', zIndex: 9999, position: 'relative' }}
                        >
                          View Results
                        </button>
                      ) : (
                        <button
                          onClick={() => nav(`/student/view-test/${assignment._id}`)}
                          className="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-3 px-4 rounded-xl font-semibold transition-colors cursor-pointer"
                          style={{ border: '2px solid yellow', zIndex: 9999, position: 'relative' }}
                        >
                          View Submission
                        </button>
                      )
                    ) : (
                      <button
                        disabled
                        className="w-full bg-gray-600 text-white py-3 px-4 rounded-xl font-semibold opacity-50 cursor-not-allowed"
                      >
                        Results Available After Deadline
                      </button>
                    )
                  )}

                  {assignment.status === "Overdue" && (
                    <button
                      disabled
                      className="w-full bg-red-600 text-white py-3 px-4 rounded-xl font-semibold opacity-50 cursor-not-allowed"
                    >
                      Deadline Passed
                    </button>
                  )}
                </div>

                {assignment.startedAt && (
                  <div className="mt-3 text-xs text-slate-400">
                    Started: {new Date(assignment.startedAt).toLocaleDateString()}
                  </div>
                )}

                {assignment.completedAt && (
                  <div className="mt-1 text-xs text-slate-400">
                    Completed: {new Date(assignment.completedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


