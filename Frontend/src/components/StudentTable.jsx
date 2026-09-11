import React, { useState } from "react";
import { getRandomFeedback } from "../utils/feedbackMessages";
import { ChevronDown, ChevronUp } from "lucide-react";
import '../styles/StudentTable.mobile.css';

const StudentTable = ({ type, data, currentPage = 1, totalPages = 1, totalItems = 0, loading = false, onPageChange }) => {
  const [openTests, setOpenTests] = useState(new Set()); // Track expanded tests on mobile

  const toggleTest = (testId) => {
    setOpenTests((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(testId)) {
        newSet.delete(testId);
      } else {
        newSet.add(testId);
      }
      return newSet;
    });
  };
  // Don't show empty state while loading
  if (!loading && (!data || data.length === 0)) {
    return (
      <div
        className="student-table-mobile empty-state rounded-2xl p-6 text-center border"
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
    
    @keyframes shimmer {
      0% {
        background-position: -1000px 0;
      }
      100% {
        background-position: 1000px 0;
      }
    }
    
    .skeleton {
      background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.05) 0%,
        rgba(255, 255, 255, 0.1) 50%,
        rgba(255, 255, 255, 0.05) 100%
      );
      background-size: 1000px 100%;
      animation: shimmer 2s infinite;
    }
  `;

  return (
    <>
      <style>{scrollbarStyles}</style>
      <div
        className="student-table-mobile rounded-2xl shadow-xl border overflow-hidden"
        style={{
          backgroundColor: '#0B1220',
          borderColor: 'rgba(255, 255, 255, 0.2)'
        }}
      >
        <div className="table-scroll-container h-[calc(100vh-265px)] overflow-y-auto scroll-smooth custom-scrollbar">
          <table className="table-desktop w-full">
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
                // Skeleton loaders for table rows
                [...Array(10)].map((_, index) => (
                  <tr
                    key={`skeleton-${index}`}
                    className="transition-all duration-200"
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
                    }}
                  >
                    <td className="p-6">
                      <div className="flex items-center space-x-3">
                        <div className="skeleton rounded-lg" style={{ width: '40px', height: '40px', flexShrink: 0 }}></div>
                        <div className="flex-1 min-w-0">
                          <div className="skeleton rounded-lg mb-2" style={{ height: '20px', width: '200px' }}></div>
                          <div className="skeleton rounded-lg" style={{ height: '16px', width: '80px' }}></div>
                        </div>
                      </div>
                    </td>
                    {type === "completed" && (
                      <>
                        <td className="p-6">
                          <div className="flex items-center justify-center">
                            <div className="skeleton rounded-lg" style={{ width: '80px', height: '40px' }}></div>
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="skeleton rounded-lg" style={{ height: '60px', width: '100%' }}></div>
                        </td>
                        <td className="p-6">
                          <div className="skeleton rounded-lg ml-auto" style={{ height: '16px', width: '100px' }}></div>
                        </td>
                      </>
                    )}
                    {type === "assigned" && (
                      <td className="p-6">
                        <div className="skeleton rounded-lg" style={{ width: '100px', height: '32px' }}></div>
                      </td>
                    )}
                  </tr>
                ))
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

          {/* Cards View - Mobile */}
          <div className="table-cards hidden">
            {loading ? (
              // Skeleton loaders for cards
              [...Array(10)].map((_, index) => (
                <div key={`skeleton-card-${index}`} className="skeleton-card">
                  <div className="skeleton-header">
                    <div className="skeleton rounded-lg" style={{ width: '40px', height: '40px', flexShrink: 0 }}></div>
                    <div className="flex-1 min-w-0">
                      <div className="skeleton rounded-lg mb-2" style={{ height: '20px', width: '80%' }}></div>
                      <div className="skeleton rounded-lg" style={{ height: '16px', width: '60%' }}></div>
                    </div>
                  </div>
                  <div className="skeleton-details">
                    {type === "completed" && (
                      <>
                        <div className="skeleton rounded-lg" style={{ height: '60px', width: '100%' }}></div>
                        <div className="skeleton rounded-lg" style={{ height: '60px', width: '100%' }}></div>
                        <div className="skeleton rounded-lg" style={{ height: '40px', width: '100%' }}></div>
                      </>
                    )}
                    {type === "assigned" && (
                      <div className="skeleton rounded-lg" style={{ height: '40px', width: '100%' }}></div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              data.map((item, index) => {
                const testId = item._id || item.testId?._id || `test-${index}`;
                const isTestOpen = openTests.has(testId);
                return (
                  <div key={index} className="test-card">
                    {/* Card Header - Collapsible */}
                    <div
                      className="test-card-header-mobile"
                      onClick={() => toggleTest(testId)}
                    >
                      <div className="test-header-content">
                        <div
                          className="test-number w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg flex-shrink-0"
                          style={{
                            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1))',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            color: '#FFFFFF'
                          }}
                        >
                          {index + 1}
                        </div>
                        <div className="test-name-section">
                          <div className="test-name font-semibold text-lg truncate" style={{ color: '#E5E7EB' }}>
                            {item.testId?.title || item.name || "Test"}
                          </div>
                          {item.testId?.type && (
                            <div
                              className="test-type-badge text-sm capitalize px-2 py-1 rounded-full inline-block mt-1"
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
                      <div className="test-chevron-mobile">
                        {isTestOpen ? (
                          <ChevronUp className="w-5 h-5" style={{ color: '#E5E7EB' }} />
                        ) : (
                          <ChevronDown className="w-5 h-5" style={{ color: '#E5E7EB' }} />
                        )}
                      </div>
                    </div>

                    {/* Card Details - Collapsible */}
                    {isTestOpen && (
                      <div className="test-card-details">
                        {type === "completed" && (
                          <>
                            {/* Score */}
                            <div className="test-detail-row">
                              <div className="test-detail-label">Score</div>
                              <div className="test-detail-value">
                                {(() => {
                                  const currentTime = new Date();
                                  const assignmentDeadline = item.assignmentId?.deadline ? new Date(item.assignmentId.deadline) : null;
                                  if (assignmentDeadline && currentTime < assignmentDeadline) {
                                    return (
                                      <div className="score-container">
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
                                    <div className="score-container">
                                      <span
                                        className="score-badge w-20 px-6 py-3 rounded-lg text-sm font-bold transition-all duration-300 transform hover:scale-110 text-center border-2"
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
                              </div>
                            </div>

                            {/* Feedback */}
                            <div className="test-detail-row">
                              <div className="test-detail-label">Feedback</div>
                              <div className="test-detail-value">
                                <div className="feedback-container rounded-lg p-3 border" style={{
                                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                  borderColor: 'rgba(255, 255, 255, 0.2)'
                                }}>
                                  <p className="feedback-text text-sm font-bold" style={{ color: '#E5E7EB' }}>
                                    {(() => {
                                      if (item.mentorFeedback || item.feedback) {
                                        return item.mentorFeedback || item.feedback;
                                      }
                                      const score = item.mentorScore !== null ? item.mentorScore : (item.maxScore ? Math.round((item.totalScore / item.maxScore) * 100) : 0);
                                      const testId = item.testId?._id || item._id || 'default';
                                      return getRandomFeedback(score, testId);
                                    })()}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Completed Date */}
                            <div className="test-detail-row">
                              <div className="test-detail-label">Completed</div>
                              <div className="test-detail-value">
                                <div className="date-container text-sm font-bold" style={{ color: '#9CA3AF' }}>
                                  {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : 'N/A'}
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        {type === "assigned" && (
                          <div className="test-detail-row">
                            <div className="test-detail-label">Status</div>
                            <div className="test-detail-value">
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
                                    className="status-badge px-4 py-2 rounded-lg text-sm font-medium shadow-sm border"
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
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Pagination Controls */}
        {type === "completed" && (
          <div className="pagination-container px-6 py-3 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.2)' }}>
            <div className="pagination-buttons pagination-row flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  if (currentPage > 1 && onPageChange) {
                    onPageChange(currentPage - 1);
                  }
                }}
                disabled={currentPage === 1}
                className="pagination-button px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
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

              <div className="pagination-numbers flex items-center gap-2 px-4 py-2 rounded-xl" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
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
                      className="pagination-number w-11 h-11 rounded-xl font-bold transition-all duration-300 transform hover:scale-110 shadow-md hover:shadow-lg"
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
                className="pagination-button px-5 py-2.5 rounded-xl font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:hover:scale-100"
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
