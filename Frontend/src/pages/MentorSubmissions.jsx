import React, { useEffect, useState } from "react";
import apiRequest from "../services/api";

const MentorSubmissions = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [expandedStudents, setExpandedStudents] = useState(new Set());

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async (page = 1) => {
    try {
      const data = await apiRequest(`/mentor/submissions?page=${page}&limit=50`);
      // Handle both old format (array) and new format (object with students array)
      if (Array.isArray(data)) {
        setStudents(data);
      } else {
        setStudents(data.students || []);
      }
    } catch (error) {
      console.error("Error fetching submissions:", error);
      alert("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentSubmissions = async (studentId) => {
    try {
      const data = await apiRequest(`/mentor/student/${studentId}/submissions`);
      setStudentSubmissions(data);
    } catch (error) {
      console.error("Error fetching student submissions:", error);
      alert("Failed to load student submissions");
    }
  };

  const openStudentProfile = async (studentData) => {
    setSelectedStudent(studentData);
    await fetchStudentSubmissions(studentData.student._id);
  };

  useEffect(() => {
    if (selectedStudent) {
      // Student data loaded
    }
  }, [selectedStudent]);

  const closeStudentProfile = () => {
    setSelectedStudent(null);
    setStudentSubmissions([]);
  };

  const toggleStudentExpansion = (studentId) => {
    const newExpanded = new Set(expandedStudents);
    if (newExpanded.has(studentId)) {
      newExpanded.delete(studentId);
    } else {
      newExpanded.add(studentId);
    }
    setExpandedStudents(newExpanded);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };

  // Calculate total statistics
  const totalSubmissions = students.reduce((total, student) => total + student.totalSubmissions, 0);
  const passingSubmissions = students.reduce((total, student) => {
    return total + student.submissions.filter(s => (s.totalScore || 0) >= 70).length;
  }, 0);
  
  // Calculate overall average score correctly
  const totalScoreSum = students.reduce((total, student) => {
    return total + student.submissions.reduce((sum, submission) => sum + (submission.totalScore || 0), 0);
  }, 0);
  const averageScore = totalSubmissions > 0 
    ? Math.round(totalScoreSum / totalSubmissions)
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-xl">Loading submissions...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Student Submissions</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="text-2xl font-bold text-blue-400">{totalSubmissions}</div>
            <div className="text-slate-400">Total Submissions</div>
          </div>
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="text-2xl font-bold text-green-400">
              {passingSubmissions}
            </div>
            <div className="text-slate-400">Passing Scores</div>
          </div>
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="text-2xl font-bold text-yellow-400">
              {averageScore} / 100
            </div>
            <div className="text-slate-400">Average Score</div>
          </div>
        </div>

        {students.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-2xl text-slate-400 mb-4">No students found</div>
            <p className="text-slate-500">No students have submitted tests yet.</p>
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto space-y-4">
            {students.map((studentData) => (
              <div key={studentData.student._id} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                {/* Student Header */}
                <div 
                  className="p-4 cursor-pointer hover:bg-slate-700/50 transition-colors"
                  onClick={() => toggleStudentExpansion(studentData.student._id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-lg">{studentData.student.name}</div>
                      <div className="text-sm text-slate-400">{studentData.student.email}</div>
                      <div className="text-sm text-slate-400 mt-1">
                        {studentData.totalSubmissions} submission{studentData.totalSubmissions !== 1 ? 's' : ''} • 
                        Avg Score: <span className={`font-medium ${
                          studentData.averageScore >= 70 ? 'text-green-400' : 
                          studentData.averageScore >= 50 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {studentData.averageScore} / 100
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        studentData.averageScore >= 70 ? 'bg-green-900/50 text-green-300' :
                        studentData.averageScore >= 50 ? 'bg-yellow-900/50 text-yellow-300' :
                        'bg-red-900/50 text-red-300'
                      }`}>
                        {studentData.averageScore} / 100
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openStudentProfile(studentData.submissions[0]);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                      >
                        View Profile
                      </button>
                      <svg
                        className={`w-5 h-5 text-slate-400 transform transition-transform ${
                          expandedStudents.has(studentData.student._id) ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Student Submissions (Collapsible) */}
                {expandedStudents.has(studentData.student._id) && (
                  <div className="border-t border-slate-700">
                    <table className="w-full">
                      <thead className="bg-slate-700">
                        <tr>
                          <th className="p-4 text-left text-slate-300">Test</th>
                          <th className="p-4 text-left text-slate-300">Score</th>
                          <th className="p-4 text-left text-slate-300">Submitted</th>
                          <th className="p-4 text-left text-slate-300">Time Spent</th>
                          <th className="p-4 text-left text-slate-300">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentData.submissions.map((submission) => (
                          <tr key={submission._id} className="border-b border-slate-700 hover:bg-slate-700/50">
                            <td className="p-4 font-medium">{submission.testId?.title || submission.assignmentId?.testId?.title || "Test"}</td>
                            <td className="p-4">
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                (submission.totalScore || 0) >= 70
                                  ? 'bg-green-900/50 text-green-300'
                                  : (submission.totalScore || 0) >= 50
                                  ? 'bg-yellow-900/50 text-yellow-300'
                                  : 'bg-red-900/50 text-red-300'
                              }`}>
                                {submission.totalScore || 0} / {submission.maxScore || 0}
                              </span>
                            </td>
                            <td className="p-4 text-slate-400">{formatDate(submission.submittedAt)}</td>
                            <td className="p-4 text-slate-400">
                              {Math.floor((submission.timeSpent || 0) / 60)}m {(submission.timeSpent || 0) % 60}s
                            </td>
                            <td className="p-4">
                              <span className="px-2 py-1 rounded text-xs bg-blue-900/50 text-blue-300">
                                Completed
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Student Profile Modal */}
        {selectedStudent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Student Profile: {selectedStudent.userId?.name}</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Student Information</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Name</label>
                      <div className="text-white">{selectedStudent.userId?.name || "Unknown"}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Email</label>
                      <div className="text-white">{selectedStudent.userId?.email || "N/A"}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">Submission Details</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Test</label>
                      <div className="text-white">{selectedStudent.assignmentId?.testId?.title || "Test"}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Score</label>
                      <div className="text-blue-400 font-medium">{selectedStudent.totalScore || 0} / {selectedStudent.maxScore || 0}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300">Submitted</label>
                      <div className="text-slate-400">{formatDate(selectedStudent.submittedAt)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Student Answers */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Student Answers</h3>
                {studentSubmissions.length > 0 && studentSubmissions[0].responses && studentSubmissions[0].responses.length > 0 ? (
                  <div className="space-y-4">
                    {studentSubmissions[0].responses.map((response, index) => {
                      const question = studentSubmissions[0].assignmentId?.testId?.questions?.find(
                        q => q._id.toString() === response.questionId.toString()
                      );
                      if (!question) {
                        console.warn("Question not found for response:", response);
                        return null;
                      }

                      const isCorrect = response.isCorrect;
                      let studentAnswer = response.selectedOption || "Not answered";
                      let correctAnswer = question.answer || "N/A";

                      // MSQ removed

                      return (
                        <div key={index} className="bg-slate-700 rounded-lg p-4">
                          <div className="mb-2">
                            <span className="text-sm font-medium text-slate-300">Question {index + 1}:</span>
                            <p className="text-white mt-1">{question.text}</p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <span className="text-sm font-medium text-slate-300">Your Answer:</span>
                              <p className={`mt-1 ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                                {studentAnswer}
                              </p>
                            </div>
                            <div>
                              <span className="text-sm font-medium text-slate-300">Correct Answer:</span>
                              <p className="text-blue-400 mt-1">{correctAnswer}</p>
                            </div>
                          </div>
                          <div className="mt-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              isCorrect ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
                            }`}>
                              {isCorrect ? 'Correct' : 'Incorrect'}
                            </span>
                            <span className="ml-2 text-sm text-slate-400">
                              Points: {response.points || 0} / {question.points || 1}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-slate-400">No answers available for this submission.</p>
                )}
              </div>

              {/* All Student Submissions */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">All Test Submissions</h3>
                {studentSubmissions.length === 0 ? (
                  <p className="text-slate-400">No other submissions found for this student.</p>
                ) : (
                  <div className="bg-slate-700 rounded-lg p-4">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-slate-300">
                          <th className="p-2">Test</th>
                          <th className="p-2">Score</th>
                          <th className="p-2">Submitted</th>
                          <th className="p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentSubmissions.map((submission) => (
                          <tr key={submission._id} className="border-b border-slate-600">
                            <td className="p-2">{submission.testId?.title || submission.assignmentId?.testId?.title || "Test"}</td>
                            <td className="p-2">
                              <span className={`px-2 py-1 rounded text-xs ${
                                (submission.totalScore || 0) >= 70 
                                  ? 'bg-green-900/50 text-green-300'
                                  : (submission.totalScore || 0) >= 50
                                  ? 'bg-yellow-900/50 text-yellow-300'
                                  : 'bg-red-900/50 text-red-300'
                              }`}>
                                {submission.totalScore || 0} / {submission.maxScore || 0}
                              </span>
                            </td>
                            <td className="p-2 text-slate-400">{formatDate(submission.submittedAt)}</td>
                            <td className="p-2">
                              <span className="px-2 py-1 rounded text-xs bg-blue-900/50 text-blue-300">
                                Completed
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={closeStudentProfile}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-md font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MentorSubmissions;
