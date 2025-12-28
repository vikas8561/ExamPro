import React from "react";
import { getRandomFeedback } from "../utils/feedbackMessages";

const StudentTable = ({ type, data, currentPage = 1, totalPages = 1, totalItems = 0, loading = false, onPageChange }) => {
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
        No {type === "assigned" ? "assigned" : "completed"} tests found.
      </div>
    );
  }

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

  return (
    <>
      <style>{scrollbarStyles}</style>
      <div 
        className="rounded-2xl shadow-xl border overflow-hidden"
        style={{ 
          backgroundColor: '#0B1220',
          borderColor: 'rgba(255, 255, 255, 0.2)'
        }}
      >
        <div className="h-[calc(100vh-250px)] overflow-y-auto scroll-smooth custom-scrollbar">
          <table className="w-full">
            <thead className="sticky top-0 z-10 shadow-lg" style={{ backgroundColor: '#0B1220', borderBottom: '2px solid rgba(255, 255, 255, 0.3)' }}>
              <tr>
                <th className="p-6 text-left font-semibold text-lg" style={{ color: '#E5E7EB' }}>📝 Test Name</th>
                {type === "completed" && (
                  <>
                    <th className="p-6 text-left font-semibold text-lg" style={{ color: '#E5E7EB' }}>📊 Score</th>
                    <th className="p-6 text-center font-semibold text-lg" style={{ color: '#E5E7EB' }}>💬 Feedback</th>
                    <th className="p-6 text-left font-semibold text-lg whitespace-nowrap" style={{ color: '#E5E7EB' }}>📅 Completed</th>
                  </>
                )}
                {type === "assigned" && (
                  <th className="p-6 text-left font-semibold text-lg" style={{ color: '#E5E7EB' }}>📋 Status</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={type === "completed" ? 4 : 2} className="p-8 text-center" style={{ color: '#E5E7EB' }}>
                    <div className="text-xl">Loading...</div>
                  </td>
                </tr>
              ) : (
                data.map((item, index) => (
                <tr 
                  key={index} 
                  className="transition-all duration-200 group"
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
                  <td className="p-6">
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg flex-shrink-0"
                        style={{
                          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1))',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          color: '#FFFFFF'
                        }}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-lg truncate" style={{ color: '#E5E7EB' }}>{item.testId?.title || item.name || "Test"}</div>
                        {item.testId?.type && (
                          <div 
                            className="text-sm capitalize px-2 py-1 rounded-full inline-block mt-1"
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.1)',
                              color: '#FFFFFF',
                              border: '1px solid rgba(255, 255, 255, 0.2)'
                            }}
                          >
                            {item.testId.type}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                
                {type === "completed" && (
                  <>
                    <td className="p-6">
                    {(() => {
                      const currentTime = new Date();
                      const assignmentDeadline = item.assignmentId?.deadline ? new Date(item.assignmentId.deadline) : null;
                      if (assignmentDeadline && currentTime < assignmentDeadline) {
                        return (
                          <div className="flex items-center space-x-2">
                            <div 
                              className="w-3 h-3 rounded-full animate-pulse"
                              style={{ backgroundColor: '#FDE047' }}
                            ></div>
                            <span 
                              className="px-4 py-2 rounded-lg text-sm font-medium border"
                              style={{
                                backgroundColor: 'rgba(253, 224, 71, 0.1)',
                                color: '#FDE047',
                                borderColor: 'rgba(253, 224, 71, 0.3)'
                              }}
                            >
                              Available after deadline
                            </span>
                          </div>
                        );
                      }
                      const score = item.mentorScore !== null ? item.mentorScore : (item.maxScore ? Math.round((item.totalScore / item.maxScore) * 100) : 0);
                      
                      // Use white-based colors for scores, with variations
                      let scoreColor, scoreBg, scoreBorder, scoreShadow;
                      if (score >= 90) {
                        scoreColor = '#FFFFFF';
                        scoreBg = 'rgba(255, 255, 255, 0.2)';
                        scoreBorder = 'rgba(255, 255, 255, 0.5)';
                        scoreShadow = '0 0 20px rgba(255, 255, 255, 0.3)';
                      } else if (score >= 80) {
                        scoreColor = '#FFFFFF';
                        scoreBg = 'rgba(255, 255, 255, 0.15)';
                        scoreBorder = 'rgba(255, 255, 255, 0.4)';
                        scoreShadow = '0 0 15px rgba(255, 255, 255, 0.2)';
                      } else if (score >= 70) {
                        scoreColor = '#FFFFFF';
                        scoreBg = 'rgba(255, 255, 255, 0.15)';
                        scoreBorder = 'rgba(255, 255, 255, 0.4)';
                        scoreShadow = '0 0 10px rgba(255, 255, 255, 0.2)';
                      } else if (score >= 60) {
                        scoreColor = '#FFFFFF';
                        scoreBg = 'rgba(255, 255, 255, 0.15)';
                        scoreBorder = 'rgba(255, 255, 255, 0.4)';
                        scoreShadow = 'none';
                      } else {
                        scoreColor = '#E5E7EB';
                        scoreBg = 'rgba(229, 231, 235, 0.1)';
                        scoreBorder = 'rgba(229, 231, 235, 0.3)';
                        scoreShadow = 'none';
                      }
                      
                      return (
                        <div className="flex items-center justify-center">
                          <span 
                            className="w-20 px-6 py-3 rounded-lg text-sm font-bold transition-all duration-300 transform hover:scale-110 text-center border-2"
                            style={{
                              backgroundColor: scoreBg,
                              color: scoreColor,
                              borderColor: scoreBorder,
                              boxShadow: scoreShadow
                            }}
                          >
                            {score}%
                          </span>
                        </div>
                      );
                    })()}
                    </td>
                    <td className="p-6">
                      <div 
                        className="rounded-lg p-3 border"
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          borderColor: 'rgba(255, 255, 255, 0.2)'
                        }}
                      >
                        <p className="text-sm font-bold" style={{ color: '#E5E7EB' }}>
                          {(() => {
                            // Use mentor feedback if available, otherwise generate automatic feedback
                            if (item.mentorFeedback || item.feedback) {
                              return item.mentorFeedback || item.feedback;
                            }
                            
                            // Generate automatic feedback based on score
                            const score = item.mentorScore !== null ? item.mentorScore : (item.maxScore ? Math.round((item.totalScore / item.maxScore) * 100) : 0);
                            const testId = item.testId?._id || item._id || 'default';
                            
                            return getRandomFeedback(score, testId);
                          })()}
                        </p>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="text-sm font-bold text-right pr-4" style={{ color: '#9CA3AF' }}>
                        {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : 'N/A'}
                      </div>
                    </td>
                  </>
                )}
                
                {type === "assigned" && (
                  <td className="p-6">
                    {(() => {
                      const statusColors = {
                        "Assigned": {
                          bg: 'rgba(255, 255, 255, 0.15)',
                          color: '#FFFFFF',
                          border: 'rgba(255, 255, 255, 0.3)'
                        },
                        "In Progress": {
                          bg: 'rgba(255, 255, 255, 0.2)',
                          color: '#FFFFFF',
                          border: 'rgba(255, 255, 255, 0.4)'
                        },
                        "Completed": {
                          bg: 'rgba(255, 255, 255, 0.15)',
                          color: '#FFFFFF',
                          border: 'rgba(255, 255, 255, 0.3)'
                        }
                      };
                      const colors = statusColors[item.status] || {
                        bg: 'rgba(148, 163, 184, 0.1)',
                        color: '#94A3B8',
                        border: 'rgba(148, 163, 184, 0.3)'
                      };
                      return (
                        <span 
                          className="px-4 py-2 rounded-lg text-sm font-medium shadow-sm border"
                          style={{
                            backgroundColor: colors.bg,
                            color: colors.color,
                            borderColor: colors.border
                          }}
                        >
                          {item.status}
                        </span>
                      );
                    })()}
                  </td>
                )}
              </tr>
            ))
              )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {type === "completed" && totalPages > 1 && (
        <div className="px-6 py-3 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.2)' }}>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => {
                if (currentPage > 1 && onPageChange) {
                  onPageChange(currentPage - 1);
                }
              }}
              disabled={currentPage === 1}
              className="px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
              style={{
                backgroundColor: currentPage === 1 
                  ? 'rgba(255, 255, 255, 0.05)' 
                  : '#FFFFFF',
                background: currentPage === 1 
                  ? 'rgba(255, 255, 255, 0.05)' 
                  : '#FFFFFF',
                color: currentPage === 1 ? '#FFFFFF' : '#000000',
                border: '2px solid rgba(255, 255, 255, 0.2)'
              }}
              onMouseEnter={(e) => {
                if (currentPage > 1) {
                  e.currentTarget.style.background = '#FFFFFF';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(255, 255, 255, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage > 1) {
                  e.currentTarget.style.background = '#FFFFFF';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
                }
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>
            
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => {
                      if (pageNum !== currentPage && onPageChange) {
                        onPageChange(pageNum);
                      }
                    }}
                    className="w-11 h-11 rounded-xl font-bold transition-all duration-300 transform hover:scale-110 shadow-md hover:shadow-lg"
                    style={{
                      background: pageNum === currentPage 
                        ? '#FFFFFF'
                        : 'rgba(255, 255, 255, 0.1)',
                      color: pageNum === currentPage ? '#000000' : '#FFFFFF',
                      border: pageNum === currentPage 
                        ? '2px solid rgba(255, 255, 255, 0.8)' 
                        : '2px solid rgba(255, 255, 255, 0.2)',
                      boxShadow: pageNum === currentPage 
                        ? '0 4px 15px rgba(255, 255, 255, 0.4)' 
                        : '0 2px 8px rgba(0, 0, 0, 0.2)'
                    }}
                    onMouseEnter={(e) => {
                      if (pageNum !== currentPage) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 255, 255, 0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (pageNum !== currentPage) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                      }
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                if (currentPage < totalPages && onPageChange) {
                  onPageChange(currentPage + 1);
                }
              }}
              disabled={currentPage === totalPages}
              className="px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
              style={{
                backgroundColor: currentPage === totalPages 
                  ? 'rgba(255, 255, 255, 0.05)' 
                  : '#FFFFFF',
                background: currentPage === totalPages 
                  ? 'rgba(255, 255, 255, 0.05)' 
                  : '#FFFFFF',
                color: currentPage === totalPages ? '#FFFFFF' : '#000000',
                border: '2px solid rgba(255, 255, 255, 0.2)'
              }}
              onMouseEnter={(e) => {
                if (currentPage < totalPages) {
                  e.currentTarget.style.background = '#FFFFFF';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(255, 255, 255, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage < totalPages) {
                  e.currentTarget.style.background = '#FFFFFF';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
                }
              }}
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default StudentTable;
