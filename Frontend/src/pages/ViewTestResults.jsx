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
        <p>Total Questions: {test.questions.length}</p>
        <p>Final Score: {finalScore}</p>
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
              
              {/* Show feedback for coding and theory questions */}
              {(question.kind === 'coding' || question.kind === 'theory') && response?.geminiFeedback && (
                <div style={{
                  backgroundColor: '#1e3a8a',
                  borderLeft: '4px solid #3b82f6',
                  padding: '16px',
                  borderRadius: '6px',
                  marginTop: '12px'
                }}>
                  <h5 style={{ color: '#93c5fd', fontWeight: '600', marginBottom: '8px' }}>Feedback:</h5>
                  <p style={{ color: '#bfdbfe', fontSize: '14px', lineHeight: '1.5' }}>
                    {response.geminiFeedback}
                  </p>
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
