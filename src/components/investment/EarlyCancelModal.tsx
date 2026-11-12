"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useModalBackHandler } from "@/lib/useModalBackHandler";

interface EarlyCancelModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLiquidating: boolean;
  penaltyPolicyText: string;
  penaltyRate: number;
  onConfirmCancel: () => void;
}

export function EarlyCancelModal({
  isOpen,
  onClose,
  isLiquidating,
  penaltyPolicyText,
  penaltyRate,
  onConfirmCancel,
}: EarlyCancelModalProps) {
  useModalBackHandler(isOpen, onClose, "investment-cancel-modal");

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
        <div className="absolute inset-0" onClick={() => !isLiquidating && onClose()} />

        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 220 }}
          className="relative bg-white w-full max-w-md rounded-t-[32px] p-6 shadow-2xl border-t border-gray-100 z-10"
        >
          <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

          <div className="flex flex-col items-center text-center mb-5">
            <div className="w-14 h-14 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-orange-500 text-[28px] animate-bounce">
                warning
              </span>
            </div>
            <h3 className="font-bodoni text-[18px] font-bold text-black">
              Confirm Early Withdrawal
            </h3>
            <p className="font-hanken text-[11px] text-gray-500 max-w-[280px] mt-1 font-semibold leading-relaxed">
              Withdrawing funds before the maturity date incurs an early-termination penalty.
            </p>
          </div>

          <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-6">
            <h4 className="font-hanken text-[11px] font-extrabold text-orange-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">warning</span>
              PENALTY & POLICY DISCLOSURE
            </h4>
            <p className="font-hanken text-[10.5px] text-gray-700 font-semibold leading-relaxed mb-2">
              {penaltyPolicyText}
            </p>
            <ul className="list-disc list-inside space-y-1 font-hanken text-[10px] text-gray-700 font-semibold leading-relaxed border-t border-orange-200/60 pt-2">
              <li>An early withdrawal penalty of <strong>{(penaltyRate * 100).toFixed(0)}% of principal</strong> will be deducted.</li>
              <li>Any accumulated interest will be forfeit upon early liquidation.</li>
              <li>The remaining refunded capital will be credited instantly back to your wallet.</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              disabled={isLiquidating}
              onClick={onClose}
              className="flex-1 py-3 border border-gray-200 text-gray-500 hover:text-black rounded-xl font-hanken text-[12.5px] font-bold tracking-wide active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              Keep Savings locked
            </button>
            <button
              type="button"
              disabled={isLiquidating}
              onClick={onConfirmCancel}
              className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-hanken text-[12.5px] font-bold tracking-wide active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
            >
              {isLiquidating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Withdrawing...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>Accept & Liquidate</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
