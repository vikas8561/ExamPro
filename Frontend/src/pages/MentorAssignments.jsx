import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusPill from "../components/StatusPill";

export default function MentorAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedTest, setSelectedTest] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch("https://cg-test-app.onrender.com/api/mentor/assignments", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      // Map score from assignment to each assignment object for frontend use
      const assignmentsWithScore = Array.isArray(data) ? data.map(a => ({
        ...a,
        score: a.score !== undefined && a.score !== null ? a.score : (a.autoScore !== undefined && a.autoScore !== null ? a.autoScore : null)
      })) : [];
      setAssignments(assignmentsWithScore);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold mb-6">Test Assignments</h2>

      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="h-[80vh] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-slate-800 sticky top-0">
              <tr className="text-left text-slate-300 border-b border-slate-700">
                <th className="p-4">Test Name</th>
                <th className="p-4">Test Date</th>
                <th className="p-4">View Details</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(new Map(assignments.map(a => [a.testId?._id, a])).values()).map((assignment) => (
                <tr key={assignment._id} className="border-b border-slate-700 hover:bg-slate-700 transition-colors duration-200">
                  <td className="p-4 text-slate-200 font-medium">{assignment.testId?.title || "Unknown Test"}</td>
                  <td className="p-4 text-slate-300">{assignment.createdAt ? new Date(assignment.createdAt).toLocaleDateString() : "N/A"}</td>
                  <td className="p-4">
                    <button
                    onClick={() => {
                      setSelectedTest(assignment.testId);
                      setShowModal(true);
                    }}
                    className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
                  >
                    View Details
                  </button>
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td
                    colSpan="3"
                    className="p-4 text-center text-slate-400"
                  >
                    No assignments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && selectedTest && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-700 transform scale-100 animate-modal-appear">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-3xl font-bold text-white bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                {selectedTest.title} - Details
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-lg transition-all duration-300 hover:scale-105 transform shadow-md hover:shadow-lg"
                aria-label="Close modal"
              >
                <span className="text-lg">←</span>
                <span className="font-semibold">Back</span>
              </button>
            </div>

            <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-700 p-6 rounded-lg shadow-md hover:shadow-lg hover:scale-105 transition-transform duration-300 cursor-pointer flex flex-col items-center justify-center">
                <div className="text-slate-300 text-sm uppercase tracking-wide font-semibold mb-2">Students Assigned</div>
                <div className="text-4xl font-extrabold text-white">
                  {assignments.filter(a => a.testId?._id === selectedTest._id).length}
                </div>
              </div>
              <div className="bg-slate-700 p-6 rounded-lg shadow-md hover:shadow-lg hover:scale-105 transition-transform duration-300 cursor-pointer flex flex-col items-center justify-center">
                <div className="text-slate-300 text-sm uppercase tracking-wide font-semibold mb-2">Total Submissions</div>
                <div className="text-4xl font-extrabold text-white">
                  {assignments.filter(a => a.testId?._id === selectedTest._id && a.status === "Completed").length}
                </div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl p-6 shadow-lg">
              <h4 className="text-xl font-semibold text-white mb-4 flex items-center">
                <div className="w-2 h-2 bg-purple-400 rounded-full mr-3"></div>
                Submitted Students
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700">
                    <tr className="text-left text-slate-300 border-b border-slate-600">
                  <th className="p-4 font-semibold">Student Name</th>
                  <th className="p-4 font-semibold">Start Time</th>
                  <th className="p-4 font-semibold">End Time</th>
                  <th className="p-4 font-semibold">Score</th>
                  <th className="p-4 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody>
              {assignments.filter(a => a.testId?._id === selectedTest._id && a.status === "Completed").map((assignment) => (
                <tr key={assignment._id} className="border-b border-slate-600 hover:bg-slate-700 transition-colors duration-200">
                  <td className="p-4 text-slate-200 font-medium">{assignment.userId?.name || "Unknown"}</td>
                  <td className="p-4 text-slate-200 font-medium">{assignment.startTime ? new Date(assignment.startTime).toLocaleString() : "N/A"}</td>
                  <td className="p-4 text-slate-200 font-medium">{assignment.deadline ? new Date(assignment.deadline).toLocaleString() : "N/A"}</td>
                  <td className="p-4 text-slate-200 font-medium">{assignment.score !== undefined ? assignment.score : "N/A"}</td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => navigate(`/mentor/view-test/${assignment._id}`)}
                      className="bg-white text-black px-4 py-2 rounded-lg hover:bg-gray-100 transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-105 font-semibold"
                    >
                      View Submissions
                    </button>
                  </td>
                </tr>
              ))}
                {assignments.filter(a => a.testId?._id === selectedTest._id && a.status === "Completed").length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-slate-400">
                      <div className="text-2xl mb-2">📝</div>
                      No submissions yet.
                    </td>
                  </tr>
                )}
              </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
