import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import apiRequest from "../services/api";

export default function AdminStaffPasswordReset({ user }) {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const close = () => {
    if (isSaving) return;
    setIsOpen(false);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setMessage("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setIsError(false);

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters long.");
      setIsError(true);
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setIsError(true);
      return;
    }

    setIsSaving(true);
    try {
      const result = await apiRequest(`/users/staff/${user._id}/password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setMessage(result.message || `Password reset for ${user.name}.`);
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Error resetting staff password:", error);
      setMessage(error.message || "Could not reset the password.");
      setIsError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessage("");
          setIsError(false);
          setIsOpen(true);
        }}
        className="w-full mt-2 py-2 px-2 rounded-xl text-xs font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        title={`Reset password for ${user.name}`}
      >
        <KeyRound className="w-3.5 h-3.5" />
        <span>Reset Password</span>
      </button>

      {isOpen
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <button
                type="button"
                aria-label="Close password reset dialog"
                className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                onClick={close}
              />
              <form
                onSubmit={submit}
                className="relative z-10 w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#181A22] p-6 shadow-2xl"
              >
                <div>
                  <h2 className="text-base font-bold text-white">Reset Password</h2>
                  <p className="mt-1 text-xs text-[#8E95A5]">
                    Set a new password for {user.name}. Their current password is not required.
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
                {message && (
                  <p role={isError ? "alert" : "status"} className={`text-xs ${isError ? "text-rose-400" : "text-emerald-300"}`}>
                    {message}
                  </p>
                )}
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
                    {isSaving ? "Saving..." : "Reset Password"}
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
