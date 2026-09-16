import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import apiRequest from "../services/api";
import { Play, CheckSquare, Clock } from "lucide-react";

const UpcomingTests = ({ data }) => {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTimeRemaining = (startTime) => {
    const start = new Date(startTime);
    const diff = start - currentTime;

    if (diff <= 0) return null; // Test has started

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const handleStartTest = async (assignmentId, testType) => {
    try {
      const response = await apiRequest(`/assignments/${assignmentId}/start`, {
        method: "POST",
      });

      if (response.message === "Test started successfully" || response.alreadyStarted) {
        const type = testType || response?.test?.type;
        navigate(
          type === "coding"
            ? `/student/take-coding/${assignmentId}`
            : `/student/take-test/${assignmentId}`
        );
      } else {
        alert(response.message);
      }
    } catch (error) {
      console.error("Error starting test:", error);
      alert("Failed to start test. Please try again.");
    }
  };

  // Color mapping matching the screenshot's pills
  const getBadgeStyle = (type, index) => {
    const t = (type || "").toLowerCase();
    if (t.includes("coding")) {
      return {
        bg: "bg-[#133B42]",
        text: "text-[#2DD4BF]",
        border: "border-[#2DD4BF]/20",
        label: "Coding",
      };
    } else if (t.includes("dsa")) {
      return {
        bg: "bg-[#2D1F3D]",
        text: "text-[#C084FC]",
        border: "border-[#C084FC]/20",
        label: "DSA Practice",
      };
    } else if (t.includes("practice")) {
      return {
        bg: "bg-[#3D271D]",
        text: "text-[#FB923C]",
        border: "border-[#FB923C]/20",
        label: "Practice",
      };
    }

    // Palette alternates if unspecified
    const palettes = [
      { bg: "bg-[#133B42]", text: "text-[#2DD4BF]", border: "border-[#2DD4BF]/20", label: type || "Assessment" },
      { bg: "bg-[#3D271D]", text: "text-[#FB923C]", border: "border-[#FB923C]/20", label: type || "General" },
      { bg: "bg-[#19382C]", text: "text-[#34D399]", border: "border-[#34D399]/20", label: type || "Test" },
      { bg: "bg-[#3D1D24]", text: "text-[#F87171]", border: "border-[#F87171]/20", label: type || "Exam" },
    ];
    return palettes[index % palettes.length];
  };

  if (!data || data.length === 0) {
    return (
      <div className="py-12 px-6 text-center text-[#7E8594]">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-30 text-[#00C4B4]" />
        <p className="text-sm font-medium">No upcoming tests right now</p>
        <p className="text-xs text-slate-500 mt-1">Check back later or explore practice tests.</p>
      </div>
    );
  }

  // Split into "Today" vs "Upcoming" if dates match today
  const today = new Date().toDateString();
  const todayTests = data.filter(
    (item) => new Date(item.startTime).toDateString() === today
  );
  const otherTests = data.filter(
    (item) => new Date(item.startTime).toDateString() !== today
  );

  const renderSection = (title, items, totalCount) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="mb-6 last:mb-0">
        {/* Section Header */}
        <div className="flex items-center justify-between py-2.5 px-4 mb-1 text-xs font-semibold text-[#7E8594]">
          <span className="tracking-wide">{title}</span>
          <span className="text-[#646C7E]">{totalCount}</span>
        </div>

        {/* Rows */}
        <div className="space-y-1">
          {items.map((item, index) => {
            const timeRemaining = getTimeRemaining(item.startTime);
            const hasStarted = !timeRemaining;
            const badge = getBadgeStyle(item.testId?.type, index);

            return (
              <div
                key={item._id || index}
                className="group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 hover:bg-white/[0.03] border border-transparent hover:border-white/[0.04]"
              >
                {/* Left: Checkbox + Title + Subtitle */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-4">
                  {/* Custom Checkbox */}
                  <div className="w-4.5 h-4.5 rounded-md border border-slate-600/60 group-hover:border-[#00C4B4]/70 flex items-center justify-center transition-colors flex-shrink-0">
                    <div className="w-2 h-2 rounded-sm bg-[#00C4B4] opacity-0 group-hover:opacity-30 transition-opacity" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate tracking-tight group-hover:text-[#00C4B4] transition-colors">
                      {item.testId?.title || item.name || "Assessment Test"}
                    </div>
                    <div className="text-xs text-[#7E8594] truncate mt-0.5">
                      {formatDate(item.startTime)} • {item.testId?.duration ? `${item.testId.duration} mins` : "Standard Exam"}
                    </div>
                  </div>
                </div>

                {/* Center / Right: Tag Badge */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span
                    className={`inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium border ${badge.bg} ${badge.text} ${badge.border}`}
                  >
                    {badge.label}
                  </span>

                  {/* Right Action: Countdown or Start Test Button */}
                  <div className="w-28 text-right flex items-center justify-end">
                    {hasStarted ? (
                      <button
                        onClick={() => handleStartTest(item._id, item.testId?.type)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#00C4B4] text-slate-950 hover:bg-[#20e3d2] hover:scale-105 active:scale-95 transition-all shadow-sm"
                      >
                        <Play className="w-3 h-3 fill-slate-950" />
                        <span>Start</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 text-xs font-mono text-[#7E8594] group-hover:text-amber-300 transition-colors">
                        <Play className="w-2.5 h-2.5 fill-current opacity-70" />
                        <span>{timeRemaining}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="py-2">
      {todayTests.length > 0
        ? (
            <>
              {renderSection("Today", todayTests, `${todayTests.length} tests`)}
              {renderSection("Upcoming", otherTests, `${otherTests.length} tests`)}
            </>
          )
        : renderSection("Assigned Tests", data, `${data.length} tests`)}
    </div>
  );
};

export default UpcomingTests;

