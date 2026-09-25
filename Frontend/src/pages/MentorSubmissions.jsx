import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import apiRequest from "../services/api";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import "../styles/StudentDashboard.mobile.css";
import {
  FileCheck,
  Search,
  X,
  Zap,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  User,
  CheckCircle2,
  Clock,
  Award,
  Users,
  BookOpen,
  ArrowRight,
  TrendingUp,
  Layers,
  Code2,
  HelpCircle,
  Eye
} from "lucide-react";

const MentorSubmissions = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [expandedStudents, setExpandedStudents] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async (page = 1) => {
    try {
      setLoading(true);
      const data = await apiRequest(`/mentor/submissions?page=${page}&limit=50`);
      if (Array.isArray(data)) {
        setStudents(data);
      } else {
        setStudents(data.students || []);
      }
    } catch (error) {
      console.error("Error fetching submissions:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentSubmissions = async (studentId) => {
    try {
      const data = await apiRequest(`/mentor/student/${studentId}/submissions`);
      setStudentSubmissions(data || []);
    } catch (error) {
      console.error("Error fetching student submissions:", error);
    }
  };

  const openStudentProfile = async (studentData) => {
    setSelectedStudent(studentData);
    if (studentData?.student?._id) {
      await fetchStudentSubmissions(studentData.student._id);
    } else if (studentData?.userId?._id) {
      await fetchStudentSubmissions(studentData.userId._id);
    }
  };

  const closeStudentProfile = () => {
    setSelectedStudent(null);
    setStudentSubmissions([]);
  };

  const toggleStudentExpansion = (studentId) => {
    setExpandedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const totalStudents = students.length;
    const totalSubmissions = students.reduce(
      (total, s) => total + (s.totalSubmissions || 0),
      0
    );
    const passingSubmissions = students.reduce((total, s) => {
      return (
        total +
        (s.submissions || []).filter((sub) => (sub.totalScore || 0) >= 70).length
      );
    }, 0);
    const totalScoreSum = students.reduce((total, s) => {
      return (
        total +
        (s.submissions || []).reduce(
          (sum, sub) => sum + (sub.totalScore || 0),
          0
        )
      );
    }, 0);
    const averageScore =
      totalSubmissions > 0 ? Math.round(totalScoreSum / totalSubmissions) : 0;
    const passingRate =
      totalSubmissions > 0
        ? Math.round((passingSubmissions / totalSubmissions) * 100)
        : 0;

    return { totalStudents, totalSubmissions, passingSubmissions, averageScore, passingRate };
  }, [students]);

  // Search filtering
  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return students;
    const q = searchTerm.toLowerCase();
    return students.filter((s) => {
      const name = (s.student?.name || "").toLowerCase();
      const email = (s.student?.email || "").toLowerCase();
      const hasMatchingTest = (s.submissions || []).some((sub) => {
        const title = (
          sub.testId?.title ||
          sub.assignmentId?.testId?.title ||
          ""
        ).toLowerCase();
        return title.includes(q);
      });
      return name.includes(q) || email.includes(q) || hasMatchingTest;
    });
  }, [students, searchTerm]);

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
              <FileCheck className="w-5 h-5 text-[#00C4B4]" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                Student Submissions
              </h1>
              <p className="text-xs text-[#7E8594] mt-0.5">
                Review student test performances, submitted answer scripts, and grading analytics
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
                placeholder="Search students or tests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#20242D] border border-white/[0.06] rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 focus:ring-1 focus:ring-[#00C4B4]/50 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7E8594] hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Refresh Pill Button */}
            <button
              onClick={() => fetchSubmissions()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/30 hover:bg-[#1A4C55] hover:scale-105 active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-50 flex-shrink-0"
            >
              <Zap className={`w-3.5 h-3.5 fill-[#00C4B4] ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{loading ? "Syncing..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* 4-Card KPI Overview Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Total Submissions */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Total Submissions
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#133B42] text-[#2DD4BF] border border-[#2DD4BF]/20">
                Logged
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {stats.totalSubmissions}
            </div>
            <p className="text-xs text-[#7E8594]">Total evaluation instances</p>
          </div>

          {/* Active Students Evaluated */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Active Candidates
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#1E293B] text-[#94A3B8] border border-white/10">
                Students
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {stats.totalStudents}
            </div>
            <p className="text-xs text-[#7E8594]">Distinct candidate submissions</p>
          </div>

          {/* Passing Submissions */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Passing Submissions
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#19382C] text-[#34D399] border border-[#34D399]/20">
                ≥ 70%
              </span>
            </div>
            <div className="text-3xl font-bold text-emerald-400 tracking-tight mb-1">
              {stats.passingSubmissions}
            </div>
            <p className="text-xs text-[#7E8594]">{stats.passingRate}% overall pass rate</p>
          </div>

          {/* Average Performance */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Average Score
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#3D271D] text-[#FB923C] border border-[#FB923C]/20">
                Cumulative
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {stats.averageScore}%
            </div>
            <p className="text-xs text-[#7E8594]">Average score across all tests</p>
          </div>
        </div>

        {/* Student Submissions List / Accordion */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4.5 h-4.5 text-[#00C4B4]" />
              <h2 className="text-base font-bold text-white tracking-tight">
                Candidate Registry ({filteredStudents.length})
              </h2>
            </div>
            <span className="text-xs text-[#7E8594]">
              Click any card to expand test history
            </span>
          </div>

          {loading ? (
            <div className="p-16 text-center text-slate-400 bg-[#20242D] border border-white/[0.06] rounded-2xl">
              <div className="w-8 h-8 rounded-full border-2 border-[#00C4B4] border-t-transparent animate-spin mx-auto mb-3" />
              <p className="text-xs text-[#7E8594]">Loading student submissions...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-16 text-center text-slate-400 bg-[#20242D] border border-white/[0.06] rounded-2xl">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6 text-[#7E8594]" />
              </div>
              <p className="text-sm font-semibold text-white">No student submissions found</p>
              <p className="text-xs text-[#7E8594] mt-1 max-w-sm mx-auto">
                {searchTerm
                  ? `No students or tests match "${searchTerm}".`
                  : "No students have submitted examinations yet."}
              </p>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="mt-3 text-xs text-[#00C4B4] hover:underline"
                >
                  Clear search filter
                </button>
              )}
            </div>
          ) : (
            filteredStudents.map((studentData) => {
              const student = studentData.student || {};
              const studentName = student.name || "Student";
              const studentEmail = student.email || "No email";
              const studentUID = student.universityUID || student.rollno || "";
              const isExpanded = expandedStudents.has(student._id);
              const avgScore = studentData.averageScore ?? 0;
              const subCount = studentData.totalSubmissions || 0;

              return (
                <div
                  key={student._id || Math.random()}
                  className="bg-[#20242D] border border-white/[0.06] hover:border-white/15 rounded-2xl overflow-hidden transition-all shadow-sm"
                >
                  {/* Student Header Bar */}
                  <div
                    onClick={() => toggleStudentExpansion(student._id)}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  >
                    {/* Left: Avatar & Info */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center font-bold text-sm text-[#00C4B4] flex-shrink-0">
                        {studentName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm sm:text-base font-semibold text-white tracking-tight truncate">
                            {studentName}
                          </h3>
                          {studentUID && (
                            <span className="text-[10px] font-mono text-[#00C4B4] bg-[#133B42] px-2 py-0.5 rounded-full border border-[#00C4B4]/20 hidden sm:inline truncate">
                              {studentUID}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#8E95A5] truncate mt-0.5">
                          {studentEmail} •{" "}
                          <span className="text-white font-medium">
                            {subCount} {subCount === 1 ? "submission" : "submissions"}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Right: Score Pill & Action Buttons */}
                    <div className="flex items-center gap-3 flex-shrink-0 self-end sm:self-auto">
                      {/* Avg Score Pill */}
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          avgScore >= 70
                            ? "bg-[#19382C] text-[#34D399] border border-[#34D399]/20"
                            : avgScore >= 50
                            ? "bg-[#3D271D] text-[#FB923C] border border-[#FB923C]/20"
                            : "bg-red-500/15 text-[#F87171] border border-red-500/30"
                        }`}
                      >
                        Avg: {avgScore}%
                      </span>

                      {/* White Button for View Profile / Analysis */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (studentData.submissions && studentData.submissions.length > 0) {
                            openStudentProfile(studentData.submissions[0]);
                          } else {
                            openStudentProfile(studentData);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-semibold text-xs transition-all shadow-sm active:scale-95 cursor-pointer"
                      >
                        <User className="w-3.5 h-3.5 text-slate-950" />
                        <span className="hidden sm:inline">View Profile</span>
                      </button>

                      {/* Accordion Chevron */}
                      <div className="p-1 rounded-lg bg-white/[0.04] text-[#8E95A5]">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-white" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Submissions Table */}
                  {isExpanded && (
                    <div className="border-t border-white/[0.05] bg-[#181A22]/50 overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/[0.05] bg-[#181A22]/80 text-[#7E8594] text-[11px] font-semibold uppercase tracking-wider">
                            <th className="py-3 px-5">Examination</th>
                            <th className="py-3 px-5">Score</th>
                            <th className="py-3 px-5">Submitted Date</th>
                            <th className="py-3 px-5">Time Spent</th>
                            <th className="py-3 px-5 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                          {(studentData.submissions || []).map((submission) => {
                            const testTitle =
                              submission.testId?.title ||
                              submission.assignmentId?.testId?.title ||
                              "Assessment";
                            const targetAssignmentId =
                              submission.assignmentId?._id ||
                              submission.assignmentId ||
                              submission._id;
                            const totalScore = submission.totalScore ?? 0;
                            const maxScore = submission.maxScore ?? 0;
                            const scorePct =
                              maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : totalScore;
                            const timeSpentMinutes = Math.floor(
                              (submission.timeSpent || 0) / 60
                            );
                            const timeSpentSeconds = (submission.timeSpent || 0) % 60;

                            return (
                              <tr
                                key={submission._id}
                                className="hover:bg-white/[0.02] transition-colors"
                              >
                                {/* Test Title */}
                                <td className="py-3.5 px-5">
                                  <div className="flex items-center gap-2.5">
                                    <BookOpen className="w-4 h-4 text-[#00C4B4] flex-shrink-0" />
                                    <span className="text-xs font-semibold text-white truncate">
                                      {testTitle}
                                    </span>
                                  </div>
                                </td>

                                {/* Score */}
                                <td className="py-3.5 px-5">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                      scorePct >= 70
                                        ? "bg-[#19382C] text-[#34D399] border border-[#34D399]/20"
                                        : scorePct >= 50
                                        ? "bg-[#3D271D] text-[#FB923C] border border-[#FB923C]/20"
                                        : "bg-red-500/15 text-[#F87171] border border-red-500/30"
                                    }`}
                                  >
                                    {totalScore} / {maxScore} pts
                                  </span>
                                </td>

                                {/* Submitted Date */}
                                <td className="py-3.5 px-5 text-xs text-[#8E95A5]">
                                  {formatDate(submission.submittedAt)}
                                </td>

                                {/* Time Spent */}
                                <td className="py-3.5 px-5">
                                  <span className="inline-flex items-center gap-1 text-xs text-[#8E95A5]">
                                    <Clock className="w-3.5 h-3.5 text-[#7E8594]" />
                                    <span>
                                      {timeSpentMinutes}m {timeSpentSeconds}s
                                    </span>
                                  </span>
                                </td>

                                {/* Green Button for View Test */}
                                <td className="py-3.5 px-5 text-right">
                                  <button
                                    onClick={() =>
                                      navigate(`/mentor/view-test/${targetAssignmentId}`)
                                    }
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-all shadow-sm active:scale-95 cursor-pointer"
                                  >
                                    <span>View Test</span>
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* Student Profile Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6 animate-fade-in">
          <div className="bg-[#181A22] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0 bg-[#20242D]/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#133B42] border border-[#00C4B4]/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-[#00C4B4]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                    Candidate Profile: {selectedStudent.userId?.name || selectedStudent.student?.name || "Student"}
                  </h3>
                  <p className="text-xs text-[#7E8594] mt-0.5 truncate">
                    Comprehensive Submission & Answer Script Analysis
                  </p>
                </div>
              </div>

              <button
                onClick={closeStudentProfile}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/10 text-[#8E95A5] hover:text-white border border-white/[0.06] transition-all cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              {/* Dual Info Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Candidate Info */}
                <div className="p-4 sm:p-5 rounded-2xl bg-[#20242D] border border-white/[0.06]">
                  <h4 className="text-xs font-semibold text-[#7E8594] uppercase tracking-wider mb-3">
                    Student Details
                  </h4>
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs text-[#7E8594]">Full Name</span>
                      <p className="text-sm font-semibold text-white">
                        {selectedStudent.userId?.name || selectedStudent.student?.name || "Unknown"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-[#7E8594]">Email Address</span>
                      <p className="text-sm text-[#8E95A5]">
                        {selectedStudent.userId?.email || selectedStudent.student?.email || "N/A"}
                      </p>
                    </div>
                    {(selectedStudent.userId?.universityUID || selectedStudent.userId?.rollno) && (
                      <div>
                        <span className="text-xs text-[#7E8594]">Student ID / Roll</span>
                        <p className="text-sm font-mono text-[#00C4B4]">
                          {selectedStudent.userId?.universityUID || selectedStudent.userId?.rollno}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Latest Submission Info */}
                <div className="p-4 sm:p-5 rounded-2xl bg-[#20242D] border border-white/[0.06]">
                  <h4 className="text-xs font-semibold text-[#7E8594] uppercase tracking-wider mb-3">
                    Selected Assessment Details
                  </h4>
                  <div className="space-y-2">
                    <div>
                      <span className="text-xs text-[#7E8594]">Assessment Title</span>
                      <p className="text-sm font-semibold text-white truncate">
                        {selectedStudent.assignmentId?.testId?.title ||
                          selectedStudent.testId?.title ||
                          "Assessment"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-[#7E8594]">Achieved Score</span>
                      <p className="text-sm font-semibold text-emerald-400">
                        {selectedStudent.totalScore ?? 0} / {selectedStudent.maxScore ?? 0} pts
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-[#7E8594]">Submission Timestamp</span>
                      <p className="text-sm text-[#8E95A5]">
                        {formatDate(selectedStudent.submittedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Student Answers Breakdown */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4.5 h-4.5 text-[#00C4B4]" />
                  <h4 className="text-sm font-semibold text-white tracking-tight">
                    Candidate Responses & Questions
                  </h4>
                </div>

                {studentSubmissions.length > 0 &&
                studentSubmissions[0].assignmentId?.testId?.questions?.length > 0 ? (
                  <div className="space-y-4">
                    {studentSubmissions[0].assignmentId.testId.questions.map((question, index) => {
                      const response =
                        (studentSubmissions[0].responses || []).find(
                          (r) => r.questionId?.toString() === question._id.toString()
                        ) || {};

                      const isCorrect = response.isCorrect;
                      const isMCQ = question.kind === "mcq";
                      const isCoding = question.kind === "coding";
                      const studentAnswer = isMCQ
                        ? response.selectedOption || "Not answered"
                        : response.textAnswer || "No answer provided";
                      const correctAnswer = isMCQ ? question.answer || "N/A" : null;
                      const answerLanguage =
                        response.language || (isCoding ? question.language : null) || "python";

                      return (
                        <div
                          key={question._id || index}
                          className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-4 sm:p-5 space-y-3"
                        >
                          {/* Question header */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-[#00C4B4] uppercase tracking-wider">
                                Question {index + 1}
                              </span>
                              <p className="text-sm font-medium text-white mt-1 leading-relaxed">
                                {question.text}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                  isMCQ
                                    ? "bg-[#133B42] text-[#2DD4BF] border border-[#2DD4BF]/20"
                                    : isCoding
                                    ? "bg-purple-500/15 text-purple-300 border border-purple-500/20"
                                    : "bg-pink-500/15 text-pink-300 border border-pink-500/20"
                                }`}
                              >
                                {isMCQ ? "MCQ" : isCoding ? "Coding" : "Theory"}
                              </span>
                              {isCoding && response.language && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] bg-white/[0.05] text-[#8E95A5]">
                                  {response.language}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Answer display */}
                          <div className="pt-2 border-t border-white/[0.04]">
                            {isMCQ ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div className="p-3 rounded-xl bg-[#181A22] border border-white/[0.04]">
                                  <span className="text-[#7E8594] block text-[11px] mb-1">
                                    Candidate Choice:
                                  </span>
                                  <span
                                    className={`font-semibold ${
                                      isCorrect ? "text-emerald-400" : "text-red-400"
                                    }`}
                                  >
                                    {studentAnswer}
                                  </span>
                                </div>
                                <div className="p-3 rounded-xl bg-[#181A22] border border-white/[0.04]">
                                  <span className="text-[#7E8594] block text-[11px] mb-1">
                                    Correct Option:
                                  </span>
                                  <span className="font-semibold text-[#00C4B4]">
                                    {correctAnswer}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <span className="text-xs text-[#7E8594]">
                                  Candidate Solution:
                                </span>
                                <div className="rounded-xl overflow-hidden border border-white/10 text-xs">
                                  <SyntaxHighlighter
                                    language={answerLanguage}
                                    style={vscDarkPlus}
                                    customStyle={{
                                      margin: 0,
                                      padding: "14px",
                                      borderRadius: "12px",
                                      fontSize: "12px",
                                      lineHeight: "1.5",
                                      maxHeight: "300px",
                                      overflow: "auto",
                                      backgroundColor: "#101218",
                                    }}
                                    showLineNumbers={true}
                                  >
                                    {studentAnswer}
                                  </SyntaxHighlighter>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Bottom points pill */}
                          <div className="flex items-center justify-between text-xs pt-1">
                            <span className="text-[#7E8594]">
                              Score Awarded:{" "}
                              <span className="text-white font-semibold">
                                {response.points ?? 0} / {question.points ?? 1} pts
                              </span>
                            </span>
                            {isMCQ && (
                              <span
                                className={`text-[11px] font-semibold ${
                                  isCorrect ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                {isCorrect ? "✓ Correct" : "✗ Incorrect"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-[#20242D] border border-white/[0.06] rounded-2xl">
                    <p className="text-xs text-[#7E8594]">
                      Detailed question responses are not available for this record.
                    </p>
                  </div>
                )}
              </div>

              {/* All Candidate Submissions Table */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white tracking-tight">
                  All Examinations Taken by this Student
                </h4>
                {studentSubmissions.length === 0 ? (
                  <p className="text-xs text-[#7E8594]">No other submissions found.</p>
                ) : (
                  <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/[0.05] bg-[#181A22]/50 text-[#7E8594] text-[11px] font-semibold uppercase">
                          <th className="py-2.5 px-4">Test</th>
                          <th className="py-2.5 px-4">Score</th>
                          <th className="py-2.5 px-4">Submitted</th>
                          <th className="py-2.5 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {studentSubmissions.map((sub) => {
                          const targetId =
                            sub.assignmentId?._id || sub.assignmentId || sub._id;
                          return (
                            <tr key={sub._id} className="hover:bg-white/[0.02] text-xs">
                              <td className="py-3 px-4 font-semibold text-white">
                                {sub.testId?.title ||
                                  sub.assignmentId?.testId?.title ||
                                  "Assessment"}
                              </td>
                              <td className="py-3 px-4 text-emerald-400 font-semibold">
                                {sub.totalScore ?? 0} / {sub.maxScore ?? 0}
                              </td>
                              <td className="py-3 px-4 text-[#8E95A5]">
                                {formatDate(sub.submittedAt)}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  onClick={() => {
                                    closeStudentProfile();
                                    navigate(`/mentor/view-test/${targetId}`);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[11px] transition-all cursor-pointer"
                                >
                                  <span>View Test</span>
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-white/[0.06] bg-[#20242D]/50 flex justify-end">
              <button
                onClick={closeStudentProfile}
                className="px-5 py-2 rounded-xl bg-[#2A2E39] hover:bg-[#323744] text-white font-medium text-xs transition-all cursor-pointer"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MentorSubmissions;

