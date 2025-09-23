import React, { useEffect, useState } from "react";
import StudentTable from "../components/StudentTable";
import apiRequest from "../services/api";

const StudentResults = () => {
  const [completedTests, setCompletedTests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCompletedTests();
  }, []);

  const fetchCompletedTests = async () => {
    try {
      const response = await apiRequest("/test-submissions/student");
      setCompletedTests(response);
    } catch (error) {
      console.error("Error fetching completed tests:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">🏆 Completed Tests</h1>
          <div className="flex flex-wrap items-center gap-4 text-lg font-semibold">
            <span className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full text-white shadow-lg hover:shadow-blue-500/50 transition-all duration-300 hover:scale-105 cursor-pointer">
              🎯 Track Progress
            </span>
            <span className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full text-white shadow-lg hover:shadow-purple-500/50 transition-all duration-300 hover:scale-105 cursor-pointer">
              📊 Analyze Performance
            </span>
            <span className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full text-white shadow-lg hover:shadow-yellow-500/50 transition-all duration-300 hover:scale-105 cursor-pointer">
              🏆 Celebrate Achievements
            </span>
          </div>
        </div>
        <StudentTable type="completed" data={completedTests} />
      </div>
    </div>
  );
};

export default StudentResults;
