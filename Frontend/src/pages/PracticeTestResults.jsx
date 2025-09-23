import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import apiRequest from "../services/api";

const PracticeTestResults = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTestData();
    fetchAttempts();
  }, [testId]);

  const fetchTestData = async () => {
    try {
      // Get the latest attempt by default
      const data = await apiRequest(`/practice-tests/${testId}/results/1`);
      setTest(data.test);
      setSubmission(data.submission);
      setSelectedAttempt(1);
    } catch (error) {
      console.error("Error fetching test data:", error);
      setError("Failed to load test results");
    } finally {
      setLoading(false);
    }
  };

  const fetchAttempts = async () => {
    try {
      const data = await apiRequest(`/practice-tests/${testId}/attempts`);
      setAttempts(data.submissions || []);
    } catch (error) {
      console.error("Error fetching attempts:", error);
    }
  };

  const handleAttemptChange = async (attemptNumber) => {
    try {
      const data = await apiRequest(`/practice-tests/${testId}/results/${attemptNumber}`);
      setTest(data.test);
      setSubmission(data.submission);
      setSelectedAttempt(attemptNumber);
    } catch (error) {
      console.error("Error fetching attempt data:", error);
    }
  };

  const getScoreColor = (score, maxScore) => {
    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
    if (percentage >= 80) return "text-green-400";
    if (percentage >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreBgColor = (score, maxScore) => {
    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
    if (percentage >= 80) return "bg-green-900/50";
    if (percentage >= 60) return "bg-yellow-900/50";
    return "bg-red-900/50";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading results...</div>
      </div>
    );
  }

  if (error || !test || !submission) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-red-400 mb-4">{error || "Results not found"}</div>
          <button
            onClick={() => navigate("/student/practice-tests")}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
          >
            Back to Practice Tests
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-green-400">{test.title}</h1>
              <p className="text-slate-400 mt-2">Practice Test Results</p>
            </div>
            <button
              onClick={() => navigate("/student/practice-tests")}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
            >
              Back to Practice Tests
            </button>
          </div>
        </div>

        {/* Attempt Selection */}
        {attempts.length > 1 && (
          <div className="bg-slate-800 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold mb-3">Select Attempt</h3>
            <div className="flex flex-wrap gap-2">
              {attempts.map((attempt) => (
                <button
                  key={attempt.attemptNumber}
                  onClick={() => handleAttemptChange(attempt.attemptNumber)}
                  className={`px-4 py-2 rounded-md transition-colors ${
                    selectedAttempt === attempt.attemptNumber
                      ? "bg-green-600 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  Attempt {attempt.attemptNumber}
                  <div className="text-xs mt-1">
                    {new Date(attempt.savedAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Score Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className={`${getScoreBgColor(submission.totalScore, submission.maxScore)} rounded-lg p-6`}>
            <div className="text-3xl font-bold mb-2">
              <span className={getScoreColor(submission.totalScore, submission.maxScore)}>
                {submission.totalScore}
              </span>
              <span className="text-slate-400">/{submission.maxScore}</span>
            </div>
            <div className="text-slate-300">Total Score</div>
          </div>

          <div className="bg-green-900/50 rounded-lg p-6">
            <div className="text-3xl font-bold text-green-400 mb-2">
              {submission.correctCount}
            </div>
            <div className="text-slate-300">Correct</div>
          </div>

          <div className="bg-red-900/50 rounded-lg p-6">
            <div className="text-3xl font-bold text-red-400 mb-2">
              {submission.incorrectCount}
            </div>
            <div className="text-slate-300">Incorrect</div>
          </div>

          <div className="bg-slate-700 rounded-lg p-6">
            <div className="text-3xl font-bold text-slate-400 mb-2">
              {submission.notAnsweredCount}
            </div>
            <div className="text-slate-300">Not Answered</div>
          </div>
        </div>

        {/* Questions and Answers */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-6">Question Review</h3>
          <div className="space-y-6">
            {test.questions.map((question, index) => {
              const response = submission.responses.find(r => 
                r.questionId === question._id
              );

              return (
                <div key={question._id} className="border border-slate-700 rounded-lg p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="text-lg font-semibold">
                      Question {index + 1}
                    </h4>
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                      response?.isCorrect 
                        ? "bg-green-900/50 text-green-300" 
                        : "bg-red-900/50 text-red-300"
                    }`}>
                      {response?.isCorrect ? "Correct" : "Incorrect"}
                    </div>
                  </div>

                  <p className="text-slate-200 mb-4 leading-relaxed">
                    {question.text}
                  </p>

                  <div className="space-y-2">
                    {question.options?.map((option, optionIndex) => (
                      <div
                        key={optionIndex}
                        className={`p-3 rounded-md border-2 ${
                          response?.selectedOption === option.text
                            ? response?.isCorrect
                              ? "border-green-500 bg-green-900/20"
                              : "border-red-500 bg-red-900/20"
                            : "border-slate-600"
                        }`}
                      >
                        <div className="flex items-center">
                          <div className={`w-4 h-4 rounded-full border-2 mr-3 ${
                            response?.selectedOption === option.text
                              ? response?.isCorrect
                                ? "border-green-500 bg-green-500"
                                : "border-red-500 bg-red-500"
                              : "border-slate-400"
                          }`}>
                            {response?.selectedOption === option.text && (
                              <div className="w-2 h-2 rounded-full bg-white m-0.5"></div>
                            )}
                          </div>
                          <span className="text-slate-200">{option.text}</span>
                          {response?.selectedOption === option.text && (
                            <span className="ml-auto text-sm font-medium">
                              {response?.isCorrect ? "✓ Your Answer" : "✗ Your Answer"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 text-sm text-slate-400">
                    Points: {response?.pointsEarned || 0} / {question.points || 1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Practice Test Info */}
        <div className="mt-6 bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="h-6 w-6 text-blue-400 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-blue-300 font-semibold mb-2">Practice Test Information</h4>
              <ul className="text-blue-200 text-sm space-y-1">
                <li>• This is a practice test - correct answers are not shown</li>
                <li>• You can attempt this test multiple times</li>
                <li>• No proctoring or time restrictions apply</li>
                <li>• Use this to practice and improve your knowledge</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PracticeTestResults;
