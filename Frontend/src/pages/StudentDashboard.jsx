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

  useEffect(() => {
    fetchStudentData();
    fetchRecentActivity();

    // Setup Socket.IO client
    const socket = io(import.meta.env.VITE_API_URL || "http://localhost:4000");

    socket.on("connect", () => {
      console.log("Connected to socket server:", socket.id);
      // Join room with userId for targeted events
      const userId = getCurrentUserId();
      if (userId) {
        socket.emit('join', userId);
        console.log("Joined room:", userId);
      }
    });

    socket.on("assignmentCreated", (data) => {
      console.log("Received assignmentCreated event:", data);
      if (data.userId === getCurrentUserId()) {
        // Refresh student data and recent activity
        fetchStudentData();
        fetchRecentActivity();
      }
    });

    // Debug: log all events to verify connection
    socket.onAny((event, ...args) => {
      console.log(`Socket event received: ${event}`, args);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from socket server");
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
    };
  }, []);

  const getCurrentUserId = () => {
    // Assuming userId is stored in localStorage
    const userId = localStorage.getItem("userId");
    console.log("Current userId from localStorage:", userId);
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
      console.log("Recent activities fetched:", activities);
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
