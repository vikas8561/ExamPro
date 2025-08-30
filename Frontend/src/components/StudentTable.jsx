import React from "react";

const StudentTable = ({ type, data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 text-center text-slate-400">
        No {type === "assigned" ? "assigned" : "completed"} tests found.
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden student-table-container">
      <div className="max-h-96 overflow-y-auto scroll-smooth student-table-scroll">
        <table className="w-full">
          <thead className="bg-slate-700 sticky top-0 z-10">
            <tr>
              <th className="p-4 text-left text-slate-300">Test Name</th>
              {type === "completed" && (
                <>
                  <th className="p-4 text-left text-slate-300">Score</th>
                  <th className="p-4 text-left text-slate-300">Feedback</th>
                </>
              )}
              {type === "assigned" && (
                <th className="p-4 text-left text-slate-300">Status</th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={index} className="border-b border-slate-700 hover:bg-slate-700/50">
                <td className="p-4">
                  <div className="font-medium">{item.testId?.title || item.name || "Test"}</div>
                  {item.testId?.type && (
                    <div className="text-sm text-slate-400 capitalize">{item.testId.type}</div>
                  )}
                </td>
                
                {type === "completed" && (
                  <>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        (item.mentorScore || item.score || 0) >= 70 
                          ? 'bg-green-900/50 text-green-300'
                          : (item.mentorScore || item.score || 0) >= 50
                          ? 'bg-yellow-900/50 text-yellow-300'
                          : 'bg-red-900/50 text-red-300'
                      }`}>
                        {item.mentorScore || item.score || 0}%
                      </span>
                    </td>
                    <td className="p-4 text-slate-400">
                      {item.mentorFeedback || item.feedback || "No feedback yet"}
                    </td>
                  </>
                )}
                
                {type === "assigned" && (
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      item.status === "Assigned" 
                        ? 'bg-yellow-900/50 text-yellow-300'
                        : item.status === "In Progress"
                        ? 'bg-blue-900/50 text-blue-300'
                        : 'bg-gray-900/50 text-gray-300'
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
