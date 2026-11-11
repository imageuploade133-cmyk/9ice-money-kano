"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { triggerHaptic } from "@/lib/haptics";
import { getBiometricLabel } from "@/lib/biometrics-util";

interface SecuritySettingsSectionProps {
  isPinRequired: boolean;
  isFaceIdEnabled: boolean;
  is2faOtpEnabled: boolean;
  isBiometricLoginEnabled: boolean;
  isBiometricTransferEnabled: boolean;
  onTogglePinRequired: () => Promise<void>;
  onToggleFaceId: () => Promise<void>;
  onToggle2faOtp: (pin: string) => Promise<boolean>;
  onToggleBiometricLogin: (pin: string) => Promise<boolean>;
  onToggleBiometricTransfer: (pin: string) => Promise<boolean>;
}

export function SecuritySettingsSection({
  isPinRequired,
  isFaceIdEnabled,
  is2faOtpEnabled,
  isBiometricLoginEnabled,
  isBiometricTransferEnabled,
  onTogglePinRequired,
  onToggleFaceId,
  onToggle2faOtp,
  onToggleBiometricLogin,
  onToggleBiometricTransfer,
}: SecuritySettingsSectionProps) {
  const biometricLabel = getBiometricLabel();
  const { user } = useAuth();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // 4-Digit PIN Verification Pad Modal state
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinAction, setPinAction] = useState<"2fa_toggle" | "pin_toggle" | "bio_login_toggle" | "bio_transfer_toggle">("2fa_toggle");
  const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", ""]);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  useModalBackHandler(isPinModalOpen, () => setIsPinModalOpen(false), "2fa-otp-pin-modal");

  const handleInitiate2faToggle = () => {
    triggerHaptic();
    setPinAction("2fa_toggle");
    setPinDigits(["", "", "", ""]);
    setIsPinModalOpen(true);
  };

  const handleInitiateBioLoginToggle = () => {
    triggerHaptic();
    setPinAction("bio_login_toggle");
    setPinDigits(["", "", "", ""]);
    setIsPinModalOpen(true);
  };

  const handleInitiateBioTransferToggle = () => {
    triggerHaptic();
    setPinAction("bio_transfer_toggle");
    setPinDigits(["", "", "", ""]);
    setIsPinModalOpen(true);
  };

  const handleInitiatePinToggle = () => {
    triggerHaptic();
    setPinAction("pin_toggle");
    setPinDigits(["", "", "", ""]);
    setIsPinModalOpen(true);
  };

  const handlePinDigitPress = (digit: string) => {
    triggerHaptic();
    const emptyIdx = pinDigits.findIndex((d) => d === "");
    if (emptyIdx !== -1) {
      const updated = [...pinDigits];
      updated[emptyIdx] = digit;
      setPinDigits(updated);

      if (emptyIdx === 3) {
        const fullPin = updated.join("");
        executeVerifiedAction(fullPin);
      }
    }
  };

  const handlePinBackspace = () => {
    triggerHaptic();
    const lastFilledIdx = pinDigits.map((d) => d !== "").lastIndexOf(true);
    if (lastFilledIdx !== -1) {
      const updated = [...pinDigits];
      updated[lastFilledIdx] = "";
      setPinDigits(updated);
    }
  };

  const handlePinClear = () => {
    triggerHaptic();
    setPinDigits(["", "", "", ""]);
  };

  const executeVerifiedAction = async (enteredPin: string) => {
    setIsVerifyingPin(true);
    try {
      if (pinAction === "2fa_toggle") {
        const success = await onToggle2faOtp(enteredPin);
        setIsPinModalOpen(false);
        if (!success) {
          setPinDigits(["", "", "", ""]);
        }
      } else if (pinAction === "bio_login_toggle") {
        const success = await onToggleBiometricLogin(enteredPin);
        setIsPinModalOpen(false);
        if (!success) {
          setPinDigits(["", "", "", ""]);
        }
      } else if (pinAction === "bio_transfer_toggle") {
        const success = await onToggleBiometricTransfer(enteredPin);
        setIsPinModalOpen(false);
        if (!success) {
          setPinDigits(["", "", "", ""]);
        }
      } else {
        // Verify PIN via /api/auth/pin before toggling PIN Requirement
        const idToken = await user?.getIdToken();
        const res = await fetch("/api/auth/pin", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ action: "verify", pin: enteredPin }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          await onTogglePinRequired();
          setIsPinModalOpen(false);
        } else {
          toast.error(data.message || data.error || "Incorrect Access PIN");
          setPinDigits(["", "", "", ""]);
        }
      }
    } catch {
      toast.error("PIN verification error");
      setPinDigits(["", "", "", ""]);
    } finally {
      setIsVerifyingPin(false);
    }
  };

  return (
    <section className="premium-gradient-card premium-gradient-border p-6 space-y-4 font-hanken">
      <h3 className="font-hanken font-bold text-sm tracking-wider uppercase text-gray-500 border-b border-gray-100/60 pb-2.5">
        Security Preferences & 2FA
      </h3>

      {/* Toggle PIN */}
      <div className="flex justify-between items-center py-2">
        <div>
          <p className="font-hanken font-bold text-xs text-black">Require Access PIN</p>
          <p className="font-hanken text-[10px] text-gray-400 font-semibold">Enforce PIN check on login/payment flows</p>
        </div>
        <button
          onClick={handleInitiatePinToggle}
          className={cn(
            "w-12 h-6 rounded-full p-0.5 transition-colors duration-300 focus:outline-none relative cursor-pointer",
            isPinRequired ? "bg-[#07B038]" : "bg-gray-200"
          )}
        >
          <motion.div
            layout
            className="w-5 h-5 bg-white rounded-full shadow-md"
            animate={{ x: isPinRequired ? 24 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        </button>
      </div>

      {/* Toggle 2FA Login OTP Code Requirement */}
      <div className="flex justify-between items-center py-2 border-t border-gray-100/60">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="font-hanken font-bold text-xs text-black">2FA Login OTP Code</p>
            <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-orange-100 text-[#FC7A00]">
              2FA Security
            </span>
          </div>
          <p className="font-hanken text-[10px] text-gray-400 font-semibold mt-0.5">
            Require 6-digit OTP code after entering Access PIN on login
          </p>
        </div>
        <button
          onClick={handleInitiate2faToggle}
          className={cn(
            "w-12 h-6 rounded-full p-0.5 transition-colors duration-300 focus:outline-none relative cursor-pointer shrink-0 ml-3",
            is2faOtpEnabled ? "bg-[#07B038]" : "bg-gray-200"
          )}
        >
          <motion.div
            layout
            className="w-5 h-5 bg-white rounded-full shadow-md"
            animate={{ x: is2faOtpEnabled ? 24 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        </button>
      </div>

      {/* Biometric Login Toggle */}
      <div className="flex justify-between items-center py-2 border-t border-gray-100/60">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="font-hanken font-bold text-xs text-black">Enable {biometricLabel} for Login</p>
            <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-emerald-100 text-emerald-700">
              {biometricLabel}
            </span>
          </div>
          <p className="font-hanken text-[10px] text-gray-400 font-semibold mt-0.5">
            Use {biometricLabel} as your Access PIN on login screen
          </p>
        </div>
        <button
          onClick={handleInitiateBioLoginToggle}
          className={cn(
            "w-12 h-6 rounded-full p-0.5 transition-colors duration-300 focus:outline-none relative cursor-pointer shrink-0 ml-3",
            isBiometricLoginEnabled ? "bg-[#07B038]" : "bg-gray-200"
          )}
        >
          <motion.div
            layout
            className="w-5 h-5 bg-white rounded-full shadow-md"
            animate={{ x: isBiometricLoginEnabled ? 24 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        </button>
      </div>

      {/* Biometric Transfer Toggle */}
      <div className="flex justify-between items-center py-2 border-t border-gray-100/60">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="font-hanken font-bold text-xs text-black">Enable {biometricLabel} for Transfers</p>
            <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-blue-100 text-blue-700">
              Fast Authorize
            </span>
          </div>
          <p className="font-hanken text-[10px] text-gray-400 font-semibold mt-0.5">
            Authorize outward bank transfers with {biometricLabel} instead of entering PIN & OTP
          </p>
        </div>
        <button
          onClick={handleInitiateBioTransferToggle}
          className={cn(
            "w-12 h-6 rounded-full p-0.5 transition-colors duration-300 focus:outline-none relative cursor-pointer shrink-0 ml-3",
            isBiometricTransferEnabled ? "bg-[#07B038]" : "bg-gray-200"
          )}
        >
          <motion.div
            layout
            className="w-5 h-5 bg-white rounded-full shadow-md"
            animate={{ x: isBiometricTransferEnabled ? 24 : 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          />
        </button>
      </div>

      {/* 4-Digit Access PIN Verification Drawer Modal */}
      {mounted && typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {isPinModalOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsPinModalOpen(false)}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[99998]"
              />

              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
                className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[28px] border-t border-gray-200 p-6 pb-8 z-[100000] flex flex-col items-center shadow-2xl text-black font-hanken select-none"
              >
                {/* Drag bar indicator */}
                <div className="w-10 h-1 bg-gray-300 rounded-full mb-4" />

                {/* Header */}
                <div className="w-full flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
                  <div className="w-8" />
                  <h2 className="font-hanken font-bold text-base text-black text-center uppercase tracking-wider">
                    Confirm 2FA Action
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsPinModalOpen(false)}
                    className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                  </button>
                </div>

                <div className="w-14 h-14 rounded-full bg-orange-50 border border-orange-100 text-[#FC7A00] flex items-center justify-center mb-3 shadow-xs">
                  <span className="material-symbols-outlined text-[28px]">shield_person</span>
                </div>

                <div className="text-center space-y-1 mb-4">
                  <h4 className="font-extrabold text-sm uppercase text-gray-900">Enter Access PIN</h4>
                  <p className="text-[11px] text-gray-500 max-w-xs font-semibold leading-relaxed">
                    {pinAction === "2fa_toggle"
                      ? `Enter your 4-digit PIN to ${is2faOtpEnabled ? "disable" : "enable"} 2FA Login OTP verification.`
                      : pinAction === "bio_login_toggle"
                      ? `Enter your 4-digit PIN to ${isBiometricLoginEnabled ? "disable" : "enable"} ${biometricLabel} for login.`
                      : pinAction === "bio_transfer_toggle"
                      ? `Enter your 4-digit PIN to ${isBiometricTransferEnabled ? "disable" : "enable"} ${biometricLabel} for transfers.`
                      : `Enter your 4-digit PIN to ${isPinRequired ? "disable" : "enable"} Access PIN requirement.`}
                  </p>
                </div>

                {/* 4 Pin Boxes */}
                <div className="flex justify-center gap-3 mb-5">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "w-12 h-12 rounded-2xl border-2 flex items-center justify-center font-mono font-black text-2xl transition-all shadow-xs",
                        pinDigits[idx] ? "border-[#FC7A00] bg-orange-50/20 text-[#FC7A00]" : "border-gray-200 text-gray-400 bg-gray-50"
                      )}
                    >
                      {pinDigits[idx] ? "•" : ""}
                    </div>
                  ))}
                </div>

                {/* Numeric Keypad Grid */}
                <div className="grid grid-cols-3 gap-2 w-full max-w-xs mb-4">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                    <button
                      key={num}
                      type="button"
                      disabled={isVerifyingPin}
                      onClick={() => handlePinDigitPress(num)}
                      className="py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 font-bold text-lg text-black active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={isVerifyingPin}
                    onClick={handlePinClear}
                    className="py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 font-bold text-xs uppercase text-gray-600 active:scale-95 transition-all cursor-pointer"
                  >
                    CLEAR
                  </button>
                  <button
                    type="button"
                    disabled={isVerifyingPin}
                    onClick={() => handlePinDigitPress("0")}
                    className="py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 font-bold text-lg text-black active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    disabled={isVerifyingPin}
                    onClick={handlePinBackspace}
                    className="py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 font-bold text-lg text-black active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-[20px]">backspace</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold uppercase rounded-2xl cursor-pointer active:scale-95 transition-all"
                >
                  Cancel
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </section>
  );
}
