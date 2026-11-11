"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Biller, BillItem } from "./types";
import { useAuth } from "@/lib/AuthContext";
import { TwoFactorOtpVerificationView } from "@/components/auth/TwoFactorOtpVerificationView";
import { getBiometricLabel, getBiometricType, authenticateBiometricDetailed } from "@/lib/biometrics-util";
import { toast } from "sonner";

interface BillPinModalProps {
  isOpen: boolean;
  selectedBiller: Biller | null;
  selectedItem: BillItem | null;
  finalAmount: number;
  onClose: () => void;
  onExecutePayment: (pin?: string, isBiometricAuthenticated?: boolean) => void;
}

export const BillPinModal: React.FC<BillPinModalProps> = ({
  isOpen,
  selectedBiller,
  selectedItem,
  finalAmount,
  onClose,
  onExecutePayment,
}) => {
  const { user, userData, updateUserData } = useAuth();
  const [enteredPin, setEnteredPin] = useState<string>("");
  const [is2faStage, setIs2faStage] = useState(false);
  const [verifiedPin, setVerifiedPin] = useState("");

  useEffect(() => {
    if (isOpen) {
      setEnteredPin("");
      setIs2faStage(false);
      setVerifiedPin("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const is2faActive = userData?.is2faOtpEnabled === true;
  const isBiometricEnabled =
    userData?.isBiometricTransferEnabled === true ||
    userData?.isBiometricLoginEnabled === true ||
    userData?.isFaceIdEnabled === true;

  const biometricLabel = getBiometricLabel();
  const biometricType = getBiometricType();

  const handlePinPress = (num: string) => {
    if (enteredPin.length < 4) {
      const nextPin = enteredPin + num;
      setEnteredPin(nextPin);
      if (nextPin.length === 4) {
        if (is2faActive) {
          setVerifiedPin(nextPin);
          setIs2faStage(true);
        } else {
          onExecutePayment(nextPin);
        }
      }
    }
  };

  const handlePinDelete = () => {
    setEnteredPin((prev) => prev.slice(0, -1));
  };

  const handleBiometricAuth = async () => {
    if (!navigator.onLine) {
      toast.error("Internet connection required to verify biometrics.");
      return;
    }
    toast.loading(`Authenticating ${biometricLabel}...`);
    const res = await authenticateBiometricDetailed(`Authorize ₦${finalAmount.toLocaleString()} payment`);
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
        onExecutePayment(undefined, true);
      }
    } else if (res.cancelled) {
      // User cancelled biometric prompt cleanly
    } else {
      toast.error(res.message || `${biometricLabel} authentication failed.`);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", damping: 25, stiffness: 280 }}
          className="fixed inset-0 bg-white z-[99999] p-6 flex flex-col justify-between text-black max-w-md mx-auto"
        >
          {/* Back / Close button */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer shadow-none"
              title="Close Pin Pad"
            >
              <span className="material-symbols-outlined text-[18px] font-bold">arrow_back</span>
            </button>
            <h3 className="font-hanken font-black text-xs text-black uppercase tracking-wider">
              Secure Verification
            </h3>
            <div className="w-9" />
          </div>

          {/* Central Details and dots or 2FA OTP */}
          <div className="flex-grow flex flex-col items-center justify-center space-y-4 py-4 overflow-y-auto">
            {is2faStage ? (
              <TwoFactorOtpVerificationView
                user={user}
                title="2FA Payment Verification"
                description={`PIN/Biometrics verified! Enter 2FA OTP to complete ₦${finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} payment for ${selectedBiller?.name || "Bill Payment"}.`}
                onVerifiedSuccess={() => onExecutePayment(verifiedPin || undefined, !verifiedPin)}
                onCancel={() => {
                  setIs2faStage(false);
                  setEnteredPin("");
                }}
              />
            ) : (
              <>
                {/* Visual Lock Badge */}
                <div className="w-12 h-12 bg-orange-50 border border-orange-100 text-primary rounded-full flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                    lock
                  </span>
                </div>

                <div className="text-center space-y-1">
                  <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                    Order Payout Settlement
                  </p>
                  <p className="font-mono text-2xl font-black text-black">
                    ₦{finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[11px] text-gray-500 font-semibold max-w-[260px] mx-auto leading-tight">
                    Paying <span className="font-bold text-black">{selectedBiller?.name}</span> for{" "}
                    <span className="font-bold text-black">{selectedItem?.name}</span>
                  </p>
                </div>

                <div className="space-y-2 w-full flex flex-col items-center">
                  <p className="font-hanken text-[10px] text-gray-400 text-center max-w-[240px]">
                    Enter your 4-digit PIN or use biometrics to authorize.
                  </p>

                  {/* 4 Box PIN Indicators */}
                  <div className="flex justify-center gap-2 pt-0.5">
                    {[0, 1, 2, 3].map((idx) => (
                      <div
                        key={idx}
                        className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-base font-black transition-all ${
                          enteredPin.length > idx
                            ? "border-[#FC7A00] bg-orange-50/40 text-black"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        {enteredPin[idx] ? "•" : ""}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Standardized Transaction Keypad Grid */}
                <div className="grid grid-cols-3 gap-2 pt-1 w-full max-w-xs mx-auto">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handlePinPress(num.toString())}
                      className="py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm font-black text-black cursor-pointer active:scale-95 transition-all"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEnteredPin("")}
                    className="py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl text-[10px] font-bold text-gray-600 cursor-pointer active:scale-95 transition-all"
                  >
                    CLEAR
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePinPress("0")}
                    className="py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm font-black text-black cursor-pointer active:scale-95 transition-all"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handlePinDelete}
                    className="py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl text-gray-600 cursor-pointer active:scale-95 transition-all flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-[18px]">backspace</span>
                  </button>
                </div>

                {/* Compact Biometric Authorization Option */}
                {isBiometricEnabled && (
                  <button
                    type="button"
                    onClick={handleBiometricAuth}
                    className="w-full max-w-xs mx-auto py-2.5 bg-[#07B038] hover:bg-[#058a2f] text-white text-[11px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm transition-all active:scale-98 flex items-center justify-center gap-1.5 mt-1"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {biometricType === "faceid" ? "face_6" : "fingerprint"}
                    </span>
                    <span>Authorize via {biometricLabel}</span>
                  </button>
                )}
              </>
            )}
          </div>

          <div className="h-2" />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
