import React from "react";

export default function StatusPill({ label }) {
  const base = "px-3 py-1 text-sm font-medium transition-all duration-300 hover:scale-105 hover:shadow-md cursor-pointer";
  const map = {
    Active: "bg-green-500 text-white hover:bg-green-400",
    Completed: "bg-blue-500 text-white hover:bg-blue-400",
    Scheduled: "bg-yellow-500 text-white hover:bg-yellow-400",
    Student: "bg-purple-500 text-white hover:bg-purple-400",
    Mentor: "bg-indigo-500 text-white hover:bg-indigo-400",
    Admin: "bg-red-500 text-white hover:bg-red-400",
    Assigned: "bg-teal-500 text-white hover:bg-teal-400",
    Submitted: "bg-cyan-500 text-white hover:bg-cyan-400",
    Pending: "bg-orange-500 text-white hover:bg-orange-400",
    Approved: "bg-emerald-500 text-white hover:bg-emerald-400",
    Rejected: "bg-rose-500 text-white hover:bg-rose-400",
  };
  return <span className={`${base} ${map[label] || "bg-slate-500 text-white hover:bg-slate-400"}`}>{label}</span>;
}
