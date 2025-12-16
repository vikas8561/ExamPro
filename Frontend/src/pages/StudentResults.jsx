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
    return (
      <div className="p-8 min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0B1220' }}>
        <div className="text-xl" style={{ color: '#E5E7EB' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: '#0B1220' }}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4" style={{ color: '#E5E7EB' }}>🏆 Completed Tests</h1>
          <div className="flex flex-wrap items-center gap-4 text-lg font-semibold">
            <span 
              className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-300 cursor-pointer"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                color: '#FFFFFF'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              }}
            >
              🎯 Track Progress
            </span>
            <span 
              className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-300 cursor-pointer"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                color: '#FFFFFF'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              }}
            >
              📊 Analyze Performance
            </span>
            <span 
              className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-300 cursor-pointer"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                color: '#FFFFFF'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              }}
            >
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
