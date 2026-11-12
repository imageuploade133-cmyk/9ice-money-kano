"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { InvestmentPinModal } from "@/components/investment/InvestmentPinModal";

export function ChangePasswordSection() {
  const { user, userData } = useAuth();

  // Collapsible & PIN Unlock States
  const [isExpanded, setIsExpanded] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Form States
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const handleHeaderClick = () => {
    if (isExpanded) {
      setIsExpanded(false);
    } else {
      if (isUnlocked) {
        setIsExpanded(true);
      } else {
        setIsPinModalOpen(true);
      }
    }
  };

  const handleVerifyAccessPin = async (submittedPin?: string, isBiometricAuthenticated?: boolean) => {
    setIsVerifyingPin(true);
    try {
      const isMock = sessionStorage.getItem("mock") === "true";

      if (isMock) {
        const currentStoredPin = userData?.pin || "1234";
        if (!isBiometricAuthenticated && submittedPin !== currentStoredPin) {
          toast.error("Incorrect Access PIN. Access denied.");
          setIsVerifyingPin(false);
          return;
        }
      } else {
        if (!user) {
          toast.error("Authentication required.");
          setIsVerifyingPin(false);
          return;
        }

        const idToken = await user.getIdToken();
        const verifyRes = await fetch("/api/auth/pin", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            action: "verify",
            pin: submittedPin,
            isBiometricAuthenticated,
          }),
        });

        const verifyData = await verifyRes.json();
        if (!verifyRes.ok || !verifyData.success) {
          toast.error(verifyData.message || verifyData.error || "Incorrect Access PIN. Access denied.");
          setIsVerifyingPin(false);
          return;
        }
      }

      setIsUnlocked(true);
      setIsExpanded(true);
      setIsPinModalOpen(false);
      toast.success("Security PIN verified! Change Account Password section unlocked.");
    } catch (err) {
      console.error("PIN Verification Error:", err);
      toast.error("Failed to verify Access PIN.");
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword) {
      toast.error("Please enter your current password.");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      toast.error("New password must be at least 6 characters long.");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const isMock = sessionStorage.getItem("mock") === "true";
      if (isMock) {
        toast.success("Password updated successfully (Mock Validation passed)!");
      } else {
        const currentUser = auth.currentUser;
        if (currentUser && currentUser.email) {
          const credential = EmailAuthProvider.credential(currentUser.email, oldPassword);
          await reauthenticateWithCredential(currentUser, credential);
          await updatePassword(currentUser, newPassword);
          toast.success("Password updated successfully!");
        } else {
          toast.error("No active session found.");
        }
      }
      setOldPassword("");
      setNewPassword("");
      setIsExpanded(false);
    } catch (err: unknown) {
      console.error(err);
      toast.error("Incorrect old password or authentication error.");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <>
      <section className="premium-gradient-card premium-gradient-border overflow-hidden transition-all">
        {/* Expandable Bar Header */}
        <button
          type="button"
          onClick={handleHeaderClick}
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left cursor-pointer hover:bg-gray-50/50 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
              isUnlocked ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-orange-50 text-[#FC7A00] border border-orange-100"
            }`}>
              <span className="material-symbols-outlined text-[20px] font-bold">
                {isUnlocked ? "lock_open" : "password"}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-hanken font-bold text-xs sm:text-sm text-black uppercase tracking-wider truncate">
                  Change Account Password
                </h3>
                {isUnlocked ? (
                  <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                    Unlocked
                  </span>
                ) : (
                  <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[10px]">lock</span>
                    Protected
                  </span>
                )}
              </div>
              <p className="font-hanken text-[10.5px] text-gray-400 font-medium truncate mt-0.5">
                {isUnlocked ? "Update your account sign-in password" : "PIN verification required to expand"}
              </p>
            </div>
          </div>

          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 shrink-0 ml-2">
            <span className={`material-symbols-outlined text-base transition-transform duration-300 ${
              isExpanded ? "rotate-180" : ""
            }`}>
              expand_more
            </span>
          </div>
        </button>

        {/* Collapsible Form Body */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="border-t border-gray-100/80 p-5 space-y-4 bg-white"
            >
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center gap-2 text-emerald-800 text-[11px] font-bold">
                <span className="material-symbols-outlined text-sm text-emerald-600">verified_user</span>
                <span>Unlocked via PIN Authentication. Enter passwords below to update.</span>
              </div>

              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-black">Current Password</label>
                    <input
                      type="password"
                      required
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      className="w-full bg-white border border-black rounded-2xl px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-black">New Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-white border border-black rounded-2xl pl-4 pr-10 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black cursor-pointer transition-colors p-1"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {showPassword ? "visibility" : "visibility_off"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="w-full bg-black text-white py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isUpdatingPassword ? "Updating..." : "Update Password"}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Security PIN Authorization Modal */}
      <InvestmentPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        title="Unlock Change Password Section"
        description="Enter your 4-digit PIN to access the Change Account Password section."
        isSubmitting={isVerifyingPin}
        onPinSubmit={handleVerifyAccessPin}
      />
    </>
  );
}
