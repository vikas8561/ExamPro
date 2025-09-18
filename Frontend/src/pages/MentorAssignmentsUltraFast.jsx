import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import StatusPill from "../components/StatusPill";
import { useApiCache } from "../hooks/useApiCache";
import { useDebounce } from "../hooks/useDebounce";

export default function MentorAssignmentsUltraFast() {
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
  const [testDetails, setTestDetails] = useState({});
  const [loadingTestDetails, setLoadingTestDetails] = useState(false);
  
  const itemsPerPage = 20;
  const navigate = useNavigate();

  // Debounce search terms
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const debouncedStudentSearchTerm = useDebounce(studentSearchTerm, 300);

  // Use cached API calls with 1-minute cache
  const { data: assignments = [], loading, error, invalidateCache } = useApiCache(
    'mentorAssignmentsFast',
    async () => {
      const token = localStorage.getItem('token');
      const response = await fetch("https://cg-test-app.onrender.com/api/mentor/assignments", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    { staleTime: 60000 } // 1 minute cache
  );

  // Load test details on demand
  const loadTestDetails = useCallback(async (assignmentId) => {
    if (testDetails[assignmentId]) return testDetails[assignmentId];
    
    setLoadingTestDetails(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`https://cg-test-app.onrender.com/api/mentor/assignments/${assignmentId}/test-details`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      setTestDetails(prev => ({ ...prev, [assignmentId]: data }));
      return data;
    } catch (error) {
      console.error('Error loading test details:', error);
      return null;
    } finally {
      setLoadingTestDetails(false);
    }
  }, [testDetails]);

  // Memoized filtered assignments
  const filteredAssignments = useMemo(() => {
    let filtered = [...assignments];

    // Apply search filter
    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase();
      filtered = filtered.filter(assignment => 
        assignment.testId?.title?.toLowerCase().includes(searchLower) ||
        assignment.testId?.type?.toLowerCase().includes(searchLower) ||
        assignment.userId?.name?.toLowerCase().includes(searchLower) ||
        assignment.userId?.email?.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    if (scoreSort !== 'none') {
      filtered.sort((a, b) => {
        const scoreA = a.score || a.autoScore || 0;
        const scoreB = b.score || b.autoScore || 0;
        return scoreSort === 'asc' ? scoreA - scoreB : scoreB - scoreA;
      });
    }

    if (submissionTimeSort !== 'none') {
      filtered.sort((a, b) => {
        const timeA = new Date(a.submittedAt || 0).getTime();
        const timeB = new Date(b.submittedAt || 0).getTime();
        return submissionTimeSort === 'asc' ? timeA - timeB : timeB - timeA;
      });
    }

    return filtered;
  }, [assignments, debouncedSearchTerm, scoreSort, submissionTimeSort]);

  // Pagination
  const totalPages = Math.ceil(filteredAssignments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentAssignments = filteredAssignments.slice(startIndex, endIndex);

  // Get filtered students based on selected section
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

  const getSectionTitle = () => {
    if (!selectedTest || !selectedSection) return '';
    
    const baseTitle = selectedTest.title;
    switch (selectedSection) {
      case 'assigned': return `${baseTitle} - All Assigned Students`;
      case 'submitted': return `${baseTitle} - Submitted Students`;
      case 'notSubmitted': return `${baseTitle} - Not Submitted Students`;
      default: return baseTitle;
    }
  };

  const handleViewTest = async (assignment) => {
    setSelectedTest(assignment);
    
    // Load test details on demand
    if (assignment.testId && !testDetails[assignment._id]) {
      await loadTestDetails(assignment._id);
    }
    
    setShowModal(true);
  };

  const handleViewStudents = (assignment) => {
    setSelectedTest(assignment);
    setSelectedSection('assigned');
    setShowStudentListModal(true);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not submitted';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getScoreDisplay = (assignment) => {
    const score = assignment.score || assignment.autoScore;
    if (score === null || score === undefined) return 'Not scored';
    return `${score}%`;
  };

  const getScoreColor = (assignment) => {
    const score = assignment.score || assignment.autoScore;
    if (score === null || score === undefined) return 'text-slate-400';
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading assignments...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-400">Error loading assignments: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-white">Test Assignments</h1>
          <div className="flex gap-4">
            <button
              onClick={() => invalidateCache()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-slate-800 p-4 rounded-lg mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Search
                </label>
                <input
                  type="text"
                  placeholder="Search by test, student, or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Sort by Score
                </label>
                <select
                  value={scoreSort}
                  onChange={(e) => setScoreSort(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="none">No sorting</option>
                  <option value="asc">Low to High</option>
                  <option value="desc">High to Low</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Sort by Submission Time
                </label>
                <select
                  value={submissionTimeSort}
                  onChange={(e) => setSubmissionTimeSort(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="none">No sorting</option>
                  <option value="asc">Oldest First</option>
                  <option value="desc">Newest First</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800 p-4 rounded-lg">
            <div className="text-2xl font-bold text-white">{assignments.length}</div>
            <div className="text-slate-400">Total Assignments</div>
          </div>
          <div className="bg-slate-800 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-400">
              {assignments.filter(a => a.status === 'Completed').length}
            </div>
            <div className="text-slate-400">Completed</div>
          </div>
          <div className="bg-slate-800 p-4 rounded-lg">
            <div className="text-2xl font-bold text-yellow-400">
              {assignments.filter(a => a.status === 'In Progress').length}
            </div>
            <div className="text-slate-400">In Progress</div>
          </div>
          <div className="bg-slate-800 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-400">
              {assignments.filter(a => a.status === 'Pending').length}
            </div>
            <div className="text-slate-400">Pending</div>
          </div>
        </div>

        {/* Assignments Table */}
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Test
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Student
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Submitted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {currentAssignments.map((assignment) => (
                  <tr key={assignment._id} className="hover:bg-slate-700 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">
                        {assignment.testId?.title || 'Unknown Test'}
                      </div>
                      <div className="text-sm text-slate-400">
                        {assignment.testId?.type || 'Unknown Type'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">
                        {assignment.userId?.name || 'Unknown Student'}
                      </div>
                      <div className="text-sm text-slate-400">
                        {assignment.userId?.email || 'No email'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusPill status={assignment.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${getScoreColor(assignment)}`}>
                        {getScoreDisplay(assignment)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      {formatDate(assignment.submittedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewTest(assignment)}
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          View Test
                        </button>
                        <button
                          onClick={() => handleViewStudents(assignment)}
                          className="text-green-400 hover:text-green-300 transition-colors"
                        >
                          View Students
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center mt-6 gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 bg-slate-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 transition-colors"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-slate-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 bg-slate-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {/* Test Details Modal */}
        {showModal && selectedTest && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">
                  {selectedTest.testId?.title || 'Test Details'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              
              {loadingTestDetails ? (
                <div className="text-slate-400">Loading test details...</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Type</label>
                      <div className="text-white">{selectedTest.testId?.type || 'N/A'}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Time Limit</label>
                      <div className="text-white">{selectedTest.testId?.timeLimit || 'N/A'} minutes</div>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Instructions</label>
                    <div className="text-white bg-slate-700 p-3 rounded-lg">
                      {selectedTest.testId?.instructions || 'No instructions provided'}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300">Questions</label>
                    <div className="text-white">
                      {testDetails[selectedTest._id]?.questions?.length || 0} questions
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Student List Modal */}
        {showStudentListModal && selectedTest && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white">
                  {getSectionTitle()}
                </h2>
                <button
                  onClick={() => setShowStudentListModal(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                {getFilteredStudents().map((assignment) => (
                  <div key={assignment._id} className="bg-slate-700 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-white font-medium">
                          {assignment.userId?.name || 'Unknown Student'}
                        </div>
                        <div className="text-slate-400 text-sm">
                          {assignment.userId?.email || 'No email'}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <StatusPill status={assignment.status} />
                        <span className={`text-sm font-medium ${getScoreColor(assignment)}`}>
                          {getScoreDisplay(assignment)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
