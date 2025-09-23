import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiRequest from "../services/api";

const PracticeTests = () => {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPracticeTests();
  }, []);

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
            {filteredTests.map((test) => (
              <div key={test._id} className="bg-slate-800 rounded-lg p-6 border border-slate-700 hover:border-green-500/50 transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-semibold text-white">
                    {test.title}
                  </h3>
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-900/50 text-green-300">
                    Practice
                  </span>
                </div>

                <div className="space-y-3 text-slate-300">
                  <div className="flex justify-between">
                    <span>Subject:</span>
                    <span>{test.subject || "General"}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Time Limit:</span>
                    <span>{test.timeLimit} minutes</span>
                  </div>

                  <div className="flex justify-between">
                    <span>Questions:</span>
                    <span>{test.questions?.length || 0}</span>
                  </div>

                  <div className="flex justify-between">
                    <span>Created by:</span>
                    <span>{test.createdBy?.name || "Instructor"}</span>
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  <button
                    onClick={() => handleStartPracticeTest(test._id)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md font-semibold transition-colors cursor-pointer"
                  >
                    Start Practice Test
                  </button>
                  
                  <button
                    onClick={() => handleViewResults(test._id)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md font-semibold transition-colors cursor-pointer"
                  >
                    View Previous Results
                  </button>
                </div>

                <div className="mt-4 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>No proctoring • Multiple attempts allowed</span>
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
