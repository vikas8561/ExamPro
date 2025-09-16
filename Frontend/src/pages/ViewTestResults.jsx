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
              <h3>
                Q{index + 1}: {question.text}
              </h3>
              <p>
                Your Answer:{" "}
                <span style={{ color: response?.selectedOption ? "green" : "red" }}>
                  {response?.selectedOption || "Not answered"}
                </span>
              </p>
              <p>Correct Answer: {question.answer}</p>
              <p>
                Points Earned: {response?.points ?? 0} / {question.points || 1}
              </p>
              {response?.geminiFeedback && (
                <p>Feedback: {response.geminiFeedback}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ViewTestResults;
