import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import apiRequest from "../services/api";
import JsonQuestionUploader from "../components/JsonQuestionUploader";
import Editor from "@monaco-editor/react";

const emptyQuestion = (kind) => ({
  id: crypto.randomUUID(),
  kind,
  text: "",
  points: 1,
  ...(kind === "mcq" && {
    options: ["", "", "", ""],
    answer: "",
  }),
  ...(kind === "msq" && {
    options: ["", "", "", ""],
    answers: [],
  }),
  ...(kind === "theory" && {
    guidelines: "",
    examples: [],
  }),
  ...(kind === "coding" && {
    guidelines: "",
    examples: [],
  }),
});

export default function CreateTest() {
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("id");
  const isEdit = !!editId;

  const [form, setForm] = useState({
    title: "",
    subject: "",
    type: "mixed",
    instructions: "",
    timeLimit: 30,
    negativeMarkingPercent: 0,
    questions: [emptyQuestion("mcq")],
  });
  const [assignmentOptions, setAssignmentOptions] = useState({
    assignToAll: false,
    startTime: "",
    duration: "",
  });
  const [students, setStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [assignmentMode, setAssignmentMode] = useState("all"); // "all", "manual", "ru", "su"
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectDescription, setNewSubjectDescription] = useState("");
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [createdOtp, setCreatedOtp] = useState("");
  const nav = useNavigate();

  // Fetch subjects on component mount
  useEffect(() => {
    fetchSubjects();
  }, []);

  // Fetch test data if editing
  useEffect(() => {
    if (isEdit) {
      fetchTestData();
    }
  }, [isEdit, editId]);

  const fetchTestData = async () => {
    try {
      setLoading(true);
      const test = await apiRequest(`/tests/${editId}`);
      setForm({
        title: test.title,
        subject: test.subject || "",
        type: test.type,
        instructions: test.instructions,
        timeLimit: test.timeLimit,
        negativeMarkingPercent: test.negativeMarkingPercent || 0,
        questions: test.questions.map((q) => ({
          id: crypto.randomUUID(),
          kind: q.kind === "theoretical" ? "theory" : q.kind,
          text: q.text,
          points: q.points,
          ...(q.kind === "mcq" && {
            options: q.options.map((opt) => opt.text),
            answer: q.answer,
          }),
          ...(q.kind === "msq" && {
            options: q.options.map((opt) => opt.text),
            answers: q.answers || [],
          }),

          ...(q.kind === "coding" && {
            guidelines: q.guidelines,
            examples: q.examples || [],
          }),
          ...(q.kind === "theory" && {
            guidelines: q.guidelines,
            examples: q.examples || [],
          }),
        })),
      });
    } catch (error) {
      console.error("Error fetching test:", error);
      alert("Error loading test data");
      nav("/admin/tests");
    } finally {
      setLoading(false);
    }
  };

  // Fetch students when manual assignment mode is selected
  useEffect(() => {
    if (assignmentMode === "manual" && assignmentOptions.assignToAll) {
      fetchStudents();
    }
  }, [assignmentMode, assignmentOptions.assignToAll]);

  const fetchStudents = async () => {
    try {
      const data = await apiRequest("/users");
      const studentUsers = data.filter((user) => user.role === "Student");
      setStudents(studentUsers);
    } catch (err) {
      console.error("Error fetching students:", err);
    }
  };

  // Toggle student selection
  const toggleStudentSelection = (studentId) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  // Select all students
  const selectAllStudents = () => {
    const filteredStudentIds = filteredStudents.map((student) => student._id);
    setSelectedStudents(filteredStudentIds);
  };

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedStudents([]);
  };

  // Filter students based on search query
  const filteredStudents = students.filter(
    (student) =>
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addQuestion = (kind) => {
    setForm((prev) => ({
      ...prev,
      questions: [...prev.questions, emptyQuestion(kind)],
    }));
  };

  const removeQuestion = (id) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((q) => q.id !== id),
    }));
  };

  const updateQuestion = (id, field, value) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === id ? { ...q, [field]: value } : q
      ),
    }));
  };

  const updateOption = (questionId, index, value) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.map((opt, i) => (i === index ? value : opt)),
            }
          : q
      ),
    }));
  };

  const addExample = (questionId) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              examples: [...(q.examples || []), { input: "", output: "" }],
            }
          : q
      ),
    }));
  };

  const removeExample = (questionId, exampleIndex) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              examples: q.examples.filter((_, i) => i !== exampleIndex),
            }
          : q
      ),
    }));
  };

  const updateExample = (questionId, exampleIndex, field, value) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              examples: q.examples.map((ex, i) =>
                i === exampleIndex ? { ...ex, [field]: value } : ex
              ),
            }
          : q
      ),
    }));
  };

  const handleQuestionsUpload = (uploadedQuestions) => {
    const normalized = uploadedQuestions.map((q) => ({
      ...q,
      kind: q.kind === "theoretical" ? "theory" : q.kind,
    }));

    setForm((prev) => ({
      ...prev,
      questions: uploadedQuestions,
    }));
  };

  const fetchSubjects = async () => {
    try {
      const data = await apiRequest("/subjects");
      setSubjects(data.subjects || []);
    } catch (error) {
      console.error("Error fetching subjects:", error);
    }
  };

  const handleAddSubject = async () => {
    if (!newSubjectName.trim()) {
      alert("Subject name is required");
      return;
    }

    try {
      const newSubject = await apiRequest("/subjects", {
        method: "POST",
        body: JSON.stringify({
          name: newSubjectName.trim(),
          description: newSubjectDescription.trim(),
        }),
      });

      setSubjects((prev) => [...prev, newSubject]);
      setForm((prev) => ({ ...prev, subject: newSubject.name }));
      setNewSubjectName("");
      setNewSubjectDescription("");
      setShowSubjectModal(false);
    } catch (error) {
      alert(error.message || "Error adding subject");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        title: form.title.trim(),
        subject: form.subject.trim(),
        type: form.type,
        instructions: form.instructions,
        timeLimit: Number(form.timeLimit),
        negativeMarkingPercent: Number(form.negativeMarkingPercent),
        questions: form.questions.map((q) => ({
          kind: q.kind,
          text: q.text,
          points: Number(q.points),
          ...(q.kind === "mcq" && {
            options: q.options.map((opt) => ({ text: opt })),
            answer: q.answer,
          }),
          ...(q.kind === "msq" && {
            options: q.options.map((opt) => ({ text: opt })),
            answers: q.answers || [],
          }),

          ...(q.kind === "coding" && {
            guidelines: q.guidelines,
            examples: q.examples || [],
          }),
          ...(q.kind === "theory" && {
            guidelines: q.guidelines,
            examples: q.examples || [],
          }),
        })),
      };

      if (isEdit) {
        // Update existing test
        await apiRequest(`/tests/${editId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        // Create new test
        const createdTest = await apiRequest("/tests", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        // Check if assignment is enabled
        if (assignmentOptions.assignToAll) {
          // Convert local datetime string to ISO string with timezone offset
          const startTimeISO = new Date(
            assignmentOptions.startTime
          ).toISOString();

          if (assignmentMode === "all") {
            await apiRequest("/assignments/assign-all", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                testId: createdTest._id,
                startTime: startTimeISO,
                duration: parseInt(assignmentOptions.duration),
              }),
            });
          } else if (
            assignmentMode === "manual" &&
            selectedStudents.length > 0
          ) {
            await apiRequest("/assignments/assign-manual", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                testId: createdTest._id,
                studentIds: selectedStudents,
                startTime: startTimeISO,
                duration: parseInt(assignmentOptions.duration),
              }),
            });
          } else if (assignmentMode === "ru") {
            await apiRequest("/assignments/assign-ru", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                testId: createdTest._id,
                startTime: startTimeISO,
                duration: parseInt(assignmentOptions.duration),
              }),
            });
          } else if (assignmentMode === "su") {
            await apiRequest("/assignments/assign-su", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                testId: createdTest._id,
                startTime: startTimeISO,
                duration: parseInt(assignmentOptions.duration),
              }),
            });
          }
        }
      }

      nav("/admin/tests");
    } catch (error) {
      alert(error.message || `Error ${isEdit ? "updating" : "creating"} test`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">
          {isEdit ? "Edit Test" : "Create New Test"}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Test Info */}
          <div className="bg-slate-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Test Information</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Test Title *
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Subject *
                </label>
                <div className="flex gap-2 items-center">
                  <select
                    value={form.subject}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, subject: e.target.value }))
                    }
                    className="flex-1 p-3 bg-slate-700 border border-slate-600 rounded-md"
                    required
                  >
                    <option value="" disabled>
                      Select a subject
                    </option>
                    {subjects.map((subject) => (
                      <option key={subject._id} value={subject.name}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowSubjectModal(true)}
                    className="px-3 py-2 bg-blue-600 rounded text-white text-sm"
                    title="Add Subject"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Test Type
                </label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, type: e.target.value }))
                  }
                  className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md"
                >
                  <option value="mixed">Mixed (All Types)</option>
                  <option value="mcq">MCQ Only</option>
                  <option value="msq">MSQ Only</option>
                  <option value="coding">Coding Only</option>
                  <option value="theory">Theory Only</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Time Limit (minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.timeLimit}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, timeLimit: e.target.value }))
                  }
                  className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Negative Marking (%)
                </label>
                <select
                  value={form.negativeMarkingPercent}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      negativeMarkingPercent: Number(e.target.value),
                    }))
                  }
                  className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md"
                >
                  <option value={0}>No Negative Marking</option>
                  <option value={0.25}>25%</option>
                  <option value={0.5}>50%</option>
                  <option value={0.75}>75%</option>
                  <option value={1}>100%</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">
                Instructions
              </label>
              <textarea
                value={form.instructions}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, instructions: e.target.value }))
                }
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
                  onChange={(e) =>
                    setAssignmentOptions((prev) => ({
                      ...prev,
                      assignToAll: e.target.checked,
                    }))
                  }
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
                    <div className="grid grid-cols-2 gap-4">
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
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="ru"
                          checked={assignmentMode === "ru"}
                          onChange={() => setAssignmentMode("ru")}
                          className="mr-2"
                        />
                        Assign to RU Students
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          value="su"
                          checked={assignmentMode === "su"}
                          onChange={() => setAssignmentMode("su")}
                          className="mr-2"
                        />
                        Assign to SU Students
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
                      onChange={(e) =>
                        setAssignmentOptions((prev) => ({
                          ...prev,
                          startTime: e.target.value,
                        }))
                      }
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
                      onChange={(e) =>
                        setAssignmentOptions((prev) => ({
                          ...prev,
                          duration: e.target.value,
                        }))
                      }
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
                          className="px-3 py-2 bg-blue-600 text-white rounded text-sm cursor-pointer"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={clearAllSelections}
                          className="px-3 py-2 bg-gray-600 text-white rounded text-sm cursor-pointer"
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
                            <label
                              key={student._id}
                              className="flex items-center p-3 border-b border-slate-600 last:border-b-0 hover:bg-slate-600 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedStudents.includes(student._id)}
                                onChange={() =>
                                  toggleStudentSelection(student._id)
                                }
                                className="mr-3"
                              />
                              <div>
                                <div className="font-medium text-white">
                                  {student.name}
                                </div>
                                <div className="text-sm text-gray-400">
                                  {student.email}
                                </div>
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
              <div className="flex gap-2 flex-wrap">
                {form.type === "mixed" && (
                  <>
                    <button
                      type="button"
                      onClick={() => addQuestion("mcq")}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer"
                    >
                      Add MCQ
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestion("msq")}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md cursor-pointer"
                    >
                      Add MSQ
                    </button>

                    <button
                      type="button"
                      onClick={() => addQuestion("coding")}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-md cursor-pointer"
                    >
                      Add Coding
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestion("theory")}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md cursor-pointer"
                    >
                      Add Theory
                    </button>
                  </>
                )}
                {form.type !== "mixed" && (
                  <button
                    type="button"
                    onClick={() => addQuestion(form.type)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer"
                  >
                    Add Question
                  </button>
                )}
              </div>
            </div>

            {form.questions.map((question, index) => (
              <div
                key={question.id}
                className="bg-slate-700 p-4 rounded-lg mb-4"
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold">Question {index + 1}</h3>
                  {form.questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(question.id)}
                      className="text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Question Text *
                    </label>
                    <textarea
                      value={question.text}
                      onChange={(e) =>
                        updateQuestion(question.id, "text", e.target.value)
                      }
                      className="w-full p-3 bg-slate-600 border border-slate-500 rounded-md"
                      rows={2}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Points
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={question.points}
                      onChange={(e) =>
                        updateQuestion(question.id, "points", e.target.value)
                      }
                      className="w-full p-3 bg-slate-600 border border-slate-500 rounded-md"
                    />
                  </div>

                  {question.kind === "mcq" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Options
                        </label>
                        {question.options.map((option, optIndex) => (
                          <div
                            key={optIndex}
                            className="flex items-center mb-2"
                          >
                            <input
                              type="radio"
                              name={`answer-${question.id}`}
                              checked={question.answer === option}
                              onChange={() =>
                                updateQuestion(question.id, "answer", option)
                              }
                              className="mr-3"
                            />
                            <input
                              type="text"
                              value={option}
                              onChange={(e) =>
                                updateOption(
                                  question.id,
                                  optIndex,
                                  e.target.value
                                )
                              }
                              className="flex-1 p-2 bg-slate-600 border border-slate-500 rounded-md"
                              placeholder={`Option ${optIndex + 1}`}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {question.kind === "msq" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Options
                        </label>
                        {question.options.map((option, optIndex) => (
                          <div
                            key={optIndex}
                            className="flex items-center mb-2"
                          >
                            <input
                              type="checkbox"
                              checked={
                                question.answers?.includes(option) || false
                              }
                              onChange={(e) => {
                                const currentAnswers = question.answers || [];
                                const newAnswers = currentAnswers.includes(
                                  option
                                )
                                  ? currentAnswers.filter(
                                      (ans) => ans !== option
                                    )
                                  : [...currentAnswers, option];
                                updateQuestion(
                                  question.id,
                                  "answers",
                                  newAnswers
                                );
                              }}
                              className="mr-3"
                            />
                            <input
                              type="text"
                              value={option}
                              onChange={(e) =>
                                updateOption(
                                  question.id,
                                  optIndex,
                                  e.target.value
                                )
                              }
                              className="flex-1 p-2 bg-slate-600 border border-slate-500 rounded-md"
                              placeholder={`Option ${optIndex + 1}`}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {question.kind === "coding" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Guidelines (Optional)
                        </label>
                        <Editor
                          height="200px"
                          defaultLanguage="plaintext"
                          value={question.guidelines || ""}
                          onChange={(value) =>
                            updateQuestion(
                              question.id,
                              "guidelines",
                              value || ""
                            )
                          }
                          theme="vs-dark"
                          options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            lineNumbers: "off",
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            wordWrap: "on",
                            padding: { top: 16, bottom: 16 },
                            placeholder:
                              "Enter evaluation guidelines for this coding question...",
                          }}
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-sm font-medium">
                            Examples (Optional)
                          </label>
                          <button
                            type="button"
                            onClick={() => addExample(question.id)}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded cursor-pointer"
                          >
                            Add Example
                          </button>
                        </div>

                        {(question.examples || []).map((example, exIndex) => (
                          <div
                            key={exIndex}
                            className="bg-slate-600 p-3 rounded mb-2"
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-medium">
                                Example {exIndex + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  removeExample(question.id, exIndex)
                                }
                                className="text-red-400 hover:text-red-300 text-sm cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium mb-1 text-gray-300">
                                  Input
                                </label>
                                <textarea
                                  value={example.input}
                                  onChange={(e) =>
                                    updateExample(
                                      question.id,
                                      exIndex,
                                      "input",
                                      e.target.value
                                    )
                                  }
                                  className="w-full p-2 bg-slate-500 border border-slate-400 rounded text-sm"
                                  rows={2}
                                  placeholder="Enter input example..."
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium mb-1 text-gray-300">
                                  Output
                                </label>
                                <textarea
                                  value={example.output}
                                  onChange={(e) =>
                                    updateExample(
                                      question.id,
                                      exIndex,
                                      "output",
                                      e.target.value
                                    )
                                  }
                                  className="w-full p-2 bg-slate-500 border border-slate-400 rounded text-sm"
                                  rows={2}
                                  placeholder="Enter expected output..."
                                />
                              </div>
                            </div>
                          </div>
                        ))}

                        {(question.examples || []).length === 0 && (
                          <div className="text-center text-gray-400 text-sm py-4">
                            No examples added yet. Click "Add Example" to add
                            input/output examples.
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {question.kind === "theory" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Answer
                        </label>
                        <textarea
                          value={question.answer || ""}
                          onChange={(e) =>
                            updateQuestion(
                              question.id,
                              "answer",
                              e.target.value
                            )
                          }
                          className="w-full p-3 bg-slate-600 border border-slate-500 rounded-md"
                          rows={3}
                          placeholder="Enter answer here..."
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Guidelines (Optional)
                        </label>
                        <Editor
                          height="200px"
                          defaultLanguage="plaintext"
                          value={question.guidelines || ""}
                          onChange={(value) =>
                            updateQuestion(
                              question.id,
                              "guidelines",
                              value || ""
                            )
                          }
                          theme="vs-dark"
                          options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            lineNumbers: "off",
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            wordWrap: "on",
                            padding: { top: 16, bottom: 16 },
                            placeholder:
                              "Enter evaluation guidelines for this question...",
                          }}
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-sm font-medium">
                            Examples (Optional)
                          </label>
                          <button
                            type="button"
                            onClick={() => addExample(question.id)}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded cursor-pointer"
                          >
                            Add Example
                          </button>
                        </div>

                        {(question.examples || []).map((example, exIndex) => (
                          <div
                            key={exIndex}
                            className="bg-slate-600 p-3 rounded mb-2"
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-medium">
                                Example {exIndex + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  removeExample(question.id, exIndex)
                                }
                                className="text-red-400 hover:text-red-300 text-sm cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium mb-1 text-gray-300">
                                  Input
                                </label>
                                <textarea
                                  value={example.input}
                                  onChange={(e) =>
                                    updateExample(
                                      question.id,
                                      exIndex,
                                      "input",
                                      e.target.value
                                    )
                                  }
                                  className="w-full p-2 bg-slate-500 border border-slate-400 rounded text-sm"
                                  rows={2}
                                  placeholder="Enter input example..."
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium mb-1 text-gray-300">
                                  Output
                                </label>
                                <textarea
                                  value={example.output}
                                  onChange={(e) =>
                                    updateExample(
                                      question.id,
                                      exIndex,
                                      "output",
                                      e.target.value
                                    )
                                  }
                                  className="w-full p-2 bg-slate-500 border border-slate-400 rounded text-sm"
                                  rows={2}
                                  placeholder="Enter expected output..."
                                />
                              </div>
                            </div>
                          </div>
                        ))}

                        {(question.examples || []).length === 0 && (
                          <div className="text-center text-gray-400 text-sm py-4">
                            No examples added yet. Click "Add Example" to add
                            input/output examples.
                          </div>
                        )}
                      </div>
                    </>
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
              className="px-6 py-3 bg-white text-black font-semibold rounded-md hover:bg-gray-100 disabled:opacity-50 cursor-pointer"
            >
              {loading
                ? isEdit
                  ? "Updating..."
                  : "Creating..."
                : isEdit
                ? "Update Test"
                : "Create Test"}
            </button>
          </div>
        </form>
      </div>

      {/* Add Subject Modal */}
      {showSubjectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-lg w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">Add New Subject</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Subject Name *
                </label>
                <input
                  type="text"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md"
                  placeholder="e.g., Mathematics, Physics"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={newSubjectDescription}
                  onChange={(e) => setNewSubjectDescription(e.target.value)}
                  rows={3}
                  className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md"
                  placeholder="Brief description of the subject..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowSubjectModal(false);
                  setNewSubjectName("");
                  setNewSubjectDescription("");
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddSubject}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Add Subject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
