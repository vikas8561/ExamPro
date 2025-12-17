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
  ...(false && { // MSQ removed
    options: ["", "", "", ""],
    answers: [],
  }),
  ...(kind === "theory" && {
    // No guidelines field
  }),
  ...(kind === "coding" && {
    examples: [],
    visibleTestCases: [{ input: "", output: "" }],
    hiddenTestCases: [{ input: "", output: "", marks: 1 }],
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
    allowedTabSwitches: 0,
    questions: [],
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
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState(null);
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
        allowedTabSwitches: test.allowedTabSwitches || 0,
        questions: test.questions.map((q) => ({
          id: crypto.randomUUID(),
          kind: q.kind === "theoretical" ? "theory" : q.kind,
          text: q.text,
          points: q.points,
          ...(q.kind === "mcq" && {
            options: q.options.map((opt) => opt.text),
            answer: q.answer,
          }),
          ...(false && { // MSQ removed
            options: q.options.map((opt) => opt.text),
            answers: q.answers || [],
          }),

          ...(q.kind === "coding" && {
            examples: q.examples || [],
            visibleTestCases: (q.visibleTestCases || []).map(tc => ({ input: tc.input, output: tc.output })),
            hiddenTestCases: (q.hiddenTestCases || []).map(tc => ({ input: tc.input, output: tc.output, marks: tc.marks || 0 })),
          }),
          ...(q.kind === "theory" && {
            // No guidelines field
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

  // Get allowed question types based on test type
  const getAllowedQuestionTypes = (testType) => {
    switch (testType) {
      case "mcq":
        return ["mcq"];
      case "coding":
        return ["coding"];
      case "theory":
        return ["theory"];
      case "practice":
        return ["mcq"];
      case "mixed":
      default:
        return ["mcq", "coding", "theory"];
    }
  };

  // Check if a question type is allowed for the current test type
  const isQuestionTypeAllowed = (questionType) => {
    return getAllowedQuestionTypes(form.type).includes(questionType);
  };

  const addQuestion = (kind) => {
    // Validate that the question type is allowed for the current test type
    if (!isQuestionTypeAllowed(kind)) {
      alert(`Cannot add ${kind} questions to a ${form.type} test.`);
      return;
    }

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

  // Handle test type change and validate existing questions
  const handleTestTypeChange = (newType) => {
    const allowedTypes = getAllowedQuestionTypes(newType);
    const incompatibleQuestions = form.questions.filter(
      (q) => !allowedTypes.includes(q.kind)
    );

    if (incompatibleQuestions.length > 0) {
      const questionTypes = incompatibleQuestions.map(q => q.kind).join(", ");
      const confirmMessage = `Changing to ${newType} test will remove ${incompatibleQuestions.length} incompatible question(s) (${questionTypes}). Do you want to continue?`;
      
      if (!window.confirm(confirmMessage)) {
        return; // User cancelled, don't change test type
      }

      // Remove incompatible questions
      setForm((prev) => ({
        ...prev,
        type: newType,
        questions: prev.questions.filter((q) => allowedTypes.includes(q.kind)),
      }));
    } else {
      // No incompatible questions, safe to change
      setForm((prev) => ({
        ...prev,
        type: newType,
      }));
    }
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

  const duplicateQuestion = (id) => {
    const questionToDuplicate = form.questions.find(q => q.id === id);
    if (questionToDuplicate) {
      const duplicatedQuestion = {
        ...questionToDuplicate,
        id: crypto.randomUUID(),
        text: questionToDuplicate.text + " (Copy)",
      };
      
      setForm((prev) => ({
        ...prev,
        questions: [...prev.questions, duplicatedQuestion],
      }));
    }
  };

  const moveQuestion = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    
    setForm((prev) => {
      const newQuestions = [...prev.questions];
      const [movedQuestion] = newQuestions.splice(fromIndex, 1);
      newQuestions.splice(toIndex, 0, movedQuestion);
      return {
        ...prev,
        questions: newQuestions,
      };
    });
  };


  const handleQuestionsUpload = (uploadedQuestions) => {
    const normalized = uploadedQuestions.map((q) => ({
      ...q,
      kind: q.kind === "theoretical" ? "theory" : q.kind,
    }));

    setForm((prev) => ({
      ...prev,
      questions: normalized,
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
    
    // Check if there are any questions
    if (form.questions.length === 0) {
      alert("Please add at least one question to the test.");
      return;
    }
    
    // Check for incompatible questions
    const incompatibleQuestions = form.questions.filter(q => !isQuestionTypeAllowed(q.kind));
    if (incompatibleQuestions.length > 0) {
      alert(`Cannot submit test with ${incompatibleQuestions.length} incompatible question(s). Please remove them or change the test type.`);
      return;
    }
    
    setLoading(true);

    try {
      const payload = {
        title: form.title.trim(),
        subject: form.subject.trim(),
        type: form.type,
        instructions: form.instructions,
        timeLimit: Number(form.timeLimit),
        negativeMarkingPercent: Number(form.negativeMarkingPercent),
        allowedTabSwitches: Number(form.allowedTabSwitches),
        questions: form.questions.map((q) => ({
          kind: q.kind,
          text: q.text,
          points: Number(q.points),
          ...(q.kind === "mcq" && {
            options: q.options.map((opt) => ({ text: opt })),
            answer: q.answer,
          }),
          ...(false && { // MSQ removed
            options: q.options.map((opt) => ({ text: opt })),
            answers: q.answers || [],
          }),

          ...(q.kind === "coding" && {
            examples: q.examples || [],
            visibleTestCases: (q.visibleTestCases || []).map(tc => ({ input: tc.input, output: tc.output })),
            hiddenTestCases: (q.hiddenTestCases || []).map(tc => ({ input: tc.input, output: tc.output, marks: Number(tc.marks || 0) })),
          }),
          ...(q.kind === "theory" && {
            // No guidelines field
          }),
        })),
      };
      console.log('DEBUG: Frontend sending payload:', payload);

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

        // Show OTP modal for new test
        setCreatedOtp(createdTest.otp);
        setShowOtpModal(true);
      }

      if (isEdit) {
        nav("/admin/tests");
      }
    } catch (error) {
      alert(error.message || `Error ${isEdit ? "updating" : "creating"} test`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="p-6 min-h-screen flex flex-col"
      style={{ backgroundColor: "#0B1220" }}
    >
      <div className="max-w-5xl mx-auto w-full">
        {/* Header / Navbar-style section to match admin panel */}
        <div className="mb-8">
          <div className="relative bg-slate-800/95 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-lg">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* Left: Icon + Title */}
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-700/60 rounded-xl">
                  <svg
                    className="h-8 w-8 text-gray-200"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold" style={{ color: "#E5E7EB" }}>
          {isEdit ? "Edit Test" : "Create New Test"}
        </h1>
                  <p className="text-slate-400 text-sm mt-1">
                    Configure test details, questions, and assignment options
                  </p>
                </div>
              </div>

              {/* Right: Back button */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => nav("/admin/tests")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 shadow-sm hover:shadow-md"
                  style={{
                    backgroundColor: "rgba(15, 23, 42, 0.9)",
                    color: "#E5E7EB",
                    border: "1px solid rgba(148, 163, 184, 0.6)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(30, 64, 175, 0.6)";
                    e.currentTarget.style.borderColor = "rgba(191, 219, 254, 0.9)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(15, 23, 42, 0.9)";
                    e.currentTarget.style.borderColor = "rgba(148, 163, 184, 0.6)";
                  }}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  <span>Back to Tests</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Test Info */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-600/50 p-6 rounded-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-600/20 rounded-lg">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        <div>
            <h2 className="text-xl font-semibold">Test Information</h2>
            <p className="text-sm text-slate-400">Configure the basic details of your test</p>
          </div>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-500/30">
          <label className="block text-sm font-medium mb-3 text-slate-200">
            Test Title *
          </label>
          <div className="relative">
          <input
            type="text"
            value={form.title}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, title: e.target.value }))
            }
              className="w-full p-4 bg-slate-600/50 border border-slate-500/50 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
              placeholder="Enter test title..."
            required
          />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {form.title.length} characters
          </div>
        </div>

        <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-500/30">
          <label className="block text-sm font-medium mb-3 text-slate-200">
            Subject *
          </label>
          <div className="flex gap-2 items-center">
            <div className="flex-1 relative">
            <select
              value={form.subject}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, subject: e.target.value }))
              }
                className="w-full p-4 bg-slate-600/50 border border-slate-500/50 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 appearance-none cursor-pointer"
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
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSubjectModal(true)}
              className="px-4 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-xl flex items-center gap-2"
              title="Add Subject"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>
        </div>

        <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-500/30">
          <label className="block text-sm font-medium mb-3 text-slate-200">
            Test Type
          </label>
          <div className="relative">
          <select
            value={form.type}
            onChange={(e) => handleTestTypeChange(e.target.value)}
              className="w-full p-4 bg-slate-600/50 border border-slate-500/50 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 appearance-none cursor-pointer"
          >
            <option value="mixed">Mixed (All Types)</option>
            <option value="mcq">MCQ Only</option>
            <option value="coding">Coding Only</option>
            <option value="theory">Theory Only</option>
            <option value="practice">Practice Test (MCQ Only)</option>
          </select>
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          
          {/* Show allowed question types */}
          <div className="mt-3 p-3 bg-slate-600/30 rounded-lg border border-slate-500/30">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-slate-300">Allowed question types:</span>
            </div>
            <div className="flex flex-wrap gap-2">
            {getAllowedQuestionTypes(form.type).map(type => {
                const typeConfig = {
                  mcq: { label: "MCQ", color: "bg-blue-600/20 text-blue-300 border-blue-500/30" },
                  coding: { label: "Coding", color: "bg-orange-600/20 text-orange-300 border-orange-500/30" },
                  theory: { label: "Theory", color: "bg-red-600/20 text-red-300 border-red-500/30" }
                };
                const config = typeConfig[type] || { label: type, color: "bg-gray-600/20 text-gray-300 border-gray-500/30" };
                return (
                  <span key={type} className={`px-2 py-1 rounded-full text-xs font-medium border ${config.color}`}>
                    {config.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-500/30">
          <label className="block text-sm font-medium mb-3 text-slate-200">
            Time Limit (minutes)
          </label>
          <div className="relative">
          <input
            type="number"
            min="1"
              max="300"
            value={form.timeLimit}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, timeLimit: e.target.value }))
            }
              className="w-full p-4 bg-slate-600/50 border border-slate-500/50 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
              placeholder="30"
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm">
              min
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Duration students have to complete the exam
          </div>
        </div>

        {form.type !== "practice" && form.type !== "coding" && (
          <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-500/30">
            <label className="block text-sm font-medium mb-3 text-slate-200">
              Negative Marking (%)
            </label>
            <div className="relative">
            <select
              value={form.negativeMarkingPercent}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  negativeMarkingPercent: Number(e.target.value),
                }))
              }
                className="w-full p-4 bg-slate-600/50 border border-slate-500/50 rounded-lg focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all duration-200 appearance-none cursor-pointer"
            >
              <option value={0}>No Negative Marking</option>
              <option value={0.25}>25%</option>
              <option value={0.5}>50%</option>
              <option value={0.75}>75%</option>
              <option value={1}>100%</option>
            </select>
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {form.negativeMarkingPercent === 0 ? "No penalty for wrong answers" : 
               `${Math.round(form.negativeMarkingPercent * 100)}% penalty for wrong answers`}
            </div>
          </div>
        )}

        {form.type !== "practice" && (
          <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-500/30">
            <label className="block text-sm font-medium mb-3 text-slate-200">
              Allowed Tab Switches
            </label>
            <div className="relative">
            <input
              type="number"
                min="-1"
                max="10"
              value={form.allowedTabSwitches}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, allowedTabSwitches: e.target.value }))
              }
                className="w-full p-4 bg-slate-600/50 border border-slate-500/50 rounded-lg focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 transition-all duration-200"
                placeholder="0"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm">
                {form.allowedTabSwitches == -1 ? "∞" : "times"}
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {form.allowedTabSwitches == 0 ? "No tab switching allowed" : 
               form.allowedTabSwitches == -1 ? "Unlimited tab switching allowed" :
               `Students can switch tabs ${form.allowedTabSwitches} time${form.allowedTabSwitches != 1 ? 's' : ''}`}
            </div>
          </div>
        )}
      </div>

            <div className="mt-6">
              <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-500/30">
                <label className="block text-sm font-medium mb-3 text-slate-200">
                  Test Instructions
              </label>
                <div className="relative">
              <textarea
                value={form.instructions}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, instructions: e.target.value }))
                }
                    rows={4}
                    className="w-full p-4 bg-slate-600/50 border border-slate-500/50 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 resize-none"
                    placeholder="Enter detailed instructions for students taking this test..."
                  />
                  <div className="absolute bottom-3 right-3 text-xs text-slate-400">
                    {form.instructions.length} characters
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  Provide clear instructions about test rules, time limits, and any special requirements
                </div>
              </div>
            </div>
          </div>

          {/* JSON Upload Section */}
          <JsonQuestionUploader onQuestionsLoaded={handleQuestionsUpload} />

          {/* Assignment Options Section */}
          <div className="bg-slate-800 p-6 rounded-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-600 rounded-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold">Assignment Options</h2>
                <p className="text-sm text-slate-400">Configure how and when to assign this test</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Enable Assignment Toggle */}
              <div className="bg-slate-700 p-4 rounded-lg border border-slate-600">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-600 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <label htmlFor="assignToAll" className="text-lg font-medium cursor-pointer">
                        Enable Assignment
                      </label>
                      <p className="text-sm text-slate-400">Assign this test to students immediately after creation</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
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
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              {assignmentOptions.assignToAll && (
                <div className="space-y-6">
                  {/* Assignment Mode Selection */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-1 bg-purple-600 rounded">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-medium">Assignment Mode</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* All Students Option */}
                      <div 
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                          assignmentMode === "all" 
                            ? "border-blue-500 bg-blue-900/20" 
                            : "border-slate-600 bg-slate-700 hover:border-slate-500"
                        }`}
                        onClick={() => setAssignmentMode("all")}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            assignmentMode === "all" 
                              ? "border-blue-500 bg-blue-500" 
                              : "border-slate-400"
                          }`}>
                            {assignmentMode === "all" && (
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="font-medium">All Students</span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-400 mt-1 ml-7">Assign to all registered students</p>
                      </div>

                      {/* Specific Students Option */}
                      <div 
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                          assignmentMode === "manual" 
                            ? "border-blue-500 bg-blue-900/20" 
                            : "border-slate-600 bg-slate-700 hover:border-slate-500"
                        }`}
                        onClick={() => setAssignmentMode("manual")}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            assignmentMode === "manual" 
                              ? "border-blue-500 bg-blue-500" 
                              : "border-slate-400"
                          }`}>
                            {assignmentMode === "manual" && (
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span className="font-medium">Specific Students</span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-400 mt-1 ml-7">Choose individual students</p>
                      </div>

                      {/* RU Students Option */}
                      <div 
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                          assignmentMode === "ru" 
                            ? "border-blue-500 bg-blue-900/20" 
                            : "border-slate-600 bg-slate-700 hover:border-slate-500"
                        }`}
                        onClick={() => setAssignmentMode("ru")}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            assignmentMode === "ru" 
                              ? "border-blue-500 bg-blue-500" 
                              : "border-slate-400"
                          }`}>
                            {assignmentMode === "ru" && (
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <span className="font-medium">RU Students</span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-400 mt-1 ml-7">Assign to RU category students only</p>
                      </div>

                      {/* SU Students Option */}
                      <div 
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                          assignmentMode === "su" 
                            ? "border-blue-500 bg-blue-900/20" 
                            : "border-slate-600 bg-slate-700 hover:border-slate-500"
                        }`}
                        onClick={() => setAssignmentMode("su")}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            assignmentMode === "su" 
                              ? "border-blue-500 bg-blue-500" 
                              : "border-slate-400"
                          }`}>
                            {assignmentMode === "su" && (
                              <div className="w-2 h-2 bg-white rounded-full"></div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <span className="font-medium">SU Students</span>
                          </div>
                        </div>
                        <p className="text-sm text-slate-400 mt-1 ml-7">Assign to SU category students only</p>
                      </div>
                    </div>
                  </div>

                  {/* Time Configuration */}
                  <div className="bg-slate-700 p-4 rounded-lg border border-slate-600">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-1 bg-yellow-600 rounded">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-medium">Test Schedule</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
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
                          className="w-full p-3 bg-slate-600 border border-slate-500 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
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
                          className="w-full p-3 bg-slate-600 border border-slate-500 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                          min="1"
                          placeholder="Enter duration in minutes"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Student Selection (Manual Mode Only) */}
                  {assignmentMode === "manual" && (
                    <div className="bg-slate-700 p-4 rounded-lg border border-slate-600">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="p-1 bg-indigo-600 rounded">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-medium">Student Selection</h3>
                        <span className="ml-auto px-3 py-1 bg-blue-600 text-white text-sm rounded-full">
                          {selectedStudents.length} selected
                        </span>
                      </div>

                      {/* Search and Selection Controls */}
                      <div className="flex gap-3 mb-4">
                        <div className="flex-1 relative">
                          <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <input
                            type="text"
                            placeholder="Search students by name or email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-600 border border-slate-500 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-white"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={selectAllStudents}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={clearAllSelections}
                          className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Clear All
                        </button>
                      </div>

                      {/* Students List */}
                      <div className="border border-slate-500 rounded-lg max-h-48 overflow-y-auto bg-slate-600">
                        {filteredStudents.length === 0 ? (
                          <div className="p-6 text-center text-slate-400">
                            <svg className="w-8 h-8 mx-auto mb-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <p className="text-sm">No students found</p>
                            <p className="text-xs text-slate-500 mt-1">Try adjusting your search terms</p>
                          </div>
                        ) : (
                          filteredStudents.map((student) => (
                            <label
                              key={student._id}
                              className={`flex items-center p-3 border-b border-slate-500 last:border-b-0 hover:bg-slate-500 cursor-pointer transition-colors ${
                                selectedStudents.includes(student._id) ? 'bg-blue-900/20' : ''
                              }`}
                            >
                              <div className="relative">
                                <input
                                  type="checkbox"
                                  checked={selectedStudents.includes(student._id)}
                                  onChange={() =>
                                    toggleStudentSelection(student._id)
                                  }
                                  className="sr-only peer"
                                />
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                  selectedStudents.includes(student._id)
                                    ? 'border-blue-500 bg-blue-500'
                                    : 'border-slate-400 hover:border-slate-300'
                                }`}>
                                  {selectedStudents.includes(student._id) && (
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                              <div className="ml-3 flex-1">
                                <div className="font-medium text-white flex items-center gap-2">
                                  {student.name}
                                  {selectedStudents.includes(student._id) && (
                                    <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                                      Selected
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm text-slate-400 flex items-center gap-2">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  {student.email}
                                </div>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Questions Section */}
          <div className="bg-slate-800 p-6 rounded-lg">
            {/* Warning for incompatible questions */}
            {form.questions.some(q => !isQuestionTypeAllowed(q.kind)) && (
              <div className="mb-4 p-4 bg-red-900/50 border border-red-700/50 rounded-lg backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-600/20 rounded-full">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <span className="text-red-200 text-sm">
                    Some questions are incompatible with the current test type. 
                    Change the test type or remove incompatible questions.
                  </span>
                </div>
              </div>
            )}
            
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600/20 rounded-lg">
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
              <h2 className="text-xl font-semibold">Questions</h2>
                  <p className="text-sm text-slate-400">{form.questions.length} question{form.questions.length !== 1 ? 's' : ''} added</p>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                {getAllowedQuestionTypes(form.type).map((questionType) => {
                  const buttonConfig = {
                    mcq: { 
                      label: "Add MCQ", 
                      className: "bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 hover:scale-105 active:scale-95 transition-all duration-200",
                      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    },
                    coding: { 
                      label: "Add Coding", 
                      className: "bg-violet-500 hover:bg-violet-600 active:bg-violet-700 hover:scale-105 active:scale-95 transition-all duration-200",
                      icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    },
                    theory: { 
                      label: "Add Theory", 
                      className: "bg-rose-500 hover:bg-rose-600 active:bg-rose-700 hover:scale-105 active:scale-95 transition-all duration-200",
                      icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    },
                  };

                  const config = buttonConfig[questionType];
                  if (!config) return null;

                  return (
                    <button
                      key={questionType}
                      type="button"
                      onClick={() => addQuestion(questionType)}
                      className={`px-5 py-3 ${config.className} rounded-lg cursor-pointer flex items-center gap-2 font-medium text-white shadow-md hover:shadow-lg`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={config.icon} />
                      </svg>
                      <span>{config.label}</span>
                    </button>
                  );
                })}
                
                {/* Show message if no question types are allowed */}
                {getAllowedQuestionTypes(form.type).length === 0 && (
                  <span className="text-slate-400 text-sm">
                    No question types available for this test type
                  </span>
                )}
              </div>
            </div>

            {form.questions.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <div className="text-lg mb-2">No questions added yet</div>
                <div className="text-sm">Click on one of the "Add" buttons above to start adding questions</div>
              </div>
            ) : (
              form.questions.map((question, index) => (
              <div
                key={question.id}
                className="bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 p-6 rounded-xl mb-6 hover:bg-slate-700/70 transition-all duration-300 hover:shadow-lg hover:shadow-slate-900/20 group"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-600/50 rounded-lg">
                        <span className="text-lg font-bold text-slate-300">#{index + 1}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">Question {index + 1}</h3>
                        <p className="text-sm text-slate-400">{question.points} point{question.points !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 ${
                        question.kind === "mcq" ? "bg-blue-600/20 text-blue-300 border border-blue-500/30" :
                        question.kind === "coding" ? "bg-orange-600/20 text-orange-300 border border-orange-500/30" :
                        question.kind === "theory" ? "bg-red-600/20 text-red-300 border border-red-500/30" :
                        "bg-gray-600/20 text-gray-300 border border-gray-500/30"
                      }`}>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                            question.kind === "mcq" ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" :
                            question.kind === "coding" ? "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" :
                            question.kind === "theory" ? "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" :
                            "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          } />
                        </svg>
                        {question.kind === "mcq" ? "Multiple Choice" :
                         question.kind === "coding" ? "Coding Problem" :
                         question.kind === "theory" ? "Theory Question" :
                       question.kind}
                    </span>
                    {!isQuestionTypeAllowed(question.kind) && (
                        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-800/30 text-red-300 border border-red-500/30 flex items-center gap-2">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        Incompatible with {form.type} test
                      </span>
                    )}
                  </div>
                  </div>
                  <div className="flex items-center gap-1">
                  <button
                    type="button"
                      onClick={() => moveQuestion(index, index - 1)}
                      disabled={index === 0}
                      className="p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-600/20 rounded-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(index, index + 1)}
                      disabled={index === form.questions.length - 1}
                      className="p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-600/20 rounded-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <div className="w-px h-6 bg-slate-600 mx-1"></div>
                    <button
                      type="button"
                      onClick={() => duplicateQuestion(question.id)}
                      className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-600/20 rounded-lg transition-all duration-200 group/btn"
                      title="Duplicate question"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to remove this question?')) {
                          removeQuestion(question.id);
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-600/20 rounded-lg transition-all duration-200 group/btn"
                      title="Remove question"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                  </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewQuestion(question);
                        setShowPreviewModal(true);
                      }}
                      className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-600/20 rounded-lg transition-all duration-200 group/btn"
                      title="Preview question"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-slate-600/30 rounded-lg p-4 border border-slate-500/30">
                    <label className="block text-sm font-medium mb-3 text-slate-200">
                      Question Text *
                    </label>
                    <textarea
                      value={question.text}
                      onChange={(e) =>
                        updateQuestion(question.id, "text", e.target.value)
                      }
                      className="w-full p-4 bg-slate-700/50 border border-slate-500/50 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 resize-none"
                      rows={3}
                      placeholder="Enter your question here..."
                      required
                    />
                    <div className="mt-2 text-xs text-slate-400">
                      {question.text.length} characters
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-600/30 rounded-lg p-4 border border-slate-500/30">
                      <label className="block text-sm font-medium mb-3 text-slate-200">
                      Points
                    </label>
                      <div className="relative">
                    <input
                      type="number"
                      min="1"
                          max="100"
                      value={question.points}
                      onChange={(e) =>
                        updateQuestion(question.id, "points", e.target.value)
                      }
                          className="w-full p-3 bg-slate-700/50 border border-slate-500/50 rounded-lg focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
                          placeholder="1"
                        />
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm">
                          pts
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-slate-600/30 rounded-lg p-4 border border-slate-500/30">
                      <label className="block text-sm font-medium mb-3 text-slate-200">
                        Question Type
                      </label>
                      <div className="flex items-center gap-2 p-3 bg-slate-700/50 rounded-lg">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
                            question.kind === "mcq" ? "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" :
                            question.kind === "coding" ? "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" :
                            question.kind === "theory" ? "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" :
                            "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          } />
                        </svg>
                        <span className="text-slate-300 text-sm">
                          {question.kind === "mcq" ? "Multiple Choice" :
                           question.kind === "coding" ? "Coding Problem" :
                           question.kind === "theory" ? "Theory Question" :
                           question.kind}
                        </span>
                      </div>
                    </div>
                  </div>

                  {question.kind === "mcq" && (
                    <>
                      <div className="bg-slate-600/30 rounded-lg p-4 border border-slate-500/30">
                        <div className="flex items-center justify-between mb-4">
                          <label className="block text-sm font-medium text-slate-200">
                            Multiple Choice Options
                        </label>
                          <div className="text-xs text-slate-400">
                            Select the correct answer
                          </div>
                        </div>
                        <div className="space-y-3">
                        {question.options.map((option, optIndex) => (
                          <div
                            key={optIndex}
                              className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg border border-slate-500/30 hover:bg-slate-700/70 transition-all duration-200 group"
                          >
                              <div className="flex items-center">
                            <input
                              type="radio"
                              name={`answer-${question.id}`}
                              checked={question.answer === option}
                              onChange={() =>
                                updateQuestion(question.id, "answer", option)
                              }
                                  className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-500 focus:ring-blue-500 focus:ring-2"
                            />
                              </div>
                              <div className="flex-1">
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
                                  className="w-full p-2 bg-slate-600/50 border border-slate-500/50 rounded-md focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
                                  placeholder={`Option ${String.fromCharCode(65 + optIndex)}`}
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-400 px-2 py-1 bg-slate-600/50 rounded">
                                  {String.fromCharCode(65 + optIndex)}
                                </span>
                                {question.answer === option && (
                                  <div className="flex items-center gap-1 text-green-400 text-xs">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Correct
                                  </div>
                                )}
                              </div>
                          </div>
                        ))}
                        </div>
                        {!question.answer && (
                          <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                            <div className="flex items-center gap-2 text-yellow-300 text-sm">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                              </svg>
                              Please select the correct answer
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {false && ( // MSQ removed
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
                      <div className="bg-slate-600/30 rounded-lg p-4 border border-slate-500/30">
                        <div className="flex justify-between items-center mb-4">
                      <div>
                            <label className="block text-sm font-medium text-slate-200">
                              Test Cases & Examples
                          </label>
                            <p className="text-xs text-slate-400 mt-1">
                              Add input/output examples to help students understand the problem
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => addExample(question.id)}
                            className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-sm rounded-xl cursor-pointer flex items-center gap-2 transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-green-500/25 font-medium relative overflow-hidden group"
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                            <div className="relative flex items-center gap-2">
                              <div className="p-0.5 bg-white/20 rounded-lg">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                              </div>
                              <span>Add Example</span>
                            </div>
                          </button>
                        </div>

                        {/* Coding scoring note */}
                        <div className="bg-slate-600/30 rounded-lg p-4 border border-slate-500/30 mb-4">
                          <label className="block text-sm font-medium mb-2 text-slate-200">Scoring</label>
                          <div className="text-xs text-slate-300">
                            Final marks are based on passed hidden test cases. Set marks per hidden case below. Students can code in any supported language.
                          </div>
                        </div>

                        <div className="space-y-4">
                        {(question.examples || []).map((example, exIndex) => (
                          <div
                            key={exIndex}
                              className="bg-slate-700/50 p-4 rounded-lg border border-slate-500/30 hover:bg-slate-700/70 transition-all duration-200 group"
                            >
                              <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2">
                                  <div className="p-1 bg-slate-600/50 rounded">
                                    <span className="text-sm font-medium text-slate-300">
                                      #{exIndex + 1}
                              </span>
                                  </div>
                                  <span className="text-sm font-medium text-slate-200">
                                    Test Case {exIndex + 1}
                                  </span>
                                </div>
                              <button
                                type="button"
                                onClick={() =>
                                  removeExample(question.id, exIndex)
                                }
                                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-600/20 rounded-lg transition-all duration-200"
                                  title="Remove example"
                              >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                              </button>
                            </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-sm font-medium mb-2 text-slate-200">
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
                                    className="w-full p-3 bg-slate-600/50 border border-slate-500/50 rounded-lg focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition-all duration-200 font-mono text-sm"
                                    rows={3}
                                  placeholder="Enter input example..."
                                />
                              </div>

                              <div>
                                  <label className="block text-sm font-medium mb-2 text-slate-200">
                                    Expected Output
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
                                    className="w-full p-3 bg-slate-600/50 border border-slate-500/50 rounded-lg focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition-all duration-200 font-mono text-sm"
                                    rows={3}
                                  placeholder="Enter expected output..."
                                />
                              </div>
                            </div>
                          </div>
                        ))}

                        {(question.examples || []).length === 0 && (
                            <div className="text-center py-8 text-slate-400">
                              <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-500/30">
                                <svg className="w-12 h-12 mx-auto mb-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <div className="text-sm font-medium mb-1">No examples added yet</div>
                                <div className="text-xs">Click "Add Example" to add input/output examples</div>
                              </div>
                          </div>
                        )}
                        </div>

                        {/* Visible (Normal) Test Cases for Run */}
                        <div className="bg-slate-600/30 rounded-lg p-4 border border-slate-500/30 mt-4">
                          <div className="flex items-center justify-between mb-3">
                            <label className="block text-sm font-medium text-slate-200">Visible Test Cases (Run)</label>
                            <button
                              type="button"
                              onClick={() => updateQuestion(question.id, 'visibleTestCases', [...(question.visibleTestCases || []), { input: '', output: '' }])}
                              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs"
                            >Add Visible Case</button>
                          </div>
                          <div className="space-y-3">
                            {(question.visibleTestCases || []).map((tc, i) => (
                              <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <textarea
                                  value={tc.input}
                                  onChange={(e) => {
                                    const next = [...(question.visibleTestCases || [])];
                                    next[i] = { ...next[i], input: e.target.value };
                                    updateQuestion(question.id, 'visibleTestCases', next);
                                  }}
                                  className="p-3 bg-slate-700/50 border border-slate-500/50 rounded-lg font-mono text-sm"
                                  rows={3}
                                  placeholder="Input"
                                />
                                <textarea
                                  value={tc.output}
                                  onChange={(e) => {
                                    const next = [...(question.visibleTestCases || [])];
                                    next[i] = { ...next[i], output: e.target.value };
                                    updateQuestion(question.id, 'visibleTestCases', next);
                                  }}
                                  className="p-3 bg-slate-700/50 border border-slate-500/50 rounded-lg font-mono text-sm"
                                  rows={3}
                                  placeholder="Expected Output"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Hidden Test Cases for Submit (with Marks) */}
                        <div className="bg-slate-600/30 rounded-lg p-4 border border-slate-500/30 mt-4">
                          <div className="flex items-center justify-between mb-3">
                            <label className="block text-sm font-medium text-slate-200">Hidden Test Cases (Submit)</label>
                            <button
                              type="button"
                              onClick={() => updateQuestion(question.id, 'hiddenTestCases', [...(question.hiddenTestCases || []), { input: '', output: '', marks: 1 }])}
                              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs"
                            >Add Hidden Case</button>
                          </div>
                          <div className="space-y-3">
                            {(question.hiddenTestCases || []).map((tc, i) => (
                              <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <textarea
                                  value={tc.input}
                                  onChange={(e) => {
                                    const next = [...(question.hiddenTestCases || [])];
                                    next[i] = { ...next[i], input: e.target.value };
                                    updateQuestion(question.id, 'hiddenTestCases', next);
                                  }}
                                  className="p-3 bg-slate-700/50 border border-slate-500/50 rounded-lg font-mono text-sm"
                                  rows={3}
                                  placeholder="Input"
                                />
                                <textarea
                                  value={tc.output}
                                  onChange={(e) => {
                                    const next = [...(question.hiddenTestCases || [])];
                                    next[i] = { ...next[i], output: e.target.value };
                                    updateQuestion(question.id, 'hiddenTestCases', next);
                                  }}
                                  className="p-3 bg-slate-700/50 border border-slate-500/50 rounded-lg font-mono text-sm"
                                  rows={3}
                                  placeholder="Expected Output"
                                />
                                <div>
                                  <label className="block text-xs text-slate-400 mb-1">Marks</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={tc.marks ?? 1}
                                    onChange={(e) => {
                                      const next = [...(question.hiddenTestCases || [])];
                                      next[i] = { ...next[i], marks: Number(e.target.value) };
                                      updateQuestion(question.id, 'hiddenTestCases', next);
                                    }}
                                    className="p-3 bg-slate-700/50 border border-slate-500/50 rounded-lg w-full"
                                    placeholder="Marks"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {question.kind === "theory" && (
                    <div className="bg-slate-600/30 rounded-lg p-4 border border-slate-500/30">
                      <div className="text-center py-8 text-slate-400">
                        <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-500/30">
                          <svg className="w-12 h-12 mx-auto mb-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <div className="text-sm font-medium mb-1">Theory Question</div>
                          <div className="text-xs">Students will provide written answers to this question</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
            )}
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

      {/* OTP Modal */}
      {showOtpModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-6 rounded-lg w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">Test Created Successfully!</h3>

            <div className="text-center mb-6">
              <p className="text-gray-300 mb-4">
                Your test has been created. Here's the OTP for bypassing permissions:
              </p>
              <div className="bg-slate-700 p-4 rounded-lg">
                <div className="text-3xl font-mono font-bold text-blue-400 mb-2">
                  {createdOtp}
                </div>
                <p className="text-sm text-gray-400">
                  Share this OTP with students who need to access the test without assignment.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowOtpModal(false);
                  nav("/admin/tests");
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && previewQuestion && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-4 flex justify-between items-center z-10">
              <h3 className="text-xl font-semibold">Question Preview</h3>
              <button
                type="button"
                onClick={() => {
                  setShowPreviewModal(false);
                  setPreviewQuestion(null);
                }}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                <p className="text-sm text-blue-300">
                  <strong>Note:</strong> This is how the question will appear to students in the exam portal.
                </p>
              </div>

              {/* Preview Content - Mimics TakeTest.jsx layout */}
              <div className="bg-slate-900 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4 justify-between">
                  <span className="text-sm text-slate-400">
                    Question Preview
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-700 px-3 py-1 rounded-md text-sm">
                      {previewQuestion.points} point{previewQuestion.points !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>

                {/* Question Text with formatting preserved */}
                <div className="text-xl font-semibold mb-6 whitespace-pre-wrap text-white">
                  {previewQuestion.text || "(No question text entered)"}
                </div>

                {/* MCQ Options Preview */}
                {previewQuestion.kind === "mcq" && (
                  <div className="space-y-3">
                    {previewQuestion.options?.map((option, index) => (
                      <div
                        key={index}
                        className="flex items-center p-4 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                      >
                        <input
                          type="radio"
                          name={`preview-${previewQuestion.id}`}
                          className="mr-3"
                          disabled
                        />
                        <span className="whitespace-pre-wrap text-white">
                          {option || `Option ${String.fromCharCode(65 + index)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Coding Question Preview */}
                {previewQuestion.kind === "coding" && (
                  <div className="space-y-4">
                    {previewQuestion.examples && previewQuestion.examples.length > 0 && (
                      <div className="bg-slate-700 p-4 rounded-lg mb-4">
                        <div className="text-slate-300 font-semibold mb-2">Examples:</div>
                        {previewQuestion.examples.map((example, idx) => (
                          <div key={idx} className="mb-3 p-3 bg-slate-600 rounded">
                            <div className="mb-1 font-semibold text-slate-300">Example {idx + 1}:</div>
                            <div className="mb-1 font-semibold text-slate-300">Input:</div>
                            <pre className="whitespace-pre-wrap text-slate-400 bg-slate-800 p-2 rounded">
                              {example.input || "(No input)"}
                            </pre>
                            <div className="mt-2 mb-1 font-semibold text-slate-300">Output:</div>
                            <pre className="whitespace-pre-wrap text-slate-400 bg-slate-800 p-2 rounded">
                              {example.output || "(No output)"}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}

                    {previewQuestion.visibleTestCases && previewQuestion.visibleTestCases.length > 0 && (
                      <div className="bg-slate-700 p-4 rounded-lg mb-4">
                        <div className="text-slate-300 font-semibold mb-2">Normal Test Cases:</div>
                        {previewQuestion.visibleTestCases.map((tc, idx) => (
                          <div key={idx} className="mb-3 p-3 bg-slate-600 rounded">
                            <div className="mb-1 font-semibold text-slate-300">Case {idx + 1}:</div>
                            <div className="mb-1 font-semibold text-slate-300">Input:</div>
                            <pre className="whitespace-pre-wrap text-slate-400 bg-slate-800 p-2 rounded">
                              {tc.input || "(No input)"}
                            </pre>
                            <div className="mt-2 mb-1 font-semibold text-slate-300">Output:</div>
                            <pre className="whitespace-pre-wrap text-slate-400 bg-slate-800 p-2 rounded">
                              {tc.output || "(No output)"}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="bg-slate-700 p-4 rounded-lg">
                      <p className="text-slate-400 text-sm">
                        Students will see a code editor here to write their solution.
                      </p>
                    </div>
                  </div>
                )}

                {/* Theory Question Preview */}
                {previewQuestion.kind === "theory" && (
                  <div className="space-y-4">
                    {previewQuestion.examples && previewQuestion.examples.length > 0 && (
                      <div className="bg-slate-700 p-4 rounded-lg mb-4">
                        {previewQuestion.examples.map((example, idx) => (
                          <div key={idx} className="mb-3 p-3 bg-slate-600 rounded">
                            <div className="mb-1 font-semibold text-slate-300">Example {idx + 1}:</div>
                            <div className="mb-1 font-semibold text-slate-300">Input:</div>
                            <pre className="whitespace-pre-wrap text-slate-400 bg-slate-800 p-2 rounded">
                              {example.input || "(No input)"}
                            </pre>
                            <div className="mt-2 mb-1 font-semibold text-slate-300">Output:</div>
                            <pre className="whitespace-pre-wrap text-slate-400 bg-slate-800 p-2 rounded">
                              {example.output || "(No output)"}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="bg-slate-700 p-4 rounded-lg">
                      <p className="text-slate-400 text-sm mb-2">Students will see a text area here to write their answer.</p>
                      <textarea
                        className="w-full p-4 bg-slate-800 text-white rounded-lg border border-slate-600 resize-none"
                        rows={4}
                        disabled
                        placeholder="Answer text area (preview)"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
