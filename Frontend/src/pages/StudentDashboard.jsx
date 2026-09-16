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
  WifiOff,
  LayoutDashboard,
  Inbox,
  Plus
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

      // Cumulative performance. Averaged by the server over every completed
      // assignment, so it does not quietly become "the average of the fifty we
      // asked for" once a student has more than that. Falls back to averaging
      // what is on hand only if an older response carries no stats block.
      if (upcomingResponse?.stats?.averagePercent !== undefined) {
        setAverageScore(upcomingResponse.stats.averagePercent ?? 0);
      } else {
        const graded = assignments.filter(
          (a) => a.status === "Completed" && a.scorePercent !== null && a.scorePercent !== undefined
        );
        setAverageScore(
          graded.length ? Math.round(graded.reduce((s, a) => s + a.scorePercent, 0) / graded.length) : 0
        );
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
    <div className="student-dashboard-mobile min-h-screen bg-[#16181F] text-slate-100 font-sans p-6 lg:p-6 relative">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }
      `}</style>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Header Row - Exactly aligned with Sidebar's ExamPro section */}
        <div
          className="flex items-center justify-between pb-5 mb-6"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", minHeight: "3.5rem" }}
        >
          {/* Left: User Welcome aligned with ExamPro header */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#133B42] border border-[#00C4B4]/20 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-5 h-5 text-[#00C4B4]" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                Welcome back, {userName}
              </h1>
              <p className="text-xs text-[#7E8594] mt-0.5">
                {getGreeting()}
              </p>
            </div>
          </div>

          {/* Right Controls: Online status + Refresh pill button */}
          <div className="flex items-center gap-3">
            {/* Subtle System Status Pill */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#20242D] border border-white/[0.06] text-xs shadow-sm">
              <span
                className={`w-2 h-2 rounded-full ${
                  socketConnected ? "bg-[#34D399] shadow-[0_0_8px_#34D399]" : "bg-[#FB923C]"
                }`}
              />
              <span className="text-[#8E95A5] font-medium text-xs">
                {socketConnected ? "Online" : "Syncing"}
              </span>
            </div>

            {/* Refresh Pill Button */}
            <button
              onClick={fetchStudentData}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/30 hover:bg-[#1A4C55] hover:scale-105 active:scale-95 transition-all shadow-sm"
            >
              <Zap className="w-3.5 h-3.5 fill-[#00C4B4]" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Row (styled with the screenshot's color pill accents) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {/* Total Assigned */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Active Examinations
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#133B42] text-[#2DD4BF] border border-[#2DD4BF]/20">
                Assigned
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {assignedCount}
            </div>
            <p className="text-xs text-[#7E8594]">Total tests awaiting completion</p>
          </div>

          {/* Completed Tests */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Completed Tests
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#19382C] text-[#34D399] border border-[#34D399]/20">
                Submitted
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {completedCount}
            </div>
            <p className="text-xs text-[#7E8594]">Successfully evaluated exams</p>
          </div>

          {/* Average Score */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Cumulative Performance
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#3D271D] text-[#FB923C] border border-[#FB923C]/20">
                Score
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {averageScore}%
            </div>
            <p className="text-xs text-[#7E8594]">Based on completed assessments</p>
          </div>
        </div>

        {/* Main Content Grid: Upcoming Tasks & Recent Activity - EQUAL COMPACT BOX HEIGHT (340px) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

          {/* Upcoming Tests Section - Equal Compact Height */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 sm:p-6 flex flex-col h-[340px]">
              {/* Box Header */}
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/[0.05] flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-4.5 h-4.5 text-[#00C4B4]" />
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Upcoming Priority
                  </h2>
                </div>
                <span className="text-xs text-[#7E8594] font-medium">
                  {assignedTests.length} Pending
                </span>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                {loading ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <div className="w-6 h-6 rounded-full border-2 border-[#00C4B4] border-t-transparent animate-spin mb-2" />
                    <p className="text-xs text-[#7E8594]">Loading your tests...</p>
                  </div>
                ) : (
                  <UpcomingTests data={upcomingTests} />
                )}
              </div>
            </div>
          </div>

          {/* Recent Activity Section - Equal Compact Height */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 sm:p-6 flex flex-col h-[340px]">
              {/* Box Header */}
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/[0.05] flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4.5 h-4.5 text-[#38BDF8]" />
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Recent Activity
                  </h2>
                </div>
                <span className="text-xs text-[#7E8594] font-medium">Latest Updates</span>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                {loading ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <div className="w-6 h-6 rounded-full border-2 border-[#38BDF8] border-t-transparent animate-spin mb-2" />
                    <p className="text-xs text-[#7E8594]">Loading activity...</p>
                  </div>
                ) : (
                  <RecentActivity data={recentActivities} />
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Analytics Section */}
        <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-2.5 mb-6 pb-3 border-b border-white/[0.05]">
            <TrendingUp className="w-5 h-5 text-[#00C4B4]" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              Performance Analytics
            </h2>
          </div>
          <DashboardAnalytics assignments={allAssignments} />
        </div>

      </div>
    </div>
  );
};

export default StudentDashboard;
