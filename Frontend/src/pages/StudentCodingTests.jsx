import React, { useEffect, useState } from 'react';
import apiRequest from '../services/api';
import { Link, useNavigate } from 'react-router-dom';

export default function StudentCodingTests() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const all = await apiRequest('/tests');
        const coding = (all.tests || []).filter(t => t.type === 'coding');
        setTests(coding);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Coding Tests</h1>
      </div>

      {tests.length === 0 ? (
        <div className="text-slate-400">No coding tests available.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tests.map(t => (
            <div key={t._id} className="p-4 bg-slate-800 rounded border border-slate-700">
              <div className="font-semibold text-lg mb-1">{t.title}</div>
              <div className="text-sm text-slate-400 mb-2">{t.subject}</div>
              <button onClick={() => nav(`/student/take-coding/${t._id}`)} className="px-3 py-2 bg-blue-600 rounded hover:bg-blue-700">Start</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


