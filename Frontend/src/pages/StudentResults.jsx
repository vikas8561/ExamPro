import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import apiRequest from "../services/api";
import { getRandomFeedback } from "../utils/feedbackMessages";
import {
  Trophy,
  Award,
  Search,
  X,
  RotateCcw,
  CheckCircle2,
  Clock,
  Calendar,
  ArrowRight,
  LayoutGrid,
  List,
  MessageSquareQuote,
  TrendingUp,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Code2,
  FileText,
  HelpCircle,
  BarChart3,
  SlidersHorizontal
} from "lucide-react";
import "../styles/StudentResults.mobile.css";

const StudentResults = () => {
  const navigate = useNavigate();
  const [completedTests, setCompletedTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Filter & View states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'table'

  useEffect(() => {
    fetchCompletedTests(1, true);
  }, []);

  const fetchCompletedTests = async (page = currentPage, isInitialLoad = false) => {
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setTableLoading(true);
    }

    try {
      const response = await apiRequest(`/test-submissions/student?page=${page}&limit=10`);

      if (response && response.submissions && response.pagination) {
        setCompletedTests(response.submissions);
        setCurrentPage(response.pagination.currentPage);
        setTotalPages(response.pagination.totalPages);
        setTotalItems(response.pagination.totalItems);
      } else if (Array.isArray(response)) {
        setCompletedTests(response);
        setTotalPages(1);
        setTotalItems(response.length);
      } else {
        setCompletedTests([]);
        setTotalPages(1);
        setTotalItems(0);
      }
    } catch (error) {
      console.error("Error fetching completed tests:", error);
      setCompletedTests([]);
      setTotalPages(1);
      setTotalItems(0);
    } finally {
      setLoading(false);
      setTableLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCompletedTests(currentPage, false);
  };

  // Helper to parse scores and deadline
  const getItemData = (item) => {
    const testTitle = item.testId?.title || item.name || "Examination";
    const testType = item.testId?.type || "Standard";
    const assignmentId = item.assignmentId?._id || item.assignmentId;
    const assignmentDeadline = item.assignmentId?.deadline ? new Date(item.assignmentId.deadline) : null;
    const deadlinePassed = !assignmentDeadline || new Date() > assignmentDeadline;

    const score = item.mentorScore !== null && item.mentorScore !== undefined
      ? item.mentorScore
      : item.maxScore && item.maxScore > 0
      ? Math.round((item.totalScore / item.maxScore) * 100)
      : Math.round(item.totalScore || 0);

    const feedback = item.mentorFeedback || item.feedback || getRandomFeedback(score, item._id || item.testId?._id);
    const isReviewed = item.reviewStatus === "Reviewed" || Boolean(item.mentorReviewed);

    // Format time spent
    let formattedTime = "N/A";
    if (item.timeSpent) {
      const mins = Math.floor(item.timeSpent / 60);
      const secs = item.timeSpent % 60;
      formattedTime = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }

    return {
      testTitle,
      testType,
      assignmentId,
      assignmentDeadline,
      deadlinePassed,
      score,
      feedback,
      isReviewed,
      formattedTime,
      submittedDate: item.submittedAt ? new Date(item.submittedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      }) : "N/A"
    };
  };

  // KPI Calculations across current dataset
  const kpis = useMemo(() => {
    if (!completedTests || completedTests.length === 0) {
      return { total: totalItems, avgScore: 0, highestScore: 0, reviewedCount: 0 };
    }

    let totalScoreSum = 0;
    let scoredCount = 0;
    let max = 0;
    let reviewed = 0;

    completedTests.forEach((item) => {
      const data = getItemData(item);
      if (data.deadlinePassed) {
        totalScoreSum += data.score;
        scoredCount += 1;
        if (data.score > max) max = data.score;
      }
      if (data.isReviewed) reviewed += 1;
    });

    const avg = scoredCount > 0 ? Math.round(totalScoreSum / scoredCount) : 0;
    return {
      total: totalItems,
      avgScore: avg,
      highestScore: max,
      reviewedCount: reviewed
    };
  }, [completedTests, totalItems]);

  // Client-side filtering
  const filteredTests = useMemo(() => {
    return completedTests.filter((item) => {
      const data = getItemData(item);
      const matchesSearch =
        data.testTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        data.testType.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType =
        selectedType === "all" ||
        data.testType.toLowerCase() === selectedType.toLowerCase();

      return matchesSearch && matchesType;
    });
  }, [completedTests, searchQuery, selectedType]);

  // Score Color Helper
  const getScoreColor = (score) => {
    if (score >= 80) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    if (score >= 60) return "text-[#00C4B4] bg-[#133B42]/40 border-[#00C4B4]/20";
    if (score >= 40) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    return "text-red-400 bg-red-500/10 border-red-500/20";
  };

  return (
    <div className="min-h-screen bg-[#16181F] text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* 1. Synchronized Header Baseline matching CodingGita Sidebar */}
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 mb-6 border-b border-white/[0.05]"
          style={{ minHeight: "3.5rem" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#00C4B4]/10 border border-[#00C4B4]/20 flex items-center justify-center text-[#00C4B4] shadow-[0_0_15px_rgba(0,196,180,0.15)] flex-shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight leading-tight">
                Completed Examinations
              </h1>
              <p className="text-xs text-[#7E8594] mt-0.5">
                {totalItems} examination{totalItems !== 1 ? "s" : ""} completed • Performance and review insights
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* View Mode Toggle */}
            <div className="flex items-center p-1 rounded-xl bg-[#20242D] border border-white/[0.06]">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === "grid"
                    ? "bg-[#00C4B4] text-[#0B1220] shadow-sm"
                    : "text-[#7E8594] hover:text-white"
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === "table"
                    ? "bg-[#00C4B4] text-[#0B1220] shadow-sm"
                    : "text-[#7E8594] hover:text-white"
                }`}
                title="Table View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-[#20242D] border border-white/[0.06] text-slate-300 hover:text-white hover:bg-[#282C38] transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#00C4B4]" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 2. Interactive KPI Overview Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-[#00C4B4]/10 border border-[#00C4B4]/20 flex items-center justify-center text-[#00C4B4] flex-shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#7E8594] uppercase tracking-wider">Completed</p>
              <h3 className="text-xl font-bold text-white tracking-tight mt-0.5">{kpis.total}</h3>
            </div>
          </div>

          <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-[#34D399]/10 border border-[#34D399]/20 flex items-center justify-center text-[#34D399] flex-shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#7E8594] uppercase tracking-wider">Avg Score</p>
              <h3 className="text-xl font-bold text-white tracking-tight mt-0.5">{kpis.avgScore}%</h3>
            </div>
          </div>

          <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-[#FBBF24]/10 border border-[#FBBF24]/20 flex items-center justify-center text-[#FBBF24] flex-shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#7E8594] uppercase tracking-wider">Top Score</p>
              <h3 className="text-xl font-bold text-white tracking-tight mt-0.5">{kpis.highestScore}%</h3>
            </div>
          </div>

          <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-4 flex items-center gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-[#A78BFA]/10 border border-[#A78BFA]/20 flex items-center justify-center text-[#A78BFA] flex-shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#7E8594] uppercase tracking-wider">Reviewed</p>
              <h3 className="text-xl font-bold text-white tracking-tight mt-0.5">{kpis.reviewedCount}</h3>
            </div>
          </div>
        </div>

        {/* 3. Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#181A22] border border-white/[0.06] rounded-2xl p-3 shadow-sm">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#7E8594] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by test name or category..."
              className="w-full bg-[#20242D] border border-white/[0.06] rounded-xl pl-9.5 pr-8 py-2 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 focus:ring-1 focus:ring-[#00C4B4]/20 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7E8594] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Type Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
            {[
              { id: "all", label: "All Tests" },
              { id: "mcq", label: "Standard / MCQ" },
              { id: "coding", label: "Coding" }
            ].map((tab) => {
              const isActive = selectedType === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedType(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-[#00C4B4] text-[#0B1220] font-semibold shadow-sm"
                      : "bg-[#20242D] border border-white/[0.06] text-[#7E8594] hover:text-white hover:bg-[#282C38]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Content Area: Skeleton, Empty State, Grid or Table */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div
                key={idx}
                className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-5 space-y-4 animate-pulse"
              >
                <div className="flex items-center justify-between">
                  <div className="h-5 w-20 bg-white/[0.06] rounded-lg" />
                  <div className="h-5 w-16 bg-white/[0.06] rounded-lg" />
                </div>
                <div className="h-6 w-3/4 bg-white/[0.06] rounded-lg" />
                <div className="h-16 w-full bg-white/[0.04] rounded-xl" />
                <div className="h-9 w-full bg-white/[0.06] rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-12 text-center shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-[#00C4B4]/10 border border-[#00C4B4]/20 flex items-center justify-center text-[#00C4B4] mx-auto mb-3 shadow-[0_0_15px_rgba(0,196,180,0.15)]">
              <Trophy className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">No Completed Tests Found</h3>
            <p className="text-xs text-[#7E8594] max-w-sm mx-auto mt-1">
              {searchQuery || selectedType !== "all"
                ? "No completed examinations match your search or filter criteria."
                : "You have not completed any examinations yet. Head over to Assigned Tests to get started!"}
            </p>
            {(searchQuery || selectedType !== "all") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedType("all");
                }}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#20242D] border border-white/[0.08] text-white hover:bg-[#282C38] transition-all"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          /* High-Density Responsive Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTests.map((item, idx) => {
              const data = getItemData(item);
              const scoreClass = getScoreColor(data.score);

              return (
                <div
                  key={item._id || idx}
                  className="group bg-[#181A22] border border-white/[0.06] hover:border-[#00C4B4]/30 hover:bg-[#1C1F2A] rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 shadow-sm"
                >
                  <div className="space-y-3.5">
                    {/* Top Badges Row */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/20 uppercase tracking-wide">
                        {data.testType}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                          data.isReviewed
                            ? "bg-purple-500/10 text-[#C084FC] border-purple-500/20"
                            : "bg-emerald-500/10 text-[#34D399] border-emerald-500/20"
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{data.isReviewed ? "Reviewed" : "Completed"}</span>
                      </span>
                    </div>

                    {/* Test Title */}
                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-[#00C4B4] transition-colors line-clamp-2 leading-snug">
                        {data.testTitle}
                      </h3>
                    </div>

                    {/* Score / Performance Display */}
                    <div className="p-3 rounded-xl bg-[#20242D]/80 border border-white/[0.04] flex items-center justify-between">
                      {data.deadlinePassed ? (
                        <>
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-[#7E8594] block">
                              Final Score
                            </span>
                            <span className="text-xs text-slate-400 font-medium">
                              {item.totalScore !== undefined && item.maxScore
                                ? `${item.totalScore} / ${item.maxScore} pts`
                                : "Evaluated"}
                            </span>
                          </div>
                          <div className={`px-3 py-1 rounded-xl text-base font-extrabold border ${scoreClass} flex items-center gap-1 shadow-sm`}>
                            <span>{data.score}%</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-amber-300 w-full py-0.5">
                          <Clock className="w-4 h-4 text-amber-400 animate-pulse flex-shrink-0" />
                          <span className="text-xs font-medium text-amber-300/90 leading-tight">
                            Score hidden until exam deadline passes
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Feedback Snippet */}
                    <div className="p-2.5 rounded-xl bg-[#16181F]/70 border border-white/[0.03] flex items-start gap-2">
                      <MessageSquareQuote className="w-3.5 h-3.5 text-[#00C4B4] flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-slate-400 italic line-clamp-2 leading-relaxed">
                        "{data.feedback}"
                      </p>
                    </div>

                    {/* Metadata Row */}
                    <div className="grid grid-cols-2 gap-2 pt-1 text-[#7E8594]">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Calendar className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
                        <span className="truncate">{data.submittedDate}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
                        <span className="truncate">{data.formattedTime} spent</span>
                      </div>
                    </div>
                  </div>

                  {/* STRICT BUTTON COLORS: Completed Test gets Green Action Button */}
                  <div className="pt-4 mt-2 border-t border-white/[0.05]">
                    {data.deadlinePassed ? (
                      <button
                        onClick={() => {
                          if (data.assignmentId) {
                            navigate(`/student/view-test/${data.assignmentId}`);
                          }
                        }}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all duration-200 active:scale-95 shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{data.isReviewed ? "View Results & Feedback" : "View Submission"}</span>
                      </button>
                    ) : (
                      <button
                        disabled
                        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs bg-emerald-500/15 text-[#34D399] border border-emerald-500/30 cursor-not-allowed opacity-90 shadow-sm"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Results Available After Deadline</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Sleek Minimalist Table View */
          <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#20242D] border-b border-white/[0.06] text-[11px] font-semibold uppercase tracking-wider text-[#7E8594]">
                    <th className="py-3.5 px-4">#</th>
                    <th className="py-3.5 px-4">Examination</th>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4 text-center">Score</th>
                    <th className="py-3.5 px-4">Feedback Note</th>
                    <th className="py-3.5 px-4">Submitted</th>
                    <th className="py-3.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {filteredTests.map((item, idx) => {
                    const data = getItemData(item);
                    const scoreClass = getScoreColor(data.score);

                    return (
                      <tr
                        key={item._id || idx}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-4 px-4 text-xs font-mono text-slate-500">
                          {idx + 1 + (currentPage - 1) * 10}
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-xs font-bold text-white leading-tight">
                            {data.testTitle}
                          </p>
                          <span className="text-[10px] text-slate-400 mt-0.5 inline-block">
                            Time spent: {data.formattedTime}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/20 uppercase">
                            {data.testType}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          {data.deadlinePassed ? (
                            <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-extrabold border ${scoreClass}`}>
                              {data.score}%
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-md text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 whitespace-nowrap">
                              Post-deadline
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 max-w-xs">
                          <p className="text-xs text-slate-400 italic truncate">
                            "{data.feedback}"
                          </p>
                        </td>
                        <td className="py-4 px-4 text-xs text-slate-400 whitespace-nowrap">
                          {data.submittedDate}
                        </td>
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          {data.deadlinePassed ? (
                            <button
                              onClick={() => {
                                if (data.assignmentId) {
                                  navigate(`/student/view-test/${data.assignmentId}`);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-semibold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-sm active:scale-95"
                            >
                              <span>View</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          ) : (
                            <span className="text-[11px] font-medium text-[#34D399] px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                              Available Soon
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. Minimalist Dark Pagination Controls */}
        {totalItems > 0 && totalPages > 1 && !loading && (
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/[0.05]">
            <p className="text-xs text-[#7E8594]">
              Page <span className="text-white font-medium">{currentPage}</span> of{" "}
              <span className="text-white font-medium">{totalPages}</span> • Total{" "}
              <span className="text-white font-medium">{totalItems}</span> submissions
            </p>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  if (currentPage > 1) {
                    const newPage = currentPage - 1;
                    setCurrentPage(newPage);
                    fetchCompletedTests(newPage, false);
                  }
                }}
                disabled={currentPage === 1 || tableLoading}
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
                        if (pageNum !== currentPage && !tableLoading) {
                          setCurrentPage(pageNum);
                          fetchCompletedTests(pageNum, false);
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
                    fetchCompletedTests(newPage, false);
                  }
                }}
                disabled={currentPage === totalPages || tableLoading}
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
};

export default StudentResults;
