import React, { useState } from 'react';

const JsonQuestionUploader = ({ onQuestionsLoaded }) => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/json') {
      setError('Please upload a valid JSON file');
      return;
    }

    setLoading(true);
    setError('');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        
        // Validate JSON structure
        if (!Array.isArray(jsonData.questions)) {
          throw new Error('JSON must contain a "questions" array');
        }

        const validatedQuestions = jsonData.questions.map((q, index) => {
          if (!q.text || !q.kind) {
            throw new Error(`Question ${index + 1} must have 'text' and 'kind' fields`);
          }

          if (q.kind === 'mcq') {
            if (!Array.isArray(q.options) || q.options.length < 2) {
              throw new Error(`MCQ question ${index + 1} must have at least 2 options`);
            }
            if (!q.answer) {
              throw new Error(`MCQ question ${index + 1} must have an 'answer' field`);
            }
          }

          return {
            id: crypto.randomUUID(),
            kind: q.kind,
            text: q.text,
            options: q.kind === 'mcq' ? q.options : undefined,
            answer: q.kind === 'mcq' ? q.answer : undefined,
            examples: q.kind === 'theoretical' ? q.examples || [] : undefined,
            points: q.points || 1
          };
        });

        onQuestionsLoaded(validatedQuestions);
        setLoading(false);
      } catch (err) {
        setError(err.message || 'Invalid JSON format');
        setLoading(false);
      }
    };

    reader.readAsText(file);
  };

  return (
    <div className="mb-6 p-4 border border-slate-700 rounded-lg bg-slate-800">
      <h4 className="text-lg font-semibold mb-3">Bulk Upload Questions (JSON)</h4>
      
      <div className="mb-3">
        <label className="block mb-2 text-sm text-slate-300">
          Upload JSON file with questions:
        </label>
          <input
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-slate-600 file:text-white hover:file:bg-slate-500 cursor-pointer"
          />
      </div>

      {loading && (
        <div className="text-sm text-slate-400">Processing file...</div>
      )}

      {error && (
        <div className="text-sm text-red-400 mt-2">{error}</div>
      )}

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-slate-400 hover:text-white">
          JSON Format Example
        </summary>
        <pre className="mt-2 p-3 bg-slate-900 rounded text-xs overflow-x-auto">
{`{
  "questions": [
    {
      "kind": "mcq",
      "text": "What is 2+2?",
      "options": ["3", "4", "5", "6"],
      "answer": "4",
      "points": 2
    },
    {
      "kind": "theoretical",
      "text": "Explain the concept of photosynthesis.",
      "examples": [
        {
          "input": "Photosynthesis equation",
          "output": "6CO2 + 6H2O → C6H12O6 + 6O2"
        }
      ],
      "points": 5
    }
  ]
}`}
        </pre>
      </details>
    </div>
  );
};

export default JsonQuestionUploader;
