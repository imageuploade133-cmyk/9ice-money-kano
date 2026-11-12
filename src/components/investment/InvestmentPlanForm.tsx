"use client";

import React from "react";
import { toast } from "sonner";
import { SavingsPlanData } from "@/lib/savings-plans-types";

interface InvestmentPlanFormProps {
  plans: SavingsPlanData[];
  selectedPlanId: string;
  setSelectedPlanId: (id: string) => void;
  selectedPlan: SavingsPlanData;
  isLoadingPlans: boolean;
  allowBonusInvestment: boolean;
  walletTypeSelected: "MAIN" | "BONUS";
  setWalletTypeSelected: (type: "MAIN" | "BONUS") => void;
  mainBalance: number;
  bonusBalance: number;
  userBalance: number;
  unlockMode: "MONTHS" | "YEARS" | "CUSTOM";
  setUnlockMode: (mode: "MONTHS" | "YEARS" | "CUSTOM") => void;
  selectedMonth: number;
  setSelectedMonth: (m: number) => void;
  selectedYear: number;
  setSelectedYear: (y: number) => void;
  customMaturityDate: string;
  calculatedMaturityDateObj: Date;
  calculatedLockDays: number;
  onOpenCalendar: () => void;
  amountStr: string;
  setAmountStr: (amt: string) => void;
  getEstimatedReward: () => number;
  onPrevalidate: (e: React.FormEvent) => void;
}

