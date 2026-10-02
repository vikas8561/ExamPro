import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  Search,
  X as CloseIcon,
  UserPlus,
  Users as UsersIcon,
  Trash2,
  Image as ImageIcon,
  Zap,
  ChevronLeft,
  ChevronRight,
  Filter,
  Check,
  Edit3,
  Shield,
  GraduationCap,
  UserCheck,
  AlertCircle,
  Lock,
  LockOpen,
  KeyRound,
  RotateCcw,
  Clock
} from "lucide-react";
import { API_BASE_URL } from "../config/api";
import apiRequest from "../services/api";

// Matches DEFAULT_STUDENT_PASSWORD in Backend/routes/users.js, which is what
// actually gets set; this copy only exists so the admin is told what it will be.
const DEFAULT_STUDENT_PASSWORD = "123456";

// Why a re-enableable test ended, as the server records it (services/reEnable.js).
const RE_ENABLE_REASONS = {
  violation: "Cancelled by proctoring",
  auto_submit: "Auto-submitted",
  submitted: "Submitted early"
};

// Server codes meaning the test can no longer be reopened, so its row should go.
const RE_ENABLE_GONE = new Set(["time_over", "not_submitted", "changed", "no_window", "not_found"]);

// `mentorView` is the same directory as a mentor sees it from the mentor panel:
// only the students in their assigned batches (the server scopes the listing),
// and only Unblock and Reset Password on each. No staff, no deleting, no face
// resets and no account creation — the server refuses all of those to mentors
// regardless, so hiding them here is about not offering buttons that would fail.
export default function Users({ mentorView = false }) {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const EMPTY_FORM = { name: "", email: "", password: "", role: "Mentor", subjects: [] };
  const [form, setForm] = useState(EMPTY_FORM);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filter, setFilter] = useState("All Users");
  const [filterOptions, setFilterOptions] = useState([
    { value: "All Users", label: mentorView ? "My Students" : "All Users" }
  ]);
  // Mentors only: whether /users/filters has answered, so "no batches assigned"
  // is not announced before we actually know.
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [deletingImage, setDeletingImage] = useState(null);
  // Which student card has an unblock / password reset in flight, as
  // `${id}:unblock` or `${id}:reset`, so only the pressed button shows a spinner.
  const [lockAction, setLockAction] = useState(null);
  // The assignment whose Re-enable is in flight, so only that button spins.
  const [reEnablingId, setReEnablingId] = useState(null);
  // Ticks so a test drops off a card the moment its re-enable window closes,
  // without waiting for a refetch. The server checks again on every press.
  const [now, setNow] = useState(() => Date.now());
  const [resultPopup, setResultPopup] = useState({ show: false, message: "", type: "success" });
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    totalPages: 1,
    totalUsers: 0,
    hasNextPage: false,
    hasPrevPage: false,
    currentPage: 1
  });
  // Role totals across the whole filtered directory, from the server. They cannot
  // be counted from `users`, which holds only the nine rows of the current page.
  const [counts, setCounts] = useState(null);
  const searchDebounceRef = useRef(null);

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmKeyword: "",
    action: null,
    isDanger: true,
    isLoading: false
  });
  const [typedConfirmation, setTypedConfirmation] = useState("");

  // Fetch users with pagination, search, and roleFilter
  const fetchUsers = (page = currentPage, search = searchTerm, roleFilter = filter) => {
    setLoading(true);
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

    fetch(`${API_BASE_URL}/users/profiles?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.users && Array.isArray(data.users)) {
          setUsers(data.users);
          if (data.pagination) {
            setPagination(data.pagination);
          }
          setCounts(data.counts || null);
        } else if (Array.isArray(data)) {
          // The unpaginated endpoint returns every row, so counting it is correct.
          setUsers(data);
          setCounts(null);
        } else {
          setUsers([]);
          setCounts(null);
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
    setCurrentPage(1);
  }, [searchTerm, filter]);

  // Load directory filter options
  useEffect(() => {
    fetch(`${API_BASE_URL}/users/filters`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    })
      .then((res) => (res.ok ? res.json() : { filters: [] }))
      .then((data) => {
        if (data.filters?.length) setFilterOptions(data.filters);
      })
      .catch((err) => console.error("Error fetching filter options:", err))
      .finally(() => setFiltersLoaded(true));
  }, []);

  // Load subjects for mentor assignment form. Mentors cannot create accounts, so
  // they never see that form.
  useEffect(() => {
    if (mentorView) return;
    fetch(`${API_BASE_URL}/subjects`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    })
      .then((res) => (res.ok ? res.json() : { subjects: [] }))
      .then((data) => setSubjectOptions(data.subjects || []))
      .catch((err) => {
        console.error("Error fetching subjects:", err);
        setSubjectOptions([]);
      });
  }, [mentorView]);

  // Debounce search
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      fetchUsers(currentPage, searchTerm, filter);
    }, 300);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [currentPage, searchTerm, filter]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".filter-dropdown")) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Submit Create or Edit User
  const submit = () => {
    if (!form.name.trim() || !form.email.trim()) {
      return alert("Name & email required");
    }

    if (!editing && !form.password.trim()) {
      return alert("Password is required");
    }

    if (form.password.trim() && form.password.trim().length < 6) {
      return alert("Password must be at least 6 characters long");
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      subjects: form.role === "Mentor" ? form.subjects : []
    };
    if (form.password.trim()) payload.password = form.password.trim();

    if (editing) {
      fetch(`${API_BASE_URL}/users/${editing}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(payload)
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
          setForm(EMPTY_FORM);
          setResultPopup({ show: true, message: "User updated successfully", type: "success" });
        })
        .catch((err) => {
          console.error("Error updating user:", err);
          alert(err.message || "Error updating user");
        });
    } else {
      fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(payload)
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
          setForm(EMPTY_FORM);
          setResultPopup({ show: true, message: "User created successfully", type: "success" });
        })
        .catch((err) => {
          console.error("Error creating user:", err);
          alert(err.message || "Error creating user");
        });
    }
  };

  const deleteUser = (id, name) => {
    if (!window.confirm(`Are you sure you want to delete user "${name || 'this user'}"?`)) {
      return;
    }
    fetch(`${API_BASE_URL}/users/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`
      }
    })
      .then(() => {
        setUsers((prev) => prev.filter((u) => u._id !== id));
        setResultPopup({ show: true, message: "User deleted successfully", type: "success" });
      })
      .catch((err) => console.error("Error deleting user:", err));
  };

  const deleteProfileImage = async (userId, userName) => {
    if (
      !window.confirm(
        `Are you sure you want to delete the profile image for ${userName}? They will be able to re-upload their image.`
      )
    ) {
      return;
    }

    setDeletingImage(userId);
    try {
      const response = await fetch(`${API_BASE_URL}/users/${userId}/profile-image`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });

      if (response.ok) {
        fetchUsers();
        setResultPopup({
          show: true,
          message: "Profile image deleted successfully. User can now re-upload.",
          type: "success"
        });
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

  // How long a lockout has left. The number came with the page data, so it ages
  // between refreshes - phrased loosely enough that being a minute out does not
  // make it wrong.
  const formatLockRemaining = (ms) => {
    const minutes = Math.ceil((ms || 0) / 60000);
    if (minutes <= 1) return "under a minute left";
    return `${minutes} min left`;
  };

  // Clear a student's failed-login lockout so they can sign in again. Their
  // password is untouched - use this when they know it and simply mistyped it.
  const unblockStudent = async (student) => {
    if (
      !window.confirm(
        `Unblock ${student.name}? Their failed login attempts will be cleared and they can sign in again straight away with their existing password.`
      )
    ) {
      return;
    }

    setLockAction(`${student._id}:unblock`);
    try {
      const data = await apiRequest(`/users/${student._id}/unblock`, { method: "POST" });
      // Patch the row in place rather than refetching: the lock state is the only
      // thing that changed, and a refetch would lose the admin's page and search.
      setUsers((prev) =>
        prev.map((row) =>
          row._id === student._id
            ? { ...row, isLocked: false, lockedUntil: null, lockRemainingMs: 0, failedLoginAttempts: 0 }
            : row
        )
      );
      setResultPopup({ show: true, message: data.message || "Student unblocked.", type: "success" });
    } catch (err) {
      console.error("Error unblocking student:", err);
      setResultPopup({
        show: true,
        message: err.message || "Could not unblock this student.",
        type: "error"
      });
    } finally {
      setLockAction(null);
    }
  };

  // Reset a student's password to the shared default. This also clears any
  // lockout and signs them out everywhere, so it covers a forgotten password on
  // its own - the admin does not need to press Unblock as well.
  const resetStudentPassword = async (student) => {
    if (
      !window.confirm(
        `Reset the password for ${student.name} to ${DEFAULT_STUDENT_PASSWORD}?\n\n` +
          `They will be signed out everywhere and any lockout will be cleared.\n\n` +
          `This is the same password they use for the university's attendance platform, so it changes there too. Tell them to change it after signing in.`
      )
    ) {
      return;
    }

    setLockAction(`${student._id}:reset`);
    try {
      const data = await apiRequest(`/users/${student._id}/reset-password`, { method: "POST" });
      setUsers((prev) =>
        prev.map((row) =>
          row._id === student._id
            ? { ...row, isLocked: false, lockedUntil: null, lockRemainingMs: 0, failedLoginAttempts: 0 }
            : row
        )
      );
      setResultPopup({
        show: true,
        message: data.message || `Password reset to ${DEFAULT_STUDENT_PASSWORD}.`,
        type: "success"
      });
    } catch (err) {
      console.error("Error resetting student password:", err);
      setResultPopup({
        show: true,
        message: err.message || "Could not reset this student's password.",
        type: "error"
      });
    } finally {
      setLockAction(null);
    }
  };

  const closeConfirmModal = () => {
    setConfirmModal({ ...confirmModal, isOpen: false });
    setTypedConfirmation("");
  };

  const executeConfirmAction = async () => {
    if (confirmModal.confirmKeyword && typedConfirmation !== confirmModal.confirmKeyword) {
      return;
    }

    try {
      setConfirmModal((prev) => ({ ...prev, isLoading: true }));
      await confirmModal.action();
      closeConfirmModal();
    } catch (error) {
      console.error("Action failed:", error);
      alert("Action failed: " + (error.message || "Unknown error"));
      setConfirmModal((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const deleteAllProfileImages = () => {
    setConfirmModal({
      isOpen: true,
      title: "Reset All Profile Images",
      message:
        "Are you sure you want to delete profile images and face descriptors for ALL users? This action cannot be undone.",
      confirmKeyword: "RESET ALL",
      isDanger: true,
      isLoading: false,
      action: async () => {
        const data = await apiRequest("/users/profile-images/all", {
          method: "DELETE"
        });
        setResultPopup({ show: true, message: data.message || "All profile images reset.", type: "success" });
        fetchUsers();
      }
    });
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // How long is left, in words. `endsAt` is when the attempt itself ends.
  const formatTimeLeft = (endsAt) => {
    const minutes = Math.floor((new Date(endsAt).getTime() - now) / 60000);
    if (minutes < 1) return "under a minute left";
    if (minutes < 60) return `${minutes}m left`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m left` : `${hours}h left`;
  };

  // Drop one test from one student's card.
  const removeReEnableable = (studentId, assignmentId) => {
    setUsers((prev) =>
      prev.map((row) =>
        row._id === studentId
          ? {
              ...row,
              reEnableable: (row.reEnableable || []).filter((t) => t.assignmentId !== assignmentId)
            }
          : row
      )
    );
  };

  // Reopen a test the student handed in before its time was up. The server
  // decides whether that is still allowed; this only asks and reports.
  const reEnableTest = async (student, item) => {
    const reason = RE_ENABLE_REASONS[item.reason] || "Submitted early";
    if (
      !window.confirm(
        `Re-enable "${item.testTitle}" for ${student.name}?\n\n` +
          `Ended: ${reason}\n` +
          `Time: ${formatTimeLeft(item.endsAt)}\n\n` +
          `• The student continues with all their saved answers.\n` +
          `• No extra time is given; the original timer keeps running.\n` +
          (item.reason === "violation"
            ? `• Active violations reset to 0. The full violation history stays on the report.\n`
            : `• Violations recorded so far still count.\n`) +
          `• The submitted score is withdrawn until they submit again.`
      )
    ) {
      return;
    }

    setReEnablingId(item.assignmentId);
    try {
      const data = await apiRequest(`/assignments/${item.assignmentId}/re-enable`, { method: "POST" });
      removeReEnableable(student._id, item.assignmentId);
      setResultPopup({
        show: true,
        message: data.message || `"${item.testTitle}" re-enabled for ${student.name}.`,
        type: "success"
      });
    } catch (err) {
      console.error("Error re-enabling test:", err);
      if (RE_ENABLE_GONE.has(err.code)) removeReEnableable(student._id, item.assignmentId);
      setResultPopup({
        show: true,
        message: err.message || "Could not re-enable this test.",
        type: "error"
      });
    } finally {
      setReEnablingId(null);
    }
  };

  // Auto-dismiss result popup after 3 seconds
  useEffect(() => {
    if (resultPopup.show) {
      const timer = setTimeout(() => {
        setResultPopup({ show: false, message: "", type: "success" });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [resultPopup.show]);

  // Headline figures for the KPI row, covering the whole directory under the
  // current search and filter - the same scope as `pagination.totalUsers`, so the
  // three roles always add up to the total.
  //
  // These come from the server. Counting `users` here is what made the row wrong:
  // it holds one page of nine rows sorted students-first, so "All Users" showed
  // Students 9, Mentors 0, Admins 0 however many mentors and admins existed. The
  // fallback only runs for the unpaginated response, which does contain every row.
  const roleCounts = useMemo(() => {
    if (counts) return counts;
    return {
      total: users.length,
      students: users.filter((u) => u.role === "Student").length,
      mentors: users.filter((u) => u.role === "Mentor").length,
      admins: users.filter((u) => u.role === "Admin").length
    };
  }, [counts, users]);

  // The figures follow the active search and filter, so the card says which it is
  // rather than claiming to be the whole directory when it is not.
  const isNarrowed = Boolean(searchTerm) || (filter && filter !== "All Users");

  const totalUsersCount = roleCounts.total;
  const studentsCount = roleCounts.students;
  const mentorsCount = roleCounts.mentors;
  const adminsCount = roleCounts.admins;
  // Everything after "My Students" in the filter list is one of the mentor's
  // batches, so the list doubles as the count.
  const batchCount = filterOptions.filter((o) => o.value !== "All Users").length;
  const lockedCount =
    typeof counts?.locked === "number" ? counts.locked : users.filter((u) => u.isLocked).length;
  const noBatches = mentorView && filtersLoaded && batchCount === 0;

  return (
    <div
      className="p-4 sm:p-6 lg:p-8 min-h-screen flex flex-col font-sans"
      style={{ backgroundColor: "#16181F" }}
    >
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }
      `}</style>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto w-full space-y-6 flex-1 flex flex-col">

        {/* Top Header Row - Synchronized 3.5rem baseline matching Sidebar */}
        <div
          className="flex flex-col md:flex-row md:items-center justify-between pb-5 mb-2 gap-4"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", minHeight: "3.5rem" }}
        >
          {/* Left: Branding & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#133B42] border border-[#00C4B4]/20 flex items-center justify-center flex-shrink-0">
              <UsersIcon className="w-5 h-5 text-[#00C4B4]" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                {mentorView ? "My Students" : "User Directory"}
              </h1>
              <p className="text-xs text-[#7E8594] mt-0.5">
                {mentorView
                  ? "Students in your assigned batches · unblock logins & reset passwords"
                  : "Institutional accounts, role governance & proctoring profiles"}
              </p>
            </div>
          </div>

          {/* Right: Search, Filter, Reset Images, Sync & ⚪ White Button */}
          <div className="flex items-center flex-wrap gap-2.5 sm:gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 text-[#7E8594] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={mentorView ? "Search name, roll no, UID..." : "Search users..."}
                className="w-full bg-[#20242D] border border-white/[0.08] rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 focus:ring-1 focus:ring-[#00C4B4]/50 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7E8594] hover:text-white transition-colors"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Dropdown */}
            <div className="relative filter-dropdown">
              <button
                type="button"
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="flex items-center gap-2 bg-[#20242D] hover:bg-[#282D39] border border-white/[0.08] text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm"
              >
                <Filter className="w-3.5 h-3.5 text-[#00C4B4]" />
                <span className="max-w-[110px] truncate">
                  {filterOptions.find((o) => o.value === filter)?.label || filter}
                </span>
                <ChevronRight
                  className={`w-3.5 h-3.5 text-[#7E8594] transition-transform duration-200 ${
                    isFilterOpen ? "rotate-90" : ""
                  }`}
                />
              </button>

              {isFilterOpen && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-[#181A22] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-30 animate-in fade-in zoom-in-95 duration-150">
                  <div className="max-h-64 overflow-y-auto custom-scrollbar divide-y divide-white/[0.04]">
                    {filterOptions.map((option) => (
                      <div
                        key={option.value}
                        onClick={() => {
                          setFilter(option.value);
                          setIsFilterOpen(false);
                        }}
                        className={`px-3.5 py-2.5 hover:bg-white/[0.05] cursor-pointer text-xs font-medium transition-colors flex items-center justify-between gap-2 ${
                          filter === option.value
                            ? "text-[#00C4B4] bg-[#133B42]/30"
                            : "text-[#D1D5DB]"
                        }`}
                      >
                        <span className="truncate">{option.label}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {typeof option.count === "number" && (
                            <span className="text-[10px] text-[#7E8594]">{option.count}</span>
                          )}
                          {filter === option.value && <Check className="w-3.5 h-3.5 text-[#00C4B4]" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Reset All Face Images Button */}
            {!mentorView && (
            <button
              onClick={deleteAllProfileImages}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all cursor-pointer"
              title="Reset all user profile images"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset Images</span>
            </button>
            )}

            {/* Refresh Sync Button */}
            <button
              onClick={() => fetchUsers(currentPage, searchTerm, filter)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/30 hover:bg-[#1A4C55] transition-all cursor-pointer disabled:opacity-50"
              title="Refresh users"
            >
              <Zap className={`w-3.5 h-3.5 fill-[#00C4B4] ${loading ? "animate-spin" : ""}`} />
            </button>

            {/* ⚪ White Button: Add User */}
            {!mentorView && (
            <button
              onClick={() => {
                if (showAddForm) {
                  setShowAddForm(false);
                  setEditing(null);
                  setForm(EMPTY_FORM);
                } else {
                  setShowAddForm(true);
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-white hover:bg-slate-100 text-slate-950 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <UserPlus className="w-4 h-4 stroke-[2.5]" />
              <span>{showAddForm ? "Close Form" : "Add User"}</span>
            </button>
            )}
          </div>
        </div>

        {/* Mentor KPI Row: their students, their batches, and who is locked out */}
        {mentorView && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5">
            <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-white/10 transition-all shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                  Students
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-[#1E293B] text-[#38BDF8] border border-[#38BDF8]/20">
                  {isNarrowed ? "Filtered" : "My Batches"}
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {studentsCount}
              </div>
              <p className="text-[11px] text-[#7E8594] mt-1 flex items-center gap-1">
                <GraduationCap className="w-3 h-3 text-[#38BDF8]" />
                {isNarrowed ? "Students matching this view" : "Across your assigned batches"}
              </p>
            </div>

            <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-white/10 transition-all shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                  Batches
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-[#133B42] text-[#2DD4BF] border border-[#2DD4BF]/20">
                  Assigned
                </span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {batchCount}
              </div>
              <p className="text-[11px] text-[#7E8594] mt-1 flex items-center gap-1">
                <UsersIcon className="w-3 h-3 text-[#2DD4BF]" />
                Assigned to you by an admin
              </p>
            </div>

            <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-white/10 transition-all shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                  Locked Out
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  Login
                </span>
              </div>
              <div className={`text-xl sm:text-2xl font-bold tracking-tight ${lockedCount > 0 ? "text-rose-400" : "text-white"}`}>
                {lockedCount}
              </div>
              <p className="text-[11px] text-[#7E8594] mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3 text-rose-400" />
                Too many wrong passwords
              </p>
            </div>
          </div>
        )}

        {/* 4-Card KPI Overview Row */}
        {!mentorView && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {/* Total Registered Users */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-white/10 transition-all shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Total Users
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-[#133B42] text-[#2DD4BF] border border-[#2DD4BF]/20">
                {isNarrowed ? "Filtered" : "Directory"}
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {totalUsersCount}
            </div>
            <p className="text-[11px] text-[#7E8594] mt-1 flex items-center gap-1">
              <UsersIcon className="w-3 h-3 text-[#2DD4BF]" />
              {isNarrowed ? "Accounts matching this view" : "Total institutional accounts"}
            </p>
          </div>

          {/* Students */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-white/10 transition-all shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Students
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-[#1E293B] text-[#38BDF8] border border-[#38BDF8]/20">
                Learners
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {studentsCount}
            </div>
            <p className="text-[11px] text-[#7E8594] mt-1 flex items-center gap-1">
              <GraduationCap className="w-3 h-3 text-[#38BDF8]" />
              Enrolled student
            </p>
          </div>

          {/* Mentors */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-white/10 transition-all shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Mentors
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-[#19382C] text-[#34D399] border border-[#34D399]/20">
                Faculty
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {mentorsCount}
            </div>
            <p className="text-[11px] text-[#7E8594] mt-1 flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-[#34D399]" />
              Authorized examiners
            </p>
          </div>

          {/* Admins */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-white/10 transition-all shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Admins
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-[#37233B] text-[#F472B6] border border-[#F472B6]/20">
                Security
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {adminsCount}
            </div>
            <p className="text-[11px] text-[#7E8594] mt-1 flex items-center gap-1">
              <Shield className="w-3 h-3 text-[#F472B6]" />
              System administrators
            </p>
          </div>
        </div>
        )}

        {/* Add/Edit User Elevated Glassmorphism Panel */}
        {showAddForm && !mentorView && (
          <div className="bg-[#181A22] border border-[#00C4B4]/30 rounded-2xl p-6 shadow-xl transition-all duration-200">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.05]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#133B42] flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-[#00C4B4]" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    {editing ? "Update Staff Account" : "Add New Staff Member"}
                  </h3>
                  <p className="text-xs text-[#7E8594]">
                    Configure administrative or mentor access permissions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setEditing(null);
                  setForm(EMPTY_FORM);
                }}
                className="text-xs text-[#7E8594] hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-[#7E8594] mb-1.5 uppercase tracking-wider">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. John Doe"
                  className="w-full bg-[#16181F] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 focus:ring-1 focus:ring-[#00C4B4]/50 transition-all"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-[#7E8594] mb-1.5 uppercase tracking-wider">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="name@institution.edu"
                  className="w-full bg-[#16181F] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 focus:ring-1 focus:ring-[#00C4B4]/50 transition-all"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-[#7E8594] mb-1.5 uppercase tracking-wider">
                  Role Governance *
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full bg-[#16181F] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#00C4B4]/50 focus:ring-1 focus:ring-[#00C4B4]/50 transition-all cursor-pointer"
                >
                  <option value="Mentor" className="bg-[#181A22] text-white">Mentor</option>
                  <option value="Admin" className="bg-[#181A22] text-white">Admin</option>
                </select>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-[#7E8594] mb-1.5 uppercase tracking-wider">
                  {editing ? "New Password" : "Password *"}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={editing ? "Leave blank to keep" : "Min 6 characters"}
                  autoComplete="new-password"
                  className="w-full bg-[#16181F] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 focus:ring-1 focus:ring-[#00C4B4]/50 transition-all"
                />
              </div>
            </div>

            {/* Mentor Subjects Checklist */}
            {form.role === "Mentor" && (
              <div className="mt-4 pt-4 border-t border-white/[0.05]">
                <label className="block text-xs font-semibold text-[#7E8594] mb-2 uppercase tracking-wider">
                  Assigned Subjects (Select one or more)
                </label>
                <div className="max-h-40 overflow-y-auto custom-scrollbar rounded-xl p-3 bg-[#16181F] border border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {subjectOptions.length === 0 ? (
                    <p className="text-xs text-[#7E8594]">No subjects configured yet.</p>
                  ) : (
                    subjectOptions.map((subject) => {
                      const isChecked = form.subjects.includes(subject._id);
                      return (
                        <label
                          key={subject._id}
                          className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                            isChecked ? "bg-[#133B42]/50 text-white" : "text-[#8E95A5] hover:bg-white/[0.03]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                subjects: e.target.checked
                                  ? [...f.subjects, subject._id]
                                  : f.subjects.filter((id) => id !== subject._id)
                              }))
                            }
                            className="accent-[#00C4B4] rounded"
                          />
                          <span className="truncate">{subject.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Form Footer Action */}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setEditing(null);
                  setForm(EMPTY_FORM);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8E95A5] hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                Cancel
              </button>

              {/* 🟢 Green Button: Save / Create */}
              <button
                type="button"
                onClick={submit}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{editing ? "Save Changes" : "Create User"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Users Card Grid */}
        <div className="flex-1">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-6 h-[260px] animate-pulse flex flex-col justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/[0.05] rounded-xl" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-white/[0.05] rounded w-3/4" />
                      <div className="h-3 bg-white/[0.03] rounded w-1/2" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-8 bg-white/[0.04] rounded-xl" />
                    <div className="h-8 bg-white/[0.04] rounded-xl" />
                  </div>
                  <div className="h-8 bg-white/[0.05] rounded-xl" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-12 text-center my-8">
              <div className="w-14 h-14 rounded-2xl bg-[#133B42] border border-[#00C4B4]/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-[#00C4B4]" />
              </div>
              <h3 className="text-base font-bold text-white">
                {noBatches ? "No Batches Assigned" : mentorView ? "No Students Found" : "No Users Found"}
              </h3>
              <p className="text-xs text-[#7E8594] mt-1.5 max-w-sm mx-auto">
                {noBatches
                  ? "You have not been assigned any batches yet, so there are no students to show. Ask an admin to assign your batches."
                  : searchTerm
                  ? `No ${mentorView ? "students" : "user accounts"} match "${searchTerm}". Try resetting your search or filter.`
                  : mentorView
                  ? "No students found in the selected batch."
                  : "No registered accounts found under the current filter selection."}
              </p>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Clear Search
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {users.map((u) => {
                const initial = u.name ? u.name.charAt(0).toUpperCase() : "U";
                const isStudent = u.role === "Student";
                const isAdmin = u.role === "Admin";
                const isMentor = u.role === "Mentor";

                return (
                  <div
                    key={u._id}
                    className={`bg-[#20242D] border rounded-2xl p-5 sm:p-6 transition-all duration-200 flex flex-col justify-between shadow-sm group hover:-translate-y-0.5 ${
                      u.isLocked
                        ? "border-rose-500/40 hover:border-rose-500/60"
                        : "border-white/[0.06] hover:border-[#00C4B4]/30"
                    }`}
                  >
                    <div>
                      {/* Top Header: Avatar + Identity + Role Badge */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="relative flex-shrink-0">
                            <div
                              className={`w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold shadow-md border ${
                                isAdmin
                                  ? "bg-gradient-to-br from-[#37233B] to-[#201524] text-[#F472B6] border-[#F472B6]/30"
                                  : isMentor
                                  ? "bg-gradient-to-br from-[#133B42] to-[#0A2024] text-[#00C4B4] border-[#00C4B4]/30"
                                  : "bg-gradient-to-br from-[#1E293B] to-[#111A29] text-[#38BDF8] border-[#38BDF8]/30"
                              }`}
                            >
                              {initial}
                            </div>
                            {u.profileImageSaved && (
                              <span
                                className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#34D399] border-2 border-[#20242D] shadow-[0_0_6px_#34D399]"
                                title="Face ID Verified"
                              />
                            )}
                          </div>

                          <div className="min-w-0">
                            <h3
                              className="text-base font-bold text-white tracking-tight truncate group-hover:text-[#00C4B4] transition-colors"
                              title={u.name}
                            >
                              {u.name}
                            </h3>
                            <p className="text-xs text-[#7E8594] truncate" title={u.email}>
                              {u.email}
                            </p>
                          </div>
                        </div>

                        {/* Top-Right Role Pill */}
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0 border flex items-center gap-1 ${
                            isAdmin
                              ? "bg-[#37233B] text-[#F472B6] border-[#F472B6]/30"
                              : isMentor
                              ? "bg-[#133B42] text-[#00C4B4] border-[#00C4B4]/30"
                              : "bg-[#1E293B] text-[#38BDF8] border-[#38BDF8]/30"
                          }`}
                        >
                          {isAdmin ? (
                            <Shield className="w-3 h-3" />
                          ) : isMentor ? (
                            <UserCheck className="w-3 h-3" />
                          ) : (
                            <GraduationCap className="w-3 h-3" />
                          )}
                          <span>{u.role}</span>
                        </span>
                      </div>

                      {/* Detail Metrics Strip */}
                      <div className="grid grid-cols-2 gap-2.5 mb-4">
                        {/* Campus / Department Box */}
                        <div className="bg-[#181A22] border border-white/[0.04] rounded-xl p-2.5 flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#162235] flex items-center justify-center flex-shrink-0">
                            {isStudent ? (
                              <GraduationCap className="w-3.5 h-3.5 text-[#38BDF8]" />
                            ) : isMentor ? (
                              <UserCheck className="w-3.5 h-3.5 text-[#00C4B4]" />
                            ) : (
                              <Shield className="w-3.5 h-3.5 text-[#F472B6]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] text-[#7E8594] uppercase tracking-wider block">
                              {isStudent ? "Cohort" : "Department"}
                            </span>
                            <span className="text-xs font-semibold text-white truncate block">
                              {isStudent
                                ? u.studentCategory || "Main Campus"
                                : isMentor
                                ? "Academic Faculty"
                                : "Administration"}
                            </span>
                          </div>
                        </div>

                        {/* Face Verification Box */}
                        <div className="bg-[#181A22] border border-white/[0.04] rounded-xl p-2.5 flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              u.profileImageSaved ? "bg-[#19382C]" : "bg-white/[0.04]"
                            }`}
                          >
                            <ImageIcon
                              className={`w-3.5 h-3.5 ${
                                u.profileImageSaved ? "text-[#34D399]" : "text-[#7E8594]"
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] text-[#7E8594] uppercase tracking-wider block">
                              Face ID
                            </span>
                            <span
                              className={`text-xs font-semibold truncate block ${
                                u.profileImageSaved ? "text-[#34D399]" : "text-[#7E8594]"
                              }`}
                            >
                              {u.profileImageSaved ? "Enrolled" : "Not Set"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Student Login Access / Lockout State */}
                      {isStudent && (
                        <div
                          className={`mb-4 rounded-xl border p-2.5 flex items-center gap-2.5 ${
                            u.isLocked
                              ? "bg-rose-500/[0.07] border-rose-500/25"
                              : "bg-[#181A22] border-white/[0.04]"
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              u.isLocked ? "bg-rose-500/15" : "bg-[#19382C]"
                            }`}
                          >
                            {u.isLocked ? (
                              <Lock className="w-3.5 h-3.5 text-rose-400" />
                            ) : (
                              <LockOpen className="w-3.5 h-3.5 text-[#34D399]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] text-[#7E8594] uppercase tracking-wider block">
                              Login Access
                            </span>
                            <span
                              className={`text-xs font-semibold truncate block ${
                                u.isLocked ? "text-rose-400" : "text-[#34D399]"
                              }`}
                            >
                              {u.isLocked
                                ? `Locked out · ${formatLockRemaining(u.lockRemainingMs)}`
                                : "Active"}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Tests handed in before their time was up, still inside
                          their window. One row per test, each with its own
                          Re-enable. Gone the moment the window closes. */}
                      {isStudent &&
                        (u.reEnableable || []).some((t) => new Date(t.reEnableUntil).getTime() > now) && (
                          <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-2.5">
                            <span className="text-[10px] text-amber-300/90 uppercase tracking-wider font-semibold flex items-center gap-1.5 mb-2">
                              <RotateCcw className="w-3 h-3" />
                              Submitted before time ended
                            </span>
                            <div className="space-y-2">
                              {u.reEnableable
                                .filter((t) => new Date(t.reEnableUntil).getTime() > now)
                                .map((t) => (
                                  <div
                                    key={t.assignmentId}
                                    className="flex items-center gap-2 rounded-lg bg-[#181A22] border border-white/[0.04] p-2"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <span
                                        className="text-xs font-semibold text-white truncate block"
                                        title={t.testTitle}
                                      >
                                        {t.testTitle}
                                      </span>
                                      <span
                                        className={`text-[10px] truncate block ${
                                          t.reason === "violation" ? "text-rose-400" : "text-amber-300"
                                        }`}
                                      >
                                        {RE_ENABLE_REASONS[t.reason] || "Submitted early"}
                                      </span>
                                      <span className="text-[10px] text-[#7E8594] flex items-center gap-1 whitespace-nowrap">
                                        <Clock className="w-2.5 h-2.5 flex-shrink-0" />
                                        {formatTimeLeft(t.endsAt)}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => reEnableTest(u, t)}
                                      disabled={reEnablingId === t.assignmentId}
                                      className="flex-shrink-0 py-1.5 px-2.5 rounded-lg text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                      title={`Let ${u.name} continue "${t.testTitle}" with their saved answers`}
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                      <span>{reEnablingId === t.assignmentId ? "Re-enabling..." : "Re-enable"}</span>
                                    </button>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                      {/* Mentor Assigned Subjects Pills */}
                      {isMentor && u.subjects && u.subjects.length > 0 && (
                        <div className="mb-4">
                          <span className="text-[10px] text-[#7E8594] uppercase tracking-wider block mb-1.5 font-semibold">
                            Assigned Subjects ({u.subjects.length})
                          </span>
                          <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto custom-scrollbar">
                            {u.subjects.map((sub, idx) => {
                              const subName = typeof sub === "object" ? sub.name : sub;
                              return (
                                <span
                                  key={sub._id || idx}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#133B42] text-[#2DD4BF] border border-[#2DD4BF]/20 truncate max-w-[140px]"
                                  title={subName}
                                >
                                  {subName}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Actions Bottom Section */}
                    <div className="pt-3 border-t border-white/[0.05] space-y-2">
                      {isStudent ? (
                        <div className="grid grid-cols-2 gap-2">
                          {/* Face reset and Delete are admin-only. Mentors get
                              Unblock and Reset Password, below. */}
                          {!mentorView && (u.profileImageSaved ? (
                            <button
                              onClick={() => deleteProfileImage(u._id, u.name)}
                              disabled={deletingImage === u._id}
                              className="py-2 px-2 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                              title="Reset facial profile for this student"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                              <span>{deletingImage === u._id ? "Resetting..." : "Reset Face"}</span>
                            </button>
                          ) : (
                            <div className="py-2 px-2 rounded-xl text-xs font-medium text-[#555C6D] bg-white/[0.02] border border-white/[0.04] text-center flex items-center justify-center gap-1">
                              <ImageIcon className="w-3.5 h-3.5 text-[#555C6D]" />
                              <span>No Face ID</span>
                            </div>
                          ))}

                          {/* Delete Student Button */}
                          {!mentorView && (
                          <button
                            onClick={() => deleteUser(u._id, u.name)}
                            className="py-2 px-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                          )}

                          {/* Unblock, once too many wrong passwords have locked
                              them out. Nothing to clear otherwise, so the slot
                              reads as a state rather than a dead button. */}
                          {u.isLocked ? (
                            <button
                              onClick={() => unblockStudent(u)}
                              disabled={lockAction?.startsWith(`${u._id}:`)}
                              className="py-2 px-2 rounded-xl text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Clear the failed login attempts locking this student out"
                            >
                              <LockOpen className="w-3.5 h-3.5" />
                              <span>
                                {lockAction === `${u._id}:unblock` ? "Unblocking..." : "Unblock"}
                              </span>
                            </button>
                          ) : (
                            <div className="py-2 px-2 rounded-xl text-xs font-medium text-[#555C6D] bg-white/[0.02] border border-white/[0.04] text-center flex items-center justify-center gap-1">
                              <LockOpen className="w-3.5 h-3.5 text-[#555C6D]" />
                              <span>Not Locked</span>
                            </div>
                          )}

                          {/* Reset to the default password. Also clears a lockout,
                              so it stands on its own for a forgotten password. */}
                          <button
                            onClick={() => resetStudentPassword(u)}
                            disabled={lockAction?.startsWith(`${u._id}:`)}
                            className="py-2 px-2 rounded-xl text-xs font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            title={`Set this student's password to ${DEFAULT_STUDENT_PASSWORD} and sign them out everywhere`}
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>
                              {lockAction === `${u._id}:reset` ? "Resetting..." : "Reset Password"}
                            </span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            {/* Edit Button */}
                            <button
                              onClick={() => {
                                setEditing(u._id);
                                setForm({
                                  name: u.name || "",
                                  email: u.email || "",
                                  password: "",
                                  role: u.role || "Mentor",
                                  subjects: (u.subjects || []).map((sub) => sub._id || sub)
                                });
                                setShowAddForm(true);
                              }}
                              className="py-2 px-2 rounded-xl text-xs font-semibold bg-[#2A2E39] hover:bg-[#343946] text-white border border-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-[#8E95A5]" />
                              <span>Edit</span>
                            </button>

                            {/* Delete User Button */}
                            <button
                              onClick={() => deleteUser(u._id, u.name)}
                              className="py-2 px-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>

                          {/* Reset Image if exists */}
                          {u.profileImageSaved && (
                            <button
                              onClick={() => deleteProfileImage(u._id, u.name)}
                              disabled={deletingImage === u._id}
                              className="w-full py-1.5 px-2 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                              <span>{deletingImage === u._id ? "Resetting..." : "Reset Profile Face ID"}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Minimal Dark Pagination Controls */}
        {!loading && pagination.totalPages > 1 && (
          <div className="mt-8 pt-4 border-t border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs text-[#7E8594]">
              Showing page <span className="font-semibold text-white">{currentPage}</span> of{" "}
              <span className="font-semibold text-white">{pagination.totalPages}</span> (
              {pagination.totalUsers} total {mentorView ? "students" : "users"})
            </span>

            <div className="flex items-center gap-1.5">
              {/* Previous */}
              <button
                onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
                disabled={!pagination.hasPrevPage || currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 bg-[#20242D] border border-white/[0.06] hover:bg-white/[0.05] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
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
                      className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        currentPage === pageNum
                          ? "bg-white text-slate-950 font-bold"
                          : "text-[#8E95A5] hover:text-white hover:bg-white/[0.05]"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              {/* Next */}
              <button
                onClick={() =>
                  currentPage < pagination.totalPages && setCurrentPage(currentPage + 1)
                }
                disabled={!pagination.hasNextPage || currentPage >= pagination.totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 bg-[#20242D] border border-white/[0.06] hover:bg-white/[0.05] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal - Standardized Elevated Glassmorphism */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={closeConfirmModal}
          />
          <div className="relative bg-[#181A22] border border-white/10 rounded-2xl p-6 shadow-2xl max-w-md w-full animate-in fade-in zoom-in-95 duration-150 z-10">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl ${
                    confirmModal.isDanger ? "bg-rose-500/10 text-rose-400" : "bg-[#133B42] text-[#00C4B4]"
                  }`}
                >
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  {confirmModal.title}
                </h3>
              </div>

              <p className="text-xs text-[#8E95A5] leading-relaxed">
                {confirmModal.message}
              </p>

              {confirmModal.confirmKeyword && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-[#7E8594] uppercase tracking-wider block">
                    Type <span className="text-white font-mono">{confirmModal.confirmKeyword}</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={typedConfirmation}
                    onChange={(e) => setTypedConfirmation(e.target.value)}
                    placeholder={confirmModal.confirmKeyword}
                    className="w-full px-3.5 py-2.5 bg-[#16181F] border border-white/10 rounded-xl text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-rose-500/50"
                  />
                </div>
              )}

              <div className="flex gap-2.5 mt-2">
                <button
                  onClick={closeConfirmModal}
                  disabled={confirmModal.isLoading}
                  className="flex-1 px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] text-xs font-semibold text-[#8E95A5] hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={executeConfirmAction}
                  disabled={
                    confirmModal.isLoading ||
                    (confirmModal.confirmKeyword && typedConfirmation !== confirmModal.confirmKeyword)
                  }
                  className={`flex-1 px-4 py-2 rounded-xl text-xs font-semibold shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer ${
                    confirmModal.isDanger
                      ? "bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold"
                      : "bg-[#00C4B4] hover:bg-[#2DD4BF] text-slate-950 font-bold"
                  }`}
                >
                  {confirmModal.isLoading ? (
                    <>
                      <Zap className="w-3.5 h-3.5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : confirmModal.isDanger ? (
                    "Confirm Action"
                  ) : (
                    "Confirm"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Result Toast Popup */}
      {resultPopup.show && (
        <div className="fixed bottom-6 right-6 z-[100] animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="bg-[#181A22] border border-white/10 rounded-2xl p-4 shadow-2xl flex items-center gap-3 max-w-sm">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                resultPopup.type === "success"
                  ? "bg-[#19382C] text-[#34D399]"
                  : "bg-rose-500/10 text-rose-400"
              }`}
            >
              {resultPopup.type === "success" ? (
                <Check className="w-4 h-4 stroke-[3]" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
            </div>
            <p className="text-xs font-medium text-white flex-1">{resultPopup.message}</p>
            <button
              onClick={() => setResultPopup({ show: false, message: "", type: "success" })}
              className="text-[#7E8594] hover:text-white transition-colors"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
