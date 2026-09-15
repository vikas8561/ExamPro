import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiRequest from "../services/api";
import {
  Code,
  Code2,
  Search,
  X,
  SlidersHorizontal,
  Clock,
  Calendar,
  User,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Play,
  ArrowRight,
  Sparkles,
  Layers,
  Timer,
  CheckCircle,
  Hourglass,
  Terminal
} from "lucide-react";
import "../styles/StudentCodingTests.mobile.css";

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
      <div className="flex items-center justify-center gap-2 text-[#34D399] font-semibold text-xs text-center bg-emerald-500/10 py-2.5 px-3 rounded-xl border border-emerald-500/20">
        <CheckCircle2 className="w-4 h-4 animate-pulse" />
        <span>Challenge is now available to start!</span>
      </div>
    );
  }

  const TimeUnit = ({ value, label }) => (
    <div className="flex flex-col items-center">
      <div className="bg-[#20242D] border border-white/[0.08] rounded-xl px-2.5 py-1.5 min-w-[46px] flex flex-col items-center justify-center shadow-sm">
        <span className="text-sm font-bold font-mono text-white tracking-wider leading-none">
          {String(value).padStart(2, "0")}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-[#7E8594] font-medium mt-0.5">
          {label}
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center py-2 px-3 bg-[#133B42]/20 border border-[#00C4B4]/20 rounded-xl">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#00C4B4] animate-pulse" />
        <span className="text-[11px] font-semibold text-[#00C4B4] uppercase tracking-wider">
          Starts in
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {timeLeft.days > 0 && (
          <>
            <TimeUnit value={timeLeft.days} label="Days" />
            <span className="text-xs font-bold text-slate-500">:</span>
          </>
        )}
        <TimeUnit value={timeLeft.hours} label="Hrs" />
        <span className="text-xs font-bold text-slate-500">:</span>
        <TimeUnit value={timeLeft.minutes} label="Min" />
        <span className="text-xs font-bold text-slate-500">:</span>
        <TimeUnit value={timeLeft.seconds} label="Sec" />
      </div>
    </div>
  );
};

export default function StudentCodingTests() {
  const [tests, setTests] = useState([]);
  // Counts for every coding test, not just this page - see StudentAssignments.
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const nav = useNavigate();

  const fetchCodingTests = async (page = currentPage) => {
    setLoading(true);
    try {
      const data = await apiRequest(`/assignments/student?page=${page}&limit=9&type=coding`);

      if (data && data.assignments && data.pagination) {
        setTests(data.assignments);
        setStats(data.stats || null);
        setCurrentPage(data.pagination.currentPage);
        setTotalPages(data.pagination.totalPages);
        setTotalItems(data.pagination.totalItems);
      } else if (Array.isArray(data)) {
        const codingAssignments = data.filter((a) => a.testId?.type === "coding");
        setTests(codingAssignments);
        setStats(null);
        setTotalPages(1);
        setTotalItems(codingAssignments.length);
      } else {
        setTests([]);
        setStats(null);
        setTotalPages(1);
        setTotalItems(0);
      }
    } catch (e) {
      console.error(e);
      setTests([]);
      setStats(null);
      setTotalPages(1);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCodingTests(1);
  }, []);

  useEffect(() => {
    if (searchTerm || statusFilter !== "all") {
      setCurrentPage(1);
    }
  }, [searchTerm, statusFilter]);

  const formatDate = (dateString) => {
    if (!dateString) return "Not scheduled";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
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

  const handleStartTest = (assignmentId) => {
    nav(`/student/take-coding/${assignmentId}`);
  };

  const filteredTests = tests.filter((test) => {
    if (statusFilter !== "all" && test.status !== statusFilter) {
      return false;
    }
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (test.testId?.title || "").toLowerCase().includes(term) ||
      (test.testId?.subject || "").toLowerCase().includes(term) ||
      (test.mentorId?.name || "").toLowerCase().includes(term) ||
      test.status.toLowerCase().includes(term)
    );
  }).sort((a, b) => {
    const aStart = new Date(a.startTime || a.createdAt || 0);
    const bStart = new Date(b.startTime || b.createdAt || 0);
    if (aStart.getTime() === bStart.getTime()) {
      const aCreated = new Date(a.createdAt || 0);
      const bCreated = new Date(b.createdAt || 0);
      return bCreated - aCreated;
    }
    return bStart - aStart;
  });

  // Calculate status counts
  // Whole-set counts from the server: tallying `tests` counted one page.
  const assignedCount = stats?.assigned ?? 0;
  const inProgressCount = stats?.inProgress ?? 0;
  const completedCount = stats?.completed ?? 0;
  const overdueCount = stats?.overdue ?? 0;

  return (
    <div className="student-coding-tests-mobile min-h-screen bg-[#16181F] text-slate-100 font-sans p-6 lg:p-6 relative">
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
        @keyframes shimmer {
          0% { background-position: -800px 0; }
          100% { background-position: 800px 0; }
        }
        .skeleton-shimmer {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.03) 0%,
            rgba(255, 255, 255, 0.07) 50%,
            rgba(255, 255, 255, 0.03) 100%
          );
          background-size: 800px 100%;
          animation: shimmer 1.8s infinite;
        }
      `}</style>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Header Row - Exactly aligned with Sidebar's CodingGita section */}
        <div
          className="flex flex-col md:flex-row md:items-center justify-between pb-5 mb-6 gap-4"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", minHeight: "3.5rem" }}
        >
          {/* Left: Section branding aligned with Sidebar baseline */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#133B42] border border-[#00C4B4]/20 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Code className="w-5 h-5 text-[#00C4B4]" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                Coding Tests
              </h1>
              <p className="text-xs text-[#7E8594] mt-0.5">
                {totalItems > 0 ? `${totalItems} programming challenges assigned` : `${tests.length} coding challenges`} • Hands-on evaluations
              </p>
            </div>
          </div>

          {/* Right Controls: Search Input + Filter Toggle Button */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* Search Bar */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#7E8594] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search coding tests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-[#20242D] border border-white/[0.08] text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/40 focus:ring-1 focus:ring-[#00C4B4]/30 transition-all shadow-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7E8594] hover:text-white transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Toggle Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 shadow-sm flex-shrink-0 ${
                showFilters || statusFilter !== "all"
                  ? "bg-[#133B42] text-[#00C4B4] border-[#00C4B4]/40 shadow-[0_0_12px_rgba(0,196,180,0.15)]"
                  : "bg-[#20242D] text-slate-300 border-white/[0.08] hover:bg-[#282C38] hover:text-white"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
              {statusFilter !== "all" && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#00C4B4]" />
              )}
            </button>
          </div>
        </div>

        {/* Expandable Filter Chips Section */}
        {(showFilters || statusFilter !== "all") && (
          <div className="p-4 rounded-2xl bg-[#181A22] border border-white/[0.06] shadow-sm transition-all">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-[#7E8594] mr-1">Status:</span>
                {["all", "Assigned", "In Progress", "Completed", "Overdue"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      statusFilter === status
                        ? "bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/30 shadow-sm"
                        : "bg-[#20242D] text-slate-400 hover:text-white border border-white/[0.04]"
                    }`}
                  >
                    {status === "all" ? "All Challenges" : status}
                  </button>
                ))}
              </div>

              {(statusFilter !== "all" || searchTerm) && (
                <button
                  onClick={() => {
                    setStatusFilter("all");
                    setSearchTerm("");
                  }}
                  className="inline-flex items-center gap-1 text-xs text-[#7E8594] hover:text-[#00C4B4] transition-colors font-medium"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset filters</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* KPI Summary Overview Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-[#181A22] border border-white/[0.05] flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#20242D] flex items-center justify-center text-[#00C4B4] flex-shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[#7E8594] uppercase tracking-wider font-medium">Assigned</p>
              <p className="text-sm font-bold text-white leading-tight mt-0.5">{assignedCount}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#181A22] border border-white/[0.05] flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#20242D] flex items-center justify-center text-[#38BDF8] flex-shrink-0">
              <Hourglass className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[#7E8594] uppercase tracking-wider font-medium">In Progress</p>
              <p className="text-sm font-bold text-white leading-tight mt-0.5">{inProgressCount}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#181A22] border border-white/[0.05] flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#20242D] flex items-center justify-center text-[#34D399] flex-shrink-0">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[#7E8594] uppercase tracking-wider font-medium">Completed</p>
              <p className="text-sm font-bold text-white leading-tight mt-0.5">{completedCount}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#181A22] border border-white/[0.05] flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#20242D] flex items-center justify-center text-[#F87171] flex-shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[#7E8594] uppercase tracking-wider font-medium">Overdue</p>
              <p className="text-sm font-bold text-white leading-tight mt-0.5">{overdueCount}</p>
            </div>
          </div>
        </div>

        {/* Content Section: Cards Grid or Empty/Loading States */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="rounded-2xl p-5 bg-[#181A22] border border-white/[0.05] space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="w-20 h-5 rounded-md skeleton-shimmer" />
                  <div className="w-16 h-5 rounded-md skeleton-shimmer" />
                </div>
                <div className="w-3/4 h-5 rounded-lg skeleton-shimmer" />
                <div className="space-y-2 pt-2">
                  <div className="w-full h-8 rounded-xl skeleton-shimmer" />
                  <div className="w-full h-8 rounded-xl skeleton-shimmer" />
                </div>
                <div className="w-full h-9 rounded-xl skeleton-shimmer pt-2" />
              </div>
            ))}
          </div>
        ) : tests.length === 0 ? (
          <div className="rounded-2xl bg-[#181A22] border border-white/[0.05] p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-[#20242D] border border-white/[0.08] flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Code className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">No Coding Tests Assigned</h3>
            <p className="text-xs text-[#7E8594] max-w-sm mx-auto">
              Coding challenges and programming assessments will appear here once assigned by your instructors.
            </p>
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="rounded-2xl bg-[#181A22] border border-white/[0.05] p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-[#20242D] border border-white/[0.08] flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">No Challenges Match Your Search</h3>
            <p className="text-xs text-[#7E8594] mb-4">
              Try adjusting your search terms or clearing status filters.
            </p>
            <button
              onClick={() => {
                setStatusFilter("all");
                setSearchTerm("");
              }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/30 hover:bg-[#1A4C55] transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Search</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTests.map((assignment) => {
              const testTitle = assignment.testId?.title || "Untitled Challenge";
              const subject = assignment.testId?.subject || "Coding";
              const mentorName = assignment.mentorId?.name || "Instructor";
              // The list endpoint sends questionCount and deliberately does not
              // send the questions themselves, so neither of the fields this
              // used to read exists - it always fell through to a hard-coded 1.
              const problemsCount = assignment.testId?.questionCount || 0;
              const deadlinePassed = isDeadlinePassed(assignment.startTime, assignment.duration);
              const testAvailable = isTestAvailable(assignment.startTime, assignment.duration);
              const testNotStarted = isTestNotStarted(assignment.startTime);

              // Status badge styling
              const getStatusBadge = () => {
                if (assignment.status === "Completed") {
                  return (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-[#34D399] border border-emerald-500/20 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Completed</span>
                    </span>
                  );
                }
                if (assignment.status === "In Progress") {
                  return (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-500/10 text-[#38BDF8] border border-sky-500/20 inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] animate-pulse" />
                      <span>In Progress</span>
                    </span>
                  );
                }
                if (assignment.status === "Overdue" || (assignment.status === "Assigned" && deadlinePassed)) {
                  return (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-500/10 text-[#F87171] border border-red-500/20 inline-flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      <span>Deadline Passed</span>
                    </span>
                  );
                }
                if (testNotStarted) {
                  return (
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 text-[#FB923C] border border-amber-500/20 inline-flex items-center gap-1">
                      <Timer className="w-3 h-3" />
                      <span>Upcoming</span>
                    </span>
                  );
                }
                return (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/20 inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>Available</span>
                  </span>
                );
              };

              return (
                <div
                  key={assignment._id}
                  className="rounded-2xl p-5 bg-[#181A22] border border-white/[0.06] hover:border-[#00C4B4]/30 hover:bg-[#1C1F2A] transition-all duration-300 flex flex-col justify-between group shadow-sm hover:shadow-lg"
                >
                  <div>
                    {/* Top Row: Subject pill + Status badge */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/25 capitalize tracking-wide flex items-center gap-1.5">
                        <Terminal className="w-3 h-3 text-[#00C4B4]" />
                        <span>{subject}</span>
                      </span>
                      {getStatusBadge()}
                    </div>

                    {/* Test Title */}
                    <h3
                      className="text-sm sm:text-base font-semibold text-white tracking-tight leading-snug line-clamp-2 mb-4 group-hover:text-[#00C4B4] transition-colors"
                      title={testTitle}
                    >
                      {testTitle}
                    </h3>

                    {/* Metadata Chips Grid */}
                    <div className="grid grid-cols-2 gap-2 mb-5">
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-[#20242D]/60 border border-white/[0.03]">
                        <Calendar className="w-3.5 h-3.5 text-[#00C4B4] flex-shrink-0" />
                        <span className="text-xs text-slate-300 truncate font-medium">
                          {formatDate(assignment.startTime)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 p-2 rounded-xl bg-[#20242D]/60 border border-white/[0.03]">
                        <Clock className="w-3.5 h-3.5 text-[#38BDF8] flex-shrink-0" />
                        <span className="text-xs text-slate-300 truncate font-medium">
                          {assignment.duration} mins
                        </span>
                      </div>

                      <div className="flex items-center gap-2 p-2 rounded-xl bg-[#20242D]/60 border border-white/[0.03]">
                        <Code2 className="w-3.5 h-3.5 text-[#A78BFA] flex-shrink-0" />
                        <span className="text-xs text-slate-300 truncate font-medium">
                          {problemsCount} Problem{problemsCount !== 1 ? "s" : ""}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 p-2 rounded-xl bg-[#20242D]/60 border border-white/[0.03]">
                        <User className="w-3.5 h-3.5 text-[#FB923C] flex-shrink-0" />
                        <span className="text-xs text-slate-300 truncate font-medium">
                          {mentorName}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Row with EXACT Button Colors */}
                  <div className="pt-3 border-t border-white/[0.05] space-y-2">
                    {/* Countdown for Upcoming Not Started Test */}
                    {assignment.status === "Assigned" && testNotStarted && (
                      <div className="mb-2">
                        <CountdownTimer
                          startTime={assignment.startTime}
                          onTimerComplete={() => fetchCodingTests(currentPage)}
                        />
                      </div>
                    )}

                    {/* ⚪ WHITE BUTTON: Start Test (Not Started / Available) */}
                    {assignment.status === "Assigned" && testAvailable && (
                      <button
                        onClick={() => handleStartTest(assignment._id)}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs bg-white hover:bg-slate-100 text-slate-900 transition-all duration-200 active:scale-95 shadow-sm"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start Coding Challenge</span>
                      </button>
                    )}

                    {/* ⚪ WHITE BUTTON: Continue Test (In Progress within deadline) */}
                    {assignment.status === "In Progress" && !deadlinePassed && (
                      <button
                        onClick={() => nav(`/student/take-coding/${assignment._id}`)}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs bg-white hover:bg-slate-100 text-slate-900 transition-all duration-200 active:scale-95 shadow-sm"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Continue Coding Challenge</span>
                      </button>
                    )}

                    {/* 🔴 RED BUTTON: Deadline Passed (Assigned or Overdue) */}
                    {assignment.status === "Assigned" && deadlinePassed && (
                      <button
                        disabled
                        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs bg-red-500/15 text-[#F87171] border border-red-500/30 cursor-not-allowed opacity-90 shadow-sm"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Deadline Passed</span>
                      </button>
                    )}

                    {assignment.status === "Overdue" && (
                      <button
                        disabled
                        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs bg-red-500/15 text-[#F87171] border border-red-500/30 cursor-not-allowed opacity-90 shadow-sm"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Deadline Passed</span>
                      </button>
                    )}

                    {/* 🟢 GREEN BUTTON: In Progress but Deadline Passed -> View Results */}
                    {assignment.status === "In Progress" && deadlinePassed && (
                      <button
                        onClick={() => nav(`/student/view-test/${assignment._id}`)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all duration-200 active:scale-95 shadow-sm"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>View Results</span>
                      </button>
                    )}

                    {/* 🟢 GREEN BUTTON: Completed Test -> View Results / View Submission */}
                    {assignment.status === "Completed" && (
                      deadlinePassed ? (
                        <button
                          onClick={() => nav(`/student/view-test/${assignment._id}`)}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all duration-200 active:scale-95 shadow-sm"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{assignment.reviewStatus === "Reviewed" ? "View Results" : "View Submission"}</span>
                        </button>
                      ) : (
                        <button
                          disabled
                          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs bg-emerald-500/15 text-[#34D399] border border-emerald-500/30 cursor-not-allowed opacity-90 shadow-sm"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Results Available After Deadline</span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {totalItems > 0 && totalPages > 1 && !loading && (
          <div className="mt-8 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/[0.05]">
            <p className="text-xs text-[#7E8594]">
              Page <span className="text-white font-medium">{currentPage}</span> of{" "}
              <span className="text-white font-medium">{totalPages}</span>
            </p>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  if (currentPage > 1) {
                    const newPage = currentPage - 1;
                    setCurrentPage(newPage);
                    fetchCodingTests(newPage);
                  }
                }}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#20242D] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-[#282C38] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  const isActive = pageNum === currentPage;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => {
                        if (pageNum !== currentPage) {
                          setCurrentPage(pageNum);
                          fetchCodingTests(pageNum);
                        }
                      }}
                      className={`w-8 h-8 rounded-xl text-xs font-bold transition-all ${
                        isActive
                          ? "bg-[#00C4B4] text-[#0B1220] shadow-[0_0_12px_rgba(0,196,180,0.3)]"
                          : "bg-[#20242D] border border-white/[0.06] text-slate-400 hover:text-white hover:bg-[#282C38]"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => {
                  if (currentPage < totalPages) {
                    const newPage = currentPage + 1;
                    setCurrentPage(newPage);
                    fetchCodingTests(newPage);
                  }
                }}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#20242D] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-[#282C38] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