export function InvestmentPlanForm({
  plans,
  selectedPlanId,
  setSelectedPlanId,
  selectedPlan,
  isLoadingPlans,
  allowBonusInvestment,
  walletTypeSelected,
  setWalletTypeSelected,
  mainBalance,
  bonusBalance,
  userBalance,
  unlockMode,
  setUnlockMode,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
  customMaturityDate,
  calculatedMaturityDateObj,
  calculatedLockDays,
  onOpenCalendar,
  amountStr,
  setAmountStr,
  getEstimatedReward,
  onPrevalidate,
}: InvestmentPlanFormProps) {
  return (
    <form onSubmit={onPrevalidate} className="bg-white rounded-[24px] border border-gray-100 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] mb-6 animate-fade-in">
      <h2 className="font-bodoni text-[15px] font-bold text-black mb-4 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-primary text-[18px]">
          savings
        </span>
        CHOOSE YOUR SAVINGS PLAN
      </h2>

      {/* Sourcing Wallet */}
      {allowBonusInvestment && (
        <div className="mb-5">
          <label className="block font-hanken text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
            Select Sourcing Wallet
          </label>
          <div className="grid grid-cols-2 gap-2 bg-gray-50 p-1 rounded-2xl border border-gray-100">
            <button
              type="button"
              onClick={() => setWalletTypeSelected("MAIN")}
              className={`py-3 rounded-xl font-hanken text-[11px] font-bold transition-all cursor-pointer ${
                walletTypeSelected === "MAIN"
                  ? "bg-black text-white shadow-md"
                  : "text-gray-500 hover:text-black"
              }`}
            >
              Main (₦{mainBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })})
            </button>
            <button
              type="button"
              onClick={() => {
                if (!allowBonusInvestment) {
                  toast.error("Bonus wallet investment is currently Unavailable at this time");
                  return;
                }
                setWalletTypeSelected("BONUS");
              }}
              className={`py-3 rounded-xl font-hanken text-[11px] font-bold transition-all cursor-pointer ${
                walletTypeSelected === "BONUS"
                  ? "bg-black text-white shadow-md"
                  : "text-gray-500 hover:text-black"
              }`}
            >
              Bonus (₦{bonusBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })})
            </button>
          </div>
        </div>
      )}

      {/* Dynamic Plans Grid */}
      <label className="block font-hanken text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2.5">
        Savings Plans
      </label>

      {isLoadingPlans ? (
        <div className="flex flex-col gap-2 mb-5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="skeleton-shimmer h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 mb-5">
          {plans.map((plan) => {
            const isSelected = selectedPlanId === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => {
                  setSelectedPlanId(plan.id);
                  setAmountStr("");
                }}
                className={`flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? "border-primary bg-[#FFF9F5] shadow-sm"
                    : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl border border-gray-200 bg-white p-1 flex items-center justify-center overflow-hidden flex-shrink-0 relative shadow-2xs">
                    <img
                      src={plan.logoUrl || "https://i.ibb.co/WWjZrtC7/E-Tech.png"}
                      alt={plan.name}
                      className="w-full h-full object-contain p-0.5"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-hanken text-[12.5px] font-bold text-black leading-snug">
                        {plan.name}
                      </h3>
                      {plan.badgeTag && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-orange-500/10 text-orange-500 border border-orange-500/20">
                          {plan.badgeTag}
                        </span>
                      )}
                    </div>
                    <p className="font-hanken text-[10px] text-gray-500 font-semibold uppercase mt-0.5">
                      {plan.type} • {plan.interestType}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="block font-hanken text-[14.5px] font-extrabold text-primary">
                    {plan.apr}% APR
                  </span>
                  <span className="font-hanken text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                    Interest Rate
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Plan Description */}
      {selectedPlan && (
        <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 mb-5">
          <p className="font-hanken text-[10.5px] text-gray-600 leading-relaxed font-medium">
            {selectedPlan.description || "Lock capital securely and earn high guaranteed interest."}
          </p>
        </div>
      )}

      {/* "WHEN DO YOU WANT TO UNLOCK YOUR SAVINGS" CONFIGURABLE SECTION */}
      <div className="mb-5 p-4 rounded-2xl bg-orange-50/40 border border-orange-100 space-y-3">
        <label className="block font-hanken text-[11px] font-black text-black uppercase tracking-wider">
          WHEN DO YOU WANT TO UNLOCK YOUR SAVINGS?
        </label>

        {/* Mode Toggle Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-white rounded-xl border border-gray-200/80">
          {selectedPlan?.allowMonths && (
            <button
              type="button"
              onClick={() => setUnlockMode("MONTHS")}
              className={`py-2 text-[10.5px] font-extrabold uppercase rounded-lg transition-all cursor-pointer ${
                unlockMode === "MONTHS" ? "bg-primary text-white shadow-2xs" : "text-gray-500 hover:text-black"
              }`}
            >
              By Month
            </button>
          )}

          {selectedPlan?.allowYears && (
            <button
              type="button"
              onClick={() => setUnlockMode("YEARS")}
              className={`py-2 text-[10.5px] font-extrabold uppercase rounded-lg transition-all cursor-pointer ${
                unlockMode === "YEARS" ? "bg-primary text-white shadow-2xs" : "text-gray-500 hover:text-black"
              }`}
            >
              By Year
            </button>
          )}

          {selectedPlan?.allowCustom && (
            <button
              type="button"
              onClick={() => setUnlockMode("CUSTOM")}
              className={`py-2 text-[10.5px] font-extrabold uppercase rounded-lg transition-all cursor-pointer ${
                unlockMode === "CUSTOM" ? "bg-primary text-white shadow-2xs" : "text-gray-500 hover:text-black"
              }`}
            >
              Custom Date
            </button>
          )}
        </div>

        {/* MODE 1: MONTHS PRESETS */}
        {unlockMode === "MONTHS" && selectedPlan?.allowMonths && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Select Month Duration:</p>
            <div className="grid grid-cols-4 gap-2">
              {(selectedPlan.monthOptions || [1, 3, 6, 9]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedMonth(m)}
                  className={`py-2.5 rounded-xl text-xs font-extrabold font-mono transition-all border cursor-pointer ${
                    selectedMonth === m
                      ? "bg-black border-black text-white shadow-2xs"
                      : "bg-white border-gray-200 text-gray-700 hover:border-black"
                  }`}
                >
                  {m} {m === 1 ? "Month" : "Months"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MODE 2: YEARS PRESETS */}
        {unlockMode === "YEARS" && selectedPlan?.allowYears && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Select Year Duration:</p>
            <div className="grid grid-cols-3 gap-2">
              {(selectedPlan.yearOptions || [1, 2, 3]).map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setSelectedYear(y)}
                  className={`py-2.5 rounded-xl text-xs font-extrabold font-mono transition-all border cursor-pointer ${
                    selectedYear === y
                      ? "bg-black border-black text-white shadow-2xs"
                      : "bg-white border-gray-200 text-gray-700 hover:border-black"
                  }`}
                >
                  {y} {y === 1 ? "Year" : "Years"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MODE 3: CUSTOM CALENDAR */}
        {unlockMode === "CUSTOM" && selectedPlan?.allowCustom && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Custom Date (Min {selectedPlan.minCustomDays || 7} Days - Max {selectedPlan.maxCustomDays || 1095} Days):
            </p>
            <button
              type="button"
              onClick={onOpenCalendar}
              className="w-full text-left px-4 py-3 bg-white border border-black rounded-xl flex items-center justify-between shadow-2xs active:scale-98 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-primary">
                  calendar_month
                </span>
                <span className="font-hanken text-xs font-semibold text-black">
                  {customMaturityDate
                    ? new Date(customMaturityDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
                    : "Tap to Select Custom Unlock Date"
                  }
                </span>
              </div>
              <span className="material-symbols-outlined text-[16px] text-gray-400">
                chevron_right
              </span>
            </button>
          </div>
        )}

        <div className="flex justify-between items-center text-xs font-bold pt-1 border-t border-orange-200/60">
          <span className="text-gray-500">Target Unlock Date:</span>
          <span className="text-primary font-mono font-black">{calculatedMaturityDateObj.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} ({calculatedLockDays} Days)</span>
        </div>
      </div>

      {/* Form Fields: Amount */}
      <div className="mb-4">
        <label className="block font-hanken text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
          How much do you want to save? (₦) {selectedPlan.isAmountRequired ? "*" : "(Optional)"}
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-hanken text-[14px] font-bold text-gray-400">
            ₦
          </span>
          <input
            type="number"
            placeholder={`Min ₦${selectedPlan.minInvestment?.toLocaleString()} - Max ₦${selectedPlan.maxInvestment?.toLocaleString()}`}
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="w-full pl-8 pr-12 py-3.5 bg-white border border-black rounded-2xl text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
          />
          <button
            type="button"
            onClick={() => setAmountStr(userBalance.toFixed(0))}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 font-hanken text-[10px] font-extrabold text-primary bg-[#FFF0E0] px-2 py-1 rounded-md active:scale-95 transition-all cursor-pointer"
          >
            MAX
          </button>
        </div>
      </div>

      {/* Live Reward Calculation Summary */}
      {amountStr && (
        <div className="mb-5 p-4 rounded-xl bg-gradient-to-r from-[#FFFBF7] to-[#FFF7EF] border border-[#FFECD8] animate-fade-in">
          <p className="font-hanken text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">
            Estimated Yield Calculation
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block font-hanken text-[9px] text-gray-500 font-bold">Extra Interest You Earn</span>
              <span className="font-hanken text-[15px] font-extrabold text-green-600">
                +₦{getEstimatedReward().toLocaleString()}
              </span>
            </div>
            <div>
              <span className="block font-hanken text-[9px] text-gray-500 font-bold">Time Locked</span>
              <span className="font-hanken text-[13px] font-extrabold text-black">
                {calculatedLockDays} Days
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Action Trigger Button */}
      <button
        type="submit"
        className="w-full py-3.5 bg-primary text-white rounded-xl font-hanken text-[13px] font-bold tracking-wide active:scale-98 transition-all hover:bg-primary-dark shadow-[0_4px_15px_rgba(252,122,0,0.15)] flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <span className="material-symbols-outlined text-[18px]">
          verified
        </span>
        Confirm & Start Savings
      </button>
    </form>
  );
}
