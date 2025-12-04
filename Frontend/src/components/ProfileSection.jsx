import React, { useState, useEffect, useRef } from "react";
import { Camera, Mail, Lock, User as UserIcon, Building2 } from "lucide-react";

import { API_BASE_URL } from '../config/api';

export default function ProfileSection() {
  // Initialize user from localStorage immediately
  const getInitialUser = () => {
    try {
      const localUser = localStorage.getItem('user');
      if (localUser) {
        return JSON.parse(localUser);
      }
    } catch (e) {
      console.error('Error parsing local user:', e);
    }
    return null;
  };

  const [user, setUser] = useState(getInitialUser());
  const [loading, setLoading] = useState(true);
  
  // Profile Image States
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Email Update States
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  
  // Password Change States
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  // Initialize captured image from user profile
  useEffect(() => {
    if (user?.profileImage) {
      setCapturedImage(user.profileImage);
    }
  }, [user]);

  // Fetch user profile
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        // Update localStorage user data
        localStorage.setItem('user', JSON.stringify(userData));
        if (userData.profileImage) {
          setCapturedImage(userData.profileImage);
        }
      } else {
        // If API fails, keep using localStorage data
        console.warn('Failed to fetch profile from API, using localStorage data');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      // Keep using localStorage data if API fails
    } finally {
      setLoading(false);
    }
  };

  // Camera Functions
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' },
        audio: false 
      });
      setStream(mediaStream);
      setShowCamera(true);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Unable to access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const sourceCanvas = canvasRef.current;
      const sourceContext = sourceCanvas.getContext('2d');

      // Capture at full resolution first
      sourceCanvas.width = video.videoWidth;
      sourceCanvas.height = video.videoHeight;
      sourceContext.drawImage(video, 0, 0);

      // Create a new canvas for high-quality output at 1000px
      const targetSize = 1000; // Target size in pixels (longest side)
      const aspectRatio = video.videoWidth / video.videoHeight;
      
      let targetWidth, targetHeight;
      if (video.videoWidth > video.videoHeight) {
        // Landscape orientation
        targetWidth = targetSize;
        targetHeight = Math.round(targetSize / aspectRatio);
      } else {
        // Portrait or square orientation
        targetWidth = Math.round(targetSize * aspectRatio);
        targetHeight = targetSize;
      }

      // Create output canvas for high-quality image
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = targetWidth;
      outputCanvas.height = targetHeight;
      const outputContext = outputCanvas.getContext('2d');

      // Use high-quality image rendering settings
      outputContext.imageSmoothingEnabled = true;
      outputContext.imageSmoothingQuality = 'high';

      // Draw and resize the image with high quality
      outputContext.drawImage(
        sourceCanvas,
        0, 0, sourceCanvas.width, sourceCanvas.height,
        0, 0, targetWidth, targetHeight
      );

      // Convert to PNG for maximum quality (lossless)
      // This ensures the highest possible quality at 1000px resolution
      const imageData = outputCanvas.toDataURL('image/png');
      
      setCapturedImage(imageData);
      stopCamera();
    }
  };

  const saveProfileImage = async () => {
    if (!capturedImage) return;

    // Check if image was already saved
    if (user?.profileImageSaved) {
      alert('Profile image can only be saved once and cannot be changed.');
      return;
    }

    setUploadingImage(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/auth/profile/image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image: capturedImage })
      });

      const data = await response.json();
      if (response.ok) {
        await fetchProfile(); // Refresh profile data
        alert('Profile image saved successfully!');
        setCapturedImage(null);
      } else {
        alert(data.message || 'Failed to save profile image');
      }
    } catch (error) {
      console.error('Error saving profile image:', error);
      alert('Error saving profile image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Email Update Functions
  const handleEmailUpdate = async (e) => {
    e.preventDefault();
    if (!newEmail) {
      setEmailMessage("Please enter a new email address");
      return;
    }

    setEmailLoading(true);
    setEmailMessage("");

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/auth/profile/update-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newEmail })
      });

      const data = await response.json();
      if (response.ok) {
        setEmailMessage("Verification email sent! Please check your new email address and click the verification link.");
        setShowEmailForm(false);
        setNewEmail("");
      } else {
        setEmailMessage(data.message || "Failed to update email");
      }
    } catch (error) {
      console.error('Error updating email:', error);
      setEmailMessage("Error updating email. Please try again.");
    } finally {
      setEmailLoading(false);
    }
  };

  // Password Change Functions
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      setPasswordMessage("Please fill in all fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage("Password must be at least 6 characters long");
      return;
    }

    setPasswordLoading(true);
    setPasswordMessage("");

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/auth/profile/change-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newPassword, confirmPassword })
      });

      const data = await response.json();
      if (response.ok) {
        setPasswordMessage("Verification email sent! Please check your email and click the verification link to complete the password change.");
        setShowPasswordForm(false);
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordMessage(data.message || "Failed to change password");
      }
    } catch (error) {
      console.error('Error changing password:', error);
      setPasswordMessage("Error changing password. Please try again.");
    } finally {
      setPasswordLoading(false);
    }
  };

  if (loading && !user) {
    return (
      <div className="p-4 text-center text-slate-400 text-sm">
        Loading profile...
      </div>
    );
  }

  // If no user data at all, show message
  if (!user) {
    return (
      <div className="p-4 text-center text-slate-400 text-sm">
        Unable to load profile. Please refresh the page.
      </div>
    );
  }

  const canCaptureImage = !user.profileImageSaved;

  return (
    <div className="p-4 border-t border-slate-700 space-y-4">
      {/* Profile Image */}
      <div className="flex flex-col items-center space-y-2">
        <div className="relative">
          {capturedImage || user.profileImage ? (
            <img
              src={capturedImage || user.profileImage}
              alt="Profile"
              className="w-20 h-20 rounded-full object-cover border-2 border-slate-600"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center border-2 border-slate-600">
              <UserIcon className="w-10 h-10 text-slate-400" />
            </div>
          )}
          {canCaptureImage && !capturedImage && !user.profileImage && (
            <button
              onClick={startCamera}
              className="absolute bottom-0 right-0 p-2 bg-blue-600 hover:bg-blue-700 rounded-full transition"
              title="Capture Profile Image"
            >
              <Camera className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
        {canCaptureImage && capturedImage && !user.profileImageSaved && (
          <div className="flex gap-2">
            <button
              onClick={saveProfileImage}
              disabled={uploadingImage}
              className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 rounded transition disabled:opacity-50"
            >
              {uploadingImage ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => {
                setCapturedImage(null);
                startCamera();
              }}
              disabled={uploadingImage}
              className="px-3 py-1 text-xs bg-slate-600 hover:bg-slate-700 rounded transition disabled:opacity-50"
            >
              Retake
            </button>
          </div>
        )}
        {user.profileImageSaved && (
          <p className="text-xs text-slate-500">Image saved</p>
        )}
      </div>

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center">
          <div className="bg-slate-800 rounded-lg p-4 max-w-md w-full mx-4">
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full rounded"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={capturePhoto}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition"
              >
                Capture
              </button>
              <button
                onClick={stopCamera}
                className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Info */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <UserIcon className="w-4 h-4 text-slate-400" />
          <span className="text-slate-300">{user.name}</span>
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <Mail className="w-4 h-4 text-slate-400" />
          <span className="text-slate-300">{user.email}</span>
          {!showEmailForm && (
            <button
              onClick={() => setShowEmailForm(true)}
              className="ml-auto text-xs text-blue-400 hover:text-blue-300"
            >
              Update
            </button>
          )}
        </div>

        {showEmailForm && (
          <form onSubmit={handleEmailUpdate} className="space-y-2 p-2 bg-slate-700/50 rounded">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="New email address"
              className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white"
              required
            />
            {emailMessage && (
              <p className={`text-xs ${emailMessage.includes("sent") ? "text-green-400" : "text-red-400"}`}>
                {emailMessage}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={emailLoading}
                className="flex-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded transition disabled:opacity-50"
              >
                {emailLoading ? "Sending..." : "Send Verification"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEmailForm(false);
                  setNewEmail("");
                  setEmailMessage("");
                }}
                className="px-2 py-1 text-xs bg-slate-600 hover:bg-slate-700 rounded transition"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="flex items-center gap-2 text-sm">
          <Building2 className="w-4 h-4 text-slate-400" />
          <span className="text-slate-300">CodingGita</span>
        </div>

        {!showPasswordForm && (
          <button
            onClick={() => setShowPasswordForm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 mt-2 bg-slate-700 hover:bg-slate-600 rounded transition text-sm"
          >
            <Lock className="w-4 h-4" />
            Change Password
          </button>
        )}

        {showPasswordForm && (
          <form onSubmit={handlePasswordChange} className="space-y-2 p-2 bg-slate-700/50 rounded">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white"
              required
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-sm text-white"
              required
            />
            {passwordMessage && (
              <p className={`text-xs ${passwordMessage.includes("sent") ? "text-green-400" : "text-red-400"}`}>
                {passwordMessage}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={passwordLoading}
                className="flex-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded transition disabled:opacity-50"
              >
                {passwordLoading ? "Sending..." : "Send Verification"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordForm(false);
                  setNewPassword("");
                  setConfirmPassword("");
                  setPasswordMessage("");
                }}
                className="px-2 py-1 text-xs bg-slate-600 hover:bg-slate-700 rounded transition"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

