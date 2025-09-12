import React, { useMemo, useState, useEffect } from "react";
import StatusPill from "../components/StatusPill";
import EmailUploader from "../components/EmailUploader";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "Student",
    studentCategory: "RU",
    // status: "Active",
  });
  const [editing, setEditing] = useState(null);

  // Fetch users from backend
  const fetchUsers = () => {
    fetch("https://cg-test-app.onrender.com/api/users")
      .then((res) => res.json())
      .then((data) => setUsers(data))
      .catch((err) => console.error("Error fetching users:", err));
  };

  useEffect(fetchUsers, []);

  const [studentCategoryFilter, setStudentCategoryFilter] = useState("All");

  const filtered = useMemo(
    () => {
      let filteredUsers = users;

      if (studentCategoryFilter !== "All") {
        filteredUsers = filteredUsers.filter(u => {
          // Only filter students by category, show all non-students
          if (u.role !== "Student") return true;
          return u.studentCategory === studentCategoryFilter;
        });
      }

      return filteredUsers.filter((u) =>
        (u.name + u.email).toLowerCase().includes(q.toLowerCase())
      );
    },
    [q, users, studentCategoryFilter]
  );

  const submit = () => {
    if (!form.name.trim() || !form.email.trim()) {
      return alert("Name & email required");
    }

    if (editing) {
      // Update existing user
      fetch(`https://cg-test-app.onrender.com/api/users/${editing}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
        .then((res) => {
          if (!res.ok) {
            return res.json().then((err) => {
              throw new Error(err.message || "Failed to update user");
            });
          }
          return res.json();
        })
        .then(() => {
          fetchUsers(); // Refresh list
          setEditing(null);
        })
        .catch((err) => {
          console.error("Error updating user:", err);
          alert(err.message || "Error updating user");
        });
    } else {
      // Create new user
      fetch("https://cg-test-app.onrender.com/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
        .then((res) => {
          if (!res.ok) {
            return res.json().then((err) => {
              throw new Error(err.message || "Failed to create user");
            });
          }
          return res.json();
        })
        .then(() => {
          fetchUsers(); // Refresh list
        })
        .catch((err) => {
          console.error("Error creating user:", err);
          alert(err.message || "Error creating user");
        });
    }

    // Reset form
    setForm({
      name: "",
      email: "",
      role: "Student",
      studentCategory: "RU",
      // status: "Active",
    });
  };

  const deleteUser = (id) => {
    fetch(`https://cg-test-app.onrender.com/api/users/${id}`, { method: "DELETE" })
      .then(() => {
        setUsers((prev) => prev.filter((u) => u._id !== id));
      })
      .catch((err) => console.error("Error deleting user:", err));
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">Users</h2>
        <button
          onClick={submit}
          className="bg-white text-black hover:bg-gray-200 px-4 py-2 rounded-md cursor-pointer"
        >
          {editing ? "Save User" : "Add User"}
        </button>
      </div>

      {/* Quick Add/Edit row */}
      <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 mb-6 grid md:grid-cols-3 gap-5">
        <input
          value={form.name}
          onChange={(e) =>
            setForm((f) => ({ ...(f || {}), name: e.target.value }))
          }
          placeholder="Full name"
          className="p-2 rounded bg-slate-900 border border-slate-700"
        />
        <input
          value={form.email}
          onChange={(e) =>
            setForm((f) => ({ ...(f || {}), email: e.target.value }))
          }
          placeholder="Email"
          className="p-2 rounded bg-slate-900 border border-slate-700"
        />
        <select
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          className="p-2 rounded bg-slate-900 border border-slate-700"
        >
          <option value="Student">Student</option>
          <option value="Mentor">Mentor</option>
          <option value="Admin">Admin</option>
        </select>

        {form.role === "Student" && (
          <select
            value={form.studentCategory}
            onChange={(e) => setForm((f) => ({ ...f, studentCategory: e.target.value }))}
            className="p-2 rounded bg-slate-900 border border-slate-700"
          >
            <option value="RU">RU</option>
            <option value="SU">SU</option>
          </select>
        )}

        {/* <select
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          className="p-2 rounded bg-slate-900 border border-slate-700"
        >
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select> */}
      </div>

      {/* Bulk Upload Section */}
      <EmailUploader onUploadComplete={fetchUsers} />

      <div className="mb-3 flex items-center gap-4">
        <div className="flex-1">
          <label className="block text-slate-300 mb-2">Search Users</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email"
            className="w-full p-3 rounded-md bg-slate-800 border border-slate-700"
          />
        </div>
        <div>
          <label className="block text-slate-300 mb-2">Filter by Student Category</label>
          <select
            value={studentCategoryFilter}
            onChange={(e) => setStudentCategoryFilter(e.target.value)}
            className="p-2 rounded bg-slate-900 border border-slate-700"
          >
            <option value="All">All</option>
            <option value="RU">RU</option>
            <option value="SU">SU</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-slate-300 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
                <th className="p-4">Name</th>
                <th className="p-4">Email</th>
                <th className="p-4">Role</th>
                {/* <th className="p-4">Status</th> */}
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u._id} className="border-b border-slate-700">
                  <td className="p-4">{u.name}</td>
                  <td className="p-4 text-blue-400">{u.email}</td>
                  <td className="p-4">
                    <StatusPill label={u.role} />
                  </td>
                  {/* <td className="p-4">{u.status}</td> */}
                  <td className="p-4 flex gap-3">
                    <button
                      onClick={() => {
                        setEditing(u._id);
                        setForm({
                          name: u.name,
                          email: u.email,
                          role: u.role,
                          studentCategory: u.studentCategory || "RU",
                          // status: u.status,
                        });
                      }}
                      className="text-blue-400 cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteUser(u._id)}
                      className="text-rose-400 cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td className="p-6 text-center text-slate-400" colSpan="5">
                    No users found.
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
