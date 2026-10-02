import React, { useState, useEffect, useMemo } from "react";
import apiRequest from "../services/api";
import {
  UserCheck,
  Search,
  X,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Zap,
  Edit3,
  Layers,
  FileText,
  Check,
  RotateCcw,
  GraduationCap,
  Users,
  UserPlus,
  Eye,
  EyeOff,
  Mail,
  Lock,
} from "lucide-react";
import { API_BASE_URL } from "../config/api";

export default function AdminMentorManagement() {
  const [mentors, setMentors] = useState([]);
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [availableBatches, setAvailableBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'configured' | 'needs-batches' | 'needs-subjects'

  // Modal State for Managing Subjects
  const [selectedMentorForSubject, setSelectedMentorForSubject] = useState(null);
  const [modalSubjectIds, setModalSubjectIds] = useState([]);
  const [modalSubjectSearchTerm, setModalSubjectSearchTerm] = useState("");
  const [isSavingSubjects, setIsSavingSubjects] = useState(false);

  // Modal State for Managing Batches
  const [selectedMentorForBatch, setSelectedMentorForBatch] = useState(null);
  const [modalBatchKeys, setModalBatchKeys] = useState([]);
  const [modalBatchSearchTerm, setModalBatchSearchTerm] = useState("");
  const [isSavingBatches, setIsSavingBatches] = useState(false);

  // Create Mentor Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", subjects: [], batches: [] });
  const [isCreating, setIsCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [createSubjectSearch, setCreateSubjectSearch] = useState("");
  const [createBatchSearch, setCreateBatchSearch] = useState("");

  // Delete Mentor State
  const [deletingMentorId, setDeletingMentorId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // { _id, name }

  // Toast State
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 4000);
  };

  const fetchInitialData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [mentorsRes, subjectsRes, batchesRes] = await Promise.all([
        apiRequest("/admin/mentors"),
        apiRequest("/subjects"),
        apiRequest("/admin/mentors/batches")
      ]);

      setMentors(mentorsRes.mentors || []);
      setAvailableSubjects(subjectsRes.subjects || []);
      setAvailableBatches(batchesRes.batches || []);
    } catch (err) {
      console.error("Error fetching mentor management data:", err);
      showToast("Failed to load mentors, subjects or batches data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Open modal to manage a mentor's subjects
  const openSubjectModal = (mentor) => {
    setSelectedMentorForSubject(mentor);
    const currentSubjectIds = (mentor.subjects || [])
      .map((s) => (typeof s === "object" ? s._id : s))
      .filter(Boolean);
    setModalSubjectIds(currentSubjectIds);
    setModalSubjectSearchTerm("");
  };

  const closeSubjectModal = () => {
    setSelectedMentorForSubject(null);
    setModalSubjectIds([]);
    setModalSubjectSearchTerm("");
    setIsSavingSubjects(false);
  };

  // Open modal to manage a mentor's batches
  const openBatchModal = (mentor) => {
    setSelectedMentorForBatch(mentor);
    setModalBatchKeys(mentor.batches || []);
    setModalBatchSearchTerm("");
  };

  const closeBatchModal = () => {
    setSelectedMentorForBatch(null);
    setModalBatchKeys([]);
    setModalBatchSearchTerm("");
    setIsSavingBatches(false);
  };

  // Toggle subject in modal
  const toggleSubjectInModal = (subjectId) => {
    setModalSubjectIds((prev) => {
      const exists = prev.includes(subjectId);
      if (exists) {
        return prev.filter((id) => id !== subjectId);
      } else {
        return [...prev, subjectId];
      }
    });
  };

  // Toggle batch in modal
  const toggleBatchInModal = (batchKey) => {
    setModalBatchKeys((prev) => {
      const exists = prev.includes(batchKey);
      if (exists) {
        return prev.filter((key) => key !== batchKey);
      } else {
        return [...prev, batchKey];
      }
    });
  };

  // Select all or clear all in Subject modal
  const handleSelectAllSubjects = () => {
    const allIds = availableSubjects.map((s) => s._id);
    setModalSubjectIds(allIds);
  };

  const handleClearAllSubjects = () => {
    setModalSubjectIds([]);
  };

  // Select all or clear all in Batch modal
  const handleSelectAllBatches = () => {
    const allKeys = availableBatches.map((b) => b.key);
    setModalBatchKeys(allKeys);
  };

  const handleClearAllBatches = () => {
    setModalBatchKeys([]);
  };

  // Save subject changes from modal
  const handleSaveSubjects = async () => {
    if (!selectedMentorForSubject) return;

    try {
      setIsSavingSubjects(true);
      const res = await apiRequest(`/admin/mentors/${selectedMentorForSubject._id}/subjects`, {
        method: "PUT",
        body: JSON.stringify({ subjectIds: modalSubjectIds })
      });

      setMentors((prev) =>
        prev.map((m) =>
          m._id === selectedMentorForSubject._id
            ? { ...m, subjects: res.mentor?.subjects || [] }
            : m
        )
      );

      showToast(`Subjects updated for ${selectedMentorForSubject.name}`, "success");
      closeSubjectModal();
    } catch (err) {
      console.error("Error updating mentor subjects:", err);
      showToast(err.message || "Failed to update mentor subjects", "error");
    } finally {
      setIsSavingSubjects(false);
    }
  };

  // Save batch changes from modal
  const handleSaveBatches = async () => {
    if (!selectedMentorForBatch) return;

    try {
      setIsSavingBatches(true);
      const res = await apiRequest(`/admin/mentors/${selectedMentorForBatch._id}/batches`, {
        method: "PUT",
        body: JSON.stringify({ batches: modalBatchKeys })
      });

      setMentors((prev) =>
        prev.map((m) =>
          m._id === selectedMentorForBatch._id
            ? { ...m, batches: res.mentor?.batches || [] }
            : m
        )
      );

      showToast(`Batches updated for ${selectedMentorForBatch.name}`, "success");
      closeBatchModal();
    } catch (err) {
      console.error("Error updating mentor batches:", err);
      showToast(err.message || "Failed to update mentor batches", "error");
    } finally {
      setIsSavingBatches(false);
    }
  };

  // Quick remove subject from table row directly
  const handleQuickRemoveSubject = async (e, mentorId, subjectId, subjectName, mentorName) => {
    e.stopPropagation();

    try {
      const res = await apiRequest(`/admin/mentors/${mentorId}/subjects/${subjectId}`, {
        method: "DELETE"
      });

      setMentors((prev) =>
        prev.map((m) =>
          m._id === mentorId ? { ...m, subjects: res.mentor?.subjects || [] } : m
        )
      );

      showToast(`Removed subject "${subjectName}" from ${mentorName}`, "success");
    } catch (err) {
      console.error("Error removing subject:", err);
      showToast(err.message || "Failed to remove subject", "error");
    }
  };

  // Quick remove batch from table row directly
  const handleQuickRemoveBatch = async (e, mentorId, batchKey, batchLabel, mentorName) => {
    e.stopPropagation();

    try {
      const res = await apiRequest(`/admin/mentors/${mentorId}/batches/${batchKey}`, {
        method: "DELETE"
      });

      setMentors((prev) =>
        prev.map((m) =>
          m._id === mentorId ? { ...m, batches: res.mentor?.batches || [] } : m
        )
      );

      showToast(`Removed batch "${batchLabel}" from ${mentorName}`, "success");
    } catch (err) {
      console.error("Error removing batch:", err);
      showToast(err.message || "Failed to remove batch", "error");
    }
  };

  // ---------- Create Mentor ----------
  const openCreateModal = () => {
    setCreateForm({ name: "", email: "", password: "", subjects: [], batches: [] });
    setShowPassword(false);
    setCreateSubjectSearch("");
    setCreateBatchSearch("");
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateForm({ name: "", email: "", password: "", subjects: [], batches: [] });
    setCreateSubjectSearch("");
    setCreateBatchSearch("");
    setIsCreating(false);
  };

  const toggleCreateSubject = (subjectId) => {
    setCreateForm((prev) => {
      const exists = prev.subjects.includes(subjectId);
      return {
        ...prev,
        subjects: exists
          ? prev.subjects.filter((id) => id !== subjectId)
          : [...prev.subjects, subjectId],
      };
    });
  };

  const toggleCreateBatch = (batchKey) => {
    setCreateForm((prev) => {
      const exists = prev.batches.includes(batchKey);
      return {
        ...prev,
        batches: exists
          ? prev.batches.filter((k) => k !== batchKey)
          : [...prev.batches, batchKey],
      };
    });
  };

  const filteredCreateSubjects = useMemo(() => {
    if (!createSubjectSearch.trim()) return availableSubjects;
    const q = createSubjectSearch.toLowerCase();
    return availableSubjects.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q)
    );
  }, [availableSubjects, createSubjectSearch]);

  const filteredCreateBatches = useMemo(() => {
    if (!createBatchSearch.trim()) return availableBatches;
    const q = createBatchSearch.toLowerCase();
    return availableBatches.filter(
      (b) =>
        (b.label || "").toLowerCase().includes(q) ||
        (b.description || "").toLowerCase().includes(q) ||
        (b.key || "").toLowerCase().includes(q)
    );
  }, [availableBatches, createBatchSearch]);

  const handleCreateMentor = async () => {
    const { name, email, password, subjects, batches } = createForm;

    if (!name.trim() || !email.trim() || !password.trim()) {
      showToast("Name, email and password are required", "error");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast("Invalid email format", "error");
      return;
    }

    if (password.length < 6) {
      showToast("Password must be at least 6 characters", "error");
      return;
    }

    try {
      setIsCreating(true);

      // Step 1: Create the mentor account
      const res = await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          role: "Mentor",
          subjects,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to create mentor");
      }

      // Step 2: Assign batches if any were selected
      if (batches.length > 0 && data._id) {
        try {
          await apiRequest(`/admin/mentors/${data._id}/batches`, {
            method: "PUT",
            body: JSON.stringify({ batches }),
          });
        } catch (batchErr) {
          console.error("Mentor created but batch assignment failed:", batchErr);
          showToast(
            `Mentor created, but batch assignment failed: ${batchErr.message}. You can assign batches manually.`,
            "error"
          );
          closeCreateModal();
          fetchInitialData();
          return;
        }
      }

      showToast(`Mentor "${data.name || name.trim()}" created successfully`, "success");
      closeCreateModal();
      fetchInitialData();
    } catch (err) {
      console.error("Error creating mentor:", err);
      showToast(err.message || "Failed to create mentor", "error");
    } finally {
      setIsCreating(false);
    }
  };

  // ---------- Delete Mentor ----------
  const handleDeleteMentor = async () => {
    if (!confirmDelete) return;

    try {
      setDeletingMentorId(confirmDelete._id);
      const res = await fetch(`${API_BASE_URL}/users/${confirmDelete._id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to delete mentor");
      }

      setMentors((prev) => prev.filter((m) => m._id !== confirmDelete._id));
      showToast(`Mentor "${confirmDelete.name}" deleted successfully`, "success");
    } catch (err) {
      console.error("Error deleting mentor:", err);
      showToast(err.message || "Failed to delete mentor", "error");
    } finally {
      setDeletingMentorId(null);
      setConfirmDelete(null);
    }
  };

  // Batch details map for quick badge rendering
  const batchMap = useMemo(() => {
    const map = new Map();
    availableBatches.forEach((b) => map.set(b.key, b));
    return map;
  }, [availableBatches]);

  // KPI Calculations
  const kpiStats = useMemo(() => {
    const totalMentors = mentors.length;
    const fullyConfigured = mentors.filter(
      (m) => (m.subjects || []).length > 0 && (m.batches || []).length > 0
    ).length;
    const missingBatches = mentors.filter((m) => (m.batches || []).length === 0).length;
    const missingSubjects = mentors.filter((m) => (m.subjects || []).length === 0).length;
    const totalSubjectAssignments = mentors.reduce((acc, m) => acc + (m.subjects || []).length, 0);
    const totalBatchAssignments = mentors.reduce((acc, m) => acc + (m.batches || []).length, 0);
    const totalTestsAuthored = mentors.reduce((acc, m) => acc + (m.testCount || 0), 0);

    return {
      totalMentors,
      fullyConfigured,
      missingBatches,
      missingSubjects,
      totalSubjectAssignments,
      totalBatchAssignments,
      totalTestsAuthored
    };
  }, [mentors]);

  // Main table filter
  const filteredMentors = useMemo(() => {
    return mentors.filter((mentor) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        searchTerm.trim() === "" ||
        (mentor.name || "").toLowerCase().includes(q) ||
        (mentor.email || "").toLowerCase().includes(q) ||
        (mentor.subjects || []).some((s) => (s.name || "").toLowerCase().includes(q)) ||
        (mentor.batches || []).some((bKey) => {
          const bInfo = batchMap.get(bKey);
          return (
            bKey.toLowerCase().includes(q) ||
            (bInfo?.label || "").toLowerCase().includes(q) ||
            (bInfo?.description || "").toLowerCase().includes(q)
          );
        });

      const subjectsCount = (mentor.subjects || []).length;
      const batchesCount = (mentor.batches || []).length;

      let matchesFilter = true;
      if (statusFilter === "configured") {
        matchesFilter = subjectsCount > 0 && batchesCount > 0;
      } else if (statusFilter === "needs-batches") {
        matchesFilter = batchesCount === 0;
      } else if (statusFilter === "needs-subjects") {
        matchesFilter = subjectsCount === 0;
      }

      return matchesSearch && matchesFilter;
    });
  }, [mentors, searchTerm, statusFilter, batchMap]);

  // Filtered subjects in modal
  const filteredModalSubjects = useMemo(() => {
    if (!modalSubjectSearchTerm.trim()) return availableSubjects;
    const q = modalSubjectSearchTerm.toLowerCase();
    return availableSubjects.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q)
    );
  }, [availableSubjects, modalSubjectSearchTerm]);

  // Filtered batches in modal
  const filteredModalBatches = useMemo(() => {
    if (!modalBatchSearchTerm.trim()) return availableBatches;
    const q = modalBatchSearchTerm.toLowerCase();
    return availableBatches.filter(
      (b) =>
        (b.label || "").toLowerCase().includes(q) ||
        (b.description || "").toLowerCase().includes(q) ||
        (b.key || "").toLowerCase().includes(q)
    );
  }, [availableBatches, modalBatchSearchTerm]);

  return (
    <div className="min-h-screen bg-[#16181F] text-slate-100 font-sans p-4 sm:p-6 lg:p-8 relative">
      {/* Toast Notification */}
      {toast.show && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-xl text-xs font-semibold animate-fade-in ${
            toast.type === "error"
              ? "bg-red-500/15 border-red-500/30 text-red-400"
              : "bg-[#133B42] border-[#00C4B4]/30 text-[#00C4B4]"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header Bar */}
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-6 gap-4"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", minHeight: "3.5rem" }}
        >
          {/* Title & Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#133B42] border border-[#00C4B4]/25 flex items-center justify-center flex-shrink-0 shadow-sm">
              <UserCheck className="w-5 h-5 text-[#00C4B4]" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Mentor Management
              </h1>
              <p className="text-xs text-[#7E8594] mt-0.5">
                Assign subjects & batches, regulate test authoring permissions, and restrict student access
              </p>
            </div>
          </div>

          {/* Search & Refresh */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#7E8594] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by mentor, subject, batch..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#20242D] border border-white/[0.06] rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 transition-colors"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7E8594] hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={fetchInitialData}
              disabled={loading}
              title="Refresh Mentors"
              className="p-2 rounded-xl bg-[#20242D] border border-white/[0.06] hover:bg-white/[0.04] text-[#7E8594] hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw className={`w-4 h-4 ${loading ? "animate-spin text-[#00C4B4]" : ""}`} />
            </button>

            {/* Create Mentor Button */}
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-white hover:bg-slate-100 text-slate-950 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <UserPlus className="w-4 h-4 stroke-[2.5]" />
              <span>Create Mentor</span>
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: "all", label: `All Mentors (${mentors.length})` },
            { id: "configured", label: `Fully Configured (${kpiStats.fullyConfigured})` },
            { id: "needs-batches", label: `Missing Batches (${kpiStats.missingBatches})` },
            { id: "needs-subjects", label: `Missing Subjects (${kpiStats.missingSubjects})` },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setStatusFilter(pill.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === pill.id
                  ? "bg-[#00C4B4] text-slate-950 shadow-sm"
                  : "bg-[#20242D] text-[#8E95A5] hover:text-white hover:bg-white/[0.04] border border-white/[0.06]"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Mentors */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Total Mentors
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/20">
                Staff
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {kpiStats.totalMentors}
            </div>
            <p className="text-xs text-[#7E8594]">Registered mentor accounts</p>
          </div>

          {/* Fully Configured Mentors */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Active & Configured
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#133B42] text-[#2DD4BF] border border-[#2DD4BF]/20">
                Authorized
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {kpiStats.fullyConfigured}
            </div>
            <p className="text-xs text-[#7E8594]">Have assigned subjects & batches</p>
          </div>

          {/* Needs Configuration */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Incomplete Access
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                kpiStats.missingBatches > 0 || kpiStats.missingSubjects > 0
                  ? "bg-[#3D271D] text-[#FB923C] border border-[#FB923C]/20"
                  : "bg-white/[0.04] text-[#7E8594] border border-white/[0.06]"
              }`}>
                {kpiStats.missingBatches > 0 || kpiStats.missingSubjects > 0 ? "Action Required" : "All Set"}
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {kpiStats.missingBatches + kpiStats.missingSubjects}
            </div>
            <p className="text-xs text-[#7E8594]">
              {kpiStats.missingBatches} missing batches · {kpiStats.missingSubjects} missing subjects
            </p>
          </div>

          {/* Tests Created */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 hover:border-white/10 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold tracking-wide text-[#7E8594] uppercase">
                Tests Authored
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#2E2042] text-[#A78BFA] border border-[#A78BFA]/20">
                Total Tests
              </span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight mb-1">
              {kpiStats.totalTestsAuthored}
            </div>
            <p className="text-xs text-[#7E8594]">Authored by mentor faculty</p>
          </div>
        </div>

        {/* Mentors Table Container */}
        <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl overflow-hidden shadow-sm flex flex-col">
          {/* Table Header Bar */}
          <div className="p-4 sm:p-5 border-b border-white/[0.05] flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <Layers className="w-4.5 h-4.5 text-[#00C4B4]" />
              <h2 className="text-base font-bold text-white tracking-tight">
                Mentor Registry ({filteredMentors.length})
              </h2>
            </div>
            <span className="text-xs text-[#7E8594]">
              Access Rule: Assigned Subjects + Assigned Batches + Their Own Tests
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.05] bg-[#181A22]/50 text-[#7E8594] text-[11px] font-semibold uppercase tracking-wider">
                  <th className="py-3.5 px-5">Mentor Details</th>
                  <th className="py-3.5 px-5">Assigned Subjects</th>
                  <th className="py-3.5 px-5">Assigned Batches</th>
                  <th className="py-3.5 px-5 text-center">Tests</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="py-16 text-center text-slate-400">
                      <div className="w-7 h-7 rounded-full border-2 border-[#00C4B4] border-t-transparent animate-spin mx-auto mb-3" />
                      <p className="text-xs text-[#7E8594]">Loading mentor roster...</p>
                    </td>
                  </tr>
                ) : filteredMentors.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-16 text-center text-slate-400">
                      <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-3">
                        <UserCheck className="w-6 h-6 text-[#7E8594]" />
                      </div>
                      <p className="text-sm font-semibold text-white">No mentors found</p>
                      <p className="text-xs text-[#7E8594] mt-1 max-w-sm mx-auto">
                        {searchTerm
                          ? `No mentors match "${searchTerm}".`
                          : "No mentor accounts registered or matching this filter."}
                      </p>
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm("")}
                          className="mt-3 text-xs text-[#00C4B4] hover:underline"
                        >
                          Clear search filter
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredMentors.map((mentor) => {
                    const mentorName = mentor.name || "Mentor";
                    const mentorEmail = mentor.email || "No email";
                    const mentorSubjects = mentor.subjects || [];
                    const mentorBatches = mentor.batches || [];
                    const hasSubjects = mentorSubjects.length > 0;
                    const hasBatches = mentorBatches.length > 0;

                    return (
                      <tr
                        key={mentor._id}
                        className="hover:bg-white/[0.02] transition-colors group"
                      >
                        {/* Mentor Details */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center font-bold text-xs text-[#00C4B4] flex-shrink-0">
                              {mentorName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white tracking-tight truncate">
                                {mentorName}
                              </p>
                              <p className="text-xs text-[#7E8594] truncate">{mentorEmail}</p>
                            </div>
                          </div>
                        </td>

                        {/* Assigned Subjects */}
                        <td className="py-4 px-5">
                          {hasSubjects ? (
                            <div className="flex flex-wrap items-center gap-1.5 max-w-xs sm:max-w-sm">
                              {mentorSubjects.map((subject) => {
                                const subId = typeof subject === "object" ? subject._id : subject;
                                const subName = typeof subject === "object" ? subject.name : "Subject";
                                const enablesCoding = /dsa|data structure|interview/.test((subName || "").toLowerCase());

                                return (
                                  <span
                                    key={subId}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                                      enablesCoding
                                        ? "bg-purple-500/15 text-purple-300 border-purple-500/25"
                                        : "bg-[#133B42] text-[#2DD4BF] border-[#2DD4BF]/20"
                                    }`}
                                  >
                                    <BookOpen className="w-3 h-3 flex-shrink-0" />
                                    <span>{subName}</span>
                                    <button
                                      onClick={(e) =>
                                        handleQuickRemoveSubject(
                                          e,
                                          mentor._id,
                                          subId,
                                          subName,
                                          mentorName
                                        )
                                      }
                                      title={`Remove ${subName}`}
                                      className="hover:text-red-400 p-0.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#3D271D] text-[#FB923C] border border-[#FB923C]/20">
                              <AlertCircle className="w-3 h-3" />
                              <span>No Subjects</span>
                            </span>
                          )}
                        </td>

                        {/* Assigned Batches */}
                        <td className="py-4 px-5">
                          {hasBatches ? (
                            <div className="flex flex-wrap items-center gap-1.5 max-w-xs sm:max-w-sm">
                              {mentorBatches.map((batchKey) => {
                                const bInfo = batchMap.get(batchKey);
                                const label = bInfo?.label || batchKey.toUpperCase();

                                return (
                                  <span
                                    key={batchKey}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-[#1E293B] text-[#38BDF8] border-[#38BDF8]/20 transition-all"
                                  >
                                    <GraduationCap className="w-3 h-3 flex-shrink-0 text-[#38BDF8]" />
                                    <span>{label}</span>
                                    <button
                                      onClick={(e) =>
                                        handleQuickRemoveBatch(
                                          e,
                                          mentor._id,
                                          batchKey,
                                          label,
                                          mentorName
                                        )
                                      }
                                      title={`Remove ${label}`}
                                      className="hover:text-red-400 p-0.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#3D271D] text-[#FB923C] border border-[#FB923C]/20">
                              <AlertCircle className="w-3 h-3" />
                              <span>No Batches</span>
                            </span>
                          )}
                        </td>

                        {/* Tests Created */}
                        <td className="py-4 px-5 text-center">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/[0.04] text-[#A6ADBB] border border-white/[0.06]">
                            <FileText className="w-3.5 h-3.5 text-[#7E8594]" />
                            <span>{mentor.testCount || 0}</span>
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openSubjectModal(mentor)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/10 text-white font-medium text-xs transition-all border border-white/10 cursor-pointer"
                              title="Assign or remove subjects"
                            >
                              <BookOpen className="w-3.5 h-3.5 text-[#00C4B4]" />
                              <span>Subjects</span>
                            </button>

                            <button
                              onClick={() => openBatchModal(mentor)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#00C4B4]/10 hover:bg-[#00C4B4]/20 text-[#00C4B4] font-medium text-xs transition-all border border-[#00C4B4]/20 cursor-pointer"
                              title="Assign or remove student batches"
                            >
                              <GraduationCap className="w-3.5 h-3.5 text-[#00C4B4]" />
                              <span>Batches</span>
                            </button>

                            <button
                              onClick={() => setConfirmDelete({ _id: mentor._id, name: mentorName })}
                              disabled={deletingMentorId === mentor._id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-medium text-xs transition-all border border-rose-500/20 cursor-pointer disabled:opacity-50"
                              title={`Delete ${mentorName}`}
                            >
                              {deletingMentorId === mentor._id ? (
                                <div className="w-3.5 h-3.5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* -------------------- SUBJECT ASSIGNMENT MODAL -------------------- */}
      {selectedMentorForSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1C1F28] border border-white/10 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#133B42] border border-[#00C4B4]/25 flex items-center justify-center font-bold text-sm text-[#00C4B4]">
                  {selectedMentorForSubject.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Manage Subjects for {selectedMentorForSubject.name}
                  </h3>
                  <p className="text-xs text-[#7E8594]">{selectedMentorForSubject.email}</p>
                </div>
              </div>
              <button
                onClick={closeSubjectModal}
                className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/10 text-[#7E8594] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Toolbar */}
            <div className="p-4 border-b border-white/[0.05] bg-[#181A22]/50 flex items-center justify-between flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-[#7E8594] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter subjects..."
                  value={modalSubjectSearchTerm}
                  onChange={(e) => setModalSubjectSearchTerm(e.target.value)}
                  className="w-full bg-[#20242D] border border-white/[0.06] rounded-lg pl-8 pr-8 py-1.5 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50"
                />
                {modalSubjectSearchTerm && (
                  <button
                    onClick={() => setModalSubjectSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7E8594] hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAllSubjects}
                  className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/10 text-white transition-colors cursor-pointer text-[11px]"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearAllSubjects}
                  className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/10 text-[#7E8594] hover:text-white transition-colors cursor-pointer text-[11px]"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto max-h-[50vh] space-y-2">
              <div className="flex items-center justify-between text-xs text-[#7E8594] mb-3">
                <span>Available Subject Catalog</span>
                <span className="font-semibold text-[#00C4B4]">
                  {modalSubjectIds.length} of {availableSubjects.length} selected
                </span>
              </div>

              {filteredModalSubjects.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#7E8594]">
                  No subjects match "{modalSubjectSearchTerm}"
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {filteredModalSubjects.map((subject) => {
                    const isChecked = modalSubjectIds.includes(subject._id);
                    const enablesCoding = /dsa|data structure|interview/.test((subject.name || "").toLowerCase());

                    return (
                      <div
                        key={subject._id}
                        onClick={() => toggleSubjectInModal(subject._id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isChecked
                            ? "bg-[#133B42]/50 border-[#00C4B4]/40 shadow-sm"
                            : "bg-[#20242D] border-white/[0.06] hover:border-white/15"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors flex-shrink-0 ${
                              isChecked
                                ? "bg-[#00C4B4] border-[#00C4B4] text-slate-950"
                                : "border-white/20 bg-transparent"
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white tracking-tight truncate">
                              {subject.name}
                            </p>
                            {enablesCoding && (
                              <span className="text-[10px] text-purple-400 font-mono">
                                Enables Coding Tests
                              </span>
                            )}
                          </div>
                        </div>

                        {isChecked && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#00C4B4]/15 text-[#00C4B4] border border-[#00C4B4]/30">
                            Active
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/[0.07] bg-[#181A22]/80 flex items-center justify-between">
              <span className="text-xs text-[#7E8594]">
                Changes take effect immediately upon saving
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={closeSubjectModal}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#8E95A5] hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSubjects}
                  disabled={isSavingSubjects}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#00C4B4] text-slate-950 hover:bg-[#00D8C6] active:scale-95 transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSavingSubjects ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- BATCH ASSIGNMENT MODAL -------------------- */}
      {selectedMentorForBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1C1F28] border border-white/10 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1E293B] border border-[#38BDF8]/25 flex items-center justify-center font-bold text-sm text-[#38BDF8]">
                  <GraduationCap className="w-5 h-5 text-[#38BDF8]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Manage Batches for {selectedMentorForBatch.name}
                  </h3>
                  <p className="text-xs text-[#7E8594]">{selectedMentorForBatch.email}</p>
                </div>
              </div>
              <button
                onClick={closeBatchModal}
                className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/10 text-[#7E8594] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Toolbar */}
            <div className="p-4 border-b border-white/[0.05] bg-[#181A22]/50 flex items-center justify-between flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-[#7E8594] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter batches or campus..."
                  value={modalBatchSearchTerm}
                  onChange={(e) => setModalBatchSearchTerm(e.target.value)}
                  className="w-full bg-[#20242D] border border-white/[0.06] rounded-lg pl-8 pr-8 py-1.5 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#38BDF8]/50"
                />
                {modalBatchSearchTerm && (
                  <button
                    onClick={() => setModalBatchSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7E8594] hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAllBatches}
                  className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/10 text-white transition-colors cursor-pointer text-[11px]"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearAllBatches}
                  className="px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/10 text-[#7E8594] hover:text-white transition-colors cursor-pointer text-[11px]"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto max-h-[50vh] space-y-2.5">
              <div className="flex items-center justify-between text-xs text-[#7E8594] mb-3">
                <span>Available Student Batches</span>
                <span className="font-semibold text-[#38BDF8]">
                  {modalBatchKeys.length} of {availableBatches.length} assigned
                </span>
              </div>

              {filteredModalBatches.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#7E8594]">
                  No batches match "{modalBatchSearchTerm}"
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredModalBatches.map((batch) => {
                    const isChecked = modalBatchKeys.includes(batch.key);

                    return (
                      <div
                        key={batch.key}
                        onClick={() => toggleBatchInModal(batch.key)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isChecked
                            ? "bg-[#1E293B]/60 border-[#38BDF8]/40 shadow-sm"
                            : "bg-[#20242D] border-white/[0.06] hover:border-white/15"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors flex-shrink-0 ${
                              isChecked
                                ? "bg-[#38BDF8] border-[#38BDF8] text-slate-950"
                                : "border-white/20 bg-transparent"
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white tracking-tight truncate">
                              {batch.label}
                            </p>
                            <p className="text-[11px] text-[#7E8594] truncate">
                              {batch.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.05] text-[#A6ADBB] border border-white/[0.08]">
                            <Users className="w-2.5 h-2.5 mr-1 text-[#7E8594]" />
                            {batch.count || 0} students
                          </span>

                          {isChecked && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#38BDF8]/15 text-[#38BDF8] border border-[#38BDF8]/30">
                              Assigned
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/[0.07] bg-[#181A22]/80 flex items-center justify-between">
              <span className="text-xs text-[#7E8594]">
                Mentor will only see students from selected batches
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={closeBatchModal}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#8E95A5] hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveBatches}
                  disabled={isSavingBatches}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#38BDF8] text-slate-950 hover:bg-[#60A5FA] active:scale-95 transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSavingBatches ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Batches</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- CREATE MENTOR MODAL -------------------- */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1C1F28] border border-white/10 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#133B42] border border-[#00C4B4]/25 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-[#00C4B4]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Create New Mentor
                  </h3>
                  <p className="text-xs text-[#7E8594]">Add a mentor account with subject assignments</p>
                </div>
              </div>
              <button
                onClick={closeCreateModal}
                className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/10 text-[#7E8594] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto max-h-[65vh] space-y-5">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-[#8E95A5] mb-1.5 uppercase tracking-wider">Full Name</label>
                <div className="relative">
                  <UserCheck className="w-4 h-4 text-[#7E8594] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Enter mentor's full name"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full bg-[#20242D] border border-white/[0.06] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 transition-colors"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-[#8E95A5] mb-1.5 uppercase tracking-wider">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#7E8594] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="mentor@example.com"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full bg-[#20242D] border border-white/[0.06] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 transition-colors"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-[#8E95A5] mb-1.5 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#7E8594] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 6 characters"
                    value={createForm.password}
                    onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                    className="w-full bg-[#20242D] border border-white/[0.06] rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7E8594] hover:text-white transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Subject Assignment */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#8E95A5] uppercase tracking-wider">Assign Subjects</label>
                  <span className="text-[11px] font-semibold text-[#00C4B4]">
                    {createForm.subjects.length} selected
                  </span>
                </div>

                {/* Subject search */}
                <div className="relative mb-3">
                  <Search className="w-3.5 h-3.5 text-[#7E8594] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filter subjects..."
                    value={createSubjectSearch}
                    onChange={(e) => setCreateSubjectSearch(e.target.value)}
                    className="w-full bg-[#20242D] border border-white/[0.06] rounded-lg pl-8 pr-8 py-1.5 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/50"
                  />
                  {createSubjectSearch && (
                    <button
                      onClick={() => setCreateSubjectSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7E8594] hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Subject grid */}
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {filteredCreateSubjects.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[#7E8594]">No subjects found</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {filteredCreateSubjects.map((subject) => {
                        const isChecked = createForm.subjects.includes(subject._id);
                        return (
                          <div
                            key={subject._id}
                            onClick={() => toggleCreateSubject(subject._id)}
                            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-2.5 ${
                              isChecked
                                ? "bg-[#133B42]/50 border-[#00C4B4]/40 shadow-sm"
                                : "bg-[#20242D] border-white/[0.06] hover:border-white/15"
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors flex-shrink-0 ${
                                isChecked
                                  ? "bg-[#00C4B4] border-[#00C4B4] text-slate-950"
                                  : "border-white/20 bg-transparent"
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <span className="text-xs font-semibold text-white tracking-tight truncate">
                              {subject.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Batch Assignment */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#8E95A5] uppercase tracking-wider">Assign Batches</label>
                  <span className="text-[11px] font-semibold text-[#38BDF8]">
                    {createForm.batches.length} selected
                  </span>
                </div>

                {/* Batch search */}
                <div className="relative mb-3">
                  <Search className="w-3.5 h-3.5 text-[#7E8594] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filter batches..."
                    value={createBatchSearch}
                    onChange={(e) => setCreateBatchSearch(e.target.value)}
                    className="w-full bg-[#20242D] border border-white/[0.06] rounded-lg pl-8 pr-8 py-1.5 text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#38BDF8]/50"
                  />
                  {createBatchSearch && (
                    <button
                      onClick={() => setCreateBatchSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7E8594] hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Batch grid */}
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {filteredCreateBatches.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[#7E8594]">No batches found</div>
                  ) : (
                    <div className="space-y-2">
                      {filteredCreateBatches.map((batch) => {
                        const isChecked = createForm.batches.includes(batch.key);
                        return (
                          <div
                            key={batch.key}
                            onClick={() => toggleCreateBatch(batch.key)}
                            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                              isChecked
                                ? "bg-[#1E293B]/60 border-[#38BDF8]/40 shadow-sm"
                                : "bg-[#20242D] border-white/[0.06] hover:border-white/15"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors flex-shrink-0 ${
                                  isChecked
                                    ? "bg-[#38BDF8] border-[#38BDF8] text-slate-950"
                                    : "border-white/20 bg-transparent"
                                }`}
                              >
                                {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-white tracking-tight truncate">
                                  {batch.label}
                                </p>
                                <p className="text-[11px] text-[#7E8594] truncate">
                                  {batch.description}
                                </p>
                              </div>
                            </div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.05] text-[#A6ADBB] border border-white/[0.08] flex-shrink-0">
                              <Users className="w-2.5 h-2.5 mr-1 text-[#7E8594]" />
                              {batch.count || 0}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/[0.07] bg-[#181A22]/80 flex items-center justify-between">
              <span className="text-xs text-[#7E8594]">
                Mentor can sign in immediately after creation
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#8E95A5] hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateMentor}
                  disabled={isCreating || !createForm.name.trim() || !createForm.email.trim() || !createForm.password.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#00C4B4] text-slate-950 hover:bg-[#00D8C6] active:scale-95 transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Create Mentor</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- DELETE CONFIRMATION MODAL -------------------- */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#1C1F28] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-5 border-b border-white/[0.07] flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Delete Mentor
                </h3>
                <p className="text-xs text-[#7E8594]">This action cannot be undone</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-5">
              <p className="text-sm text-[#A6ADBB]">
                Are you sure you want to delete <span className="font-semibold text-white">{confirmDelete.name}</span>?
              </p>
              <p className="text-xs text-[#7E8594] mt-2">
                Their account, sessions, and profile will be permanently removed. Tests they created will remain but will no longer be linked to them.
              </p>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/[0.07] bg-[#181A22]/80 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#8E95A5] hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMentor}
                disabled={deletingMentorId === confirmDelete._id}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-rose-500 text-white hover:bg-rose-600 active:scale-95 transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {deletingMentorId === confirmDelete._id ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Mentor</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
