import React from "react";

export default function StatusPill({ label }) {
  const base = "px-3 py-1 rounded-md text-sm font-medium";
  const map = {
    Active: "bg-slate-700 text-white",
    Completed: "bg-slate-700 text-white",
    Scheduled: "bg-slate-700 text-white",
    Student: "bg-slate-700 text-white",
    Mentor: "bg-slate-700 text-white",
    Admin: "bg-slate-700 text-white",
    Assigned: "bg-slate-700 text-white",
    Submitted: "bg-slate-700 text-white",
    Pending: "bg-slate-700 text-white",
    Approved: "bg-green-700 text-white",
    Rejected: "bg-rose-700 text-white",
  };
  return <span className={`${base} ${map[label] || "bg-slate-700 text-white"}`}>{label}</span>;
}
