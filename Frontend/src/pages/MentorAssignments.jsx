import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../config/api";
import "../styles/StudentDashboard.mobile.css";
import {
  ClipboardList,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  ArrowUpDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  Award,
  Zap,
  RotateCcw,
  ArrowLeft,
  Layers,
  Calendar,
  BookOpen
} from "lucide-react";

export default function MentorAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedTest, setSelectedTest] = useState(null);
  const [showStudentListModal, setShowStudentListModal] = useState(false);
  const [selectedSection, setSelectedSection] = useState(null);
  const [scoreSort, setScoreSort] = useState("none");
  const [submissionTimeSort, setSubmissionTimeSort] = useState("none");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [studentsCurrentPage, setStudentsCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [studentSearchTerm, setStudentSearchTerm] = useState("");
  const itemsPerPage = 8;
  const navigate = useNavigate();

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/mentor/assignments?limit=1000`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();

      const assignmentsWithScore = Array.isArray(data)
        ? data.map((a) => ({
            ...a,
            score:
              a.score !== undefined && a.score !== null
                ? a.score
                : a.autoScore !== undefined && a.autoScore !== null
                ? a.autoScore
                : null,
          }))
        : [];

      setAssignments(assignmentsWithScore);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  // Group unique assignments by testId
  const uniqueAssignments = useMemo(() => {
    return Array.from(new Map(assignments.map((a) => [a.testId?._id, a])).values()).filter(
      (a) => a.testId?._id
    );
  }, [assignments]);

  // Overall statistics for top KPI row
  const overallStats = useMemo(() => {
    const totalTests = uniqueAssignments.length;
    const totalAssignedStudents = assignments.length;
    const totalSubmitted = assignments.filter((a) => a.status === "Completed").length;
    const completionRate =
      totalAssignedStudents > 0
        ? Math.round((totalSubmitted / totalAssignedStudents) * 100)
        : 0;

    return { totalTests, totalAssignedStudents, totalSubmitted, completionRate };
  }, [uniqueAssignments, assignments]);

  // Main filter for assignments table
  const filteredAssignments = useMemo(() => {
    if (!searchTerm.trim()) return uniqueAssignments;
    const searchLower = searchTerm.toLowerCase();
    return uniqueAssignments.filter((assignment) => {
      const title = (assignment.testId?.title || "").toLowerCase();
      const subject = (assignment.testId?.subject || "").toLowerCase();
      const type = (assignment.testId?.type || "").toLowerCase();
      const dateStr = assignment.createdAt
        ? new Date(assignment.createdAt).toLocaleDateString().toLowerCase()
        : "";
      return (
        title.includes(searchLower) ||
        subject.includes(searchLower) ||
        type.includes(searchLower) ||
        dateStr.includes(searchLower)
      );
    });
  }, [uniqueAssignments, searchTerm]);

  // Paginated assignments
  const paginatedAssignments = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAssignments.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAssignments, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAssignments.length / itemsPerPage) || 1;

  // Filtered students for section modal ('assigned' | 'submitted' | 'notSubmitted')
  const getFilteredStudents = () => {
    if (!selectedTest || !selectedSection) return [];
    const testAssignments = assignments.filter((a) => a.testId?._id === selectedTest._id);

    switch (selectedSection) {
      case "assigned":
        return testAssignments;
      case "submitted":
        return testAssignments.filter((a) => a.status === "Completed");
      case "notSubmitted":
        return testAssignments.filter((a) => a.status !== "Completed");
      default:
        return [];
    }
  };

  const getSectionTitle = () => {
    switch (selectedSection) {
      case "assigned":
        return "All Assigned Students";
      case "submitted":
        return "Submitted Students";
      case "notSubmitted":
        return "Pending / Incomplete Students";
      default:
        return "Students";
    }
  };

  // Filtered & sorted submitted students in test details modal
  const filteredSubmittedStudents = useMemo(() => {
    if (!selectedTest) return [];
    let list = assignments.filter(
      (a) => a.testId?._id === selectedTest._id && a.status === "Completed"
    );

    if (studentSearchTerm.trim()) {
      const q = studentSearchTerm.toLowerCase();
      list = list.filter((a) => {
        const name = (a.userId?.name || "").toLowerCase();
        const email = (a.userId?.email || "").toLowerCase();
        const uid = (a.userId?.universityUID || a.userId?.rollno || "").toLowerCase();
        const scoreStr = a.score !== undefined ? a.score.toString() : "";
        return (
          name.includes(q) || email.includes(q) || uid.includes(q) || scoreStr.includes(q)
        );
      });
    }

    if (scoreSort !== "none") {
      list = [...list].sort((a, b) => {
        const sA = a.score ?? 0;
        const sB = b.score ?? 0;
        return scoreSort === "increasing" ? sA - sB : sB - sA;
      });
    }

    if (submissionTimeSort !== "none") {
      list = [...list].sort((a, b) => {
        const startA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
        const endA = a.submittedAt
          ? new Date(a.submittedAt).getTime()
          : a.completedAt
          ? new Date(a.completedAt).getTime()
          : 0;
        const durA = startA && endA ? endA - startA : 0;

        const startB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
        const endB = b.submittedAt
          ? new Date(b.submittedAt).getTime()
          : b.completedAt
          ? new Date(b.completedAt).getTime()
          : 0;
        const durB = startB && endB ? endB - startB : 0;

        return submissionTimeSort === "increasing" ? durA - durB : durB - durA;
      });
    }

    return list;
  }, [assignments, selectedTest, studentSearchTerm, scoreSort, submissionTimeSort]);

  const studentsTotalPages =
    Math.ceil(filteredSubmittedStudents.length / itemsPerPage) || 1;

  const paginatedStudents = useMemo(() => {
    const startIndex = (studentsCurrentPage - 1) * itemsPerPage;
    return filteredSubmittedStudents.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSubmittedStudents, studentsCurrentPage, itemsPerPage]);

  const getTestDuration = (assignment) => {
    const startTime = assignment.startedAt ? new Date(assignment.startedAt) : null;
    const endTime = assignment.submittedAt
      ? new Date(assignment.submittedAt)
      : assignment.completedAt
      ? new Date(assignment.completedAt)
      : null;

    if (!startTime || !endTime) return null;
    const durationMs = endTime - startTime;
    const durationMinutes = Math.floor(durationMs / (1000 * 60));
    const durationSeconds = Math.floor((durationMs % (1000 * 60)) / 1000);

    return durationMinutes > 0 ? `${durationMinutes}m ${durationSeconds}s` : `${durationSeconds}s`;
  };

  const resetFilters = () => {
    setScoreSort("none");
    setSubmissionTimeSort("none");
    setShowFilters(false);
    setStudentsCurrentPage(1);
    setStudentSearchTerm("");
  };

  // Keyboard navigation for main assignments pagination
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "ArrowLeft" && currentPage > 1) {
          e.preventDefault();
          setCurrentPage((prev) => prev - 1);
        } else if (e.key === "ArrowRight" && currentPage < totalPages) {
          e.preventDefault();
          setCurrentPage((prev) => prev + 1);
        }
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [currentPage, totalPages]);

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
          {/* Left: Title & Icon */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#133B42] border border-[#00C4B4]/20 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-5 h-5 text-[#00C4B4]" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                Test Assignments
              </h1>
              <p className="text-xs text-[#7E8594] mt-0.5">
                Manage examination instances, track student submissions, and review scores
              </p>
            </div>
          </div>

          {/* Right Controls: Search & Refresh */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-72">
              <Search className="w-4 h-4 text-[#7E8594] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search tests..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-[#20242D] border border-white/[0.06] rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 focus:ring-1 focus:ring-[#00C4B4]/50 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setCurrentPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7E8594] hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Refresh Pill Button */}
            <button
              onClick={fetchAssignments}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/30 hover:bg-[#1A4C55] hover:scale-105 active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-50 flex-shrink-0"
            >
              <Zap className={`w-3.5 h-3.5 fill-[#00C4B4] ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{loading ? "Syncing..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* Quick Stats KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Total Unique Exams */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Active Tests
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#133B42] text-[#2DD4BF] border border-[#2DD4BF]/20">
                Unique
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {overallStats.totalTests}
            </div>
            <p className="text-xs text-[#7E8594]">Total distinct examinations</p>
          </div>

          {/* Total Students Assigned */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Total Assigned
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#1E293B] text-[#94A3B8] border border-white/10">
                Students
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {overallStats.totalAssignedStudents}
            </div>
            <p className="text-xs text-[#7E8594]">Student assessment instances issued</p>
          </div>

          {/* Completed Submissions */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Completed
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#19382C] text-[#34D399] border border-[#34D399]/20">
                Submitted
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {overallStats.totalSubmitted}
            </div>
            <p className="text-xs text-[#7E8594]">Evaluated & finalized tests</p>
          </div>

          {/* Turnout / Completion Rate */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Turnout Velocity
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#3D271D] text-[#FB923C] border border-[#FB923C]/20">
                Turnout
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {overallStats.completionRate}%
            </div>
            <p className="text-xs text-[#7E8594]">Overall submission completion rate</p>
          </div>
        </div>

        {/* Assignments List Container */}
        <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl overflow-hidden shadow-sm flex flex-col">
          {/* Header Bar */}
          <div className="p-4 sm:p-5 border-b border-white/[0.05] flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <Layers className="w-4.5 h-4.5 text-[#00C4B4]" />
              <h2 className="text-base font-bold text-white tracking-tight">
                Assigned Examination Registry
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#7E8594]">
              <span>Showing {paginatedAssignments.length} of {filteredAssignments.length} examinations</span>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.05] bg-[#181A22]/50 text-[#7E8594] text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-3.5 px-5">Examination Title</th>
                  <th className="py-3.5 px-5 hidden md:table-cell">Subject & Type</th>
                  <th className="py-3.5 px-5">Assigned Date</th>
                  <th className="py-3.5 px-5">Turnout Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="py-16 text-center text-slate-400">
                      <div className="w-7 h-7 rounded-full border-2 border-[#00C4B4] border-t-transparent animate-spin mx-auto mb-3" />
                      <p className="text-xs text-[#7E8594]">Loading test assignments...</p>
                    </td>
                  </tr>
                ) : paginatedAssignments.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-16 text-center text-slate-400">
                      <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-3">
                        <ClipboardList className="w-6 h-6 text-[#7E8594]" />
                      </div>
                      <p className="text-sm font-semibold text-white">No test assignments found</p>
                      <p className="text-xs text-[#7E8594] mt-1 max-w-sm mx-auto">
                        {searchTerm
                          ? `No assignments match "${searchTerm}". Try a different keyword.`
                          : "No test assignments are currently available in the portal."}
                      </p>
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm("")}
                          className="mt-3 text-xs text-[#00C4B4] hover:underline"
                        >
                          Clear search filter
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedAssignments.map((assignment) => {
                    const test = assignment.testId || {};
                    const testAssigned = assignments.filter((a) => a.testId?._id === test._id);
                    const testCompleted = testAssigned.filter((a) => a.status === "Completed");
                    const testRate =
                      testAssigned.length > 0
                        ? Math.round((testCompleted.length / testAssigned.length) * 100)
                        : 0;

                    const dateFormatted = assignment.createdAt
                      ? new Date(assignment.createdAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "N/A";

                    return (
                      <tr
                        key={assignment._id}
                        className="hover:bg-white/[0.02] transition-colors group"
                      >
                        {/* Title & icon */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[#133B42] border border-[#00C4B4]/20 flex items-center justify-center flex-shrink-0 group-hover:border-[#00C4B4]/40 transition-all">
                              <BookOpen className="w-4.5 h-4.5 text-[#00C4B4]" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white tracking-tight truncate">
                                {test.title || "Untitled Assessment"}
                              </p>
                              <p className="text-[11px] text-[#7E8594] mt-0.5 truncate md:hidden">
                                {test.subject || "General"} • {test.type || "Exam"}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Subject & Type (desktop) */}
                        <td className="py-4 px-5 hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.04] text-[#A6ADBB] border border-white/[0.06]">
                              {test.subject || "General"}
                            </span>
                            {test.type && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#133B42] text-[#2DD4BF] border border-[#2DD4BF]/20">
                                {test.type}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Created Date */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-1.5 text-xs text-[#8E95A5]">
                            <Calendar className="w-3.5 h-3.5 text-[#7E8594]" />
                            <span>{dateFormatted}</span>
                          </div>
                        </td>

                        {/* Turnout Status Bar */}
                        <td className="py-4 px-5">
                          <div className="w-36">
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="text-[#8E95A5] font-medium">
                                {testCompleted.length} / {testAssigned.length}
                              </span>
                              <span className="font-bold text-white text-[11px]">{testRate}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-[#00C4B4] to-[#38BDF8] rounded-full"
                                style={{ width: `${Math.min(testRate, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Actions: White Button for View Details */}
                        <td className="py-4 px-5 text-right">
                          <button
                            onClick={() => {
                              setSelectedTest(test);
                              setShowModal(true);
                              resetFilters();
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-semibold text-xs transition-all shadow-sm active:scale-95 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-950" />
                            <span>View Details</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-white/[0.05] bg-[#181A22]/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-[#7E8594]">
                Page <span className="text-white font-medium">{currentPage}</span> of{" "}
                <span className="text-white font-medium">{totalPages}</span>
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg bg-[#2A2E39] hover:bg-[#323744] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .map((p, idx, arr) => (
                    <React.Fragment key={p}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="text-[#7E8594] px-1">...</span>
                      )}
                      <button
                        onClick={() => setCurrentPage(p)}
                        className={`w-7 h-7 rounded-lg text-xs font-medium transition-all ${
                          p === currentPage
                            ? "bg-[#00C4B4] text-slate-950 font-semibold shadow-sm"
                            : "bg-[#2A2E39] hover:bg-[#323744] text-white"
                        }`}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  ))}

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg bg-[#2A2E39] hover:bg-[#323744] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Test Details Modal (showModal) */}
      {showModal && selectedTest && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6 animate-fade-in">
          <div className="bg-[#181A22] border border-white/10 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0 bg-[#20242D]/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#133B42] border border-[#00C4B4]/20 flex items-center justify-center flex-shrink-0">
                  <ClipboardList className="w-5 h-5 text-[#00C4B4]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                    {selectedTest.title}
                  </h3>
                  <p className="text-xs text-[#7E8594] mt-0.5 truncate">
                    {selectedTest.subject || "General"} • Detailed Assignment Breakdown
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/10 text-[#8E95A5] hover:text-white border border-white/[0.06] transition-all cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              {/* 3 Clickable Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Students Assigned */}
                <div
                  onClick={() => {
                    setSelectedSection("assigned");
                    setShowStudentListModal(true);
                  }}
                  className="bg-[#20242D] border border-white/[0.06] hover:border-[#00C4B4]/40 rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                      Students Assigned
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#1E293B] text-[#94A3B8] border border-white/10">
                      Total
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    {assignments.filter((a) => a.testId?._id === selectedTest._id).length}
                  </div>
                  <p className="text-[11px] text-[#7E8594] mt-1 group-hover:text-[#00C4B4] transition-colors flex items-center gap-1">
                    <span>Click to view student list</span>
                    <ChevronRight className="w-3 h-3" />
                  </p>
                </div>

                {/* Students Submitted */}
                <div
                  onClick={() => {
                    setSelectedSection("submitted");
                    setShowStudentListModal(true);
                  }}
                  className="bg-[#20242D] border border-white/[0.06] hover:border-emerald-500/40 rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                      Students Submitted
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#19382C] text-[#34D399] border border-[#34D399]/20">
                      Completed
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-emerald-400 tracking-tight">
                    {
                      assignments.filter(
                        (a) => a.testId?._id === selectedTest._id && a.status === "Completed"
                      ).length
                    }
                  </div>
                  <p className="text-[11px] text-[#7E8594] mt-1 group-hover:text-emerald-400 transition-colors flex items-center gap-1">
                    <span>Click to view student list</span>
                    <ChevronRight className="w-3 h-3" />
                  </p>
                </div>

                {/* Students Not Submitted */}
                <div
                  onClick={() => {
                    setSelectedSection("notSubmitted");
                    setShowStudentListModal(true);
                  }}
                  className="bg-[#20242D] border border-white/[0.06] hover:border-amber-500/40 rounded-2xl p-4 sm:p-5 transition-all cursor-pointer group shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                      Pending / In Progress
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#3D271D] text-[#FB923C] border border-[#FB923C]/20">
                      Pending
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-amber-400 tracking-tight">
                    {
                      assignments.filter(
                        (a) => a.testId?._id === selectedTest._id && a.status !== "Completed"
                      ).length
                    }
                  </div>
                  <p className="text-[11px] text-[#7E8594] mt-1 group-hover:text-amber-400 transition-colors flex items-center gap-1">
                    <span>Click to view student list</span>
                    <ChevronRight className="w-3 h-3" />
                  </p>
                </div>
              </div>

              {/* Submitted Students Table & Search Filter */}
              <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl overflow-hidden flex flex-col shadow-sm">
                <div className="p-4 sm:p-5 border-b border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400" />
                    <h4 className="text-sm font-semibold text-white tracking-tight">
                      Submitted Students Registry
                    </h4>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Student search input */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#7E8594] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search student or score..."
                        value={studentSearchTerm}
                        onChange={(e) => {
                          setStudentSearchTerm(e.target.value);
                          setStudentsCurrentPage(1);
                        }}
                        className="w-56 bg-[#181A22] border border-white/[0.08] rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50"
                      />
                      {studentSearchTerm && (
                        <button
                          onClick={() => {
                            setStudentSearchTerm("");
                            setStudentsCurrentPage(1);
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7E8594] hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Filter Toggle Button */}
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                        showFilters
                          ? "bg-[#133B42] text-[#00C4B4] border-[#00C4B4]/30"
                          : "bg-[#181A22] text-[#8E95A5] border-white/[0.08] hover:text-white"
                      }`}
                    >
                      <Filter className="w-3.5 h-3.5" />
                      <span>Sort / Filters</span>
                      {(scoreSort !== "none" || submissionTimeSort !== "none") && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00C4B4]" />
                      )}
                    </button>

                    {(scoreSort !== "none" ||
                      submissionTimeSort !== "none" ||
                      studentSearchTerm) && (
                      <button
                        onClick={resetFilters}
                        className="text-xs text-[#7E8594] hover:text-white underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Collapsible Filter Row */}
                {showFilters && (
                  <div className="p-4 bg-[#181A22]/70 border-b border-white/[0.05] grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#8E95A5] uppercase tracking-wider mb-1.5">
                        Sort by Score
                      </label>
                      <select
                        value={scoreSort}
                        onChange={(e) => {
                          setScoreSort(e.target.value);
                          setStudentsCurrentPage(1);
                        }}
                        className="w-full bg-[#20242D] border border-white/[0.08] text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#00C4B4]/50"
                      >
                        <option value="none">No Sorting</option>
                        <option value="increasing">Score: Low to High</option>
                        <option value="decreasing">Score: High to Low</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#8E95A5] uppercase tracking-wider mb-1.5">
                        Sort by Duration
                      </label>
                      <select
                        value={submissionTimeSort}
                        onChange={(e) => {
                          setSubmissionTimeSort(e.target.value);
                          setStudentsCurrentPage(1);
                        }}
                        className="w-full bg-[#20242D] border border-white/[0.08] text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#00C4B4]/50"
                      >
                        <option value="none">No Sorting</option>
                        <option value="increasing">Duration: Fastest First</option>
                        <option value="decreasing">Duration: Slowest First</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Table of submitted students */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.05] bg-[#181A22]/40 text-[#7E8594] text-[11px] font-semibold uppercase tracking-wider">
                        <th className="py-3 px-4">Student</th>
                        <th className="py-3 px-4 hidden sm:table-cell">Start Time</th>
                        <th className="py-3 px-4">Submitted At</th>
                        <th className="py-3 px-4">Duration</th>
                        <th className="py-3 px-4">Score</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {paginatedStudents.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="py-12 text-center text-slate-400">
                            <p className="text-xs text-[#7E8594]">
                              {studentSearchTerm
                                ? "No submitted students match your search criteria."
                                : "No submissions recorded for this test yet."}
                            </p>
                          </td>
                        </tr>
                      ) : (
                        paginatedStudents.map((assignment) => {
                          const studentName = assignment.userId?.name || "Student";
                          const studentIdentifier =
                            assignment.userId?.universityUID ||
                            assignment.userId?.rollno ||
                            assignment.userId?.email ||
                            "";
                          const durationStr = getTestDuration(assignment) || "N/A";
                          const scoreVal = assignment.score;
                          const maxScoreVal = assignment.maxScore;

                          return (
                            <tr
                              key={assignment._id}
                              className="hover:bg-white/[0.02] transition-colors"
                            >
                              {/* Student name & initial */}
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center font-bold text-xs text-[#00C4B4] flex-shrink-0">
                                    {studentName.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-white truncate">
                                      {studentName}
                                    </p>
                                    {studentIdentifier && (
                                      <p className="text-[10px] font-mono text-[#7E8594] truncate">
                                        {studentIdentifier}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Start Time */}
                              <td className="py-3.5 px-4 hidden sm:table-cell text-xs text-[#8E95A5]">
                                {assignment.startedAt
                                  ? new Date(assignment.startedAt).toLocaleString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "N/A"}
                              </td>

                              {/* Submitted At */}
                              <td className="py-3.5 px-4 text-xs text-[#8E95A5]">
                                {assignment.submittedAt
                                  ? new Date(assignment.submittedAt).toLocaleString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : assignment.completedAt
                                  ? new Date(assignment.completedAt).toLocaleString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "N/A"}
                              </td>

                              {/* Duration Pill */}
                              <td className="py-3.5 px-4">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#133B42] text-[#2DD4BF] border border-[#2DD4BF]/20">
                                  {durationStr}
                                </span>
                              </td>

                              {/* Score */}
                              <td className="py-3.5 px-4">
                                <div className="text-xs font-semibold text-white">
                                  {scoreVal !== null && scoreVal !== undefined ? (
                                    <span>
                                      {scoreVal} {maxScoreVal ? `/ ${maxScoreVal}` : ""}
                                    </span>
                                  ) : (
                                    <span className="text-[#7E8594]">N/A</span>
                                  )}
                                </div>
                              </td>

                              {/* Action: Green Button for View Test */}
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  onClick={() => navigate(`/mentor/view-test/${assignment._id}`)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-all shadow-sm active:scale-95 cursor-pointer"
                                >
                                  <span>View Test</span>
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Students Pagination */}
                {studentsTotalPages > 1 && (
                  <div className="p-3 border-t border-white/[0.05] bg-[#181A22]/30 flex items-center justify-between text-xs">
                    <span className="text-[#7E8594]">
                      Page <span className="text-white font-medium">{studentsCurrentPage}</span> of{" "}
                      <span className="text-white font-medium">{studentsTotalPages}</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setStudentsCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={studentsCurrentPage === 1}
                        className="px-2.5 py-1 rounded-lg bg-[#2A2E39] text-white disabled:opacity-40 cursor-pointer"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() =>
                          setStudentsCurrentPage((p) => Math.min(studentsTotalPages, p + 1))
                        }
                        disabled={studentsCurrentPage === studentsTotalPages}
                        className="px-2.5 py-1 rounded-lg bg-[#2A2E39] text-white disabled:opacity-40 cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Student List Section Modal (showStudentListModal) */}
      {showStudentListModal && selectedSection && selectedTest && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6 animate-fade-in">
          <div className="bg-[#181A22] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0 bg-[#20242D]/50">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setShowStudentListModal(false)}
                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-white transition-all cursor-pointer"
                  title="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    {getSectionTitle()}
                  </h3>
                  <p className="text-xs text-[#7E8594] mt-0.5">
                    {selectedTest.title} • {getFilteredStudents().length} students
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowStudentListModal(false)}
                className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-[#8E95A5] hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
              {getFilteredStudents().length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-2">
                    <Users className="w-5 h-5 text-[#7E8594]" />
                  </div>
                  <p className="text-xs text-[#7E8594]">No students found in this category.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {getFilteredStudents().map((assignment) => {
                    const studentName = assignment.userId?.name || "Student";
                    const studentEmail = assignment.userId?.email || "No email";
                    const studentUID =
                      assignment.userId?.universityUID || assignment.userId?.rollno || "";

                    return (
                      <div
                        key={assignment._id}
                        className="p-3.5 rounded-xl bg-[#20242D] border border-white/[0.06] hover:border-white/15 transition-all flex flex-col justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center font-bold text-xs text-[#00C4B4] flex-shrink-0">
                            {studentName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">
                              {studentName}
                            </p>
                            <p className="text-[10px] text-[#7E8594] truncate">{studentEmail}</p>
                            {studentUID && (
                              <p className="text-[10px] font-mono text-[#00C4B4] truncate">
                                {studentUID}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-white/[0.04] text-[10px]">
                          <span className="text-[#7E8594]">Status:</span>
                          <span
                            className={`font-semibold ${
                              assignment.status === "Completed"
                                ? "text-emerald-400"
                                : "text-amber-400"
                            }`}
                          >
                            {assignment.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

