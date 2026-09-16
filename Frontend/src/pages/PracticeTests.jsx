import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiRequest from "../services/api";
import {
  BookOpen,
  Search,
  X,
  SlidersHorizontal,
  Clock,
  HelpCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  AlertCircle,
  Play,
  Eye,
  Sparkles,
  Layers
} from "lucide-react";
import "../styles/PracticeTests.mobile.css";

const PracticeTests = () => {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [attemptedTests, setAttemptedTests] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPracticeTests(1);
  }, []);

  // Reset to page 1 when search term or filter changes
  useEffect(() => {
    if (searchTerm || subjectFilter !== "all") {
      setCurrentPage(1);
    }
  }, [searchTerm, subjectFilter]);

  // Which of the cards on screen has this student already attempted?
  //
  // One request for the whole page. This used to fire a separate
  // /practice-tests/:id/attempts call per card -- nine authenticated round
  // trips, each with its own session lookup and query, all to fill in nine
  // "Attempted" badges, and all of them starting only once the list itself had
  // finished loading.
  const checkAttemptedTests = async (list) => {
    if (!list.length) return;

    try {
      const ids = list.map((test) => test._id).join(",");
      const data = await apiRequest(`/practice-tests/attempted?ids=${ids}`);
      setAttemptedTests(new Set(data?.testIds || []));
    } catch (err) {
      console.error("Error checking attempted tests:", err);
    }
  };

  useEffect(() => {
    if (tests.length > 0) {
      checkAttemptedTests(tests);
    }
  }, [tests]);

  const fetchPracticeTests = async (page = currentPage) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest(`/practice-tests?page=${page}&limit=9`);

      if (data && data.tests && data.pagination) {
        setTests(data.tests);
        setCurrentPage(data.pagination.currentPage);
        setTotalPages(data.pagination.totalPages);
        setTotalItems(data.pagination.totalItems);
      } else if (data && data.tests) {
        setTests(data.tests);
        setTotalPages(1);
        setTotalItems(data.tests.length);
      } else {
        setTests([]);
        setTotalPages(1);
        setTotalItems(0);
      }
    } catch (err) {
      console.error("Error fetching practice tests:", err);
      setTests([]);
      setError("Failed to load practice tests. Please try again.");
      setTotalPages(1);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  };

  const handleStartPracticeTest = (testId) => {
    navigate(`/student/practice-test/${testId}`);
  };

  const handleViewResults = (testId) => {
    navigate(`/student/practice-test-results/${testId}`);
  };

  const filteredTests = tests.filter((test) => {
    if (subjectFilter !== "all" && test.subject !== subjectFilter) {
      return false;
    }
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (test.title || "").toLowerCase().includes(term) ||
      (test.subject || "").toLowerCase().includes(term) ||
      (test.createdBy?.name || "").toLowerCase().includes(term)
    );
  });

  if (error) {
    return (
      <div className="min-h-screen bg-[#16181F] text-slate-100 font-sans p-6 lg:p-6 flex items-center justify-center">
        <div className="max-w-md w-full bg-[#181A22] border border-red-500/20 rounded-2xl p-6 text-center shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4 text-red-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-white mb-2">Unable to Load Practice Tests</h2>
          <p className="text-xs text-[#8E95A5] mb-5">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setError(null);
                fetchPracticeTests(currentPage);
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/30 hover:bg-[#1A4C55] transition-all"
            >
              Try Again
            </button>
            <button
              onClick={() => {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
                localStorage.removeItem("userId");
                window.location.href = "/login";
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#20242D] text-slate-300 border border-white/[0.08] hover:bg-[#282C38] transition-all"
            >
              Log In Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="practice-tests-mobile min-h-screen bg-[#16181F] text-slate-100 font-sans p-6 lg:p-6 relative">
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
              <BookOpen className="w-5 h-5 text-[#00C4B4]" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                Practice Tests
              </h1>
              <p className="text-xs text-[#7E8594] mt-0.5">
                {totalItems > 0 ? `${totalItems} assessments available` : `${tests.length} assessments`} • Self-paced preparation
              </p>
            </div>
          </div>

          {/* Right Controls: Search Input + Filter Toggle Pill */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
            {/* Search Bar */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#7E8594] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search practice tests..."
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
                showFilters || subjectFilter !== "all"
                  ? "bg-[#133B42] text-[#00C4B4] border-[#00C4B4]/40 shadow-[0_0_12px_rgba(0,196,180,0.15)]"
                  : "bg-[#20242D] text-slate-300 border-white/[0.08] hover:bg-[#282C38] hover:text-white"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
              {subjectFilter !== "all" && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#00C4B4]" />
              )}
            </button>
          </div>
        </div>

        {/* Expandable Subject Filter Bar */}
        {(showFilters || subjectFilter !== "all") && (
          <div className="p-4 rounded-2xl bg-[#181A22] border border-white/[0.06] shadow-sm transition-all">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-[#7E8594] mr-1">Subject:</span>
                <button
                  onClick={() => setSubjectFilter("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    subjectFilter === "all"
                      ? "bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/30 shadow-sm"
                      : "bg-[#20242D] text-slate-400 hover:text-white border border-white/[0.04]"
                  }`}
                >
                  All Subjects
                </button>
                {Array.from(new Set(tests.map((test) => test.subject).filter(Boolean))).map((subj) => (
                  <button
                    key={subj}
                    onClick={() => setSubjectFilter(subj)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                      subjectFilter === subj
                        ? "bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/30 shadow-sm"
                        : "bg-[#20242D] text-slate-400 hover:text-white border border-white/[0.04]"
                    }`}
                  >
                    {subj}
                  </button>
                ))}
              </div>

              {(subjectFilter !== "all" || searchTerm) && (
                <button
                  onClick={() => {
                    setSubjectFilter("all");
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-[#181A22] border border-white/[0.05] flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#20242D] flex items-center justify-center text-[#00C4B4] flex-shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[#7E8594] uppercase tracking-wider font-medium">Available</p>
              <p className="text-sm font-bold text-white leading-tight mt-0.5">{totalItems || tests.length}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#181A22] border border-white/[0.05] flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#20242D] flex items-center justify-center text-[#34D399] flex-shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[#7E8594] uppercase tracking-wider font-medium">Attempted</p>
              <p className="text-sm font-bold text-white leading-tight mt-0.5">{attemptedTests.size}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#181A22] border border-white/[0.05] flex items-center gap-3 col-span-2 sm:col-span-1">
            <div className="w-8 h-8 rounded-xl bg-[#20242D] flex items-center justify-center text-[#FB923C] flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[#7E8594] uppercase tracking-wider font-medium">Filtered</p>
              <p className="text-sm font-bold text-white leading-tight mt-0.5">{filteredTests.length} showing</p>
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
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">No Practice Tests Available</h3>
            <p className="text-xs text-[#7E8594] max-w-sm mx-auto">
              Practice assessments will appear here once they are published by instructors.
            </p>
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="rounded-2xl bg-[#181A22] border border-white/[0.05] p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-[#20242D] border border-white/[0.08] flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">No Tests Match Your Search</h3>
            <p className="text-xs text-[#7E8594] mb-4">
              Try adjusting your search terms or clearing filters.
            </p>
            <button
              onClick={() => {
                setSubjectFilter("all");
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
            {filteredTests.map((test) => {
              const isAttempted = attemptedTests.has(test._id);
              return (
                <div
                  key={test._id}
                  className="rounded-2xl p-5 bg-[#181A22] border border-white/[0.06] hover:border-[#00C4B4]/30 hover:bg-[#1C1F2A] transition-all duration-300 flex flex-col justify-between group shadow-sm hover:shadow-lg"
                >
                  <div>
                    {/* Top Row: Subject pill + Attempted badge */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/25 capitalize tracking-wide">
                        {test.subject || "General"}
                      </span>

                      {isAttempted && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-[#34D399] border border-emerald-500/20 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Attempted</span>
                        </span>
                      )}
                    </div>

                    {/* Test Title */}
                    <h3
                      className="text-sm sm:text-base font-semibold text-white tracking-tight leading-snug line-clamp-2 mb-4 group-hover:text-[#00C4B4] transition-colors"
                      title={test.title}
                    >
                      {test.title}
                    </h3>

                    {/* Metadata Chips Grid */}
                    <div className="grid grid-cols-2 gap-2 mb-5">
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-[#20242D]/60 border border-white/[0.03]">
                        <Clock className="w-3.5 h-3.5 text-[#00C4B4] flex-shrink-0" />
                        <span className="text-xs text-slate-300 truncate font-medium">
                          {test.timeLimit} mins
                        </span>
                      </div>

                      <div className="flex items-center gap-2 p-2 rounded-xl bg-[#20242D]/60 border border-white/[0.03]">
                        <HelpCircle className="w-3.5 h-3.5 text-[#38BDF8] flex-shrink-0" />
                        <span className="text-xs text-slate-300 truncate font-medium">
                          {test.questionCount || 0} Questions
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="pt-3 border-t border-white/[0.05] space-y-2">
                    <button
                      onClick={() => handleStartPracticeTest(test._id)}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs bg-white hover:bg-slate-100 text-slate-900 transition-all duration-200 active:scale-95 shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Start Practice Test</span>
                    </button>

                    {isAttempted && (
                      <button
                        onClick={() => handleViewResults(test._id)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#20242D] hover:bg-[#282C38] text-slate-300 hover:text-white border border-white/[0.06] hover:border-white/[0.12] transition-all duration-200 active:scale-95"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#00C4B4]" />
                        <span>View Previous Results</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
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
                    fetchPracticeTests(newPage);
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
                          fetchPracticeTests(pageNum);
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
                    fetchPracticeTests(newPage);
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
};

export default PracticeTests;
