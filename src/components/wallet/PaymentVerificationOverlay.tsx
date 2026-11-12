"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface PaymentVerificationOverlayProps {
  verificationStatus: "idle" | "verifying" | "success" | "error";
  isDuplicate: boolean;
  verifiedAmount: number;
  verifyMessage: string;
  onDismiss: () => void;
}

export const PaymentVerificationOverlay: React.FC<PaymentVerificationOverlayProps> = ({
  verificationStatus,
  isDuplicate,
  verifiedAmount,
  verifyMessage,
  onDismiss,
}) => {
  return (
    <AnimatePresence>
      {verificationStatus === "verifying" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[99999] flex flex-col items-center justify-center p-6 text-white"
        >
          <div className="flex flex-col items-center p-6 rounded-3xl bg-white/5 border border-white/10 shadow-2xl max-w-sm text-center space-y-4">
            <div className="relative w-12 h-12 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.0, ease: "linear" }}
                className="absolute inset-0 rounded-full border-[3px] border-white/20 border-t-[#FC7A00]"
              />
              <span className="material-symbols-outlined text-[#FC7A00] text-[22px] font-bold">lock_clock</span>
            </div>
            <div>
              <h3 className="font-hanken font-extrabold text-base text-white uppercase tracking-wider">Verifying Settlement</h3>
              <p className="font-hanken text-[11px] text-gray-400 mt-1 font-semibold leading-relaxed">
                Communicating with Flutterwave verification rails to secure your wallet deposit. Please do not close or reload this window...
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {verificationStatus === "success" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[99999] flex items-center justify-center p-6 text-black"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full text-center space-y-5 border border-gray-100"
          >
            {isDuplicate ? (
              <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 mx-auto shadow-inner">
                <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: '"FILL" 1' }}>info</span>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mx-auto shadow-inner">
                <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: '"FILL" 1' }}>check_circle</span>
              </div>
            )}

            <div>
              <h3 className="font-hanken font-black text-lg text-gray-900 leading-tight">
                {isDuplicate ? "Already Processed" : "Payment Verified!"}
              </h3>
              <p className="font-hanken text-xs text-gray-500 mt-1 font-semibold leading-relaxed">
                {isDuplicate
                  ? "This transaction has already been processed. Your wallet was not credited again."
                  : "Your transaction has been securely processed and confirmed. Your wallet balance has been credited."}
              </p>
            </div>

            {!isDuplicate && verifiedAmount > 0 && (
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-150">
                <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Credited Amount</p>
                <p className="font-mono text-2xl font-black text-emerald-600 mt-0.5">
                  +₦{verifiedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}

            <button
              onClick={onDismiss}
              className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-widest rounded-2xl cursor-pointer hover:brightness-105 active:scale-98 transition-all"
            >
              Go to Dashboard
            </button>
          </motion.div>
        </motion.div>
      )}

      {verificationStatus === "error" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-[99999] flex items-center justify-center p-6 text-black"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full text-center space-y-5 border border-gray-100"
          >
            <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto shadow-inner">
              <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: '"FILL" 1' }}>error</span>
            </div>

            <div>
              <h3 className="font-hanken font-black text-lg text-gray-900 leading-tight">Funding Failed</h3>
              <p className="font-hanken text-xs text-rose-600 mt-1.5 font-bold leading-relaxed">
                {verifyMessage || "The transaction verification check was rejected by Flutterwave secure payment gateway."}
              </p>
            </div>

            <button
              onClick={onDismiss}
              className="w-full py-4 bg-gray-900 text-white text-xs font-black uppercase tracking-widest rounded-2xl cursor-pointer hover:bg-black active:scale-98 transition-all"
            >
              Dismiss
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
