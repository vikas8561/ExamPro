import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import apiRequest from "../services/api";

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
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTimeRemaining = (startTime) => {
    const start = new Date(startTime);
    const diff = start - currentTime;

    if (diff <= 0) return null; // Test has started

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const handleStartTest = async (assignmentId) => {
    try {
      const response = await apiRequest(`/assignments/${assignmentId}/start`, {
        method: 'POST'
      });

      if (response.message === "Test started successfully" || response.alreadyStarted) {
        navigate(`/take-test/${assignmentId}`);
      } else {
        alert(response.message);
      }
    } catch (error) {
      console.error("Error starting test:", error);
      alert("Failed to start test. Please try again.");
    }
  };

  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 text-center text-slate-400">
        No upcoming tests found.
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden">
      <div className="max-h-96 overflow-y-auto scroll-smooth">
        <table className="w-full">
          <thead className="bg-slate-700 sticky top-0 z-10">
            <tr>
              <th className="p-4 text-left text-slate-300">Test Name</th>
              <th className="p-4 text-left text-slate-300">Date</th>
              <th className="p-4 text-left text-slate-300">Time Remaining</th>
              <th className="p-4 text-left text-slate-300">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => {
              const timeRemaining = getTimeRemaining(item.startTime);
              const hasStarted = !timeRemaining;

              return (
                <tr key={index} className="border-b border-slate-700 hover:bg-slate-700/50">
                  <td className="p-4">
                    <div className="font-medium">{item.testId?.title || item.name || "Test"}</div>
                    {item.testId?.type && (
                      <div className="text-sm text-slate-400 capitalize">{item.testId.type}</div>
                    )}
                  </td>
                  <td className="p-4 text-slate-300">
                    {formatDate(item.startTime)}
                  </td>
                  <td className="p-4">
                    {hasStarted ? (
                      <span className="text-green-400 font-medium">Test Available</span>
                    ) : (
                      <span className="text-yellow-400 font-medium">{timeRemaining}</span>
                    )}
                  </td>
                  <td className="p-4">
                    {hasStarted ? (
                      <button
                        onClick={() => handleStartTest(item._id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                      >
                        Start Test
                      </button>
                    ) : (
                      <span className="text-slate-500">Waiting...</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UpcomingTests;
