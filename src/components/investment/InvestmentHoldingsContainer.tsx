"use client";

import React from "react";
import { ActiveInvestment } from "./InvestmentDetailsModal";

interface InvestmentHoldingsContainerProps {
  activeHoldingTab: "ACTIVE" | "HISTORY";
  setActiveHoldingTab: (tab: "ACTIVE" | "HISTORY") => void;
  historyFilter: "ALL" | "CLAIMED" | "CANCELLED";
  setHistoryFilter: (filter: "ALL" | "CLAIMED" | "CANCELLED") => void;
  isLoadingHistory: boolean;
  investments: ActiveInvestment[];
  onSelectDetailInv: (inv: ActiveInvestment) => void;
  onOpenClaimPinModal: (invId: string) => void;
  onOpenCancelModal: (invId: string) => void;
}

export function InvestmentHoldingsContainer({
  activeHoldingTab,
  setActiveHoldingTab,
  historyFilter,
  setHistoryFilter,
  isLoadingHistory,
  investments,
  onSelectDetailInv,
  onOpenClaimPinModal,
  onOpenCancelModal,
}: InvestmentHoldingsContainerProps) {
  return (
    <div className="animate-fade-in space-y-4">
      {/* Navigation Pills */}
      <div className="flex items-center justify-between bg-gray-100 p-1.5 rounded-2xl border border-gray-200">
        <button
          type="button"
          onClick={() => setActiveHoldingTab("ACTIVE")}
          className={`flex-1 py-2.5 rounded-xl font-hanken text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeHoldingTab === "ACTIVE"
              ? "bg-white text-black shadow-xs border border-gray-200"
              : "text-gray-500 hover:text-black"
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">lock_clock</span>
          <span>Active Savings ({investments.filter((i) => i.status === "ACTIVE").length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveHoldingTab("HISTORY")}
          className={`flex-1 py-2.5 rounded-xl font-hanken text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeHoldingTab === "HISTORY"
              ? "bg-white text-black shadow-xs border border-gray-200"
              : "text-gray-500 hover:text-black"
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">history</span>
          <span>Savings History ({investments.filter((i) => i.status !== "ACTIVE").length})</span>
        </button>
      </div>

      {/* VIEW 1: ACTIVE SAVINGS */}
      {activeHoldingTab === "ACTIVE" && (
        <div className="space-y-3">
          {isLoadingHistory ? (
            <div className="flex flex-col gap-3">
              {[1, 2].map((n) => (
                <div key={n} className="skeleton-shimmer h-32 w-full rounded-2xl" />
              ))}
            </div>
          ) : investments.filter((i) => i.status === "ACTIVE").length === 0 ? (
            <div className="bg-white rounded-[24px] border border-gray-100 p-8 text-center flex flex-col items-center justify-center min-h-[160px] shadow-sm">
              <span className="material-symbols-outlined text-gray-300 text-[36px] mb-2">
                hourglass_empty
              </span>
              <p className="font-hanken text-[12px] font-bold text-black mb-1">
                No Active Savings
              </p>
              <p className="font-hanken text-[10px] text-gray-400 leading-relaxed max-w-[220px]">
                Pick a savings plan above to securely lock and grow your savings.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {investments
                .filter((inv) => inv.status === "ACTIVE")
                .map((inv) => {
                  const isMatured = new Date() >= new Date(inv.maturityDate);

                  return (
                    <div
                      key={inv.id}
                      className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm animate-fade-in hover:border-gray-300 transition-all cursor-pointer"
                      onClick={() => onSelectDetailInv(inv)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-hanken text-[8px] font-extrabold uppercase tracking-wide mb-1.5 bg-green-50 text-green-600">
                            <span className="material-symbols-outlined text-[10px]">lock</span>
                            {isMatured ? "MATURED - READY" : "ACTIVE"}
                          </span>
                          <h3 className="font-hanken text-[13px] font-extrabold text-black leading-snug">
                            {inv.optionName}
                          </h3>
                        </div>
                        <div className="text-right">
                          <span className="block font-hanken text-[14px] font-extrabold text-black font-mono">
                            ₦{inv.amount.toLocaleString()}
                          </span>
                          <span className="font-hanken text-[9.5px] text-green-600 font-extrabold font-mono">
                            +{(inv.interestRate * 100).toFixed(1)}% {inv.interestType}
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-gray-50 pt-2.5 flex items-center justify-between">
                        <div>
                          <span className="block font-hanken text-[8.5px] text-gray-400 font-bold uppercase tracking-wide">
                            Start Date
                          </span>
                          <span className="font-hanken text-[10px] font-semibold text-gray-600">
                            {new Date(inv.startDate).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="block font-hanken text-[8.5px] text-gray-400 font-bold uppercase tracking-wide">
                            Maturity Date
                          </span>
                          <span className="font-hanken text-[10px] font-extrabold text-[#FC7A00]">
                            {new Date(inv.maturityDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Live Lock Completion Progress Bar & Daily Earnings */}
                      {(() => {
                        const startMs = new Date(inv.startDate).getTime();
                        const matMs = new Date(inv.maturityDate).getTime();
                        const nowMs = Date.now();
                        const totalMs = Math.max(1, matMs - startMs);
                        const elapsedMs = Math.max(0, Math.min(totalMs, nowMs - startMs));
                        const progressPct = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));

                        const principal = Number(inv.amount) || 0;
                        const apr = Number(inv.interestRate) || 0;
                        const dailyReturn = (principal * apr) / 365;
                        const totalEarnedSoFar = (principal * apr) * (elapsedMs / (365 * 24 * 60 * 60 * 1000));

                        return (
                          <div className="mt-3 pt-2.5 border-t border-gray-100 space-y-2">
                            <div className="flex items-center justify-between text-[10.5px] font-hanken">
                              <span className="font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                <span className="material-symbols-outlined text-[13px] text-[#FC7A00]">
                                  trending_up
                                </span>
                                Earned: <span className="text-emerald-600 font-extrabold font-mono">+₦{totalEarnedSoFar.toFixed(2)}</span>
                              </span>
                              <span className="font-extrabold text-emerald-600 font-mono bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                                +₦{dailyReturn.toFixed(2)}/day
                              </span>
                            </div>

                            {/* Progress Bar from 0% to 100% based on Unlock Date */}
                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-[9.5px] font-hanken font-bold">
                                <span className="text-gray-400 uppercase tracking-wider">Unlock Progress</span>
                                <span className="text-[#FC7A00] font-extrabold font-mono">{progressPct}% Full</span>
                              </div>
                              <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden border border-gray-200/60 p-0.5">
                                <div
                                  className="bg-gradient-to-r from-[#FC7A00] to-amber-400 h-full rounded-full transition-all duration-500 shadow-xs"
                                  style={{ width: `${Math.max(3, progressPct)}%` }}
                                />
                              </div>
                            </div>

                            <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                              {inv.status === "CLAIM_REQUESTED" ? (
                                <div className="w-full py-2 bg-amber-500/10 border border-amber-500/30 text-amber-600 rounded-xl font-hanken text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-1.5">
                                  <span className="material-symbols-outlined text-[14px] animate-spin">hourglass_empty</span>
                                  Payout Requested • Pending Approval
                                </div>
                              ) : isMatured ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenClaimPinModal(inv.id)}
                                  className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-hanken text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[14px]">payments</span>
                                  Request Matured Payout
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onOpenCancelModal(inv.id)}
                                  className="w-full py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-hanken text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer"
                                >
                                  Liquidate Early
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: SAVINGS HISTORY */}
      {activeHoldingTab === "HISTORY" && (
        <div className="space-y-3">
          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {(["ALL", "CLAIMED", "CANCELLED"] as const).map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setHistoryFilter(chip)}
                className={`px-3 py-1 rounded-full font-hanken text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  historyFilter === chip
                    ? "bg-black text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {chip === "CLAIMED" ? "Settled" : chip}
              </button>
            ))}
          </div>

          {isLoadingHistory ? (
            <div className="flex flex-col gap-3">
              {[1, 2].map((n) => (
                <div key={n} className="skeleton-shimmer h-28 w-full rounded-2xl" />
              ))}
            </div>
          ) : investments.filter((i) => {
              if (i.status === "ACTIVE") return false;
              if (historyFilter === "CLAIMED") return i.status === "CLAIMED";
              if (historyFilter === "CANCELLED") return i.status === "CANCELLED";
              return true;
            }).length === 0 ? (
            <div className="bg-white rounded-[24px] border border-gray-100 p-8 text-center flex flex-col items-center justify-center min-h-[160px] shadow-sm">
              <span className="material-symbols-outlined text-gray-300 text-[36px] mb-2">
                history
              </span>
              <p className="font-hanken text-[12px] font-bold text-black mb-1">
                No Investment History Found
              </p>
              <p className="font-hanken text-[10px] text-gray-400 leading-relaxed max-w-[220px]">
                Pending requests, completed payouts, and early cancellations will appear here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {investments
                .filter((inv) => {
                  if (inv.status === "ACTIVE") return false;
                  if (historyFilter === "CLAIMED") return inv.status === "CLAIMED";
                  if (historyFilter === "CANCELLED") return inv.status === "CANCELLED";
                  return true;
                })
                .map((inv) => {
                  const isClaimed = inv.status === "CLAIMED";
                  const isPendingApproval = inv.status === "CLAIM_REQUESTED";
                  const isCancelled = inv.status === "CANCELLED";

                  return (
                    <div
                      key={inv.id}
                      onClick={() => onSelectDetailInv(inv)}
                      className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm animate-fade-in hover:border-gray-300 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-hanken text-[8.5px] font-black uppercase tracking-wider mb-1.5 border ${
                            isClaimed
                              ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                              : isPendingApproval
                              ? "bg-amber-50 text-amber-600 border-amber-200"
                              : isCancelled
                              ? "bg-red-50 text-red-600 border-red-200"
                              : "bg-gray-50 text-gray-600 border-gray-200"
                          }`}>
                            <span className="material-symbols-outlined text-[10px]">
                              {isClaimed
                                ? "check_circle"
                                : isPendingApproval
                                ? "hourglass_empty"
                                : "cancel"}
                            </span>
                            {isClaimed
                              ? "SETTLED & CREDITED"
                              : isPendingApproval
                              ? "PENDING"
                              : inv.status}
                          </span>
                          <h3 className="font-hanken text-[13px] font-extrabold text-black leading-snug">
                            {inv.optionName}
                          </h3>
                        </div>
                        <div className="text-right">
                          <span className="block font-hanken text-[14px] font-extrabold text-black font-mono">
                            ₦{inv.amount.toLocaleString()}
                          </span>
                          <span className={`font-hanken text-[9.5px] font-extrabold font-mono ${
                            isCancelled
                              ? "text-red-500 line-through"
                              : isPendingApproval
                              ? "text-amber-600"
                              : "text-emerald-600"
                          }`}>
                            {isCancelled
                              ? "Canceled Lock"
                              : isPendingApproval
                              ? `Pending Approval: ₦${inv.totalValue?.toLocaleString() || inv.amount.toLocaleString()}`
                              : `Settled & Credited: ₦${inv.totalValue?.toLocaleString() || inv.amount.toLocaleString()}`}
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-gray-50 pt-2 flex items-center justify-between text-[9.5px] font-hanken text-gray-500 font-semibold">
                        <span>Locked: {new Date(inv.startDate).toLocaleDateString()}</span>
                        <span className="text-[#FC7A00] font-extrabold flex items-center gap-1">
                          <span>View Details</span>
                          <span className="material-symbols-outlined text-[12px]">chevron_right</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
