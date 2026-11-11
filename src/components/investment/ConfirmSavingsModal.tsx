"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SavingsPlanData } from "@/lib/savings-plans-types";
import { useModalBackHandler } from "@/lib/useModalBackHandler";

interface ConfirmSavingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSubmitting: boolean;
  selectedPlan: SavingsPlanData;
  amountStr: string;
  calculatedMaturityDateObj: Date;
  estimatedReward: number;
  penaltyRate: number;
  onConfirm: () => void;
}

export function ConfirmSavingsModal({
  isOpen,
  onClose,
  isSubmitting,
  selectedPlan,
  amountStr,
  calculatedMaturityDateObj,
  estimatedReward,
  penaltyRate,
  onConfirm,
}: ConfirmSavingsModalProps) {
  useModalBackHandler(isOpen, onClose, "investment-confirm-modal");

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
        <div className="absolute inset-0" onClick={() => !isSubmitting && onClose()} />

        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 220 }}
          className="relative bg-white w-full max-w-md rounded-t-[32px] p-6 shadow-2xl border-t border-gray-100 z-10 max-h-[92dvh] overflow-y-auto no-scrollbar touch-none select-none"
        >
          <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

          <div className="flex flex-col items-center text-center mb-5">
            <div className="w-14 h-14 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-red-500 text-[28px] animate-pulse">
                gavel
              </span>
            </div>
            <h3 className="font-bodoni text-[18px] font-bold text-black">
              Confirm Savings Lock Rules
            </h3>
            <p className="font-hanken text-[11px] text-gray-500 max-w-[280px] mt-1 font-semibold leading-relaxed">
              Please review rules before locking your capital.
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-5">
            <div className="flex justify-between py-2 border-b border-gray-100/60 font-hanken text-[12px]">
              <span className="text-gray-500 font-semibold">Savings Plan</span>
              <span className="text-black font-bold">{selectedPlan.name}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100/60 font-hanken text-[12px]">
              <span className="text-gray-500 font-semibold">Amount Saved</span>
              <span className="text-black font-bold">₦{parseFloat(amountStr || "0").toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100/60 font-hanken text-[12px]">
              <span className="text-gray-500 font-semibold">Withdrawal Date</span>
              <span className="text-[#FC7A00] font-extrabold">{calculatedMaturityDateObj.toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between py-2 font-hanken text-[12px]">
              <span className="text-gray-500 font-semibold">Extra Interest You Earn</span>
              <span className="text-green-600 font-extrabold">+{estimatedReward.toLocaleString()} ({selectedPlan.apr}%)</span>
            </div>
          </div>

          <div className="bg-red-50/50 border border-red-100 rounded-xl p-4 mb-6">
            <h4 className="font-hanken text-[11px] font-extrabold text-red-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">warning</span>
              SECURE SAVINGS RULES
            </h4>
            <ul className="list-disc list-inside space-y-1 font-hanken text-[10px] text-gray-600 font-semibold leading-relaxed">
              <li>This savings plan is locked until maturity.</li>
              <li>Early cancellations carry a <strong>{(penaltyRate * 100).toFixed(0)}% liquidation penalty</strong>.</li>
              <li>Your money and extra interest rewards will return directly to your wallet balance on <strong className="text-black">{calculatedMaturityDateObj.toLocaleDateString()}</strong>.</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="flex-1 py-3 border border-gray-200 text-gray-500 hover:text-black rounded-xl font-hanken text-[12.5px] font-bold tracking-wide active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              Cancel / Exit
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onConfirm}
              className="flex-1 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-hanken text-[12.5px] font-bold tracking-wide active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-[0_4px_15px_rgba(252,122,0,0.15)] cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Securing Vault...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                  <span>I Agree & Secure</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
