import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import apiRequest from "../services/api";

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
  const navigate = useNavigate();

  useEffect(() => {
    fetchAssignments();
    fetchSubjects();
  }, []);

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

  const fetchAssignments = async () => {
    try {
      const data = await apiRequest("/assignments/student");
      setAssignments(data);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      alert("Failed to load assignments");
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

  const getStatusColor = (status) => {
    switch (status) {
      case "Assigned": return "bg-yellow-900/50 text-yellow-300";
      case "In Progress": return "bg-blue-900/50 text-blue-300";
      case "Completed": return "bg-green-900/50 text-green-300";
      case "Overdue": return "bg-red-900/50 text-red-300";
      default: return "bg-gray-900/50 text-gray-300";
    }
  };

  const handleStartTest = async (assignmentId) => {
    try {
      const response = await apiRequest(`/assignments/${assignmentId}/start`, {
        method: "POST"
      });

      // Navigate to take test page
      navigate(`/student/take-test/${assignmentId}`);
    } catch (error) {
      alert(error.message || "Failed to start test");
    }
  };

  const filteredAssignments = assignments.filter((assignment) => {
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
      <div className="max-w-6xl mx-auto">
        {/* Header Section with Gradient Background */}
        <div className="sticky top-0 z-50 relative mb-8">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-indigo-600/10 rounded-2xl blur-xl"></div>
          <div className="relative bg-slate-800/95 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
            {/* Title and Stats Row */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg">
                  <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    Tests
                  </h1>
                  <p className="text-slate-400 text-sm mt-1">
                    {assignments.length} total assignments • {filteredAssignments.length} showing
                  </p>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative max-w-md w-full lg:w-80">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search tests..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 bg-black-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-300 hover:bg-slate-700/70 hover:border-slate-500/50 backdrop-blur-sm"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-white transition-colors duration-200"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Filter Section */}
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
                    className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
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
            {filteredAssignments.map((assignment) => (
              <div key={assignment._id} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-semibold text-white">
                    {assignment.testId?.title || "Test"}
                  </h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(assignment.status)}`}>
                    {assignment.status}
                  </span>
                </div>

                <div className="space-y-3 text-slate-300">
                  <div className="flex justify-between">
                    <span>Type:</span>
                    <span className="capitalize">{assignment.testId?.type}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Time Limit:</span>
                    <span>{assignment.testId?.timeLimit} minutes</span>
                  </div>

                  <div className="flex justify-between">
                    <span>Start Time:</span>
                    <span>{formatDate(assignment.startTime)}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Duration:</span>
                    <span>{assignment.duration} minutes</span>
                  </div>

                  <div className="flex justify-between">
                    <span>Questions:</span>
                    <span>{assignment.testId?.questions?.length || 0}</span>
                  </div>

                  {assignment.mentorId && (
                    <div className="flex justify-between">
                      <span>Mentor:</span>
                      <span>{assignment.mentorId?.name || "Not assigned"}</span>
                    </div>
                  )}

                  {assignment.score !== null && (
                    <div className="flex justify-between">
                      <span>Score:</span>
                      <span className="font-semibold">{assignment.score}%</span>
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  {assignment.status === "Assigned" && isTestNotStarted(assignment.startTime) && (
                    <CountdownTimer 
                      startTime={assignment.startTime} 
                      onTimerComplete={() => fetchAssignments()} 
                    />
                  )}
                  
                  {assignment.status === "Assigned" && isTestAvailable(assignment.startTime, assignment.duration) && (
                    <button
                      onClick={() => handleStartTest(assignment._id)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md font-semibold transition-colors cursor-pointer"
                    >
                      Start Test
                    </button>
                  )}

                  {assignment.status === "Assigned" && isDeadlinePassed(assignment.startTime, assignment.duration) && (
                    <button
                      disabled
                      className="w-full bg-red-600 text-white py-2 px-4 rounded-md font-semibold opacity-50 cursor-not-allowed"
                    >
                      Deadline Passed
                    </button>
                  )}

                  {assignment.status === "In Progress" && (
                    isDeadlinePassed(assignment.startTime, assignment.duration) ? (
                    <button
                      onClick={() => navigate(`/student/view-test/${assignment._id}`)}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md font-semibold transition-colors cursor-pointer"
                    >
                      View Results
                    </button>
                    ) : (
                    <button
                      onClick={() => navigate(`/student/take-test/${assignment._id}`)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md font-semibold transition-colors cursor-pointer"
                    >
                      Continue Test
                    </button>
                    )
                  )}

                  {assignment.status === "Completed" && (
                    isDeadlinePassed(assignment.startTime, assignment.duration) ? (
                      assignment.reviewStatus === "Reviewed" ? (
                        <button
                          onClick={() => navigate(`/student/view-test/${assignment._id}`)}
                          className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md font-semibold transition-colors"
                        >
                          View Results
                        </button>
                      ) : (
                    <button
                      onClick={() => navigate(`/student/view-test/${assignment._id}`)}
                      className="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded-md font-semibold transition-colors cursor-pointer"
                    >
                      View Submission
                    </button>
                      )
                    ) : (
                      <button
                        disabled
                        className="w-full bg-gray-600 text-white py-2 px-4 rounded-md font-semibold opacity-50 cursor-not-allowed"
                      >
                        Results Available After Deadline
                      </button>
                    )
                  )}

                  {assignment.status === "Overdue" && (
                    <button
                      disabled
                      className="w-full bg-red-600 text-white py-2 px-4 rounded-md font-semibold opacity-50 cursor-not-allowed"
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
};

export default StudentAssignments;
