import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../config/api";
import "../styles/StudentDashboard.mobile.css";
import {
  Users,
  FileText,
  Activity,
  AlertCircle,
  TrendingUp,
  Clock,
  CheckCircle2,
  Server,
  Database,
  Shield,
  Zap,
  UserPlus,
  FilePlus,
  ChevronRight,
  Layers,
  BookOpen
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

export default function Dashboard() {
  const [tests, setTests] = useState([]);
  const [users, setUsers] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch all dashboard data
  const fetchDashboardData = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");

    try {
      const [testsResponse, usersResponse, reviewsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/tests?limit=100`, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        }),
        fetch(`${API_BASE_URL}/users?limit=500`, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        }),
        fetch(`${API_BASE_URL}/reviews?limit=50`, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        }),
      ]);

      if (testsResponse.ok) {
        const data = await testsResponse.json();
        setTests(Array.isArray(data.tests) ? data.tests : []);
      }

      if (usersResponse.ok) {
        const data = await usersResponse.json();
        setUsers(Array.isArray(data) ? data : Array.isArray(data.users) ? data.users : []);
      }

      if (reviewsResponse.ok) {
        const data = await reviewsResponse.json();
        setReviews(Array.isArray(data) ? data : Array.isArray(data.reviews) ? data.reviews : []);
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // 1. User Growth (Last 6 Months)
  const userGrowthData = useMemo(() => {
    const months = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({
        name: d.toLocaleString("default", { month: "short" }),
        key: `${d.getFullYear()}-${d.getMonth()}`,
        students: 0,
      });
    }

    users.forEach((user) => {
      if (!user.createdAt) return;
      const d = new Date(user.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const monthData = months.find((m) => m.key === key);
      if (monthData) {
        monthData.students = (monthData.students || 0) + 1;
      }
    });

    return months;
  }, [users]);

  // 2. Student Distribution (RU vs SU)
  const studentDistributionData = useMemo(() => {
    const ru = users.filter((u) => u.studentCategory === "RU").length;
    const su = users.filter((u) => u.studentCategory === "SU").length;
    if (ru === 0 && su === 0) return [];
    return [
      { name: "RU Students", value: ru },
      { name: "SU Students", value: su },
    ];
  }, [users]);

  const PIE_COLORS = ["#00C4B4", "#38BDF8"];

  // 3. Test Performance (Average scores)
  const testPerformanceData = useMemo(() => {
    return tests
      .filter((t) => t.avgScore !== undefined && t.avgScore !== null && t.avgScore > 0)
      .slice(0, 8)
      .map((t) => ({
        name: t.title.substring(0, 14) + (t.title.length > 14 ? "…" : ""),
        score: t.avgScore,
      }));
  }, [tests]);

  // 4. Combined Recent Activity
  const recentActivity = useMemo(() => {
    const combined = [
      ...users.map((u) => ({
        type: "user",
        data: u,
        date: new Date(u.createdAt),
      })),
      ...tests.map((t) => ({
        type: "test",
        data: t,
        date: new Date(t.createdAt),
      })),
    ];

    return combined.sort((a, b) => b.date - a.date).slice(0, 15);
  }, [users, tests]);

  // 5. Counts & Statistics
  const activeTestsCount = tests.filter((t) => t.status === "Active").length;
  const pendingReviewsCount = reviews.filter((r) => r.status === "Pending").length;
  const usersThisMonth = users.filter((u) => {
    const d = new Date(u.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const testsThisMonth = tests.filter((t) => {
    const d = new Date(t.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const avgCohortScore =
    testPerformanceData.length > 0
      ? (
          testPerformanceData.reduce((acc, curr) => acc + curr.score, 0) /
          testPerformanceData.length
        ).toFixed(0)
      : null;

  return (
    <div className="student-dashboard-mobile min-h-screen bg-[#16181F] text-slate-100 font-sans p-6 lg:p-6 relative">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
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

        {/* Top Header Row - Synchronized 3.5rem baseline matching Sidebar */}
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-6 gap-4"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", minHeight: "3.5rem" }}
        >
          {/* Left: Branding & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#133B42] border border-[#00C4B4]/20 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-[#00C4B4]" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                Admin Dashboard
              </h1>
              <p className="text-xs text-[#7E8594] mt-0.5">
                Real-time institutional platform telemetry & analytics
              </p>
            </div>
          </div>

          {/* Right Controls: Online status & Refresh Button */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#20242D] border border-white/[0.06] text-xs shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#34D399] shadow-[0_0_8px_#34D399]" />
              <span className="text-[#8E95A5] font-medium text-xs">System Online</span>
            </div>

            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/30 hover:bg-[#1A4C55] hover:scale-105 active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 fill-[#00C4B4] ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Syncing..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* Quick Stats KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Total Users */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Total Users
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#133B42] text-[#2DD4BF] border border-[#2DD4BF]/20">
                Enrolled
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {users.length}
            </div>
            <p className="text-xs text-[#7E8594]">{usersThisMonth} joined this month</p>
          </div>

          {/* Active Tests */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Active Tests
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#1E293B] text-[#94A3B8] border border-white/10">
                Live
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {activeTestsCount}
            </div>
            <p className="text-xs text-[#7E8594]">{testsThisMonth} created this month</p>
          </div>

          {/* Pending Reviews */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Pending Reviews
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                  pendingReviewsCount > 0
                    ? "bg-[#3D271D] text-[#FB923C] border border-[#FB923C]/20"
                    : "bg-[#19382C] text-[#34D399] border border-[#34D399]/20"
                }`}
              >
                {pendingReviewsCount > 0 ? "Pending" : "Cleared"}
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {pendingReviewsCount}
            </div>
            <p className="text-xs text-[#7E8594]">
              {pendingReviewsCount === 0 ? "All reviews completed" : "Requires attention"}
            </p>
          </div>

          {/* Avg Test Score */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Cohort Average
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#19382C] text-[#34D399] border border-[#34D399]/20">
                Score
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {avgCohortScore !== null ? `${avgCohortScore}%` : "N/A"}
            </div>
            <p className="text-xs text-[#7E8594]">Based on recent evaluations</p>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#20242D] border border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
              <Layers className="w-5 h-5 text-[#00C4B4]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight">Admin Quick Actions</h3>
              <p className="text-xs text-[#7E8594] mt-0.5">Quickly provision new tests, audit users, or access proctoring settings</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
            {/* White Button for Create Test */}
            <Link
              to="/admin/tests/create"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-semibold text-xs transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <FilePlus className="w-4 h-4 text-slate-950" />
              <span>Create New Test</span>
            </Link>

            {/* Secondary Button for Manage Users */}
            <Link
              to="/admin/users"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#2A2E39] hover:bg-[#323744] text-white border border-white/[0.08] font-medium text-xs transition-all active:scale-95 cursor-pointer"
            >
              <Users className="w-4 h-4 text-[#38BDF8]" />
              <span>Manage Users</span>
            </Link>

            {/* Tertiary Button for Proctoring */}
            <Link
              to="/admin/proctoring"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#2A2E39] hover:bg-[#323744] text-white border border-white/[0.08] font-medium text-xs transition-all active:scale-95 cursor-pointer"
            >
              <Shield className="w-4 h-4 text-[#F59E0B]" />
              <span>Proctoring Center</span>
            </Link>
          </div>
        </div>

        {/* Main Charts Grid: Registrations Area + Demographics Donut */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User Growth (6 Months Area Chart) */}
          <div className="lg:col-span-2 bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.05]">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4.5 h-4.5 text-[#00C4B4]" />
                <h3 className="text-base font-bold text-white tracking-tight">
                  New Registrations (Last 6 Months)
                </h3>
              </div>
              <span className="text-xs text-[#7E8594]">Candidate Growth</span>
            </div>

            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={userGrowthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="adminCyanGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00C4B4" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#00C4B4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" stroke="#7E8594" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis stroke="#7E8594" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#181A22",
                      borderColor: "rgba(255,255,255,0.1)",
                      borderRadius: "12px",
                      color: "#FFFFFF",
                      fontSize: "12px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    }}
                    itemStyle={{ color: "#00C4B4" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="students"
                    stroke="#00C4B4"
                    fillOpacity={1}
                    fill="url(#adminCyanGrad)"
                    strokeWidth={2.5}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Student Demographics (Donut) */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.05]">
              <div className="flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-[#38BDF8]" />
                <h3 className="text-base font-bold text-white tracking-tight">Demographics</h3>
              </div>
              <span className="text-xs text-[#7E8594]">RU vs SU</span>
            </div>

            <div className="h-[220px] w-full flex items-center justify-center relative">
              {studentDistributionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={studentDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {studentDistributionData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                          stroke="rgba(255,255,255,0.05)"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#181A22",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "10px",
                        color: "#FFFFFF",
                        fontSize: "12px",
                      }}
                      itemStyle={{ color: "#E5E7EB" }}
                    />
                    <Legend verticalAlign="bottom" height={30} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-slate-500 text-xs">
                  No category data recorded
                </div>
              )}

              {/* Center counter */}
              {studentDistributionData.length > 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-6">
                  <span className="text-2xl font-bold text-white">{users.length}</span>
                  <span className="text-[10px] text-[#7E8594] uppercase tracking-wider">Candidates</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 3: Test Scores & Live Activity (Equal Compact Box Heights: 340px) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Bar Chart: Test Scores */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 sm:p-6 flex flex-col h-[340px]">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/[0.05] flex-shrink-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4.5 h-4.5 text-[#00C4B4]" />
                <h3 className="text-base font-bold text-white tracking-tight">
                  Recent Test Averages
                </h3>
              </div>
              <span className="text-xs text-[#7E8594]">Avg Percentage</span>
            </div>

            <div className="flex-1 w-full pt-2">
              {testPerformanceData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={testPerformanceData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" stroke="#7E8594" domain={[0, 100]} hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      stroke="#8E95A5"
                      width={110}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      contentStyle={{
                        backgroundColor: "#181A22",
                        borderColor: "rgba(255,255,255,0.1)",
                        borderRadius: "10px",
                        color: "#FFFFFF",
                        fontSize: "12px",
                      }}
                    />
                    <Bar
                      dataKey="score"
                      fill="#00C4B4"
                      radius={[0, 6, 6, 0]}
                      barSize={16}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                  No evaluated test performance records available.
                </div>
              )}
            </div>
          </div>

          {/* Live Recent Activity */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 sm:p-6 flex flex-col h-[340px]">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/[0.05] flex-shrink-0">
              <div className="flex items-center gap-2">
                <Clock className="w-4.5 h-4.5 text-[#38BDF8]" />
                <h3 className="text-base font-bold text-white tracking-tight">Recent Activity</h3>
              </div>
              <span className="text-xs text-[#7E8594]">Live Feed</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2.5">
              {recentActivity.length > 0 ? (
                recentActivity.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#181A22] border border-white/[0.04] hover:border-white/10 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          item.type === "user"
                            ? "bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/20"
                            : "bg-[#19382C] text-[#34D399] border border-[#34D399]/20"
                        }`}
                      >
                        {item.type === "user" ? (
                          <UserPlus className="w-4 h-4" />
                        ) : (
                          <FilePlus className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {item.type === "user"
                            ? `${item.data.name || "Candidate"}`
                            : `"${item.data.title || "Exam"}"`}
                        </p>
                        <p className="text-[11px] text-[#8E95A5] truncate mt-0.5">
                          {item.type === "user" ? item.data.email : "New assessment published"}
                        </p>
                      </div>
                    </div>

                    <span className="text-[10px] text-[#7E8594] whitespace-nowrap flex-shrink-0">
                      {new Date(item.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-500 py-12 text-xs">No recent platform activity.</div>
              )}
            </div>
          </div>
        </div>

        {/* System Infrastructure Telemetry Bar (Bottom) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-[#20242D] border border-white/[0.06] flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Server className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Application Gateway</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] text-emerald-400 font-medium">Operational</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#20242D] border border-white/[0.06] flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#00C4B4]/10 border border-[#00C4B4]/20 flex items-center justify-center flex-shrink-0">
              <Database className="w-5 h-5 text-[#00C4B4]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Database Cluster</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00C4B4]" />
                <span className="text-[11px] text-[#00C4B4] font-medium">Connected</span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#20242D] border border-white/[0.06] flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-[#38BDF8]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Proctoring Telemetry</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8]" />
                <span className="text-[11px] text-[#38BDF8] font-medium">Active Monitoring</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
