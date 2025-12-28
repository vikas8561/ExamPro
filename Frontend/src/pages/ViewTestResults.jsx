import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import apiRequest from "../services/api";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-white mb-6">Test Results</h2>
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
          const response = responses.find((r) => {
            const responseQId = r.questionId?._id || r.questionId;
            return responseQId?.toString() === question._id.toString();
          });

          // Get language from response (should be stored there)
          const answerLanguage = response?.language || (question.kind === "coding" ? question.language : null) || 'python';
          
          // Map language to Monaco Editor language
          const getMonacoLanguage = (kind, lang) => {
            if (kind === 'mcq') return 'plaintext';
            if (lang === 'javascript') return 'javascript';
            if (lang === 'cpp' || lang === 'c++') return 'cpp';
            if (lang === 'c') return 'c';
            if (lang === 'java') return 'java';
            if (lang === 'go') return 'go';
            return 'python';
          };
          const monacoLanguage = getMonacoLanguage(question.kind, answerLanguage);

          return (
            <div key={question._id} className="question">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3>
                Q{index + 1}: {question.text}
              </h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                  {question.kind === 'coding' && answerLanguage && (
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      backgroundColor: '#374151',
                      color: '#d1d5db'
                    }}>
                      Language: {answerLanguage}
                    </span>
                  )}
                </div>
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
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    marginTop: '8px'
                  }}>
                    <SyntaxHighlighter
                      language={answerLanguage || 'python'}
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        padding: '16px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        minHeight: '200px',
                        maxHeight: '400px',
                        overflow: 'auto',
                        backgroundColor: '#1e1e1e'
                      }}
                      showLineNumbers={true}
                      lineNumberStyle={{
                        minWidth: '3em',
                        paddingRight: '1em',
                        color: '#858585',
                        backgroundColor: '#252526'
                      }}
                    >
                      {response?.textAnswer || "No answer provided"}
                    </SyntaxHighlighter>
                  </div>
                </div>
              )}
              
              <p>
                Points Earned: {response?.points ?? 0} / {question.points || 1}
              </p>
              
              {/* Gemini feedback removed */}
              
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
    </div>
  );
};

export default ViewTestResults;
