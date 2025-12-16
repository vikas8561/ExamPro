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

  const getStatusStyle = (status) => {
    const baseStyle = {
      backgroundColor: 'rgba(34, 211, 238, 0.1)',
      borderColor: 'rgba(34, 211, 238, 0.3)',
      color: '#67E8F9' // cyan-300
    };

    switch (status) {
      case "Assigned":
        return { ...baseStyle, color: '#7DD3FC' }; // cyan-300
      case "In Progress":
        return { ...baseStyle, color: '#22D3EE', backgroundColor: 'rgba(34, 211, 238, 0.15)' }; // cyan-400, slightly brighter
      case "Completed":
        return { ...baseStyle, color: '#67E8F9' }; // cyan-300
      case "Overdue":
        return { ...baseStyle, color: '#A5F3FC', backgroundColor: 'rgba(34, 211, 238, 0.08)' }; // cyan-200, lighter
      default:
        return baseStyle;
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
        {/* Header Section */}
        <div className="sticky top-0 z-50 relative mb-8">
          <div className="relative bg-slate-800/95 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-800/70 rounded-xl shadow-sm">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#22D3EE' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">
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
                className="group relative backdrop-blur-sm rounded-2xl p-6 border transition-all duration-300 cursor-pointer animate-slide-in-up overflow-hidden"
                style={{ 
                  animationDelay: `${index * 100}ms`,
                  backgroundColor: '#0B1220',
                  borderColor: 'rgba(34, 211, 238, 0.2)',
                  boxShadow: '0 0 0 rgba(34, 211, 238, 0)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.4)';
                  e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(34, 211, 238, 0.1), 0 10px 10px -5px rgba(34, 211, 238, 0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.2)';
                  e.currentTarget.style.boxShadow = '0 0 0 rgba(34, 211, 238, 0)';
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                {/* Subtle gradient overlay on hover */}
                <div className="absolute inset-0 rounded-2xl transition-all duration-300 pointer-events-none opacity-0 group-hover:opacity-100" style={{ background: 'linear-gradient(to bottom right, rgba(34, 211, 238, 0.05), rgba(34, 211, 238, 0.05))' }}></div>

                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="p-3 bg-slate-800/70 rounded-xl shadow-sm group-hover:shadow-md transition-shadow duration-300 flex-shrink-0">
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#22D3EE' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold mb-1.5 leading-tight transition-colors duration-200" style={{ color: '#E5E7EB' }}>
                          {assignment.testId?.title || "Coding Test"}
                        </h3>
                        <p className="text-sm text-slate-400">Coding Challenge</p>
                      </div>
                    </div>
                    <span 
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold ml-3 flex-shrink-0 shadow-sm border"
                      style={getStatusStyle(assignment.status)}
                    >
                      {assignment.status}
                    </span>
                  </div>

                  {/* Test Details - Improved Design with Fixed Widths */}
                  <div className="space-y-2.5 mb-6">
                    <div className="flex items-center justify-between p-3.5 bg-slate-900/70 rounded-xl border border-slate-800/50 hover:bg-slate-900/80 transition-all duration-200 group/item">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-2 bg-slate-800/70 rounded-lg shadow-sm flex-shrink-0">
                          <svg className="h-4 w-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm font-medium whitespace-nowrap">Subject</span>
                      </div>
                      <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center">
                        {assignment.testId?.subject || "General"}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between p-3.5 bg-slate-900/70 rounded-xl border border-slate-800/50 hover:bg-slate-900/80 transition-all duration-200 group/item">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-2 bg-slate-800/70 rounded-lg shadow-sm flex-shrink-0">
                          <svg className="h-4 w-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm font-medium whitespace-nowrap">Time Limit</span>
                      </div>
                      <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center">
                        {assignment.testId?.timeLimit} min
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3.5 bg-slate-900/70 rounded-xl border border-slate-800/50 hover:bg-slate-900/80 transition-all duration-200 group/item">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-2 bg-slate-800/70 rounded-lg shadow-sm flex-shrink-0">
                          <svg className="h-4 w-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm font-medium whitespace-nowrap">Questions</span>
                      </div>
                      <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center">
                        {assignment.testId?.questionCount || 0}
                      </span>
                    </div>
                  </div>

                  {/* Mentor and Score Info */}
                  {(assignment.mentorId || assignment.score !== null) && (
                    <div className="mb-6 pt-4 border-t border-slate-800/50 space-y-2.5">
                      {assignment.mentorId && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-400 whitespace-nowrap">Mentor:</span>
                          <span className="text-gray-200 font-medium text-right ml-4 truncate">{assignment.mentorId?.name || "Not assigned"}</span>
                        </div>
                      )}
                      {assignment.score !== null && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-400 whitespace-nowrap">Score:</span>
                          <span className="text-gray-100 font-bold text-base">{assignment.score}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons Section */}
                <div className="mt-6 pt-4" style={{ borderTop: '1px solid rgba(34, 211, 238, 0.2)' }}>
                  {assignment.status === "Assigned" && isTestNotStarted(assignment.startTime) && (
                    <div className="mb-4">
                      <CountdownTimer
                        startTime={assignment.startTime}
                        onTimerComplete={() => window.location.reload()}
                      />
                    </div>
                  )}

                  {assignment.status === "Assigned" && isTestAvailable(assignment.startTime, assignment.duration) && (
                    <button
                      onClick={() => handleStartTest(assignment._id)}
                      className="w-full py-2.5 px-4 rounded-lg font-semibold transition-all cursor-pointer shadow-sm hover:shadow-md"
                      style={{ 
                        backgroundColor: '#22D3EE',
                        color: '#020617',
                        border: '2px solid transparent',
                        zIndex: 9999,
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '0.9';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                    >
                      Start Coding Challenge
                    </button>
                  )}

                  {assignment.status === "Assigned" && isDeadlinePassed(assignment.startTime, assignment.duration) && (
                    <button
                      disabled
                      className="w-full bg-red-600/40 text-red-300 py-2.5 px-4 rounded-lg font-semibold opacity-70 cursor-not-allowed border border-red-600/30"
                    >
                      Deadline Passed
                    </button>
                  )}

                  {assignment.status === "In Progress" && (
                    isDeadlinePassed(assignment.startTime, assignment.duration) ? (
                      <button
                        onClick={() => nav(`/student/view-test/${assignment._id}`)}
                        className="w-full bg-green-600/80 hover:bg-green-600 text-white py-2.5 px-4 rounded-lg font-semibold transition-colors cursor-pointer shadow-sm hover:shadow-md"
                        style={{ border: '2px solid transparent', zIndex: 9999, position: 'relative' }}
                      >
                        View Results
                      </button>
                    ) : (
                      <button
                        onClick={() => nav(`/student/take-coding/${assignment._id}`)}
                        className="w-full py-2.5 px-4 rounded-lg font-semibold transition-all cursor-pointer shadow-sm hover:shadow-md"
                        style={{ 
                          backgroundColor: '#22D3EE',
                          color: '#020617',
                          border: '2px solid transparent',
                          zIndex: 9999,
                          position: 'relative'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = '0.9';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = '1';
                        }}
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
                          className="w-full bg-green-600/80 hover:bg-green-600 text-white py-2.5 px-4 rounded-lg font-semibold transition-colors cursor-pointer shadow-sm hover:shadow-md"
                          style={{ border: '2px solid transparent', zIndex: 9999, position: 'relative' }}
                        >
                          View Results
                        </button>
                      ) : (
                        <button
                          onClick={() => nav(`/student/view-test/${assignment._id}`)}
                          className="w-full bg-amber-600/80 hover:bg-amber-600 text-white py-2.5 px-4 rounded-lg font-semibold transition-colors cursor-pointer shadow-sm hover:shadow-md"
                          style={{ border: '2px solid transparent', zIndex: 9999, position: 'relative' }}
                        >
                          View Submission
                        </button>
                      )
                    ) : (
                      <button
                        disabled
                        className="w-full bg-slate-600/50 text-slate-300 py-2.5 px-4 rounded-lg font-semibold opacity-70 cursor-not-allowed border border-slate-600/40"
                      >
                        Results Available After Deadline
                      </button>
                    )
                  )}

                  {assignment.status === "Overdue" && (
                    <button
                      disabled
                      className="w-full bg-red-600/40 text-red-300 py-2.5 px-4 rounded-lg font-semibold opacity-70 cursor-not-allowed border border-red-600/30"
                    >
                      Deadline Passed
                    </button>
                  )}
                </div>

                {/* Date Information */}
                {(assignment.startedAt || assignment.completedAt) && (
                  <div className="mt-4 pt-3 border-t border-slate-800/40 space-y-1.5">
                    {assignment.startedAt && (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>Started: {new Date(assignment.startedAt).toLocaleDateString()}</span>
                      </div>
                    )}
                    {assignment.completedAt && (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Completed: {new Date(assignment.completedAt).toLocaleDateString()}</span>
                      </div>
                    )}
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


