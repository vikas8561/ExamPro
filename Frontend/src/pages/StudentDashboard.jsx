import React, { useEffect, useState } from "react";
import UpcomingTests from "../components/UpcomingTests";
import RecentActivity from "../components/RecentActivity";
import apiRequest from "../services/api";
import { io } from "socket.io-client";

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
    const API_BASE_URL = 'https://cg-test-app.onrender.com/api';
    const socketUrl = API_BASE_URL.replace('/api', ''); // Remove /api to get base URL
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
    return <div className="p-6">Loading...</div>;
  }

  const upcomingTests = assignedTests.filter(test => new Date(test.startTime) >= new Date());

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold mb-6">Student Dashboard</h2>

      {/* Connection Status Indicator */}
      <div className="mb-4">
        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
          socketConnected
            ? 'bg-green-100 text-green-800'
            : connectionError
              ? 'bg-red-100 text-red-800'
              : 'bg-yellow-100 text-yellow-800'
        }`}>
          <div className={`w-2 h-2 rounded-full mr-2 ${
            socketConnected ? 'bg-green-500' : 'bg-red-500'
          }`}></div>
          {socketConnected ? 'Real-time connected' : connectionError ? 'Connection error - using polling' : 'Connecting...'}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
          <p className="text-slate-300">Total Assigned Tests</p>
          <p className="text-3xl font-bold mt-2">{assignedTests.length}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
          <p className="text-slate-300">Completed Tests</p>
          <p className="text-3xl font-bold mt-2">{completedTests.length}</p>
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-3">Upcoming Tests</h3>
      <UpcomingTests data={upcomingTests} />

      <h3 className="text-xl font-semibold mb-3 mt-8">Recent Activity</h3>
      <RecentActivity data={recentActivities} />
    </div>
  );
};

export default StudentDashboard;
