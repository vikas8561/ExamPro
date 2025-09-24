import React from "react";
import { getRandomFeedback } from "../utils/feedbackMessages";

const StudentTable = ({ type, data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 text-center text-slate-400">
        No {type === "assigned" ? "assigned" : "completed"} tests found.
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden">
      <div className="h-[calc(100vh-200px)] overflow-y-auto scroll-smooth">
        <table className="w-full">
          <thead className="bg-gradient-to-r from-slate-700 to-slate-600 sticky top-0 z-10 shadow-lg">
            <tr>
              <th className="p-6 text-left text-white font-semibold text-lg">📝 Test Name</th>
              {type === "completed" && (
                <>
                  <th className="p-6 text-left text-white font-semibold text-lg">📊 Score</th>
                  <th className="p-6 text-center text-white font-semibold text-lg">💬 Feedback</th>
                  <th className="p-6 text-left text-white font-semibold text-lg whitespace-nowrap">📅 Completed</th>
                </>
              )}
              {type === "assigned" && (
                <th className="p-6 text-left text-white font-semibold text-lg">📋 Status</th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={index} className="border-b border-slate-600 hover:bg-gradient-to-r hover:from-slate-700/50 hover:to-slate-600/50 transition-all duration-200 group">
                <td className="p-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-white text-lg">{item.testId?.title || item.name || "Test"}</div>
                      {item.testId?.type && (
                        <div className="text-sm text-slate-300 capitalize bg-slate-600 px-2 py-1 rounded-full inline-block mt-1">
                          {item.testId.type}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                
                {type === "completed" && (
                  <>
                    <td className="p-6">
                    {(() => {
                      const currentTime = new Date();
                      const assignmentDeadline = item.assignmentId?.deadline ? new Date(item.assignmentId.deadline) : null;
                      if (assignmentDeadline && currentTime < assignmentDeadline) {
                        return (
                          <div className="flex items-center space-x-2">
                            <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
                            <span className="px-4 py-2 rounded-full text-sm font-medium bg-yellow-900/30 text-yellow-300 border border-yellow-500/30">
                              Available after deadline
                            </span>
                          </div>
                        );
                      }
                      const score = item.mentorScore !== null ? item.mentorScore : (item.maxScore ? Math.round((item.totalScore / item.maxScore) * 100) : 0);
                      const colorClass = score >= 90 ? 'bg-gradient-to-r from-emerald-400 via-green-500 to-teal-600 text-white shadow-emerald-500/50' : 
                                       score >= 80 ? 'bg-gradient-to-r from-green-400 via-emerald-500 to-green-600 text-white shadow-green-500/50' : 
                                       score >= 70 ? 'bg-gradient-to-r from-blue-400 via-cyan-500 to-blue-600 text-white shadow-blue-500/50' :
                                       score >= 60 ? 'bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 text-white shadow-orange-500/50' : 
                                       score >= 50 ? 'bg-gradient-to-r from-orange-400 via-red-500 to-pink-500 text-white shadow-red-500/50' :
                                       'bg-gradient-to-r from-red-500 via-pink-500 to-rose-600 text-white shadow-red-500/50';
                      const glowClass = score >= 80 ? 'shadow-lg shadow-emerald-500/30' : score >= 60 ? 'shadow-lg shadow-orange-500/30' : 'shadow-lg shadow-red-500/30';
                      return (
                        <div className="flex items-center justify-center">
                          <span className={`w-20 px-6 py-3 rounded-full text-sm font-bold shadow-lg hover:scale-110 hover:shadow-xl transition-all duration-300 transform ${colorClass} ${glowClass} border-2 border-white/20 hover:border-white/40 text-center`}>
                            {score}%
                          </span>
                        </div>
                      );
                    })()}
                    </td>
                    <td className="p-6">
                      <div className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                        <p className="text-slate-200 text-sm font-bold">
                          {(() => {
                            // Use mentor feedback if available, otherwise generate automatic feedback
                            if (item.mentorFeedback || item.feedback) {
                              return item.mentorFeedback || item.feedback;
                            }
                            
                            // Generate automatic feedback based on score
                            const score = item.mentorScore !== null ? item.mentorScore : (item.maxScore ? Math.round((item.totalScore / item.maxScore) * 100) : 0);
                            const testId = item.testId?._id || item._id || 'default';
                            
                            return getRandomFeedback(score, testId);
                          })()}
                        </p>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="text-slate-300 text-sm font-bold text-right pr-4">
                        {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : 'N/A'}
                      </div>
                    </td>
                  </>
                )}
                
                {type === "assigned" && (
                  <td className="p-6">
                    <span className={`px-4 py-2 rounded-full text-sm font-medium shadow-lg ${
                      item.status === "Assigned" 
                        ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white'
                        : item.status === "In Progress"
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                        : 'bg-gradient-to-r from-gray-500 to-slate-600 text-white'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StudentTable;
