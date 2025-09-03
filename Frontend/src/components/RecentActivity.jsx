import React from "react";

const RecentActivity = ({ data }) => {
  console.log("RecentActivity received data:", data);

  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 text-center text-slate-400">
        No recent activity found.
      </div>
    );
  }

  const formatDate = (date) => {
    const now = new Date();
    const activityDate = new Date(date);
    const diffInHours = Math.floor((now - activityDate) / (1000 * 60 * 60));

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor((now - activityDate) / (1000 * 60));
      return diffInMinutes <= 1 ? "Just now" : `${diffInMinutes} minutes ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours} hours ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays} days ago`;
    }
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case "started":
        return "▶️";
      case "completed":
        return "✅";
      case "assigned":
        return "📋";
      case "reviewed":
        return "📝";
      default:
        return "📌";
    }
  };

  const getActivityMessage = (activity) => {
    switch (activity.type) {
      case "started":
        return `Started test: ${activity.testTitle || "Test"}`;
      case "completed":
        return `Completed test: ${activity.testTitle || "Test"}`;
      case "assigned":
        return `Assigned test: ${activity.testTitle || "Test"}`;
      case "reviewed":
        return `Test reviewed: ${activity.testTitle || "Test"}`;
      default:
        return activity.message || "Activity";
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden">
      <div className="max-h-80 overflow-y-auto scroll-smooth">
        <div className="p-4">
          <h4 className="text-lg font-semibold mb-4 text-slate-200">Recent Activity</h4>
          <div className="space-y-3">
            {data.map((activity, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700/70 transition-colors">
                <div className="text-xl flex-shrink-0">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {getActivityMessage(activity)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {formatDate(activity.timestamp || activity.createdAt || activity.updatedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecentActivity;
