import React, { useEffect, useState } from "react";
import UpcomingTests from "../components/UpcomingTests";
import apiRequest from "../services/api";

const StudentDashboard = () => {
  const [assignedTests, setAssignedTests] = useState([]);
  const [completedTests, setCompletedTests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudentData();
  }, []);

  const fetchStudentData = async () => {
    try {
      // Fetch all assignments for the current student
      const allAssignments = await apiRequest("/assignments/student");

      // Filter assignments by status on client side
      const assignedTestsData = allAssignments.filter(assignment =>
        assignment.status === "Assigned" || assignment.status === "In Progress"
      );
      const completedTestsData = allAssignments.filter(assignment =>
        assignment.status === "Completed"
      );

      setAssignedTests(assignedTestsData);
      setCompletedTests(completedTestsData);
    } catch (error) {
      console.error("Error fetching student data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  const upcomingTests = assignedTests.filter(test => new Date(test.startTime) >= new Date());

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold mb-6">Student Dashboard</h2>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
          <p className="text-slate-300">Total Assigned Tests</p>
          <p className="text-3xl font-bold mt-2">{assignedTests.length}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
          <p className="text-slate-300">Completed Tests</p>
          <p className="text-3xl font-bold mt-2">{completedTests.length}</p>
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-3">Upcoming Tests</h3>
      <UpcomingTests data={upcomingTests} />
    </div>
  );
};

export default StudentDashboard;
