import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StatusPill from "../components/StatusPill";

export default function MentorDashboard() {
  const [stats, setStats] = useState({
    totalAssigned: 0,
    activeTests: 0,
    completedTests: 0,
    recentSubmissions: []
  });
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMentorData();
  }, []);

  const fetchMentorData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch("http://localhost:4000/api/mentor/dashboard", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      
      setStats({
        totalAssigned: data.totalAssigned || 0,
        activeTests: data.activeTests || 0,
        completedTests: data.completedTests || 0,
        recentSubmissions: data.recentSubmissions || []
      });
      
      setAssignments(data.assignments || []);
    } catch (error) {
      console.error("Error fetching mentor data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold mb-6">Mentor Dashboard</h2>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
          <p className="text-slate-300">Total Assigned Tests</p>
          <p className="text-3xl font-bold mt-2">{stats.totalAssigned}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
          <p className="text-slate-300">Active Tests</p>
          <p className="text-3xl font-bold mt-2">{stats.activeTests}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
          <p className="text-slate-300">Completed Tests</p>
          <p className="text-3xl font-bold mt-2">{stats.completedTests}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-3">Quick Actions</h3>
        <div className="flex gap-3">
          <Link
            to="/mentor/assignments"
            className="bg-white hover:bg-gray-100 px-4 py-2 rounded-md text-black"
          >
            View All Assignments
          </Link>
          <Link
            to="/mentor/submissions"
            className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-md"
          >
            Monitor Submissions
          </Link>
        </div>
      </div>

      {/* Recent Submissions */}
      <div className="mt-6">
        <h3 className="text-xl font-semibold mb-3">Recent Submissions</h3>

        <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr className="text-left text-slate-300 border-b border-slate-700">
                <th className="p-4">Student</th>
                <th className="p-4">Test</th>
                <th className="p-4">Score</th>
                <th className="p-4">Submitted</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
          </table>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full">
              <tbody>
                {stats.recentSubmissions.map((submission) => (
                  <tr key={submission._id} className="border-b border-slate-700">
                    <td className="p-4">{submission.userId?.name || "Unknown"}</td>
                    <td className="p-4">{submission.testId?.title || "Test"}</td>
                    <td className="p-4">
                      {submission.totalScore || 0} / {submission.maxScore || 0}
                    </td>
                    <td className="p-4">
                      {submission.submittedAt ? 
                        new Date(submission.submittedAt).toLocaleDateString() : 
                        "N/A"
                      }
                    </td>
                    <td className="p-4">
                      <StatusPill label="Completed" />
                    </td>
                  </tr>
                ))}
                {stats.recentSubmissions.length === 0 && (
                  <tr>
                    <td
                      colSpan="5"
                      className="p-4 text-center text-slate-400"
                    >
                      No recent submissions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Active Tests */}
      <div className="mt-6">
        <h3 className="text-xl font-semibold mb-3">Active Tests</h3>

        <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr className="text-left text-slate-300 border-b border-slate-700">
                <th className="p-4">Test Name</th>
                <th className="p-4">Student</th>
                <th className="p-4">Status</th>
                <th className="p-4">Started</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
          </table>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full">
              <tbody>
                {assignments
                  .filter(a => a.status === "In Progress")
                  .slice(0, 5)
                  .map((assignment) => (
                    <tr key={assignment._id} className="border-b border-slate-700">
                      <td className="p-4">{assignment.title}</td>
                      <td className="p-4">{assignment.userId?.name || "Unknown"}</td>
                      <td className="p-4">
                        <StatusPill label={assignment.status} />
                      </td>
                      <td className="p-4">
                        {assignment.startedAt ? 
                          new Date(assignment.startedAt).toLocaleDateString() : 
                          "N/A"
                        }
                      </td>
                      <td className="p-4">
                        <Link
                          to={`/mentor/monitor/${assignment._id}`}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          Monitor
                        </Link>
                      </td>
                    </tr>
                  ))}
                {assignments.filter(a => a.status === "In Progress").length === 0 && (
                  <tr>
                    <td
                      colSpan="5"
                      className="p-4 text-center text-slate-400"
                    >
                      No active tests found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
