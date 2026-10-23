import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import apiRequest from "../services/api";

export default function StaffPasswordChange({ isCollapsed = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const close = () => {
    if (isSaving) return;
    setIsOpen(false);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiRequest("/users/change-password", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setSuccess(response.message || "Password changed successfully.");
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
    } catch (requestError) {
      console.error("Error changing password:", requestError);
      setError(requestError.message || "Could not change your password.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setSuccess("");
          setIsOpen(true);
        }}
        title="Reset Password"
        aria-label="Reset Password"
        className={`flex flex-shrink-0 items-center justify-center rounded-xl transition-all bg-gradient-to-br from-[#133B42] to-[#1E293B] hover:from-[#174950] hover:to-[#26384D] text-[#00C4B4] border border-[#00C4B4]/40 cursor-pointer ${
          isCollapsed ? "w-7 h-7" : "w-8 h-8"
        }`}
      >
        <KeyRound className="w-4 h-4" />
        <span className="sr-only">Reset Password</span>
      </button>

      {isOpen
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <button
                type="button"
                aria-label="Close password dialog"
                className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                onClick={close}
              />
              <form
                onSubmit={submit}
                className="relative z-10 w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#181A22] p-6 shadow-2xl"
              >
                <div>
                  <h2 className="text-base font-bold text-white">Change Your Password</h2>
                  <p className="mt-1 text-xs text-[#8E95A5]">
                    Enter a new password. Your current password is not required.
                  </p>
                </div>
                <label className="block text-xs font-semibold text-[#7E8594]">
                  New password
                  <div className="relative mt-1.5">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      required
                      className="w-full rounded-xl border border-white/[0.08] bg-[#16181F] px-3.5 py-2.5 pr-11 text-xs text-white focus:border-[#00C4B4]/50 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((shown) => !shown)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7E8594] hover:text-white"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>
                <label className="block text-xs font-semibold text-[#7E8594]">
                  Confirm new password
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                    className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#16181F] px-3.5 py-2.5 text-xs text-white focus:border-[#00C4B4]/50 focus:outline-none"
                  />
                </label>
                {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
                {success && <p role="status" className="text-xs text-emerald-300">{success}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={close}
                    className="flex-1 rounded-xl bg-white/[0.05] px-4 py-2.5 text-xs font-semibold text-[#8E95A5] hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 rounded-xl bg-[#00C4B4] px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-[#2DD4BF] disabled:opacity-50"
                  >
                    {isSaving ? "Saving..." : "Change Password"}
                  </button>
                </div>
              </form>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
