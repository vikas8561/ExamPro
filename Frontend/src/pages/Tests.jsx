import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import StatusPill from "../components/StatusPill";
import apiRequest from "../services/api";

export default function Tests() {
  const [tests, setTests] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedTest, setSelectedTest] = useState(null);
  const [deadline, setDeadline] = useState("");
  const [assigning, setAssigning] = useState(false);
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
    if (!selectedTest || !deadline) return;

    setAssigning(true);
    try {
      // Convert date-only string into full ISO datetime (end of day)
      const deadlineDate = new Date(deadline);
      deadlineDate.setHours(23, 59, 59, 999);

      await apiRequest("/assignments/assign-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          testId: selectedTest, 
          deadline: deadlineDate.toISOString() 
        }),
      });

      alert("Test assigned to all students successfully!");
      setShowAssignModal(false);
      setSelectedTest(null);
      setDeadline("");
    } catch (err) {
      console.error("Error assigning test:", err);
      alert("Failed to assign test to students");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">Tests</h2>
        <Link
          to="/admin/tests/create"
          className="bg-white hover:bg-gray-100 px-4 py-2 rounded-md text-black"
        >
          Create Test
        </Link>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-slate-300 border-b border-slate-700">
              <th className="p-4">Title</th>
              <th className="p-4">Type</th>
              <th className="p-4">Status</th>
              <th className="p-4">Time</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((t) => (
              <tr key={t._id} className="border-b border-slate-700">
                <td className="p-4">{t.title}</td>
                <td className="p-4 capitalize">{t.type}</td>
                <td className="p-4">
                  <StatusPill label={t.status} />
                </td>
                <td className="p-4">{t.timeLimit} min</td>
                <td className="p-4 flex gap-3">
                  <button
                    onClick={() => nav(`/admin/tests/create?id=${t._id}`)}
                    className="text-blue-400"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() =>
                      updateTest(t._id, {
                        status: t.status === "Active" ? "Scheduled" : "Active",
                      })
                    }
                    className="text-slate-300"
                  >
                    Toggle Status
                  </button>
                  <button
                    onClick={() => {
                      setSelectedTest(t._id);
                      setShowAssignModal(true);
                    }}
                    className="text-green-400"
                  >
                    Assign
                  </button>
                  <button
                    onClick={() => deleteTest(t._id)}
                    className="text-rose-400"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {tests.length === 0 && (
              <tr>
                <td colSpan="5" className="p-4 text-center text-slate-400">
                  No tests found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Assignment Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Assign Test to All Students</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assignment Deadline
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedTest(null);
                  setDeadline("");
                }}
                className="px-4 py-2 text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={assignTestToAll}
                disabled={!deadline || assigning}
                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
              >
                {assigning ? "Assigning..." : "Assign to All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
