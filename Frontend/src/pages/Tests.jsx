import React, { useEffect, useState, useRef, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  X as CloseIcon,
  Users,
  Globe,
  Building,
  UserCheck,
  ClipboardList,
  Plus,
  Clock,
  Download,
  Edit3,
  Trash2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Check,
  Zap,
  BookOpen,
  Code2,
  FileCheck2,
  AlertCircle
} from "lucide-react";
import apiRequest from "../services/api";

export default function Tests() {
  const [tests, setTests] = useState([]);
  const [students, setStudents] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedTest, setSelectedTest] = useState(null);
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignmentMode, setAssignmentMode] = useState("all");
  const [cohorts, setCohorts] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    totalPages: 1,
    totalTests: 0,
    hasNextPage: false,
    hasPrevPage: false,
    currentPage: 1
  });
  const [downloadingResults, setDownloadingResults] = useState({});
  const searchDebounceRef = useRef(null);
  const isInitialMount = useRef(true);
  const nav = useNavigate();

  // Fetch tests with pagination and search
  const fetchTests = (page = currentPage, search = searchTerm) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      limit: "9"
    });

    if (search) {
      params.append("search", search);
    }

    apiRequest(`/tests?${params.toString()}`)
      .then((data) => {
        if (data.tests && Array.isArray(data.tests)) {
          setTests(data.tests);
          if (data.pagination) {
            setPagination(data.pagination);
          }
        } else if (Array.isArray(data)) {
          setTests(data);
        } else {
          setTests([]);
        }
      })
      .catch((err) => {
        console.error("Error fetching tests:", err);
        setTests([]);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Initial load - fetch immediately without debounce
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      fetchTests(1, "");
      return;
    }
  }, []);

  // Debounced search and pagination
  useEffect(() => {
    if (isInitialMount.current) return;

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      fetchTests(currentPage, searchTerm);
    }, 300);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [currentPage, searchTerm]);

  // Fetch students when manual assignment mode is selected
  useEffect(() => {
    if (assignmentMode === "manual" && showAssignModal) {
      fetchStudents();
    }
  }, [assignmentMode, showAssignModal]);

  // Fetch cohorts when modal opens
  useEffect(() => {
    if (!showAssignModal) return;
    apiRequest("/assignments/cohorts")
      .then((data) => setCohorts(data.cohorts || []))
      .catch((err) => {
        console.error("Error fetching cohorts:", err);
        setCohorts([]);
      });
  }, [showAssignModal]);

  const fetchStudents = async () => {
    try {
      const data = await apiRequest("/users");
      const studentUsers = data.filter((user) => user.role === "Student");
      setStudents(studentUsers);
    } catch (err) {
      console.error("Error fetching students:", err);
    }
  };

  // Delete a test with confirmation
  const deleteTest = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete test "${title || 'this test'}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await apiRequest(`/tests/${id}`, {
        method: "DELETE",
      });
      fetchTests(currentPage, searchTerm);
    } catch (err) {
      console.error("Error deleting test:", err);
      alert("Failed to delete test.");
    }
  };

  // Assign test to a cohort
  const assignTestToCohort = async () => {
    if (!selectedTest || !startTime || !duration) return;

    const cohort = cohorts.find((c) => c.key === assignmentMode);
    if (!cohort) return;

    setAssigning(true);
    try {
      const result = await apiRequest("/assignments/assign-cohort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: selectedTest,
          cohort: cohort.key,
          startTime: new Date(startTime).toISOString(),
          duration: parseInt(duration, 10),
        }),
      });

      alert(result?.message || `Test assigned to ${cohort.label}.`);
      setShowAssignModal(false);
      setSelectedTest(null);
      setStartTime("");
      setDuration("");
      fetchTests(currentPage, searchTerm);
    } catch (err) {
      console.error("Error assigning test:", err);
      alert(err.message || `Failed to assign test to ${cohort.label}`);
    } finally {
      setAssigning(false);
    }
  };

  // Assign test to selected students
  const assignTestToSelected = async () => {
    if (!selectedTest || !startTime || !duration || selectedStudents.length === 0) return;

    setAssigning(true);
    try {
      await apiRequest("/assignments/assign-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: selectedTest,
          studentIds: selectedStudents,
          startTime: new Date(startTime).toISOString(),
          duration: parseInt(duration, 10),
        }),
      });

      alert(`Test assigned to ${selectedStudents.length} students successfully!`);
      setShowAssignModal(false);
      setSelectedTest(null);
      setStartTime("");
      setDuration("");
      setSelectedStudents([]);
      setAssignmentMode("all");
      fetchTests(currentPage, searchTerm);
    } catch (err) {
      console.error("Error assigning test:", err);
      alert("Failed to assign test to selected students");
    } finally {
      setAssigning(false);
    }
  };

  const toggleStudentSelection = (studentId) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const selectAllStudents = () => {
    const filteredStudentIds = filteredStudents.map((s) => s._id);
    setSelectedStudents(filteredStudentIds);
  };

  const clearAllSelections = () => {
    setSelectedStudents([]);
  };

  const filteredStudents = useMemo(() => {
    return students.filter(
      (student) =>
        student.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [students, searchQuery]);

  // Download test results as CSV
  const downloadTestResults = async (testId, testTitle) => {
    setDownloadingResults((prev) => ({ ...prev, [testId]: true }));
    try {
      const data = await apiRequest(`/tests/${testId}/results/download`);

      if (!data.results || data.results.length === 0) {
        alert("No results available for this test yet.");
        return;
      }

      const headers = ["S.No.", "Student Name", "Marks Obtained", "Maximum Marks", "Percentage"];
      const rows = data.results.map((r, i) => {
        const percentage =
          r.maxScore > 0 ? ((r.totalScore / r.maxScore) * 100).toFixed(2) + "%" : "0.00%";
        return [
          i + 1,
          `"${r.name ? r.name.replace(/"/g, '""') : "Unknown"}"`,
          r.totalScore,
          r.maxScore,
          percentage,
        ];
      });

      const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
      const BOM = "\uFEFF";
      const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      const safeName = testTitle.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
      link.href = url;
      link.download = `${safeName}_Results.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading results:", err);
      alert("Failed to download results. " + (err.message || ""));
    } finally {
      setDownloadingResults((prev) => ({ ...prev, [testId]: false }));
    }
  };

  // Compute live KPIs
  const totalTestsCount = pagination.totalTests || tests.length;
  const activeCount = useMemo(() => tests.filter((t) => t.status === "Active").length, [tests]);
  const scheduledCount = useMemo(() => tests.filter((t) => t.status === "Scheduled").length, [tests]);
  const totalSubmissionsCount = useMemo(
    () => tests.reduce((acc, t) => acc + (t.participants || 0), 0),
    [tests]
  );

  return (
    <div
      className="p-4 sm:p-6 lg:p-8 min-h-screen flex flex-col font-sans"
      style={{ backgroundColor: "#16181F" }}
    >
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
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
      <div className="max-w-7xl mx-auto w-full space-y-6 flex-1 flex flex-col">

        {/* Top Header Row - Synchronized 3.5rem baseline matching Sidebar */}
        <div
          className="flex flex-col md:flex-row md:items-center justify-between pb-5 mb-2 gap-4"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", minHeight: "3.5rem" }}
        >
          {/* Left: Branding & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#133B42] border border-[#00C4B4]/20 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-5 h-5 text-[#00C4B4]" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                Tests Management
              </h1>
              <p className="text-xs text-[#7E8594] mt-0.5">
                Author, schedule, assign cohorts & export examination results
              </p>
            </div>
          </div>

          {/* Right: Search, Refresh & Create Test White Button */}
          <div className="flex items-center flex-wrap gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-[#7E8594] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search tests..."
                className="w-full bg-[#20242D] border border-white/[0.08] rounded-xl pl-9 pr-9 py-2 text-xs sm:text-sm text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 focus:ring-1 focus:ring-[#00C4B4]/50 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7E8594] hover:text-white transition-colors"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Refresh Sync Button */}
            <button
              onClick={() => fetchTests(currentPage, searchTerm)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/30 hover:bg-[#1A4C55] transition-all cursor-pointer disabled:opacity-50"
              title="Refresh tests"
            >
              <Zap className={`w-3.5 h-3.5 fill-[#00C4B4] ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* ⚪ White Button: Create Test */}
            <Link
              to="/admin/tests/create"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-white hover:bg-slate-100 text-slate-950 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create Test</span>
            </Link>
          </div>
        </div>

        {/* 4-Card KPI Overview Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {/* Total Tests */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-white/10 transition-all shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Total Tests
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-[#133B42] text-[#2DD4BF] border border-[#2DD4BF]/20">
                Catalog
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {totalTestsCount}
            </div>
            <p className="text-[11px] text-[#7E8594] mt-1 flex items-center gap-1">
              <ClipboardList className="w-3 h-3 text-[#2DD4BF]" />
              Created assessments
            </p>
          </div>

          {/* Active Tests */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-white/10 transition-all shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Active Tests
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-[#19382C] text-[#34D399] border border-[#34D399]/20">
                Live
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {activeCount}
            </div>
            <p className="text-[11px] text-[#7E8594] mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
              Currently accessible
            </p>
          </div>

          {/* Scheduled Tests */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-white/10 transition-all shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Scheduled
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-[#1E293B] text-[#38BDF8] border border-[#38BDF8]/20">
                Upcoming
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {scheduledCount}
            </div>
            <p className="text-[11px] text-[#7E8594] mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#38BDF8]" />
              Scheduled for cohorts
            </p>
          </div>

          {/* Total Submissions in view */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-white/10 transition-all shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Participants
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-[#37233B] text-[#F472B6] border border-[#F472B6]/20">
                Submissions
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {totalSubmissionsCount}
            </div>
            <p className="text-[11px] text-[#7E8594] mt-1 flex items-center gap-1">
              <Users className="w-3 h-3 text-[#F472B6]" />
              Candidate attempts
            </p>
          </div>
        </div>

        {/* Tests Grid */}
        <div className="flex-1">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-6 h-[340px] animate-pulse flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="h-5 bg-white/[0.05] rounded-lg w-3/4" />
                    <div className="h-4 bg-white/[0.03] rounded-lg w-1/2" />
                    <div className="space-y-2 pt-4">
                      <div className="h-10 bg-white/[0.04] rounded-xl" />
                      <div className="h-10 bg-white/[0.04] rounded-xl" />
                    </div>
                  </div>
                  <div className="h-10 bg-white/[0.05] rounded-xl" />
                </div>
              ))}
            </div>
          ) : tests.length === 0 ? (
            <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-12 text-center my-8">
              <div className="w-14 h-14 rounded-2xl bg-[#133B42] border border-[#00C4B4]/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-[#00C4B4]" />
              </div>
              <h3 className="text-base font-bold text-white">No Tests Found</h3>
              <p className="text-xs text-[#7E8594] mt-1.5 max-w-sm mx-auto">
                {searchTerm
                  ? `No assessments match your search query "${searchTerm}". Try resetting search filters.`
                  : "No tests are currently configured in the platform catalog."}
              </p>
              {searchTerm ? (
                <button
                  onClick={() => setSearchTerm("")}
                  className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Clear Search
                </button>
              ) : (
                <Link
                  to="/admin/tests/create"
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-100 text-slate-950 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Your First Test</span>
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {tests.map((t) => {
                const isDownloading = downloadingResults[t._id];
                const hasParticipants = t.participants && t.participants > 0;

                return (
                  <div
                    key={t._id}
                    className="bg-[#20242D] border border-white/[0.06] hover:border-[#00C4B4]/30 rounded-2xl p-5 sm:p-6 transition-all duration-200 flex flex-col justify-between shadow-sm group hover:-translate-y-0.5"
                  >
                    <div>
                      {/* Card Top: Title & Status Badge */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex-1 min-w-0">
                          <h3
                            className="text-base font-bold text-white tracking-tight truncate group-hover:text-[#00C4B4] transition-colors"
                            title={t.title}
                          >
                            {t.title}
                          </h3>
                          <p className="text-[11px] text-[#7E8594] mt-0.5 truncate">
                            {t.subject || "General Assessment"}
                          </p>
                        </div>

                        {/* Status Pill */}
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0 border ${
                            t.status === "Active"
                              ? "bg-[#19382C] text-[#34D399] border-[#34D399]/30"
                              : t.status === "Scheduled"
                              ? "bg-[#1E293B] text-[#38BDF8] border-[#38BDF8]/30"
                              : "bg-white/[0.04] text-[#8E95A5] border-white/10"
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>

                      {/* Detail Metrics Matrix */}
                      <div className="grid grid-cols-2 gap-2.5 mb-5">
                        {/* Time Limit */}
                        <div className="bg-[#181A22] border border-white/[0.04] rounded-xl p-2.5 flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#133B42] flex items-center justify-center flex-shrink-0">
                            <Clock className="w-3.5 h-3.5 text-[#00C4B4]" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] text-[#7E8594] uppercase tracking-wider block">
                              Duration
                            </span>
                            <span className="text-xs font-semibold text-white truncate block">
                              {t.timeLimit} mins
                            </span>
                          </div>
                        </div>

                        {/* Type */}
                        <div className="bg-[#181A22] border border-white/[0.04] rounded-xl p-2.5 flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#1E293B] flex items-center justify-center flex-shrink-0">
                            {t.type?.toLowerCase().includes("code") ? (
                              <Code2 className="w-3.5 h-3.5 text-[#38BDF8]" />
                            ) : (
                              <BookOpen className="w-3.5 h-3.5 text-[#38BDF8]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] text-[#7E8594] uppercase tracking-wider block">
                              Type
                            </span>
                            <span className="text-xs font-semibold text-white capitalize truncate block">
                              {t.type || "MCQ"}
                            </span>
                          </div>
                        </div>

                        {/* Submissions / Turnout */}
                        <div className="bg-[#181A22] border border-white/[0.04] rounded-xl p-2.5 flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#37233B] flex items-center justify-center flex-shrink-0">
                            <Users className="w-3.5 h-3.5 text-[#F472B6]" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] text-[#7E8594] uppercase tracking-wider block">
                              Turnout
                            </span>
                            <span className="text-xs font-semibold text-white truncate block">
                              {t.participants || 0} students
                            </span>
                          </div>
                        </div>

                        {/* Subject Badge */}
                        <div className="bg-[#181A22] border border-white/[0.04] rounded-xl p-2.5 flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#3A2B18] flex items-center justify-center flex-shrink-0">
                            <FileCheck2 className="w-3.5 h-3.5 text-[#FBBF24]" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] text-[#7E8594] uppercase tracking-wider block">
                              Subject
                            </span>
                            <span className="text-xs font-semibold text-white truncate block">
                              {t.subject || "General"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Actions Bottom Section */}
                    <div className="pt-4 border-t border-white/[0.05] space-y-2.5">
                      {/* Download Results CSV Button */}
                      <button
                        onClick={() => downloadTestResults(t._id, t.title)}
                        disabled={!hasParticipants || isDownloading}
                        className={`w-full py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          !hasParticipants
                            ? "bg-white/[0.02] text-[#555C6D] border-white/[0.04] cursor-not-allowed"
                            : "bg-[#19382C] text-[#34D399] border-[#34D399]/30 hover:bg-[#1F4637] shadow-sm active:scale-95"
                        }`}
                        title={
                          !hasParticipants
                            ? "No results available — test has no submissions yet"
                            : `Download CSV marksheet for ${t.participants} candidate(s)`
                        }
                      >
                        {isDownloading ? (
                          <>
                            <Zap className="w-3.5 h-3.5 animate-spin" />
                            <span>Exporting Data...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>
                              Download Results {hasParticipants ? `(${t.participants})` : ""}
                            </span>
                          </>
                        )}
                      </button>

                      {/* Primary Actions: Edit, Assign & Delete */}
                      <div className="grid grid-cols-3 gap-2">
                        {/* Edit Button */}
                        <button
                          onClick={() => nav(`/admin/tests/create?id=${t._id}`)}
                          className="py-2 px-2 rounded-xl text-xs font-semibold bg-[#2A2E39] hover:bg-[#323744] text-white border border-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[#8E95A5]" />
                          <span>Edit</span>
                        </button>

                        {/* Assign Button */}
                        <button
                          onClick={() => {
                            setSelectedTest(t._id);
                            setShowAssignModal(true);
                          }}
                          className="py-2 px-2 rounded-xl text-xs font-semibold bg-[#133B42] hover:bg-[#1A4C55] text-[#00C4B4] border border-[#00C4B4]/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Assign</span>
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => deleteTest(t._id, t.title)}
                          className="py-2 px-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Minimal Dark Pagination Controls */}
        {!loading && pagination.totalPages > 1 && (
          <div className="mt-8 pt-4 border-t border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs text-[#7E8594]">
              Showing page <span className="font-semibold text-white">{currentPage}</span> of{" "}
              <span className="font-semibold text-white">{pagination.totalPages}</span> (
              {pagination.totalTests} total tests)
            </span>

            <div className="flex items-center gap-1.5">
              {/* Previous */}
              <button
                onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
                disabled={!pagination.hasPrevPage || currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 bg-[#20242D] border border-white/[0.06] hover:bg-white/[0.05] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  let pageNum;
                  if (pagination.totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= pagination.totalPages - 2) {
                    pageNum = pagination.totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        currentPage === pageNum
                          ? "bg-white text-slate-950 font-bold"
                          : "text-[#8E95A5] hover:text-white hover:bg-white/[0.05]"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              {/* Next */}
              <button
                onClick={() =>
                  currentPage < pagination.totalPages && setCurrentPage(currentPage + 1)
                }
                disabled={!pagination.hasNextPage || currentPage >= pagination.totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 bg-[#20242D] border border-white/[0.06] hover:bg-white/[0.05] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Assignment Modal - Standardized Elevated Glassmorphism */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={() => setShowAssignModal(false)}
          />

          <div
            className="relative w-full max-w-2xl bg-[#181A22] rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10 animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Header - Synchronized 3.5rem Baseline */}
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", minHeight: "3.5rem" }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#133B42] border border-[#00C4B4]/20 flex items-center justify-center flex-shrink-0">
                  <UserCheck className="w-5 h-5 text-[#00C4B4]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Assign Assessment
                  </h3>
                  <p className="text-xs text-[#7E8594] mt-0.5">
                    Schedule cohort dispatch or select individual students
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowAssignModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7E8594] hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
              {/* Assignment Mode Selection */}
              <div>
                <label className="block text-xs font-semibold text-[#7E8594] mb-3 uppercase tracking-wider">
                  Target Audience / Cohort
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    ...cohorts.map((c) => ({
                      id: c.key,
                      label: c.label,
                      icon: c.key === "all" ? Globe : Building,
                      desc: `${c.description || "Cohort"} \u00b7 ${c.count || 0} student${c.count === 1 ? "" : "s"}`,
                    })),
                    {
                      id: "manual",
                      label: "Specific Students",
                      icon: UserCheck,
                      desc: "Select students manually from list",
                    },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setAssignmentMode(mode.id)}
                      className={`relative p-3.5 rounded-xl text-left border transition-all duration-200 cursor-pointer ${
                        assignmentMode === mode.id
                          ? "bg-[#133B42] border-[#00C4B4]/60 ring-1 ring-[#00C4B4]/50 shadow-sm"
                          : "bg-[#20242D] border-white/[0.06] hover:border-white/15 hover:bg-[#252A35]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            assignmentMode === mode.id
                              ? "bg-[#00C4B4] text-slate-950 font-bold shadow-md shadow-[#00C4B4]/20"
                              : "bg-[#16181F] text-[#8E95A5]"
                          }`}
                        >
                          <mode.icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-xs font-bold truncate ${
                              assignmentMode === mode.id ? "text-white" : "text-[#D1D5DB]"
                            }`}
                          >
                            {mode.label}
                          </p>
                          <p className="text-[11px] text-[#7E8594] mt-0.5 truncate">
                            {mode.desc}
                          </p>
                        </div>
                      </div>
                      {assignmentMode === mode.id && (
                        <div className="absolute top-2.5 right-2.5 w-2 h-2 bg-[#00C4B4] rounded-full shadow-[0_0_8px_#00C4B4]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Student Selection List (Manual Mode) */}
              {assignmentMode === "manual" && (
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-semibold text-[#7E8594] uppercase tracking-wider">
                      Select Students
                    </label>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={selectAllStudents}
                        className="text-[#00C4B4] hover:underline font-semibold cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-[#4B5563]">|</span>
                      <button
                        type="button"
                        onClick={clearAllSelections}
                        className="text-[#7E8594] hover:text-white transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Student Search */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-[#7E8594] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search students by name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-[#16181F] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 focus:ring-1 focus:ring-[#00C4B4]/50 transition-all"
                    />
                  </div>

                  {/* Student List */}
                  <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-[#16181F] max-h-56 overflow-y-auto custom-scrollbar">
                    {filteredStudents.length === 0 ? (
                      <div className="p-8 text-center text-[#7E8594] text-xs">
                        No students found matching your search.
                      </div>
                    ) : (
                      <div className="divide-y divide-white/[0.04]">
                        {filteredStudents.map((student) => {
                          const isSelected = selectedStudents.includes(student._id);
                          return (
                            <div
                              key={student._id}
                              onClick={() => toggleStudentSelection(student._id)}
                              className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-[#133B42]/50 hover:bg-[#133B42]/70"
                                  : "hover:bg-white/[0.02]"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                    isSelected
                                      ? "bg-[#00C4B4] text-slate-950"
                                      : "bg-[#20242D] text-[#8E95A5]"
                                  }`}
                                >
                                  {student.name?.charAt(0) || "S"}
                                </div>
                                <div className="min-w-0">
                                  <p
                                    className={`text-xs font-medium truncate ${
                                      isSelected ? "text-[#00C4B4]" : "text-slate-200"
                                    }`}
                                  >
                                    {student.name}
                                  </p>
                                  <p className="text-[11px] text-[#7E8594] truncate">
                                    {student.email}
                                  </p>
                                </div>
                              </div>

                              <div
                                className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                                  isSelected
                                    ? "bg-[#00C4B4] border-[#00C4B4]"
                                    : "border-white/20"
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 text-slate-950 stroke-[3]" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-[11px] text-[#7E8594]">
                    <span className="text-[#00C4B4] font-semibold">
                      {selectedStudents.length}
                    </span>{" "}
                    students selected
                  </div>
                </div>
              )}

              {/* Timing Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-[#7E8594] mb-2 uppercase tracking-wider">
                    Start Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-[#16181F] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 focus:ring-1 focus:ring-[#00C4B4]/50 transition-all [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#7E8594] mb-2 uppercase tracking-wider">
                    Duration (Minutes) *
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 60"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full bg-[#16181F] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 focus:ring-1 focus:ring-[#00C4B4]/50 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              className="px-6 py-4 flex items-center justify-end gap-3"
              style={{ borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}
            >
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8E95A5] hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                Cancel
              </button>

              {/* 🟢 Green Button: Confirm Assignment */}
              <button
                type="button"
                onClick={() => {
                  if (assignmentMode === "manual") assignTestToSelected();
                  else assignTestToCohort();
                }}
                disabled={assigning || !startTime || !duration}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
              >
                {assigning ? (
                  <>
                    <Zap className="w-3.5 h-3.5 animate-spin" />
                    <span>Assigning...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Confirm Assignment</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
