import React, { useMemo, useState, useEffect, useRef } from "react";
import { Search, X as CloseIcon, UserPlus, Users as UsersIcon, Trash2, Image as ImageIcon, KeyRound } from "lucide-react";
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
  
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  .animate-slide-in-up {
    animation: slideInUp 0.6s ease-out forwards;
    opacity: 0;
  }
  
  .animate-fade-in {
    animation: fadeIn 0.2s ease-out forwards;
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
  const [deletingImage, setDeletingImage] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    totalPages: 1,
    totalUsers: 0,
    hasNextPage: false,
    hasPrevPage: false
  });
  const searchDebounceRef = useRef(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Fetch users from backend with profile details, pagination, search, and filter
  const fetchUsers = (page = currentPage, search = searchTerm, roleFilter = filter) => {
    setLoading(true);
    // Build query parameters
    const params = new URLSearchParams({
      page: page.toString(),
      limit: "9"
    });
    
    if (search) {
      params.append("search", search);
    }
    
    if (roleFilter && roleFilter !== "All Users") {
      params.append("filter", roleFilter);
    }

    fetch(`${API_BASE_URL}/users/profiles?${params.toString()}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        console.log("Fetched users data:", data);
        if (data.users && Array.isArray(data.users)) {
          // Mark that initial load is complete after first fetch
          if (isInitialLoad) {
            setIsInitialLoad(false);
          }
          setUsers(data.users);
          if (data.pagination) {
            setPagination(data.pagination);
          }
        } else if (Array.isArray(data)) {
          // Fallback for old format
          if (isInitialLoad) {
            setIsInitialLoad(false);
          }
          setUsers(data);
        } else {
          console.error("Data format unexpected:", data);
          setUsers([]);
        }
      })
      .catch((err) => {
        console.error("Error fetching users:", err);
        setUsers([]);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    // Reset to page 1 when search or filter changes
    setCurrentPage(1);
  }, [searchTerm, filter]);

  useEffect(() => {
    // Clear previous debounce timer
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // Debounce search to make it smooth
    searchDebounceRef.current = setTimeout(() => {
      fetchUsers(currentPage, searchTerm, filter);
    }, 300); // 300ms debounce delay

    // Cleanup function
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchTerm, filter]);

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

  // Note: With pagination, we display all users from current page
  // Search/filter could be implemented server-side for better performance
  // For now, we'll show all users from the current page
  const filtered = users;

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

  const deleteProfileImage = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to delete the profile image for ${userName}? They will be able to re-upload their image.`)) {
      return;
    }

    setDeletingImage(userId);
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}/profile-image`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Refresh the user list
        fetchUsers();
        alert("Profile image deleted successfully. User can now re-upload their image.");
      } else {
        const data = await response.json();
        alert(data.message || "Failed to delete profile image");
      }
    } catch (err) {
      console.error("Error deleting profile image:", err);
      alert("Error deleting profile image. Please try again.");
    } finally {
      setDeletingImage(null);
    }
  };

  const resetPassword = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to reset the password for ${userName}? The password will be changed to the default: 12345`)) {
      return;
    }

    setResettingPassword(userId);
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        alert(data.message || "Password reset successfully. Default password is now: 12345");
      } else {
        const errorData = await response.json();
        alert(errorData.message || "Failed to reset password");
      }
    } catch (err) {
      console.error("Error resetting password:", err);
      alert("Error resetting password. Please try again.");
    } finally {
      setResettingPassword(null);
    }
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
                  {pagination.totalUsers} total users • Page {pagination.currentPage || currentPage} of {pagination.totalPages || 1}
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
                {/* Always render clear button to prevent layout shift, but make it invisible when no text */}
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center transition-all duration-200"
                  style={{ 
                    color: searchTerm ? "#FFFFFF" : "transparent",
                    pointerEvents: searchTerm ? "auto" : "none",
                    cursor: searchTerm ? "pointer" : "default"
                  }}
                  onMouseEnter={(e) => {
                    if (searchTerm) {
                      e.currentTarget.style.color = "#E5E7EB";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (searchTerm) {
                      e.currentTarget.style.color = "#FFFFFF";
                    }
                  }}
                  aria-label="Clear search"
                  tabIndex={searchTerm ? 0 : -1}
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
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
      <div 
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto flex-grow transition-opacity duration-300"
        style={{ opacity: loading ? 0.5 : 1 }}
      >
        {users.map((u, index) => (
          <div
            key={u._id}
            className={`relative backdrop-blur-sm rounded-2xl p-5 border overflow-hidden flex flex-col min-h-[300px] ${
              isInitialLoad ? 'animate-slide-in-up' : 'animate-fade-in'
            }`}
            style={{
              backgroundColor: "rgba(15, 23, 42, 0.9)",
              borderColor: "rgba(148, 163, 184, 0.2)",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
              animationDelay: isInitialLoad ? `${index * 100}ms` : '0ms',
            }}
          >

            <div className="relative z-10">
              {/* Header Section */}
              <div className="mb-4">
                <div className="flex items-start gap-3">
                  {/* Profile Icon with beautiful styling */}
                  <div className="relative flex-shrink-0">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 flex items-center justify-center border-2 border-slate-600/50 shadow-xl">
                      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "#94A3B8" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    {/* Status indicator ring */}
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 border-2 border-slate-800 shadow-lg"></div>
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <h3
                      className="text-lg font-bold mb-1 truncate"
                      style={{ color: "#F1F5F9" }}
                      title={u.name}
                    >
                      {u.name}
                    </h3>
                    <p
                      className="text-sm truncate"
                      style={{ color: "#94A3B8" }}
                      title={u.email}
                    >
                      {u.email}
                    </p>
                  </div>
                </div>
              </div>

              {/* User Details */}
              <div className="space-y-2.5 mb-4">
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-800/80 via-slate-900/80 to-slate-800/80 rounded-xl border border-slate-700/50 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-300 group/item">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-lg shadow-md flex-shrink-0 group-hover/item:from-blue-500/30 group-hover/item:to-blue-600/30 transition-all duration-300">
                      <svg className="h-4 w-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <span className="text-slate-300 text-sm font-semibold whitespace-nowrap">Role</span>
                  </div>
                  <span className="px-3 py-1.5 bg-gradient-to-r from-blue-600/30 to-blue-700/30 text-blue-200 rounded-lg text-xs font-bold border border-blue-500/30 shadow-md min-w-[80px] text-center">
                    {u.role}
                  </span>
                </div>

                {u.role === "Student" && u.studentCategory && (
                  <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-800/80 via-slate-900/80 to-slate-800/80 rounded-xl border border-slate-700/50 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300 group/item">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="p-2 bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-lg shadow-md flex-shrink-0 group-hover/item:from-purple-500/30 group-hover/item:to-purple-600/30 transition-all duration-300">
                        <svg className="h-4 w-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      </div>
                      <span className="text-slate-300 text-sm font-semibold whitespace-nowrap">Category</span>
                    </div>
                    <span className="px-3 py-1.5 bg-gradient-to-r from-purple-600/30 to-purple-700/30 text-purple-200 rounded-lg text-xs font-bold border border-purple-500/30 shadow-md min-w-[80px] text-center">
                      {u.studentCategory || "SU"}
                    </span>
                  </div>
                )}

                {/* Profile Image Status */}
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-800/80 via-slate-900/80 to-slate-800/80 rounded-xl border border-slate-700/50 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300 group/item">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 rounded-lg shadow-md flex-shrink-0 group-hover/item:from-emerald-500/30 group-hover/item:to-emerald-600/30 transition-all duration-300">
                      <ImageIcon className="h-4 w-4 text-emerald-400" />
                    </div>
                    <span className="text-slate-300 text-sm font-semibold whitespace-nowrap">Profile Image</span>
                  </div>
                  <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border shadow-md min-w-[80px] text-center ${
                    u.profileImageSaved 
                      ? 'bg-gradient-to-r from-emerald-600/30 to-emerald-700/30 text-emerald-200 border-emerald-500/30' 
                      : 'bg-gradient-to-r from-slate-700/50 to-slate-800/50 text-slate-300 border-slate-600/30'
                  }`}>
                    {u.profileImageSaved ? "Uploaded" : "Not Set"}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2.5 mt-auto pt-4" style={{ borderTop: "1px solid rgba(148, 163, 184, 0.2)" }}>
                <div className="flex justify-between gap-2.5">
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
                      setAddMode("single");
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-slate-700/80 to-slate-800/80 hover:from-slate-600/90 hover:to-slate-700/90 text-gray-100 rounded-lg text-xs font-semibold border border-slate-600/50 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 flex-1 text-center flex items-center justify-center gap-1.5"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    onClick={() => deleteUser(u._id)}
                    className="px-4 py-2 bg-gradient-to-r from-red-600/20 to-red-700/20 hover:from-red-600/30 hover:to-red-700/30 text-red-300 rounded-lg text-xs font-semibold border border-red-500/30 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 flex-1 text-center flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
                {/* Reset Password Button */}
                <button
                  onClick={() => resetPassword(u._id, u.name)}
                  disabled={resettingPassword === u._id}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600/20 to-blue-700/20 hover:from-blue-600/30 hover:to-blue-700/30 text-blue-300 rounded-lg text-xs font-semibold border border-blue-500/30 shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 hover:scale-105"
                >
                  <KeyRound className="h-4 w-4" />
                  {resettingPassword === u._id ? "Resetting..." : "Reset Password"}
                </button>
                {/* Delete Profile Image Button - Only show if image exists in DB */}
                {u.profileImageSaved && (
                  <button
                    onClick={() => deleteProfileImage(u._id, u.name)}
                    disabled={deletingImage === u._id}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600/20 to-orange-700/20 hover:from-orange-600/30 hover:to-orange-700/30 text-orange-300 rounded-lg text-xs font-semibold border border-orange-500/30 shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 hover:scale-105"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletingImage === u._id ? "Deleting..." : "Delete Profile Image"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading ? (
          <div className="col-span-full text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div className="col-span-full text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>
            No users found in the database.
          </div>
        ) : null}
      </div>

      {/* Pagination Controls */}
      {!loading && pagination.totalPages > 1 && (
        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => {
                if (currentPage > 1) {
                  setCurrentPage(currentPage - 1);
                }
              }}
              disabled={!pagination.hasPrevPage || currentPage === 1}
              className="px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
              style={{
                backgroundColor: !pagination.hasPrevPage || currentPage === 1 
                  ? 'rgba(255, 255, 255, 0.05)' 
                  : '#FFFFFF',
                color: !pagination.hasPrevPage || currentPage === 1 ? '#FFFFFF' : '#000000',
                border: '2px solid rgba(255, 255, 255, 0.2)'
              }}
              onMouseEnter={(e) => {
                if (pagination.hasPrevPage && currentPage > 1) {
                  e.currentTarget.style.background = '#FFFFFF';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(255, 255, 255, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (pagination.hasPrevPage && currentPage > 1) {
                  e.currentTarget.style.background = '#FFFFFF';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
                }
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
            
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum;
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all duration-300 ${
                      currentPage === pageNum
                        ? 'bg-white text-black shadow-lg transform scale-105'
                        : 'text-white hover:bg-white/20 hover:scale-105'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => {
                if (currentPage < pagination.totalPages) {
                  setCurrentPage(currentPage + 1);
                }
              }}
              disabled={!pagination.hasNextPage || currentPage >= pagination.totalPages}
              className="px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
              style={{
                backgroundColor: !pagination.hasNextPage || currentPage >= pagination.totalPages
                  ? 'rgba(255, 255, 255, 0.05)' 
                  : '#FFFFFF',
                color: !pagination.hasNextPage || currentPage >= pagination.totalPages ? '#FFFFFF' : '#000000',
                border: '2px solid rgba(255, 255, 255, 0.2)'
              }}
              onMouseEnter={(e) => {
                if (pagination.hasNextPage && currentPage < pagination.totalPages) {
                  e.currentTarget.style.background = '#FFFFFF';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(255, 255, 255, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (pagination.hasNextPage && currentPage < pagination.totalPages) {
                  e.currentTarget.style.background = '#FFFFFF';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
                }
              }}
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
