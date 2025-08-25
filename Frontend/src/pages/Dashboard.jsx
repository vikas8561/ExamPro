import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StatusPill from "../components/StatusPill";

export default function Dashboard() {
  const [tests, setTests] = useState([]);
  const [users, setUsers] = useState([]);
  const [reviews, setReviews] = useState([]);

  // Fetch all data from backend when the component mounts
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    // Fetch tests
    fetch("http://localhost:4000/api/tests", {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
      .then((res) => res.json())
      .then((data) => setTests(data.tests || []))
      .catch((err) => console.error("Error fetching tests:", err));

    // Fetch users
    fetch("http://localhost:4000/api/users", {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
      .then((res) => res.json())
      .then((data) => setUsers(data || []))
      .catch((err) => console.error("Error fetching users:", err));

    // Fetch reviews
    fetch("http://localhost:4000/api/reviews", {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
      .then((res) => res.json())
      .then((data) => setReviews(data || []))
      .catch((err) => console.error("Error fetching reviews:", err));
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold mb-6">Dashboard</h2>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
          <p className="text-slate-300">Active Tests</p>
          <p className="text-3xl font-bold mt-2">
            {tests.filter((t) => t.status === "Active").length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
          <p className="text-slate-300">Registered Users</p>
          <p className="text-3xl font-bold mt-2">{users.length}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
          <p className="text-slate-300">Pending Reviews</p>
          <p className="text-3xl font-bold mt-2">
            {reviews.filter((r) => r.status === "Pending").length}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-3">Quick Actions</h3>
        <div className="flex gap-3">
          <Link
            to="/admin/tests/create"
            className="bg-white hover:bg-gray-100 px-4 py-2 rounded-md text-black"
          >
            Create New Test
          </Link>
          <Link
            to="/admin/users"
            className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-md"
          >
            Manage Users
          </Link>
        </div>
      </div>

      {/* Recent Tests */}
      <div className="mt-6">
        <h3 className="text-xl font-semibold mb-3">Recent Tests</h3>

        <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
          {/* header */}
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr className="text-left text-slate-300 border-b border-slate-700">
                <th className="p-4">Test Name</th>
                <th className="p-4">Status</th>
                <th className="p-4">Participants</th>
                <th className="p-4">Average Score</th>
              </tr>
            </thead>
          </table>
          {/* scrollable body */}
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full">
              <tbody>
                {tests.slice(0, 10).map((t) => (
                  <tr key={t._id} className="border-b border-slate-700">
                    <td className="p-4">{t.title}</td>
                    <td className="p-4">
                      <StatusPill label={t.status} />
                    </td>
                    <td className="p-4">{t.participants || 0}</td>
                    <td className="p-4">{t.avgScore || 0}</td>
                  </tr>
                ))}
                {tests.length === 0 && (
                  <tr>
                    <td
                      colSpan="4"
                      className="p-4 text-center text-slate-400"
                    >
                      No recent tests found.
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
