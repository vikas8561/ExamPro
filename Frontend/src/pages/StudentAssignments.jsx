import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { Search, X as CloseIcon } from "lucide-react";
import apiRequest from "../services/api";
import { BASE_URL } from "../config/api";

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

const StudentAssignments = () => {
  const [assignments, setAssignments] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    // ✅ Fixed: Always fetch fresh data on component mount to show new assignments
    // Reduced cache time to 5 seconds for better responsiveness
    const now = Date.now();
    const shouldFetch = now - lastFetchTime > 5000; // 5 seconds cache instead of 30
    
    if (shouldFetch) {
      // Fetch data in parallel for better performance
      Promise.all([
        fetchAssignments(),
        fetchSubjects()
      ]).catch(error => {
        console.error("Error in parallel data fetching:", error);
      });
    } else {
      setLoading(false);
    }

    // Setup Socket.IO client - use the same base URL as API
    const socketUrl = BASE_URL; // Use BASE_URL from config
    const socket = io(socketUrl, {
      // ✅ Fixed: Add connection options for better cleanup
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000
    });

    let pollInterval = null;

    socket.on("connect", () => {
      // Join room with userId for targeted events
      const userId = localStorage.getItem("userId");
      if (userId) {
        socket.emit('join', userId);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      // Fallback: poll for updates every 30 seconds
      pollInterval = setInterval(() => {
        fetchAssignments();
      }, 30000);
    });

    socket.on("disconnect", (reason) => {
      // Clear fallback polling if it exists
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    });

    socket.on("assignmentCreated", (data) => {
      // Refresh assignments data
      fetchAssignments();
    });

    // ✅ Fixed: Proper cleanup function
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []); // ✅ Fixed: Empty dependency array to prevent recreation

  const fetchSubjects = async () => {
    try {
      const data = await apiRequest("/subjects/public");
      setSubjects(data.subjects || []);
    } catch (error) {
      console.error("Error fetching subjects:", error);
      // Fallback to extracting subjects from assignments if API fails
      setSubjects([]);
    }
  };

  const fetchAssignments = async (retryCount = 0) => {
    try {
      const startTime = Date.now();
      
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const data = await apiRequest("/assignments/student", {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const endTime = Date.now();
      
      
      setAssignments(data);
      setLastFetchTime(endTime);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      
      // Handle timeout errors
      if (error.name === 'AbortError') {
        if (retryCount === 0) {
          setTimeout(() => fetchAssignments(1), 1000);
          return;
        }
      }
      
      // Retry once if it's a network error and we haven't retried yet
      if (retryCount === 0 && (error.message?.includes('fetch') || error.message?.includes('network'))) {
        setTimeout(() => fetchAssignments(1), 1000);
        return;
      }
      
      // Don't show alert - just log the error and set empty array
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

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
    navigate(`/student/take-test/${assignmentId}`);
  };

  const filteredAssignments = assignments.filter((assignment) => {
    // Exclude coding tests from assigned tests section
    if (assignment.testId?.type === 'coding') {
      return false;
    }

    // Status filter
    if (statusFilter !== 'all' && assignment.status !== statusFilter) {
      return false;
    }

    // Type filter
    if (typeFilter !== 'all' && assignment.testId?.type !== typeFilter) {
      return false;
    }

    // Subject filter
    if (subjectFilter !== 'all' && assignment.testId?.subject !== subjectFilter) {
      return false;
    }

    // Search filter
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (assignment.testId?.title || '').toLowerCase().includes(term) ||
      (assignment.testId?.type || '').toLowerCase().includes(term) ||
      (assignment.mentorId?.name || '').toLowerCase().includes(term) ||
      assignment.status.toLowerCase().includes(term)
    );
  }).sort((a, b) => {
    // Sort so that currently assigned tests appear first, then by date (newest first)
    // Currently assigned means status "Assigned" or "In Progress" and test is active (not past deadline)
    const isActive = (assignment) => {
      if (!assignment.startTime || !assignment.duration) return false;
      const now = new Date();
      const start = new Date(assignment.startTime);
      const end = new Date(start.getTime() + assignment.duration * 60000);
      return now >= start && now <= end;
    };

    const aActive = (a.status === "Assigned" || a.status === "In Progress") && isActive(a);
    const bActive = (b.status === "Assigned" || b.status === "In Progress") && isActive(b);

    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;

    // If both active or both not active, sort by startTime descending (newest first)
    const aStart = new Date(a.startTime || 0);
    const bStart = new Date(b.startTime || 0);
    return bStart - aStart;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-xl">Loading assignments...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <style>{cardAnimationStyles}</style>
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="sticky top-0 z-50 relative mb-8">
          <div className="relative bg-slate-800/95 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-lg">
            {/* Title and Stats Row */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-700/60 rounded-xl">
                  <svg className="h-8 w-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-white">
                    Assigned Tests
                  </h1>
                  <p className="text-slate-400 text-sm mt-1">
                    {assignments.length} total assignments • {filteredAssignments.length} showing
                  </p>
                </div>
              </div>

              {/* Search Bar and Filter Button */}
              <div className="flex items-center gap-3">
                <div className="relative max-w-md w-full lg:w-80 group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-white transition-colors duration-200" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search tests..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-12 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500/50 focus:border-slate-500/50 transition-all duration-300 hover:bg-slate-700/60 hover:border-slate-500/50 backdrop-blur-sm"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-white transition-colors duration-200"
                      aria-label="Clear search"
                    >
                      <CloseIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>

                {/* Filter Button */}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-2 bg-slate-700/60 hover:bg-slate-700/80 text-white px-4 py-3 rounded-xl font-medium transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filter
                  <svg className={`h-4 w-4 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Filter Section */}
            {showFilters && (
              <div className="border-t border-slate-700/50 pt-6">
                <div className="flex flex-wrap gap-4 items-center">
                  {/* Status Filter */}
                  <div className="flex items-center gap-3 bg-slate-700/30 rounded-lg px-4 py-2 hover:bg-slate-700/50 transition-colors duration-200">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                      <label className="text-sm font-medium text-slate-300">Status:</label>
                    </div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="bg-transparent border-none text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-md px-2 py-1 transition-all duration-200"
                    >
                      <option value="all" className="bg-slate-700">All Status</option>
                      <option value="Assigned" className="bg-slate-700">Assigned</option>
                      <option value="In Progress" className="bg-slate-700">In Progress</option>
                      <option value="Completed" className="bg-slate-700">Completed</option>
                      <option value="Overdue" className="bg-slate-700">Overdue</option>
                    </select>
                  </div>

                  {/* Type Filter */}
                  <div className="flex items-center gap-3 bg-slate-700/30 rounded-lg px-4 py-2 hover:bg-slate-700/50 transition-colors duration-200">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                      <label className="text-sm font-medium text-slate-300">Type:</label>
                    </div>
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="bg-transparent border-none text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-md px-2 py-1 transition-all duration-200"
                    >
                      <option value="all" className="bg-slate-700">All Types</option>
                      <option value="Quiz" className="bg-slate-700">Quiz</option>
                      <option value="Exam" className="bg-slate-700">Exam</option>
                      <option value="Practice" className="bg-slate-700">Practice</option>
                    </select>
                  </div>

                  {/* Subject Filter */}
                  <div className="flex items-center gap-3 bg-slate-700/30 rounded-lg px-4 py-2 hover:bg-slate-700/50 transition-colors duration-200">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                      <label className="text-sm font-medium text-slate-300">Subject:</label>
                    </div>
                    <select
                      value={subjectFilter}
                      onChange={(e) => setSubjectFilter(e.target.value)}
                      className="bg-transparent border-none text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-md px-2 py-1 transition-all duration-200"
                    >
                      <option value="all" className="bg-slate-700">All Subjects</option>
                      {subjects.map(subject => (
                        <option key={subject._id} value={subject.name} className="bg-slate-700">{subject.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Clear Filters Button */}
                  {(statusFilter !== 'all' || typeFilter !== 'all' || subjectFilter !== 'all' || searchTerm) && (
                    <button
                      onClick={() => {
                        setStatusFilter('all');
                        setTypeFilter('all');
                        setSubjectFilter('all');
                        setSearchTerm('');
                      }}
                      className="flex items-center gap-2 bg-slate-700/60 hover:bg-slate-700/80 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {assignments.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-2xl text-slate-400 mb-4">No assignments found</div>
            <p className="text-slate-500">You don't have any test assignments yet.</p>
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-2xl text-slate-400 mb-4">No assignments match your search</div>
            <p className="text-slate-500">Try adjusting your search terms.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAssignments.map((assignment, index) => (
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
                  {/* Header Section */}
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="p-3 bg-slate-800/70 rounded-xl shadow-sm group-hover:shadow-md transition-shadow duration-300 flex-shrink-0">
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#22D3EE' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold mb-1.5 leading-tight transition-colors duration-200" style={{ color: '#E5E7EB' }}>
                          {assignment.testId?.title || "Test"}
                        </h3>
                        <p className="text-sm text-slate-400">Assigned Test</p>
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
                        <span className="text-slate-300 text-sm font-medium whitespace-nowrap">Type</span>
                      </div>
                      <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center">
                        {assignment.testId?.type || "Test"}
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
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                        onTimerComplete={() => fetchAssignments()} 
                      />
                    </div>
                  )}
                  
                  {assignment.status === "Assigned" && isTestAvailable(assignment.startTime, assignment.duration) && (
                    <button
                      onClick={() => {
                        handleStartTest(assignment._id);
                      }}
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
                      Start Test
                    </button>
                  )}
                  
                  

                  {assignment.status === "Assigned" && isDeadlinePassed(assignment.startTime, assignment.duration) && (
                    <button
                      disabled
                      className="w-full py-2.5 px-4 rounded-lg font-semibold opacity-70 cursor-not-allowed border"
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        color: '#FCA5A5',
                        borderColor: 'rgba(239, 68, 68, 0.3)'
                      }}
                    >
                      Deadline Passed
                    </button>
                  )}

                  {assignment.status === "In Progress" && (
                    isDeadlinePassed(assignment.startTime, assignment.duration) ? (
                      <button
                        onClick={() => {
                          navigate(`/student/view-test/${assignment._id}`);
                        }}
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
                        View Results
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          navigate(`/student/take-test/${assignment._id}`);
                        }}
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
                        Continue Test
                      </button>
                    )
                  )}
                  

                  {assignment.status === "Completed" && (
                    isDeadlinePassed(assignment.startTime, assignment.duration) ? (
                      assignment.reviewStatus === "Reviewed" ? (
                        <button
                          onClick={() => {
                            navigate(`/student/view-test/${assignment._id}`);
                          }}
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
                          View Results
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            navigate(`/student/view-test/${assignment._id}`);
                          }}
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
                          View Submission
                        </button>
                      )
                    ) : (
                      <button
                        disabled
                        className="w-full py-2.5 px-4 rounded-lg font-semibold opacity-70 cursor-not-allowed border"
                        style={{
                          backgroundColor: 'rgba(37, 99, 235, 0.1)',
                          color: '#94A3B8',
                          borderColor: 'rgba(37, 99, 235, 0.2)'
                        }}
                      >
                        Results Available After Deadline
                      </button>
                    )
                  )}
                  

                  {assignment.status === "Overdue" && (
                    <button
                      disabled
                      className="w-full py-2.5 px-4 rounded-lg font-semibold opacity-70 cursor-not-allowed border"
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        color: '#FCA5A5',
                        borderColor: 'rgba(239, 68, 68, 0.3)'
                      }}
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
};

export default StudentAssignments;
