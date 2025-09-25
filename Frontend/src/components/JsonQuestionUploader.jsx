import React, { useState, useRef } from 'react';

const JsonQuestionUploader = ({ onQuestionsLoaded }) => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [success, setSuccess] = useState(false);
  const [questionsCount, setQuestionsCount] = useState(0);
  const fileInputRef = useRef(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/json') {
      setError('Please upload a valid JSON file');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);
    setUploadedFile(file);

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
            examples: q.kind === 'coding' ? q.examples || [] : undefined,
            points: q.points || 1
          };
        });

        setQuestionsCount(validatedQuestions.length);
        onQuestionsLoaded(validatedQuestions);
        setSuccess(true);
        setLoading(false);
      } catch (err) {
        setError(err.message || 'Invalid JSON format');
        setLoading(false);
        setSuccess(false);
      }
    };

    reader.readAsText(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const file = files[0];
      if (file.type === 'application/json') {
        const event = {
          target: {
            files: [file]
          }
        };
        handleFileUpload(event);
      } else {
        setError('Please upload a valid JSON file');
      }
    }
  };

  const clearFile = () => {
    setUploadedFile(null);
    setSuccess(false);
    setError('');
    setQuestionsCount(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-600/50 p-6 rounded-xl mb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-green-600/20 rounded-lg">
          <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <div>
          <h4 className="text-xl font-semibold">Bulk Upload Questions (JSON)</h4>
          <p className="text-sm text-slate-400">Upload multiple questions at once using a JSON file</p>
        </div>
      </div>

      {/* Upload Area */}
      <div className="mb-6">
        <div
          className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
            loading 
              ? 'border-blue-500/50 bg-blue-500/10' 
              : error 
                ? 'border-red-500/50 bg-red-500/10' 
                : success 
                  ? 'border-green-500/50 bg-green-500/10'
                  : 'border-slate-500/50 bg-slate-700/30 hover:border-slate-400/50 hover:bg-slate-700/50'
          }`}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={loading}
          />
          
          {loading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <div className="text-blue-400 font-medium">Processing file...</div>
              <div className="text-sm text-slate-400">Validating questions and parsing JSON</div>
            </div>
          ) : success ? (
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 bg-green-600/20 rounded-full">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-green-400 font-medium">Upload Successful!</div>
              <div className="text-sm text-slate-300">
                {questionsCount} question{questionsCount !== 1 ? 's' : ''} loaded from {uploadedFile?.name}
              </div>
              <button
                onClick={clearFile}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-all duration-200 text-sm"
              >
                Upload Another File
              </button>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 bg-red-600/20 rounded-full">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="text-red-400 font-medium">Upload Failed</div>
              <div className="text-sm text-red-300 max-w-md">{error}</div>
              <button
                onClick={clearFile}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-all duration-200 text-sm"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="p-3 bg-slate-600/50 rounded-full">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="text-slate-300 font-medium">Drop your JSON file here</div>
              <div className="text-sm text-slate-400">or click to browse files</div>
              <div className="text-xs text-slate-500">Supports .json files only</div>
            </div>
          )}
        </div>
      </div>

      {/* JSON Format Example */}
      <div className="bg-slate-700/30 rounded-lg border border-slate-500/30">
        <details className="group">
          <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-600/30 transition-all duration-200">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-slate-400 group-open:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-medium text-slate-200">JSON Format Example</span>
            </div>
            <div className="text-xs text-slate-400 bg-slate-600/50 px-2 py-1 rounded">
              Click to expand
            </div>
          </summary>
          <div className="p-4 border-t border-slate-500/30">
            <div className="bg-slate-800/50 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-slate-300 font-mono leading-relaxed">
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
      "kind": "theory",
      "text": "Explain the concept of photosynthesis.",
      "points": 5
    },
    {
      "kind": "coding",
      "text": "Write a function to calculate factorial.",
      "examples": [
        {
          "input": "5",
          "output": "120"
        },
        {
          "input": "3",
          "output": "6"
        }
      ],
      "points": 10
    }
  ]
}`}
              </pre>
            </div>
            <div className="mt-3 text-xs text-slate-400">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">Required Fields:</span>
              </div>
              <ul className="ml-6 space-y-1 text-slate-500">
                <li>• <code className="bg-slate-700/50 px-1 rounded">kind</code>: "mcq", "theory", or "coding"</li>
                <li>• <code className="bg-slate-700/50 px-1 rounded">text</code>: The question text</li>
                <li>• <code className="bg-slate-700/50 px-1 rounded">points</code>: Points for the question (optional, defaults to 1)</li>
                <li>• For MCQ: <code className="bg-slate-700/50 px-1 rounded">options</code> and <code className="bg-slate-700/50 px-1 rounded">answer</code></li>
                <li>• For Coding: <code className="bg-slate-700/50 px-1 rounded">examples</code> (optional)</li>
              </ul>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
};

export default JsonQuestionUploader;
