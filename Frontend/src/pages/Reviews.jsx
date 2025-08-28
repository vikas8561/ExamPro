import React, { useState, useEffect } from "react";
import StatusPill from "../components/StatusPill";

export default function Reviews() {
  const [reviews, setReviews] = useState([]);
  const [tests, setTests] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetch("http://localhost:5000/api/tests")
      .then(res => res.json())
      .then(setTests);

    fetch("http://localhost:5000/api/users")
      .then(res => res.json())
      .then(setUsers);

    fetch("http://localhost:5000/api/reviews")
      .then(res => res.json())
      .then(setReviews);
  }, []);

  const getTest = (id) => tests.find((t) => t._id === id)?.title || "-";
  const getUser = (id) => users.find((u) => u._id === id)?.name || "-";

  const updateReview = (id, updatedFields) => {
    fetch(`http://localhost:5000/api/reviews/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedFields)
    })
      .then(res => res.json())
      .then(updated => {
        setReviews(prev => prev.map(r => r._id === id ? updated : r));
      });
  };

  const deleteReview = (id) => {
    fetch(`http://localhost:5000/api/reviews/${id}`, { method: "DELETE" })
      .then(() => {
        setReviews(prev => prev.filter(r => r._id !== id));
      });
  };

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold mb-6">Reviews</h2>

      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-800 z-10">
              <tr className="text-left text-slate-300 border-b border-slate-700">
                <th className="p-4">Test</th>
                <th className="p-4">User</th>
                <th className="p-4">Type</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r._id} className="border-b border-slate-700">
                  <td className="p-4">{getTest(r.testId)}</td>
                  <td className="p-4">{getUser(r.userId)}</td>
                  <td className="p-4">{r.type}</td>
                  <td className="p-4"><StatusPill label={r.status} /></td>
                  <td className="p-4 flex gap-3">
                    <button onClick={() => updateReview(r._id, { status: "Approved" })} className="text-green-400">Approve</button>
                    <button onClick={() => updateReview(r._id, { status: "Rejected" })} className="text-rose-400">Reject</button>
                    <button onClick={() => deleteReview(r._id)} className="text-slate-300">Delete</button>
                  </td>
                </tr>
              ))}
              {!reviews.length && (
                <tr><td className="p-6 text-center text-slate-400" colSpan="5">No reviews pending.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
