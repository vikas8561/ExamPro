import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import StatusPill from "../components/StatusPill";
import VirtualizedTable from "../components/VirtualizedTable";
import { useApiCache } from "../hooks/useApiCache";
import { useDebounce } from "../hooks/useDebounce";

export default function MentorAssignmentsOptimized() {
  const [showModal, setShowModal] = useState(false);
  const [selectedTest, setSelectedTest] = useState(null);
  const [showStudentListModal, setShowStudentListModal] = useState(false);
  const [selectedSection, setSelectedSection] = useState(null);
  const [scoreSort, setScoreSort] = useState('none');
  const [submissionTimeSort, setSubmissionTimeSort] = useState('none');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [studentsCurrentPage, setStudentsCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const itemsPerPage = 20; // Increased for better performance
  const navigate = useNavigate();

  // Debounce search terms to reduce API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const debouncedStudentSearchTerm = useDebounce(studentSearchTerm, 300);

  // Use cached API calls
  const { data: assignments = [], loading, error, invalidateCache } = useApiCache(
    "https://cg-test-app.onrender.com/api/mentor/assignments"
  );

  // Memoized filtered assignments
  const filteredAssignments = useMemo(() => {
    const uniqueAssignments = Array.from(
      new Map(assignments.map(a => [a.testId?._id, a])).values()
    );
    
    if (!debouncedSearchTerm.trim()) {
      return uniqueAssignments;
    }
    
    const searchLower = debouncedSearchTerm.toLowerCase();
    return uniqueAssignments.filter(assignment => 
      (assignment.testId?.title || '').toLowerCase().includes(searchLower) ||
      (assignment.testId?.subject || '').toLowerCase().includes(searchLower) ||
      (assignment.testId?.type || '').toLowerCase().includes(searchLower) ||
      (assignment.createdAt ? new Date(assignment.createdAt).toLocaleDateString() : '').includes(searchLower)
    );
  }, [assignments, debouncedSearchTerm]);

  // Memoized paginated assignments
  const paginatedAssignments = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredAssignments.slice(startIndex, endIndex);
  }, [filteredAssignments, currentPage, itemsPerPage]);

  // Memoized filtered submitted students
  const filteredSubmittedStudents = useMemo(() => {
    if (!selectedTest) return [];
    
    let submittedStudents = assignments.filter(a => 
      a.testId?._id === selectedTest._id && a.status === "Completed"
    );

    // Apply student search filter
    if (debouncedStudentSearchTerm.trim()) {
      const searchLower = debouncedStudentSearchTerm.toLowerCase();
      submittedStudents = submittedStudents.filter(assignment => 
        (assignment.userId?.name || '').toLowerCase().includes(searchLower) ||
        (assignment.userId?.email || '').toLowerCase().includes(searchLower) ||
        (assignment.startedAt ? new Date(assignment.startedAt).toLocaleString() : '').toLowerCase().includes(searchLower) ||
        (assignment.submittedAt ? new Date(assignment.submittedAt).toLocaleString() : '').toLowerCase().includes(searchLower) ||
        (assignment.completedAt ? new Date(assignment.completedAt).toLocaleString() : '').toLowerCase().includes(searchLower) ||
        (assignment.score !== undefined ? assignment.score.toString() : '').includes(searchLower)
      );
    }

    // Apply sorting
    if (scoreSort !== 'none') {
      submittedStudents = [...submittedStudents].sort((a, b) => {
        const scoreA = a.score !== undefined ? a.score : 0;
        const scoreB = b.score !== undefined ? b.score : 0;
        return scoreSort === 'increasing' ? scoreA - scoreB : scoreB - scoreA;
      });
    }

    if (submissionTimeSort !== 'none') {
      submittedStudents = [...submittedStudents].sort((a, b) => {
        const startTimeA = a.startedAt ? new Date(a.startedAt) : null;
        const endTimeA = a.submittedAt ? new Date(a.submittedAt) : (a.completedAt ? new Date(a.completedAt) : null);
        const durationA = (startTimeA && endTimeA) ? (endTimeA - startTimeA) : 0;

        const startTimeB = b.startedAt ? new Date(b.startedAt) : null;
        const endTimeB = b.submittedAt ? new Date(b.submittedAt) : (b.completedAt ? new Date(b.completedAt) : null);
        const durationB = (startTimeB && endTimeB) ? (endTimeB - startTimeB) : 0;

        return submissionTimeSort === 'increasing' ? durationA - durationB : durationB - durationA;
      });
    }

    return submittedStudents;
  }, [assignments, selectedTest, debouncedStudentSearchTerm, scoreSort, submissionTimeSort]);

  // Memoized paginated students
  const paginatedStudents = useMemo(() => {
    const startIndex = (studentsCurrentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredSubmittedStudents.slice(startIndex, endIndex);
  }, [filteredSubmittedStudents, studentsCurrentPage, itemsPerPage]);

  // Memoized test duration calculation
  const getTestDuration = useCallback((assignment) => {
    const startTime = assignment.startedAt ? new Date(assignment.startedAt) : null;
    const endTime = assignment.submittedAt ? new Date(assignment.submittedAt) : (assignment.completedAt ? new Date(assignment.completedAt) : null);
    
    if (!startTime || !endTime) return null;
    
    const durationMs = endTime - startTime;
    const durationMinutes = Math.floor(durationMs / (1000 * 60));
    const durationSeconds = Math.floor((durationMs % (1000 * 60)) / 1000);
    
    if (durationMinutes > 0) {
      return `${durationMinutes}m ${durationSeconds}s`;
    } else {
      return `${durationSeconds}s`;
    }
  }, []);

  // Table columns for virtualized table
  const tableColumns = useMemo(() => [
    {
      key: 'title',
      header: 'Test Name',
      width: '40%',
      render: (assignment) => assignment.testId?.title || "Unknown Test"
    },
    {
      key: 'date',
      header: 'Test Date',
      width: '30%',
      render: (assignment) => assignment.createdAt ? new Date(assignment.createdAt).toLocaleDateString() : "N/A"
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '30%',
      render: (assignment) => (
        <button
          onClick={() => {
            setSelectedTest(assignment.testId);
            setShowModal(true);
            setScoreSort('none');
            setSubmissionTimeSort('none');
            setShowFilters(false);
            setStudentsCurrentPage(1);
            setStudentSearchTerm('');
          }}
          className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95 font-medium"
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View Details
          </span>
        </button>
      )
    }
  ], []);

  // Student table columns
  const studentTableColumns = useMemo(() => [
    {
      key: 'name',
      header: 'Student Name',
      width: '20%',
      render: (assignment) => assignment.userId?.name || "Unknown"
    },
    {
      key: 'startTime',
      header: 'Start Time',
      width: '20%',
      render: (assignment) => assignment.startedAt ? new Date(assignment.startedAt).toLocaleString() : "N/A"
    },
    {
      key: 'endTime',
      header: 'End Time',
      width: '20%',
      render: (assignment) => assignment.submittedAt ? new Date(assignment.submittedAt).toLocaleString() : 
        assignment.completedAt ? new Date(assignment.completedAt).toLocaleString() : "N/A"
    },
    {
      key: 'duration',
      header: 'Duration',
      width: '15%',
      render: (assignment) => {
        const duration = getTestDuration(assignment);
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
            duration ? 'bg-blue-900 text-blue-300' : 'bg-gray-900 text-gray-300'
          }`}>
            {duration || "N/A"}
          </span>
        );
      }
    },
    {
      key: 'score',
      header: 'Score',
      width: '15%',
      render: (assignment) => (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
          assignment.score >= 80 ? 'bg-green-900 text-green-300' :
          assignment.score >= 60 ? 'bg-yellow-900 text-yellow-300' :
          assignment.score >= 40 ? 'bg-orange-900 text-orange-300' :
          'bg-red-900 text-red-300'
        }`}>
          {assignment.score !== undefined ? assignment.score : "N/A"}
        </span>
      )
    },
    {
      key: 'action',
      header: 'Action',
      width: '10%',
      render: (assignment) => (
        <button
          onClick={() => navigate(`/mentor/view-test/${assignment._id}`)}
          className="bg-white text-black px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-105 font-semibold text-sm"
        >
          View
        </button>
      )
    }
  ], [getTestDuration, navigate]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-xl text-slate-400">Loading assignments...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-400">Error loading assignments: {error.message}</div>
        <button 
          onClick={() => invalidateCache()}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">Test Assignments</h2>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search tests by name, subject, type, or date..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-80 pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white transition-colors"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {searchTerm && (
            <div className="text-sm text-slate-400 bg-slate-700 px-3 py-1 rounded-lg">
              {filteredAssignments.length} result{filteredAssignments.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden flex flex-col h-[85vh]">
        <div className="flex-1">
          <VirtualizedTable
            data={paginatedAssignments}
            columns={tableColumns}
            height={600}
            itemHeight={60}
            className="w-full"
          />
        </div>
        
        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-4 bg-gradient-to-r from-slate-800 to-slate-700 border-t border-slate-600">
          <div className="text-sm text-slate-300">
            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredAssignments.length)} of {filteredAssignments.length} results
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-3 py-2 text-slate-300">
              Page {currentPage} of {Math.ceil(filteredAssignments.length / itemsPerPage)}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredAssignments.length / itemsPerPage), prev + 1))}
              disabled={currentPage >= Math.ceil(filteredAssignments.length / itemsPerPage)}
              className="px-3 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Modal content remains the same but with optimized rendering */}
      {showModal && selectedTest && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 w-full max-w-7xl h-[95vh] flex flex-col shadow-2xl border border-slate-700">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h3 className="text-2xl font-bold text-white bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                {selectedTest.title} - Details
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-lg transition-all duration-300 hover:scale-105 transform shadow-md hover:shadow-lg"
              >
                <span className="text-lg">←</span>
                <span className="font-semibold">Back</span>
              </button>
            </div>

            {/* Stats cards */}
            <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4 flex-shrink-0">
              <div className="bg-slate-700 p-6 rounded-lg shadow-md hover:shadow-lg hover:scale-105 transition-transform duration-300 cursor-pointer flex flex-col items-center justify-center">
                <div className="text-slate-300 text-sm uppercase tracking-wide font-semibold mb-2">Students Assigned</div>
                <div className="text-4xl font-extrabold text-white">
                  {assignments.filter(a => a.testId?._id === selectedTest._id).length}
                </div>
              </div>
              <div className="bg-slate-700 p-6 rounded-lg shadow-md hover:shadow-lg hover:scale-105 transition-transform duration-300 cursor-pointer flex flex-col items-center justify-center">
                <div className="text-slate-300 text-sm uppercase tracking-wide font-semibold mb-2">Students Submitted</div>
                <div className="text-4xl font-extrabold text-white">
                  {assignments.filter(a => a.testId?._id === selectedTest._id && a.status === "Completed").length}
                </div>
              </div>
              <div className="bg-slate-700 p-6 rounded-lg shadow-md hover:shadow-lg hover:scale-105 transition-transform duration-300 cursor-pointer flex flex-col items-center justify-center">
                <div className="text-slate-300 text-sm uppercase tracking-wide font-semibold mb-2">Students Not Submitted</div>
                <div className="text-4xl font-extrabold text-white">
                  {assignments.filter(a => a.testId?._id === selectedTest._id && a.status !== "Completed").length}
                </div>
              </div>
            </div>

            {/* Student submissions table */}
            <div className="bg-slate-800 rounded-xl p-4 shadow-lg flex flex-col flex-1 min-h-0">
              <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <h4 className="text-lg font-semibold text-white flex items-center">
                  <div className="w-2 h-2 bg-purple-400 rounded-full mr-3"></div>
                  Submitted Students
                </h4>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search students..."
                      value={studentSearchTerm}
                      onChange={(e) => setStudentSearchTerm(e.target.value)}
                      className="block w-64 pl-9 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm"
                    />
                  </div>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                      showFilters 
                        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
                    </svg>
                    Filters
                  </button>
                </div>
              </div>

              {/* Filter controls */}
              {showFilters && (
                <div className="mb-4 p-3 bg-slate-700 rounded-lg border border-slate-600 flex-shrink-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 text-sm font-medium mb-2">Sort by Score</label>
                      <select
                        value={scoreSort}
                        onChange={(e) => setScoreSort(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="none">No Sorting</option>
                        <option value="increasing">Increasing (Low to High)</option>
                        <option value="decreasing">Decreasing (High to Low)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-300 text-sm font-medium mb-2">Sort by Test Duration</label>
                      <select
                        value={submissionTimeSort}
                        onChange={(e) => setSubmissionTimeSort(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="none">No Sorting</option>
                        <option value="increasing">Fastest First</option>
                        <option value="decreasing">Slowest First</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-0">
                <VirtualizedTable
                  data={paginatedStudents}
                  columns={studentTableColumns}
                  height={400}
                  itemHeight={50}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
