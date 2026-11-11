"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { TwoFactorOtpVerificationView } from "@/components/auth/TwoFactorOtpVerificationView";
import { getBiometricLabel, getBiometricType, authenticateBiometricDetailed } from "@/lib/biometrics-util";
import { triggerHaptic } from "@/lib/haptics";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { toast } from "sonner";

export interface AuthorizeTransactionModalProps {
  isOpen: boolean;
  recipientName: string;
  bankName: string;
  accountNumber?: string;
  amount: number;
  fee: number;
  totalDebit: number;
  walletBalance: number;
  remainingFreeTransfers?: number;
  showFreeIndicator?: boolean;
  onClose: () => void;
  onExecuteTransfer: (pin?: string, isBiometricAuthenticated?: boolean) => void;
}

export const AuthorizeTransactionModal: React.FC<AuthorizeTransactionModalProps> = ({
  isOpen,
  recipientName,
  bankName,
  accountNumber,
  amount,
  fee,
  totalDebit,
  walletBalance,
  remainingFreeTransfers,
  showFreeIndicator = true,
  onClose,
  onExecuteTransfer,
}) => {
  const { user, userData, updateUserData } = useAuth();
  const [enteredPin, setEnteredPin] = useState<string>("");
  const [is2faStage, setIs2faStage] = useState(false);
  const [verifiedPin, setVerifiedPin] = useState("");

  // Intercept mobile/hardware back button to close ONLY AuthorizeTransactionModal and return to Confirmation
  useModalBackHandler(isOpen, onClose, "authorize-transaction-modal");

  useEffect(() => {
    if (isOpen) {
      setEnteredPin("");
      setIs2faStage(false);
      setVerifiedPin("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const is2faActive = userData?.is2faOtpEnabled === true;
  const biometricLabel = getBiometricLabel();
  const biometricType = getBiometricType();

  const handlePinPress = (num: string) => {
    triggerHaptic();
    if (enteredPin.length < 4) {
      const nextPin = enteredPin + num;
      setEnteredPin(nextPin);
    }
  };

  const handlePinDelete = () => {
    triggerHaptic();
    setEnteredPin((prev) => prev.slice(0, -1));
  };

  const handleBiometricAuth = async () => {
    if (!navigator.onLine) {
      toast.error("Internet connection required to verify biometrics.");
      return;
    }
    toast.loading(`Authenticating ${biometricLabel}...`);
    const res = await authenticateBiometricDetailed(`Authorize ₦${totalDebit.toLocaleString()} transfer`);
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
        onExecuteTransfer(undefined, true);
      }
    } else if (res.cancelled) {
      // User cancelled biometric prompt cleanly
    } else {
      toast.error(res.message || `${biometricLabel} authentication failed.`);
    }
  };

  const handlePayNow = () => {
    if (enteredPin.length === 4) {
      if (is2faActive) {
        setVerifiedPin(enteredPin);
        setIs2faStage(true);
      } else {
        onExecuteTransfer(enteredPin);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Glassmorphic Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[199999]"
          />

          {/* Full-Screen / Slide-up App-Friendly Drawer Modal */}
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
            className="fixed inset-0 w-full h-full max-w-md mx-auto bg-white z-[200000] text-black overflow-hidden flex flex-col will-change-transform font-hanken"
          >
            <div className="p-6 pb-0 flex flex-col flex-1 overflow-hidden">
              {/* Header Bar */}
              <div className="w-full flex items-center justify-between border-b border-gray-100 pb-4 mb-4 flex-shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
                  title="Back to Confirmation"
                >
                  <span className="material-symbols-outlined text-[16px] font-bold">arrow_back</span>
                </button>
                <h3 className="font-hanken font-bold text-base text-black text-center">
                  Authorize Transaction
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
                  title="Close Modal"
                >
                  <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                </button>
              </div>

              {/* Scrollable Modal Body */}
              <div className="flex-1 overflow-y-auto no-scrollbar pb-6 space-y-3.5 text-center flex flex-col items-center">
                {is2faStage ? (
                  <TwoFactorOtpVerificationView
                    user={user}
                    title="2FA Transfer Verification"
                    description={`PIN/Biometrics verified! Complete 2FA OTP verification to authorize ₦${totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })} transfer.`}
                    onVerifiedSuccess={() => onExecuteTransfer(verifiedPin || undefined, !verifiedPin)}
                    onCancel={() => {
                      setIs2faStage(false);
                      setEnteredPin("");
                    }}
                  />
                ) : (
                  <>
                    {/* Visual Lock Icon Badge */}
                    <div className="w-10 h-10 bg-orange-50 border border-orange-100 text-[#FC7A00] rounded-full flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                        lock
                      </span>
                    </div>

                    {/* Concise Transfer Details Summary Card */}
                    <div className="w-full bg-gray-50 border border-gray-200/80 rounded-2xl p-3.5 space-y-2 font-hanken text-left text-xs shadow-xs">
                      <div className="flex justify-between items-center font-semibold text-gray-600">
                        <span>Transfer Amount:</span>
                        <span className="font-mono font-bold text-gray-900">
                          ₦{amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex justify-between items-center border-t border-gray-200/60 pt-2 text-xs">
                        <span className="text-gray-500 font-semibold">Transfer Fee:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-gray-700">
                            {fee > 0 ? `₦${fee.toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "₦0.00 (Free)"}
                          </span>
                          {fee === 0 && showFreeIndicator && typeof remainingFreeTransfers === "number" && remainingFreeTransfers > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 uppercase tracking-wider">
                              {remainingFreeTransfers} Free Left
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center border-t border-gray-200/60 pt-2 font-bold text-gray-800">
                        <span>Total Debit Amount:</span>
                        <span className="font-mono font-black text-[#E11D48] text-sm">
                          ₦{totalDebit.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex justify-between items-center border-t border-gray-200/60 pt-2 text-xs">
                        <span className="text-gray-500 font-semibold">Recipient:</span>
                        <span className="font-extrabold text-black uppercase truncate max-w-[180px]">{recipientName}</span>
                      </div>

                      {bankName && (
                        <div className="flex justify-between items-center border-t border-gray-200/60 pt-2 text-xs">
                          <span className="text-gray-500 font-semibold">Destination Bank:</span>
                          <span className="font-semibold text-gray-800 uppercase truncate max-w-[180px]">
                            {bankName} {accountNumber ? `(${accountNumber})` : ""}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between items-center border-t border-gray-200/60 pt-2 text-xs">
                        <span className="text-gray-500 font-semibold">My Wallet Balance:</span>
                        <span className="font-mono font-black text-black">
                          ₦{walletBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* 4 Box PIN Indicators */}
                    <div className="space-y-1 w-full flex flex-col items-center">
                      <p className="font-hanken text-[11px] text-gray-500 font-medium text-center">
                        Enter your 4-digit transaction PIN or use biometrics to authorize transfer.
                      </p>

                      <div className="flex justify-center gap-2 pt-1">
                        {[0, 1, 2, 3].map((idx) => (
                          <div
                            key={idx}
                            className={`w-11 h-12 rounded-xl border-2 flex items-center justify-center text-lg font-black transition-all ${
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

                    {/* Keypad Grid */}
                    <div className="grid grid-cols-3 gap-2 pt-1 w-full max-w-xs mx-auto">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => handlePinPress(num.toString())}
                          className="py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-base font-black text-black cursor-pointer active:scale-95 transition-all"
                        >
                          {num}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => { triggerHaptic(); setEnteredPin(""); }}
                        className="py-3 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 cursor-pointer active:scale-95 transition-all"
                      >
                        CLEAR
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePinPress("0")}
                        className="py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-base font-black text-black cursor-pointer active:scale-95 transition-all"
                      >
                        0
                      </button>
                      <button
                        type="button"
                        onClick={handlePinDelete}
                        className="py-3 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl text-gray-600 cursor-pointer active:scale-95 transition-all flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-[20px]">backspace</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Static Bottom Action Bar */}
            {!is2faStage && (
              <div className="p-5 bg-white border-t border-gray-100 flex-shrink-0 shadow-lg z-20 space-y-2">
                <button
                  type="button"
                  onClick={handleBiometricAuth}
                  className="w-full py-3 bg-[#07B038] hover:bg-[#058a2f] text-white text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm transition-all active:scale-98 flex items-center justify-center gap-2 border-0"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {biometricType === "faceid" ? "face_6" : "fingerprint"}
                  </span>
                  <span>Authorize via {biometricLabel}</span>
                </button>

                <button
                  type="button"
                  disabled={enteredPin.length < 4}
                  onClick={handlePayNow}
                  className="w-full py-3.5 bg-gradient-to-r from-[#FC7A00] to-[#E06600] disabled:from-gray-300 disabled:to-gray-400 text-white text-xs font-black uppercase tracking-widest rounded-xl cursor-pointer hover:brightness-105 active:scale-98 transition-all shadow-sm border-0 flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                  <span>PAY NOW</span>
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export { AuthorizeTransactionModal as AuthorizeTransferModal, AuthorizeTransactionModal as TransferPinModal };
export type { AuthorizeTransactionModalProps as AuthorizeTransferModalProps };
