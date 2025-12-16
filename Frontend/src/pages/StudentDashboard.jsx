import React, { useEffect, useState } from "react";
import UpcomingTests from "../components/UpcomingTests";
import RecentActivity from "../components/RecentActivity";
import apiRequest from "../services/api";
import { io } from "socket.io-client";
import { BASE_URL } from "../config/api";

const StudentDashboard = () => {
  const [assignedTests, setAssignedTests] = useState([]);
  const [completedTests, setCompletedTests] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  useEffect(() => {
    fetchStudentData();
    fetchRecentActivity();

    // Setup Socket.IO client - use the same base URL as API
    const socketUrl = BASE_URL; // Use BASE_URL from config (without /api)
    console.log('Connecting to Socket.IO at:', socketUrl);
    const socket = io(socketUrl, {
      // ✅ Fixed: Add connection options for better cleanup
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      transports: ['websocket', 'polling'], // Explicitly set transport methods
      forceNew: false // Reuse existing connection if available
    });

    let pollInterval = null;

    socket.on("connect", () => {
      setSocketConnected(true);
      setConnectionError(null);
      // Join room with userId for targeted events
      const userId = getCurrentUserId();
      if (userId) {
        socket.emit('join', userId);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      setSocketConnected(false);
      setConnectionError("Failed to connect to real-time server. Using fallback polling.");
      // Fallback: poll for updates every 30 seconds
      pollInterval = setInterval(() => {
        fetchStudentData();
        fetchRecentActivity();
      }, 30000);
    });

    socket.on("disconnect", (reason) => {
      setSocketConnected(false);
      // Clear fallback polling if it exists
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    });

    socket.on("assignmentCreated", (data) => {
      if (data.userId === getCurrentUserId()) {
        // Refresh student data and recent activity
        fetchStudentData();
        fetchRecentActivity();
      }
    });

    // ✅ Fixed: Proper cleanup function
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  const getCurrentUserId = () => {
    // Assuming userId is stored in localStorage
    const userId = localStorage.getItem("userId");
    return userId;
  };

  const fetchStudentData = async () => {
    try {
      // Fetch all assignments for the current student
      const allAssignments = await apiRequest("/assignments/student");

      // Filter assignments by status on client side
      const assignedTestsData = allAssignments.filter(assignment =>
        assignment.status === "Assigned" || assignment.status === "In Progress"
      );
      const completedTestsData = allAssignments.filter(assignment =>
        assignment.status === "Completed"
      );

      setAssignedTests(assignedTestsData);
      setCompletedTests(completedTestsData);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching student data:", error);
      setLoading(false);
    }
  };

  const fetchRecentActivity = async () => {
    try {
      const activities = await apiRequest("/assignments/student/recent-activity");
      setRecentActivities(activities);
    } catch (error) {
      console.error("Error fetching recent activity:", error);
      setRecentActivities([]);
    }
  };

  if (loading) {
    return (
      <div className="p-6 min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0B1220' }}>
        <div className="text-xl" style={{ color: '#E5E7EB' }}>Loading...</div>
      </div>
    );
  }

  const upcomingTests = assignedTests.filter(test => new Date(test.startTime) >= new Date());

  return (
    <div className="p-6 min-h-screen" style={{ backgroundColor: '#0B1220' }}>
      <h2 className="text-3xl font-bold mb-6" style={{ color: '#E5E7EB' }}>Student Dashboard</h2>

      {/* Connection Status Indicator */}
      <div className="mb-6">
        <div 
          className="inline-flex items-center px-4 py-2 rounded-lg text-sm border"
          style={{
            backgroundColor: socketConnected 
              ? 'rgba(34, 211, 238, 0.1)' 
              : connectionError 
                ? 'rgba(239, 68, 68, 0.1)' 
                : 'rgba(234, 179, 8, 0.1)',
            borderColor: socketConnected 
              ? 'rgba(34, 211, 238, 0.3)' 
              : connectionError 
                ? 'rgba(239, 68, 68, 0.3)' 
                : 'rgba(234, 179, 8, 0.3)',
            color: socketConnected ? '#67E8F9' : connectionError ? '#FCA5A5' : '#FDE047'
          }}
        >
          <div 
            className="w-2 h-2 rounded-full mr-2"
            style={{
              backgroundColor: socketConnected ? '#22D3EE' : '#EF4444'
            }}
          ></div>
          {socketConnected ? 'Real-time connected' : connectionError ? 'Connection error - using polling' : 'Connecting...'}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div 
          className="rounded-2xl p-6 border transition-all duration-300"
          style={{ 
            backgroundColor: '#0B1220',
            borderColor: 'rgba(34, 211, 238, 0.2)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.4)';
            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(34, 211, 238, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.2)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: 'rgba(34, 211, 238, 0.1)' }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#22D3EE' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-slate-400">Total Assigned Tests</p>
          </div>
          <p className="text-4xl font-bold mt-2" style={{ color: '#E5E7EB' }}>{assignedTests.length}</p>
        </div>
        <div 
          className="rounded-2xl p-6 border transition-all duration-300"
          style={{ 
            backgroundColor: '#0B1220',
            borderColor: 'rgba(34, 211, 238, 0.2)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.4)';
            e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(34, 211, 238, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.2)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: 'rgba(34, 211, 238, 0.1)' }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#22D3EE' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-slate-400">Completed Tests</p>
          </div>
          <p className="text-4xl font-bold mt-2" style={{ color: '#E5E7EB' }}>{completedTests.length}</p>
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-3" style={{ color: '#E5E7EB' }}>Upcoming Tests</h3>
      <UpcomingTests data={upcomingTests} />

      <h3 className="text-xl font-semibold mb-3 mt-8" style={{ color: '#E5E7EB' }}>Recent Activity</h3>
      <RecentActivity data={recentActivities} />
    </div>
  );
};

export default StudentDashboard;
