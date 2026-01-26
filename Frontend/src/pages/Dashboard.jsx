import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../config/api";
import {
  Users,
  FileText,
  Activity,
  AlertCircle,
  TrendingUp,
  Clock,
  CheckCircle,
  Server,
  Database,
  Shield,
  Search,
  UserPlus,
  FilePlus
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

  // Fetch all data
  useEffect(() => {
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
          // Adjust based on typical API structure (array vs object with key)
          setUsers(Array.isArray(data) ? data : (Array.isArray(data.users) ? data.users : []));
        }

        if (reviewsResponse.ok) {
          const data = await reviewsResponse.json();
          setReviews(Array.isArray(data) ? data : (Array.isArray(data.reviews) ? data.reviews : []));
        }
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // --- Real Data Processing ---

  // 1. User Growth (Last 6 Months)
  const userGrowthData = useMemo(() => {
    const months = [];
    const today = new Date();
    // Generate last 6 month labels
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({
        date: d,
        name: d.toLocaleString('default', { month: 'short' }),
        key: `${d.getFullYear()}-${d.getMonth()}`, // Unique key for grouping
        students: 0
      });
    }

    // Bucket users into months
    users.forEach(user => {
      if (!user.createdAt) return;
      const d = new Date(user.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const monthData = months.find(m => m.key === key);
      // Logic: For a "Total vs Time" chart, we often want cumulative.
      // But "New Users per Month" is better for "Growth". Let's do cumulative for AreaChart.
      // Correction: Let's do "New Users" distribution first.
      if (monthData) {
        monthData.val = (monthData.val || 0) + 1;
      }
    });

    // Calculate cumulative for the trend chart
    let runningTotal = 0;
    // Pre-calculate running total existing before the 6 month window?
    // Hard to know without full history. Let's assume the chart shows "New Users Monthly" (bar)
    // OR "Total Users" (area). Let's do "Total Users" assuming we have all users in state (limit=500 might clip).
    // Better Approach: "New Users per Month" is safer and accurately reflects activity.
    // Let's stick to "New Users" but map it to the area chart for aesthetics.

    return months.map(m => ({
      name: m.name,
      students: m.val || 0
    }));
  }, [users]);

  // 2. Student Distribution
  const studentDistributionData = useMemo(() => {
    const ru = users.filter(u => u.studentCategory === 'RU').length;
    const su = users.filter(u => u.studentCategory === 'SU').length;
    if (ru === 0 && su === 0) return []; // Don't show empty chart
    return [
      { name: 'RU Students', value: ru },
      { name: 'SU Students', value: su },
    ];
  }, [users]);
  const COLORS = ['#8884d8', '#82ca9d'];

  // 3. Test Performance (Real Avg, exclude those with no runs/score)
  const testPerformanceData = useMemo(() => {
    return tests
      .filter(t => t.avgScore !== undefined && t.avgScore !== null && t.avgScore > 0)
      .slice(0, 10) // Top 10 recent
      .map(t => ({
        name: t.title.substring(0, 15) + (t.title.length > 15 ? '...' : ''),
        score: t.avgScore
      }));
  }, [tests]);

  // 4. Recent Activity (Merge Users & Tests)
  const recentActivity = useMemo(() => {
    const combined = [
      ...users.map(u => ({
        type: 'user',
        data: u,
        date: new Date(u.createdAt)
      })),
      ...tests.map(t => ({
        type: 'test',
        data: t,
        date: new Date(t.createdAt)
      }))
    ];

    return combined
      .sort((a, b) => b.date - a.date) // Descending
      .slice(0, 20); // Top 20
  }, [users, tests]);

  // 5. Stats
  const activeTestsCount = tests.filter((t) => t.status === "Active").length;
  const pendingReviewsCount = reviews.filter((r) => r.status === "Pending").length;
  const usersThisMonth = users.filter(u => {
    const d = new Date(u.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const testsThisMonth = tests.filter(t => {
    const d = new Date(t.createdAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className="p-6 min-h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 mb-2">
            Admin Dashboard
          </h1>
          <p className="text-slate-400 text-sm">
            Overview of real-time platform data.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-xl border border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-semibold text-emerald-400">System Online</span>
          </div>
          <div className="h-6 w-px bg-slate-700"></div>
          <span className="text-xs text-slate-400 px-2">{new Date().toLocaleDateString()}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 mt-10">
        <StatsCard
          title="Total Users"
          value={users.length}
          icon={Users}
          trend={`${usersThisMonth} joined this month`}
          color="blue"
        />
        <StatsCard
          title="Active Tests"
          value={activeTestsCount}
          icon={FileText}
          trend={`${testsThisMonth} created this month`}
          color="indigo"
        />
        <StatsCard
          title="Pending Reviews"
          value={pendingReviewsCount}
          icon={AlertCircle}
          trend={pendingReviewsCount === 0 ? "All caught up" : "Requires attention"}
          color="amber"
          isAlert={pendingReviewsCount > 0}
        />
        <StatsCard
          title="Avg. Test Score"
          value={testPerformanceData.length > 0 ? (testPerformanceData.reduce((acc, curr) => acc + curr.score, 0) / testPerformanceData.length).toFixed(1) + "%" : "N/A"}
          icon={Activity}
          trend="Based on recent runs"
          color="emerald"
        />
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Large Chart: User Growth */}
        <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              New Registrations (6 Months)
            </h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={userGrowthData}>
                <defs>
                  <linearGradient id="colorStudents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="name" stroke="#9CA3AF" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                  itemStyle={{ color: '#8884d8' }}
                />
                <Area type="monotone" dataKey="students" stroke="#8884d8" fillOpacity={1} fill="url(#colorStudents)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Side Chart: Student Distribution */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" />
            Demographics
          </h3>
          <div className="h-[250px] w-full flex items-center justify-center relative">
            {studentDistributionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={studentDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {studentDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px', color: '#F3F4F6' }}
                    itemStyle={{ color: '#E5E7EB' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-500 text-sm">
                <p>No user category data</p>
              </div>
            )}

            {/* Center Text */}
            {studentDistributionData.length > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                <span className="text-2xl font-bold text-white">{users.length}</span>
                <span className="text-xs text-slate-400">Students</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Test Performance & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Bar Chart: Test Scores */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-sm shadow-xl">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            Test Scores (Avg)
          </h3>
          <div className="h-[250px] w-full">
            {testPerformanceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={testPerformanceData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                  <XAxis type="number" stroke="#9CA3AF" hide />
                  <YAxis dataKey="name" type="category" stroke="#9CA3AF" width={100} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151' }}
                  />
                  <Bar dataKey="score" fill="#34D399" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">
                No test performance data available yet.
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity List - Real Data */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-sm shadow-xl flex flex-col">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            Recent Activity
          </h3>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar max-h-[250px]">
            {recentActivity.length > 0 ? (
              recentActivity.map((item, idx) => (
                <div key={idx} className="flex gap-4 p-3 rounded-xl bg-slate-900/50 border border-slate-700/50 hover:border-slate-600 transition-colors">
                  <div className={`p-2 rounded-full h-fit ${item.type === 'user' ? 'bg-blue-500/20' : 'bg-indigo-500/20'}`}>
                    {item.type === 'user' ? <UserPlus className="w-4 h-4 text-blue-400" /> : <FilePlus className="w-4 h-4 text-indigo-400" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">
                      {item.type === 'user' ? "New User Registered" : "New Test Created"}
                    </h4>
                    <p className="text-xs text-slate-400 truncate max-w-[200px]">
                      {item.type === 'user' ? `${item.data.name} (${item.data.email})` : `"${item.data.title}"`}
                    </p>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      {new Date(item.date).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-slate-500 py-4">No recent activity.</div>
            )}
          </div>
        </div>
      </div>

      {/* System Status Panel (Footer) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatusPanel icon={Server} title="Server Status" status="Operational" color="emerald" />
        <StatusPanel icon={Database} title="Database" status="Connected" color="emerald" />
        <StatusPanel icon={Shield} title="Security" status="Active" color="blue" />
      </div>
    </div>
  );
}

// Reusable Components
const StatsCard = ({ title, value, icon: Icon, trend, color, isAlert }) => {
  const colorClasses = {
    blue: "from-blue-500/20 to-blue-600/5 text-blue-400 border-blue-500/30",
    indigo: "from-indigo-500/20 to-indigo-600/5 text-indigo-400 border-indigo-500/30",
    amber: "from-amber-500/20 to-amber-600/5 text-amber-400 border-amber-500/30",
    emerald: "from-emerald-500/20 to-emerald-600/5 text-emerald-400 border-emerald-500/30",
  };
  const bgGradient = colorClasses[color] || colorClasses.blue;
  return (
    <div className={`relative overflow-hidden bg-slate-800/40 border rounded-2xl p-5 backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${isAlert ? 'border-amber-500/50 shadow-amber-900/10' : 'border-slate-700/50'}`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-slate-400 text-sm font-medium mb-1">{title}</h3>
          <div className="text-3xl font-bold text-white">{value}</div>
        </div>
        <div className={`p-3 rounded-xl bg-gradient-to-br border shadow-inner ${bgGradient}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isAlert ? <AlertCircle className="w-3 h-3 text-amber-500" /> : <TrendingUp className="w-3 h-3 text-emerald-500" />}
        <span className={`text-xs font-medium ${isAlert ? 'text-amber-500' : 'text-emerald-500'}`}>{trend}</span>
      </div>
    </div>
  );
};

const StatusPanel = ({ icon: Icon, title, status, color }) => (
  <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
    <Icon className="w-8 h-8 text-slate-500" />
    <div>
      <h4 className="font-semibold text-sm">{title}</h4>
      <p className={`text-xs flex items-center gap-1 text-${color}-400`}>
        <span className={`w-1.5 h-1.5 rounded-full bg-${color}-500`}></span>
        {status}
      </p>
    </div>
  </div>
);
