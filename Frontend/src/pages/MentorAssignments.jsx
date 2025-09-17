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
  const [submissionTimeFilter, setSubmissionTimeFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
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

    // Apply submission time filter
    if (submissionTimeFilter !== 'all') {
      const now = new Date();
      submittedStudents = submittedStudents.filter(assignment => {
        if (!assignment.submittedAt) return false;
        const submissionDate = new Date(assignment.submittedAt);
        const timeDiff = now - submissionDate;
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

        switch (submissionTimeFilter) {
          case 'today':
            return daysDiff < 1;
          case 'week':
            return daysDiff < 7;
          case 'month':
            return daysDiff < 30;
          case 'older':
            return daysDiff >= 30;
          default:
            return true;
        }
      });
    }

    return submittedStudents;
  };

  // Function to reset filters
  const resetFilters = () => {
    setScoreSort('none');
    setSubmissionTimeFilter('all');
    setShowFilters(false);
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold mb-6">Test Assignments</h2>

      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="h-[80vh] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-slate-800 sticky top-0">
              <tr className="text-left text-slate-300 border-b border-slate-700">
                <th className="p-4">Test Name</th>
                <th className="p-4">Test Date</th>
                <th className="p-4">View Details</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(new Map(assignments.map(a => [a.testId?._id, a])).values()).map((assignment) => (
                <tr key={assignment._id} className="border-b border-slate-700 hover:bg-slate-700 transition-colors duration-200">
                  <td className="p-4 text-slate-200 font-medium">{assignment.testId?.title || "Unknown Test"}</td>
                  <td className="p-4 text-slate-300">{assignment.createdAt ? new Date(assignment.createdAt).toLocaleDateString() : "N/A"}</td>
                  <td className="p-4">
                    <button
                    onClick={() => {
                      setSelectedTest(assignment.testId);
                      setShowModal(true);
                      resetFilters(); // Reset filters when opening a new test
                    }}
                    className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
                  >
                    View Details
                  </button>
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td
                    colSpan="3"
                    className="p-4 text-center text-slate-400"
                  >
                    No assignments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && selectedTest && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-8 w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-700 transform scale-100 animate-modal-appear">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-3xl font-bold text-white bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
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

            <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
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

            <div className="bg-slate-800 rounded-xl p-6 shadow-lg">
              <div className="flex justify-between items-center mb-6">
                <h4 className="text-xl font-semibold text-white flex items-center">
                  <div className="w-2 h-2 bg-purple-400 rounded-full mr-3"></div>
                  Submitted Students
                </h4>
                <div className="flex items-center gap-3">
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
                    {(scoreSort !== 'none' || submissionTimeFilter !== 'all') && (
                      <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1">
                        {(scoreSort !== 'none' ? 1 : 0) + (submissionTimeFilter !== 'all' ? 1 : 0)}
                      </span>
                    )}
                  </button>
                  {(scoreSort !== 'none' || submissionTimeFilter !== 'all') && (
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
                <div className="mb-6 p-4 bg-slate-700 rounded-lg border border-slate-600">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Score Sort */}
                    <div>
                      <label className="block text-slate-300 text-sm font-medium mb-2">
                        Sort by Score
                      </label>
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

                    {/* Submission Time Filter */}
                    <div>
                      <label className="block text-slate-300 text-sm font-medium mb-2">
                        Filter by Submission Time
                      </label>
                      <select
                        value={submissionTimeFilter}
                        onChange={(e) => setSubmissionTimeFilter(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                        <option value="older">Older than 1 Month</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Filter Results Summary */}
              <div className="mb-4 p-3 bg-slate-700 rounded-lg">
                <p className="text-slate-300 text-sm">
                  Showing <span className="font-semibold text-white">{getFilteredSubmittedStudents().length}</span> of{' '}
                  <span className="font-semibold text-white">
                    {assignments.filter(a => a.testId?._id === selectedTest._id && a.status === "Completed").length}
                  </span> submitted students
                  {(scoreSort !== 'none' || submissionTimeFilter !== 'all') && (
                    <span className="text-blue-400 ml-2">(filtered/sorted)</span>
                  )}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700">
                    <tr className="text-left text-slate-300 border-b border-slate-600">
                  <th className="p-4 font-semibold">Student Name</th>
                  <th className="p-4 font-semibold">Start Time</th>
                  <th className="p-4 font-semibold">End Time</th>
                  <th className="p-4 font-semibold">Score</th>
                  <th className="p-4 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody>
              {getFilteredSubmittedStudents().map((assignment) => (
                <tr key={assignment._id} className="border-b border-slate-600 hover:bg-slate-700 transition-colors duration-200">
                  <td className="p-4 text-slate-200 font-medium">{assignment.userId?.name || "Unknown"}</td>
                  <td className="p-4 text-slate-200 font-medium">{assignment.startTime ? new Date(assignment.startTime).toLocaleString() : "N/A"}</td>
                  <td className="p-4 text-slate-200 font-medium">{assignment.deadline ? new Date(assignment.deadline).toLocaleString() : "N/A"}</td>
                  <td className="p-4 text-slate-200 font-medium">{assignment.score !== undefined ? assignment.score : "N/A"}</td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => navigate(`/mentor/view-test/${assignment._id}`)}
                      className="bg-white text-black px-4 py-2 rounded-lg hover:bg-gray-100 transition-all duration-300 shadow-md hover:shadow-lg transform hover:scale-105 font-semibold"
                    >
                      View Submissions
                    </button>
                  </td>
                </tr>
              ))}
                {getFilteredSubmittedStudents().length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-slate-400">
                      <div className="text-2xl mb-2">
                        {(scoreSort !== 'none' || submissionTimeFilter !== 'all') ? '🔍' : '📝'}
                      </div>
                      {(scoreSort !== 'none' || submissionTimeFilter !== 'all') 
                        ? 'No submissions match the current filters.' 
                        : 'No submissions yet.'
                      }
                    </td>
                  </tr>
                )}
              </tbody>
                </table>
              </div>
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
