import React from "react";
import { Activity, CheckCircle2, PlayCircle, BookCheck, ClipboardList } from "lucide-react";

const RecentActivity = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="py-10 px-4 text-center text-[#7E8594]">
        <Activity className="w-7 h-7 mx-auto mb-2 opacity-30 text-[#00C4B4]" />
        <p className="text-sm font-medium">No recent activity</p>
        <p className="text-xs text-slate-500 mt-1">Your recent test events will appear here.</p>
      </div>
    );
  }

  const formatDate = (date) => {
    const now = new Date();
    const activityDate = new Date(date);
    const diffInHours = Math.floor((now - activityDate) / (1000 * 60 * 60));

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor((now - activityDate) / (1000 * 60));
      return diffInMinutes <= 1 ? "Just now" : `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}d ago`;
    }
  };

  const getActivityBadge = (type) => {
    switch (type) {
      case "started":
        return {
          icon: PlayCircle,
          color: "text-[#38BDF8]",
          bg: "bg-[#133242]",
          border: "border-[#38BDF8]/20",
          label: "Started",
        };
      case "completed":
        return {
          icon: CheckCircle2,
          color: "text-[#34D399]",
          bg: "bg-[#143325]",
          border: "border-[#34D399]/20",
          label: "Done",
        };
      case "assigned":
        return {
          icon: ClipboardList,
          color: "text-[#FB923C]",
          bg: "bg-[#332316]",
          border: "border-[#FB923C]/20",
          label: "Assigned",
        };
      case "reviewed":
        return {
          icon: BookCheck,
          color: "text-[#C084FC]",
          bg: "bg-[#281838]",
          border: "border-[#C084FC]/20",
          label: "Reviewed",
        };
      default:
        return {
          icon: Activity,
          color: "text-[#00C4B4]",
          bg: "bg-[#133B42]",
          border: "border-[#00C4B4]/20",
          label: "Activity",
        };
    }
  };

  const getActivityMessage = (activity) => {
    switch (activity.type) {
      case "started":
        return `Started ${activity.testTitle || "Test"}`;
      case "completed":
        return `Completed ${activity.testTitle || "Test"}`;
      case "assigned":
        return `New assignment: ${activity.testTitle || "Test"}`;
      case "reviewed":
        return `Reviewed: ${activity.testTitle || "Test"}`;
      default:
        return activity.message || "Test Activity";
    }
  };

  return (
    <div className="py-2">
      <div className="space-y-1">
        {data.slice(0, 5).map((activity, index) => {
          const badge = getActivityBadge(activity.type);
          const Icon = badge.icon;

          return (
            <div
              key={index}
              className="group flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all duration-200 hover:bg-white/[0.03] border border-transparent hover:border-white/[0.04]"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${badge.bg} ${badge.color} border ${badge.border}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                    {getActivityMessage(activity)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-[#7E8594] font-medium">
                  {formatDate(activity.timestamp || activity.createdAt || activity.updatedAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RecentActivity;

