import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Eye,
  Check,
  AlertTriangle,
  HelpCircle,
  FileText,
  Clock,
  Shuffle,
  Users,
  Search,
  X,
  Code2,
} from "lucide-react";
import apiRequest from "../services/api";
import JsonQuestionUploader from "../components/JsonQuestionUploader";
import QuestionText from "../components/QuestionText";
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
    expectedAnswer: "",
  }),
  ...(kind === "coding" && {
    examples: [],
    visibleTestCases: [{ input: "", output: "" }],
    hiddenTestCases: [{ input: "", output: "", marks: 1 }],
  }),
});


// Helper function to capitalize first letter of each word, preserving numbers
const capitalizeWords = (str) => {
  if (!str) return str;
  return str.toUpperCase();
};

export default function CreateTest() {
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("id");
  const isEdit = !!editId;

  const [form, setForm] = useState({
    title: "",
    subject: "",
    type: "mcq",
    instructions: "",
    timeLimit: 30,
    negativeMarkingPercent: 0,
    allowedTabSwitches: "",
    shuffleQuestions: false,
    questions: [],
  });
  const [assignmentOptions, setAssignmentOptions] = useState({
    startTime: "",
    duration: "",
  });
  const [students, setStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  // Cohort keys come from the backend (all, ru, su702, su714, cglab3, cglab4,
  // ssiu) plus the local "manual" mode.
  const [assignmentMode, setAssignmentMode] = useState("all");
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectDescription, setNewSubjectDescription] = useState("");
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState(null);
  const [allowedTabSwitchesError, setAllowedTabSwitchesError] = useState("");
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
      setAllowedTabSwitchesError(""); // Clear any previous errors
      setForm({
        title: capitalizeWords(test.title || ""),
        subject: test.subject || "",
        type: test.type,
        instructions: test.instructions,
        timeLimit: test.timeLimit,
        negativeMarkingPercent: test.negativeMarkingPercent || 0,
        allowedTabSwitches: test.allowedTabSwitches ?? "",
        shuffleQuestions: Boolean(test.shuffleQuestions),
        questions: test.questions.map((q) => ({
          id: crypto.randomUUID(),
          // The question's identity in the database. `id` above is only a React
          // key for this form; `_id` is what every stored student response is
          // matched against, so it has to survive the edit round-trip or every
          // answer to this question is orphaned. New questions have none.
          _id: q._id,
          kind: q.kind === "theoretical" ? "theory" : q.kind,
          text: q.text,
          points: q.points,
          expectedAnswer: q.expectedAnswer || "",
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
            ...(q.language ? { language: q.language } : {}),
            ...(q.guidelines ? { guidelines: q.guidelines } : {}),
          }),
          ...(q.kind === "theory" && {
            expectedAnswer: q.expectedAnswer || "",
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
  // Cohorts (with live student counts) for the assignment mode cards.
  useEffect(() => {
    apiRequest("/assignments/cohorts")
      .then((data) => setCohorts(data.cohorts || []))
      .catch((err) => {
        console.error("Error fetching cohorts:", err);
        setCohorts([]);
      });
  }, []);

  useEffect(() => {
    if (assignmentMode === "manual") {
      fetchStudents();
    }
  }, [assignmentMode]);

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
      default:
        return ["mcq"];
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
      const { _id, ...withoutDatabaseId } = questionToDuplicate;
      const duplicatedQuestion = {
        ...withoutDatabaseId,
        // Deliberately no `_id`: a copy is a new question and must get its own
        // id from the server. Sharing the original's id would point two
        // questions at one set of student responses.
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

    // Validate allowed tab switches if not practice test
    if (form.type !== "practice" && form.allowedTabSwitches !== "") {
      const tabSwitchesValue = Number(form.allowedTabSwitches);
      if (isNaN(tabSwitchesValue) || tabSwitchesValue < 0 || tabSwitchesValue > 100) {
        setAllowedTabSwitchesError("Value should be between 0 to 100");
        alert("Please fix the Allowed Tab Switches field before submitting.");
        return;
      }
    }

    // Validate Start Time
    if (assignmentOptions.startTime) {
      const selectedTime = new Date(assignmentOptions.startTime);
      const currentTime = new Date();
      // Add a small grace period (e.g. 1 minute) to allow for "current minute" selection
      // or slight delays between selection and submission
      if (selectedTime < new Date(currentTime.getTime() - 60000)) {
        alert("Start Time cannot be in the past. Please select a current or future time.");
        return;
      }
    }


    setLoading(true);

    try {
      const payload = {
        title: capitalizeWords(form.title.trim()),
        subject: form.subject.trim(),
        type: form.type,
        instructions: form.instructions,
        timeLimit: Number(form.timeLimit),
        negativeMarkingPercent: Number(form.negativeMarkingPercent),
        allowedTabSwitches: Number(form.allowedTabSwitches) || 0,
        shuffleQuestions: Boolean(form.shuffleQuestions),
        questions: form.questions.map((q) => ({
          // Only present for questions that came from the database; the server
          // ignores anything that is not already one of this test's own ids.
          ...(q._id ? { _id: q._id } : {}),
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
            // Optional, and only set by bulk upload today: the editor's starting
            // language and any extra instructions for the student.
            ...(q.language ? { language: q.language } : {}),
            ...(q.guidelines ? { guidelines: q.guidelines } : {}),
          }),
          ...(q.kind === "theory" && {
            expectedAnswer: q.expectedAnswer || "",
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

        // Always assign test to students after creation (async - don't wait)
        // The startTime is already in ISO format (UTC) from the DateTimePicker
        // which converts IST to UTC automatically
        const startTimeISO = assignmentOptions.startTime ? new Date(assignmentOptions.startTime).toISOString() : new Date().toISOString();

        // Start assignment process asynchronously - don't wait for it to complete
        // This makes test creation much faster
        (async () => {
          try {
            if (assignmentMode === "manual") {
              if (selectedStudents.length > 0) {
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
              }
            } else {
              await apiRequest("/assignments/assign-cohort", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  testId: createdTest._id,
                  cohort: assignmentMode,
                  startTime: startTimeISO,
                  duration: parseInt(assignmentOptions.duration),
                }),
              });
            }
            console.log("✅ Assignment creation completed");
          } catch (error) {
            console.error("❌ Error in background assignment creation:", error);
            // Don't show error to user - assignment will be created in background
          }
        })();

        nav("/admin/tests");
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
      className="p-4 sm:p-6 lg:p-8 min-h-screen font-sans"
      style={{ backgroundColor: "#16181F" }}
    >
      <div className="max-w-6xl mx-auto w-full space-y-6">
        {/* Header Row - Synchronized 3.5rem baseline matching Sidebar */}
        <div
          className="flex items-center justify-between pb-5 mb-2"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", minHeight: "3.5rem" }}
        >
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {isEdit ? "Edit Test" : "Create New Test"}
            </h1>
            <p className="text-xs text-[#7E8594] mt-0.5">
              Configure test details, questions, and assignment options
            </p>
          </div>

          <button
            type="button"
            onClick={() => nav("/admin/tests")}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-[#2A2E39] hover:bg-[#343946] border border-white/10 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Tests</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card 1: Basic Test Info */}
          <div className="w-full rounded-2xl border border-white/[0.06] bg-[#20242D] p-5 sm:p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">Test Information</h2>
              <p className="text-xs text-[#7E8594] mt-0.5 leading-relaxed">Configure the basic details of your test</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#181A22] rounded-xl p-4 border border-white/[0.06]">
                <label className="block text-xs font-semibold text-[#8E95A5] mb-2">
                  Test Title *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => {
                      const capitalizedTitle = capitalizeWords(e.target.value);
                      setForm((prev) => ({ ...prev, title: capitalizedTitle }));
                    }}
                    className="w-full p-3 bg-[#14161D] border border-white/[0.08] rounded-xl text-xs text-white placeholder-[#555C6D] focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none transition-all"
                    placeholder="Enter test title..."
                    required
                  />
                </div>
                <div className="mt-1.5 text-[11px] text-[#555C6D]">
                  {form.title.length} characters
                </div>
              </div>

              <div className="bg-[#181A22] rounded-xl p-4 border border-white/[0.06]">
                <label className="block text-xs font-semibold text-[#8E95A5] mb-2">
                  Subject *
                </label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 relative">
                    <select
                      value={form.subject}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, subject: e.target.value }))
                      }
                      className="w-full p-3 bg-[#14161D] border border-white/[0.08] rounded-xl text-xs text-white focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none transition-all appearance-none cursor-pointer"
                      required
                    >
                      <option value="" disabled className="bg-[#181A22]">
                        Select a subject
                      </option>
                      {subjects.map((subject) => (
                        <option key={subject._id} value={subject.name} className="bg-[#181A22]">
                          {subject.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-[#7E8594]">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSubjectModal(true)}
                    className="p-3 bg-white hover:bg-slate-100 text-slate-950 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center"
                    title="Add Subject"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="bg-[#181A22] rounded-xl p-4 border border-white/[0.06]">
                <label className="block text-xs font-semibold text-[#8E95A5] mb-2">
                  Test Type
                </label>
                <div className="relative">
                  <select
                    value={form.type}
                    onChange={(e) => handleTestTypeChange(e.target.value)}
                    className="w-full p-3 bg-[#14161D] border border-white/[0.08] rounded-xl text-xs text-white focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="mcq" className="bg-[#181A22]">MCQ Only</option>
                    <option value="coding" className="bg-[#181A22]">Coding Only</option>
                    <option value="theory" className="bg-[#181A22]">Theory Only</option>
                    <option value="practice" className="bg-[#181A22]">Practice Test (MCQ Only)</option>
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-[#7E8594]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Show allowed question types */}
                <div className="mt-3 p-2.5 bg-[#14161D] rounded-lg border border-white/[0.04]">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[11px] font-medium text-[#7E8594]">Allowed question types:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {getAllowedQuestionTypes(form.type).map(type => {
                      const typeConfig = {
                        mcq: { label: "MCQ", color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" },
                        coding: { label: "Coding", color: "bg-purple-500/10 text-purple-300 border-purple-500/20" },
                        theory: { label: "Theory", color: "bg-rose-500/10 text-rose-300 border-rose-500/20" }
                      };
                      const config = typeConfig[type] || { label: type, color: "bg-white/10 text-white border-white/20" };
                      return (
                        <span key={type} className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${config.color}`}>
                          {config.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="bg-[#181A22] rounded-xl p-4 border border-white/[0.06]">
                <label className="block text-xs font-semibold text-[#8E95A5] mb-2">
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
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full p-3 bg-[#14161D] border border-white/[0.08] rounded-xl text-xs text-white focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    placeholder="30"
                  />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#7E8594] text-xs">
                    mins
                  </div>
                </div>
                <div className="mt-1.5 text-[11px] text-[#555C6D]">
                  Duration students have to complete the exam
                </div>
              </div>

              {form.type !== "practice" && form.type !== "coding" && (
                <div className="bg-[#181A22] rounded-xl p-4 border border-white/[0.06]">
                  <label className="block text-xs font-semibold text-[#8E95A5] mb-2">
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
                      className="w-full p-3 bg-[#14161D] border border-white/[0.08] rounded-xl text-xs text-white focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value={0} className="bg-[#181A22]">No Negative Marking</option>
                      <option value={0.25} className="bg-[#181A22]">25%</option>
                      <option value={0.5} className="bg-[#181A22]">50%</option>
                      <option value={0.75} className="bg-[#181A22]">75%</option>
                      <option value={1} className="bg-[#181A22]">100%</option>
                    </select>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-[#7E8594]">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <div className="mt-1.5 text-[11px] text-[#555C6D]">
                    {form.negativeMarkingPercent === 0 ? "No penalty for wrong answers" :
                      `${Math.round(form.negativeMarkingPercent * 100)}% penalty for wrong answers`}
                  </div>
                </div>
              )}

              {form.type !== "practice" && (
                <div className="bg-[#181A22] rounded-xl p-4 border border-white/[0.06]">
                  <label className="block text-xs font-semibold text-[#8E95A5] mb-2">
                    Allowed Tab Switches
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.allowedTabSwitches}
                      onChange={(e) => {
                        const inputValue = e.target.value;
                        setAllowedTabSwitchesError("");
                        if (inputValue === "" || inputValue === null || inputValue === undefined) {
                          setForm((prev) => ({ ...prev, allowedTabSwitches: "" }));
                          return;
                        }
                        const numValue = parseInt(inputValue, 10);
                        if (!isNaN(numValue)) {
                          if (numValue < 0 || numValue > 100) {
                            setAllowedTabSwitchesError("Value should be between 0 to 100");
                            setForm((prev) => ({ ...prev, allowedTabSwitches: numValue }));
                          } else {
                            setAllowedTabSwitchesError("");
                            setForm((prev) => ({ ...prev, allowedTabSwitches: numValue }));
                          }
                        } else {
                          setForm((prev) => ({ ...prev, allowedTabSwitches: "" }));
                        }
                      }}
                      onBlur={(e) => {
                        const inputValue = e.target.value;
                        if (inputValue !== "" && inputValue !== null && inputValue !== undefined) {
                          const numValue = parseInt(inputValue, 10);
                          if (!isNaN(numValue) && (numValue < 0 || numValue > 100)) {
                            setAllowedTabSwitchesError("Value should be between 0 to 100");
                          }
                        }
                      }}
                      onWheel={(e) => e.currentTarget.blur()}
                      className={`w-full p-3 bg-[#14161D] border rounded-xl text-xs text-white focus:outline-none transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                        allowedTabSwitchesError
                          ? "border-rose-500/50 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                          : "border-white/[0.08] focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4]"
                      }`}
                      placeholder="Enter number (0-100)"
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#7E8594] text-xs">
                      times
                    </div>
                  </div>
                  {allowedTabSwitchesError && (
                    <div className="mt-1.5 text-[11px] text-rose-400">
                      {allowedTabSwitchesError}
                    </div>
                  )}
                  {!allowedTabSwitchesError && form.allowedTabSwitches !== "" && (
                    <div className="mt-1.5 text-[11px] text-[#555C6D]">
                      {form.allowedTabSwitches == 0 ? "No tab switching allowed" :
                        `Students can switch tabs ${form.allowedTabSwitches} time${form.allowedTabSwitches != 1 ? "s" : ""}`}
                    </div>
                  )}
                </div>
              )}

              {form.type !== "practice" && (
                <div className="bg-[#181A22] rounded-xl p-4 border border-white/[0.06]">
                  <label className="block text-xs font-semibold text-[#8E95A5] mb-2">
                    Shuffle Questions
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer p-3 bg-[#14161D] border border-white/[0.08] rounded-xl hover:border-white/10 transition-colors">
                    <input
                      type="checkbox"
                      checked={Boolean(form.shuffleQuestions)}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, shuffleQuestions: e.target.checked }))
                      }
                      className="w-4 h-4 rounded accent-[#00C4B4] cursor-pointer"
                    />
                    <span className="text-xs text-white font-medium">
                      Randomise question order per student
                    </span>
                  </label>
                  <div className="mt-1.5 text-[11px] text-[#555C6D]">
                    {form.shuffleQuestions
                      ? "Each student sees these questions in their own random order"
                      : "Every student sees the questions in the order below"}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="bg-[#181A22] rounded-xl p-4 border border-white/[0.06]">
                <label className="block text-xs font-semibold text-[#8E95A5] mb-2">
                  Test Instructions
                </label>
                <div className="relative">
                  <textarea
                    value={form.instructions}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, instructions: e.target.value }))
                    }
                    rows={4}
                    className="w-full p-3 bg-[#14161D] border border-white/[0.08] rounded-xl text-xs text-white placeholder-[#555C6D] focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none transition-all resize-none"
                    placeholder="Enter detailed instructions for students taking this test..."
                  />
                  <div className="absolute bottom-3 right-3 text-[11px] text-[#555C6D]">
                    {form.instructions.length} characters
                  </div>
                </div>
                <div className="mt-1.5 text-[11px] text-[#555C6D]">
                  Provide clear instructions about test rules, time limits, and any special requirements
                </div>
              </div>
            </div>
          </div>

          {/* JSON Upload Section */}
          <JsonQuestionUploader onQuestionsLoaded={handleQuestionsUpload} />

          {/* Assignment Options Section */}
          {/* Card 3: Assignment Options */}
          <div className="w-full rounded-2xl border border-white/[0.06] bg-[#20242D] p-5 sm:p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">Assignment Options</h2>
              <p className="text-xs text-[#7E8594] mt-0.5 leading-relaxed">Configure how and when to assign this test</p>
            </div>

            <div className="space-y-5">
              {/* Assignment Mode Selection */}
              <div>
                <label className="block text-xs font-semibold text-[#8E95A5] mb-2.5">
                  Assignment Mode
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    ...cohorts.map((c) => ({
                      id: c.key,
                      label: c.label,
                      desc: `${c.description} \u00b7 ${c.count} student${c.count === 1 ? "" : "s"}`,
                    })),
                    { id: "manual", label: "Specific Students", desc: "Choose individual students" },
                  ].map((mode) => {
                    const isSelected = assignmentMode === mode.id;
                    return (
                      <div
                        key={mode.id}
                        className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? "border-[#00C4B4] bg-[#00C4B4]/10"
                            : "border-white/[0.06] bg-[#181A22] hover:border-white/10 hover:bg-[#181A22]/80"
                        }`}
                        onClick={() => setAssignmentMode(mode.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                              isSelected
                                ? "border-[#00C4B4] bg-[#00C4B4]"
                                : "border-[#7E8594]"
                            }`}
                          >
                            {isSelected && (
                              <div className="w-1.5 h-1.5 bg-slate-950 rounded-full"></div>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-white">{mode.label}</span>
                        </div>
                        <p className="text-[11px] text-[#7E8594] mt-1 ml-7">{mode.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Time Configuration */}
              <div className="bg-[#181A22] p-4 sm:p-5 rounded-xl border border-white/[0.06]">
                <div className="mb-3">
                  <h3 className="text-xs font-semibold text-white">Test Schedule</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#8E95A5] mb-2">
                      Start Time *
                    </label>
                    <input
                      type="datetime-local"
                      value={assignmentOptions.startTime || ""}
                      onChange={(e) =>
                        setAssignmentOptions((prev) => ({
                          ...prev,
                          startTime: e.target.value,
                        }))
                      }
                      className="w-full p-3 bg-[#14161D] border border-white/[0.08] rounded-xl text-xs text-white focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none transition-all"
                      min={new Date().toISOString().slice(0, 16)}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#8E95A5] mb-2">
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
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full p-3 bg-[#14161D] border border-white/[0.08] rounded-xl text-xs text-white focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      min="1"
                      placeholder="Enter duration in minutes"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Student Selection (Manual Mode Only) */}
              {assignmentMode === "manual" && (
                <div className="bg-[#181A22] p-4 sm:p-5 rounded-xl border border-white/[0.06]">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-xs font-semibold text-white">Student Selection</h3>
                    <span className="px-2.5 py-0.5 bg-[#00C4B4]/15 border border-[#00C4B4]/30 text-[#00C4B4] text-[11px] font-semibold rounded-full">
                      {selectedStudents.length} selected
                    </span>
                  </div>

                  {/* Search and Selection Controls */}
                  <div className="flex gap-2.5 mb-3 flex-wrap">
                    <div className="flex-1 min-w-[200px] relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#7E8594]" />
                      <input
                        type="text"
                        placeholder="Search students by name or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2 bg-[#14161D] border border-white/[0.08] rounded-xl text-xs text-white placeholder-[#555C6D] focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none transition-all"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={selectAllStudents}
                      className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-950 font-semibold rounded-xl text-xs shadow-sm transition-all cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={clearAllSelections}
                      className="px-3.5 py-2 border border-white/10 bg-[#2A2E39] hover:bg-[#343946] text-white font-semibold rounded-xl text-xs transition-all cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>

                  {/* Students List */}
                  <div className="border border-white/[0.06] rounded-xl max-h-52 overflow-y-auto bg-[#14161D] divide-y divide-white/[0.04]">
                    {filteredStudents.length === 0 ? (
                      <div className="p-6 text-center text-[#7E8594] text-xs">
                        No students found matching your search.
                      </div>
                    ) : (
                      filteredStudents.map((student) => {
                        const isChecked = selectedStudents.includes(student._id);
                        return (
                          <label
                            key={student._id}
                            className={`flex items-center p-3 hover:bg-white/[0.02] cursor-pointer transition-colors ${
                              isChecked ? "bg-[#00C4B4]/5" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleStudentSelection(student._id)}
                              className="h-4 w-4 rounded accent-[#00C4B4] cursor-pointer"
                            />
                            <div className="ml-3 flex-1 min-w-0">
                              <div className="text-xs font-semibold text-white flex items-center gap-2">
                                <span className="truncate">{student.name}</span>
                                {isChecked && (
                                  <span className="px-1.5 py-0.2 bg-[#00C4B4]/20 text-[#00C4B4] text-[10px] font-semibold rounded">
                                    Selected
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#7E8594] truncate">
                                {student.email}
                              </div>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Questions Section */}
          <div className="bg-[#20242D] border border-white/[0.06] rounded-2xl p-5 sm:p-6 shadow-sm space-y-6">
            {/* Warning for incompatible questions */}
            {form.questions.some(q => !isQuestionTypeAllowed(q.kind)) && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center gap-3">
                <div className="p-2 bg-rose-500/20 rounded-lg shrink-0">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                </div>
                <span>
                  Some questions are incompatible with the current test type.
                  Change the test type or remove incompatible questions.
                </span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#00C4B4]/10 rounded-xl text-[#00C4B4]">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white tracking-tight">Questions</h2>
                  <p className="text-xs text-slate-400">{form.questions.length} question{form.questions.length !== 1 ? 's' : ''} added</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {getAllowedQuestionTypes(form.type).map((questionType) => {
                  const buttonConfig = {
                    mcq: {
                      label: "Add MCQ",
                      className: "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20",
                    },
                    coding: {
                      label: "Add Coding",
                      className: "text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/20",
                    },
                    theory: {
                      label: "Add Theory",
                      className: "text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20",
                    },
                  };

                  const config = buttonConfig[questionType];
                  if (!config) return null;

                  return (
                    <button
                      key={questionType}
                      type="button"
                      onClick={() => addQuestion(questionType)}
                      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${config.className}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{config.label}</span>
                    </button>
                  );
                })}

                {getAllowedQuestionTypes(form.type).length === 0 && (
                  <span className="text-slate-400 text-xs">
                    No question types available for this test type
                  </span>
                )}
              </div>
            </div>

            {form.questions.length === 0 ? (
              <div className="border border-dashed border-white/10 rounded-xl p-10 text-center bg-[#181A22]/50">
                <HelpCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <div className="text-sm font-medium text-slate-300 mb-1">No questions added yet</div>
                <div className="text-xs text-slate-500">Click on one of the "Add" buttons above to start adding questions.</div>
              </div>
            ) : (
              <div className="space-y-5">
                {form.questions.map((question, index) => (
                  <div
                    key={question.id}
                    className="bg-[#181A22] border border-white/[0.06] rounded-xl p-5 sm:p-6 transition-all space-y-5 hover:border-white/10"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/5">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-semibold text-slate-300">
                          #{index + 1}
                        </span>
                        <div>
                          <h3 className="font-semibold text-sm text-white">Question {index + 1}</h3>
                          <p className="text-xs text-slate-400">{question.points} point{question.points !== 1 ? 's' : ''}</p>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          question.kind === "mcq" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          question.kind === "coding" ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                          question.kind === "theory" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                          "bg-white/5 text-slate-300 border-white/10"
                        }`}>
                          {question.kind === "mcq" ? "Multiple Choice" :
                            question.kind === "coding" ? "Coding Problem" :
                            question.kind === "theory" ? "Theory Question" :
                            question.kind}
                        </span>
                        {!isQuestionTypeAllowed(question.kind) && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1.5">
                            <AlertTriangle className="w-3 h-3" />
                            Incompatible
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => moveQuestion(index, index - 1)}
                          disabled={index === 0}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveQuestion(index, index + 1)}
                          disabled={index === form.questions.length - 1}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <div className="w-px h-4 bg-white/10 mx-1"></div>
                        <button
                          type="button"
                          onClick={() => duplicateQuestion(question.id)}
                          className="p-1.5 text-slate-400 hover:text-[#00C4B4] hover:bg-[#00C4B4]/10 rounded-lg transition-colors"
                          title="Duplicate question"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewQuestion(question);
                            setShowPreviewModal(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                          title="Preview question"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Are you sure you want to remove this question?')) {
                              removeQuestion(question.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="Remove question"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-[#14161D] rounded-xl p-4 border border-white/5">
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-medium text-slate-300">
                            Question Text *
                          </label>
                          <span className="text-[11px] text-slate-500">
                            {question.text.length} chars
                          </span>
                        </div>
                        <textarea
                          value={question.text}
                          onChange={(e) =>
                            updateQuestion(question.id, "text", e.target.value)
                          }
                          className="w-full p-3 bg-[#181A22] border border-white/10 rounded-xl focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none text-white text-sm transition-all resize-none"
                          rows={3}
                          placeholder="Enter your question here..."
                          required
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-[#14161D] rounded-xl p-4 border border-white/5">
                          <label className="block text-xs font-medium mb-2 text-slate-300">
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
                              className="w-full p-2.5 bg-[#181A22] border border-white/10 rounded-xl focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none text-white text-sm transition-all"
                              placeholder="1"
                            />
                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 text-xs">
                              pts
                            </div>
                          </div>
                        </div>

                        <div className="bg-[#14161D] rounded-xl p-4 border border-white/5">
                          <label className="block text-xs font-medium mb-2 text-slate-300">
                            Question Type
                          </label>
                          <div className="flex items-center gap-2 p-2.5 bg-[#181A22] border border-white/10 rounded-xl text-slate-300 text-sm">
                            <FileText className="w-4 h-4 text-[#00C4B4]" />
                            <span>
                              {question.kind === "mcq" ? "Multiple Choice" :
                                question.kind === "coding" ? "Coding Problem" :
                                question.kind === "theory" ? "Theory Question" :
                                question.kind}
                            </span>
                          </div>
                        </div>
                      </div>

                      {question.kind === "mcq" && (
                        <div className="bg-[#14161D] rounded-xl p-4 border border-white/5 space-y-3">
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-medium text-slate-300">
                              Multiple Choice Options
                            </label>
                            <span className="text-xs text-slate-500">
                              Select radio for correct answer
                            </span>
                          </div>
                          <div className="space-y-2.5">
                            {question.options.map((option, optIndex) => (
                              <div
                                key={optIndex}
                                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                                  question.answer === option && option !== ""
                                    ? "bg-[#00C4B4]/5 border-[#00C4B4]/30"
                                    : "bg-[#181A22] border-white/5 hover:border-white/10"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`answer-${question.id}`}
                                  checked={question.answer === option && option !== ""}
                                  onChange={() =>
                                    updateQuestion(question.id, "answer", option)
                                  }
                                  className="w-4 h-4 accent-[#00C4B4] cursor-pointer"
                                />
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
                                    className="w-full p-2 bg-transparent text-sm text-white focus:outline-none placeholder-slate-500"
                                    placeholder={`Option ${String.fromCharCode(65 + optIndex)}`}
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-400 px-2 py-0.5 bg-white/5 border border-white/10 rounded-md">
                                    {String.fromCharCode(65 + optIndex)}
                                  </span>
                                  {question.answer === option && option !== "" && (
                                    <span className="flex items-center gap-1 text-[#00C4B4] text-xs font-medium">
                                      <Check className="w-3.5 h-3.5" />
                                      Correct
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          {!question.answer && (
                            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs flex items-center gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              Please select the correct answer
                            </div>
                          )}
                        </div>
                      )}

                      {question.kind === "coding" && (
                        <div className="space-y-4">
                          <div className="bg-[#14161D] rounded-xl p-4 border border-white/5">
                            <div className="flex justify-between items-center mb-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-300">
                                  Test Cases & Examples
                                </label>
                                <p className="text-[11px] text-slate-500">
                                  Add input/output examples to help students understand the problem
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => addExample(question.id)}
                                className="px-3 py-1.5 bg-[#00C4B4]/10 hover:bg-[#00C4B4]/20 text-[#00C4B4] border border-[#00C4B4]/30 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add Example</span>
                              </button>
                            </div>

                            <div className="p-3 bg-[#181A22] rounded-xl border border-white/5 mb-4 text-xs text-slate-400">
                              <strong className="text-slate-300">Scoring:</strong> Final marks are based on passed hidden test cases. Set marks per hidden case below. Students can code in any supported language.
                            </div>

                            <div className="space-y-3">
                              {(question.examples || []).map((example, exIndex) => (
                                <div
                                  key={exIndex}
                                  className="bg-[#181A22] p-4 rounded-xl border border-white/5 space-y-3"
                                >
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs font-medium text-slate-300">
                                      Test Case #{exIndex + 1}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeExample(question.id, exIndex)
                                      }
                                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                      title="Remove example"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-[11px] font-medium mb-1.5 text-slate-400">
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
                                        className="w-full p-2.5 bg-[#14161D] border border-white/10 rounded-xl focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none font-mono text-xs text-white"
                                        rows={3}
                                        placeholder="Enter input example..."
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-[11px] font-medium mb-1.5 text-slate-400">
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
                                        className="w-full p-2.5 bg-[#14161D] border border-white/10 rounded-xl focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none font-mono text-xs text-white"
                                        rows={3}
                                        placeholder="Enter expected output..."
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}

                              {(question.examples || []).length === 0 && (
                                <div className="text-center py-6 border border-dashed border-white/10 rounded-xl text-slate-500 text-xs">
                                  No examples added yet. Click "Add Example" above.
                                </div>
                              )}
                            </div>

                            {/* Visible (Normal) Test Cases */}
                            <div className="mt-5 pt-4 border-t border-white/5 space-y-3">
                              <div className="flex items-center justify-between">
                                <label className="block text-xs font-medium text-slate-300">Visible Test Cases (Run)</label>
                                <button
                                  type="button"
                                  onClick={() => updateQuestion(question.id, 'visibleTestCases', [...(question.visibleTestCases || []), { input: '', output: '' }])}
                                  className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-slate-300 transition-colors"
                                >
                                  + Add Visible Case
                                </button>
                              </div>
                              <div className="space-y-2.5">
                                {(question.visibleTestCases || []).map((tc, i) => (
                                  <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-[#181A22] rounded-xl border border-white/5">
                                    <textarea
                                      value={tc.input}
                                      onChange={(e) => {
                                        const next = [...(question.visibleTestCases || [])];
                                        next[i] = { ...next[i], input: e.target.value };
                                        updateQuestion(question.id, 'visibleTestCases', next);
                                      }}
                                      className="p-2.5 bg-[#14161D] border border-white/10 rounded-xl font-mono text-xs text-white focus:border-[#00C4B4] outline-none"
                                      rows={2}
                                      placeholder="Input"
                                    />
                                    <textarea
                                      value={tc.output}
                                      onChange={(e) => {
                                        const next = [...(question.visibleTestCases || [])];
                                        next[i] = { ...next[i], output: e.target.value };
                                        updateQuestion(question.id, 'visibleTestCases', next);
                                      }}
                                      className="p-2.5 bg-[#14161D] border border-white/10 rounded-xl font-mono text-xs text-white focus:border-[#00C4B4] outline-none"
                                      rows={2}
                                      placeholder="Expected Output"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Hidden Test Cases */}
                            <div className="mt-5 pt-4 border-t border-white/5 space-y-3">
                              <div className="flex items-center justify-between">
                                <label className="block text-xs font-medium text-slate-300">Hidden Test Cases (Submit)</label>
                                <button
                                  type="button"
                                  onClick={() => updateQuestion(question.id, 'hiddenTestCases', [...(question.hiddenTestCases || []), { input: '', output: '', marks: 1 }])}
                                  className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-slate-300 transition-colors"
                                >
                                  + Add Hidden Case
                                </button>
                              </div>
                              <div className="space-y-2.5">
                                {(question.hiddenTestCases || []).map((tc, i) => (
                                  <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-[#181A22] rounded-xl border border-white/5">
                                    <textarea
                                      value={tc.input}
                                      onChange={(e) => {
                                        const next = [...(question.hiddenTestCases || [])];
                                        next[i] = { ...next[i], input: e.target.value };
                                        updateQuestion(question.id, 'hiddenTestCases', next);
                                      }}
                                      className="p-2.5 bg-[#14161D] border border-white/10 rounded-xl font-mono text-xs text-white focus:border-[#00C4B4] outline-none"
                                      rows={2}
                                      placeholder="Input"
                                    />
                                    <textarea
                                      value={tc.output}
                                      onChange={(e) => {
                                        const next = [...(question.hiddenTestCases || [])];
                                        next[i] = { ...next[i], output: e.target.value };
                                        updateQuestion(question.id, 'hiddenTestCases', next);
                                      }}
                                      className="p-2.5 bg-[#14161D] border border-white/10 rounded-xl font-mono text-xs text-white focus:border-[#00C4B4] outline-none"
                                      rows={2}
                                      placeholder="Expected Output"
                                    />
                                    <div>
                                      <input
                                        type="number"
                                        min={0}
                                        value={tc.marks ?? 1}
                                        onChange={(e) => {
                                          const next = [...(question.hiddenTestCases || [])];
                                          next[i] = { ...next[i], marks: Number(e.target.value) };
                                          updateQuestion(question.id, 'hiddenTestCases', next);
                                        }}
                                        className="p-2.5 bg-[#14161D] border border-white/10 rounded-xl w-full text-xs text-white focus:border-[#00C4B4] outline-none"
                                        placeholder="Marks"
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {question.kind === "theory" && (
                        <div className="bg-[#14161D] rounded-xl p-4 border border-white/5">
                          <label className="block text-xs font-medium mb-2 text-slate-300">
                            Expected Answer
                          </label>
                          <textarea
                            value={question.expectedAnswer}
                            onChange={(e) =>
                              updateQuestion(question.id, "expectedAnswer", e.target.value)
                            }
                            className="w-full p-3 bg-[#181A22] border border-white/10 rounded-xl focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none text-white text-sm transition-all resize-none"
                            rows={4}
                            placeholder="Enter the expected answer for admin evaluation..."
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2 pb-10">
            <button
              type="submit"
              disabled={loading}
              className="px-7 py-3 bg-white hover:bg-slate-100 text-slate-950 font-semibold rounded-xl text-sm transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#20242D] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Add New Subject</h3>
              <button
                type="button"
                onClick={() => {
                  setShowSubjectModal(false);
                  setNewSubjectName("");
                  setNewSubjectDescription("");
                }}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5 text-slate-300">
                  Subject Name *
                </label>
                <input
                  type="text"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  className="w-full p-2.5 bg-[#181A22] border border-white/10 rounded-xl text-white text-sm focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none"
                  placeholder="e.g., Mathematics, Physics"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5 text-slate-300">
                  Description (Optional)
                </label>
                <textarea
                  value={newSubjectDescription}
                  onChange={(e) => setNewSubjectDescription(e.target.value)}
                  rows={3}
                  className="w-full p-2.5 bg-[#181A22] border border-white/10 rounded-xl text-white text-sm focus:border-[#00C4B4] focus:ring-1 focus:ring-[#00C4B4] outline-none resize-none"
                  placeholder="Brief description of the subject..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowSubjectModal(false);
                  setNewSubjectName("");
                  setNewSubjectDescription("");
                }}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-medium rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddSubject}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-950 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Add Subject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && previewQuestion && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#20242D] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-white/10 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#00C4B4]/10 rounded-xl text-[#00C4B4]">
                  <Eye className="w-4 h-4" />
                </div>
                <h3 className="text-base font-semibold text-white">Question Preview</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPreviewModal(false);
                  setPreviewQuestion(null);
                }}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
              <div className="p-3 bg-[#00C4B4]/10 border border-[#00C4B4]/20 rounded-xl text-xs text-[#00C4B4] flex items-center gap-2">
                <span><strong>Note:</strong> This is how the question will appear to students in the exam portal.</span>
              </div>

              {/* Preview Content */}
              <div className="bg-[#181A22] border border-white/5 rounded-xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/5">
                  <span className="text-xs text-slate-400 font-medium">
                    Question Preview
                  </span>
                  <div className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-medium text-slate-300">
                    {previewQuestion.points} point{previewQuestion.points !== 1 ? "s" : ""}
                  </div>
                </div>

                {/* Question Text */}
                <div className="text-base sm:text-lg font-medium text-white leading-relaxed">
                  <QuestionText text={previewQuestion.text || "(No question text entered)"} />
                </div>

                {/* MCQ Options Preview */}
                {previewQuestion.kind === "mcq" && (
                  <div className="space-y-2.5">
                    {previewQuestion.options?.map((option, index) => (
                      <div
                        key={index}
                        className="flex items-center p-3 rounded-xl bg-[#14161D] border border-white/5"
                      >
                        <input
                          type="radio"
                          name={`preview-${previewQuestion.id}`}
                          className="mr-3 accent-[#00C4B4]"
                          disabled
                        />
                        <span className="text-sm whitespace-pre-wrap text-slate-200">
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
                      <div className="bg-[#14161D] p-4 rounded-xl border border-white/5 space-y-3">
                        <div className="text-xs font-semibold text-slate-300">Examples:</div>
                        {previewQuestion.examples.map((example, idx) => (
                          <div key={idx} className="p-3 bg-[#181A22] rounded-lg border border-white/5 space-y-2">
                            <div className="text-xs font-medium text-slate-400">Example {idx + 1}</div>
                            <div className="text-[11px] text-slate-500">Input:</div>
                            <pre className="whitespace-pre-wrap text-slate-300 bg-[#14161D] p-2.5 rounded-lg font-mono text-xs border border-white/5">
                              {example.input || "(No input)"}
                            </pre>
                            <div className="text-[11px] text-slate-500">Output:</div>
                            <pre className="whitespace-pre-wrap text-slate-300 bg-[#14161D] p-2.5 rounded-lg font-mono text-xs border border-white/5">
                              {example.output || "(No output)"}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}

                    {previewQuestion.visibleTestCases && previewQuestion.visibleTestCases.length > 0 && (
                      <div className="bg-[#14161D] p-4 rounded-xl border border-white/5 space-y-3">
                        <div className="text-xs font-semibold text-slate-300">Normal Test Cases:</div>
                        {previewQuestion.visibleTestCases.map((tc, idx) => (
                          <div key={idx} className="p-3 bg-[#181A22] rounded-lg border border-white/5 space-y-2">
                            <div className="text-xs font-medium text-slate-400">Case {idx + 1}</div>
                            <div className="text-[11px] text-slate-500">Input:</div>
                            <pre className="whitespace-pre-wrap text-slate-300 bg-[#14161D] p-2.5 rounded-lg font-mono text-xs border border-white/5">
                              {tc.input || "(No input)"}
                            </pre>
                            <div className="text-[11px] text-slate-500">Output:</div>
                            <pre className="whitespace-pre-wrap text-slate-300 bg-[#14161D] p-2.5 rounded-lg font-mono text-xs border border-white/5">
                              {tc.output || "(No output)"}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="bg-[#14161D] p-4 rounded-xl border border-white/5">
                      <p className="text-slate-400 text-xs">
                        Students will see an interactive code editor here to write and run their solution.
                      </p>
                    </div>
                  </div>
                )}

                {/* Theory Question Preview */}
                {previewQuestion.kind === "theory" && (
                  <div className="space-y-4">
                    {previewQuestion.examples && previewQuestion.examples.length > 0 && (
                      <div className="bg-[#14161D] p-4 rounded-xl border border-white/5 space-y-3">
                        {previewQuestion.examples.map((example, idx) => (
                          <div key={idx} className="p-3 bg-[#181A22] rounded-lg border border-white/5 space-y-2">
                            <div className="text-xs font-medium text-slate-400">Example {idx + 1}</div>
                            <div className="text-[11px] text-slate-500">Input:</div>
                            <pre className="whitespace-pre-wrap text-slate-300 bg-[#14161D] p-2.5 rounded-lg font-mono text-xs border border-white/5">
                              {example.input || "(No input)"}
                            </pre>
                            <div className="text-[11px] text-slate-500">Output:</div>
                            <pre className="whitespace-pre-wrap text-slate-300 bg-[#14161D] p-2.5 rounded-lg font-mono text-xs border border-white/5">
                              {example.output || "(No output)"}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="bg-[#14161D] p-4 rounded-xl border border-white/5">
                      <p className="text-slate-400 text-xs mb-2">Students will see a text area here to write their response.</p>
                      <textarea
                        className="w-full p-3 bg-[#181A22] text-slate-300 rounded-xl border border-white/10 resize-none text-xs"
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
