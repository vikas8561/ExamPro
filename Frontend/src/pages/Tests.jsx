 import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import StatusPill from "../components/StatusPill";
import apiRequest from "../services/api";

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
  const filteredStudents = students.filter(student =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 h-screen flex flex-col">
      <style dangerouslySetInnerHTML={{__html: `.scroll-hide::-webkit-scrollbar { display: none; } .scroll-hide { -ms-overflow-style: none; scrollbar-width: none; }`}} />
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">Tests</h2>
        <Link
          to="/admin/tests/create"
          className="bg-white hover:bg-gray-100 px-4 py-2 rounded-md text-black"
        >
          Create Test
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto flex-grow scroll-hide">
        {tests.map((t) => (
          <div key={t._id} className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-600 rounded-xl p-6 hover:shadow-2xl hover:scale-105 hover:-translate-y-2 transition-all duration-300 cursor-pointer">
            <h3 className="text-xl font-bold text-blue-300 bg-slate-700 px-3 py-2 rounded-lg mb-2 hover:bg-slate-600 hover:text-blue-200 hover:scale-105 transition-all duration-300 cursor-pointer">{t.title}</h3>
            <p className="text-slate-300 mb-1 font-medium">Subject: {t.subject || "N/A"}</p>
            <p className="text-slate-300 mb-1 capitalize font-medium">Type: {t.type}</p>
            <div className="mb-1 cursor-pointer hover:scale-110 hover:text-white transition-transform duration-300 inline-block">
              <StatusPill label={t.status} />
            </div>
            <p className="text-slate-300 mb-1 font-medium">Time: {t.timeLimit} min</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => nav(`/admin/tests/create?id=${t._id}`)}
                className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-500 hover:scale-105 hover:shadow-md transition-all duration-300 cursor-pointer text-sm"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  setSelectedTest(t._id);
                  setShowAssignModal(true);
                }}
                className="bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-500 hover:scale-105 hover:shadow-md transition-all duration-300 text-sm"
              >
                Assign
              </button>
              <button
                onClick={() => deleteTest(t._id)}
                className="bg-rose-600 text-white px-3 py-1 rounded-md hover:bg-rose-500 hover:scale-105 hover:shadow-md transition-all duration-300 cursor-pointer text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {tests.length === 0 && (
          <div className="col-span-full text-center text-slate-400 py-8">
            No tests found.
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
