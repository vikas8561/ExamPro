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
        // Debug log removed
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

  // Calculate counts based on question types
  const mcqQuestions = test.questions.filter(q => q.kind === "mcq");
  const codingTheoryQuestions = test.questions.filter(q => q.kind === "coding" || q.kind === "theory");
  
  const correctCount = mcqQuestions.filter(q => q.isCorrect).length;
  const incorrectCount = mcqQuestions.filter(q => q.selectedOption && !q.isCorrect).length;
  const notAnsweredCount = mcqQuestions.filter(q => !q.selectedOption).length;
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
              {mcqQuestions.length > 0 && (
                <>
                  <div>
                    <div className="text-2xl font-bold text-green-400">{correctCount}</div>
                    <div className="text-slate-400">MCQ Correct</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-400">{incorrectCount}</div>
                    <div className="text-slate-400">MCQ Incorrect</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-400">{notAnsweredCount}</div>
                    <div className="text-slate-400">MCQ Not Answered</div>
                  </div>
                </>
              )}
              {codingTheoryQuestions.length > 0 && (
                <div>
                  <div className="text-2xl font-bold text-purple-400">{codingTheoryQuestions.length}</div>
                  <div className="text-slate-400">Coding/Theory Questions</div>
                </div>
              )}
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
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="text-lg font-semibold text-white">
                      Q{index + 1}: {q.text}
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        q.kind === "mcq" ? "bg-blue-900/50 text-blue-300" :
                        q.kind === "coding" ? "bg-purple-900/50 text-purple-300" :
                        "bg-pink-900/50 text-pink-300"
                      }`}>
                        {q.kind === "mcq" ? "MCQ" : q.kind === "coding" ? "Coding" : "Theory"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <span className="font-medium text-slate-300">Your Answer: </span>
                      {q.kind === "mcq" ? (
                        <span className={`ml-2 font-semibold ${
                          q.isCorrect ? "text-green-400" : "text-red-400"
                        }`}>
                          {studentAnswer}
                        </span>
                      ) : (
                        <div className="bg-slate-700 p-3 rounded mt-1 whitespace-pre-wrap text-slate-200">
                          {studentAnswer}
                        </div>
                      )}
                    </div>

                    {/* Show correct answer only for MCQ questions */}
                    {q.kind === "mcq" && q.answer && (
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

                  {/* Show feedback for coding and theory questions */}
                  {(q.kind === "coding" || q.kind === "theory") && q.geminiFeedback && (
                    <div className="mt-4 p-4 bg-blue-900/20 border-l-4 border-blue-500 rounded">
                      <h5 className="text-blue-300 font-semibold mb-2">Feedback:</h5>
                      <p className="text-blue-200 text-sm leading-relaxed">{q.geminiFeedback}</p>
                    </div>
                  )}

                  {/* Show right/wrong status only for MCQ questions */}
                  {q.kind === "mcq" && (
                    <>
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
                    </>
                  )}

                  {/* Show status for coding/theory questions */}
                  {(q.kind === "coding" || q.kind === "theory") && (
                    <div className="mt-3 p-2 bg-slate-700/50 border-l-4 border-slate-500 rounded">
                      <p className="text-sm text-slate-300 font-medium">
                        {q.textAnswer ? "✓ Answer Submitted" : "⚠ Not Answered"}
                      </p>
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
