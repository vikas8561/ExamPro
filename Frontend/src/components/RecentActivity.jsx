import React from "react";

const scrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 10px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }
`;

const RecentActivity = ({ data }) => {
  // Debug log removed

  if (!data || data.length === 0) {
    return (
      <div 
        className="rounded-2xl p-6 text-center border"
        style={{ 
          backgroundColor: '#0B1220',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          color: '#9CA3AF'
        }}
      >
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
    <>
      <style>{scrollbarStyles}</style>
      <div 
        className="rounded-2xl overflow-hidden border"
        style={{ 
          backgroundColor: '#0B1220',
          borderColor: 'rgba(255, 255, 255, 0.2)'
        }}
      >
      <div className="max-h-80 overflow-y-auto scroll-smooth custom-scrollbar">
        <div className="p-4">
          <h4 className="text-lg font-semibold mb-4" style={{ color: '#E5E7EB' }}>Recent Activity</h4>
          <div className="space-y-3">
            {data.map((activity, index) => (
              <div 
                key={index} 
                className="recent-activity-item flex items-start space-x-3 p-3 rounded-lg transition-colors border"
                style={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderColor: 'rgba(255, 255, 255, 0.1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                <div className="recent-activity-icon text-xl flex-shrink-0">
                  {getActivityIcon(activity.type)}
                </div>
                <div className="recent-activity-content flex-1 min-w-0">
                  <p className="text-sm leading-relaxed" style={{ color: '#E5E7EB' }}>
                    {getActivityMessage(activity)}
                  </p>
                  <p className="recent-activity-time text-xs mt-1" style={{ color: '#9CA3AF' }}>
                    {formatDate(activity.timestamp || activity.createdAt || activity.updatedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </>
  );
};

export default RecentActivity;
