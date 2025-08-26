import React, { useState } from "react";

const EmailUploader = ({ onUploadComplete }) => {
  const [file, setFile] = useState(null);
  const [role, setRole] = useState("Student");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      alert("Please select a file");
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("role", role);

    try {
      const response = await fetch("http://localhost:4000/api/users/bulk", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      setUploadResults(data);
      if (onUploadComplete) {
        onUploadComplete(data);
      }
      alert("Upload completed successfully!");
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Error uploading file: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 mb-6">
      <h3 className="text-xl font-semibold mb-4">Bulk Upload Users</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-slate-300 mb-2">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full p-2 rounded bg-slate-900 border border-slate-700"
          >
            <option value="Student">Student</option>
            <option value="Mentor">Mentor</option>
            <option value="Admin">Admin</option>
          </select>
        </div>

        <div>
          <label className="block text-slate-300 mb-2">Upload File (CSV or JSON)</label>
          <input
            type="file"
            accept=".csv,.json"
            onChange={handleFileChange}
            className="w-full p-2 rounded bg-slate-900 border border-slate-700"
            required
          />
          <p className="text-sm text-slate-400 mt-1">
            Supported formats: CSV (with name and email columns) or JSON (array of objects with name and email fields)
          </p>
        </div>

        <button
          type="submit"
          disabled={isUploading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 px-4 py-2 rounded-md text-white"
        >
          {isUploading ? "Uploading..." : "Upload Users"}
        </button>
      </form>

      {uploadResults && (
        <div className="mt-6 p-4 bg-slate-900 rounded-lg">
          <h4 className="text-lg font-semibold mb-2">Upload Results</h4>
          <p className="mb-2">Total processed: {uploadResults.results?.length}</p>
          <div className="max-h-40 overflow-y-auto">
            {uploadResults.results?.map((result, index) => (
              <div key={index} className={`text-sm p-1 ${result.status === "success" ? "text-green-400" : "text-red-400"}`}>
                {result.email}: {result.status} - {result.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailUploader;
