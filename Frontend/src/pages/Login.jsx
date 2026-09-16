import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../config/api";
import { Eye, EyeOff, IdCard, Lock, Loader2, AlertCircle, Code2, ShieldCheck, Check } from "lucide-react";

export default function Login() {
  // Students sign in with their UID or roll number; mentors and admins use their email.
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Check for session expired message in URL
    const message = searchParams.get("message");
    if (message === "session_expired") {
      setError("Your session has expired due to a new login from another device or browser.");
    }

    // Check if "Remember Me" was previously set and restore the credentials
    const rememberedIdentifier =
      localStorage.getItem("rememberedIdentifier") || localStorage.getItem("rememberedEmail");
    const rememberedPassword = localStorage.getItem("rememberedPassword");
    const rememberMeFlag = localStorage.getItem("rememberMe") === "true";

    if (rememberMeFlag && rememberedIdentifier) {
      setIdentifier(rememberedIdentifier);
      if (rememberedPassword) {
        setPassword(rememberedPassword);
      }
      setRememberMe(true);
    }

    // Auto-redirect if user is already authenticated and has valid token
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("user");

    if (token && user) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        const currentTime = Date.now() / 1000;

        if (payload.exp && payload.exp > currentTime) {
          const userData = JSON.parse(user);
          if (userData.role === "Admin") {
            navigate("/admin");
          } else if (userData.role === "Student") {
            navigate("/student");
          } else if (userData.role === "Mentor") {
            navigate("/mentor");
          }
        } else {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          localStorage.removeItem("userId");
        }
      } catch (error) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("userId");
      }
    }
  }, [searchParams, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ identifier, password })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem("user", JSON.stringify(data.user));
        localStorage.setItem("token", data.token);
        localStorage.setItem("userId", data.user._id);

        if (rememberMe) {
          localStorage.setItem("rememberMe", "true");
          localStorage.setItem("rememberedIdentifier", identifier);
          localStorage.setItem("rememberedPassword", password);
        } else {
          localStorage.removeItem("rememberMe");
          localStorage.removeItem("rememberedIdentifier");
          localStorage.removeItem("rememberedEmail");
          localStorage.removeItem("rememberedPassword");
        }

        if (data.user.role === "Admin") {
          navigate("/admin");
        } else if (data.user.role === "Student") {
          navigate("/student");
        } else if (data.user.role === "Mentor") {
          navigate("/mentor");
        } else {
          setError("Invalid user role");
        }
      } else if (response.status === 403) {
        setError(data.message || "Access denied.");
      } else {
        setError(data.message || "Invalid credentials. Please check your UID and password.");
      }
    } catch (err) {
      setError("Login service unavailable. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#16181F] text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle Ambient Background Lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#00C4B4]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 left-1/3 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-md bg-[#181A22] border border-white/[0.08] rounded-3xl p-8 sm:p-10 shadow-2xl shadow-black/40 space-y-7">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#00C4B4]/10 border border-[#00C4B4]/25 text-[#00C4B4] shadow-[0_0_20px_rgba(0,196,180,0.15)] transition-transform duration-300 hover:scale-105">
            <Code2 className="w-7 h-7" />
          </div>

          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              CodingGita
            </h1>
            <p className="text-xs font-semibold text-[#00C4B4] uppercase tracking-widest mt-0.5">
              Examination Portal
            </p>
          </div>

          <p className="text-xs text-[#7E8594] max-w-xs mx-auto pt-1">
            Sign in with your University UID or Roll Number to access your examinations and dashboard.
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start gap-2.5 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300 leading-relaxed font-medium">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          {/* Identifier Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 tracking-wide">
              University UID / Roll Number
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#7E8594] group-focus-within:text-[#00C4B4] transition-colors">
                <IdCard className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. 23CG0101 or roll number"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                required
                className="login-email-input w-full pl-10 pr-4 py-3 bg-[#20242D] border border-white/[0.08] rounded-xl text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/60 focus:ring-1 focus:ring-[#00C4B4]/20 transition-all"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 tracking-wide">
              Password
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#7E8594] group-focus-within:text-[#00C4B4] transition-colors">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="login-password-input w-full pl-10 pr-11 py-3 bg-[#20242D] border border-white/[0.08] rounded-xl text-xs text-white placeholder-[#7E8594] focus:outline-none focus:border-[#00C4B4]/60 focus:ring-1 focus:ring-[#00C4B4]/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#7E8594] hover:text-white transition-colors"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded-md border-white/[0.1] bg-[#20242D] text-[#00C4B4] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#00C4B4]"
              />
              <span className="text-xs text-[#7E8594] hover:text-slate-300 transition-colors">
                Remember credentials
              </span>
            </label>
          </div>

          {/* STRICT BUTTON COLOR: White Primary Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl font-semibold text-xs bg-white hover:bg-slate-100 text-slate-900 transition-all duration-200 active:scale-[0.98] shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <span>Sign In to Examination Portal</span>
              )}
            </button>
          </div>
        </form>

        {/* Security / Institutional Footer */}
        <div className="pt-3 border-t border-white/[0.05] flex items-center justify-center gap-2 text-center text-[11px] text-[#7E8594]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#00C4B4]" />
          <span>Protected by CodingGita Proctoring</span>
        </div>
      </div>

      {/* Autocomplete Dark Mode Fix */}
      <style>{`
        .login-email-input:-webkit-autofill,
        .login-email-input:-webkit-autofill:hover,
        .login-email-input:-webkit-autofill:focus,
        .login-email-input:-webkit-autofill:active,
        .login-password-input:-webkit-autofill,
        .login-password-input:-webkit-autofill:hover,
        .login-password-input:-webkit-autofill:focus,
        .login-password-input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #20242D inset !important;
          -webkit-text-fill-color: #ffffff !important;
          box-shadow: 0 0 0 1000px #20242D inset !important;
          background-color: #20242D !important;
          caret-color: #ffffff !important;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </div>
  );
}
