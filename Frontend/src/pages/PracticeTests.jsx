import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiRequest from "../services/api";

// Add custom styles for card animations
const cardAnimationStyles = `
  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .animate-slide-in-up {
    animation: slideInUp 0.6s ease-out forwards;
    opacity: 0;
  }
`;

const PracticeTests = () => {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [attemptedTests, setAttemptedTests] = useState(new Set()); // Track which tests have been attempted
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPracticeTests(currentPage);
  }, []);

  // Check which tests have been attempted
  const checkAttemptedTests = async () => {
    try {
      const attemptedSet = new Set();
      for (const test of tests) {
        try {
          const response = await apiRequest(`/practice-tests/${test._id}/attempts`);
          if (response.submissions && response.submissions.length > 0) {
            attemptedSet.add(test._id);
          }
        } catch (error) {
          // If there's an error (like 404), the test hasn't been attempted
        }
      }
      setAttemptedTests(attemptedSet);
    } catch (error) {
      console.error("Error checking attempted tests:", error);
    }
  };

  // Check attempted tests when tests are loaded
  useEffect(() => {
    if (tests.length > 0) {
      checkAttemptedTests();
    }
  }, [tests, currentPage]);

  const fetchPracticeTests = async (page = currentPage) => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest(`/practice-tests?page=${page}&limit=9`);
      
      // Handle paginated response
      if (data && data.tests && data.pagination) {
        setTests(data.tests);
        setCurrentPage(data.pagination.currentPage);
        setTotalPages(data.pagination.totalPages);
        setTotalItems(data.pagination.totalItems);
      } else if (data && data.tests) {
        // Fallback for non-paginated response (backward compatibility)
        setTests(data.tests);
        setTotalPages(1);
        setTotalItems(data.tests.length);
      } else {
        setTests([]);
        setTotalPages(1);
        setTotalItems(0);
      }
    } catch (error) {
      console.error("Error fetching practice tests:", error);
      setTests([]);
      setError('Failed to load practice tests. Please try again.');
      setTotalPages(1);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  };

  const handleStartPracticeTest = (testId) => {
    navigate(`/student/practice-test/${testId}`);
  };

  const handleViewResults = (testId) => {
    navigate(`/student/practice-test-results/${testId}`);
  };

  // Function to refresh attempted tests (can be called after completing a test)
  const refreshAttemptedTests = () => {
    if (tests.length > 0) {
      checkAttemptedTests();
    }
  };

  const filteredTests = tests.filter((test) => {
    // Subject filter
    if (subjectFilter !== 'all' && test.subject !== subjectFilter) {
      return false;
    }

    // Search filter
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (test.title || '').toLowerCase().includes(term) ||
      (test.subject || '').toLowerCase().includes(term) ||
      (test.createdBy?.name || '').toLowerCase().includes(term)
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-xl">Loading practice tests...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6 text-center">
            <div className="flex items-center justify-center mb-4">
              <svg className="h-12 w-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-red-300 mb-2">Unable to Load Practice Tests</h2>
            <p className="text-red-200 mb-4">{error}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  setError(null);
                  fetchPracticeTests(currentPage);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('token');
                  localStorage.removeItem('user');
                  localStorage.removeItem('userId');
                  window.location.href = '/login';
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Log In Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <style>{cardAnimationStyles}</style>
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="sticky top-0 z-50 relative mb-8">
          <div className="relative bg-slate-800/95 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-lg">
            {/* Title and Stats Row */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-800/70 rounded-xl shadow-sm">
                  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#FFFFFF' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-white">
                    Practice Tests
                  </h1>
                  <p className="text-slate-400 text-sm mt-1">
                    {totalItems > 0 ? `${totalItems} practice test${totalItems !== 1 ? 's' : ''} available` : `${tests.length} practice test${tests.length !== 1 ? 's' : ''} available`} • {filteredTests.length} showing
                  </p>
                </div>
              </div>

              {/* Search Bar and Filter Button */}
              <div className="flex items-center gap-3">
                <div className="relative max-w-md w-full lg:w-80">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#FFFFFF' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search practice tests..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-12 py-3 rounded-xl focus:outline-none transition-all duration-300"
                    style={{
                      backgroundColor: '#1E293B',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      color: '#FFFFFF',
                      boxShadow: 'none'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                      e.currentTarget.style.boxShadow = '0 0 0 2px rgba(255, 255, 255, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    onMouseEnter={(e) => {
                      if (document.activeElement !== e.currentTarget) {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (document.activeElement !== e.currentTarget) {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                      }
                    }}
                  />
                  <style>{`
                    input::placeholder {
                      color: #9CA3AF !important;
                      opacity: 1;
                    }
                  `}</style>
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center transition-colors duration-200"
                      style={{ color: '#FFFFFF' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#E5E7EB';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#FFFFFF';
                      }}
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Filter Button */}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-2 bg-slate-700/60 hover:bg-slate-700/80 text-white px-4 py-3 rounded-xl font-medium transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filter
                  <svg className={`h-4 w-4 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Filter Section */}
            {showFilters && (
              <div className="border-t border-slate-700/50 pt-6">
                <div className="flex flex-wrap gap-4 items-center">
                  {/* Subject Filter */}
                  <div className="flex items-center gap-3 bg-slate-700/30 rounded-lg px-4 py-2 hover:bg-slate-700/50 transition-colors duration-200">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      <label className="text-sm font-medium text-slate-300">Subject:</label>
                    </div>
                    <select
                      value={subjectFilter}
                      onChange={(e) => setSubjectFilter(e.target.value)}
                      className="bg-transparent border-none text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 rounded-md px-2 py-1 transition-all duration-200"
                    >
                      <option value="all" className="bg-slate-700">All Subjects</option>
                      {Array.from(new Set(tests.map(test => test.subject).filter(Boolean))).map(subject => (
                        <option key={subject} value={subject} className="bg-slate-700">{subject}</option>
                      ))}
                    </select>
                  </div>

                  {/* Clear Filters Button */}
                  {(subjectFilter !== 'all' || searchTerm) && (
                    <button
                      onClick={() => {
                        setSubjectFilter('all');
                        setSearchTerm('');
                      }}
                      className="flex items-center gap-2 bg-slate-700/60 hover:bg-slate-700/80 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {tests.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-2xl text-slate-400 mb-4">No practice tests available</div>
            <p className="text-slate-500">Practice tests will appear here when they are created by your instructors.</p>
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-2xl text-slate-400 mb-4">No practice tests match your search</div>
            <p className="text-slate-500">Try adjusting your search terms.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTests.map((test, index) => (
              <div 
                key={test._id} 
                className="group relative backdrop-blur-sm rounded-2xl p-6 border transition-all duration-300 cursor-pointer animate-slide-in-up overflow-hidden"
                style={{ 
                  animationDelay: `${index * 100}ms`,
                  backgroundColor: '#0B1220',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  boxShadow: '0 0 0 rgba(255, 255, 255, 0)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                  e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(255, 255, 255, 0.1), 0 10px 10px -5px rgba(255, 255, 255, 0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.currentTarget.style.boxShadow = '0 0 0 rgba(255, 255, 255, 0)';
                }}
              >
                {/* Subtle gradient overlay on hover */}
                <div className="absolute inset-0 rounded-2xl transition-all duration-300 pointer-events-none opacity-0 group-hover:opacity-100" style={{ background: 'linear-gradient(to bottom right, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))' }}></div>

                <div className="relative z-10">
                  {/* Header Section */}
                  <div className="mb-1" style={{ height: '85px' }}>
                    <div className="flex items-start gap-3 h-full">
                      <div className="p-3 bg-slate-800/70 rounded-xl shadow-sm group-hover:shadow-md transition-shadow duration-300 flex-shrink-0">
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#FFFFFF' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <div 
                            className="text-xl font-bold transition-colors duration-200 flex-1" 
                            title={test.title}
                            style={{ 
                              color: '#E5E7EB',
                              lineHeight: '1.5',
                              minHeight: '3.75rem',
                              maxHeight: '3.75rem',
                              overflow: 'hidden',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              textOverflow: 'ellipsis',
                              wordBreak: 'break-word',
                              cursor: 'help'
                            }}
                          >
                            {test.title}
                          </div>
                          {attemptedTests.has(test._id) && (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold flex-shrink-0" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', color: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.3)' }}>
                              Attempted
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Test Details - Improved Design with Fixed Widths */}
                  <div className="space-y-2.5 mb-6">
                    <div className="flex items-center justify-between p-3.5 bg-slate-900/70 rounded-xl border border-slate-800/50 hover:bg-slate-900/80 transition-all duration-200 group/item">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-2 bg-slate-800/70 rounded-lg shadow-sm flex-shrink-0">
                          <svg className="h-4 w-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm font-medium whitespace-nowrap">Subject</span>
                      </div>
                      <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center">
                        {test.subject || "General"}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between p-3.5 bg-slate-900/70 rounded-xl border border-slate-800/50 hover:bg-slate-900/80 transition-all duration-200 group/item">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-2 bg-slate-800/70 rounded-lg shadow-sm flex-shrink-0">
                          <svg className="h-4 w-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm font-medium whitespace-nowrap">Time Limit</span>
                      </div>
                      <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center">
                        {test.timeLimit} min
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3.5 bg-slate-900/70 rounded-xl border border-slate-800/50 hover:bg-slate-900/80 transition-all duration-200 group/item">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="p-2 bg-slate-800/70 rounded-lg shadow-sm flex-shrink-0">
                          <svg className="h-4 w-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm font-medium whitespace-nowrap">Questions</span>
                      </div>
                      <span className="px-3 py-1.5 bg-slate-800/60 text-gray-100 rounded-lg text-sm font-semibold border border-slate-700/50 shadow-sm min-w-[80px] text-center">
                        {test.questionCount || 0}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons Section */}
                  <div className="mt-6 pt-4" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.2)' }}>
                    <button
                      onClick={() => handleStartPracticeTest(test._id)}
                      className="w-full py-2.5 px-4 rounded-lg font-semibold transition-all cursor-pointer shadow-sm hover:shadow-md mb-3"
                      style={{ 
                        backgroundColor: '#FFFFFF',
                        color: '#020617',
                        border: '2px solid transparent'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '0.9';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                    >
                      Start Practice Test
                    </button>
                    
                    {attemptedTests.has(test._id) && (
                      <button
                        onClick={() => handleViewResults(test._id)}
                        className="w-full py-2.5 px-4 rounded-lg font-semibold transition-all cursor-pointer shadow-sm hover:shadow-md"
                        style={{ 
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          color: '#FFFFFF',
                          border: '1px solid rgba(255, 255, 255, 0.3)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                        }}
                      >
                        View Previous Results
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="mt-10 flex flex-col items-center gap-4">
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  if (currentPage > 1) {
                    const newPage = currentPage - 1;
                    setCurrentPage(newPage);
                    fetchPracticeTests(newPage);
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
                        if (pageNum !== currentPage) {
                          setCurrentPage(pageNum);
                          fetchPracticeTests(pageNum);
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
                  if (currentPage < totalPages) {
                    const newPage = currentPage + 1;
                    setCurrentPage(newPage);
                    fetchPracticeTests(newPage);
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
    </div>
  );
};

export default PracticeTests;
