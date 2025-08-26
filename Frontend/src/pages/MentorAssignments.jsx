import React, { useEffect, useState } from "react";
import StatusPill from "../components/StatusPill";

export default function MentorAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch("http://localhost:4000/api/mentor/assignments", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      setAssignments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredAssignments = assignments.filter(assignment => {
    if (filter === "all") return true;
    return assignment.status === filter;
  });

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">Test Assignments</h2>
        
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-slate-700 text-white px-4 py-2 rounded-lg"
        >
          <option value="all">All Assignments</option>
          <option value="Assigned">Assigned</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
        </select>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800">
            <tr className="text-left text-slate-300 border-b border-slate-700">
              <th className="p-4">Test Name</th>
              <th className="p-4">Student</th>
              <th className="p-4">Status</th>
              <th className="p-4">Deadline</th>
              <th className="p-4">Score</th>
            </tr>
          </thead>
        </table>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full">
            <tbody>
              {filteredAssignments.map((assignment) => (
                <tr key={assignment._id} className="border-b border-slate-700">
                  <td className="p-4">{assignment.title}</td>
                  <td className="p-4">{assignment.userId?.name || "Unknown"}</td>
                  <td className="p-4">
                    <StatusPill label={assignment.status} />
                  </td>
                  <td className="p-4">
                    {assignment.deadline ? 
                      new Date(assignment.deadline).toLocaleDateString() : 
                      "N/A"
                    }
                  </td>
                  <td className="p-4">
                    {assignment.score !== undefined ? `${assignment.score}%` : "N/A"}
                  </td>
                </tr>
              ))}
              {filteredAssignments.length === 0 && (
                <tr>
                  <td
                    colSpan="5"
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
    </div>
  );
}
