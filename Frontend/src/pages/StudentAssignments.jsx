import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { Search, X as CloseIcon } from "lucide-react";
import apiRequest from "../services/api";
import { BASE_URL } from "../config/api";
import "../styles/StudentAssignments.mobile.css";

// Add custom styles for card animations and skeleton loaders
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
  
  @keyframes shimmer {
    0% {
      background-position: -1000px 0;
    }
    100% {
      background-position: 1000px 0;
    }
  }
  
  .skeleton {
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.05) 0%,
      rgba(255, 255, 255, 0.1) 50%,
      rgba(255, 255, 255, 0.05) 100%
    );
    background-size: 1000px 100%;
    animation: shimmer 2s infinite;
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
      <div className="countdown-text text-sm text-slate-400 mb-2">Test will start in:</div>
      <div className="countdown-timer flex justify-center space-x-2">
        {timeLeft.days > 0 && (
          <div className="countdown-unit bg-slate-700 px-2 py-1 rounded">
            <div className="countdown-unit-value text-lg font-bold">{timeLeft.days}</div>
            <div className="countdown-unit-label text-xs">days</div>
          </div>
        )}
        <div className="countdown-unit bg-slate-700 px-2 py-1 rounded">
          <div className="countdown-unit-value text-lg font-bold">{String(timeLeft.hours).padStart(2, '0')}</div>
          <div className="countdown-unit-label text-xs">hours</div>
        </div>
        <div className="countdown-unit bg-slate-700 px-2 py-1 rounded">
          <div className="countdown-unit-value text-lg font-bold">{String(timeLeft.minutes).padStart(2, '0')}</div>
          <div className="countdown-unit-label text-xs">min</div>
        </div>
        <div className="countdown-unit bg-slate-700 px-2 py-1 rounded">
          <div className="countdown-unit-value text-lg font-bold">{String(timeLeft.seconds).padStart(2, '0')}</div>
          <div className="countdown-unit-label text-xs">sec</div>
        </div>
      </div>
    </div>
  );
};

