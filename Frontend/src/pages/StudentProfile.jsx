import React, { useState, useEffect, useRef } from "react";
import { Camera, Mail, Lock, User as UserIcon, Building2 } from "lucide-react";
import { API_BASE_URL } from '../config/api';

export default function StudentProfile() {
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
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Camera access is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Edge.');
        return;
      }

      // Camera access requires HTTPS (except localhost)
      const isSecureContext = window.isSecureContext || 
        window.location.protocol === 'https:' || 
        window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1';
      
      if (!isSecureContext) {
        alert('Camera access requires a secure connection (HTTPS). Please access this site over HTTPS.');
        return;
      }

      // Request camera permission - browser will AUTOMATICALLY show a permission dialog
      // The user will see a browser prompt asking to allow/deny camera access
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' },
        audio: false 
      });
      
      setStream(mediaStream);
      setShowCamera(true);
      
      // Use setTimeout to ensure modal is rendered before setting stream
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          // Ensure video plays
          videoRef.current.play().catch(error => {
            console.error('Error playing video:', error);
          });
        } else {
          // Retry if video element isn't ready yet
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.srcObject = mediaStream;
              videoRef.current.play().catch(error => {
                console.error('Error playing video on retry:', error);
              });
            }
          }, 200);
        }
      }, 200);
    } catch (error) {
      console.error('Error accessing camera:', error);
      
      // Provide specific error messages based on error type
      let errorMessage = 'Unable to access camera. ';
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = 'Camera permission is required. Please:\n\n1. Click the lock/camera icon in your browser\'s address bar\n2. Allow camera access for this site\n3. Refresh the page and try again\n\nOr check your browser settings and enable camera permissions for this website.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = 'No camera found. Please connect a camera and try again.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage = 'Camera is already in use by another application. Please close other applications using the camera and try again.';
      } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
        errorMessage = 'Camera settings are not supported. Trying with default settings...';
        // Retry with simpler constraints
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
          setStream(fallbackStream);
          setShowCamera(true);
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
          }
          return;
        } catch (fallbackError) {
          errorMessage = 'Unable to access camera with any settings. Please check your camera permissions.';
        }
      } else {
        errorMessage += 'Please check your browser settings and ensure camera permissions are granted.';
      }
      
      alert(errorMessage);
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
      // Don't close camera modal yet - show captured image in modal for review
      // Keep the stream running so user can retake if needed
    }
  };

  const confirmCapture = () => {
    // User confirmed they want to use this image
    stopCamera();
  };

  const retakeFromModal = () => {
    // Clear captured image and show live video again for retake
    setCapturedImage(null);
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

  // Connect stream to video element when modal opens and stream is available
  useEffect(() => {
    if (showCamera && stream && videoRef.current && !capturedImage) {
      const video = videoRef.current;
      
      // Set stream source if not already set
      if (!video.srcObject || video.srcObject !== stream) {
        video.srcObject = stream;
      }
      
      // Function to ensure video plays
      const ensurePlay = async () => {
        try {
          if (video && video.readyState >= 2) {
            await video.play();
          }
        } catch (error) {
          console.error('Error playing video:', error);
        }
      };
      
      // Event handlers
      const handleLoadedMetadata = () => {
        ensurePlay();
      };
      
      const handleCanPlay = () => {
        ensurePlay();
      };
      
      // Add event listeners
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('canplay', handleCanPlay);
      
      // Try playing immediately if video is ready
      if (video.readyState >= 2) {
        ensurePlay();
      } else {
        // If not ready, wait a bit and try again
        setTimeout(ensurePlay, 200);
      }
      
      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('canplay', handleCanPlay);
      };
    }
  }, [showCamera, stream, capturedImage]);

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
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="w-full">
          <h2 className="text-2xl font-bold mb-6">Profile</h2>
          <div className="text-center text-slate-400">
            Loading profile...
          </div>
        </div>
      </div>
    );
  }

  // If no user data at all, show message
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        <div className="w-full">
          <h2 className="text-2xl font-bold mb-6">Profile</h2>
          <div className="text-center text-slate-400">
            Unable to load profile. Please refresh the page.
          </div>
        </div>
      </div>
    );
  }

  const canCaptureImage = !user.profileImageSaved;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="w-full">
        <h2 className="text-2xl font-bold mb-6">Profile</h2>
        
        <div className="bg-slate-800 rounded-lg p-6 w-full">
        {/* Profile Image */}
        <div className="flex flex-col items-center space-y-4 mb-6">
          <div className="relative">
            {capturedImage || user.profileImage ? (
              <img
                src={capturedImage || user.profileImage}
                alt="Profile"
                className="w-32 h-32 rounded-full object-cover border-4 border-slate-600"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-slate-700 flex items-center justify-center border-4 border-slate-600">
                <UserIcon className="w-16 h-16 text-slate-400" />
              </div>
            )}
            {canCaptureImage && !capturedImage && !user.profileImage && (
              <button
                onClick={startCamera}
                className="absolute bottom-0 right-0 p-3 bg-blue-600 hover:bg-blue-700 rounded-full transition shadow-lg"
                title="Capture Profile Image"
              >
                <Camera className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
          {canCaptureImage && capturedImage && !user.profileImageSaved && (
            <div className="flex gap-3">
              <button
                onClick={saveProfileImage}
                disabled={uploadingImage}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition disabled:opacity-50"
              >
                {uploadingImage ? "Saving..." : "Save Image"}
              </button>
              <button
                onClick={() => {
                  setCapturedImage(null);
                  startCamera();
                }}
                disabled={uploadingImage}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded transition disabled:opacity-50"
              >
                Retake
              </button>
            </div>
          )}
        </div>

        {/* Camera Modal */}
        {showCamera && (
          <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center">
            <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-bold mb-4 text-center">
                {capturedImage ? 'Review Your Photo' : 'Capture Profile Image'}
              </h3>
              <div className="relative bg-black rounded overflow-hidden" style={{ minHeight: '400px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {capturedImage ? (
                  // Show captured image for review
                  <img
                    src={capturedImage}
                    alt="Captured"
                    className="w-full h-auto object-contain"
                    style={{ maxHeight: '400px', maxWidth: '100%', display: 'block' }}
                  />
                ) : (
                  // Show live video feed
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full"
                    style={{ 
                      height: '400px',
                      maxWidth: '100%',
                      display: 'block',
                      objectFit: 'contain',
                      backgroundColor: '#000'
                    }}
                    onError={(e) => {
                      console.error('Video error:', e);
                    }}
                    onLoadedMetadata={() => {
                      console.log('Video metadata loaded, dimensions:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
                      if (videoRef.current) {
                        videoRef.current.play().catch(err => console.error('Play error:', err));
                      }
                    }}
                  />
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>
              <div className="flex gap-2 mt-4">
                {capturedImage ? (
                  // After capture - show review options
                  <>
                    <button
                      onClick={confirmCapture}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition"
                    >
                      Use This Photo
                    </button>
                    <button
                      onClick={retakeFromModal}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition"
                    >
                      Retake
                    </button>
                    <button
                      onClick={stopCamera}
                      className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded transition"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  // Before capture - show capture options
                  <>
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
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* User Info */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-slate-700/50 rounded-lg">
            <UserIcon className="w-5 h-5 text-slate-400" />
            <div className="flex-1">
              <p className="text-sm text-slate-400">Name</p>
              <p className="text-lg font-semibold text-white">{user.name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-4 bg-slate-700/50 rounded-lg">
            <Mail className="w-5 h-5 text-slate-400" />
            <div className="flex-1">
              <p className="text-sm text-slate-400">Email</p>
              <p className="text-lg font-semibold text-white">{user.email}</p>
            </div>
            {!showEmailForm && (
              <button
                onClick={() => setShowEmailForm(true)}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 rounded transition"
              >
                Update
              </button>
            )}
          </div>

          {showEmailForm && (
            <div className="p-4 bg-slate-700/50 rounded-lg space-y-3">
              <form onSubmit={handleEmailUpdate} className="space-y-3">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="New email address"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded text-white"
                  required
                />
                {emailMessage && (
                  <p className={`text-sm ${emailMessage.includes("sent") ? "text-green-400" : "text-red-400"}`}>
                    {emailMessage}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition disabled:opacity-50"
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
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="flex items-center gap-3 p-4 bg-slate-700/50 rounded-lg">
            <Building2 className="w-5 h-5 text-slate-400" />
            <div className="flex-1">
              <p className="text-sm text-slate-400">Institute</p>
              <p className="text-lg font-semibold text-white">CodingGita</p>
            </div>
          </div>

          {!showPasswordForm && (
            <button
              onClick={() => setShowPasswordForm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded transition"
            >
              <Lock className="w-5 h-5" />
              Change Password
            </button>
          )}

          {showPasswordForm && (
            <div className="p-4 bg-slate-700/50 rounded-lg space-y-3">
              <form onSubmit={handlePasswordChange} className="space-y-3">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded text-white"
                  required
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded text-white"
                  required
                />
                {passwordMessage && (
                  <p className={`text-sm ${passwordMessage.includes("sent") ? "text-green-400" : "text-red-400"}`}>
                    {passwordMessage}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={passwordLoading}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition disabled:opacity-50"
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
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

