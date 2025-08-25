import React, { useState, useEffect } from "react";
import StatusPill from "../components/StatusPill";

export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [tests, setTests] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ testId: "", userId: "", status: "Assigned" });

  // Load data from backend
  useEffect(() => {
    fetch("http://localhost:5000/api/tests")
      .then(res => res.json())
      .then(data => {
        setTests(data);
        if (data.length > 0) setForm(f => ({ ...f, testId: data[0]._id }));
      });

    fetch("http://localhost:5000/api/users")
      .then(res => res.json())
      .then(data => {
        setUsers(data);
        if (data.length > 0) setForm(f => ({ ...f, userId: data[0]._id }));
      });

    fetch("http://localhost:5000/api/assignments")
      .then(res => res.json())
      .then(setAssignments);
  }, []);

  // Create assignment
  const submit = () => {
    if (!form.testId || !form.userId) {
      alert("Please select both test and user.");
      return;
    }
    fetch("http://localhost:5000/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    })
      .then(res => res.json())
      .then(newAssignment => setAssignments(prev => [...prev, newAssignment]));
  };

  // Delete assignment
  const deleteAssignment = (id) => {
    fetch(`http://localhost:5000/api/assignments/${id}`, { method: "DELETE" })
      .then(() => setAssignments(prev => prev.filter(a => a._id !== id)));
  };

  const getTest = (id) => tests.find((t) => t._id === id)?.title || "-";
  const getUser = (id) => users.find((u) => u._id === id)?.name || "-";

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold mb-6">Assignments</h2>

      {/* Assignment Form */}
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 mb-6 grid md:grid-cols-4 gap-3">
        <select value={form.testId} onChange={(e) => setForm(f => ({ ...f, testId: e.target.value }))} className="p-2 rounded bg-slate-900 border border-slate-700">
          {tests.length > 0 ? tests.map((t) => <option key={t._id} value={t._id}>{t.title}</option>) : <option disabled>No tests</option>}
        </select>

        <select value={form.userId} onChange={(e) => setForm(f => ({ ...f, userId: e.target.value }))} className="p-2 rounded bg-slate-900 border border-slate-700">
          {users.length > 0 ? users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>) : <option disabled>No users</option>}
        </select>

        <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))} className="p-2 rounded bg-slate-900 border border-slate-700">
          <option>Assigned</option>
          <option>Started</option>
          <option>Submitted</option>
        </select>

        <button onClick={submit} className="bg-white hover:bg-gray-100 rounded px-4 py-2 text-black">Assign</button>
      </div>

      {/* Assignments Table */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-slate-300 border-b border-slate-700">
              <th className="p-4">Test</th>
              <th className="p-4">User</th>
              <th className="p-4">Status</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {assignments.length > 0 ? assignments.map((a) => (
              <tr key={a._id} className="border-b border-slate-700">
                <td className="p-4">{getTest(a.testId)}</td>
                <td className="p-4">{getUser(a.userId)}</td>
                <td className="p-4"><StatusPill label={a.status} /></td>
                <td className="p-4">
                  <button onClick={() => deleteAssignment(a._id)} className="text-rose-400 hover:text-rose-500">Delete</button>
                </td>
              </tr>
            )) : (
              <tr><td className="p-6 text-center text-slate-400" colSpan="4">No assignments yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
