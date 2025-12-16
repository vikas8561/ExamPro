import React, { useMemo, useState, useEffect } from "react";
import { Search, X as CloseIcon, UserPlus, Users as UsersIcon } from "lucide-react";
import StatusPill from "../components/StatusPill";
import EmailUploader from "../components/EmailUploader";
import { API_BASE_URL } from "../config/api";

// Card animation styles
const cardAnimationStyles = `
  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .animate-slide-in-up {
    animation: slideInUp 0.6s ease-out forwards;
    opacity: 0;
  }
`;

export default function Users() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "Student",
    studentCategory: "SU",
  });
  const [editing, setEditing] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState(null); // 'single' or 'bulk'
  const [filter, setFilter] = useState("All Users"); // "All Users", "RU Students", "SU Students", "Mentor", "Admin"
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Fetch users from backend
  const fetchUsers = () => {
    fetch(`${API_BASE_URL}/users`)
      .then((res) => res.json())
      .then((data) => setUsers(data))
      .catch((err) => console.error("Error fetching users:", err));
  };

  useEffect(fetchUsers, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.filter-dropdown')) {
        setIsFilterOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const filtered = useMemo(
    () => {
      let filteredUsers = users;

      // Apply search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredUsers = filteredUsers.filter((u) =>
          (u.name + u.email + (u.role || "")).toLowerCase().includes(term)
        );
      }

      // Apply filter
      if (filter === "RU Students") {
        filteredUsers = filteredUsers.filter(u => {
          return u.role === "Student" && (u.studentCategory || "SU") === "RU";
        });
      } else if (filter === "SU Students") {
        filteredUsers = filteredUsers.filter(u => {
          return u.role === "Student" && (u.studentCategory || "SU") === "SU";
        });
      } else if (filter === "Mentor") {
        filteredUsers = filteredUsers.filter(u => u.role === "Mentor");
      } else if (filter === "Admin") {
        filteredUsers = filteredUsers.filter(u => u.role === "Admin");
      }
      // "All Users" shows all users, no additional filtering needed

      return filteredUsers;
    },
    [searchTerm, users, filter]
  );

  const submit = () => {
    if (!form.name.trim() || !form.email.trim()) {
      return alert("Name & email required");
    }

    if (editing) {
      // Update existing user
      fetch(`${API_BASE_URL}/users/${editing}`, {
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
          fetchUsers();
          setEditing(null);
          setShowAddForm(false);
          setAddMode(null);
        })
        .catch((err) => {
          console.error("Error updating user:", err);
          alert(err.message || "Error updating user");
        });
    } else {
      // Create new user
      fetch(`${API_BASE_URL}/users`, {
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
          fetchUsers();
          setShowAddForm(false);
          setAddMode(null);
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
      studentCategory: "SU",
    });
  };

  const deleteUser = (id) => {
    if (!window.confirm("Are you sure you want to delete this user?")) {
      return;
    }
    fetch(`${API_BASE_URL}/users/${id}`, { method: "DELETE" })
      .then(() => {
        setUsers((prev) => prev.filter((u) => u._id !== id));
      })
      .catch((err) => console.error("Error deleting user:", err));
  };

  return (
    <div
      className="p-6 min-h-screen flex flex-col"
      style={{ backgroundColor: "#0B1220" }}
    >
      <style>{cardAnimationStyles}</style>

      {/* Navbar with Heading, Search Bar, and Add User Button */}
      <div className="sticky top-0 z-50 relative mb-8">
        <div className="relative bg-slate-800/95 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-lg">
          {/* Title and Actions Row */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Section Heading */}
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-700/60 rounded-xl">
                <UsersIcon className="h-8 w-8 text-gray-200" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">
                  Users
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                  {users.length} total users • {filtered.length} showing
                </p>
              </div>
            </div>

            {/* Search Bar and Add User Button */}
            <div className="flex items-center gap-3">
              <div className="relative max-w-md w-full lg:w-80 group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 transition-colors duration-200" style={{ color: "#FFFFFF" }} />
                </div>
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 rounded-xl focus:outline-none transition-all duration-300"
                  style={{
                    backgroundColor: "#1E293B",
                    border: "1px solid rgba(255, 255, 255, 0.3)",
                    color: "#FFFFFF",
                    boxShadow: "none",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.5)";
                    e.currentTarget.style.boxShadow = "0 0 0 2px rgba(255, 255, 255, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  onMouseEnter={(e) => {
                    if (document.activeElement !== e.currentTarget) {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (document.activeElement !== e.currentTarget) {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                    }
                  }}
                />
                <style>{`
                  input::placeholder {
                    color: #9CA3AF !important;
                    opacity: 1;
                  }
                `}</style>
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center transition-colors duration-200"
                    style={{ color: "#FFFFFF" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#E5E7EB";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "#FFFFFF";
                    }}
                    aria-label="Clear search"
                  >
                    <CloseIcon className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* Filter Dropdown */}
              <div className="relative filter-dropdown">
                <button
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="flex items-center gap-2 bg-slate-700/60 hover:bg-slate-700/80 text-white px-4 py-3 rounded-xl font-medium transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {filter}
                  <svg className={`h-4 w-4 transition-transform duration-200 ${isFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isFilterOpen && (
                  <div className="absolute top-full mt-1 w-full bg-slate-800 border border-slate-700/50 rounded-xl shadow-lg z-50 overflow-hidden">
                    {['All Users', 'RU Students', 'SU Students', 'Mentor', 'Admin'].map(option => (
                      <div
                        key={option}
                        onClick={() => {
                          setFilter(option);
                          setIsFilterOpen(false);
                        }}
                        className={`p-3 hover:bg-slate-700/50 cursor-pointer text-white transition-colors ${
                          filter === option ? 'bg-slate-700/50' : ''
                        }`}
                      >
                        {option}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add User Button */}
              <button
                onClick={() => {
                  if (showAddForm) {
                    // Close form
                    setShowAddForm(false);
                    setAddMode(null);
                    if (editing) {
                      setEditing(null);
                      setForm({
                        name: "",
                        email: "",
                        role: "Student",
                        studentCategory: "SU",
                      });
                    }
                  } else {
                    // Open form with mode selection
                    setShowAddForm(true);
                    setAddMode(null); // Show choice first
                  }
                }}
                className="group inline-flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 shadow-sm hover:shadow-md"
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
                <UserPlus className="h-5 w-5" />
                <span>{editing ? "Cancel Edit" : showAddForm ? "Cancel" : "Add User"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit User Form or Bulk Upload */}
      {showAddForm && (
        <div className="mb-6">
          <div
            className="rounded-2xl p-6 border"
            style={{
              backgroundColor: "#0B1220",
              borderColor: "rgba(255, 255, 255, 0.2)",
            }}
          >
            {/* Choice Selection - Show when no mode selected and not editing */}
            {!addMode && !editing && (
              <>
                <h3 className="text-xl font-semibold mb-4" style={{ color: "#E5E7EB" }}>
                  Add Users
                </h3>
                <p className="text-sm mb-6" style={{ color: "#9CA3AF" }}>
                  Choose how you want to add users
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <button
                    onClick={() => setAddMode("single")}
                    className="p-6 rounded-xl border transition-all duration-300 text-left group"
                    style={{
                      backgroundColor: "#0B1220",
                      borderColor: "rgba(255, 255, 255, 0.2)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
                      e.currentTarget.style.boxShadow = "0 10px 25px -5px rgba(255, 255, 255, 0.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-slate-800/70 rounded-lg">
                        <UserPlus className="h-5 w-5" style={{ color: "#FFFFFF" }} />
                      </div>
                      <h4 className="text-lg font-semibold" style={{ color: "#E5E7EB" }}>
                        Single User
                      </h4>
                    </div>
                    <p className="text-sm" style={{ color: "#9CA3AF" }}>
                      Add one user at a time with custom details
                    </p>
                  </button>
                  <button
                    onClick={() => setAddMode("bulk")}
                    className="p-6 rounded-xl border transition-all duration-300 text-left group"
                    style={{
                      backgroundColor: "#0B1220",
                      borderColor: "rgba(255, 255, 255, 0.2)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
                      e.currentTarget.style.boxShadow = "0 10px 25px -5px rgba(255, 255, 255, 0.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-slate-800/70 rounded-lg">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#FFFFFF" }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <h4 className="text-lg font-semibold" style={{ color: "#E5E7EB" }}>
                        Bulk Upload
                      </h4>
                    </div>
                    <p className="text-sm" style={{ color: "#9CA3AF" }}>
                      Upload CSV file to add multiple users at once
                    </p>
                  </button>
                </div>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setAddMode(null);
                  }}
                  className="mt-4 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300"
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    color: "#E5E7EB",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
                  }}
                >
                  Cancel
                </button>
              </>
            )}

            {/* Single User Form */}
            {(addMode === "single" || editing) && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold" style={{ color: "#E5E7EB" }}>
                    {editing ? "Edit User" : "Add Single User"}
                  </h3>
                  <button
                    onClick={() => {
                      if (editing) {
                        setEditing(null);
                        setShowAddForm(false);
                        setAddMode(null);
                      } else {
                        setAddMode(null);
                      }
                      setForm({
                        name: "",
                        email: "",
                        role: "Student",
                        studentCategory: "SU",
                      });
                    }}
                    className="text-sm"
                    style={{ color: "#9CA3AF" }}
                  >
                    ← Back
                  </button>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Full name"
                    className="px-4 py-3 rounded-xl focus:outline-none transition-all duration-300"
                    style={{
                      backgroundColor: "#1E293B",
                      border: "1px solid rgba(255, 255, 255, 0.3)",
                      color: "#FFFFFF",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.5)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                    }}
                  />
                  <input
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Email"
                    className="px-4 py-3 rounded-xl focus:outline-none transition-all duration-300"
                    style={{
                      backgroundColor: "#1E293B",
                      border: "1px solid rgba(255, 255, 255, 0.3)",
                      color: "#FFFFFF",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.5)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                    }}
                  />
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    className="px-4 py-3 rounded-xl focus:outline-none transition-all duration-300"
                    style={{
                      backgroundColor: "#1E293B",
                      border: "1px solid rgba(255, 255, 255, 0.3)",
                      color: "#FFFFFF",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.5)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                    }}
                  >
                    <option value="Student" style={{ backgroundColor: "#1E293B" }}>Student</option>
                    <option value="Mentor" style={{ backgroundColor: "#1E293B" }}>Mentor</option>
                    <option value="Admin" style={{ backgroundColor: "#1E293B" }}>Admin</option>
                  </select>
                  {form.role === "Student" && (
                    <select
                      value={form.studentCategory}
                      onChange={(e) => setForm((f) => ({ ...f, studentCategory: e.target.value }))}
                      className="px-4 py-3 rounded-xl focus:outline-none transition-all duration-300"
                      style={{
                        backgroundColor: "#1E293B",
                        border: "1px solid rgba(255, 255, 255, 0.3)",
                        color: "#FFFFFF",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.5)";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
                      }}
                    >
                      <option value="RU" style={{ backgroundColor: "#1E293B" }}>RU</option>
                      <option value="SU" style={{ backgroundColor: "#1E293B" }}>SU</option>
                    </select>
                  )}
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={submit}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      color: "#FFFFFF",
                      border: "1px solid rgba(255, 255, 255, 0.3)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                    }}
                  >
                    {editing ? "Save Changes" : "Add User"}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setAddMode(null);
                      setEditing(null);
                      setForm({
                        name: "",
                        email: "",
                        role: "Student",
                        studentCategory: "SU",
                      });
                    }}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.05)",
                      color: "#E5E7EB",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {/* Bulk Upload */}
            {addMode === "bulk" && !editing && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold" style={{ color: "#E5E7EB" }}>
                    Bulk Upload Users
                  </h3>
                  <button
                    onClick={() => {
                      setAddMode(null);
                    }}
                    className="text-sm"
                    style={{ color: "#9CA3AF" }}
                  >
                    ← Back
                  </button>
                </div>
                <EmailUploader onUploadComplete={() => {
                  fetchUsers();
                  setShowAddForm(false);
                  setAddMode(null);
                }} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Users Grid - cards styled like Tests page */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto flex-grow">
        {filtered.map((u, index) => (
          <div
            key={u._id}
            className="group relative backdrop-blur-sm rounded-2xl p-6 border transition-all duration-300 cursor-pointer animate-slide-in-up overflow-hidden flex flex-col h-[260px]"
            style={{
              backgroundColor: "#0B1220",
              borderColor: "rgba(255, 255, 255, 0.2)",
              boxShadow: "0 0 0 rgba(255, 255, 255, 0)",
              animationDelay: `${index * 100}ms`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
              e.currentTarget.style.boxShadow =
                "0 20px 25px -5px rgba(255, 255, 255, 0.1), 0 10px 10px -5px rgba(255, 255, 255, 0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {/* Subtle gradient overlay on hover */}
            <div
              className="absolute inset-0 rounded-2xl transition-all duration-300 pointer-events-none opacity-0 group-hover:opacity-100"
              style={{
                background:
                  "linear-gradient(to bottom right, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))",
              }}
            ></div>

            <div className="relative z-10">
              {/* Header Section */}
              <div className="mb-4">
                <div className="flex items-start gap-3">
                  <div className="p-3 bg-slate-800/70 rounded-xl shadow-sm group-hover:shadow-md transition-shadow duration-300 flex-shrink-0">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#FFFFFF" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3
                      className="text-lg font-bold mb-1 truncate"
                      style={{ color: "#E5E7EB" }}
                      title={u.name}
                    >
                      {u.name}
                    </h3>
                    <p
                      className="text-sm truncate"
                      style={{ color: "#9CA3AF" }}
                      title={u.email}
                    >
                      {u.email}
                    </p>
                  </div>
                </div>
              </div>

              {/* User Details */}
              <div className="space-y-2.5 mb-4">
                <div className="flex items-center justify-between p-3.5 bg-slate-900/70 rounded-xl border border-slate-800/50 hover:bg-slate-900/80 transition-all duration-200">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-slate-800/70 rounded-lg shadow-sm flex-shrink-0">
                      <svg className="h-4 w-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <span className="text-slate-300 text-sm font-medium whitespace-nowrap">Role</span>
                  </div>
                  <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center">
                    {u.role}
                  </span>
                </div>

                {u.role === "Student" && u.studentCategory && (
                  <div className="flex items-center justify-between p-3.5 bg-slate-900/70 rounded-xl border border-slate-800/50 hover:bg-slate-900/80 transition-all duration-200">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="p-2 bg-slate-800/70 rounded-lg shadow-sm flex-shrink-0">
                        <svg className="h-4 w-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </div>
                      <span className="text-slate-300 text-sm font-medium whitespace-nowrap">Category</span>
                    </div>
                    <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center">
                      {u.studentCategory || "SU"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="relative z-10 flex justify-between gap-3 mt-2 pt-4" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.2)" }}>
              <button
                onClick={() => {
                  setEditing(u._id);
                  setForm({
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    studentCategory: u.studentCategory || "SU",
                  });
                  setShowAddForm(true);
                  setAddMode("single"); // Show form directly when editing
                }}
                className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm flex-1 text-center transition-all duration-300 hover:bg-slate-800/80"
              >
                Edit
              </button>
              <button
                onClick={() => deleteUser(u._id)}
                className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm flex-1 text-center transition-all duration-300 hover:bg-slate-800/80"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>
            {searchTerm ? "No users match your search." : "No users found."}
          </div>
        )}
      </div>
    </div>
  );
}
