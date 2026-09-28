import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../config/api";
import "../styles/StudentDashboard.mobile.css";
import {
  ShieldCheck,
  Zap,
  ClipboardList,
  FileCheck,
  Clock,
  Activity,
  ChevronRight,
  TrendingUp,
  Users,
  CheckCircle2,
  AlertCircle,
  Layers,
  Search,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Sparkles
} from "lucide-react";

export default function MentorDashboard() {
  const [stats, setStats] = useState({
    totalAssigned: 0,
    activeTests: 0,
    completedTests: 0,
    recentSubmissions: [],
    assignments: []
  });
  const [loading, setLoading] = useState(false);
  const [mentorName, setMentorName] = useState("Mentor");

  useEffect(() => {
    // Get mentor name from stored user
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setMentorName(user.name?.split(" ")[0] || "Mentor");
      } catch (e) {
        setMentorName("Mentor");
      }
    }

    fetchMentorData();
  }, []);

  const fetchMentorData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/mentor/dashboard`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();

      setStats({
        totalAssigned: data.totalAssigned || 0,
        activeTests: data.activeTests || 0,
        completedTests: data.completedTests || 0,
        recentSubmissions: data.recentSubmissions || [],
        assignments: data.assignments || []
      });
    } catch (error) {
      console.error("Error fetching mentor data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const completionRate = stats.totalAssigned > 0
    ? Math.round((stats.completedTests / stats.totalAssigned) * 100)
    : 0;

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

        {/* Top Header Row - Synchronized 3.5rem baseline matching Sidebar header */}
        <div
          className="flex items-center justify-between pb-5 mb-6"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", minHeight: "3.5rem" }}
        >
          {/* Left: User Welcome aligned with Sidebar */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#133B42] border border-[#00C4B4]/20 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-[#00C4B4]" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                Welcome back, {mentorName}
              </h1>
              <p className="text-xs text-[#7E8594] mt-0.5">
                {getGreeting()} • Mentor Portal
              </p>
            </div>
          </div>

          {/* Right Controls: Online status + Refresh pill button */}
          <div className="flex items-center gap-3">
            {/* Subtle System Status Pill */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#20242D] border border-white/[0.06] text-xs shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#34D399] shadow-[0_0_8px_#34D399]" />
              <span className="text-[#8E95A5] font-medium text-xs">Online</span>
            </div>

            {/* Refresh Pill Button */}
            <button
              onClick={fetchMentorData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/30 hover:bg-[#1A4C55] hover:scale-105 active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 fill-[#00C4B4] ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Syncing..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Row (styled with unified color pill accents) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Active In Progress */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Active In Progress
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#133B42] text-[#2DD4BF] border border-[#2DD4BF]/20">
                Live
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {stats.activeTests}
            </div>
            <p className="text-xs text-[#7E8594]">Students currently in test sessions</p>
          </div>

          {/* Total Assigned */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Total Assigned
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#1E293B] text-[#94A3B8] border border-white/10">
                Assigned
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {stats.totalAssigned}
            </div>
            <p className="text-xs text-[#7E8594]">Total student assessment instances</p>
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
              {stats.completedTests}
            </div>
            <p className="text-xs text-[#7E8594]">Successfully evaluated assessments</p>
          </div>

          {/* Completion Rate */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Completion Rate
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#3D271D] text-[#FB923C] border border-[#FB923C]/20">
                Analytics
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {completionRate}%
            </div>
            <p className="text-xs text-[#7E8594]">Overall evaluation completion velocity</p>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#20242D] border border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
              <Layers className="w-5 h-5 text-[#00C4B4]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight">Mentor Actions & Fast Navigation</h3>
              <p className="text-xs text-[#7E8594] mt-0.5">Quickly jump into assessment assignments or review student evaluation lists</p>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* White Button for View All Assignments */}
            <Link
              to="/mentor/assignments"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-semibold text-xs transition-all shadow-sm active:scale-95"
            >
              <ClipboardList className="w-4 h-4 text-slate-950" />
              <span>View All Assignments</span>
            </Link>
            {/* Dark Secondary Button for View Student Submissions */}
            <Link
              to="/mentor/submissions"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#2A2E39] hover:bg-[#323744] text-white border border-white/[0.08] font-medium text-xs transition-all active:scale-95"
            >
              <FileCheck className="w-4 h-4 text-[#38BDF8]" />
              <span>View Student Submissions</span>
            </Link>
          </div>
        </div>

        {/* Main Content Grid: Recent Submissions & Monitoring Hub - EQUAL COMPACT BOX HEIGHT (380px) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

          {/* Recent Student Submissions - Equal Compact Height (380px) */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 sm:p-6 flex flex-col h-[380px]">
              {/* Box Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.05] flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <FileCheck className="w-4.5 h-4.5 text-[#00C4B4]" />
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Recent Student Submissions
                  </h2>
                </div>
                <span className="text-xs text-[#7E8594] font-medium">
                  {stats.recentSubmissions.length} Submissions
                </span>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2.5">
                {loading ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                    <div className="w-6 h-6 rounded-full border-2 border-[#00C4B4] border-t-transparent animate-spin mb-2" />
                    <p className="text-xs text-[#7E8594]">Loading submissions...</p>
                  </div>
                ) : stats.recentSubmissions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-3">
                      <ClipboardList className="w-6 h-6 text-[#7E8594]" />
                    </div>
                    <p className="text-sm font-semibold text-white">No recent submissions</p>
                    <p className="text-xs text-[#7E8594] mt-1">Student submissions will appear here once finalized.</p>
                  </div>
                ) : (
                  stats.recentSubmissions.map((sub) => {
                    const studentName = sub.userId?.name || "Student";
                    const studentIdentifier = sub.userId?.universityUID || sub.userId?.rollno || sub.userId?.email || "";
                    const testTitle = sub.testId?.title || sub.assignmentId?.testId?.title || "Assessment";
                    const targetAssignmentId = sub.assignmentId?._id || sub.assignmentId || sub._id;
                    const dateFormatted = sub.submittedAt
                      ? new Date(sub.submittedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })
                      : "N/A";

                    return (
                      <div
                        key={sub._id}
                        className="p-3 sm:p-3.5 rounded-xl bg-[#181A22] border border-white/[0.04] hover:border-white/10 transition-all flex items-center justify-between gap-3"
                      >
                        {/* Student Details */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center font-bold text-xs text-[#00C4B4] flex-shrink-0">
                            {studentName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs sm:text-sm font-semibold text-white truncate">
                                {studentName}
                              </p>
                              {studentIdentifier && (
                                <span className="text-[10px] font-mono text-[#7E8594] truncate hidden sm:inline">
                                  ({studentIdentifier})
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[#8E95A5] truncate mt-0.5">
                              {testTitle}
                            </p>
                          </div>
                        </div>

                        {/* Right: Score + View Test Button */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right hidden sm:block">
                            <div className="text-xs font-semibold text-white">
                              {sub.totalScore ?? 0} / {sub.maxScore ?? 0} pts
                            </div>
                            <div className="text-[10px] text-[#7E8594] mt-0.5">
                              {dateFormatted}
                            </div>
                          </div>

                          {/* Green Button for View Test */}
                          <Link
                            to={`/mentor/view-test/${targetAssignmentId}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-all shadow-sm active:scale-95 cursor-pointer"
                          >
                            <span>View Test</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Proctoring Hub & Live Status - Equal Compact Height (380px) */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 sm:p-6 flex flex-col h-[380px]">
              {/* Box Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.05] flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4.5 h-4.5 text-[#38BDF8]" />
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Proctoring & Assessment Hub
                  </h2>
                </div>
                <span className="text-xs text-[#7E8594] font-medium">Real-time</span>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3.5">
                {/* Progress Overview Card */}
                <div className="p-4 rounded-xl bg-[#181A22] border border-white/[0.04]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white">Overall Submission Rate</span>
                    <span className="text-xs font-bold text-[#00C4B4]">{completionRate}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#00C4B4] to-[#38BDF8] rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(completionRate, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#7E8594] mt-2">
                    <span>{stats.completedTests} Completed</span>
                    <span>{stats.totalAssigned} Total Assigned</span>
                  </div>
                </div>

                {/* Proctoring Health Status */}
                <div className="p-4 rounded-xl bg-[#181A22] border border-white/[0.04] flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-white">Integrity Engines Active</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Healthy</span>
                    </div>
                    <p className="text-[11px] text-[#7E8594] mt-1 leading-relaxed">
                      Safe Exam Browser and Tab-Switch detectors are logging live student telemetry seamlessly.
                    </p>
                  </div>
                </div>

                {/* Quick Link Card */}
                <div className="p-4 rounded-xl bg-[#181A22] border border-white/[0.04] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center">
                      <Users className="w-4 h-4 text-[#38BDF8]" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">Student Management</p>
                      <p className="text-[11px] text-[#7E8594]">Review student performance details</p>
                    </div>
                  </div>
                  <Link
                    to="/mentor/submissions"
                    className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/10 text-white transition-all"
                    title="View Submissions"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Overview Analytics Bar */}
        <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.05]">
            <div className="flex items-center gap-2.5">
              <TrendingUp className="w-5 h-5 text-[#00C4B4]" />
              <h2 className="text-base font-bold text-white tracking-tight">
                Assessment Status Breakdown
              </h2>
            </div>
            <span className="text-xs text-[#7E8594]">Summary</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[#181A22] border border-white/[0.04] flex items-center justify-between">
              <div>
                <p className="text-xs text-[#7E8594]">Pending Start</p>
                <p className="text-xl font-bold text-white mt-1">
                  {Math.max(0, stats.totalAssigned - stats.activeTests - stats.completedTests)}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
                <Clock className="w-4 h-4 text-slate-400" />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#181A22] border border-white/[0.04] flex items-center justify-between">
              <div>
                <p className="text-xs text-[#7E8594]">Currently In Progress</p>
                <p className="text-xl font-bold text-[#00C4B4] mt-1">
                  {stats.activeTests}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[#133B42] flex items-center justify-center">
                <Activity className="w-4 h-4 text-[#00C4B4]" />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#181A22] border border-white/[0.04] flex items-center justify-between">
              <div>
                <p className="text-xs text-[#7E8594]">Evaluated & Finalized</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">
                  {stats.completedTests}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[#19382C] flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

