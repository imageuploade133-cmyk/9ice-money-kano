"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { User } from "firebase/auth";
import { triggerHaptic } from "@/lib/haptics";
import { useModalBackHandler } from "@/lib/useModalBackHandler";

interface TwoFactorOtpVerificationViewProps {
  user: User | null;
  title?: string;
  description?: string;
  onVerifiedSuccess: () => void;
  onCancel?: () => void;
}

export function TwoFactorOtpVerificationView({
  user,
  title = "2FA Security Verification",
  description = "Please select a channel to send your 6-digit security OTP code.",
  onVerifiedSuccess,
  onCancel,
}: TwoFactorOtpVerificationViewProps) {
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [hasOtpBeenSent, setHasOtpBeenSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [cooldown, setCooldown] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [mounted, setMounted] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useModalBackHandler(true, onCancel || (() => {}), "2fa-otp-drawer-modal");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const updated = [...otpDigits];
    updated[index] = digit;
    setOtpDigits(updated);

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (updated.join("").length === 6) {
      executeVerifyOtp(updated.join(""));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasteData) return;
    const updated = ["", "", "", "", "", ""];
    for (let i = 0; i < pasteData.length; i++) {
      updated[i] = pasteData[i];
    }
    setOtpDigits(updated);
    const targetIdx = Math.min(pasteData.length, 5);
    inputRefs.current[targetIdx]?.focus();

    if (updated.join("").length === 6) {
      executeVerifyOtp(updated.join(""));
    }
  };

  const dispatchOtp = async (selectedChannel: "email" | "whatsapp" = channel) => {
    if (!user) {
      toast.error("User session missing. Please log in.");
      return;
    }

    triggerHaptic();
    setIsSending(true);
    toast.loading(`Sending 2FA OTP code via ${selectedChannel === "email" ? "Email" : "WhatsApp"}...`);

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/auth/login-2fa-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "send", channel: selectedChannel }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || "2FA OTP code sent successfully!");
        if (data.maskedEmail) setMaskedEmail(data.maskedEmail);
        if (data.maskedPhone) setMaskedPhone(data.maskedPhone);
        if (data.devOtp) toast.info(`Dev Mode OTP: ${data.devOtp}`);
        setHasOtpBeenSent(true);
        setCooldown(60);
      } else {
        toast.error(data.error || "Failed to send 2FA OTP code.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network communication error sending OTP.");
    } finally {
      setIsSending(false);
    }
  };

  const executeVerifyOtp = async (code: string) => {
    if (!user || code.length !== 6) return;

    triggerHaptic();
    setIsVerifying(true);
    toast.loading("Verifying 2FA Security OTP...");

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/auth/login-2fa-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "verify", otpCode: code }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("2FA OTP code verified successfully!");
        onVerifiedSuccess();
      } else {
        toast.error(data.error || data.message || "Invalid or expired OTP code.");
        setOtpDigits(["", "", "", "", "", ""]);
      }
    } catch {
      toast.dismiss();
      toast.error("Error verifying 2FA OTP code.");
      setOtpDigits(["", "", "", "", "", ""]);
    } finally {
      setIsVerifying(false);
    }
  };

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[250000] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 select-none font-hanken">
        <div className="absolute inset-0" onClick={() => onCancel && onCancel()} />

        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 260 }}
          className="relative w-full max-w-md bg-white rounded-t-[32px] sm:rounded-3xl p-6 shadow-2xl border-t sm:border border-gray-100 z-10 flex flex-col justify-between max-h-[92vh] overflow-y-auto"
        >
          {/* Draggable Handle */}
          <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-4 shrink-0" />

          {/* Drawer Header Bar */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-orange-50 text-[#FC7A00] flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                  shield_lock
                </span>
              </div>
              <h3 className="font-extrabold text-xs text-black uppercase tracking-wider">
                2FA SECURITY VERIFICATION
              </h3>
            </div>

            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black cursor-pointer transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {/* Drawer Body Content */}
          <div className="flex-grow flex flex-col items-center text-center space-y-4 py-2">
            <div className="space-y-1">
              <h3 className="font-bodoni font-bold text-xl text-black">{title}</h3>
              <p className="font-hanken text-xs text-gray-500 font-semibold leading-relaxed max-w-xs mx-auto">
                {description}
              </p>
            </div>

            {/* Channel Selector Pills */}
            <div className="space-y-1.5 w-full">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Delivery Channel</span>
                {cooldown > 0 && (
                  <span className="text-[9.5px] font-bold text-amber-600 uppercase tracking-wider">
                    Locked ({cooldown}s)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-2xl w-full border border-gray-200">
                <button
                  type="button"
                  disabled={isSending || cooldown > 0}
                  onClick={() => {
                    if (cooldown > 0) return;
                    setChannel("email");
                  }}
                  className={cn(
                    "py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5",
                    channel === "email" ? "bg-[#FC7A00] text-white shadow-xs" : "bg-transparent text-gray-500 hover:text-black",
                    cooldown > 0 ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  )}
                >
                  <span className="material-symbols-outlined text-[16px]">mail</span>
                  <span>Email</span>
                </button>

                <button
                  type="button"
                  disabled={isSending || cooldown > 0}
                  onClick={() => {
                    if (cooldown > 0) return;
                    setChannel("whatsapp");
                  }}
                  className={cn(
                    "py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5",
                    channel === "whatsapp" ? "bg-emerald-600 text-white shadow-xs" : "bg-transparent text-gray-500 hover:text-black",
                    cooldown > 0 ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  )}
                >
                  <span className="material-symbols-outlined text-[16px]">chat</span>
                  <span>WhatsApp</span>
                </button>
              </div>
            </div>

            {/* Send OTP / Resend Button */}
            <div className="w-full pt-1">
              {!hasOtpBeenSent ? (
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => dispatchOtp(channel)}
                  className="w-full py-3.5 bg-[#FC7A00] hover:bg-[#e06600] text-white text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer disabled:opacity-50 transition-all shadow-md active:scale-98"
                >
                  {isSending ? "Sending 2FA OTP Code..." : `Send OTP Code via ${channel === "email" ? "Email" : "WhatsApp"}`}
                </button>
              ) : cooldown > 0 ? (
                <div className="p-3 bg-orange-50/50 border border-orange-100 rounded-2xl text-center space-y-0.5">
                  <p className="text-[11px] text-gray-700 font-bold">
                    Code sent to {channel === "email" ? (maskedEmail || "registered email") : (maskedPhone || "registered WhatsApp")}.
                  </p>
                  <p className="text-[10px] text-gray-400 font-semibold">Resend available in {cooldown}s</p>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => dispatchOtp(channel)}
                  className="text-xs font-bold text-[#FC7A00] hover:underline cursor-pointer disabled:opacity-50 flex items-center gap-1.5 justify-center mx-auto uppercase tracking-wider"
                >
                  {isSending ? "Dispatching New Code..." : "Resend OTP Code"}
                </button>
              )}
            </div>

            {/* 6-Digit OTP Boxes */}
            {hasOtpBeenSent && (
              <div className="space-y-3 w-full pt-2">
                <p className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wider">Enter 6-Digit Security OTP</p>
                <div className="flex gap-2 justify-center w-full">
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
                    <input
                      key={idx}
                      ref={(el) => { inputRefs.current[idx] = el; }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={otpDigits[idx]}
                      disabled={isVerifying || isSending}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      onPaste={handleOtpPaste}
                      className={cn(
                        "w-11 h-13 bg-white border-2 rounded-xl text-center font-mono font-black text-xl text-black transition-all outline-none shadow-2xs",
                        otpDigits[idx]
                          ? "border-[#FC7A00] bg-orange-50/20 ring-2 ring-[#FC7A00]/20"
                          : "border-gray-200 focus:border-[#FC7A00] focus:ring-2 focus:ring-[#FC7A00]/20"
                      )}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  disabled={isVerifying || otpDigits.join("").length !== 6}
                  onClick={() => executeVerifyOtp(otpDigits.join(""))}
                  className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer hover:brightness-105 active:scale-95 transition-all shadow-md disabled:opacity-50 mt-2"
                >
                  {isVerifying ? "Verifying 2FA Code..." : "Authenticate & Proceed"}
                </button>
              </div>
            )}
          </div>

          {/* Drawer Footer Controls */}
          {onCancel && (
            <div className="pt-3 border-t border-gray-100 shrink-0">
              <button
                type="button"
                disabled={isVerifying || isSending}
                onClick={onCancel}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold uppercase tracking-wider rounded-2xl cursor-pointer active:scale-95 transition-all"
              >
                Cancel &amp; Return
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
