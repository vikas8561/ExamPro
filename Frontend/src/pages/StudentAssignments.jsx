import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiRequest from "../services/api";

const StudentAssignments = () => {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      const data = await apiRequest("/assignments/student");
      setAssignments(data);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      alert("Failed to load assignments");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "No deadline";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Assigned": return "bg-yellow-900/50 text-yellow-300";
      case "In Progress": return "bg-blue-900/50 text-blue-300";
      case "Completed": return "bg-green-900/50 text-green-300";
      case "Overdue": return "bg-red-900/50 text-red-300";
      default: return "bg-gray-900/50 text-gray-300";
    }
  };

  const handleStartTest = async (assignmentId) => {
    try {
      const response = await apiRequest(`/assignments/${assignmentId}/start`, {
        method: "POST"
      });
      
      // Navigate to take test page
      navigate(`/student/take-test/${assignmentId}`);
    } catch (error) {
      alert(error.message || "Failed to start test");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-xl">Loading assignments...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">My Test Assignments</h1>

        {assignments.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-2xl text-slate-400 mb-4">No assignments found</div>
            <p className="text-slate-500">You don't have any test assignments yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {assignments.map((assignment) => (
              <div key={assignment._id} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-semibold text-white">
                    {assignment.testId?.title || "Test"}
                  </h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(assignment.status)}`}>
                    {assignment.status}
                  </span>
                </div>

                <div className="space-y-3 text-slate-300">
                  <div className="flex justify-between">
                    <span>Type:</span>
                    <span className="capitalize">{assignment.testId?.type}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Time Limit:</span>
                    <span>{assignment.testId?.timeLimit} minutes</span>
                  </div>

                  <div className="flex justify-between">
                    <span>Deadline:</span>
                    <span>{formatDate(assignment.deadline)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span>Questions:</span>
                    <span>{assignment.testId?.questions?.length || 0}</span>
                  </div>

                  {assignment.mentorId && (
                    <div className="flex justify-between">
                      <span>Mentor:</span>
                      <span>{assignment.mentorId?.name || "Not assigned"}</span>
                    </div>
                  )}

                  {assignment.score !== null && (
                    <div className="flex justify-between">
                      <span>Score:</span>
                      <span className="font-semibold">{assignment.score}%</span>
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  {assignment.status === "Assigned" && (
                    <button
                      onClick={() => handleStartTest(assignment._id)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md font-semibold transition-colors"
                    >
                      Start Test
                    </button>
                  )}

                  {assignment.status === "In Progress" && (
                    <button
                      onClick={() => navigate(`/student/take-test/${assignment._id}`)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md font-semibold transition-colors"
                    >
                      Continue Test
                    </button>
                  )}

                  {assignment.status === "Completed" && (
                    assignment.reviewStatus === "Reviewed" ? (
                      <button
                        onClick={() => navigate(`/student/view-test/${assignment._id}`)}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md font-semibold transition-colors"
                      >
                        View Results
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/student/view-test/${assignment._id}`)}
                        className="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded-md font-semibold transition-colors"
                      >
                        View Submission
                      </button>
                    )
                  )}

                  {assignment.status === "Overdue" && (
                    <button
                      disabled
                      className="w-full bg-red-600 text-white py-2 px-4 rounded-md font-semibold opacity-50 cursor-not-allowed"
                    >
                      Deadline Passed
                    </button>
                  )}
                </div>

                {assignment.startedAt && (
                  <div className="mt-3 text-xs text-slate-400">
                    Started: {new Date(assignment.startedAt).toLocaleDateString()}
                  </div>
                )}

                {assignment.completedAt && (
                  <div className="mt-1 text-xs text-slate-400">
                    Completed: {new Date(assignment.completedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentAssignments;
