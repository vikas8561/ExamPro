import StudentTable from "../components/StudentTable";

const StudentResults = () => {
  const data = [
    { name: "English Exam 1", score: "85/100", feedback: "Good job, keep it up!" },
    { name: "Physics Quiz 1", score: "70/100", feedback: "Needs improvement in mechanics" },
  ];
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Completed Tests</h1>
      <StudentTable type="completed" data={data} />
    </div>
  );
};

export default StudentResults;
