"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { useAuth } from "@/lib/AuthContext";
import { TwoFactorOtpVerificationView } from "@/components/auth/TwoFactorOtpVerificationView";
import { getBiometricLabel, getBiometricType, authenticateBiometricDetailed } from "@/lib/biometrics-util";
import { toast } from "sonner";

interface InvestmentPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  isSubmitting: boolean;
  onPinSubmit: (pin?: string, isBiometricAuthenticated?: boolean) => void;
}

export function InvestmentPinModal({
  isOpen,
  onClose,
  title = "Authorize Transaction",
  description = "Enter your 4-digit transaction PIN to proceed.",
  isSubmitting,
  onPinSubmit,
}: InvestmentPinModalProps) {
  const { user, userData, updateUserData } = useAuth();
  const [pin, setPin] = useState("");
  const [is2faStage, setIs2faStage] = useState(false);
  const [verifiedPin, setVerifiedPin] = useState("");
  const [mounted, setMounted] = useState(false);

  useModalBackHandler(isOpen, onClose, "investment-pin-modal");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setPin("");
      setIs2faStage(false);
      setVerifiedPin("");
    }
  }, [isOpen]);

  if (!isOpen || !mounted || typeof document === "undefined") return null;

  const is2faActive = userData?.is2faOtpEnabled === true;
  const isBiometricEnabled =
    userData?.isBiometricTransferEnabled === true ||
    userData?.isBiometricLoginEnabled === true ||
    userData?.isFaceIdEnabled === true;

  const biometricLabel = getBiometricLabel();
  const biometricType = getBiometricType();

  const handleKeyPress = (num: string) => {
    if (isSubmitting) return;
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      if (nextPin.length === 4) {
        if (is2faActive) {
          setVerifiedPin(nextPin);
          setIs2faStage(true);
        } else {
          onPinSubmit(nextPin);
        }
      }
    }
  };

  const handleClear = () => {
    if (isSubmitting) return;
    setPin("");
  };

  const handleBackspace = () => {
    if (isSubmitting) return;
    setPin((prev) => prev.slice(0, -1));
  };

  const handleBiometricAuth = async () => {
    if (isSubmitting) return;
    if (!navigator.onLine) {
      toast.error("Internet connection required to verify biometrics.");
      return;
    }
    toast.loading(`Authenticating ${biometricLabel}...`);
    const res = await authenticateBiometricDetailed(`Authorize ${title}`);
    toast.dismiss();

    if (res.success) {
      toast.success(`${biometricLabel} Authenticated!`);
      if (userData?.isBiometricTransferEnabled !== true) {
        updateUserData?.({ isBiometricTransferEnabled: true, isBiometricLoginEnabled: true, isFaceIdEnabled: true })?.catch(() => {});
      }
      if (is2faActive) {
        setVerifiedPin("");
        setIs2faStage(true);
      } else {
        onPinSubmit(undefined, true);
      }
    } else if (res.cancelled) {
      // User cancelled
    } else {
      toast.error(res.message || `${biometricLabel} authentication failed.`);
    }
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[200000] flex items-end justify-center bg-black/60 backdrop-blur-sm">
        <div className="absolute inset-0" onClick={() => !isSubmitting && onClose()} />

        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 220 }}
          className="relative bg-white w-full max-w-md rounded-t-[32px] p-5 shadow-2xl border-t border-gray-100 z-10 select-none max-h-[90vh] overflow-y-auto"
        >
          <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

          {is2faStage ? (
            <TwoFactorOtpVerificationView
              user={user}
              title={title}
              description={`PIN/Biometrics verified! Enter 2FA OTP to complete ${title.toLowerCase()}.`}
              onVerifiedSuccess={() => onPinSubmit(verifiedPin || undefined, !verifiedPin)}
              onCancel={() => {
                setIs2faStage(false);
                setPin("");
              }}
            />
          ) : (
            <>
              <div className="flex flex-col items-center text-center mb-4">
                <div className="w-10 h-10 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center mb-1.5 text-primary">
                  <span className="material-symbols-outlined text-[20px]">lock</span>
                </div>
                <h3 className="font-bodoni text-base font-bold text-black">{title}</h3>
                <p className="font-hanken text-[11px] text-gray-500 max-w-[260px] mt-0.5 font-semibold leading-tight">
                  {description}
                </p>
              </div>

              {/* PIN Indicator Dots */}
              <div className="flex justify-center gap-2.5 mb-4">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center text-base font-extrabold font-mono transition-all ${
                      pin.length > idx
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-gray-200 bg-gray-50 text-gray-300"
                    }`}
                  >
                    {pin.length > idx ? "•" : ""}
                  </div>
                ))}
              </div>

              {/* Keypad */}
              <div className="max-w-xs mx-auto grid grid-cols-3 gap-2 mb-3">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                  <button
                    key={num}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleKeyPress(num)}
                    className="h-11 rounded-xl bg-gray-50 border border-gray-100 font-hanken text-base font-bold text-black active:bg-gray-200 active:scale-95 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleClear}
                  className="h-11 rounded-xl bg-gray-50 border border-gray-100 font-hanken text-[10px] font-bold text-gray-500 active:bg-gray-200 active:scale-95 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  CLEAR
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleKeyPress("0")}
                  className="h-11 rounded-xl bg-gray-50 border border-gray-100 font-hanken text-base font-bold text-black active:bg-gray-200 active:scale-95 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  0
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleBackspace}
                  className="h-11 rounded-xl bg-gray-50 border border-gray-100 font-hanken text-gray-500 active:bg-gray-200 active:scale-95 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">backspace</span>
                </button>
              </div>

              {/* Biometric Authorization Option */}
              {isBiometricEnabled && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleBiometricAuth}
                  className="w-full max-w-xs mx-auto py-2.5 bg-[#07B038] hover:bg-[#058a2f] text-white text-[11px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm transition-all active:scale-98 flex items-center justify-center gap-1.5 mb-2 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {biometricType === "faceid" ? "face_6" : "fingerprint"}
                  </span>
                  <span>Authorize via {biometricLabel}</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="w-full py-2.5 border border-gray-200 text-gray-500 hover:text-black rounded-xl font-hanken text-[11px] font-bold tracking-wide active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
