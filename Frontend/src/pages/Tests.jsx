import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, X as CloseIcon } from "lucide-react";
import StatusPill from "../components/StatusPill";
import apiRequest from "../services/api";

// Reuse the same card animation styles as student Assigned Tests
const cardAnimationStyles = `
  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .animate-slide-in-up {
    animation: slideInUp 0.6s ease-out forwards;
    opacity: 0;
  }
`;

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
  const nav = useNavigate();

  // Fetch all tests on page load
  useEffect(() => {
  const fetchTests = async () => {
    try {
      const data = await apiRequest("/tests");
      setTests(data.tests || []);
    } catch (err) {
      console.error("Error fetching tests:", err);
    }
  };
    
    fetchTests();
  }, []);

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
      setTests((prev) => prev.filter((t) => t._id !== id));
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

  // Filter tests based on search term
  const filteredTests = tests.filter((test) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (test.title || "").toLowerCase().includes(term) ||
      (test.subject || "").toLowerCase().includes(term) ||
      (test.type || "").toLowerCase().includes(term) ||
      (test.status || "").toLowerCase().includes(term) ||
      (test.otp || "").toLowerCase().includes(term)
    );
  });

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
                  {tests.length} total tests • {filteredTests.length} showing
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
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center transition-colors duration-200"
                    style={{ color: "#FFFFFF" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#E5E7EB";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "#FFFFFF";
                    }}
                    aria-label="Clear search"
                  >
                    <CloseIcon className="h-5 w-5" />
                  </button>
                )}
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
            className="group relative backdrop-blur-sm rounded-2xl p-6 border transition-all duration-300 cursor-pointer animate-slide-in-up overflow-hidden flex flex-col justify-between"
            style={{
              backgroundColor: "#0B1220",
              borderColor: "rgba(255, 255, 255, 0.2)",
              boxShadow: "0 0 0 rgba(255, 255, 255, 0)",
              animationDelay: `${index * 100}ms`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
              e.currentTarget.style.boxShadow =
                "0 20px 25px -5px rgba(255, 255, 255, 0.1), 0 10px 10px -5px rgba(255, 255, 255, 0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {/* Subtle gradient overlay on hover */}
            <div
              className="absolute inset-0 rounded-2xl transition-all duration-300 pointer-events-none opacity-0 group-hover:opacity-100"
              style={{
                background:
                  "linear-gradient(to bottom right, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))",
              }}
            ></div>

            <div className="relative z-10">
              <h3
                className="text-lg font-semibold mb-2 truncate"
                style={{ color: "#E5E7EB" }}
              >
                {t.title}
              </h3>
              {/* Details rows styled similarly */}
              <div className="space-y-2.5 mb-4 mt-4">
                <div className="flex items-center justify-between p-3.5 bg-slate-900/70 rounded-xl border border-slate-800/50 hover:bg-slate-900/80 transition-all duration-200">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-slate-800/70 rounded-lg shadow-sm flex-shrink-0">
                      <svg
                        className="h-4 w-4 text-gray-200"
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
                    <span className="text-slate-300 text-sm font-medium whitespace-nowrap">
                      Subject
                    </span>
                  </div>
                  <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center truncate">
                    {t.subject || "N/A"}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-900/70 rounded-xl border border-slate-800/50 hover:bg-slate-900/80 transition-all duration-200">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-slate-800/70 rounded-lg shadow-sm flex-shrink-0">
                      <svg
                        className="h-4 w-4 text-gray-200"
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
                    <span className="text-slate-300 text-sm font-medium whitespace-nowrap">
                      Time Limit
                    </span>
                  </div>
                  <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center">
                    {t.timeLimit} min
                  </span>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-900/70 rounded-xl border border-slate-800/50 hover:bg-slate-900/80 transition-all duration-200">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-slate-800/70 rounded-lg shadow-sm flex-shrink-0">
                      <svg
                        className="h-4 w-4 text-gray-200"
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
                    <span className="text-slate-300 text-sm font-medium whitespace-nowrap">
                      Type
                    </span>
                  </div>
                  <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center capitalize">
                    {t.type}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-900/70 rounded-xl border border-slate-800/50 hover:bg-slate-900/80 transition-all duration-200">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-slate-800/70 rounded-lg shadow-sm flex-shrink-0">
                      <svg
                        className="h-4 w-4 text-gray-200"
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
                    <span className="text-slate-300 text-sm font-medium whitespace-nowrap">
                      Status
                    </span>
                  </div>
                  <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center">
                    {t.status}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-900/70 rounded-xl border border-slate-800/50 hover:bg-slate-900/80 transition-all duration-200">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-slate-800/70 rounded-lg shadow-sm flex-shrink-0">
                      <svg
                        className="h-4 w-4 text-gray-200"
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
                    <span className="text-slate-300 text-sm font-medium whitespace-nowrap">
                      OTP
                    </span>
                  </div>
                  <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center">
                    {t.otp}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative z-10 flex justify-between gap-3 mt-2 pt-4" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.2)" }}>
              <button
                onClick={() => nav(`/admin/tests/create?id=${t._id}`)}
                className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm flex-1 text-center transition-all duration-300 hover:bg-slate-800/80"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  setSelectedTest(t._id);
                  setShowAssignModal(true);
                }}
                className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm flex-1 text-center transition-all duration-300 hover:bg-slate-800/80"
              >
                Assign
              </button>
              <button
                onClick={() => deleteTest(t._id)}
                className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm flex-1 text-center transition-all duration-300 hover:bg-slate-800/80"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {filteredTests.length === 0 && (
          <div className="col-span-full text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>
            {searchTerm ? "No tests match your search." : "No tests found."}
          </div>
        )}
      </div>

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
