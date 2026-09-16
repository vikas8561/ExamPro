import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { testSubmissionsAPI } from "../services/api";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import QuestionText from "../components/QuestionText";
import ProctoringReport from "../components/ProctoringReport";
import {
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Code2,
  HelpCircle,
  Check,
  Copy,
  FileCheck,
  MessageSquareQuote,
  Layers,
  ChevronRight,
  RotateCcw
} from "lucide-react";

// Safe helper to extract string from string or { text: "..." } object
const getTextValue = (val) => {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    return val.text || val.label || val.value || JSON.stringify(val);
  }
  return String(val);
};

const ViewCompletedTest = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [testData, setTestData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all"); // 'all' | 'mcq' | 'coding' | 'incorrect'
  const [copiedQuestionId, setCopiedQuestionId] = useState(null);

  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    const fetchTestResults = async () => {
      try {
        const data = await testSubmissionsAPI.getTestSubmission(assignmentId);
        if (data === null) {
          setError("Test submission not found");
        } else {
          setTestData(data);
        }
      } catch (err) {
        console.error("Error fetching test results:", err);
        setError(err.message || "Failed to fetch test results");
      } finally {
        setLoading(false);
      }
    };

    fetchTestResults();
  }, [assignmentId, token, navigate]);

  const handleCopyCode = (code, qId) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedQuestionId(qId);
    setTimeout(() => setCopiedQuestionId(null), 2000);
  };

  const scrollToQuestion = (idx) => {
    const el = document.getElementById(`question-card-${idx}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleScrollToTop = () => {
    const mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: "smooth" });
    }
    const topEl = document.getElementById("top-of-page");
    if (topEl) {
      topEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Helper to map code language to prism language
  const getPrismLanguage = (kind, lang) => {
    if (kind === "mcq") return "plaintext";
    if (!lang) return "python";
    const l = lang.toLowerCase();
    if (l === "javascript" || l === "js") return "javascript";
    if (l === "cpp" || l === "c++") return "cpp";
    if (l === "c") return "c";
    if (l === "java") return "java";
    if (l === "go" || l === "golang") return "go";
    if (l === "python" || l === "py") return "python";
    return l;
  };

  // 1. Loading State Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-[#16181F] text-slate-100 p-6 flex flex-col items-center justify-center">
        <div className="w-10 h-10 rounded-xl bg-[#00C4B4]/10 border border-[#00C4B4]/20 flex items-center justify-center text-[#00C4B4] mb-3 animate-spin shadow-[0_0_20px_rgba(0,196,180,0.2)]">
          <RotateCcw className="w-5 h-5" />
        </div>
        <p className="text-sm text-[#7E8594] font-medium">Loading examination results & analysis...</p>
      </div>
    );
  }

  // 2. Error / Not Found State Screen
  if (error) {
    return (
      <div className="min-h-screen bg-[#16181F] text-slate-100 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-[#20242D] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-[#282C38] transition-all shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-10 text-center shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Test Completion Status</h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
              {error.includes("Test submission not found")
                ? "No detailed test submission record exists for this examination, or it was marked completed automatically."
                : error}
            </p>
            <button
              onClick={() => navigate("/student/results")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs bg-[#00C4B4] hover:bg-[#00b3a4] text-[#0B1220] transition-all shadow-sm"
            >
              <span>View All Results</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!testData) return null;

  const { test, submission, showResults, message } = testData;
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isMentor = user.role === "Mentor";
  const isReviewer = user.role === "Mentor" || user.role === "Admin";

  // 3. Results Not Available Screen (Deadline buffer not reached)
  if (!showResults && !isMentor) {
    return (
      <div className="min-h-screen bg-[#16181F] text-slate-100 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-[#20242D] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-[#282C38] transition-all shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-10 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto mb-4 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
              <Clock className="w-7 h-7 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">{test?.title || "Examination Results"}</h2>
            <h3 className="text-sm font-semibold text-amber-300 mb-3">Results Protected Until Deadline</h3>
            <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed mb-6">
              {message ||
                "Your examination answers and code have been recorded securely. To preserve academic integrity, complete question solutions, mentor scores, and grading analysis become available immediately after the examination window concludes."}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => navigate("/student/assignments")}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-[#20242D] border border-white/[0.08] text-white hover:bg-[#282C38] transition-all"
              >
                Back to Assigned Tests
              </button>
              <button
                onClick={() => navigate("/student/results")}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#00C4B4] hover:bg-[#00b3a4] text-[#0B1220] transition-all shadow-sm"
              >
                Go to Completed Tests
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. Metrics & Breakdown
  const questions = test?.questions || [];
  const totalQuestions = questions.length;
  const mcqQuestions = questions.filter((q) => q.kind === "mcq");
  const codingTheoryQuestions = questions.filter((q) => q.kind === "coding" || q.kind === "theory");

  const correctCount = mcqQuestions.filter((q) => q.isCorrect).length;
  const incorrectCount = mcqQuestions.filter((q) => q.selectedOption && !q.isCorrect).length;
  const notAnsweredCount = mcqQuestions.filter((q) => !q.selectedOption).length;

  const totalScore =
    submission?.mentorScore !== null && submission?.mentorScore !== undefined
      ? submission.mentorScore
      : submission?.totalScore || 0;

  const maxScore =
    submission?.maxScore && submission.maxScore > 0
      ? submission.maxScore
      : questions.reduce((acc, q) => acc + (q.points || 0), 0) || 100;

  const scorePercentage = Math.round(maxScore > 0 ? (totalScore / maxScore) * 100 : totalScore);

  // Score Color Classes
  const getScoreColor = (pct) => {
    if (pct >= 80) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    if (pct >= 60) return "text-[#00C4B4] bg-[#133B42]/40 border-[#00C4B4]/20";
    if (pct >= 40) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    return "text-red-400 bg-red-500/10 border-red-500/20";
  };

  // Filter questions according to active tab
  const filteredQuestions = questions.filter((q) => {
    if (activeFilter === "mcq") return q.kind === "mcq";
    if (activeFilter === "coding") return q.kind === "coding" || q.kind === "theory";
    if (activeFilter === "incorrect") return q.kind === "mcq" && !q.isCorrect;
    return true;
  });

  return (
    <div id="top-of-page" className="min-h-screen bg-[#16181F] text-slate-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* 1. Synchronized Header Baseline */}
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 mb-6 border-b border-white/[0.05]"
          style={{ minHeight: "3.5rem" }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl bg-[#20242D] border border-white/[0.08] text-[#7E8594] hover:text-white hover:bg-[#282C38] transition-all shadow-sm flex-shrink-0"
              title="Go Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="w-9 h-9 rounded-xl bg-[#00C4B4]/10 border border-[#00C4B4]/20 flex items-center justify-center text-[#00C4B4] shadow-[0_0_15px_rgba(0,196,180,0.15)] flex-shrink-0">
              <FileCheck className="w-5 h-5" />
            </div>

            <div>
              <h1 className="text-xl font-bold text-white tracking-tight leading-tight line-clamp-1">
                {test?.title || "Examination Review"}
              </h1>
              <p className="text-xs text-[#7E8594] mt-0.5">
                Submission Analysis • {totalQuestions} Questions Evaluated
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                submission?.mentorReviewed
                  ? "bg-purple-500/10 text-[#C084FC] border-purple-500/20"
                  : "bg-emerald-500/10 text-[#34D399] border-emerald-500/20"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{submission?.mentorReviewed ? "Mentor Reviewed" : "Completed"}</span>
            </span>

            <button
              onClick={() => navigate("/student/results")}
              className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[#20242D] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-[#282C38] transition-all"
            >
              All Results
            </button>
          </div>
        </div>

        {/* 2. Score Summary & Performance KPI Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Main Final Score Card */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2 bg-[#181A22] border border-white/[0.06] rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div>
              <span className="text-[11px] font-medium text-[#7E8594] uppercase tracking-wider block">
                Total Score
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black text-white">{totalScore}</span>
                <span className="text-xs text-slate-500 font-medium">/ {maxScore} pts</span>
              </div>
            </div>
            <div
              className={`px-3 py-1.5 rounded-xl text-lg font-black border ${getScoreColor(
                scorePercentage
              )} shadow-sm`}
            >
              {scorePercentage}%
            </div>
          </div>

          {/* Total Questions */}
          <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-4 flex flex-col justify-center shadow-sm">
            <span className="text-[11px] font-medium text-[#7E8594] uppercase tracking-wider">Total</span>
            <div className="flex items-center gap-1.5 mt-1">
              <Layers className="w-4 h-4 text-[#00C4B4]" />
              <span className="text-lg font-bold text-white">{totalQuestions}</span>
            </div>
          </div>

          {/* MCQ Correct */}
          <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-4 flex flex-col justify-center shadow-sm">
            <span className="text-[11px] font-medium text-[#7E8594] uppercase tracking-wider">Correct</span>
            <div className="flex items-center gap-1.5 mt-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-lg font-bold text-emerald-400">{correctCount}</span>
            </div>
          </div>

          {/* MCQ Incorrect */}
          <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-4 flex flex-col justify-center shadow-sm">
            <span className="text-[11px] font-medium text-[#7E8594] uppercase tracking-wider">Incorrect</span>
            <div className="flex items-center gap-1.5 mt-1">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-lg font-bold text-red-400">{incorrectCount}</span>
            </div>
          </div>

          {/* Unanswered / Skipped */}
          <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-4 flex flex-col justify-center shadow-sm">
            <span className="text-[11px] font-medium text-[#7E8594] uppercase tracking-wider">Unanswered</span>
            <div className="flex items-center gap-1.5 mt-1">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span className="text-lg font-bold text-amber-400">{notAnsweredCount}</span>
            </div>
          </div>
        </div>

        {/* 3. Mentor Feedback Callout (if available) */}
        {submission?.mentorFeedback && (
          <div className="bg-[#181A22] border border-[#00C4B4]/20 rounded-2xl p-4.5 flex items-start gap-3.5 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-[#00C4B4]/10 border border-[#00C4B4]/30 flex items-center justify-center text-[#00C4B4] flex-shrink-0 mt-0.5">
              <MessageSquareQuote className="w-4 h-4" />
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Mentor Evaluation</h4>
                {submission.mentorScore !== null && (
                  <span className="text-xs font-bold text-[#00C4B4]">
                    Assigned Score: {submission.mentorScore} pts
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 italic leading-relaxed">
                "{submission.mentorFeedback}"
              </p>
            </div>
          </div>
        )}

        {/* 4. Proctoring Record (Reviewers / Mentors Only) */}
        {isReviewer && (
          <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-4 shadow-sm">
            <ProctoringReport submission={submission} />
          </div>
        )}

        {/* 5. Question Palette & Filter Toolbar */}
        <div className="bg-[#181A22] border border-white/[0.06] rounded-2xl p-4 space-y-3.5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#00C4B4]" />
              <h3 className="text-sm font-bold text-white tracking-tight">Question Navigation</h3>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
              {[
                { id: "all", label: `All (${totalQuestions})` },
                { id: "mcq", label: `MCQ (${mcqQuestions.length})` },
                ...(codingTheoryQuestions.length > 0
                  ? [{ id: "coding", label: `Coding (${codingTheoryQuestions.length})` }]
                  : []),
                ...(incorrectCount > 0 ? [{ id: "incorrect", label: `Incorrect (${incorrectCount})` }] : [])
              ].map((tab) => {
                const isActive = activeFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveFilter(tab.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                      isActive
                        ? "bg-[#00C4B4] text-[#0B1220] font-semibold shadow-sm"
                        : "bg-[#20242D] border border-white/[0.06] text-[#7E8594] hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick-Jump Palette Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {questions.map((q, idx) => {
              let statusBg = "bg-[#20242D] border-white/[0.06] text-slate-400";
              if (q.kind === "mcq") {
                if (q.isCorrect) statusBg = "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-bold";
                else if (q.selectedOption) statusBg = "bg-red-500/15 border-red-500/30 text-red-400 font-bold";
                else statusBg = "bg-amber-500/15 border-amber-500/30 text-amber-400";
              } else if (q.kind === "coding" || q.kind === "theory") {
                statusBg = "bg-purple-500/15 border-purple-500/30 text-purple-300 font-bold";
              }

              return (
                <button
                  key={q._id || idx}
                  onClick={() => scrollToQuestion(idx)}
                  className={`w-8 h-8 rounded-xl text-xs border flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-sm ${statusBg}`}
                  title={`Jump to Q${idx + 1}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* 6. Detailed Question Analysis List */}
        <div className="space-y-4">
          {filteredQuestions.map((q, filteredIdx) => {
            const actualIndex = questions.findIndex((item) => item._id === q._id);
            const rawStudentAnswer =
              q.kind === "mcq"
                ? q.selectedOption || "Not answered"
                : q.textAnswer || "No answer provided";

            const studentAnswer =
              typeof rawStudentAnswer === "object"
                ? getTextValue(rawStudentAnswer)
                : String(rawStudentAnswer);

            const questionText =
              typeof q.text === "object" ? getTextValue(q.text) : String(q.text || "");

            const answerLanguage = q.language || (q.kind === "coding" ? "python" : null);
            const prismLang = getPrismLanguage(q.kind, answerLanguage);
            const isCopied = copiedQuestionId === q._id;

            return (
              <div
                key={q._id || filteredIdx}
                id={`question-card-${actualIndex}`}
                className="bg-[#181A22] border border-white/[0.06] hover:border-[#00C4B4]/20 rounded-2xl p-5 space-y-4 transition-all duration-200 shadow-sm"
              >
                {/* Question Header */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-white/[0.05]">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-[#20242D] border border-white/[0.08] flex items-center justify-center text-xs font-mono font-bold text-white">
                      Q{actualIndex + 1}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#133B42] text-[#00C4B4] border border-[#00C4B4]/20 uppercase tracking-wide">
                      {q.kind === "mcq" ? "Multiple Choice" : q.kind === "coding" ? "Coding Problem" : "Theory"}
                    </span>
                    {q.kind === "coding" && answerLanguage && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-[#20242D] border border-white/[0.06] text-slate-300">
                        {answerLanguage}
                      </span>
                    )}
                  </div>

                  {/* Outcome Tag & Points */}
                  <div className="flex items-center gap-2">
                    {q.kind === "mcq" && (
                      <>
                        {q.isCorrect && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Correct</span>
                          </span>
                        )}
                        {!q.isCorrect && q.selectedOption && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Incorrect</span>
                          </span>
                        )}
                        {!q.selectedOption && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Not Answered</span>
                          </span>
                        )}
                      </>
                    )}

                    {(q.kind === "coding" || q.kind === "theory") && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                        <Check className="w-3.5 h-3.5" />
                        <span>Submitted</span>
                      </span>
                    )}

                    <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-[#20242D] text-slate-300 border border-white/[0.06]">
                      {q.points || 0} pts
                    </span>
                  </div>
                </div>

                {/* Question Text */}
                <div className="text-sm font-medium text-white leading-relaxed">
                  <QuestionText text={questionText} />
                </div>

                {/* MCQ Options Analysis */}
                {q.kind === "mcq" && Array.isArray(q.options) && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8594]">
                      Answer Choices:
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {q.options.map((opt, optIdx) => {
                        const optText = getTextValue(opt);
                        const selectedText = getTextValue(q.selectedOption);
                        const answerText = getTextValue(q.answer);

                        const isSelected =
                          selectedText.trim() !== "" &&
                          selectedText.trim().toLowerCase() === optText.trim().toLowerCase();

                        const isCorrectOption =
                          answerText.trim() !== "" &&
                          answerText.trim().toLowerCase() === optText.trim().toLowerCase();

                        let optStyles = "bg-[#20242D]/60 border-white/[0.04] text-slate-300";
                        if (isCorrectOption) {
                          optStyles = "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-semibold";
                        } else if (isSelected && !q.isCorrect) {
                          optStyles = "bg-red-500/10 border-red-500/30 text-red-300 font-semibold";
                        }

                        return (
                          <div
                            key={optIdx}
                            className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${optStyles}`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="w-5 h-5 rounded-md bg-white/[0.06] flex items-center justify-center text-[10px] font-mono font-bold">
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <span>{optText}</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {isSelected && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/10 text-white">
                                  Your Choice
                                </span>
                              )}
                              {isCorrectOption && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  Correct Key
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Coding Submission Code Viewer */}
                {q.kind === "coding" && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8594]">
                        Submitted Solution:
                      </p>
                      <button
                        onClick={() => handleCopyCode(studentAnswer, q._id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#20242D] border border-white/[0.06] text-slate-300 hover:text-white transition-all"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Code</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="rounded-xl overflow-hidden border border-white/[0.08] shadow-inner bg-[#101218]">
                      <SyntaxHighlighter
                        language={prismLang}
                        style={vscDarkPlus}
                        customStyle={{
                          margin: 0,
                          padding: "16px",
                          borderRadius: "12px",
                          fontSize: "13px",
                          lineHeight: "1.6",
                          backgroundColor: "#101218"
                        }}
                        showLineNumbers={true}
                        lineNumberStyle={{
                          minWidth: "2.5em",
                          paddingRight: "1em",
                          color: "#525866",
                          backgroundColor: "#101218"
                        }}
                      >
                        {studentAnswer}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                )}

                {/* Theory Answer Display */}
                {q.kind === "theory" && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7E8594]">
                      Submitted Answer:
                    </p>
                    <div className="p-3.5 rounded-xl bg-[#20242D] border border-white/[0.06] text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {studentAnswer}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 7. Bottom Navigation Bar */}
        <div className="pt-6 pb-4 border-t border-white/[0.05] flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-[#20242D] border border-white/[0.08] text-slate-300 hover:text-white transition-all shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Previous Screen</span>
          </button>

          <button
            onClick={handleScrollToTop}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-[#20242D] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-[#282C38] transition-all shadow-sm active:scale-95"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span>Back to Top</span>
          </button>
        </div>

      </div>
    </div>
  );
};

export default ViewCompletedTest;
