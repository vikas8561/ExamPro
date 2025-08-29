import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import apiRequest from "../services/api";
import JsonQuestionUploader from "../components/JsonQuestionUploader";

const emptyQuestion = (kind) => ({
  id: crypto.randomUUID(),
  kind,
  text: "",
  points: 1,
  ...(kind === "mcq" && {
    options: ["", "", "", ""],
    answer: ""
  }),
  ...(kind === "theoretical" && {
    guidelines: ""
  })
});

export default function CreateTest() {
  const [form, setForm] = useState({
    title: "",
    type: "mixed",
    instructions: "",
    timeLimit: 30,
    questions: [emptyQuestion("mcq")]
  });
  const [assignmentOptions, setAssignmentOptions] = useState({
    assignToAll: false,
    startTime: "",
    duration: ""
  });
  const [students, setStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [assignmentMode, setAssignmentMode] = useState("all"); // "all" or "manual"
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  // Fetch students when manual assignment mode is selected
  useEffect(() => {
    if (assignmentMode === "manual" && assignmentOptions.assignToAll) {
      fetchStudents();
    }
  }, [assignmentMode, assignmentOptions.assignToAll]);

  const fetchStudents = async () => {
    try {
      const data = await apiRequest("/users");
      const studentUsers = data.filter(user => user.role === "Student");
      setStudents(studentUsers);
    } catch (err) {
      console.error("Error fetching students:", err);
    }
  };

  // Toggle student selection
  const toggleStudentSelection = (studentId) => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  // Select all students
  const selectAllStudents = () => {
    const filteredStudentIds = filteredStudents.map(student => student._id);
    setSelectedStudents(filteredStudentIds);
  };

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedStudents([]);
  };

  // Filter students based on search query
  const filteredStudents = students.filter(student =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addQuestion = (kind) => {
    setForm(prev => ({
      ...prev,
      questions: [...prev.questions, emptyQuestion(kind)]
    }));
  };

  const removeQuestion = (id) => {
    setForm(prev => ({
      ...prev,
      questions: prev.questions.filter(q => q.id !== id)
    }));
  };

  const updateQuestion = (id, field, value) => {
    setForm(prev => ({
      ...prev,
      questions: prev.questions.map(q => 
        q.id === id ? { ...q, [field]: value } : q
      )
    }));
  };

  const updateOption = (questionId, index, value) => {
    setForm(prev => ({
      ...prev,
      questions: prev.questions.map(q => 
        q.id === questionId ? {
          ...q,
          options: q.options.map((opt, i) => i === index ? value : opt)
        } : q
      )
    }));
  };

  const handleQuestionsUpload = (uploadedQuestions) => {
    setForm(prev => ({
      ...prev,
      questions: uploadedQuestions
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        title: form.title.trim(),
        type: form.type,
        instructions: form.instructions,
        timeLimit: Number(form.timeLimit),
        questions: form.questions.map(q => ({
          kind: q.kind,
          text: q.text,
          points: Number(q.points),
          ...(q.kind === "mcq" && {
            options: q.options.map(opt => ({ text: opt })),
            answer: q.answer
          }),
          ...(q.kind === "theoretical" && {
            guidelines: q.guidelines
          })
        }))
      };

      const createdTest = await apiRequest("/tests", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      // Check if assignment is enabled
      if (assignmentOptions.assignToAll) {
        // Convert local datetime string to ISO string with timezone offset
        const startTimeISO = new Date(assignmentOptions.startTime).toISOString();

        if (assignmentMode === "all") {
          await apiRequest("/assignments/assign-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              testId: createdTest._id, 
              startTime: startTimeISO,
              duration: parseInt(assignmentOptions.duration)
            })
          });
        } else if (assignmentMode === "manual" && selectedStudents.length > 0) {
          await apiRequest("/assignments/assign-manual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              testId: createdTest._id, 
              studentIds: selectedStudents,
              startTime: startTimeISO,
              duration: parseInt(assignmentOptions.duration)
            })
          });
        }
      }

      nav("/admin/tests");
    } catch (error) {
      alert(error.message || "Error creating test");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Create New Test</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Test Info */}
          <div className="bg-slate-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Test Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Test Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Test Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md"
                >
                  <option value="mixed">Mixed (MCQ + Theory)</option>
                  <option value="mcq">MCQ Only</option>
                  <option value="theoretical">Theory Only</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Time Limit (minutes)</label>
                <input
                  type="number"
                  min="1"
                  value={form.timeLimit}
                  onChange={(e) => setForm(prev => ({ ...prev, timeLimit: e.target.value }))}
                  className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">Instructions</label>
              <textarea
                value={form.instructions}
                onChange={(e) => setForm(prev => ({ ...prev, instructions: e.target.value }))}
                rows={3}
                className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md"
                placeholder="Enter test instructions..."
              />
            </div>
          </div>

          {/* JSON Upload Section */}
          <JsonQuestionUploader onQuestionsLoaded={handleQuestionsUpload} />

          {/* Assignment Options Section */}
          <div className="bg-slate-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Assignment Options</h2>
            
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="assignToAll"
                  checked={assignmentOptions.assignToAll}
                  onChange={(e) => setAssignmentOptions(prev => ({ 
                    ...prev, 
                    assignToAll: e.target.checked 
                  }))}
                  className="mr-3 h-4 w-4"
                />
                <label htmlFor="assignToAll" className="text-sm font-medium">
                  Assign to all students immediately
                </label>
              </div>

              {assignmentOptions.assignToAll && (
                <>
                  {/* Assignment Mode Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Assignment Mode
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="all"
                          checked={assignmentMode === "all"}
                          onChange={() => setAssignmentMode("all")}
                          className="mr-2"
                        />
                        Assign to All Students
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="manual"
                          checked={assignmentMode === "manual"}
                          onChange={() => setAssignmentMode("manual")}
                          className="mr-2"
                        />
                        Assign to Specific Students
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Start Time *
                    </label>
                    <input
                      type="datetime-local"
                      value={assignmentOptions.startTime}
                      onChange={(e) => setAssignmentOptions(prev => ({ 
                        ...prev, 
                        startTime: e.target.value 
                      }))}
                      className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Duration (minutes) *
                    </label>
                    <input
                      type="number"
                      value={assignmentOptions.duration}
                      onChange={(e) => setAssignmentOptions(prev => ({ 
                        ...prev, 
                        duration: e.target.value 
                      }))}
                      className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md"
                      min="1"
                      required
                    />
                  </div>

                  {/* Student Selection (Manual Mode Only) */}
                  {assignmentMode === "manual" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Select Students ({selectedStudents.length} selected)
                      </label>
                      
                      {/* Search and Selection Controls */}
                      <div className="flex gap-2 mb-3">
                        <input
                          type="text"
                          placeholder="Search students..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="flex-1 p-2 bg-slate-700 border border-slate-600 rounded-md text-white"
                        />
                        <button
                          type="button"
                          onClick={selectAllStudents}
                          className="px-3 py-2 bg-blue-600 text-white rounded text-sm"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={clearAllSelections}
                          className="px-3 py-2 bg-gray-600 text-white rounded text-sm"
                        >
                          Clear All
                        </button>
                      </div>

                      {/* Students List */}
                      <div className="border border-slate-600 rounded max-h-48 overflow-y-auto bg-slate-700">
                        {filteredStudents.length === 0 ? (
                          <div className="p-3 text-center text-gray-400">
                            No students found
                          </div>
                        ) : (
                          filteredStudents.map((student) => (
                            <label key={student._id} className="flex items-center p-3 border-b border-slate-600 last:border-b-0 hover:bg-slate-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedStudents.includes(student._id)}
                                onChange={() => toggleStudentSelection(student._id)}
                                className="mr-3"
                              />
                              <div>
                                <div className="font-medium text-white">{student.name}</div>
                                <div className="text-sm text-gray-400">{student.email}</div>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Questions Section */}
          <div className="bg-slate-800 p-6 rounded-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Questions</h2>
              <div className="flex gap-2">
                {form.type === "mixed" && (
                  <>
                    <button
                      type="button"
                      onClick={() => addQuestion("mcq")}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md"
                    >
                      Add MCQ
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestion("theoretical")}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md"
                    >
                      Add Theory
                    </button>
                  </>
                )}
                {form.type !== "mixed" && (
                  <button
                    type="button"
                    onClick={() => addQuestion(form.type)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md"
                  >
                    Add Question
                  </button>
                )}
              </div>
            </div>

            {form.questions.map((question, index) => (
              <div key={question.id} className="bg-slate-700 p-4 rounded-lg mb-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold">Question {index + 1}</h3>
                  {form.questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(question.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Question Text *</label>
                    <textarea
                      value={question.text}
                      onChange={(e) => updateQuestion(question.id, "text", e.target.value)}
                      className="w-full p-3 bg-slate-600 border border-slate-500 rounded-md"
                      rows={2}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Points</label>
                    <input
                      type="number"
                      min="1"
                      value={question.points}
                      onChange={(e) => updateQuestion(question.id, "points", e.target.value)}
                      className="w-full p-3 bg-slate-600 border border-slate-500 rounded-md"
                    />
                  </div>

                  {question.kind === "mcq" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">Options</label>
                        {question.options.map((option, optIndex) => (
                          <div key={optIndex} className="flex items-center mb-2">
                            <input
                              type="radio"
                              name={`answer-${question.id}`}
                              checked={question.answer === option}
                              onChange={() => updateQuestion(question.id, "answer", option)}
                              className="mr-3"
                            />
                            <input
                              type="text"
                              value={option}
                              onChange={(e) => updateOption(question.id, optIndex, e.target.value)}
                              className="flex-1 p-2 bg-slate-600 border border-slate-500 rounded-md"
                              placeholder={`Option ${optIndex + 1}`}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {question.kind === "theoretical" && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Guidelines (Optional)</label>
                      <textarea
                        value={question.guidelines}
                        onChange={(e) => updateQuestion(question.id, "guidelines", e.target.value)}
                        className="w-full p-3 bg-slate-600 border border-slate-500 rounded-md"
                        rows={2}
                        placeholder="Guidelines for evaluating this question..."
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-white text-black font-semibold rounded-md hover:bg-gray-100 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Test"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
