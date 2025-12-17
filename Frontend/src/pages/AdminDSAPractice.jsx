import React, { useEffect, useState, useRef } from "react";
import { Plus, Edit2, Trash2, ExternalLink, Youtube, ChevronDown } from "lucide-react";
import apiRequest from "../services/api";

// DSA Topics List
const DSA_TOPICS = [
  "Arrays",
  "Strings",
  "Linked Lists",
  "Stacks",
  "Queues",
  "Trees",
  "Binary Trees",
  "Binary Search Trees",
  "Graphs",
  "Hash Tables",
  "Heaps",
  "Dynamic Programming",
  "Greedy Algorithms",
  "Backtracking",
  "Sorting",
  "Searching",
  "Recursion",
  "Two Pointers",
  "Sliding Window",
  "Bit Manipulation",
  "Math",
  "Matrix",
  "Trie",
  "Union Find",
  "Segment Tree",
  "Binary Indexed Tree",
  "String Matching",
  "Geometry",
  "Game Theory",
  "Divide and Conquer",
  "Monotonic Stack",
  "Monotonic Queue",
  "Topological Sort",
  "Shortest Path",
  "Minimum Spanning Tree",
  "Network Flow",
  "String Algorithms",
  "Advanced Data Structures",
];

export default function AdminDSAPractice() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [isCustomTopic, setIsCustomTopic] = useState(false);
  const [customTopic, setCustomTopic] = useState("");
  const [showTopicDropdown, setShowTopicDropdown] = useState(false);
  const topicDropdownRef = useRef(null);
  const [formData, setFormData] = useState({
    name: "",
    link: "",
    videoLink: "",
    topic: "",
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (topicDropdownRef.current && !topicDropdownRef.current.contains(event.target)) {
        setShowTopicDropdown(false);
      }
    };

    if (showTopicDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showTopicDropdown]);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const data = await apiRequest("/dsa-questions/admin/all");
      setQuestions(data.questions || []);
    } catch (err) {
      console.error("Error fetching DSA questions:", err);
      alert("Failed to fetch questions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Use custom topic if custom is selected, otherwise use selected topic
      const finalTopic = isCustomTopic ? customTopic.trim() : formData.topic;
      
      if (!finalTopic) {
        alert("Please select or enter a topic");
        return;
      }

      const submitData = {
        ...formData,
        topic: finalTopic,
      };

      if (editingQuestion) {
        // Update existing question
        await apiRequest(`/dsa-questions/${editingQuestion._id}`, {
          method: "PUT",
          body: JSON.stringify(submitData),
        });
      } else {
        // Create new question
        await apiRequest("/dsa-questions", {
          method: "POST",
          body: JSON.stringify(submitData),
        });
      }
      setShowModal(false);
      setEditingQuestion(null);
      setIsCustomTopic(false);
      setCustomTopic("");
      setFormData({ name: "", link: "", videoLink: "", topic: "" });
      fetchQuestions();
    } catch (err) {
      console.error("Error saving question:", err);
      alert(err.message || "Failed to save question. Please try again.");
    }
  };

  const handleEdit = (question) => {
    setEditingQuestion(question);
    const topic = question.topic || "";
    const isCustom = !DSA_TOPICS.includes(topic);
    setIsCustomTopic(isCustom);
    setCustomTopic(isCustom ? topic : "");
    setFormData({
      name: question.name,
      link: question.link,
      videoLink: question.videoLink || "",
      topic: isCustom ? "" : topic,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this question?")) {
      return;
    }
    try {
      await apiRequest(`/dsa-questions/${id}`, {
        method: "DELETE",
      });
      fetchQuestions();
    } catch (err) {
      console.error("Error deleting question:", err);
      alert("Failed to delete question. Please try again.");
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingQuestion(null);
    setIsCustomTopic(false);
    setCustomTopic("");
    setShowTopicDropdown(false);
    setFormData({ name: "", link: "", videoLink: "", topic: "" });
  };

  const handleTopicSelect = (topic) => {
    if (topic === "custom") {
      setIsCustomTopic(true);
      setFormData({ ...formData, topic: "" });
    } else {
      setIsCustomTopic(false);
      setCustomTopic("");
      setFormData({ ...formData, topic });
    }
    setShowTopicDropdown(false);
  };

  if (loading) {
    return (
      <div
        className="p-6 min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#0B1220" }}
      >
        <div className="text-xl" style={{ color: "#E5E7EB" }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen" style={{ backgroundColor: "#0B1220" }}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold" style={{ color: "#E5E7EB" }}>
          DSA Practice Questions
        </h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-300"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.1)",
            color: "#FFFFFF",
            border: "1px solid rgba(255, 255, 255, 0.3)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
          }}
        >
          <Plus className="w-5 h-5" />
          Add Question
        </button>
      </div>

      {/* Questions List */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          backgroundColor: "#0B1220",
          borderColor: "rgba(255, 255, 255, 0.2)",
        }}
      >
        <table className="w-full">
          <thead>
            <tr
              className="text-left"
              style={{
                backgroundColor: "rgba(15, 23, 42, 0.9)",
                color: "#E5E7EB",
              }}
            >
              <th className="p-4 text-sm font-medium">#</th>
              <th className="p-4 text-sm font-medium">Question Name</th>
              <th className="p-4 text-sm font-medium">Topic</th>
              <th className="p-4 text-sm font-medium">Link</th>
              <th className="p-4 text-sm font-medium">Video Link</th>
              <th className="p-4 text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {questions.length === 0 ? (
              <tr>
                <td
                  colSpan="6"
                  className="p-8 text-center text-sm"
                  style={{ color: "#9CA3AF" }}
                >
                  No questions found. Click "Add Question" to create one.
                </td>
              </tr>
            ) : (
              questions.map((question) => (
                <tr
                  key={question._id}
                  className="border-t"
                  style={{ borderColor: "rgba(148, 163, 184, 0.3)" }}
                >
                  <td className="p-4 text-sm font-semibold" style={{ color: "#E5E7EB" }}>
                    {question.questionNumber}
                  </td>
                  <td className="p-4 text-sm" style={{ color: "#E5E7EB" }}>
                    {question.name}
                  </td>
                  <td className="p-4">
                    <span
                      className="px-3 py-1 rounded-lg text-xs font-medium"
                      style={{
                        backgroundColor: "rgba(59, 130, 246, 0.1)",
                        color: "#60A5FA",
                      }}
                    >
                      {question.topic}
                    </span>
                  </td>
                  <td className="p-4">
                    <a
                      href={question.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open
                    </a>
                  </td>
                  <td className="p-4">
                    {question.videoLink ? (
                      <a
                        href={question.videoLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Youtube className="w-4 h-4" />
                        Watch
                      </a>
                    ) : (
                      <span className="text-gray-500 text-sm">No video</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(question)}
                        className="p-2 rounded-lg transition-colors"
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
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(question._id)}
                        className="p-2 rounded-lg transition-colors"
                        style={{
                          backgroundColor: "rgba(239, 68, 68, 0.1)",
                          color: "#EF4444",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.2)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div
            className="rounded-2xl p-6 max-w-md w-full"
            style={{
              backgroundColor: "#0B1220",
              border: "1px solid rgba(255, 255, 255, 0.2)",
            }}
          >
            <h3 className="text-xl font-bold mb-4" style={{ color: "#E5E7EB" }}>
              {editingQuestion ? "Edit Question" : "Add New Question"}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-sm font-medium mb-2"
                    style={{ color: "#E5E7EB" }}
                  >
                    Question Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-4 py-2 rounded-lg border"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.05)",
                      borderColor: "rgba(255, 255, 255, 0.2)",
                      color: "#E5E7EB",
                    }}
                    placeholder="e.g., Two Sum"
                  />
                </div>
                <div>
                  <label
                    className="block text-sm font-medium mb-2"
                    style={{ color: "#E5E7EB" }}
                  >
                    Question Link *
                  </label>
                  <input
                    type="url"
                    required
                    value={formData.link}
                    onChange={(e) =>
                      setFormData({ ...formData, link: e.target.value })
                    }
                    className="w-full px-4 py-2 rounded-lg border"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.05)",
                      borderColor: "rgba(255, 255, 255, 0.2)",
                      color: "#E5E7EB",
                    }}
                    placeholder="https://leetcode.com/problems/two-sum"
                  />
                </div>
                <div className="relative" ref={topicDropdownRef}>
                  <label
                    className="block text-sm font-medium mb-2"
                    style={{ color: "#E5E7EB" }}
                  >
                    Topic *
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowTopicDropdown(!showTopicDropdown)}
                      className="flex-1 px-4 py-2 rounded-lg border flex items-center justify-between"
                      style={{
                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                        borderColor: "rgba(255, 255, 255, 0.2)",
                        color: "#E5E7EB",
                      }}
                    >
                      <span>
                        {isCustomTopic ? "Custom" : formData.topic || "Select a topic"}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          showTopicDropdown ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>
                  
                  {showTopicDropdown && (
                    <div
                      className="absolute left-full top-0 ml-2 w-64 max-h-80 overflow-y-auto rounded-lg border z-50 custom-scrollbar"
                      style={{
                        backgroundColor: "#0B1220",
                        borderColor: "rgba(255, 255, 255, 0.2)",
                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
                      }}
                    >
                      <div className="p-2">
                        {DSA_TOPICS.map((topic) => (
                          <button
                            key={topic}
                            type="button"
                            onClick={() => handleTopicSelect(topic)}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                            style={{
                              color:
                                formData.topic === topic && !isCustomTopic
                                  ? "#60A5FA"
                                  : "#E5E7EB",
                              backgroundColor:
                                formData.topic === topic && !isCustomTopic
                                  ? "rgba(59, 130, 246, 0.1)"
                                  : "transparent",
                            }}
                          >
                            {topic}
                          </button>
                        ))}
                        <div className="border-t my-1" style={{ borderColor: "rgba(255, 255, 255, 0.2)" }} />
                        <button
                          type="button"
                          onClick={() => handleTopicSelect("custom")}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                          style={{
                            color: isCustomTopic ? "#60A5FA" : "#E5E7EB",
                            backgroundColor: isCustomTopic
                              ? "rgba(59, 130, 246, 0.1)"
                              : "transparent",
                          }}
                        >
                          Custom (Enter manually)
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {isCustomTopic && (
                    <input
                      type="text"
                      required
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border mt-2"
                      style={{
                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                        borderColor: "rgba(255, 255, 255, 0.2)",
                        color: "#E5E7EB",
                      }}
                      placeholder="Enter custom topic name"
                    />
                  )}
                </div>
                <div>
                  <label
                    className="block text-sm font-medium mb-2"
                    style={{ color: "#E5E7EB" }}
                  >
                    Video Link (YouTube)
                  </label>
                  <input
                    type="url"
                    value={formData.videoLink}
                    onChange={(e) =>
                      setFormData({ ...formData, videoLink: e.target.value })
                    }
                    className="w-full px-4 py-2 rounded-lg border"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.05)",
                      borderColor: "rgba(255, 255, 255, 0.2)",
                      color: "#E5E7EB",
                    }}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-300"
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    color: "#E5E7EB",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-300"
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    color: "#FFFFFF",
                    border: "1px solid rgba(255, 255, 255, 0.3)",
                  }}
                >
                  {editingQuestion ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 10px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
      `}</style>
    </div>
  );
}
