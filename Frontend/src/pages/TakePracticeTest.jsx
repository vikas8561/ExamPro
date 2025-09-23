import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import apiRequest from "../services/api";

const TakePracticeTest = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [previousResponsesLoaded, setPreviousResponsesLoaded] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [timeSpent, setTimeSpent] = useState(0);
  const [testStarted, setTestStarted] = useState(false);

  useEffect(() => {
    fetchPracticeTest();
  }, [testId]);

  // Timer effect
  useEffect(() => {
    let timer;
    
    if (testStarted && timeRemaining > 0) {
      timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
        setTimeSpent((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      clearInterval(timer);
    };
  }, [testStarted, timeRemaining]);

  const fetchPracticeTest = async () => {
    try {
      setLoading(true);
      
      // Fetch the practice test
      const testData = await apiRequest(`/practice-tests/${testId}`);
      setTest(testData);
      
      // Initialize timer
      const totalSeconds = testData.timeLimit * 60;
      setTimeRemaining(totalSeconds);
      setTestStarted(true);
      
      // Fetch user's previous attempts to load their last responses
      const attemptsData = await apiRequest(`/practice-tests/${testId}/attempts`);
      const attempts = attemptsData.submissions || [];
      
      if (attempts.length > 0) {
        // Get the latest attempt
        const latestAttempt = attempts[0]; // They are sorted by attemptNumber descending
        
        // Load the responses from the latest attempt
        const previousAnswers = {};
        if (latestAttempt.responses) {
          latestAttempt.responses.forEach(response => {
            if (response.selectedOption) {
              previousAnswers[response.questionId] = response.selectedOption;
            }
          });
        }
        
        setAnswers(previousAnswers);
        setPreviousResponsesLoaded(true);
      }
      
    } catch (error) {
      console.error("Error fetching practice test:", error);
      setError("Failed to load practice test");
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId, answer) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const handleSaveTest = async () => {
    try {
      setIsSaving(true);
      setSaveMessage("");

      // Convert answers to the format expected by the backend
      const responses = Object.entries(answers).map(([questionId, answer]) => ({
        questionId,
        selectedOption: answer
      }));

      await apiRequest(`/practice-tests/${testId}/save`, {
        method: "POST",
        body: JSON.stringify({
          responses,
          timeSpent: timeSpent
        })
      });

      setSaveMessage("Practice test saved successfully!");
      
      // Navigate to results after a short delay
      setTimeout(() => {
        navigate(`/student/practice-test-results/${testId}`);
      }, 1500);

    } catch (error) {
      console.error("Error saving practice test:", error);
      setSaveMessage("Error saving practice test. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading practice test...</div>
      </div>
    );
  }

  if (error || !test) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-red-400 mb-4">{error || "Practice test not found"}</div>
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

  const currentQ = test.questions[currentQuestion];
  const totalQuestions = test.questions.length;
  const answeredQuestions = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-green-400">{test.title}</h1>
          </div>
          <div className="text-right">
            <div className="flex items-center space-x-6">
              {/* Timer */}
              <div className="text-center">
                <div className="text-sm text-slate-400">Time Remaining</div>
                <div className={`text-lg font-semibold ${timeRemaining < 300 ? 'text-red-400' : 'text-green-400'}`}>
                  {formatTime(timeRemaining)}
                </div>
              </div>
              {/* Progress */}
              <div className="text-center">
                <div className="text-sm text-slate-400">Progress</div>
                <div className="text-lg font-semibold">
                  {answeredQuestions} / {totalQuestions} answered
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main Question Area */}
          <div className="lg:w-3/4">
            <div className="bg-slate-800 rounded-lg p-6 h-full">
              {/* Question Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">
                  Question {currentQuestion + 1} of {totalQuestions}
                </h2>
              </div>

              {/* Question Text */}
              <div className="mb-6">
                <p className="text-lg text-slate-200 leading-relaxed">
                  {currentQ.text}
                </p>
              </div>

              {/* Answer Options */}
              <div className="space-y-3">
                {currentQ.options?.map((option, index) => (
                  <label
                    key={index}
                    className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      answers[currentQ._id] === option.text
                        ? "border-green-500 bg-green-900/20"
                        : "border-slate-600 hover:border-slate-500"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`question-${currentQ._id}`}
                      value={option.text}
                      checked={answers[currentQ._id] === option.text}
                      onChange={(e) => handleAnswerChange(currentQ._id, e.target.value)}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${
                      answers[currentQ._id] === option.text
                        ? "border-green-500 bg-green-500"
                        : "border-slate-400"
                    }`}>
                      {answers[currentQ._id] === option.text && (
                        <div className="w-2 h-2 rounded-full bg-white"></div>
                      )}
                    </div>
                    <span className="text-slate-200">{option.text}</span>
                  </label>
                ))}
              </div>

              {/* Navigation Buttons */}
              <div className="flex justify-between mt-8">
                <button
                  onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
                  disabled={currentQuestion === 0}
                  className="px-6 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 rounded-md transition-colors"
                >
                  Previous
                </button>

                <div className="flex gap-3">
                  <button
                    onClick={handleSaveTest}
                    disabled={isSaving}
                    className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:text-green-300 rounded-md transition-colors"
                  >
                    {isSaving ? "Saving..." : "Save Test"}
                  </button>

                  <button
                    onClick={() => setCurrentQuestion(Math.min(totalQuestions - 1, currentQuestion + 1))}
                    disabled={currentQuestion === totalQuestions - 1}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:text-blue-300 rounded-md transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>

              {/* Save Message */}
              {saveMessage && (
                <div className={`mt-4 p-3 rounded-md ${
                  saveMessage.includes("successfully") 
                    ? "bg-green-900/50 text-green-300" 
                    : "bg-red-900/50 text-red-300"
                }`}>
                  {saveMessage}
                </div>
              )}
            </div>
          </div>

          {/* Question Navigation Sidebar */}
          <div className="lg:w-1/4">
            <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 p-5 sticky top-6 h-full">
              <h3 className="text-lg font-semibold text-white mb-5 text-center">Questions</h3>
              <div className="grid grid-cols-5 lg:grid-cols-1 gap-2">
                {test.questions.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentQuestion(index)}
                    className={`relative p-2 rounded-xl text-sm font-medium ${
                      index === currentQuestion
                        ? "bg-indigo-500 text-white shadow-lg"
                        : answers[test.questions[index]._id]
                        ? "bg-emerald-500 text-white border border-emerald-400"
                        : "bg-slate-600 text-slate-200 border border-slate-500"
                    }`}
                  >
                    <div className="flex items-center justify-center">
                      <span className="text-base font-semibold">{index + 1}</span>
                    </div>
                  </button>
                ))}
              </div>
              
              {/* Progress Summary */}
              <div className="mt-6 pt-4 border-t border-slate-600">
                <div className="text-center">
                  <div className="text-sm text-slate-300 mb-3 font-medium">Progress</div>
                  <div className="w-full bg-slate-700 rounded-full h-2 mb-3">
                    <div 
                      className="bg-gradient-to-r from-indigo-400 to-indigo-600 h-2 rounded-full"
                      style={{ width: `${(answeredQuestions / totalQuestions) * 100}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-slate-400 font-medium">
                    {answeredQuestions} of {totalQuestions} answered
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TakePracticeTest;
