import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusPill from "../components/StatusPill";

export default function MentorAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
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
  const itemsPerPage = 10;
  const navigate = useNavigate();

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch("https://cg-test-app.onrender.com/api/mentor/assignments", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      // Map score from assignment to each assignment object for frontend use
      const assignmentsWithScore = Array.isArray(data) ? data.map(a => ({
        ...a,
        score: a.score !== undefined && a.score !== null ? a.score : (a.autoScore !== undefined && a.autoScore !== null ? a.autoScore : null)
      })) : [];
      
      // Debug logging
      console.log('Assignments data:', assignmentsWithScore);
      console.log('Sample assignment with submission data:', assignmentsWithScore.find(a => a.status === 'Completed'));
      
      setAssignments(assignmentsWithScore);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  // Function to get filtered students based on selected section
  const getFilteredStudents = () => {
    if (!selectedTest || !selectedSection) return [];
    
    const testAssignments = assignments.filter(a => a.testId?._id === selectedTest._id);
    
    switch (selectedSection) {
      case 'assigned':
        return testAssignments;
      case 'submitted':
        return testAssignments.filter(a => a.status === "Completed");
      case 'notSubmitted':
        return testAssignments.filter(a => a.status !== "Completed");
      default:
        return [];
    }
  };

  // Function to get section title
  const getSectionTitle = () => {
    switch (selectedSection) {
      case 'assigned':
        return 'Students Assigned';
      case 'submitted':
        return 'Students Submitted';
      case 'notSubmitted':
        return 'Students Not Submitted';
      default:
        return 'Students';
    }
  };

  // Function to filter submitted students based on score and submission time
  const getFilteredSubmittedStudents = () => {
    if (!selectedTest) return [];
    
    let submittedStudents = assignments.filter(a => 
      a.testId?._id === selectedTest._id && a.status === "Completed"
    );

         // Apply student search filter
         if (studentSearchTerm.trim()) {
           const searchLower = studentSearchTerm.toLowerCase();
           submittedStudents = submittedStudents.filter(assignment => 
             (assignment.userId?.name || '').toLowerCase().includes(searchLower) ||
             (assignment.userId?.email || '').toLowerCase().includes(searchLower) ||
             (assignment.startedAt ? new Date(assignment.startedAt).toLocaleString() : '').toLowerCase().includes(searchLower) ||
             (assignment.submittedAt ? new Date(assignment.submittedAt).toLocaleString() : '').toLowerCase().includes(searchLower) ||
             (assignment.completedAt ? new Date(assignment.completedAt).toLocaleString() : '').toLowerCase().includes(searchLower) ||
             (assignment.score !== undefined ? assignment.score.toString() : '').includes(searchLower)
           );
         }

    // Apply score sorting
    if (scoreSort !== 'none') {
      submittedStudents = [...submittedStudents].sort((a, b) => {
        const scoreA = a.score !== undefined ? a.score : 0;
        const scoreB = b.score !== undefined ? b.score : 0;
        
        if (scoreSort === 'increasing') {
          return scoreA - scoreB;
        } else if (scoreSort === 'decreasing') {
          return scoreB - scoreA;
        }
        return 0;
      });
    }

    // Apply submission time sorting (duration: end time - start time)
    if (submissionTimeSort !== 'none') {
      submittedStudents = [...submittedStudents].sort((a, b) => {
        // Calculate duration for assignment a
        const startTimeA = a.startedAt ? new Date(a.startedAt) : null;
        const endTimeA = a.submittedAt ? new Date(a.submittedAt) : (a.completedAt ? new Date(a.completedAt) : null);
        const durationA = (startTimeA && endTimeA) ? (endTimeA - startTimeA) : 0;

        // Calculate duration for assignment b
        const startTimeB = b.startedAt ? new Date(b.startedAt) : null;
        const endTimeB = b.submittedAt ? new Date(b.submittedAt) : (b.completedAt ? new Date(b.completedAt) : null);
        const durationB = (startTimeB && endTimeB) ? (endTimeB - startTimeB) : 0;

        if (submissionTimeSort === 'increasing') {
          return durationA - durationB;
        } else if (submissionTimeSort === 'decreasing') {
          return durationB - durationA;
        }
        return 0;
      });
    }

    return submittedStudents;
  };

  // Function to calculate test duration
  const getTestDuration = (assignment) => {
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
  };

  // Function to reset filters
  const resetFilters = () => {
    setScoreSort('none');
    setSubmissionTimeSort('none');
    setShowFilters(false);
    setStudentsCurrentPage(1);
    setStudentSearchTerm('');
  };

  // Pagination functions
  const getFilteredAssignments = () => {
    const uniqueAssignments = Array.from(new Map(assignments.map(a => [a.testId?._id, a])).values());
    
    if (!searchTerm.trim()) {
      return uniqueAssignments;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return uniqueAssignments.filter(assignment => 
      (assignment.testId?.title || '').toLowerCase().includes(searchLower) ||
      (assignment.testId?.subject || '').toLowerCase().includes(searchLower) ||
      (assignment.testId?.type || '').toLowerCase().includes(searchLower) ||
      (assignment.createdAt ? new Date(assignment.createdAt).toLocaleDateString() : '').includes(searchLower)
    );
  };

  const getPaginatedAssignments = () => {
    const filteredAssignments = getFilteredAssignments();
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredAssignments.slice(startIndex, endIndex);
  };

  const getPaginatedStudents = () => {
    const filteredStudents = getFilteredSubmittedStudents();
    const startIndex = (studentsCurrentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredStudents.slice(startIndex, endIndex);
  };

  const getTotalPages = (totalItems) => {
    return Math.ceil(totalItems / itemsPerPage);
  };

  const getUniqueAssignmentsCount = () => {
    return getFilteredAssignments().length;
  };

  // Reset pagination when filters change
  const handleFilterChange = () => {
    setStudentsCurrentPage(1);
  };

  // Handle search changes
  const handleSearchChange = (value) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page when searching
  };

  // Handle student search changes
  const handleStudentSearchChange = (value) => {
    setStudentSearchTerm(value);
    setStudentsCurrentPage(1); // Reset to first page when searching
  };

  // Keyboard navigation for pagination
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'ArrowLeft' && currentPage > 1) {
          e.preventDefault();
          setCurrentPage(currentPage - 1);
        } else if (e.key === 'ArrowRight' && currentPage < getTotalPages(getUniqueAssignmentsCount())) {
          e.preventDefault();
          setCurrentPage(currentPage + 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentPage, getUniqueAssignmentsCount]);

  // Smooth scroll to top when page changes
  const handlePageChange = (newPage, isStudentsTable = false) => {
    if (isStudentsTable) {
      setStudentsCurrentPage(newPage);
    } else {
      setCurrentPage(newPage);
    }
    
    // Smooth scroll to top of table
    setTimeout(() => {
      const tableContainer = document.querySelector('.overflow-y-auto, .overflow-auto');
      if (tableContainer) {
        tableContainer.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 100);
  };

  // Enhanced Pagination Component
  const Pagination = ({ currentPage, totalPages, onPageChange, totalItems, itemsPerPage }) => {
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    const getPageNumbers = () => {
      const pages = [];
      const maxVisiblePages = 5;
      
      if (totalPages <= maxVisiblePages) {
        for (let i = 1; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        if (currentPage <= 3) {
          for (let i = 1; i <= 4; i++) {
            pages.push(i);
          }
          pages.push('...');
          pages.push(totalPages);
        } else if (currentPage >= totalPages - 2) {
          pages.push(1);
          pages.push('...');
          for (let i = totalPages - 3; i <= totalPages; i++) {
            pages.push(i);
          }
        } else {
          pages.push(1);
          pages.push('...');
          for (let i = currentPage - 1; i <= currentPage + 1; i++) {
            pages.push(i);
          }
          pages.push('...');
          pages.push(totalPages);
        }
      }
      
      return pages;
    };

    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between px-4 py-4 bg-gradient-to-r from-slate-800 to-slate-700 border-t border-slate-600 shadow-lg">
        <div className="flex items-center space-x-4">
          <div className="text-sm text-slate-300 font-medium">
            Showing <span className="text-blue-400 font-bold">{startItem}</span> to <span className="text-blue-400 font-bold">{endItem}</span> of <span className="text-white font-bold">{totalItems}</span> results
          </div>
          <div className="text-xs text-slate-400">
            Page {currentPage} of {totalPages}
          </div>
          <div className="text-xs text-slate-500 bg-slate-600 px-2 py-1 rounded">
            Ctrl + ← → to navigate
          </div>
        </div>
        
        <div className="flex items-center space-x-1">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="flex items-center px-3 py-2 text-sm bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>
          
          <div className="flex items-center space-x-1 mx-2">
            {getPageNumbers().map((page, index) => (
              <button
                key={index}
                onClick={() => typeof page === 'number' && onPageChange(page)}
                disabled={page === '...'}
                className={`px-3 py-2 text-sm rounded-lg transition-all duration-200 font-medium ${
                  page === currentPage
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg transform scale-105'
                    : page === '...'
                    ? 'text-slate-400 cursor-default px-2'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
          
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="flex items-center px-3 py-2 text-sm bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
          >
            Next
            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
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
              onChange={(e) => handleSearchChange(e.target.value)}
              className="block w-80 pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
            {searchTerm && (
              <button
                onClick={() => handleSearchChange('')}
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
              {getUniqueAssignmentsCount()} result{getUniqueAssignmentsCount() !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden flex flex-col h-[85vh]">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-800 to-slate-700 sticky top-0 shadow-lg">
              <tr className="text-left text-slate-200 border-b border-slate-600">
                <th className="p-4 font-semibold text-sm uppercase tracking-wide">Test Name</th>
                <th className="p-4 font-semibold text-sm uppercase tracking-wide">Test Date</th>
                <th className="p-4 font-semibold text-sm uppercase tracking-wide text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {getPaginatedAssignments().map((assignment) => (
                <tr key={assignment._id} className="border-b border-slate-700 hover:bg-slate-700 transition-colors duration-200">
                  <td className="p-4 text-slate-200 font-medium">{assignment.testId?.title || "Unknown Test"}</td>
                  <td className="p-4 text-slate-300">{assignment.createdAt ? new Date(assignment.createdAt).toLocaleDateString() : "N/A"}</td>
                  <td className="p-4 text-center">
                    <button
                    onClick={() => {
                      setSelectedTest(assignment.testId);
                      setShowModal(true);
                      resetFilters(); // Reset filters when opening a new test
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
                  </td>
                </tr>
              ))}
              {getUniqueAssignmentsCount() === 0 && (
                <tr>
                  <td
                    colSpan="3"
                    className="p-8 text-center text-slate-400"
                  >
                    <div className="text-4xl mb-3">
                      {searchTerm ? '🔍' : '📝'}
                    </div>
                    <div className="text-lg font-medium mb-2">
                      {searchTerm ? 'No assignments found' : 'No assignments available'}
                    </div>
                    <div className="text-sm">
                      {searchTerm 
                        ? `No test assignments match "${searchTerm}". Try a different search term.`
                        : 'There are no test assignments to display at the moment.'
                      }
                    </div>
                    {searchTerm && (
                      <button
                        onClick={() => handleSearchChange('')}
                        className="mt-3 text-blue-400 hover:text-blue-300 underline transition-colors"
                      >
                        Clear search
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex-shrink-0">
          <Pagination
            currentPage={currentPage}
            totalPages={getTotalPages(getUniqueAssignmentsCount())}
            onPageChange={(page) => handlePageChange(page, false)}
            totalItems={getUniqueAssignmentsCount()}
            itemsPerPage={itemsPerPage}
          />
        </div>
      </div>

      {showModal && selectedTest && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 w-full max-w-7xl h-[95vh] flex flex-col shadow-2xl border border-slate-700 transform scale-100 animate-modal-appear">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h3 className="text-2xl font-bold text-white bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                {selectedTest.title} - Details
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-lg transition-all duration-300 hover:scale-105 transform shadow-md hover:shadow-lg"
                aria-label="Close modal"
              >
                <span className="text-lg">←</span>
                <span className="font-semibold">Back</span>
              </button>
            </div>

            <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4 flex-shrink-0">
              <div 
                onClick={() => {
                  setSelectedSection('assigned');
                  setShowStudentListModal(true);
                }}
                className="bg-slate-700 p-6 rounded-lg shadow-md hover:shadow-lg hover:scale-105 transition-transform duration-300 cursor-pointer flex flex-col items-center justify-center"
              >
                <div className="text-slate-300 text-sm uppercase tracking-wide font-semibold mb-2">Students Assigned</div>
                <div className="text-4xl font-extrabold text-white">
                  {assignments.filter(a => a.testId?._id === selectedTest._id).length}
                </div>
              </div>
              <div 
                onClick={() => {
                  setSelectedSection('submitted');
                  setShowStudentListModal(true);
                }}
                className="bg-slate-700 p-6 rounded-lg shadow-md hover:shadow-lg hover:scale-105 transition-transform duration-300 cursor-pointer flex flex-col items-center justify-center"
              >
                <div className="text-slate-300 text-sm uppercase tracking-wide font-semibold mb-2">Students Submitted</div>
                <div className="text-4xl font-extrabold text-white">
                  {assignments.filter(a => a.testId?._id === selectedTest._id && a.status === "Completed").length}
                </div>
              </div>
              <div 
                onClick={() => {
                  setSelectedSection('notSubmitted');
                  setShowStudentListModal(true);
                }}
                className="bg-slate-700 p-6 rounded-lg shadow-md hover:shadow-lg hover:scale-105 transition-transform duration-300 cursor-pointer flex flex-col items-center justify-center"
              >
                <div className="text-slate-300 text-sm uppercase tracking-wide font-semibold mb-2">Students Not Submitted</div>
                <div className="text-4xl font-extrabold text-white">
                  {assignments.filter(a => a.testId?._id === selectedTest._id && a.status !== "Completed").length}
                </div>
              </div>
            </div>

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
                      onChange={(e) => handleStudentSearchChange(e.target.value)}
                      className="block w-64 pl-9 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm"
                    />
                    {studentSearchTerm && (
                      <button
                        onClick={() => handleStudentSearchChange('')}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {studentSearchTerm && (
                    <div className="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">
                      {getFilteredSubmittedStudents().length} result{getFilteredSubmittedStudents().length !== 1 ? 's' : ''}
                    </div>
                  )}
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
                    {(scoreSort !== 'none' || submissionTimeSort !== 'none') && (
                      <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1">
                        {(scoreSort !== 'none' ? 1 : 0) + (submissionTimeSort !== 'none' ? 1 : 0)}
                      </span>
                    )}
                  </button>
                  {(scoreSort !== 'none' || submissionTimeSort !== 'none') && (
                    <button
                      onClick={resetFilters}
                      className="text-slate-400 hover:text-white text-sm underline transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Collapsible Filter Controls */}
              {showFilters && (
                <div className="mb-4 p-3 bg-slate-700 rounded-lg border border-slate-600 flex-shrink-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Score Sort */}
                    <div>
                      <label className="block text-slate-300 text-sm font-medium mb-2">
                        Sort by Score
                      </label>
                      <select
                        value={scoreSort}
                        onChange={(e) => {
                          setScoreSort(e.target.value);
                          handleFilterChange();
                        }}
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="none">No Sorting</option>
                        <option value="increasing">Increasing (Low to High)</option>
                        <option value="decreasing">Decreasing (High to Low)</option>
                      </select>
                    </div>

                    {/* Submission Time Sort */}
                    <div>
                      <label className="block text-slate-300 text-sm font-medium mb-2">
                        Sort by Test Duration (End Time - Start Time)
                      </label>
                      <select
                        value={submissionTimeSort}
                        onChange={(e) => {
                          setSubmissionTimeSort(e.target.value);
                          handleFilterChange();
                        }}
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

              {/* Filter Results Summary */}
              <div className="mb-3 p-2 bg-slate-700 rounded-lg flex-shrink-0">
                <p className="text-slate-300 text-sm">
                  Showing <span className="font-semibold text-white">{getFilteredSubmittedStudents().length}</span> of{' '}
                  <span className="font-semibold text-white">
                    {assignments.filter(a => a.testId?._id === selectedTest._id && a.status === "Completed").length}
                  </span> submitted students
                  {(scoreSort !== 'none' || submissionTimeSort !== 'none' || studentSearchTerm.trim()) && (
                    <span className="text-blue-400 ml-2">
                      ({[
                        studentSearchTerm.trim() && 'searched',
                        scoreSort !== 'none' && 'score sorted',
                        submissionTimeSort !== 'none' && 'duration sorted'
                      ].filter(Boolean).join(', ')})
                    </span>
                  )}
                </p>
              </div>
              <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-slate-700 to-slate-600 sticky top-0 shadow-lg">
                    <tr className="text-left text-slate-200 border-b border-slate-500">
                  <th className="p-3 font-semibold text-sm uppercase tracking-wide">Student Name</th>
                  <th className="p-3 font-semibold text-sm uppercase tracking-wide">Start Time</th>
                  <th className="p-3 font-semibold text-sm uppercase tracking-wide">End Time</th>
                  <th className="p-3 font-semibold text-sm uppercase tracking-wide">Duration</th>
                  <th className="p-3 font-semibold text-sm uppercase tracking-wide">Score</th>
                  <th className="p-3 font-semibold text-sm uppercase tracking-wide text-center">Action</th>
                </tr>
              </thead>
              <tbody>
              {getPaginatedStudents().map((assignment) => (
                <tr key={assignment._id} className="border-b border-slate-600 hover:bg-slate-700 transition-colors duration-200">
                  <td className="p-3 text-slate-200 font-medium">{assignment.userId?.name || "Unknown"}</td>
                        <td className="p-3 text-slate-200 font-medium text-sm">{assignment.startedAt ? new Date(assignment.startedAt).toLocaleString() : "N/A"}</td>
                        <td className="p-3 text-slate-200 font-medium text-sm">
                          {assignment.submittedAt ? new Date(assignment.submittedAt).toLocaleString() : 
                           assignment.completedAt ? new Date(assignment.completedAt).toLocaleString() : "N/A"}
                        </td>
                        <td className="p-3 text-slate-200 font-medium text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            getTestDuration(assignment) ? 'bg-blue-900 text-blue-300' : 'bg-gray-900 text-gray-300'
                          }`}>
                            {getTestDuration(assignment) || "N/A"}
                          </span>
                        </td>
                  <td className="p-3 text-slate-200 font-medium">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      assignment.score >= 80 ? 'bg-green-900 text-green-300' :
                      assignment.score >= 60 ? 'bg-yellow-900 text-yellow-300' :
                      assignment.score >= 40 ? 'bg-orange-900 text-orange-300' :
                      'bg-red-900 text-red-300'
                    }`}>
                      {assignment.score !== undefined ? assignment.score : "N/A"}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => navigate(`/mentor/view-test/${assignment._id}`)}
                      className="bg-white text-black px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-105 font-semibold text-sm"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
                {getFilteredSubmittedStudents().length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-6 text-center text-slate-400">
                      <div className="text-xl mb-2">
                        {(scoreSort !== 'none' || submissionTimeFilter !== 'all' || studentSearchTerm.trim()) ? '🔍' : '📝'}
                      </div>
                      <div className="text-sm">
                        {studentSearchTerm.trim() 
                          ? `No students match "${studentSearchTerm}". Try a different search term.`
                          : (scoreSort !== 'none' || submissionTimeFilter !== 'all') 
                            ? 'No submissions match the current filters.' 
                            : 'No submissions yet.'
                        }
                      </div>
                      {(studentSearchTerm.trim() || scoreSort !== 'none' || submissionTimeFilter !== 'all') && (
                        <button
                          onClick={resetFilters}
                          className="mt-3 text-blue-400 hover:text-blue-300 underline transition-colors text-sm"
                        >
                          Clear all filters
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
                </table>
              </div>
              <Pagination
                currentPage={studentsCurrentPage}
                totalPages={getTotalPages(getFilteredSubmittedStudents().length)}
                onPageChange={(page) => handlePageChange(page, true)}
                totalItems={getFilteredSubmittedStudents().length}
                itemsPerPage={itemsPerPage}
              />
            </div>
          </div>
        </div>
      )}

      {/* Student List Modal */}
      {showStudentListModal && selectedSection && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-700 transform scale-100 animate-modal-appear">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-3xl font-bold text-white bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                {getSectionTitle()}
              </h3>
              <button
                onClick={() => setShowStudentListModal(false)}
                className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-lg transition-all duration-300 hover:scale-105 transform shadow-md hover:shadow-lg"
                aria-label="Close modal"
              >
                <span className="text-lg">←</span>
                <span className="font-semibold">Back</span>
              </button>
            </div>

            <div className="bg-slate-800 rounded-xl p-6 shadow-lg">
              <div className="mb-4">
                <p className="text-slate-300 text-sm">
                  Total: <span className="font-semibold text-white">{getFilteredStudents().length}</span> students
                </p>
              </div>
              
              <div className="max-h-96 overflow-y-auto">
                {getFilteredStudents().length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {getFilteredStudents().map((assignment, index) => (
                      <div 
                        key={assignment._id} 
                        className="bg-slate-700 p-4 rounded-lg hover:bg-slate-600 transition-colors duration-200 border border-slate-600"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                            {assignment.userId?.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">
                              {assignment.userId?.name || "Unknown Student"}
                            </p>
                            <p className="text-slate-400 text-sm">
                              {assignment.userId?.email || "No email"}
                            </p>
                            {selectedSection === 'submitted' && (
                              <p className="text-green-400 text-sm font-medium">
                                Score: {assignment.score !== undefined ? assignment.score : "N/A"}
                              </p>
                            )}
                            {selectedSection === 'notSubmitted' && (
                              <p className="text-yellow-400 text-sm font-medium">
                                Status: {assignment.status}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">📝</div>
                    <p className="text-slate-400 text-lg">No students found in this section.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
