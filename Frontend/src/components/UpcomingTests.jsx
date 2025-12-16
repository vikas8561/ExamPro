import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import apiRequest from "../services/api";

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
        navigate(`/student/take-test/${assignmentId}`);
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
      <div 
        className="rounded-2xl p-6 text-center border"
        style={{ 
          backgroundColor: '#0B1220',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          color: '#9CA3AF'
        }}
      >
        No upcoming tests found.
      </div>
    );
  }

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
      <div className="max-h-96 overflow-y-auto scroll-smooth custom-scrollbar">
        <table className="w-full">
          <thead className="sticky top-0 z-10 shadow-lg" style={{ backgroundColor: '#0B1220', borderBottom: '2px solid rgba(255, 255, 255, 0.3)' }}>
            <tr>
              <th className="p-4 text-left" style={{ color: '#E5E7EB' }}>Test Name</th>
              <th className="p-4 text-left" style={{ color: '#E5E7EB' }}>Date</th>
              <th className="p-4 text-left" style={{ color: '#E5E7EB' }}>Time Remaining</th>
              <th className="p-4 text-left" style={{ color: '#E5E7EB' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => {
              const timeRemaining = getTimeRemaining(item.startTime);
              const hasStarted = !timeRemaining;

              return (
                <tr 
                  key={index} 
                  className="transition-colors duration-200"
                  style={{ 
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <td className="p-4">
                    <div className="font-medium" style={{ color: '#E5E7EB' }}>{item.testId?.title || item.name || "Test"}</div>
                    {item.testId?.type && (
                      <div className="text-sm text-slate-400 capitalize">{item.testId.type}</div>
                    )}
                  </td>
                  <td className="p-4" style={{ color: '#9CA3AF' }}>
                    {formatDate(item.startTime)}
                  </td>
                  <td className="p-4">
                    {hasStarted ? (
                      <span className="font-medium" style={{ color: '#FFFFFF' }}>Test Available</span>
                    ) : (
                      <span className="font-medium" style={{ color: '#FDE047' }}>{timeRemaining}</span>
                    )}
                  </td>
                  <td className="p-4">
                    {hasStarted ? (
                      <button
                        onClick={() => handleStartTest(item._id)}
                        className="px-4 py-2 rounded-lg font-medium transition-all"
                        style={{ 
                          backgroundColor: '#FFFFFF',
                          color: '#020617'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = '0.9';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = '1';
                        }}
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
    </>
  );
};

export default UpcomingTests;
