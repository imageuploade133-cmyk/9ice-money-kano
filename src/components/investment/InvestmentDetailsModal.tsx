"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useModalBackHandler } from "@/lib/useModalBackHandler";

export interface ActiveInvestment {
  id: string;
  investmentReference?: string;
  userId: string;
  type: "SAVINGS" | "FIXED_DEPOSIT";
  amount: number;
  currency: string;
  startDate: string;
  maturityDate: string;
  interestRate: number;
  interestType: "SIMPLE" | "COMPOUND";
  accumulatedInterest: number;
  totalValue: number;
  status: "ACTIVE" | "MATURED" | "CLAIM_REQUESTED" | "CLAIMED" | "CANCELLED";
  optionId: string;
  optionName: string;
  claimRequestedAt?: string;
  claimApprovedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface InvestmentDetailsModalProps {
  investment: ActiveInvestment | null;
  onClose: () => void;
  penaltyRate: number;
}

export function InvestmentDetailsModal({
  investment,
  onClose,
  penaltyRate,
}: InvestmentDetailsModalProps) {
  useModalBackHandler(Boolean(investment), onClose, "investment-detail-modal");

  if (!investment) return null;

  const isClaimed = investment.status === "CLAIMED";
  const isPendingApproval = investment.status === "CLAIM_REQUESTED";
  const isCancelled = investment.status === "CANCELLED";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4"
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 220 }}
          className="bg-white w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">savings</span>
              <h3 className="font-bodoni font-bold text-base text-black uppercase tracking-tight">
                Investment Transaction Details
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-black cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-center space-y-1">
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border mb-1 ${
              isClaimed
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : isPendingApproval
                ? "bg-amber-50 text-amber-600 border-amber-200"
                : isCancelled
                ? "bg-red-50 text-red-600 border-red-200"
                : "bg-green-50 text-green-600 border-green-200"
            }`}>
              {isClaimed ? "SETTLED & CREDITED" : isPendingApproval ? "PENDING" : investment.status}
            </span>
            <p className="text-xs font-bold text-gray-400 font-hanken uppercase">{investment.optionName}</p>
            <p className="font-mono font-black text-2xl text-black">
              ₦{investment.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="space-y-2 text-xs font-hanken">
            {/* Public Customer-Facing Reference */}
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-gray-400 font-semibold uppercase text-[10px]">Investment Reference</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-black text-black text-sm">
                  {investment.investmentReference || `INV-${investment.id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-8)}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const refToCopy = investment.investmentReference || `INV-${investment.id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-8)}`;
                    navigator.clipboard.writeText(refToCopy);
                    toast.success("Reference copied to clipboard!");
                  }}
                  className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold text-[9px] uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[12px]">content_copy</span>
                  <span>Copy</span>
                </button>
              </div>
            </div>

            {/* Masked Customer Support ID */}
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-gray-400 font-semibold uppercase text-[10px]">Transaction ID</span>
              <span className="font-mono font-semibold text-gray-500 text-[10.5px]">
                {investment.id.length > 20
                  ? `${investment.id.slice(0, 8)}...${investment.id.slice(-6)}`
                  : investment.id}
              </span>
            </div>

            {/* Principal Capital / Settled Value depending on status */}
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-400 font-semibold uppercase text-[10px]">
                {isClaimed
                  ? "Payout Amount / Settled Value"
                  : "Principal Amount"}
              </span>
              <span className="font-mono font-bold text-black text-sm">
                ₦{investment.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-400 font-semibold uppercase text-[10px]">Annual Interest APR</span>
              <span className="font-mono font-bold text-green-600">+{(investment.interestRate * 100).toFixed(1)}% ({investment.interestType})</span>
            </div>

            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-400 font-semibold uppercase text-[10px]">Lock Start Date</span>
              <span className="font-semibold text-gray-800">{new Date(investment.startDate).toLocaleString()}</span>
            </div>

            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-400 font-semibold uppercase text-[10px]">Maturity / Unlock Date</span>
              <span className="font-bold text-[#FC7A00]">{new Date(investment.maturityDate).toLocaleDateString()}</span>
            </div>

            {isCancelled ? (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl space-y-1 mt-2">
                <div className="flex justify-between text-red-600 font-bold">
                  <span>Early Penalty Deducted ({(penaltyRate * 100).toFixed(0)}%):</span>
                  <span className="font-mono">-₦{(investment.amount * penaltyRate).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-black font-extrabold border-t border-red-200/60 pt-1">
                  <span>Net Refunded to Wallet:</span>
                  <span className="font-mono text-emerald-600">₦{investment.totalValue?.toLocaleString() || (investment.amount * (1 - penaltyRate)).toLocaleString()}</span>
                </div>
              </div>
            ) : isClaimed ? (
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-400 font-semibold uppercase text-[10px]">Total Settled Value</span>
                <span className="font-mono font-bold text-emerald-600">₦{investment.totalValue?.toLocaleString() || investment.amount.toLocaleString()}</span>
              </div>
            ) : isPendingApproval && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-1 mt-2">
                <div className="flex justify-between text-amber-700 font-bold">
                  <span>Expected Settlement Value:</span>
                  <span className="font-mono text-amber-800">₦{investment.totalValue?.toLocaleString() || investment.amount.toLocaleString()}</span>
                </div>
                <p className="text-[10px] text-amber-600 font-semibold">
                  Payout request submitted and currently under review for administrator approval.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 bg-[#FC7A00] text-white rounded-2xl font-bold uppercase text-xs tracking-wider cursor-pointer shadow-sm active:scale-95 transition-all"
          >
            Close Details
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
