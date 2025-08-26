import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import apiRequest from "../services/api";

const ViewTestResults = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);

  useEffect(() => {
    fetchAssignmentAndResults();
  }, [assignmentId]);

  const fetchAssignmentAndResults = async () => {
    try {
      // First fetch the assignment to check the deadline
      const assignmentData = await apiRequest(`/assignments/${assignmentId}`);
      setAssignment(assignmentData);
      
      // Then fetch the results
      const resultsData = await apiRequest(`/test-submissions/assignment/${assignmentId}`);
      setResults(resultsData);
      console.log("Results Data:", resultsData); // Log the results data
    } catch (error) {
      console.error("Error fetching data:", error);
      alert("Failed to load test data");
    } finally {
      setLoading(false);
    }
  };

  const isDeadlinePassed = (deadline) => {
    if (!deadline) return false;
    const currentTime = new Date();
    const deadlineTime = new Date(deadline);
    return currentTime >= deadlineTime;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading results...</div>
      </div>
    );
  }

  if (!results || !assignment) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-xl text-red-400">Failed to load results</div>
      </div>
    );
  }

  const { test, submission, showResults, message } = results;
  const finalScore = showResults ? (submission.mentorReviewed ? submission.mentorScore : submission.totalScore) : null;

  // Check if results should be shown - if not, show access denied message
  if (!showResults) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">{test.title}</h1>
            <p className="text-slate-400">Test Results</p>
          </div>
          
          <div className="bg-slate-800 rounded-lg p-8 text-center">
            <div className="text-2xl font-bold text-yellow-400 mb-4">Results Not Available Yet</div>
            <p className="text-slate-300 mb-4">
              {message || "The test results will be available after the deadline has passed."}
            </p>
            <p className="text-slate-400 mb-6">
              Deadline: {new Date(assignment.deadline).toLocaleString()}
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
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{test.title}</h1>
          <p className="text-slate-400">
            {showResults ? "Test Results" : "Test Submission - Pending Mentor Review"}
          </p>
        </div>

        {/* Score Summary */}
        <div className="bg-slate-800 rounded-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            {showResults ? (
              <>
                <div>
<div className="text-2xl font-bold text-blue-400">{finalScore} / {submission.maxScore}</div>
                  <div className="text-slate-400">Final Score</div>
                </div>
                <div>
