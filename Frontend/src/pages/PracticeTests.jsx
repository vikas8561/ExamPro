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
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [attemptedTests, setAttemptedTests] = useState(new Set()); // Track which tests have been attempted
  const navigate = useNavigate();

  useEffect(() => {
    fetchPracticeTests();
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
          console.log(`No attempts found for test ${test._id}`);
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
  }, [tests]);

  const fetchPracticeTests = async () => {
    try {
      setLoading(true);
      console.log('🎯 Frontend: Fetching practice tests...');
      const data = await apiRequest("/practice-tests");
      console.log('🎯 Frontend: Practice tests data received:', data);
      setTests(data.tests || []);
    } catch (error) {
      console.error("Error fetching practice tests:", error);
      setTests([]);
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

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <style>{cardAnimationStyles}</style>
      <div className="max-w-6xl mx-auto">
        {/* Header Section with Gradient Background */}
        <div className="sticky top-0 z-50 relative mb-8">
          <div className="absolute inset-0 bg-gradient-to-r from-green-600/10 via-blue-600/10 to-purple-600/10 rounded-2xl blur-xl"></div>
          <div className="relative bg-slate-800/95 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
            {/* Title and Stats Row */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-green-500 to-blue-600 rounded-xl shadow-lg">
                  <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    Practice Tests
                  </h1>
                  <p className="text-slate-400 text-sm mt-1">
                    {tests.length} practice tests available • {filteredTests.length} showing
                  </p>
                </div>
              </div>

              {/* Search Bar and Filter Button */}
              <div className="flex items-center gap-3">
                <div className="relative max-w-md w-full lg:w-80">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search practice tests..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-12 py-3 bg-black-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition-all duration-300 hover:bg-slate-700/70 hover:border-slate-500/50 backdrop-blur-sm"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-white transition-colors duration-200"
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
                  className="flex items-center gap-2 bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 text-white px-4 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
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
                      className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
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
                className="group relative bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 hover:border-green-500/50 transition-all duration-500 transform hover:scale-105 hover:shadow-2xl hover:shadow-green-500/10 cursor-pointer animate-slide-in-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Animated Background Gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-blue-500/5 to-purple-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                
                {/* Floating Elements */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-2 group-hover:translate-y-0">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                </div>

                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4 ml-1">
                    <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg shadow-lg group-hover:shadow-green-500/25 transition-all duration-300 transform group-hover:rotate-6">
                      <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-white group-hover:text-green-300 transition-colors duration-300">
                          {test.title}
                        </h3>
                        {attemptedTests.has(test._id) && (
                          <span className="bg-green-600 text-white text-xs px-2 py-1 rounded-full">
                            Attempted
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400 mt-1">Practice Test</p>
                    </div>
                  </div>

                  {/* Test Details with Enhanced Badges */}
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-700/20 to-slate-600/20 rounded-xl hover:from-blue-500/10 hover:to-indigo-500/10 border border-slate-600/30 hover:border-blue-400/50 transition-all duration-300 group/item transform hover:scale-[1.02]">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-lg group-hover/item:shadow-blue-500/25 transition-all duration-300 transform group-hover/item:rotate-12">
                          <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm font-medium">Subject</span>
                      </div>
                      <span className="px-3 py-1 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-300 rounded-full text-sm font-semibold border border-blue-400/30 group-hover/item:from-blue-500/30 group-hover/item:to-indigo-500/30 group-hover/item:text-blue-200 transition-all duration-300">
                        {test.subject || "General"}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-700/20 to-slate-600/20 rounded-xl hover:from-amber-500/10 hover:to-orange-500/10 border border-slate-600/30 hover:border-amber-400/50 transition-all duration-300 group/item transform hover:scale-[1.02]">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg shadow-lg group-hover/item:shadow-amber-500/25 transition-all duration-300 transform group-hover/item:rotate-12">
                          <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm font-medium">Time Limit</span>
                      </div>
                      <span className="px-3 py-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 rounded-full text-sm font-semibold border border-amber-400/30 group-hover/item:from-amber-500/30 group-hover/item:to-orange-500/30 group-hover/item:text-amber-200 transition-all duration-300">
                        {test.timeLimit} min
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-slate-700/20 to-slate-600/20 rounded-xl hover:from-purple-500/10 hover:to-pink-500/10 border border-slate-600/30 hover:border-purple-400/50 transition-all duration-300 group/item transform hover:scale-[1.02]">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg shadow-lg group-hover/item:shadow-purple-500/25 transition-all duration-300 transform group-hover/item:rotate-12">
                          <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <span className="text-slate-300 text-sm font-medium">Questions</span>
                      </div>
                      <span className="px-3 py-1 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 rounded-full text-sm font-semibold border border-purple-400/30 group-hover/item:from-purple-500/30 group-hover/item:to-pink-500/30 group-hover/item:text-purple-200 transition-all duration-300">
                        {test.questions?.length || 0}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    <button
                      onClick={() => handleStartPracticeTest(test._id)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold transition-all duration-200 transform hover:scale-[1.02] hover:shadow-lg flex items-center justify-center gap-2 group/btn"
                    >
                      <svg className="h-5 w-5 group-hover/btn:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Start Practice Test</span>
                    </button>
                    
                    {attemptedTests.has(test._id) && (
                      <button
                        onClick={() => handleViewResults(test._id)}
                        className="w-full bg-gray-600 hover:bg-gray-700 text-white py-3 px-4 rounded-lg font-semibold transition-all duration-200 transform hover:scale-[1.02] hover:shadow-lg flex items-center justify-center gap-2 group/btn"
                      >
                        <svg className="h-5 w-5 group-hover/btn:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <span>View Previous Results</span>
                      </button>
                    )}
                  </div>

                  {/* Footer Info */}
                  <div className="mt-6 pt-4 border-t border-slate-700/50">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                        <span>No proctoring</span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></div>
                        <span>Multiple attempts</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PracticeTests;
