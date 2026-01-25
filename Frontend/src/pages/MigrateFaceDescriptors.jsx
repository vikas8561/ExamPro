import React, { useState, useEffect } from "react";
import { API_BASE_URL } from '../config/api';
import * as faceapi from "face-api.js";
import apiRequest from "../services/api";

/**
 * Migration Tool: Extract Face Descriptors from Existing Profile Images
 * 
 * This tool processes users who have profile images but no face descriptors.
 * It extracts descriptors using face-api.js and stores them securely.
 * 
 * SECURITY: Admin only
 */
export default function MigrateFaceDescriptors() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [progress, setProgress] = useState({ processed: 0, failed: 0, total: 0 });
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [error, setError] = useState(null);

  // Load face-api.js models
  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
        console.log('✅ Face-api.js models loaded');
      } catch (error) {
        console.error('❌ Error loading models:', error);
        setError('Failed to load face-api.js models. Please ensure models are in /public/models folder.');
      }
    };

    loadModels();
  }, []);

  // Fetch users that need migration
  const fetchUsersToMigrate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest('/migration/extract-face-descriptors', {
        method: 'POST'
      });
      
      if (response.usersFound > 0) {
        setUsers(response.users);
        setProgress(prev => ({ ...prev, total: response.usersFound }));
      } else {
        setUsers([]);
        alert('No users need migration. All users either have face descriptors or no profile images.');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setError(error.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  // Extract face descriptor from a user's profile image
  const extractDescriptor = async (user) => {
    try {
      // Fetch user profile to get the image (admin can access full profile)
      const userProfile = await apiRequest(`/users/${user.id}/full-profile`);
      
      if (!userProfile.profileImage) {
        throw new Error('User has no profile image');
      }

      // Extract face descriptor using face-api.js
      const img = await faceapi.fetchImage(userProfile.profileImage);
      const detection = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        throw new Error('No face detected in profile image');
      }

      const faceDescriptor = Array.from(detection.descriptor);

      // Update user's faceDescriptor directly (admin override)
      // Note: This bypasses the one-time check since it's a migration
      await apiRequest(`/users/${user.id}/update-face-descriptor`, {
        method: 'POST',
        body: JSON.stringify({
          faceDescriptor: faceDescriptor
        })
      });

      return { success: true, user };
    } catch (error) {
      console.error(`Error processing user ${user.name}:`, error);
      return { success: false, user, error: error.message };
    }
  };

  // Process all users
  const processAllUsers = async () => {
    if (!modelsLoaded) {
      alert('Please wait for face-api.js models to load');
      return;
    }

    if (users.length === 0) {
      alert('No users to process. Please fetch users first.');
      return;
    }

    setProcessing(true);
    setProgress({ processed: 0, failed: 0, total: users.length });
    setError(null);

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      setCurrentUser(user);

      const result = await extractDescriptor(user);

      if (result.success) {
        setProgress(prev => ({ ...prev, processed: prev.processed + 1 }));
      } else {
        setProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
      }

      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setCurrentUser(null);
    setProcessing(false);
    alert(`Migration complete!\nProcessed: ${progress.processed + (progress.processed > 0 ? 1 : 0)}\nFailed: ${progress.failed}`);
    
    // Refresh user list
    await fetchUsersToMigrate();
  };

  // Process single user
  const processSingleUser = async (user) => {
    if (!modelsLoaded) {
      alert('Please wait for face-api.js models to load');
      return;
    }

    setProcessing(true);
    setCurrentUser(user);
    setError(null);

    try {
      const result = await extractDescriptor(user);
      
      if (result.success) {
        alert(`Successfully processed ${user.name}`);
        setProgress(prev => ({ ...prev, processed: prev.processed + 1 }));
        // Remove from list
        setUsers(prev => prev.filter(u => u.id !== user.id));
      } else {
        alert(`Failed to process ${user.name}: ${result.error}`);
        setProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
      }
    } catch (error) {
      alert(`Error processing ${user.name}: ${error.message}`);
    } finally {
      setCurrentUser(null);
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: '#0B1220', color: '#E5E7EB' }}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Face Descriptor Migration Tool</h1>
        <p className="text-slate-400 mb-6">
          This tool extracts face descriptors from existing profile images for users who uploaded images
          before the secure face descriptor system was implemented.
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {!modelsLoaded && (
          <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg p-4 mb-6">
            <p className="text-yellow-400">Loading face-api.js models... Please wait.</p>
          </div>
        )}

        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <div className="flex gap-4 mb-4">
            <button
              onClick={fetchUsersToMigrate}
              disabled={loading || processing}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Fetch Users to Migrate'}
            </button>

            {users.length > 0 && (
              <button
                onClick={processAllUsers}
                disabled={!modelsLoaded || processing}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Processing...' : `Process All (${users.length})`}
              </button>
            )}
          </div>

          {progress.total > 0 && (
            <div className="mb-4">
              <p className="text-slate-300 mb-2">
                Progress: {progress.processed} processed, {progress.failed} failed, {progress.total} total
              </p>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all"
                  style={{ width: `${(progress.processed / progress.total) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          {currentUser && (
            <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-4 mb-4">
              <p className="text-blue-400">Processing: {currentUser.name} ({currentUser.email})</p>
            </div>
          )}
        </div>

        {users.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Users to Migrate ({users.length})</h2>
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="bg-slate-700 rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="font-semibold">{user.name}</p>
                    <p className="text-sm text-slate-400">{user.email}</p>
                  </div>
                  <button
                    onClick={() => processSingleUser(user)}
                    disabled={!modelsLoaded || processing}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Process
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {users.length === 0 && !loading && (
          <div className="bg-slate-800 rounded-lg p-6 text-center">
            <p className="text-slate-400">No users found. Click "Fetch Users to Migrate" to start.</p>
          </div>
        )}
      </div>
    </div>
  );
}

