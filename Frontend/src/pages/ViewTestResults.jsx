import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import apiRequest from "../services/api";

const ViewTestResults = () => {
  const { assignmentId } = useParams();
  const [test, setTest] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTestAndResponses = async () => {
      try {
        setLoading(true);
        const testData = await apiRequest(`/assignments/${assignmentId}/test`);
        const responseData = await apiRequest(`/answers/assignment/${assignmentId}`);

        setTest(testData);
        setResponses(responseData);
        setLoading(false);
      } catch (err) {
        setError("Failed to load test results.");
        setLoading(false);
      }
    };

    fetchTestAndResponses();
  }, [assignmentId]);

  if (loading) return <div>Loading test results...</div>;
  if (error) return <div>{error}</div>;
  if (!test) return <div>No test data found.</div>;

  // Calculate final score clamped to minimum 0
  const totalScore = responses.reduce((acc, r) => acc + (r.points || 0), 0);
  const finalScore = totalScore < 0 ? 0 : totalScore;

  return (
    <div className="test-results">
      <h2>Test Results</h2>
      <div className="summary">
        <div className="bg-slate-800 shadow-lg rounded-xl p-6 mb-8 border border-slate-700">
          <h3 className="text-xl font-semibold text-white mb-4">Test Results</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-400">{test.questions.length}</div>
              <div className="text-slate-400">Total Questions</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">{responses.filter(r => r.isCorrect).length}</div>
              <div className="text-slate-400">MCQ Correct</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-400">{responses.filter(r => !r.isCorrect && r.selectedOption).length}</div>
              <div className="text-slate-400">MCQ Incorrect</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-400">{responses.filter(r => !r.selectedOption && !r.textAnswer).length}</div>
              <div className="text-slate-400">MCQ Not Answered</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-400">{responses.filter(r => r.textAnswer).length}</div>
              <div className="text-slate-400">Coding/Theory Questions</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{finalScore}</div>
              <div className="text-slate-400">Final Score</div>
            </div>
          </div>
        </div>
      </div>
      <div className="questions">
        {test.questions.map((question, index) => {
          const response = responses.find(
            (r) => r.questionId.toString() === question._id.toString()
          );

          return (
            <div key={question._id} className="question">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3>
                Q{index + 1}: {question.text}
              </h3>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '500',
                  backgroundColor: question.kind === 'mcq' ? '#1e3a8a' : question.kind === 'coding' ? '#7c3aed' : '#be185d',
                  color: question.kind === 'mcq' ? '#93c5fd' : question.kind === 'coding' ? '#c4b5fd' : '#f9a8d4'
                }}>
                  {question.kind === 'mcq' ? 'MCQ' : question.kind === 'coding' ? 'Coding' : 'Theory'}
                </span>
              </div>
              
              {question.kind === 'mcq' ? (
                <>
              <p>
                Your Answer:{" "}
                <span style={{ color: response?.selectedOption ? "green" : "red" }}>
                  {response?.selectedOption || "Not answered"}
                </span>
              </p>
              <p>Correct Answer: {question.answer}</p>
                </>
              ) : (
                <div>
                  <p>Your Answer:</p>
                  <div style={{
                    backgroundColor: '#374151',
                    padding: '12px',
                    borderRadius: '6px',
                    marginTop: '4px',
                    whiteSpace: 'pre-wrap',
                    color: '#e5e7eb'
                  }}>
                    {response?.textAnswer || "No answer provided"}
                  </div>
                </div>
              )}
              
              <p>
                Points Earned: {response?.points ?? 0} / {question.points || 1}
              </p>
              
              {/* Show comprehensive feedback for coding and theory questions */}
              {(question.kind === 'coding' || question.kind === 'theory') && response?.geminiFeedback && (
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Main Feedback */}
                  <div style={{
                    backgroundColor: '#1e3a8a',
                    borderLeft: '4px solid #3b82f6',
                    padding: '16px',
                    borderRadius: '6px'
                  }}>
                    <h5 style={{ color: '#93c5fd', fontWeight: '600', marginBottom: '8px' }}>📝 Feedback:</h5>
                    <p style={{ color: '#bfdbfe', fontSize: '14px', lineHeight: '1.5' }}>
                      {response.geminiFeedback}
                    </p>
                  </div>

                  {/* Correct Answer */}
                  {response.correctAnswer && (
                    <div style={{
                      backgroundColor: '#064e3b',
                      borderLeft: '4px solid #10b981',
                      padding: '16px',
                      borderRadius: '6px'
                    }}>
                      <h5 style={{ color: '#6ee7b7', fontWeight: '600', marginBottom: '8px' }}>✅ Correct Answer:</h5>
                      <div style={{
                        color: '#a7f3d0',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        whiteSpace: 'pre-wrap',
                        backgroundColor: '#374151',
                        padding: '12px',
                        borderRadius: '4px'
                      }}>
                        {response.correctAnswer}
                      </div>
                    </div>
                  )}

                  {/* Error Analysis */}
                  {response.errorAnalysis && (
                    <div style={{
                      backgroundColor: '#7f1d1d',
                      borderLeft: '4px solid #ef4444',
                      padding: '16px',
                      borderRadius: '6px'
                    }}>
                      <h5 style={{ color: '#fca5a5', fontWeight: '600', marginBottom: '8px' }}>🔍 What's Wrong:</h5>
                      <p style={{ color: '#fecaca', fontSize: '14px', lineHeight: '1.5' }}>
                        {response.errorAnalysis}
                      </p>
                    </div>
                  )}

                  {/* Improvement Steps */}
                  {response.improvementSteps && response.improvementSteps.length > 0 && (
                    <div style={{
                      backgroundColor: '#78350f',
                      borderLeft: '4px solid #f59e0b',
                      padding: '16px',
                      borderRadius: '6px'
                    }}>
                      <h5 style={{ color: '#fcd34d', fontWeight: '600', marginBottom: '8px' }}>🚀 How to Improve:</h5>
                      <div style={{
                        color: '#fde68a',
                        fontSize: '14px',
                        lineHeight: '1.5'
                      }}>
                        {Array.isArray(response.improvementSteps) ? (
                          <ul style={{ margin: 0, paddingLeft: '20px' }}>
                            {response.improvementSteps.map((step, index) => (
                              <li key={index} style={{ marginBottom: '4px' }}>{step}</li>
                            ))}
                          </ul>
                        ) : (
                          <div style={{ whiteSpace: 'pre-wrap' }}>{response.improvementSteps}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Topic Recommendations */}
                  {response.topicRecommendations && response.topicRecommendations.length > 0 && (
                    <div style={{
                      backgroundColor: '#581c87',
                      borderLeft: '4px solid #8b5cf6',
                      padding: '16px',
                      borderRadius: '6px'
                    }}>
                      <h5 style={{ color: '#c4b5fd', fontWeight: '600', marginBottom: '8px' }}>📚 Focus Areas:</h5>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {response.topicRecommendations.map((topic, index) => (
                          <span
                            key={index}
                            style={{
                              padding: '4px 12px',
                              backgroundColor: '#7c3aed',
                              color: '#e9d5ff',
                              fontSize: '12px',
                              borderRadius: '16px',
                              border: '1px solid #8b5cf6'
                            }}
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Show status for coding/theory questions */}
              {(question.kind === 'coding' || question.kind === 'theory') && (
                <div style={{
                  backgroundColor: '#374151',
                  borderLeft: '4px solid #6b7280',
                  padding: '8px',
                  borderRadius: '6px',
                  marginTop: '12px'
                }}>
                  <p style={{ color: '#d1d5db', fontSize: '14px', fontWeight: '500' }}>
                    {response?.textAnswer ? "✓ Answer Submitted" : "⚠ Not Answered"}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ViewTestResults;