<div className="text-2xl font-bold text-green-400">{submission.totalScore} / {submission.maxScore}</div>
                  <div className="text-slate-400">Auto Score</div>
                </div>
              </>
            ) : (
              <div className="md:col-span-2">
                <div className="text-2xl font-bold text-yellow-400">Pending Mentor Review</div>
                <div className="text-slate-400">Your test has been submitted and is awaiting mentor evaluation</div>
              </div>
            )}
            <div>
              <div className="text-2xl font-bold text-purple-400">
                {Math.floor((submission.timeSpent || 0) / 60)}m {(submission.timeSpent || 0) % 60}s
              </div>
              <div className="text-slate-400">Time Spent</div>
            </div>
          </div>

          {/* Permission Status */}
          {submission.permissions && (
            <div className="mt-6 p-4 bg-slate-700 rounded-lg">
              <h3 className="font-semibold text-slate-300 mb-4">Permission Status:</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className={`text-lg font-semibold ${
                    submission.permissions.cameraGranted ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {submission.permissions.cameraGranted ? '✓ Camera' : '✗ Camera'}
                  </div>
                  <div className="text-sm text-slate-400">Access</div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-semibold ${
                    submission.permissions.microphoneGranted ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {submission.permissions.microphoneGranted ? '✓ Microphone' : '✗ Microphone'}
                  </div>
                  <div className="text-sm text-slate-400">Access</div>
                </div>
                <div className="text-center">
                  <div className={`text-lg font-semibold ${
                    submission.permissions.locationGranted ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {submission.permissions.locationGranted ? '✓ Location' : '✗ Location'}
                  </div>
                  <div className="text-sm text-slate-400">Access</div>
                </div>
              </div>
              <div className="mt-4 text-center">
                <div className={`text-sm font-medium px-3 py-1 rounded-full inline-block ${
                  submission.permissions.permissionStatus === 'Granted' ? 'bg-green-600 text-white' :
                  submission.permissions.permissionStatus === 'Partially Granted' ? 'bg-yellow-600 text-white' :
                  'bg-red-600 text-white'
                }`}>
                  Overall: {submission.permissions.permissionStatus}
                </div>
              </div>
            </div>
          )}

          {submission.mentorReviewed && submission.mentorFeedback && (
            <div className="mt-6 p-4 bg-slate-700 rounded-lg">
              <h3 className="font-semibold text-slate-300 mb-2">Mentor Feedback:</h3>
              <p className="text-white">{submission.mentorFeedback}</p>
            </div>
          )}
        </div>

        {/* Questions Review */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold mb-4">
            {showResults ? "Question Review" : "Your Submission"}
          </h2>
          
          {test.questions.map((question, index) => {
            const response = submission.responses?.find(r => 
              r.questionId === question._id.toString()
            );

            const isCorrect = response?.isCorrect;
            const correctAnswer = question.answer;

            return (
              <div key={question._id} className="bg-slate-800 rounded-lg p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-sm text-slate-400">Question {index + 1}</span>
                    <h3 className="text-lg font-semibold mt-1">{question.text}</h3>
                  </div>
                  {showResults && (
                    <div className="bg-slate-700 px-3 py-1 rounded-md text-sm">
                      {response?.points || 0}/{question.points} points
                    </div>
                  )}
                </div>

                {/* MCQ Review */}
                {question.kind === "mcq" && (
                  <div className="space-y-3">
                    <div className="text-sm text-slate-400">Options:</div>
                    {question.options?.map((option, optIndex) => (
                      <div
                        key={optIndex}
                        className={`p-3 rounded-md ${
                          showResults && option.text === question.answer
                            ? 'bg-green-900/50 border border-green-700'
                            : showResults && response?.selectedOption === option.text && option.text !== question.answer
                            ? 'bg-red-900/50 border border-red-700'
                            : response?.selectedOption === option.text
                            ? 'bg-blue-900/50 border border-blue-700'
                            : 'bg-slate-700'
                        }`}
                      >
                        <div className="flex items-center">
                        {showResults && option.text === question.answer && (
                          <span className="text-green-400 mr-2">✓</span>
                        )}
                        {showResults && response?.selectedOption === option.text && option.text !== question.answer && (
                          <span className="text-red-400 mr-2">✗</span>
                        )}
                        {!showResults && response?.selectedOption === option.text && (
                          <span className="text-blue-400 mr-2">✓</span>
                        )}
                        <span>{option.text}</span>
                        {showResults && option.text === question.answer && (
                          <span className="ml-auto text-green-400 text-sm">Correct Answer</span>
                        )}
                        </div>
                      </div>
                    ))}
                    
                    <div className="text-sm text-slate-400 mt-4">
                      Your answer: <span className="text-white">{response?.selectedOption || "Not answered"}</span>
                    </div>
                  </div>
                )}

                {/* Theoretical Review */}
                {question.kind === "theoretical" && (
                  <div>
                    {question.guidelines && (
                      <div className="bg-slate-700 p-4 rounded-lg mb-4">
                        <h4 className="font-semibold text-slate-300 mb-2">Guidelines:</h4>
                        <p className="text-slate-400">{question.guidelines}</p>
                      </div>
                    )}
                    
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-slate-300 mb-2">Your Answer:</label>
                      <div className="bg-slate-700 p-4 rounded-lg">
                        <p className="text-white">{response?.textAnswer || "No answer provided"}</p>
                      </div>
                    </div>

                    {showResults && submission.mentorReviewed && (
                      <div className="bg-blue-900/20 p-4 rounded-lg">
                        <h4 className="font-semibold text-blue-300 mb-2">Mentor Evaluation:</h4>
                        <p className="text-blue-200">
                          This question was manually reviewed by your mentor.
                          {response?.points !== undefined && ` Awarded ${response.points} points.`}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ViewTestResults;
