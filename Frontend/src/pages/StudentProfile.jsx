import React, { useState, useEffect } from "react";
import {
  Mail,
  User as UserIcon,
  Building2,
  ShieldCheck,
  GraduationCap,
  Lock,
  RotateCcw,
  AlertCircle,
  BadgeCheck
} from "lucide-react";
import apiRequest from "../services/api";

export default function StudentProfile() {
  // Initialize user from localStorage immediately
  const getInitialUser = () => {
    try {
      const localUser = localStorage.getItem("user");
      if (localUser) {
        return JSON.parse(localUser);
      }
    } catch (e) {
      console.error("Error parsing local user:", e);
    }
    return null;
  };

  const [user, setUser] = useState(getInitialUser());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Photo verification is not offered to students here: no capture, no
  // verified/pending status. A photo already on the account still shows, so
  // nothing a student saved earlier disappears. The upload endpoint is
  // untouched, so this can be brought back by restoring the UI alone.

  // Fetch user profile
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        const userData = await apiRequest("/auth/profile");
        setUser(userData);
        localStorage.setItem("user", JSON.stringify(userData));
      } catch (error) {
        console.warn("Failed to fetch profile from API, using localStorage data:", error.message);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };


  if (loading && !user) {
    return (
      <div className="min-h-screen bg-[#16181F] text-slate-100 p-6 flex flex-col items-center justify-center">
        <div className="w-10 h-10 rounded-xl bg-[#00C4B4]/10 border border-[#00C4B4]/20 flex items-center justify-center text-[#00C4B4] mb-3 animate-spin shadow-[0_0_20px_rgba(0,196,180,0.2)]">
          <RotateCcw className="w-5 h-5" />
        </div>
        <p className="text-sm text-[#7E8594] font-medium">Loading profile credentials...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#16181F] text-slate-100 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-10 text-center shadow-sm">
            <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white">Unable to Load Profile</h3>
            <p className="text-xs text-[#7E8594] mt-1 mb-4">
              We couldn't retrieve your student profile session. Please refresh or re-login.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#00C4B4] text-[#0B1220] hover:bg-[#00b3a4] transition-all shadow-sm"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  const userInitials = (user.name || "ST")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#16181F] text-slate-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* 1. Synchronized Header Baseline */}
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 mb-6 border-b border-white/[0.05]"
          style={{ minHeight: "3.5rem" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#00C4B4]/10 border border-[#00C4B4]/20 flex items-center justify-center text-[#00C4B4] shadow-[0_0_15px_rgba(0,196,180,0.15)] flex-shrink-0">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight leading-tight">
                Student Profile
              </h1>
              <p className="text-xs text-[#7E8594] mt-0.5">
                Personal credentials, academic identity & verification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/20 shadow-sm">
              <BadgeCheck className="w-3.5 h-3.5" />
              <span>Enrolled Student</span>
            </span>

            <button
              onClick={() => fetchProfile(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-[#20242D] border border-white/[0.06] text-slate-300 hover:text-white hover:bg-[#282C38] transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#00C4B4]" : ""}`} />
              <span>Sync</span>
            </button>
          </div>
        </div>

        {/* 2. Hero Profile Banner */}
        <div className="relative overflow-hidden bg-[#181A22] border border-white/[0.06] rounded-3xl p-6 sm:p-8 shadow-sm">
          {/* Subtle Ambient Glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-[#00C4B4]/10 via-transparent to-transparent blur-3xl pointer-events-none" />

          {/* Centred rather than top-aligned: the avatar is taller than the two
              lines beside it, so aligning tops left its extra height hanging as
              dead space under the email. */}
          <div className="relative z-10 flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            {/* Avatar. Sized to the name and email it sits next to. */}
            <div className="relative flex-shrink-0">
              {user.profileImage ? (
                <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-[#00C4B4]/40 shadow-[0_0_25px_rgba(0,196,180,0.15)] bg-[#20242D]">
                  <img
                    src={user.profileImage}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-[#133B42] to-[#20242D] border-2 border-white/[0.08] flex items-center justify-center text-2xl font-black text-[#00C4B4] shadow-inner">
                  {userInitials}
                </div>
              )}
            </div>

            {/* Profile Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">
                    {user.name}
                  </h2>
                  <p className="text-xs text-[#7E8594] mt-0.5 font-medium">
                    {user.email || "No email on record"}
                  </p>
                </div>

                <div className="flex items-center gap-2 justify-center sm:justify-end">
                  <span className="px-3 py-1 rounded-xl text-xs font-semibold bg-[#20242D] border border-white/[0.06] text-slate-300 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-[#00C4B4]" />
                    <span>CodingGita</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Credentials & Academic Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Full Name Card */}
          <div className="bg-[#181A22] border border-white/[0.06] hover:border-[#00C4B4]/20 rounded-2xl p-5 space-y-1.5 transition-all shadow-sm">
            <div className="flex items-center gap-2 text-[#7E8594]">
              <UserIcon className="w-4 h-4 text-[#00C4B4]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">Full Name</span>
            </div>
            <p className="text-base font-bold text-white pl-6">{user.name}</p>
          </div>

          {/* Roll No / University UID Card */}
          <div className="bg-[#181A22] border border-white/[0.06] hover:border-[#00C4B4]/20 rounded-2xl p-5 space-y-1.5 transition-all shadow-sm">
            <div className="flex items-center gap-2 text-[#7E8594]">
              <GraduationCap className="w-4 h-4 text-[#00C4B4]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                University UID / Roll Number
              </span>
            </div>
            <p className="text-base font-bold text-white font-mono pl-6">
              {user.rollno || user.universityUID || "Not Assigned"}
            </p>
          </div>

          {/* Email Address Card */}
          <div className="bg-[#181A22] border border-white/[0.06] hover:border-[#00C4B4]/20 rounded-2xl p-5 space-y-1.5 transition-all shadow-sm">
            <div className="flex items-center gap-2 text-[#7E8594]">
              <Mail className="w-4 h-4 text-[#00C4B4]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">Official Email</span>
            </div>
            <p className="text-base font-bold text-white pl-6 truncate">
              {user.email || "Not on record"}
            </p>
          </div>

          {/* Institute / University Card */}
          <div className="bg-[#181A22] border border-white/[0.06] hover:border-[#00C4B4]/20 rounded-2xl p-5 space-y-1.5 transition-all shadow-sm">
            <div className="flex items-center gap-2 text-[#7E8594]">
              <Building2 className="w-4 h-4 text-[#00C4B4]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">Enrolled Institute</span>
            </div>
            <p className="text-base font-bold text-white pl-6">CodingGita</p>
          </div>

          {/* Portal Role & Access Card */}
          <div className="bg-[#181A22] border border-white/[0.06] hover:border-[#00C4B4]/20 rounded-2xl p-5 space-y-1.5 transition-all shadow-sm">
            <div className="flex items-center gap-2 text-[#7E8594]">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">Account Role</span>
            </div>
            <p className="text-base font-bold text-white pl-6">
              {user.role || "Student"} • Verified Access
            </p>
          </div>

          {/* Security & Verification Card */}
          <div className="bg-[#181A22] border border-white/[0.06] hover:border-[#00C4B4]/20 rounded-2xl p-5 space-y-1.5 transition-all shadow-sm">
            <div className="flex items-center gap-2 text-[#7E8594]">
              <Lock className="w-4 h-4 text-purple-400" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">Security & Integrity</span>
            </div>
            <p className="text-base font-bold text-white pl-6">
              Proctoring Enabled • Examination Authenticated
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
