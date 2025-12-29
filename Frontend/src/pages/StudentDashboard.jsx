import React, { useEffect, useState } from "react";
import UpcomingTests from "../components/UpcomingTests";
import RecentActivity from "../components/RecentActivity";
import apiRequest from "../services/api";
import { io } from "socket.io-client";
import { BASE_URL } from "../config/api";
import "../styles/StudentDashboard.mobile.css";

// Skeleton loader styles
const skeletonStyles = `
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

const StudentDashboard = () => {
  const [assignedTests, setAssignedTests] = useState([]);
  const [completedTests, setCompletedTests] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(false); // Changed to false - don't block UI
  const [socketConnected, setSocketConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  useEffect(() => {
    // Load data in background without blocking UI
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
    setLoading(true);
    try {
      // Fetch all assignments for the current student
      const response = await apiRequest("/assignments/student");
      
      // Handle different response formats
      let allAssignments = [];
      if (Array.isArray(response)) {
        allAssignments = response;
      } else if (response && Array.isArray(response.assignments)) {
        allAssignments = response.assignments;
      } else if (response && Array.isArray(response.data)) {
        allAssignments = response.data;
      } else {
        console.warn("Unexpected response format from /assignments/student:", response);
        allAssignments = [];
      }

      // Filter assignments by status on client side
      const assignedTestsData = allAssignments.filter(assignment =>
        assignment && (assignment.status === "Assigned" || assignment.status === "In Progress")
      );
      const completedTestsData = allAssignments.filter(assignment =>
        assignment && assignment.status === "Completed"
      );

      setAssignedTests(assignedTestsData);
      setCompletedTests(completedTestsData);
    } catch (error) {
      console.error("Error fetching student data:", error);
      setAssignedTests([]);
      setCompletedTests([]);
    } finally {
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

  // Removed blocking loading state - dashboard loads immediately

  const upcomingTests = assignedTests.filter(test => new Date(test.startTime) >= new Date());

  return (
    <div className="student-dashboard-mobile p-6 min-h-screen" style={{ backgroundColor: '#0B1220' }}>
      <style>{skeletonStyles}</style>
      <h2 className="text-3xl font-bold mb-6" style={{ color: '#E5E7EB' }}>Student Dashboard</h2>

      {/* Connection Status Indicator */}
      <div className="mb-6">
        <div 
          className="connection-status inline-flex items-center px-4 py-2 rounded-lg text-sm border"
          style={{
            backgroundColor: socketConnected 
              ? 'rgba(255, 255, 255, 0.1)' 
              : connectionError 
                ? 'rgba(239, 68, 68, 0.1)' 
                : 'rgba(234, 179, 8, 0.1)',
            borderColor: socketConnected 
              ? 'rgba(255, 255, 255, 0.3)' 
              : connectionError 
                ? 'rgba(239, 68, 68, 0.3)' 
                : 'rgba(234, 179, 8, 0.3)',
            color: socketConnected ? '#FFFFFF' : connectionError ? '#FCA5A5' : '#FDE047'
          }}
        >
          <div 
            className="status-dot w-2 h-2 rounded-full mr-2"
            style={{
              backgroundColor: socketConnected ? '#FFFFFF' : '#EF4444'
            }}
          ></div>
          {socketConnected ? 'Real-time connected' : connectionError ? 'Connection error - using polling' : 'Connecting...'}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {loading ? (
          <>
            {/* Skeleton for Total Assigned Tests */}
            <div 
              className="rounded-2xl p-6 border"
              style={{ 
                backgroundColor: '#0B1220',
                borderColor: 'rgba(255, 255, 255, 0.2)'
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg skeleton" style={{ width: '36px', height: '36px' }}></div>
                <div className="skeleton rounded-lg" style={{ height: '20px', width: '150px' }}></div>
              </div>
              <div className="skeleton rounded-lg mt-2" style={{ height: '48px', width: '80px' }}></div>
            </div>
            {/* Skeleton for Completed Tests */}
            <div 
              className="rounded-2xl p-6 border"
              style={{ 
                backgroundColor: '#0B1220',
                borderColor: 'rgba(255, 255, 255, 0.2)'
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg skeleton" style={{ width: '36px', height: '36px' }}></div>
                <div className="skeleton rounded-lg" style={{ height: '20px', width: '140px' }}></div>
              </div>
              <div className="skeleton rounded-lg mt-2" style={{ height: '48px', width: '60px' }}></div>
            </div>
          </>
        ) : (
          <>
            <div 
              className="stat-card rounded-2xl p-6 border transition-all duration-300"
              style={{ 
                backgroundColor: '#0B1220',
                borderColor: 'rgba(255, 255, 255, 0.2)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div 
                  className="stat-icon p-2 rounded-lg"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#FFFFFF' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="stat-label text-slate-400">Total Assigned Tests</p>
              </div>
              <p className="stat-value text-4xl font-bold mt-2" style={{ color: '#E5E7EB' }}>{assignedTests.length}</p>
            </div>
            <div 
              className="stat-card rounded-2xl p-6 border transition-all duration-300"
              style={{ 
                backgroundColor: '#0B1220',
                borderColor: 'rgba(255, 255, 255, 0.2)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div 
                  className="stat-icon p-2 rounded-lg"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#FFFFFF' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="stat-label text-slate-400">Completed Tests</p>
              </div>
              <p className="stat-value text-4xl font-bold mt-2" style={{ color: '#E5E7EB' }}>{completedTests.length}</p>
            </div>
          </>
        )}
      </div>

      <h3 className="section-title text-xl font-semibold mb-3" style={{ color: '#E5E7EB' }}>Upcoming Tests</h3>
      {loading ? (
        <div 
          className="rounded-2xl overflow-hidden border"
          style={{ 
            backgroundColor: '#0B1220',
            borderColor: 'rgba(255, 255, 255, 0.2)'
          }}
        >
          <div className="p-4">
            <div className="skeleton rounded-lg mb-4" style={{ height: '20px', width: '200px' }}></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                  <div className="skeleton rounded-lg" style={{ height: '16px', width: '200px' }}></div>
                  <div className="skeleton rounded-lg" style={{ height: '16px', width: '120px' }}></div>
                  <div className="skeleton rounded-lg" style={{ height: '16px', width: '100px' }}></div>
                  <div className="skeleton rounded-lg ml-auto" style={{ height: '32px', width: '100px' }}></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="upcoming-tests-container">
          <UpcomingTests data={upcomingTests} />
        </div>
      )}

      <h3 className="section-title text-xl font-semibold mb-3 mt-8" style={{ color: '#E5E7EB' }}>Recent Activity</h3>
      {loading ? (
        <div 
          className="recent-activity-container rounded-2xl overflow-hidden border"
          style={{ 
            backgroundColor: '#0B1220',
            borderColor: 'rgba(255, 255, 255, 0.2)'
          }}
        >
          <div className="p-4">
            <div className="skeleton rounded-lg mb-4" style={{ height: '20px', width: '150px' }}></div>
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="recent-activity-item flex items-start gap-3 p-3 rounded-lg border" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                  <div className="skeleton rounded-full" style={{ width: '24px', height: '24px', flexShrink: 0 }}></div>
                  <div className="flex-1">
                    <div className="skeleton rounded-lg mb-2" style={{ height: '16px', width: '250px' }}></div>
                    <div className="skeleton rounded-lg" style={{ height: '12px', width: '100px' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="recent-activity-container">
          <RecentActivity data={recentActivities} />
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
