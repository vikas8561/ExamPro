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
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAssignments();
  }, []);

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
        <h1 className="text-3xl font-bold mb-8">My Test Assignments</h1>

        {assignments.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-2xl text-slate-400 mb-4">No assignments found</div>
            <p className="text-slate-500">You don't have any test assignments yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {assignments.map((assignment) => (
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
