import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import { Eye, EyeOff, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Check for session expired message in URL
    const message = searchParams.get('message');
    if (message === 'session_expired') {
      setError('Your session has expired due to a new login from another device or browser.');
    }

    // Check if "Remember Me" was previously set and restore email only
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    const rememberMeFlag = localStorage.getItem('rememberMe') === 'true';
    
    if (rememberMeFlag && rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }

    // Auto-redirect if user is already authenticated and has valid token
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
      try {
        // Check if token is expired
        const payload = JSON.parse(atob(token.split('.')[1]));
        const currentTime = Date.now() / 1000;
        
        if (payload.exp && payload.exp > currentTime) {
          // Token is valid, redirect based on role
          const userData = JSON.parse(user);
          if (userData.role === 'Admin') {
            navigate('/admin');
          } else if (userData.role === 'Student') {
            navigate('/student');
          } else if (userData.role === 'Mentor') {
            navigate('/mentor');
          }
        } else {
          // Token expired, clear it
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('userId');
        }
      } catch (error) {
        // Invalid token, clear it
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('userId');
      }
    }
  }, [searchParams, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Store user data and token in localStorage
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('token', data.token);
        localStorage.setItem('userId', data.user._id);
        
        // Handle "Remember Me" functionality - only store email
        if (rememberMe) {
          localStorage.setItem('rememberMe', 'true');
          localStorage.setItem('rememberedEmail', email);
        } else {
          // Clear remember me data if unchecked
          localStorage.removeItem('rememberMe');
          localStorage.removeItem('rememberedEmail');
        }
        
        // Redirect based on role
        if (data.user.role === 'Admin') {
          navigate('/admin');
        } else if (data.user.role === 'Student') {
          navigate('/student');
        } else if (data.user.role === 'Mentor') {
          navigate('/mentor');
        } else {
          setError('Invalid user role');
        }
      } else if (response.status === 403 && data.message === 'Invalid or expired session') {
        setError('You have been logged out from another session. Please login again.');
      } else {
        setError(data.message || 'Invalid email or password');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4" style={{ backgroundColor: '#0F172A' }}>
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      {/* Login Card */}
      <div className="relative z-10 bg-slate-800/90 backdrop-blur-xl p-8 md:p-10 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700/50 transform transition-all duration-300 hover:shadow-blue-500/20">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl mb-4 shadow-lg transform transition-transform duration-300 hover:scale-110 border border-white/20">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-blue-300 bg-clip-text text-transparent mb-2">
            Welcome Back
          </h2>
          <p className="text-gray-400 text-sm">Login to access your dashboard and Exam.</p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-5">
          {/* Email Input */}
          <div className="group">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-white transition-colors" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-email-input w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-slate-500"
                style={{ backgroundColor: 'rgba(51, 65, 85, 0.5)' }}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
          </div>
          
          {/* Password Input */}
          <div className="group">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-white transition-colors" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-slate-500"
                style={{ backgroundColor: 'rgba(51, 65, 85, 0.5)' }}
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          
          {/* Remember Me Checkbox */}
          <div className="flex items-center justify-between">
            <label className="flex items-center cursor-pointer group">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700/50 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 cursor-pointer transition-colors"
              />
              <span className="ml-2 text-sm text-gray-300 group-hover:text-white transition-colors">
                Remember me
              </span>
            </label>
          </div>
          
          {/* Error Message */}
          {error && (
            <div className="relative overflow-hidden bg-red-500/10 border border-red-500/50 rounded-lg p-4 animate-slide-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            </div>
          )}
          
          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 bg-white/90 hover:bg-white disabled:bg-gray-500/50 text-gray-900 hover:text-gray-900 disabled:text-gray-400 font-semibold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:transform-none shadow-lg hover:shadow-white/30 disabled:shadow-none flex items-center justify-center gap-2 border border-white/20"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Logging in...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        {/* Forgot Password Link */}
        <div className="mt-6 text-center">
          <Link
            to="/forgot-password"
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors duration-200 hover:underline inline-flex items-center gap-1"
          >
            Forgot your password?
          </Link>
        </div>
      </div>

      {/* Custom CSS for animations and autocomplete styling */}
      <style>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
        /* Override browser autocomplete background color to match dark theme */
        .login-email-input,
        .login-email-input:-webkit-autofill,
        .login-email-input:-webkit-autofill:hover,
        .login-email-input:-webkit-autofill:focus,
        .login-email-input:-webkit-autofill:active,
        input[type="email"],
        input[type="email"]:-webkit-autofill,
        input[type="email"]:-webkit-autofill:hover,
        input[type="email"]:-webkit-autofill:focus,
        input[type="email"]:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px rgba(51, 65, 85, 0.5) inset !important;
          -webkit-text-fill-color: #ffffff !important;
          box-shadow: 0 0 0 1000px rgba(51, 65, 85, 0.5) inset !important;
          background-color: rgba(51, 65, 85, 0.5) !important;
          background-image: none !important;
          caret-color: #ffffff !important;
          color: #ffffff !important;
          transition: background-color 5000s ease-in-out 0s, color 5000s ease-in-out 0s, background-image 5000s ease-in-out 0s !important;
        }
        
        input[type="password"],
        input[type="password"]:-webkit-autofill,
        input[type="password"]:-webkit-autofill:hover,
        input[type="password"]:-webkit-autofill:focus,
        input[type="password"]:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px rgba(51, 65, 85, 0.5) inset !important;
          -webkit-text-fill-color: #ffffff !important;
          box-shadow: 0 0 0 1000px rgba(51, 65, 85, 0.5) inset !important;
          background-color: rgba(51, 65, 85, 0.5) !important;
          background-image: none !important;
          caret-color: #ffffff !important;
          color: #ffffff !important;
          transition: background-color 5000s ease-in-out 0s, color 5000s ease-in-out 0s, background-image 5000s ease-in-out 0s !important;
        }
        
        /* Ensure input maintains dark background on selection */
        .login-email-input::selection,
        input[type="email"]::selection {
          background-color: rgba(59, 130, 246, 0.5) !important;
          color: #ffffff !important;
        }
        
        input[type="password"]::selection {
          background-color: rgba(59, 130, 246, 0.5) !important;
          color: #ffffff !important;
        }

        /* Mobile-specific optimizations - only applies to screens 768px and below */
        @media (max-width: 768px) {
          /* Reduce container padding on mobile */
          .min-h-screen {
            padding: 0.75rem !important;
          }

          /* Optimize background blobs for mobile performance - target by class combination */
          .min-h-screen .absolute.inset-0 div[class*="w-80"] {
            width: 12rem !important;
            height: 12rem !important;
            opacity: 0.1 !important;
          }

          /* Reduce card padding on mobile */
          .min-h-screen > div.relative.z-10 {
            padding: 1.25rem !important;
            border-radius: 0.75rem !important;
          }

          /* Optimize header spacing on mobile */
          .min-h-screen > div.relative.z-10 > div.text-center {
            margin-bottom: 1.5rem !important;
          }

          .min-h-screen > div.relative.z-10 > div.text-center > div.inline-flex[class*="w-16"] {
            width: 3rem !important;
            height: 3rem !important;
            margin-bottom: 0.75rem !important;
            border-radius: 0.75rem !important;
          }

          .min-h-screen > div.relative.z-10 > div.text-center > div.inline-flex svg[class*="w-8"] {
            width: 1.5rem !important;
            height: 1.5rem !important;
          }

          .min-h-screen > div.relative.z-10 > div.text-center h2[class*="text-3xl"] {
            font-size: 1.5rem !important;
            line-height: 2rem !important;
            margin-bottom: 0.5rem !important;
          }

          .min-h-screen > div.relative.z-10 > div.text-center p[class*="text-sm"] {
            font-size: 0.75rem !important;
            padding-left: 0.5rem !important;
            padding-right: 0.5rem !important;
          }

          /* Optimize form spacing on mobile */
          .min-h-screen > div.relative.z-10 form[class*="space-y"] {
            gap: 1rem !important;
          }

          /* Optimize input fields on mobile */
          .min-h-screen > div.relative.z-10 form .group label[class*="text-sm"] {
            font-size: 0.75rem !important;
            margin-bottom: 0.375rem !important;
          }

          .min-h-screen > div.relative.z-10 form .group .relative .absolute svg[class*="h-5"] {
            width: 1rem !important;
            height: 1rem !important;
          }

          .min-h-screen > div.relative.z-10 form .group .relative input[class*="pl-10"] {
            padding-left: 2.25rem !important;
            padding-top: 0.625rem !important;
            padding-bottom: 0.625rem !important;
            font-size: 0.875rem !important;
          }

          .min-h-screen > div.relative.z-10 form .group .relative input[class*="pr-12"] {
            padding-right: 2.75rem !important;
          }

          /* Optimize password toggle button for touch */
          .min-h-screen > div.relative.z-10 form .group .relative button[type="button"] {
            min-width: 44px !important;
            min-height: 44px !important;
            touch-action: manipulation !important;
            -webkit-tap-highlight-color: transparent !important;
          }

          /* Optimize checkbox and remember me */
          .min-h-screen > div.relative.z-10 form .flex label {
            min-height: 44px !important;
            touch-action: manipulation !important;
            -webkit-tap-highlight-color: transparent !important;
          }

          .min-h-screen > div.relative.z-10 form .flex label span[class*="text-sm"] {
            font-size: 0.75rem !important;
          }

          /* Optimize error message on mobile */
          .min-h-screen > div.relative.z-10 form .relative.overflow-hidden[class*="p-4"] {
            padding: 0.75rem !important;
          }

          .min-h-screen > div.relative.z-10 form .relative.overflow-hidden .flex svg[class*="h-5"] {
            width: 1rem !important;
            height: 1rem !important;
            margin-top: 0.125rem !important;
          }

          .min-h-screen > div.relative.z-10 form .relative.overflow-hidden .flex p[class*="text-sm"] {
            font-size: 0.75rem !important;
            line-height: 1.5rem !important;
          }

          /* Optimize login button for mobile touch */
          .min-h-screen > div.relative.z-10 form button[type="submit"] {
            margin-top: 1rem !important;
            min-height: 44px !important;
            padding-top: 0.75rem !important;
            padding-bottom: 0.75rem !important;
            font-size: 0.875rem !important;
            touch-action: manipulation !important;
            -webkit-tap-highlight-color: transparent !important;
          }

          /* Optimize forgot password link */
          .min-h-screen > div.relative.z-10 > div.mt-6 {
            margin-top: 1rem !important;
          }

          .min-h-screen > div.relative.z-10 > div.mt-6 a[class*="text-sm"] {
            font-size: 0.75rem !important;
            min-height: 44px !important;
            display: inline-flex !important;
            align-items: center !important;
            touch-action: manipulation !important;
            -webkit-tap-highlight-color: transparent !important;
          }

          /* Disable animations on mobile if user prefers reduced motion */
          @media (prefers-reduced-motion: reduce) {
            .animate-blob {
              animation: none !important;
            }
          }
        }
      `}</style>
    </div>
  );
}
