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
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Completed Tests</h1>
      <StudentTable type="completed" data={completedTests} />
    </div>
  );
};

export default StudentResults;