const StudentAssignments = () => {
  const [assignments, setAssignments] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(false); // Changed to false - don't block UI
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const navigate = useNavigate();
  const fetchInProgressRef = useRef(false); // Prevent duplicate requests

  useEffect(() => {
    // ✅ Fixed: Always fetch fresh data on component mount to show new assignments
    // Reduced cache time to 2 seconds for better responsiveness
    const now = Date.now();
    const shouldFetch = now - lastFetchTime > 2000; // 2 seconds cache for faster updates

    console.log(`🔄 useEffect triggered - shouldFetch: ${shouldFetch}, lastFetchTime: ${lastFetchTime}, now: ${now}`);

    if (shouldFetch) {
      // Fetch data in parallel for better performance
      console.log('📡 Starting parallel data fetch...');
      Promise.all([
        fetchAssignments(0, currentPage),
        fetchSubjects()
      ]).catch(error => {
        console.error("Error in parallel data fetching:", error);
      });
    } else {
      console.log('⏭️ Skipping fetch - within cache window');
      setLoading(false);
    }

    // Prevent multiple simultaneous requests
    let isMounted = true;

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
        fetchAssignments(0, currentPage);
      }, 30000);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      // Clear fallback polling if it exists
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      // Start fallback polling when disconnected
      pollInterval = setInterval(() => {
        console.log("🔄 Fallback polling: Refreshing assignments");
        fetchAssignments(0, currentPage);
      }, 30000); // Poll every 30 seconds as fallback
    });

    socket.on("assignmentCreated", (data) => {
      console.log("📨 Socket event received: assignmentCreated", data);
      // Force immediate refresh by resetting lastFetchTime and bypassing cache
      setLastFetchTime(0);
      // Force refresh by clearing fetchInProgress flag
      fetchInProgressRef.current = false;
      // Immediately fetch fresh data with forceRefresh flag
      fetchAssignments(0, currentPage, true);
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

  const fetchAssignments = async (retryCount = 0, page = currentPage, forceRefresh = false) => {
    // Prevent multiple simultaneous requests (unless force refresh)
    if (fetchInProgressRef.current && retryCount === 0 && !forceRefresh) {
      console.log('⏸️ Request already in progress, skipping duplicate request');
      return;
    }

    fetchInProgressRef.current = true;
    setLoading(true); // Set loading when starting fetch
    const controller = new AbortController();
    let timeoutId = null;

    try {
      const startTime = Date.now();

      // Add timeout to prevent hanging requests (increased to 30 seconds to match backend response time)
      timeoutId = setTimeout(() => {
        controller.abort();
        console.warn('⏱️ Request timeout after 30 seconds');
      }, 30000); // 30 second timeout

      // Add forceRefresh parameter to bypass cache
      const forceRefreshParam = forceRefresh ? '&forceRefresh=true' : '';
      const data = await apiRequest(`/assignments/student?page=${page}&limit=9${typeFilter !== 'all' ? `&type=${typeFilter}` : ''}${forceRefreshParam}`, {
        signal: controller.signal
      });

      if (timeoutId) clearTimeout(timeoutId);
      const endTime = Date.now();
      const requestTime = endTime - startTime;

      console.log(`✅ Assignment fetch completed in ${requestTime}ms`);

      // Handle paginated response
      if (data && data.assignments && data.pagination) {
        // Debug: Log what we received
        const statusCounts = data.assignments.reduce((acc, a) => {
          acc[a.status] = (acc[a.status] || 0) + 1;
          return acc;
        }, {});
        const typeCounts = data.assignments.reduce((acc, a) => {
          const type = a.testId?.type || 'unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {});
        console.log(`📋 Received ${data.assignments.length} assignments - Status:`, statusCounts, 'Types:', typeCounts);

        setAssignments(data.assignments);
        setCurrentPage(data.pagination.currentPage);
        setTotalPages(data.pagination.totalPages);
        setTotalItems(data.pagination.totalItems);
      } else {
        // Fallback for non-paginated response (backward compatibility)
        setAssignments(data || []);
      }
      setLastFetchTime(endTime);
      fetchInProgressRef.current = false;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      fetchInProgressRef.current = false;

      // Don't log AbortError as it's expected when timeout occurs
      if (error.name !== 'AbortError') {
        console.error("Error fetching assignments:", error);
      }

      // Handle timeout errors - don't retry immediately, wait longer
      if (error.name === 'AbortError') {
        if (retryCount === 0) {
          console.log('⏳ Request aborted, will retry in 2 seconds...');
          setTimeout(() => fetchAssignments(1, page), 2000);
          return;
        } else {
          console.error('❌ Request failed after retry');
        }
      }

      // Retry once if it's a network error and we haven't retried yet
      if (retryCount === 0 && (error.message?.includes('fetch') || error.message?.includes('network'))) {
        setTimeout(() => fetchAssignments(1, page), 2000);
        return;
      }

      // Don't show alert - just log the error and set empty array
      if (retryCount > 0) {
        setAssignments([]);
        setTotalPages(1);
        setTotalItems(0);
      }
    } finally {
      setLoading(false);
      fetchInProgressRef.current = false;
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
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      borderColor: 'rgba(255, 255, 255, 0.3)',
      color: '#FFFFFF'
    };

    switch (status) {
      case "Assigned":
        return { ...baseStyle, color: '#FFFFFF' };
      case "In Progress":
        return { ...baseStyle, color: '#FFFFFF', backgroundColor: 'rgba(255, 255, 255, 0.15)' };
      case "Completed":
        return { ...baseStyle, color: '#FFFFFF' };
      case "Overdue":
        return { ...baseStyle, color: '#FFFFFF', backgroundColor: 'rgba(255, 255, 255, 0.08)' };
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
    // Coding tests should only appear in the "Coding Tests" section
    if (assignment.testId?.type === 'coding') {
      return false;
    }

    // Status filter - show all statuses when filter is 'all'
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
    // Sort by date and time order (newest first)
    // Primary sort: startTime (when test starts)
    // Secondary sort: createdAt (when assignment was created)
    const aStart = new Date(a.startTime || a.createdAt || 0);
    const bStart = new Date(b.startTime || b.createdAt || 0);

    // If startTime is the same, sort by createdAt
    if (aStart.getTime() === bStart.getTime()) {
      const aCreated = new Date(a.createdAt || 0);
      const bCreated = new Date(b.createdAt || 0);
      return bCreated - aCreated; // Newest first
    }

    return bStart - aStart; // Newest first
  });

  // Debug: Log filtered results
  useEffect(() => {
    if (filteredAssignments.length > 0 || assignments.length > 0) {
      const filteredStatusCounts = filteredAssignments.reduce((acc, a) => {
        acc[a.status] = (acc[a.status] || 0) + 1;
        return acc;
      }, {});
      const filteredTypeCounts = filteredAssignments.reduce((acc, a) => {
        const type = a.testId?.type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
      console.log(`🔍 Filtered ${filteredAssignments.length}/${assignments.length} assignments - Status:`, filteredStatusCounts, 'Types:', filteredTypeCounts, 'Filters:', { statusFilter, typeFilter, subjectFilter, searchTerm });
    }
  }, [filteredAssignments, assignments, statusFilter, typeFilter, subjectFilter, searchTerm]);

  // Removed blocking loading screen - UI loads immediately

  return (
    <div className="student-assignments-mobile min-h-screen bg-slate-900 text-white p-6">
      <style>{cardAnimationStyles}</style>
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="header-section sticky top-0 z-50 relative mb-8">
          <div className="header-container relative bg-slate-800/95 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-lg">
            {/* Title and Stats Row */}
            <div className="title-section flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
              <div className="flex items-center gap-4">
                <div className="title-icon-container p-3 bg-slate-700/60 rounded-xl">
                  <svg className="h-8 w-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="title-text">
                  <h1 className="text-3xl font-bold text-white">
                    Assigned Tests
                  </h1>
                  <p className="text-slate-400 text-sm mt-1">
                    {totalItems > 0 ? `${totalItems} total assignments` : `${assignments.length} assignments`} • {filteredAssignments.length} showing
                  </p>
                </div>
              </div>

              {/* Search Bar and Filter Button */}
              <div className="search-filter-section flex items-center gap-3">
                <div className="search-container relative max-w-md w-full lg:w-80 group">
                  <div className="search-icon absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 transition-colors duration-200" style={{ color: '#FFFFFF' }} />
                  </div>
                  <input
                    type="text"
                    placeholder="Search tests..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input w-full pl-12 pr-12 py-3 rounded-xl focus:outline-none transition-all duration-300"
                    style={{
                      backgroundColor: '#1E293B',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      color: '#FFFFFF',
                      boxShadow: 'none'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                      e.currentTarget.style.boxShadow = '0 0 0 2px rgba(255, 255, 255, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    onMouseEnter={(e) => {
                      if (document.activeElement !== e.currentTarget) {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (document.activeElement !== e.currentTarget) {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                      }
                    }}
                  />
                  <style>{`
                    input::placeholder {
                      color: #9CA3AF !important;
                      opacity: 1;
                    }
                  `}</style>
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="search-clear-btn absolute inset-y-0 right-0 pr-4 flex items-center transition-colors duration-200"
                      style={{ color: '#FFFFFF' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#E5E7EB';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#FFFFFF';
                      }}
                      aria-label="Clear search"
                    >
                      <CloseIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>

                {/* Filter Button */}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="filter-button flex items-center gap-2 bg-slate-700/60 hover:bg-slate-700/80 text-white px-4 py-3 rounded-xl font-medium transition-all duration-200 shadow-sm hover:shadow-md"
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
              <div className="filter-panel border-t border-slate-700/50 pt-6">
                <div className="filter-row flex flex-wrap gap-4 items-center">
                  {/* Status Filter */}
                  <div className="filter-item flex items-center gap-3 bg-slate-700/30 rounded-lg px-4 py-2 hover:bg-slate-700/50 transition-colors duration-200">
                    <div className="filter-label-row flex items-center gap-2">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                      <label className="text-sm font-medium text-slate-300">Status:</label>
                    </div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="filter-select bg-transparent border-none text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-md px-2 py-1 transition-all duration-200"
                    >
                      <option value="all" className="bg-slate-700">All Status</option>
                      <option value="Assigned" className="bg-slate-700">Assigned</option>
                      <option value="In Progress" className="bg-slate-700">In Progress</option>
                      <option value="Completed" className="bg-slate-700">Completed</option>
                      <option value="Overdue" className="bg-slate-700">Overdue</option>
                    </select>
                  </div>

                  {/* Type Filter */}
                  <div className="filter-item flex items-center gap-3 bg-slate-700/30 rounded-lg px-4 py-2 hover:bg-slate-700/50 transition-colors duration-200">
                    <div className="filter-label-row flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                      <label className="text-sm font-medium text-slate-300">Type:</label>
                    </div>
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="filter-select bg-transparent border-none text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-md px-2 py-1 transition-all duration-200"
                    >
                      <option value="all" className="bg-slate-700">All Types</option>
                      <option value="Quiz" className="bg-slate-700">Quiz</option>
                      <option value="Exam" className="bg-slate-700">Exam</option>
                      <option value="Practice" className="bg-slate-700">Practice</option>
                    </select>
                  </div>

                  {/* Subject Filter */}
                  <div className="filter-item flex items-center gap-3 bg-slate-700/30 rounded-lg px-4 py-2 hover:bg-slate-700/50 transition-colors duration-200">
                    <div className="filter-label-row flex items-center gap-2">
                      <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                      <label className="text-sm font-medium text-slate-300">Subject:</label>
                    </div>
                    <select
                      value={subjectFilter}
                      onChange={(e) => setSubjectFilter(e.target.value)}
                      className="filter-select bg-transparent border-none text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 rounded-md px-2 py-1 transition-all duration-200"
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
                      className="clear-filters-button flex items-center gap-2 bg-slate-700/60 hover:bg-slate-700/80 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md"
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

        {loading ? (
          <div className="cards-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(9)].map((_, index) => (
              <div
                key={`skeleton-${index}`}
                className="skeleton-card relative backdrop-blur-sm rounded-2xl p-6 border overflow-hidden"
                style={{
                  backgroundColor: '#0B1220',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                }}
              >
                {/* Header Skeleton */}
                <div className="mb-3" style={{ height: '85px' }}>
                  <div className="flex items-start gap-3 h-full">
                    <div className="p-3 rounded-xl skeleton" style={{ width: '48px', height: '48px' }}></div>
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="skeleton rounded-lg mb-2" style={{ height: '24px', width: '80%' }}></div>
                      <div className="skeleton rounded-lg" style={{ height: '20px', width: '60%' }}></div>
                    </div>
                    <div className="skeleton rounded-lg" style={{ width: '80px', height: '28px' }}></div>
                  </div>
                </div>

                {/* Details Skeleton */}
                <div className="space-y-2.5 mb-6">
                  <div className="flex items-center gap-2">
                    <div className="skeleton rounded" style={{ width: '16px', height: '16px' }}></div>
                    <div className="skeleton rounded-lg" style={{ height: '16px', width: '120px' }}></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="skeleton rounded" style={{ width: '16px', height: '16px' }}></div>
                    <div className="skeleton rounded-lg" style={{ height: '16px', width: '100px' }}></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="skeleton rounded" style={{ width: '16px', height: '16px' }}></div>
                    <div className="skeleton rounded-lg" style={{ height: '16px', width: '140px' }}></div>
                  </div>
                </div>

                {/* Button Skeleton */}
                <div className="mt-6 pt-4" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.2)' }}>
                  <div className="skeleton rounded-lg" style={{ height: '40px', width: '100%' }}></div>
                </div>
              </div>
            ))}
          </div>
        ) : assignments.length === 0 ? (
          <div className="empty-state text-center py-12">
            <div className="empty-state-title text-2xl text-slate-400 mb-4">No assignments found</div>
            <p className="empty-state-text text-slate-500">You don't have any test assignments yet.</p>
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="empty-state text-center py-12">
            <div className="empty-state-title text-2xl text-slate-400 mb-4">No assignments match your search</div>
            <p className="empty-state-text text-slate-500">Try adjusting your search terms.</p>
          </div>
        ) : (
          <div className="cards-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAssignments.map((assignment, index) => (
              <div
                key={assignment._id}
                className="assignment-card group relative backdrop-blur-sm rounded-2xl p-6 border transition-all duration-300 cursor-pointer animate-slide-in-up overflow-hidden"
                style={{
                  animationDelay: `${index * 100}ms`,
                  backgroundColor: '#0B1220',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  boxShadow: '0 0 0 rgba(255, 255, 255, 0)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                  e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(255, 255, 255, 0.1), 0 10px 10px -5px rgba(255, 255, 255, 0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.boxShadow = '0 0 0 rgba(255, 255, 255, 0)';
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                {/* Subtle gradient overlay on hover */}
                <div className="absolute inset-0 rounded-2xl transition-all duration-300 pointer-events-none opacity-0 group-hover:opacity-100" style={{ background: 'linear-gradient(to bottom right, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))' }}></div>

                <div className="relative z-10">
                  {/* Header Section */}
                  <div className="card-header mb-3" style={{ height: '85px' }}>
                    <div className="card-header-row flex items-start gap-3 h-full">
                      <div className="card-icon-container p-3 bg-slate-800/70 rounded-xl shadow-sm group-hover:shadow-md transition-shadow duration-300 flex-shrink-0">
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#FFFFFF' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="card-title-container flex-1 min-w-0 pr-3">
                        <div
                          className="card-title text-xl font-bold transition-colors duration-200"
                          title={assignment.testId?.title || "Test"}
                          style={{
                            color: '#E5E7EB',
                            lineHeight: '1.5',
                            minHeight: '3.75rem',
                            maxHeight: '3.75rem',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            textOverflow: 'ellipsis',
                            wordBreak: 'break-word',
                            cursor: 'help'
                          }}
                        >
                          {assignment.testId?.title || "Test"}
                        </div>
                      </div>
                      <span
                        className="card-status-badge px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm border flex-shrink-0 self-start"
                        style={getStatusStyle(assignment.status)}
                      >
                        {assignment.status}
                      </span>
                    </div>
                  </div>

                  {/* Test Details - Improved Design with Colors matching Tests.jsx */}
                  <div className="card-details space-y-2.5 mb-6">
                    {/* Type - Emerald (matches Tests.jsx) */}
                    <div className="detail-item flex items-center justify-between p-3.5 bg-gradient-to-r from-slate-900/90 via-slate-800/90 to-slate-900/90 rounded-xl border border-slate-700/50 hover:border-emerald-500/30 transition-all duration-200 group/item">
                      <div className="detail-item-row flex items-center gap-3 flex-1 min-w-0">
                        <div className="detail-icon-container p-2 bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-lg shadow-md flex-shrink-0">
                          <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                        </div>
                        <span className="detail-label text-slate-300 text-sm font-medium whitespace-nowrap">Type</span>
                      </div>
                      <span className="detail-value px-3 py-1.5 bg-gradient-to-r from-emerald-600/30 to-emerald-700/30 text-emerald-200 rounded-lg text-sm font-semibold border border-emerald-500/30 shadow-sm min-w-[80px] text-center capitalize">
                        {assignment.testId?.type || "Test"}
                      </span>
                    </div>

                    {/* Time Limit - Blue (matches Tests.jsx) */}
                    <div className="detail-item flex items-center justify-between p-3.5 bg-gradient-to-r from-slate-900/90 via-slate-800/90 to-slate-900/90 rounded-xl border border-slate-700/50 hover:border-blue-500/30 transition-all duration-200 group/item">
                      <div className="detail-item-row flex items-center gap-3 flex-1 min-w-0">
                        <div className="detail-icon-container p-2 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-lg shadow-md flex-shrink-0">
                          <svg className="h-4 w-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="detail-label text-slate-300 text-sm font-medium whitespace-nowrap">Time Limit</span>
                      </div>
                      <span className="detail-value px-3 py-1.5 bg-gradient-to-r from-blue-600/30 to-blue-700/30 text-blue-200 rounded-lg text-sm font-semibold border border-blue-500/30 shadow-sm min-w-[80px] text-center">
                        {assignment.testId?.timeLimit} min
                      </span>
                    </div>

                    {/* Questions - Purple (matches Subject in Tests.jsx for consistency) */}
                    <div className="detail-item flex items-center justify-between p-3.5 bg-gradient-to-r from-slate-900/90 via-slate-800/90 to-slate-900/90 rounded-xl border border-slate-700/50 hover:border-purple-500/30 transition-all duration-200 group/item">
                      <div className="detail-item-row flex items-center gap-3 flex-1 min-w-0">
                        <div className="detail-icon-container p-2 bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-lg shadow-md flex-shrink-0">
                          <svg className="h-4 w-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="detail-label text-slate-300 text-sm font-medium whitespace-nowrap">Questions</span>
                      </div>
                      <span className="detail-value px-3 py-1.5 bg-gradient-to-r from-purple-600/30 to-purple-700/30 text-purple-200 rounded-lg text-sm font-semibold border border-purple-500/30 shadow-sm min-w-[80px] text-center">
                        {assignment.testId?.questionCount || 0}
                      </span>
                    </div>
                  </div>

                  {/* Mentor and Score Info */}
                  {(assignment.mentorId || assignment.score !== null) && (
                    <div className="mentor-score-section mb-6 pt-4 border-t border-slate-800/50 space-y-2.5">
                      {assignment.mentorId && (
                        <div className="mentor-score-item flex items-center justify-between text-sm">
                          <span className="mentor-score-label text-slate-400 whitespace-nowrap">Mentor:</span>
                          <span className="mentor-score-value text-gray-200 font-medium text-right ml-4 truncate">{assignment.mentorId?.name || "Not assigned"}</span>
                        </div>
                      )}
                      {assignment.score !== null && (
                        <div className="mentor-score-item flex items-center justify-between text-sm">
                          <span className="mentor-score-label text-slate-400 whitespace-nowrap">Score:</span>
                          <span className="mentor-score-value text-gray-100 font-bold text-base">{assignment.score}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons Section */}
                <div className="action-section mt-6 pt-4" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.2)' }}>
                  {assignment.status === "Assigned" && isTestNotStarted(assignment.startTime) && (
                    <div className="countdown-container mb-4">
                      <CountdownTimer
                        startTime={assignment.startTime}
                        onTimerComplete={() => fetchAssignments(0, currentPage)}
                      />
                    </div>
                  )}

                  {assignment.status === "Assigned" && isTestAvailable(assignment.startTime, assignment.duration) && (
                    <button
                      onClick={() => {
                        handleStartTest(assignment._id);
                      }}
                      className="action-button w-full py-2.5 px-4 rounded-lg font-semibold transition-all cursor-pointer shadow-sm hover:shadow-md"
                      style={{
                        backgroundColor: '#FFFFFF',
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
                        className="action-button w-full py-2.5 px-4 rounded-lg font-semibold transition-all cursor-pointer shadow-sm hover:shadow-md"
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
                        className="action-button w-full py-2.5 px-4 rounded-lg font-semibold transition-all cursor-pointer shadow-sm hover:shadow-md"
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
                          className="action-button w-full py-2.5 px-4 rounded-lg font-semibold transition-all cursor-pointer shadow-sm hover:shadow-md"
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
                          className="action-button w-full py-2.5 px-4 rounded-lg font-semibold transition-all cursor-pointer shadow-sm hover:shadow-md"
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

              </div>
            ))}
          </div>
        )}

        {/* Pagination Controls - Always show if there are items */}
        {totalItems > 0 && (
          <div className="pagination-container mt-10 flex flex-col items-center gap-4">
            <div className="pagination-buttons pagination-row flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  if (currentPage > 1) {
                    const newPage = currentPage - 1;
                    setCurrentPage(newPage);
                    fetchAssignments(0, newPage);
                  }
                }}
                disabled={currentPage === 1}
                className="pagination-button px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
                style={{
                  backgroundColor: currentPage === 1
                    ? 'rgba(255, 255, 255, 0.05)'
                    : '#FFFFFF',
                  background: currentPage === 1
                    ? 'rgba(255, 255, 255, 0.05)'
                    : '#FFFFFF',
                  color: currentPage === 1 ? '#FFFFFF' : '#000000',
                  border: '2px solid rgba(255, 255, 255, 0.2)'
                }}
                onMouseEnter={(e) => {
                  if (currentPage > 1) {
                    e.currentTarget.style.background = '#FFFFFF';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                    e.currentTarget.style.boxShadow = '0 8px 20px rgba(255, 255, 255, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentPage > 1) {
                    e.currentTarget.style.background = '#FFFFFF';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
                  }
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </button>

              <div className="pagination-numbers flex items-center gap-2 px-4 py-2 rounded-xl" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => {
                        if (pageNum !== currentPage) {
                          setCurrentPage(pageNum);
                          fetchAssignments(0, pageNum);
                        }
                      }}
                      className="pagination-number w-11 h-11 rounded-xl font-bold transition-all duration-300 transform hover:scale-110 shadow-md hover:shadow-lg"
                      style={{
                        background: pageNum === currentPage
                          ? '#FFFFFF'
                          : 'rgba(255, 255, 255, 0.1)',
                        color: pageNum === currentPage ? '#000000' : '#FFFFFF',
                        border: pageNum === currentPage
                          ? '2px solid rgba(255, 255, 255, 0.8)'
                          : '2px solid rgba(255, 255, 255, 0.2)',
                        boxShadow: pageNum === currentPage
                          ? '0 4px 15px rgba(255, 255, 255, 0.4)'
                          : '0 2px 8px rgba(0, 0, 0, 0.2)'
                      }}
                      onMouseEnter={(e) => {
                        if (pageNum !== currentPage) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 255, 255, 0.2)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (pageNum !== currentPage) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                        }
                      }}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => {
                  if (currentPage < totalPages) {
                    const newPage = currentPage + 1;
                    setCurrentPage(newPage);
                    fetchAssignments(0, newPage);
                  }
                }}
                disabled={currentPage === totalPages}
                className="pagination-button px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
                style={{
                  backgroundColor: currentPage === totalPages
                    ? 'rgba(255, 255, 255, 0.05)'
                    : '#FFFFFF',
                  background: currentPage === totalPages
                    ? 'rgba(255, 255, 255, 0.05)'
                    : '#FFFFFF',
                  color: currentPage === totalPages ? '#FFFFFF' : '#000000',
                  border: '2px solid rgba(255, 255, 255, 0.2)'
                }}
                onMouseEnter={(e) => {
                  if (currentPage < totalPages) {
                    e.currentTarget.style.background = '#FFFFFF';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                    e.currentTarget.style.boxShadow = '0 8px 20px rgba(255, 255, 255, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentPage < totalPages) {
                    e.currentTarget.style.background = '#FFFFFF';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
                  }
                }}
              >
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentAssignments;
