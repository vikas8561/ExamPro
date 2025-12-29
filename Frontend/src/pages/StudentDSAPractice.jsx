import React, { useEffect, useState } from "react";
import { ExternalLink, Youtube, FileText, Save, X, CheckCircle2, Circle, PlayCircle, ChevronDown, ChevronUp } from "lucide-react";
import apiRequest from "../services/api";
import '../styles/StudentDSAPractice.mobile.css';

const STATUS_OPTIONS = ["Not Started", "In Progress", "Completed"];

export default function StudentDSAPractice() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [openTopic, setOpenTopic] = useState(null);
  const [openQuestions, setOpenQuestions] = useState(new Set()); // Track expanded questions on mobile

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const data = await apiRequest("/dsa-questions");
      const fetchedQuestions = data.questions || [];
      setQuestions(fetchedQuestions);
      
      // All topics collapsed by default (openTopic is null)
    } catch (err) {
      console.error("Error fetching DSA questions:", err);
      alert("Failed to fetch questions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Group questions by topic
  const groupQuestionsByTopic = () => {
    const grouped = {};
    questions.forEach((question) => {
      const topic = question.topic || "Uncategorized";
      if (!grouped[topic]) {
        grouped[topic] = [];
      }
      grouped[topic].push(question);
    });
    // Sort questions within each topic by question number
    Object.keys(grouped).forEach((topic) => {
      grouped[topic].sort((a, b) => a.questionNumber - b.questionNumber);
    });
    return grouped;
  };

  const handleStatusToggle = async (question) => {
    const currentStatus = question.status || "Not Started";
    const currentIndex = STATUS_OPTIONS.indexOf(currentStatus);
    const nextIndex = (currentIndex + 1) % STATUS_OPTIONS.length;
    const newStatus = STATUS_OPTIONS[nextIndex];

    setUpdatingStatus(question._id);
    try {
      await apiRequest(`/dsa-questions/${question._id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: newStatus }),
      });

      // Update the question in the list
      setQuestions((prev) =>
        prev.map((q) =>
          q._id === question._id ? { ...q, status: newStatus } : q
        )
      );
    } catch (err) {
      console.error("Error updating status:", err);
      alert("Failed to update status. Please try again.");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const getStatusButton = (question) => {
    const status = question.status || "Not Started";
    const isUpdating = updatingStatus === question._id;

    const statusConfig = {
      "Not Started": {
        icon: Circle,
        color: "#9CA3AF",
        bgColor: "rgba(156, 163, 175, 0.1)",
        borderColor: "rgba(156, 163, 175, 0.3)",
        text: "Not Started",
      },
      "In Progress": {
        icon: PlayCircle,
        color: "#60A5FA",
        bgColor: "rgba(96, 165, 250, 0.1)",
        borderColor: "rgba(96, 165, 250, 0.3)",
        text: "In Progress",
      },
      "Completed": {
        icon: CheckCircle2,
        color: "#34D399",
        bgColor: "rgba(52, 211, 153, 0.1)",
        borderColor: "rgba(52, 211, 153, 0.3)",
        text: "Completed",
      },
    };

    const config = statusConfig[status];
    const Icon = config.icon;

    return (
      <button
        onClick={() => handleStatusToggle(question)}
        disabled={isUpdating}
        className="status-button flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium transition-all duration-300 text-sm"
        style={{
          backgroundColor: config.bgColor,
          color: config.color,
          border: `1px solid ${config.borderColor}`,
          cursor: isUpdating ? "not-allowed" : "pointer",
          opacity: isUpdating ? 0.6 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isUpdating) {
            e.currentTarget.style.backgroundColor = config.bgColor.replace("0.1", "0.2");
            e.currentTarget.style.borderColor = config.borderColor.replace("0.3", "0.5");
          }
        }}
        onMouseLeave={(e) => {
          if (!isUpdating) {
            e.currentTarget.style.backgroundColor = config.bgColor;
            e.currentTarget.style.borderColor = config.borderColor;
          }
        }}
      >
        <Icon className="w-4 h-4" />
        {isUpdating ? "Updating..." : config.text}
      </button>
    );
  };

  const handleNotesClick = async (question) => {
    setSelectedQuestion(question);
    setNotes(question.notes || "");
    setShowNotesModal(true);
  };

  const handleSaveNotes = async () => {
    if (!selectedQuestion) return;

    try {
      setSaving(true);
      await apiRequest(`/dsa-questions/${selectedQuestion._id}/notes`, {
        method: "POST",
        body: JSON.stringify({ notes }),
      });

      // Update the question in the list with saved notes
      setQuestions((prev) =>
        prev.map((q) =>
          q._id === selectedQuestion._id ? { ...q, notes } : q
        )
      );

      alert("Notes saved successfully!");
    } catch (err) {
      console.error("Error saving notes:", err);
      alert("Failed to save notes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseNotesModal = () => {
    setShowNotesModal(false);
    setSelectedQuestion(null);
    setNotes("");
  };

  const toggleTopic = (topic) => {
    // If clicking the same topic that's open, close it
    // Otherwise, open the clicked topic (this will close the previous one)
    setOpenTopic((prev) => (prev === topic ? null : topic));
  };

  const toggleQuestion = (questionId) => {
    setOpenQuestions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div
        className="student-dsa-practice-mobile loading-container p-6 min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#0B1220" }}
      >
        <div className="text-xl" style={{ color: "#E5E7EB" }}>
          Loading...
        </div>
      </div>
    );
  }

  const groupedQuestions = groupQuestionsByTopic();
  const topics = Object.keys(groupedQuestions).sort();

  // Calculate statistics
  const totalQuestions = questions.length;
  const solvedQuestions = questions.filter(
    (q) => q.status === "Completed"
  ).length;

  return (
    <div className="student-dsa-practice-mobile p-6 min-h-screen" style={{ backgroundColor: "#0B1220" }}>
      {/* Navbar */}
      <div
        className="header-section rounded-2xl border mb-6 p-6"
        style={{
          backgroundColor: "#0B1220",
          borderColor: "rgba(255, 255, 255, 0.2)",
        }}
      >
        <div className="header-content flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="header-title">
            <h2 className="text-3xl font-bold" style={{ color: "#E5E7EB" }}>
              DSA Playground
            </h2>
          </div>
          <div className="stats-section flex flex-wrap gap-4 md:gap-6">
            <div className="flex items-center gap-2">
              <div
                className="stat-card px-4 py-2 rounded-lg"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                }}
              >
                <span className="stat-label text-sm" style={{ color: "#9CA3AF" }}>
                  Total Questions
                </span>
                <p className="stat-value text-2xl font-bold mt-1" style={{ color: "#E5E7EB" }}>
                  {totalQuestions}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="stat-card px-4 py-2 rounded-lg"
                style={{
                  backgroundColor: "rgba(52, 211, 153, 0.1)",
                  border: "1px solid rgba(52, 211, 153, 0.3)",
                }}
              >
                <span className="stat-label text-sm" style={{ color: "#86EFAC" }}>
                  Solved Questions
                </span>
                <p className="stat-value text-2xl font-bold mt-1" style={{ color: "#34D399" }}>
                  {solvedQuestions}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {topics.length === 0 ? (
        <div
          className="empty-state p-8 text-center rounded-2xl border"
          style={{
            backgroundColor: "#0B1220",
            borderColor: "rgba(255, 255, 255, 0.2)",
            color: "#9CA3AF",
          }}
        >
          No questions available yet.
        </div>
      ) : (
        <div className="topics-container space-y-3">
          {topics.map((topic) => (
            <div
              key={topic}
              className="topic-card rounded-2xl border overflow-hidden"
              style={{
                backgroundColor: "#0B1220",
                borderColor: "rgba(255, 255, 255, 0.2)",
              }}
            >
              {/* Topic Header */}
              <div
                className="topic-header px-6 py-4 border-b cursor-pointer"
                style={{
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  borderColor: "rgba(255, 255, 255, 0.2)",
                }}
                onClick={() => toggleTopic(topic)}
              >
                <div className="topic-header-content flex items-center justify-between">
                  <div className="topic-title-section">
                    <h3 className="topic-title text-xl font-bold" style={{ color: "#E5E7EB" }}>
                      {topic}
                    </h3>
                    <p className="topic-count text-sm mt-1" style={{ color: "#9CA3AF" }}>
                      {groupedQuestions[topic].length} question
                      {groupedQuestions[topic].length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {openTopic === topic ? (
                      <ChevronUp className="topic-chevron w-5 h-5" style={{ color: "#E5E7EB" }} />
                    ) : (
                      <ChevronDown className="topic-chevron w-5 h-5" style={{ color: "#E5E7EB" }} />
                    )}
                  </div>
                </div>
              </div>

              {/* Questions Table - Desktop */}
              {openTopic === topic && (
              <div className="questions-table-container overflow-x-auto">
                <table className="questions-table w-full">
                  <thead>
                    <tr
                      className="text-left"
                      style={{
                        backgroundColor: "rgba(15, 23, 42, 0.7)",
                        color: "#E5E7EB",
                      }}
                    >
                      <th className="p-4 text-sm font-medium">#</th>
                      <th className="p-4 text-sm font-medium">Question Name</th>
                      <th className="p-4 text-sm font-medium">Practice</th>
                      <th className="p-4 text-sm font-medium">Video Solution</th>
                      <th className="p-4 text-sm font-medium">Status</th>
                      <th className="p-4 text-sm font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedQuestions[topic].map((question, index) => (
                      <tr
                        key={question._id}
                        className="border-t"
                        style={{
                          borderColor: "rgba(148, 163, 184, 0.3)",
                        }}
                      >
                        <td className="p-4 text-sm font-semibold" style={{ color: "#E5E7EB" }}>
                          {index + 1}
                        </td>
                        <td className="p-4 text-sm" style={{ color: "#E5E7EB" }}>
                          {question.name}
                        </td>
                        <td className="p-4">
                          <a
                            href={question.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Practice
                          </a>
                        </td>
                        <td className="p-4">
                          {question.videoLink ? (
                            <a
                              href={question.videoLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors"
                            >
                              <Youtube className="w-4 h-4" />
                              Watch
                            </a>
                          ) : (
                            <span className="text-gray-500 text-sm">-</span>
                          )}
                        </td>
                        <td className="p-4">
                          {getStatusButton(question)}
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => handleNotesClick(question)}
                            className="p-2 rounded-lg transition-colors"
                            style={{
                              backgroundColor: question.notes
                                ? "rgba(34, 197, 94, 0.1)"
                                : "rgba(255, 255, 255, 0.1)",
                              color: question.notes ? "#86EFAC" : "#E5E7EB",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = question.notes
                                ? "rgba(34, 197, 94, 0.2)"
                                : "rgba(255, 255, 255, 0.2)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = question.notes
                                ? "rgba(34, 197, 94, 0.1)"
                                : "rgba(255, 255, 255, 0.1)";
                            }}
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Questions Cards - Mobile */}
                <div className="questions-cards">
                  {groupedQuestions[topic].map((question, index) => {
                    const isQuestionOpen = openQuestions.has(question._id);
                    return (
                      <div key={question._id} className="question-card">
                        <div 
                          className="question-card-header-mobile"
                          onClick={() => toggleQuestion(question._id)}
                        >
                          <div className="question-header-content">
                            <div className="question-number">{index + 1}</div>
                            <div className="question-name">{question.name}</div>
                          </div>
                          <div className="question-chevron-mobile">
                            {isQuestionOpen ? (
                              <ChevronUp className="w-5 h-5" style={{ color: "#E5E7EB" }} />
                            ) : (
                              <ChevronDown className="w-5 h-5" style={{ color: "#E5E7EB" }} />
                            )}
                          </div>
                        </div>
                        {isQuestionOpen && (
                          <div className="question-actions">
                            <div className="question-action-row">
                              <span className="question-action-label">Practice:</span>
                              <a
                                href={question.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="question-action-button practice-link"
                                style={{
                                  backgroundColor: "rgba(96, 165, 250, 0.1)",
                                  color: "#60A5FA",
                                  border: "1px solid rgba(96, 165, 250, 0.3)",
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-4 h-4" />
                                Practice
                              </a>
                            </div>
                            <div className="question-action-row">
                              <span className="question-action-label">Video:</span>
                              {question.videoLink ? (
                                <a
                                  href={question.videoLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="question-action-button video-link"
                                  style={{
                                    backgroundColor: "rgba(248, 113, 113, 0.1)",
                                    color: "#F87171",
                                    border: "1px solid rgba(248, 113, 113, 0.3)",
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Youtube className="w-4 h-4" />
                                  Watch
                                </a>
                              ) : (
                                <span className="no-video">-</span>
                              )}
                            </div>
                            <div className="question-action-row">
                              <span className="question-action-label">Status:</span>
                              <div className="status-button-wrapper" onClick={(e) => e.stopPropagation()}>
                                {getStatusButton(question)}
                              </div>
                            </div>
                            <div className="question-action-row">
                              <span className="question-action-label">Notes:</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNotesClick(question);
                                }}
                                className="notes-button"
                                style={{
                                  backgroundColor: question.notes
                                    ? "rgba(34, 197, 94, 0.1)"
                                    : "rgba(255, 255, 255, 0.1)",
                                  color: question.notes ? "#86EFAC" : "#E5E7EB",
                                  border: question.notes
                                    ? "1px solid rgba(34, 197, 94, 0.3)"
                                    : "1px solid rgba(255, 255, 255, 0.2)",
                                }}
                              >
                                <FileText />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Notes Modal */}
      {showNotesModal && selectedQuestion && (
        <div
          className="notes-modal-overlay fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleCloseNotesModal}
        >
          <div
            className="notes-modal rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] flex flex-col"
            style={{
              backgroundColor: "#0B1220",
              border: "1px solid rgba(255, 255, 255, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="notes-modal-header flex items-center justify-between mb-4">
              <div>
                <h3 className="notes-modal-title text-xl font-bold" style={{ color: "#E5E7EB" }}>
                  Notes for Question #{selectedQuestion.questionNumber}
                </h3>
                <p className="notes-modal-subtitle text-sm mt-1" style={{ color: "#9CA3AF" }}>
                  {selectedQuestion.name}
                </p>
              </div>
              <button
                onClick={handleCloseNotesModal}
                className="notes-modal-close p-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                  color: "#E5E7EB",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notes Textarea */}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Write your notes here..."
              className="notes-textarea flex-1 w-full px-4 py-3 rounded-lg border resize-none"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                borderColor: "rgba(255, 255, 255, 0.2)",
                color: "#E5E7EB",
                minHeight: "300px",
              }}
            />

            {/* Footer */}
            <div className="notes-modal-footer flex gap-3 mt-4">
              <button
                onClick={handleCloseNotesModal}
                className="notes-modal-button flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-300"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  color: "#E5E7EB",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNotes}
                disabled={saving}
                className="notes-modal-button flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center justify-center gap-2"
                style={{
                  backgroundColor: "rgba(34, 197, 94, 0.1)",
                  color: "#86EFAC",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                }}
                onMouseEnter={(e) => {
                  if (!saving) {
                    e.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.2)";
                    e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!saving) {
                    e.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.1)";
                    e.currentTarget.style.borderColor = "rgba(34, 197, 94, 0.3)";
                  }
                }}
              >
                <Save className="w-4 h-4" />
                {saving ? "Saving..." : "Save Notes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
