import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../config/api";

export default function Dashboard() {
  const [tests, setTests] = useState([]);
  const [users, setUsers] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false); // Changed to false - don't block UI

  // Fetch all data from backend when the component mounts (non-blocking)
  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      const token = localStorage.getItem("token");

      try {
        // Fetch data with limits to improve performance
        const [testsResponse, usersResponse, reviewsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/tests?limit=20`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }),
          fetch(`${API_BASE_URL}/users?limit=50`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }),
          fetch(`${API_BASE_URL}/reviews?limit=10`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }),
        ]);

        // Check if responses are ok before parsing
        let testsData = [];
        let usersData = [];
        let reviewsData = [];

        if (testsResponse.ok) {
          const data = await testsResponse.json();
          testsData = Array.isArray(data.tests) ? data.tests : (Array.isArray(data) ? data : []);
        } else {
          console.warn(`Failed to fetch tests: ${testsResponse.status} ${testsResponse.statusText}`);
          if (testsResponse.status === 403) {
            console.warn("Access denied to tests endpoint - user may not have admin role");
          }
        }

        if (usersResponse.ok) {
          const data = await usersResponse.json();
          usersData = Array.isArray(data) ? data : (Array.isArray(data.users) ? data.users : []);
        } else {
          console.warn(`Failed to fetch users: ${usersResponse.status} ${usersResponse.statusText}`);
        }

        if (reviewsResponse.ok) {
          const data = await reviewsResponse.json();
          reviewsData = Array.isArray(data) ? data : (Array.isArray(data.reviews) ? data.reviews : []);
        } else {
          console.warn(`Failed to fetch reviews: ${reviewsResponse.status} ${reviewsResponse.statusText}`);
        }

        // Ensure all are arrays before setting state
        setTests(Array.isArray(testsData) ? testsData : []);
        setUsers(Array.isArray(usersData) ? usersData : []);
        setReviews(Array.isArray(reviewsData) ? reviewsData : []);
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
        // Set empty arrays on error to prevent filter errors
        setTests([]);
        setUsers([]);
        setReviews([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Ensure tests and reviews are arrays before filtering
  const activeTestsCount = Array.isArray(tests) ? tests.filter((t) => t && t.status === "Active").length : 0;
  const pendingReviewsCount = Array.isArray(reviews) ? reviews.filter((r) => r && r.status === "Pending").length : 0;

  return (
    <div
      className="p-6 min-h-screen"
      style={{ backgroundColor: "#0B1220" }}
    >
      <h2
        className="text-3xl font-bold mb-6"
        style={{ color: "#E5E7EB" }}
      >
        Admin Dashboard
      </h2>

      {/* Stats - styled like student dashboard cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {/* Active Tests */}
        <div
          className="rounded-2xl p-6 border transition-all duration-300"
          style={{
            backgroundColor: "#0B1220",
            borderColor: "rgba(255, 255, 255, 0.2)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
            e.currentTarget.style.boxShadow =
              "0 10px 25px -5px rgba(255, 255, 255, 0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div
              className="p-2 rounded-lg"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                style={{ color: "#FFFFFF" }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-slate-400">Active Tests</p>
          </div>
          <p
            className="text-4xl font-bold mt-2"
            style={{ color: "#E5E7EB" }}
          >
            {activeTestsCount}
          </p>
        </div>

        {/* Registered Users */}
        <div
          className="rounded-2xl p-6 border transition-all duration-300"
          style={{
            backgroundColor: "#0B1220",
            borderColor: "rgba(255, 255, 255, 0.2)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
            e.currentTarget.style.boxShadow =
              "0 10px 25px -5px rgba(255, 255, 255, 0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div
              className="p-2 rounded-lg"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                style={{ color: "#FFFFFF" }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M9 20H4v-2a3 3 0 015.356-1.857M15 11a3 3 0 10-6 0 3 3 0 006 0zm6 0a3 3 0 11-6 0 3 3 0 016 0zM9 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <p className="text-slate-400">Registered Users</p>
          </div>
          <p
            className="text-4xl font-bold mt-2"
            style={{ color: "#E5E7EB" }}
          >
            {users.length}
          </p>
        </div>

        {/* Pending Reviews */}
        <div
          className="rounded-2xl p-6 border transition-all duration-300"
          style={{
            backgroundColor: "#0B1220",
            borderColor: "rgba(255, 255, 255, 0.2)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
            e.currentTarget.style.boxShadow =
              "0 10px 25px -5px rgba(255, 255, 255, 0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div
              className="p-2 rounded-lg"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                style={{ color: "#FFFFFF" }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-slate-400">Pending Reviews</p>
          </div>
          <p
            className="text-4xl font-bold mt-2"
            style={{ color: "#E5E7EB" }}
          >
            {pendingReviewsCount}
          </p>
        </div>
      </div>

      {/* Quick Actions - styled to match theme */}
      <div className="mb-8">
        <h3
          className="text-xl font-semibold mb-3"
          style={{ color: "#E5E7EB" }}
        >
          Quick Actions
        </h3>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/admin/tests/create"
            className="group inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300"
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
            <span>Create New Test</span>
          </Link>
          <Link
            to="/admin/users"
            className="group inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              color: "#E5E7EB",
              border: "1px solid rgba(255, 255, 255, 0.2)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
            }}
          >
            <span>Manage Users</span>
          </Link>
        </div>
      </div>

      {/* Recent Tests - styled card */}
      <div className="mt-6">
        <h3
          className="text-xl font-semibold mb-3"
          style={{ color: "#E5E7EB" }}
        >
          Recent Tests
        </h3>

        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            backgroundColor: "#0B1220",
            borderColor: "rgba(255, 255, 255, 0.2)",
          }}
        >
          {/* header */}
          <table className="w-full">
            <thead>
              <tr
                className="text-left"
                style={{
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  color: "#E5E7EB",
                }}
              >
                <th className="p-4 text-sm font-medium">Test Name</th>
                <th className="p-4 text-sm font-medium">Status</th>
                <th className="p-4 text-sm font-medium">Participants</th>
                <th className="p-4 text-sm font-medium">Average Score</th>
              </tr>
            </thead>
          </table>
          {/* scrollable body */}
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full">
              <tbody>
                {Array.isArray(tests) && tests.slice(0, 10).map((t) => (
                  <tr
                    key={t._id}
                    className="border-t"
                    style={{ borderColor: "rgba(148, 163, 184, 0.3)" }}
                  >
                    <td className="p-4 text-sm" style={{ color: "#E5E7EB" }}>
                      {t.title}
                    </td>
                    <td className="p-4">
                      <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center inline-block">
                        {t.status}
                      </span>
                    </td>
                    <td
                      className="p-4 text-sm"
                      style={{ color: "#E5E7EB" }}
                    >
                      {t.participants || 0}
                    </td>
                    <td
                      className="p-4 text-sm"
                      style={{ color: "#E5E7EB" }}
                    >
                      {t.avgScore || 0}
                    </td>
                  </tr>
                ))}
                {tests.length === 0 && (
                  <tr>
                    <td
                      colSpan="4"
                      className="p-4 text-center text-sm"
                      style={{ color: "#9CA3AF" }}
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
