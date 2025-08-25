import React, { useEffect, useState } from "react";
import apiRequest from "../services/api";

const MentorSubmissions = () => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [mentorScore, setMentorScore] = useState("");
  const [mentorFeedback, setMentorFeedback] = useState("");
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    fetchSubmissions();
  }, []);

const fetchSubmissions = async () => {
    console.log("Fetching submissions for mentor...");
    try {
      const data = await apiRequest("/mentor/submissions/pending");
      console.log("Received submissions data:", data); // Log the received data
      setSubmissions(data);
    } catch (error) {
      console.error("Error fetching submissions:", error);
      alert("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (submissionId) => {
    if (!mentorScore || mentorScore < 0 || mentorScore > 100) {
      alert("Please enter a valid score between 0 and 100");
      return;
    }

    try {
      setReviewing(true);
      await apiRequest(`/mentor/submissions/${submissionId}/review`, {
        method: "PUT",
        body: JSON.stringify({
          mentorScore: parseInt(mentorScore),
          mentorFeedback
        })
      });

      alert("Test reviewed successfully!");
      setSelectedSubmission(null);
      setMentorScore("");
      setMentorFeedback("");
      fetchSubmissions();
    } catch (error) {
      alert(error.message || "Failed to review submission");
    } finally {
      setReviewing(false);
    }
  };

  const openReviewModal = (submission) => {
    setSelectedSubmission(submission);
    setMentorScore(submission.totalScore || 0);
    setMentorFeedback("");
  };

  const closeReviewModal = () => {
    setSelectedSubmission(null);
    setMentorScore("");
    setMentorFeedback("");
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };

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
        <h1 className="text-3xl font-bold mb-8">Test Submissions for Review</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="text-2xl font-bold text-blue-400">{submissions.length}</div>
            <div className="text-slate-400">Pending Reviews</div>
          </div>
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="text-2xl font-bold text-green-400">
              {submissions.filter(s => s.totalScore >= 70).length}
            </div>
            <div className="text-slate-400">Passing Scores</div>
          </div>
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="text-2xl font-bold text-yellow-400">
              {submissions.reduce((avg, s) => avg + (s.totalScore || 0), 0) / (submissions.length || 1)}%
            </div>
            <div className="text-slate-400">Average Score</div>
          </div>
        </div>

        {submissions.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-2xl text-slate-400 mb-4">No submissions pending review</div>
            <p className="text-slate-500">All tests have been reviewed.</p>
          </div>
        ) : (
          <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-700">
                <tr>
                  <th className="p-4 text-left text-slate-300">Student</th>
                  <th className="p-4 text-left text-slate-300">Test</th>
                  <th className="p-4 text-left text-slate-300">Auto Score</th>
                  <th className="p-4 text-left text-slate-300">Submitted</th>
                  <th className="p-4 text-left text-slate-300">Time Spent</th>
                  <th className="p-4 text-left text-slate-300">Action</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => (
                  <tr key={submission._id} className="border-b border-slate-700 hover:bg-slate-700/50">
                    <td className="p-4">
                      <div className="font-medium">{submission.userId?.name || "Unknown"}</div>
                      <div className="text-sm text-slate-400">{submission.userId?.email}</div>
                    </td>
                    <td className="p-4 font-medium">{submission.testId?.title || "Test"}</td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        (submission.totalScore || 0) >= 70 
                          ? 'bg-green-900/50 text-green-300'
                          : (submission.totalScore || 0) >= 50
                          ? 'bg-yellow-900/50 text-yellow-300'
                          : 'bg-red-900/50 text-red-300'
                      }`}>
                        {submission.totalScore || 0}%
                      </span>
                    </td>
                    <td className="p-4 text-slate-400">{formatDate(submission.submittedAt)}</td>
                    <td className="p-4 text-slate-400">
                      {Math.floor((submission.timeSpent || 0) / 60)}m {(submission.timeSpent || 0) % 60}s
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => openReviewModal(submission)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Review Modal */}
        {selectedSubmission && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-bold mb-4">Review Test Submission</h2>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Student</label>
                  <div className="text-white">{selectedSubmission.userId?.name}</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Test</label>
                  <div className="text-white">{selectedSubmission.testId?.title}</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Auto Score</label>
                  <div className="text-blue-400 font-medium">{selectedSubmission.totalScore}%</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Submitted</label>
                  <div className="text-slate-400">{formatDate(selectedSubmission.submittedAt)}</div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Final Score *</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={mentorScore}
                    onChange={(e) => setMentorScore(e.target.value)}
                    className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-white"
                    placeholder="Enter score (0-100)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Feedback</label>
                  <textarea
                    value={mentorFeedback}
                    onChange={(e) => setMentorFeedback(e.target.value)}
                    className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-white"
                    rows="3"
                    placeholder="Optional feedback for the student..."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => handleReview(selectedSubmission._id)}
                  disabled={reviewing}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white py-2 rounded-md font-medium"
                >
                  {reviewing ? 'Reviewing...' : 'Submit Review'}
                </button>
                <button
                  onClick={closeReviewModal}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 rounded-md font-medium"
                >
                  Cancel
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
