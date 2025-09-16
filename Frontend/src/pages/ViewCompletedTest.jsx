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
        console.log("Fetched test submission data:", data);  // Debug log
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
                  This test has been assessed immediately upon submission.
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

  const { test, submission, showResults, message } = testData;

  const correctCount = test.questions.filter(q => q.isCorrect).length;
  const incorrectCount = test.questions.filter(q => q.selectedOption && !q.isCorrect).length;
  const notAnsweredCount = test.questions.filter(q => !q.selectedOption).length;
  const totalQuestions = test.questions.length;

  // Check if results should be shown
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isMentor = user.role === 'Mentor';

  if (!showResults && !isMentor) {
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

          <div className="bg-slate-800 shadow-lg rounded-xl p-8 border border-slate-700 text-center">
            <h3 className="text-2xl font-bold text-yellow-400 mb-4">Results Not Available Yet</h3>
            <p className="text-slate-300 mb-4">
              {message || "The test results will be available after the deadline has passed."}
            </p>
            <p className="text-slate-400 mb-6">
              Your answers have been submitted and recorded. Results including correctness and scores will be available after the assignment deadline.
            </p>
            <button
              onClick={() => navigate('/student/assignments')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-semibold"
            >
              Back to Assignments
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-900 text-white p-6 overflow-hidden">
      <div className="max-w-4xl mx-auto h-full flex flex-col">
        <div className="flex-shrink-0">
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-400">{totalQuestions}</div>
                <div className="text-slate-400">Total Questions</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400">{correctCount}</div>
                <div className="text-slate-400">Correct Answers</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-400">{incorrectCount}</div>
                <div className="text-slate-400">Incorrect Answers</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-400">{notAnsweredCount}</div>
                <div className="text-slate-400">Not Answered</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{submission.totalScore}</div>
                <div className="text-slate-400">Final Score</div>
              </div>
            </div>
          </div>
        </div>

        {/* Questions & Answers */}
        <div className="flex-1 overflow-y-auto">
          <h3 className="text-2xl font-semibold text-white mb-6">Question Analysis</h3>
          <div className="space-y-4">
            {test.questions.map((q, index) => {
              const studentAnswer = q.kind === "mcq" ? (q.selectedOption || "Not answered") : (q.textAnswer || "No answer provided");

              return (
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
                        {q.kind === "mcq" ? studentAnswer : (
                          <div className="bg-slate-700 p-3 rounded mt-1 whitespace-pre-wrap">
                            {studentAnswer}
                          </div>
                        )}
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

                  {!q.isCorrect && (q.selectedOption || q.textAnswer) && (
                    <div className="mt-3 p-2 bg-red-900/20 border-l-4 border-red-500 rounded">
                      <p className="text-sm text-red-300 font-medium">✗ Incorrect Answer</p>
                    </div>
                  )}

                  {!q.selectedOption && !q.textAnswer && (
                    <div className="mt-3 p-2 bg-yellow-900/20 border-l-4 border-yellow-500 rounded">
                      <p className="text-sm text-yellow-300 font-medium">⚠ Not Answered</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewCompletedTest;
