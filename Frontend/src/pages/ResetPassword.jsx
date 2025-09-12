import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!token) {
      setError('Invalid or missing token');
      return;
    }

    setLoading(true);
    try {
      await authAPI.resetPassword({ token });
      setSuccess('Password and email updated successfully. You can now login with your new credentials.');
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
      <div className="bg-slate-800 p-8 rounded-lg shadow-lg w-full max-w-md border border-slate-700">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Confirm Password Reset</h2>
        <p className="text-gray-300 text-sm mb-6 text-center">
          Click the button below to confirm your password and email changes.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-red-400 text-sm text-center">{error}</div>}
          {success && <div className="text-green-400 text-sm text-center">{success}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-1 bg-white hover:bg-gray-100 disabled:bg-gray-200 text-black font-bold py-2 px-4 rounded-md transition duration-300 cursor-pointer"
          >
            {loading ? 'Confirming...' : 'Confirm Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
