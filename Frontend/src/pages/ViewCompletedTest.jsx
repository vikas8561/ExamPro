import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { testSubmissionsAPI } from "../services/api";

const ViewCompletedTest = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [testData, setTestData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    const fetchTestResults = async () => {
      try {
        const data = await testSubmissionsAPI.getTestSubmission(assignmentId);
        if (data === null) {
          setError("Test submission not found");
        } else {
          setTestData(data);
        }
      } catch (err) {
        console.error("Error fetching test results:", err);
        setError(err.message || "Failed to fetch test results");
      } finally {
        setLoading(false);
      }
    };

    fetchTestResults();
  }, [assignmentId, token, navigate]);

  if (loading) return <div className="text-center mt-10">Loading...</div>;
  if (error) {
    // Handle case where no test submission exists (e.g., test was marked completed automatically)
    if (error.includes("Test submission not found")) {
      return (
        <div className="min-h-screen bg-slate-900 text-white p-6">
          <div className="max-w-4xl mx-auto">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-6 font-medium"
            >
              <ChevronLeftIcon className="h-5 w-5" />
              Back
            </button>
            
            <div className="bg-slate-800 shadow-lg rounded-xl p-8 border border-slate-700 text-center">
              <h2 className="text-2xl font-bold text-white mb-4">Test Completion Status</h2>
              <p className="text-slate-300 mb-4">
                This test was automatically marked as completed because it was started after the deadline.
              </p>
              <p className="text-slate-400">
                No test submission data is available as the test was not fully completed.
              </p>
            </div>
          </div>
        </div>
      );
    }
    return <div className="text-center mt-10 text-red-500">Error: {error}</div>;
  }
  if (!testData) return <div className="text-center mt-10">No test data available.</div>;

  const { test, submission } = testData;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-6 font-medium"
        >
          <ChevronLeftIcon className="h-5 w-5" />
          Back
        </button>

        <h2 className="text-3xl font-bold text-white mb-6">{test.title}</h2>

        {/* Score Summary */}
        <div className="bg-slate-800 shadow-lg rounded-xl p-6 mb-8 border border-slate-700">
          <h3 className="text-xl font-semibold text-white mb-4">Test Results</h3>
          <div className="space-y-2">
            <p className="text-lg">
              <span className="font-medium text-slate-300">Your Score:</span>{" "}
              <span className="text-2xl font-bold text-blue-400">{submission.totalScore}</span>{" "}
              <span className="text-slate-400">/ {submission.maxScore}</span>
            </p>
            <p className="text-lg">
              <span className="font-medium text-slate-300">Percentage:</span>{" "}
              <span className="text-2xl font-bold text-green-400">
                {submission.maxScore ? Math.round((submission.totalScore / submission.maxScore) * 100) : 0}%
              </span>
            </p>
            <p className="text-slate-400">
              <span className="font-medium">Submitted At:</span>{" "}
              <span className="text-slate-300">{new Date(submission.submittedAt).toLocaleString()}</span>
            </p>
          </div>
        </div>

        {/* Questions & Answers */}
        <div>
          <h3 className="text-2xl font-semibold text-white mb-6">Question Analysis</h3>
          <div className="space-y-4">
            {test.questions.map((q, index) => (
              <div key={q._id} className="bg-slate-800 shadow-md rounded-lg p-6 border border-slate-700">
                <h4 className="text-lg font-semibold text-white mb-3">
                  Q{index + 1}: {q.text}
                </h4>
                
                <div className="space-y-2">
                  <div>
                    <span className="font-medium text-slate-300">Your Answer: </span>
                    <span className={`ml-2 font-semibold ${
                      q.isCorrect ? "text-green-400" : "text-red-400"
                    }`}>
                      {q.selectedOption || "Not answered"}
                    </span>
                  </div>
                  
                  {q.answer && (
                    <div>
                      <span className="font-medium text-slate-300">Correct Answer: </span>
                      <span className="ml-2 font-semibold text-green-400">{q.answer}</span>
                    </div>
                  )}
                  
                  <div>
                    <span className="font-medium text-slate-300">Points Earned: </span>
                    <span className={`ml-2 font-semibold ${
                      q.points > 0 ? "text-green-400" : "text-red-400"
                    }`}>
                      {q.points || 0}
                    </span>
                    <span className="text-slate-400"> / {q.points || 0}</span>
                  </div>
                </div>
                
                {q.isCorrect && (
                  <div className="mt-3 p-2 bg-green-900/20 border-l-4 border-green-500 rounded">
                    <p className="text-sm text-green-300 font-medium">✓ Correct Answer</p>
                  </div>
                )}
                
                {!q.isCorrect && q.selectedOption && (
                  <div className="mt-3 p-2 bg-red-900/20 border-l-4 border-red-500 rounded">
                    <p className="text-sm text-red-300 font-medium">✗ Incorrect Answer</p>
                  </div>
                )}
                
                {!q.selectedOption && (
                  <div className="mt-3 p-2 bg-yellow-900/20 border-l-4 border-yellow-500 rounded">
                    <p className="text-sm text-yellow-300 font-medium">⚠ Not Answered</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewCompletedTest;
