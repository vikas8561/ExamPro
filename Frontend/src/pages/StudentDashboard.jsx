import React, { useEffect, useState } from "react";
import UpcomingTests from "../components/UpcomingTests";
import RecentActivity from "../components/RecentActivity";
import DashboardAnalytics from "../components/DashboardAnalytics";
import apiRequest from "../services/api";
import { io } from "socket.io-client";
import { BASE_URL } from "../config/api";
import "../styles/StudentDashboard.mobile.css";
import {
  Trophy,
  Target,
  Clock,
  Calendar,
  TrendingUp,
  Activity,
  Zap,
  BookOpen,
  GraduationCap,
  Wifi,
  WifiOff
} from "lucide-react";

// Skeleton loader styles
const skeletonStyles = `
  @keyframes shimmer {
    0% { background-position: -1000px 0; }
    100% { background-position: 1000px 0; }
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

  .glass-card {
    background: rgba(17, 24, 39, 0.7);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
  }

  .glass-card:hover {
    background: rgba(31, 41, 55, 0.8);
    border-color: rgba(255, 255, 255, 0.15);
    transform: translateY(-2px);
    transition: all 0.3s ease;
  }
`;

const StudentDashboard = () => {
  const [assignedCount, setAssignedCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [assignedTests, setAssignedTests] = useState([]);
  const [allAssignments, setAllAssignments] = useState([]); // For analytics
  const [recentActivities, setRecentActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [userName, setUserName] = useState("Student");

  // Calculate average score
  const [averageScore, setAverageScore] = useState(0);

  useEffect(() => {
    // Get user name
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setUserName(user.name?.split(' ')[0] || "Student");
      } catch (e) {
        setUserName("Student");
      }
    }

    fetchStudentData();
    fetchRecentActivity();

    const socketUrl = BASE_URL;
    const socket = io(socketUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
      forceNew: false
    });

    let pollInterval = null;

    socket.on("connect", () => {
      setSocketConnected(true);
      setConnectionError(null);
      const userId = localStorage.getItem("userId");
      if (userId) socket.emit('join', userId);
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      setSocketConnected(false);
      setConnectionError("Using fallback polling");
      pollInterval = setInterval(() => {
        fetchStudentData();
        fetchRecentActivity();
      }, 30000);
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
      if (pollInterval) clearInterval(pollInterval);
    });

    socket.on("assignmentCreated", (data) => {
      const currentUserId = localStorage.getItem("userId");
      if (!data.userId || data.userId === currentUserId || data.testId) {
        fetchStudentData();
        fetchRecentActivity();
      }
    });

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      const [stats, upcomingResponse] = await Promise.all([
        apiRequest("/assignments/student/stats"),
        apiRequest("/assignments/student?page=1&limit=50") // Fetch more for analytics
      ]);

      setAssignedCount(stats.assignedCount || 0);
      setCompletedCount(stats.completedCount || 0);

      let assignments = [];
      if (Array.isArray(upcomingResponse)) {
        assignments = upcomingResponse;
      } else if (upcomingResponse?.assignments) {
        assignments = upcomingResponse.assignments;
      } else if (upcomingResponse?.data) {
        assignments = upcomingResponse.data;
      }

      setAllAssignments(assignments);

      // Calculate Average Score
      const completedOnly = assignments.filter(a => a.status === 'Completed' && a.score !== null);
      if (completedOnly.length > 0) {
        const totalScore = completedOnly.reduce((sum, a) => sum + (a.score || 0), 0);
        setAverageScore(Math.round(totalScore / completedOnly.length));
      } else {
        setAverageScore(0);
      }

      const upcomingTestsData = assignments.filter(assignment =>
        assignment?.testId &&
        assignment.testId.type !== 'practice' &&
        (assignment.status === "Assigned" || assignment.status === "In Progress")
      );

      setAssignedTests(upcomingTestsData);
    } catch (error) {
      console.error("Error fetching student data:", error);
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
    }
  };

  const upcomingTests = assignedTests.filter(test => new Date(test.startTime) >= new Date()).slice(0, 3);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  return (
    <div className="student-dashboard-mobile min-h-screen bg-[#0B1220] text-slate-100 font-sans pb-12">
      <style>{skeletonStyles}</style>

      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-r from-indigo-900/40 via-purple-900/40 to-slate-900/40 border-b border-white/5 py-6 px-6 sm:px-8 mb-8">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
          <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-80 h-80 bg-purple-600/20 rounded-full blur-3xl"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="flex flex-col gap-3">
            {/* Top Row: Badges & Action */}
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]">
                  <GraduationCap className="w-3 h-3 text-indigo-400" />
                  <span className="text-indigo-200 text-[10px] font-semibold tracking-wide uppercase">
                    Student Portal
                  </span>
                </div>

                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm ${socketConnected
                  ? 'bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                  : 'bg-amber-500/10 border-amber-500/20'
                  }`}>
                  {socketConnected ? (
                    <Wifi className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <WifiOff className="w-3 h-3 text-amber-400" />
                  )}
                  <span className={`text-[10px] font-semibold tracking-wide uppercase ${socketConnected ? 'text-emerald-200' : 'text-amber-200'
                    }`}>
                    {socketConnected ? 'Online' : 'Syncing'}
                  </span>
                </div>
              </div>

              <button
                onClick={fetchStudentData}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 backdrop-blur-md group text-xs font-medium text-slate-300 hover:text-white"
              >
                <Zap className="w-3.5 h-3.5 text-yellow-400/80 group-hover:text-yellow-300 transition-colors" />
                <span>Refresh</span>
              </button>
            </div>

            {/* Content Row */}
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-1.5 tracking-tight">
                {getGreeting()}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">{userName}</span>
              </h1>
              <p className="text-slate-400 max-w-lg text-base leading-relaxed">
                Ready to continue your learning journey? You have <span className="text-white font-semibold">{assignedTests.length}</span> active assignments.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 sm:px-8 space-y-8">

        {/* Quick Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Total Assigned */}
          <div className="glass-card rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <Target className="w-24 h-24 rotate-12" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-blue-500/20 rounded-xl text-blue-400">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="text-slate-400 font-medium">Total Assigned</h3>
              </div>
              <p className="text-4xl font-bold text-white mb-1">{assignedCount}</p>
              <p className="text-sm text-slate-500">Tests assigned to you</p>
            </div>
          </div>

          {/* Completed Tests */}
          <div className="glass-card rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <Trophy className="w-24 h-24 rotate-12" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-400">
                  <Trophy className="w-6 h-6" />
                </div>
                <h3 className="text-slate-400 font-medium">Completed Tests</h3>
              </div>
              <p className="text-4xl font-bold text-white mb-1">{completedCount}</p>
              <p className="text-sm text-slate-500">Succesfully submitted</p>
            </div>
          </div>

          {/* Average Score */}
          <div className="glass-card rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <TrendingUp className="w-24 h-24 rotate-12" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 bg-purple-500/20 rounded-xl text-purple-400">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <h3 className="text-slate-400 font-medium">Average Score</h3>
              </div>
              <p className="text-4xl font-bold text-white mb-1">{averageScore}%</p>
              <p className="text-sm text-slate-500">Based on completed tests</p>
            </div>
          </div>
        </div>

        {/* Analytics Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-slate-100">Performance Analytics</h2>
          </div>
          <DashboardAnalytics assignments={allAssignments} />
        </div>

        {/* Content Grid (Upcoming & Recent) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Upcoming Tests - Left Side (Larger) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <h2 className="text-xl font-bold text-slate-100">Upcoming Priority</h2>
              </div>
            </div>

            {loading ? (
              <div className="glass-card rounded-2xl p-6 min-h-[200px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-slate-600 border-t-indigo-500 animate-spin"></div>
                  <p className="text-slate-500 text-sm">Loading tests...</p>
                </div>
              </div>
            ) : (
              <div className="glass-card rounded-2xl border-0 overflow-hidden">
                <UpcomingTests data={upcomingTests} />
              </div>
            )}
          </div>

          {/* Recent Activity - Right Side (Smaller) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-bold text-slate-100">Recent Activity</h2>
            </div>

            {loading ? (
              <div className="glass-card rounded-2xl p-6 min-h-[200px] flex items-center justify-center">
                <div className="skeleton w-full h-full rounded-xl"></div>
              </div>
            ) : (
              <div className="glass-card rounded-2xl p-2 border-0 overflow-hidden">
                <RecentActivity data={recentActivities} />
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
