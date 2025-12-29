import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, X as CloseIcon } from "lucide-react";
import StatusPill from "../components/StatusPill";
import apiRequest from "../services/api";

// No animations
const cardAnimationStyles = ``;

export default function Tests() {
  const [tests, setTests] = useState([]);
  const [students, setStudents] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedTest, setSelectedTest] = useState(null);
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignmentMode, setAssignmentMode] = useState("all"); // "all", "manual", "ru", "su"
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    totalPages: 1,
    totalTests: 0,
    hasNextPage: false,
    hasPrevPage: false
  });
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
        console.log("Fetched tests data:", data);
        if (data.tests && Array.isArray(data.tests)) {
          setTests(data.tests);
          if (data.pagination) {
            setPagination(data.pagination);
          }
        } else if (Array.isArray(data)) {
          // Fallback for old format
          setTests(data);
        } else {
          console.error("Data format unexpected:", data);
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
      fetchTests(1, ""); // Fetch immediately on mount
      return;
    }
  }, []);

  // Debounced search and pagination (only for subsequent changes)
  useEffect(() => {
    // Skip debounce on initial mount
    if (isInitialMount.current) {
      return;
    }

    // Clear previous debounce timer
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // Debounce search to make it smooth (only for search changes)
    searchDebounceRef.current = setTimeout(() => {
      fetchTests(currentPage, searchTerm);
    }, 300); // 300ms debounce delay

    // Cleanup function
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchTerm]);

  // Fetch students when manual assignment mode is selected
  useEffect(() => {
    if (assignmentMode === "manual" && showAssignModal) {
      fetchStudents();
    }
  }, [assignmentMode, showAssignModal]);

  const fetchStudents = async () => {
    try {
      const data = await apiRequest("/users");
      const studentUsers = data.filter(user => user.role === "Student");
      setStudents(studentUsers);
    } catch (err) {
      console.error("Error fetching students:", err);
    }
  };

  // Delete a test
  const deleteTest = async (id) => {
    try {
      await apiRequest(`/tests/${id}`, {
        method: "DELETE",
      });
      // Refresh the list to maintain pagination consistency
      fetchTests(currentPage, searchTerm);
    } catch (err) {
      console.error("Error deleting test:", err);
    }
  };

  // Toggle status (Active / Scheduled)
  const updateTest = async (id, updatedFields) => {
    try {
      const updatedTest = await apiRequest(`/tests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedFields),
      });
      setTests((prev) =>
        prev.map((t) => (t._id === id ? updatedTest : t))
      );
    } catch (err) {
      console.error("Error updating test:", err);
    }
  };

  // Assign test to all students
  const assignTestToAll = async () => {
    if (!selectedTest || !startTime || !duration) return;

    setAssigning(true);
    try {
      await apiRequest("/assignments/assign-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          testId: selectedTest, 
          startTime: new Date(startTime).toISOString(),
          duration: parseInt(duration)
        }),
      });

      alert("Test assigned to all students successfully!");
      setShowAssignModal(false);
      setSelectedTest(null);
      setStartTime("");
      setDuration("");
      // Refresh tests list to update status from "Draft" to "Active"
      fetchTests();
    } catch (err) {
      console.error("Error assigning test:", err);
      alert("Failed to assign test to students");
    } finally {
      setAssigning(false);
    }
  };

  // Assign test to RU students
  const assignTestToRU = async () => {
    if (!selectedTest || !startTime || !duration) return;

    setAssigning(true);
    try {
      await apiRequest("/assignments/assign-ru", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: selectedTest,
          startTime: new Date(startTime).toISOString(),
          duration: parseInt(duration)
        }),
      });

      alert("Test assigned to RU students successfully!");
      setShowAssignModal(false);
      setSelectedTest(null);
      setStartTime("");
      setDuration("");
      // Refresh tests list to update status from "Draft" to "Active"
      fetchTests();
    } catch (err) {
      console.error("Error assigning test to RU students:", err);
      alert("Failed to assign test to RU students");
    } finally {
      setAssigning(false);
    }
  };

  // Assign test to SU students
  const assignTestToSU = async () => {
    if (!selectedTest || !startTime || !duration) return;

    setAssigning(true);
    try {
      await apiRequest("/assignments/assign-su", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testId: selectedTest,
          startTime: new Date(startTime).toISOString(),
          duration: parseInt(duration)
        }),
      });

      alert("Test assigned to SU students successfully!");
      setShowAssignModal(false);
      setSelectedTest(null);
      setStartTime("");
      setDuration("");
      // Refresh tests list to update status from "Draft" to "Active"
      fetchTests();
    } catch (err) {
      console.error("Error assigning test to SU students:", err);
      alert("Failed to assign test to SU students");
    } finally {
      setAssigning(false);
    }
  };

  // Assign test to selected students manually
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
          duration: parseInt(duration)
        }),
      });

      alert(`Test assigned to ${selectedStudents.length} students successfully!`);
      setShowAssignModal(false);
      setSelectedTest(null);
      setStartTime("");
      setDuration("");
      setSelectedStudents([]);
      setAssignmentMode("all");
      // Refresh tests list to update status from "Draft" to "Active"
      fetchTests();
    } catch (err) {
      console.error("Error assigning test:", err);
      alert("Failed to assign test to selected students");
    } finally {
      setAssigning(false);
    }
  };

  // Toggle student selection
  const toggleStudentSelection = (studentId) => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  // Select all students
  const selectAllStudents = () => {
    const filteredStudentIds = filteredStudents.map(student => student._id);
    setSelectedStudents(filteredStudentIds);
  };

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedStudents([]);
  };

  // Filter students based on search query
  const filteredStudents = students.filter(
    (student) =>
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Tests are already filtered by backend, no need for client-side filtering
  const filteredTests = tests;

  return (
    <div
      className="p-6 min-h-screen flex flex-col"
      style={{ backgroundColor: "#0B1220" }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html:
            ".scroll-hide::-webkit-scrollbar { display: none; } .scroll-hide { -ms-overflow-style: none; scrollbar-width: none; }",
        }}
      />
      <style>{cardAnimationStyles}</style>

      {/* Navbar with Heading, Search Bar, and Create Test Button */}
      <div className="sticky top-0 z-50 relative mb-8">
        <div className="relative bg-slate-800/95 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-lg">
          {/* Title and Actions Row */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Section Heading */}
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-700/60 rounded-xl">
                <svg className="h-8 w-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">
                  Tests
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                  {pagination.totalTests || tests.length} total tests • Page {pagination.currentPage || currentPage} of {pagination.totalPages || 1}
                </p>
              </div>
            </div>

            {/* Search Bar and Create Test Button */}
            <div className="flex items-center gap-3">
              <div className="relative max-w-md w-full lg:w-80 group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 transition-colors duration-200" style={{ color: "#FFFFFF" }} />
                </div>
                <input
                  type="text"
                  placeholder="Search tests..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 rounded-xl focus:outline-none transition-all duration-300"
                  style={{
                    backgroundColor: "#1E293B",
                    border: "1px solid rgba(255, 255, 255, 0.3)",
                    color: "#FFFFFF",
                    boxShadow: "none",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.5)";
                    e.currentTarget.style.boxShadow = "0 0 0 2px rgba(255, 255, 255, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  onMouseEnter={(e) => {
                    if (document.activeElement !== e.currentTarget) {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (document.activeElement !== e.currentTarget) {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                    }
                  }}
                />
                <style>{`
                  input::placeholder {
                    color: #9CA3AF !important;
                    opacity: 1;
                  }
                `}</style>
                {/* Always render clear button to prevent layout shift, but make it invisible when no text */}
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center transition-all duration-200"
                  style={{ 
                    color: searchTerm ? "#FFFFFF" : "transparent",
                    pointerEvents: searchTerm ? "auto" : "none",
                    cursor: searchTerm ? "pointer" : "default"
                  }}
                  onMouseEnter={(e) => {
                    if (searchTerm) {
                      e.currentTarget.style.color = "#E5E7EB";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (searchTerm) {
                      e.currentTarget.style.color = "#FFFFFF";
                    }
                  }}
                  aria-label="Clear search"
                  tabIndex={searchTerm ? 0 : -1}
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>

              {/* Create Test Button */}
              <Link
                to="/admin/tests/create"
                className="group inline-flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 shadow-sm hover:shadow-md"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                  color: "#FFFFFF",
                  border: "1px solid rgba(255, 255, 255, 0.3)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                }}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Create Test</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Tests Grid - cards styled like Assigned Tests in student panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto flex-grow scroll-hide">
        {filteredTests.map((t, index) => (
          <div
            key={t._id}
            className="relative backdrop-blur-sm rounded-2xl p-5 border overflow-hidden flex flex-col justify-between min-h-[400px]"
            style={{
              backgroundColor: "rgba(15, 23, 42, 0.9)",
              borderColor: "rgba(148, 163, 184, 0.2)",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
            }}
          >

            <div className="relative z-10">
              {/* Title Section */}
              <div className="mb-4">
                <h3
                  className="text-xl font-bold mb-1 truncate"
                  style={{ color: "#F1F5F9" }}
                >
                  {t.title}
                </h3>
              </div>
              {/* Details rows styled similarly */}
              <div className="space-y-2.5 mb-4">
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-800/80 via-slate-900/80 to-slate-800/80 rounded-xl border border-slate-700/50 shadow-sm group/item">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-lg shadow-md flex-shrink-0">
                      <svg
                        className="h-4 w-4 text-purple-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                        />
                      </svg>
                    </div>
                    <span className="text-slate-300 text-sm font-semibold whitespace-nowrap">
                      Subject
                    </span>
                  </div>
                  <span className="px-3 py-1.5 bg-gradient-to-r from-purple-600/30 to-purple-700/30 text-purple-200 rounded-lg text-xs font-bold border border-purple-500/30 shadow-md min-w-[80px] text-center truncate">
                    {t.subject || "N/A"}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-800/80 via-slate-900/80 to-slate-800/80 rounded-xl border border-slate-700/50 shadow-sm group/item">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-lg shadow-md flex-shrink-0">
                      <svg
                        className="h-4 w-4 text-blue-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <span className="text-slate-300 text-sm font-semibold whitespace-nowrap">
                      Time Limit
                    </span>
                  </div>
                  <span className="px-3 py-1.5 bg-gradient-to-r from-blue-600/30 to-blue-700/30 text-blue-200 rounded-lg text-xs font-bold border border-blue-500/30 shadow-md min-w-[80px] text-center">
                    {t.timeLimit} min
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-800/80 via-slate-900/80 to-slate-800/80 rounded-xl border border-slate-700/50 shadow-sm group/item">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-lg shadow-md flex-shrink-0">
                      <svg
                        className="h-4 w-4 text-emerald-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <span className="text-slate-300 text-sm font-semibold whitespace-nowrap">
                      Type
                    </span>
                  </div>
                  <span className="px-3 py-1.5 bg-gradient-to-r from-emerald-600/30 to-emerald-700/30 text-emerald-200 rounded-lg text-xs font-bold border border-emerald-500/30 shadow-md min-w-[80px] text-center capitalize">
                    {t.type}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-800/80 via-slate-900/80 to-slate-800/80 rounded-xl border border-slate-700/50 shadow-sm group/item">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-gradient-to-br from-amber-500/20 to-amber-600/20 rounded-lg shadow-md flex-shrink-0">
                      <svg
                        className="h-4 w-4 text-amber-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 11c0 1.657-1.343 3-3 3S6 12.657 6 11s1.343-3 3-3 3 1.343 3 3zM19.5 11.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM12 13.5c-2.33 0-7 1.17-7 3.5V19h7"
                        />
                      </svg>
                    </div>
                    <span className="text-slate-300 text-sm font-semibold whitespace-nowrap">
                      Status
                    </span>
                  </div>
                  <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border shadow-md min-w-[80px] text-center ${
                    t.status === "Active" 
                      ? 'bg-gradient-to-r from-green-600/30 to-green-700/30 text-green-200 border-green-500/30'
                      : t.status === "Scheduled"
                      ? 'bg-gradient-to-r from-blue-600/30 to-blue-700/30 text-blue-200 border-blue-500/30'
                      : 'bg-gradient-to-r from-slate-700/50 to-slate-800/50 text-slate-300 border-slate-600/30'
                  }`}>
                    {t.status}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-800/80 via-slate-900/80 to-slate-800/80 rounded-xl border border-slate-700/50 shadow-sm group/item">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-indigo-600/20 rounded-lg shadow-md flex-shrink-0">
                      <svg
                        className="h-4 w-4 text-indigo-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5 9 6.343 9 8s1.343 3 3 3zM5.5 20a6.5 6.5 0 0113 0"
                        />
                      </svg>
                    </div>
                    <span className="text-slate-300 text-sm font-semibold whitespace-nowrap">
                      OTP
                    </span>
                  </div>
                  <span className="px-3 py-1.5 bg-gradient-to-r from-indigo-600/30 to-indigo-700/30 text-indigo-200 rounded-lg text-xs font-bold border border-indigo-500/30 shadow-md min-w-[80px] text-center">
                    {t.otp}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative z-10 flex justify-between gap-2.5 mt-auto pt-4" style={{ borderTop: "1px solid rgba(148, 163, 184, 0.2)" }}>
              <button
                onClick={() => nav(`/admin/tests/create?id=${t._id}`)}
                className="px-4 py-2 bg-gradient-to-r from-slate-700/80 to-slate-800/80 hover:from-slate-600/90 hover:to-slate-700/90 text-gray-100 rounded-lg text-xs font-semibold border border-slate-600/50 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 flex-1 text-center flex items-center justify-center gap-1.5"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
              <button
                onClick={() => {
                  setSelectedTest(t._id);
                  setShowAssignModal(true);
                }}
                className="px-4 py-2 bg-gradient-to-r from-blue-600/20 to-blue-700/20 hover:from-blue-600/30 hover:to-blue-700/30 text-blue-300 rounded-lg text-xs font-semibold border border-blue-500/30 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 flex-1 text-center flex items-center justify-center gap-1.5"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Assign
              </button>
              <button
                onClick={() => deleteTest(t._id)}
                className="px-4 py-2 bg-gradient-to-r from-red-600/20 to-red-700/20 hover:from-red-600/30 hover:to-red-700/30 text-red-300 rounded-lg text-xs font-semibold border border-red-500/30 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 flex-1 text-center flex items-center justify-center gap-1.5"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          </div>
        ))}
        {loading ? (
          <div className="col-span-full text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>
            Loading tests...
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="col-span-full text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>
            {searchTerm ? "No tests match your search." : "No tests found."}
          </div>
        ) : null}
      </div>

      {/* Pagination Controls */}
      {!loading && pagination.totalPages > 1 && (
        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => {
                if (currentPage > 1) {
                  setCurrentPage(currentPage - 1);
                }
              }}
              disabled={!pagination.hasPrevPage || currentPage === 1}
              className="px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
              style={{
                backgroundColor: !pagination.hasPrevPage || currentPage === 1 
                  ? 'rgba(255, 255, 255, 0.05)' 
                  : '#FFFFFF',
                color: !pagination.hasPrevPage || currentPage === 1 ? '#FFFFFF' : '#000000',
                border: '2px solid rgba(255, 255, 255, 0.2)'
              }}
              onMouseEnter={(e) => {
                if (pagination.hasPrevPage && currentPage > 1) {
                  e.currentTarget.style.background = '#FFFFFF';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(255, 255, 255, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (pagination.hasPrevPage && currentPage > 1) {
                  e.currentTarget.style.background = '#FFFFFF';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
                }
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
            
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
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
                    className={`px-4 py-2 rounded-lg font-semibold transition-all duration-300 ${
                      currentPage === pageNum
                        ? 'bg-white text-black shadow-lg transform scale-105'
                        : 'text-white hover:bg-white/20 hover:scale-105'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => {
                if (currentPage < pagination.totalPages) {
                  setCurrentPage(currentPage + 1);
                }
              }}
              disabled={!pagination.hasNextPage || currentPage >= pagination.totalPages}
              className="px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
              style={{
                backgroundColor: !pagination.hasNextPage || currentPage >= pagination.totalPages
                  ? 'rgba(255, 255, 255, 0.05)' 
                  : '#FFFFFF',
                color: !pagination.hasNextPage || currentPage >= pagination.totalPages ? '#FFFFFF' : '#000000',
                border: '2px solid rgba(255, 255, 255, 0.2)'
              }}
              onMouseEnter={(e) => {
                if (pagination.hasNextPage && currentPage < pagination.totalPages) {
                  e.currentTarget.style.background = '#FFFFFF';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(255, 255, 255, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (pagination.hasNextPage && currentPage < pagination.totalPages) {
                  e.currentTarget.style.background = '#FFFFFF';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
                }
              }}
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Assign Test</h3>
            
            {/* Assignment Mode Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assignment Mode
              </label>
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="all"
                    checked={assignmentMode === "all"}
                    onChange={() => setAssignmentMode("all")}
                    className="mr-2"
                  />
                  Assign to All Students
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="ru"
                    checked={assignmentMode === "ru"}
                    onChange={() => setAssignmentMode("ru")}
                    className="mr-2"
                  />
                  Assign to RU Students
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="su"
                    checked={assignmentMode === "su"}
                    onChange={() => setAssignmentMode("su")}
                    className="mr-2"
                  />
                  Assign to SU Students
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="manual"
                    checked={assignmentMode === "manual"}
                    onChange={() => setAssignmentMode("manual")}
                    className="mr-2"
                  />
                  Assign to Specific Students
                </label>
              </div>
            </div>

            {/* Assignment Parameters */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Time *
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded"
                min={new Date().toISOString().slice(0, 16)}
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Duration (minutes) *
              </label>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded"
                min="1"
                placeholder="Enter duration in minutes"
                required
              />
            </div>

            {/* Student Selection (Manual Mode Only) */}
            {assignmentMode === "manual" && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Students ({selectedStudents.length} selected)
                </label>
                
                {/* Search and Selection Controls */}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 p-2 border border-gray-300 rounded"
                  />
                  <button
                    onClick={selectAllStudents}
                    className="px-3 py-2 bg-blue-100 text-blue-700 rounded text-sm"
                  >
                    Select All
                  </button>
                  <button
                    onClick={clearAllSelections}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm"
                  >
                    Clear All
                  </button>
                </div>

                {/* Students List */}
                <div className="border border-gray-300 rounded max-h-48 overflow-y-auto">
                  {filteredStudents.length === 0 ? (
                    <div className="p-3 text-center text-gray-500">
                      No students found
                    </div>
                  ) : (
                    filteredStudents.map((student) => (
                      <label key={student._id} className="flex items-center p-3 border-b border-gray-200 last:border-b-0 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(student._id)}
                          onChange={() => toggleStudentSelection(student._id)}
                          className="mr-3"
                        />
                        <div>
                          <div className="font-medium">{student.name}</div>
                          <div className="text-sm text-gray-600">{student.email}</div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedTest(null);
                  setStartTime("");
                  setDuration("");
                  setSelectedStudents([]);
                  setAssignmentMode("all");
                  setSearchQuery("");
                }}
                className="px-4 py-2 text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (assignmentMode === "all") assignTestToAll();
                  else if (assignmentMode === "ru") assignTestToRU();
                  else if (assignmentMode === "su") assignTestToSU();
                  else if (assignmentMode === "manual") assignTestToSelected();
                }}
                disabled={
                  !startTime ||
                  !duration ||
                  assigning ||
                  (assignmentMode === "manual" && selectedStudents.length === 0)
                }
                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
              >
                {assigning
                  ? "Assigning..."
                  : assignmentMode === "all"
                    ? "Assign to All"
                    : assignmentMode === "ru"
                      ? "Assign to RU Students"
                      : assignmentMode === "su"
                        ? "Assign to SU Students"
                        : `Assign to ${selectedStudents.length} Students`
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
