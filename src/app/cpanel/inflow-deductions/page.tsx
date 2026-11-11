"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { TwoFactorOtpVerificationView } from "@/components/auth/TwoFactorOtpVerificationView";
import { useAuth } from "@/lib/AuthContext";

export default function AutoInflowDeductionPage() {
  const { isDark } = useCpanelTheme();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [minThreshold, setMinThreshold] = useState(1000);
  const [chargeType, setChargeType] = useState<"FIXED" | "PERCENTAGE">("FIXED");
  const [feeAmount, setFeeAmount] = useState(50);
  const [maxFeeCap, setMaxFeeCap] = useState(1000);
  const [feeNarration, setFeeNarration] = useState("Stamp Duty Charge");
  const [exemptVirtualAccounts, setExemptVirtualAccounts] = useState(false);

  // Sample deposit amount for live calculation preview
  const [sampleDeposit, setSampleDeposit] = useState(10000);

  // 2FA OTP Modal
  const [showOtpModal, setShowOtpModal] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/inflow-deductions");
      const data = await res.json();
      if (data.success && data.config) {
        setEnabled(!!data.config.enabled);
        setMinThreshold(Number(data.config.minThreshold) || 1000);
        setChargeType(data.config.chargeType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED");
        setFeeAmount(Number(data.config.feeAmount) || 50);
        setMaxFeeCap(Number(data.config.maxFeeCap) || 0);
        setFeeNarration(data.config.feeNarration || "Stamp Duty Charge");
        setExemptVirtualAccounts(!!data.config.exemptVirtualAccounts);
      }
    } catch {
      toast.error("Failed to load inflow fee configuration.");
    } finally {
      setLoading(false);
    }
  };

  // Compute calculated sample fee
  const calculateSampleFee = () => {
    if (!enabled || sampleDeposit < minThreshold) return 0;
    if (chargeType === "FIXED") return feeAmount;
    let fee = (sampleDeposit * feeAmount) / 100;
    if (maxFeeCap > 0 && fee > maxFeeCap) fee = maxFeeCap;
    return Math.round(fee * 100) / 100;
  };

  const sampleFee = calculateSampleFee();
  const sampleNetCredit = Math.max(0, sampleDeposit - sampleFee);

  const handleSaveTrigger = (e: React.FormEvent) => {
    e.preventDefault();
    setShowOtpModal(true);
  };

  const executeSaveSettings = async () => {
    setShowOtpModal(false);
    setSaving(true);
    toast.loading("Saving Automatic Inflow Fee Configuration...");

    try {
      const res = await fetch("/api/admin/inflow-deductions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          minThreshold,
          chargeType,
          feeAmount,
          maxFeeCap,
          feeNarration,
          exemptVirtualAccounts,
        }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || "Auto Inflow Fee settings saved successfully!");
      } else {
        toast.error(data.error || "Failed to save settings.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network communication failure saving settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("p-4 md:p-8 space-y-6 max-w-5xl mx-auto font-hanken", isDark ? "text-gray-100" : "text-gray-900")}>
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 border-gray-200 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-3xl text-[#FC7A00]">payments</span>
            <h1 className="font-extrabold text-2xl tracking-tight">Auto Inflow Fee &amp; Stamp Duty</h1>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-semibold">
            Automatically deduct statutory charges (e.g. NIBSS Stamp Duty) when incoming deposits arrive on customer accounts.
          </p>
        </div>

        <button
          type="submit"
          form="inflow-fee-form"
          disabled={saving || loading}
          className="px-6 py-3 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 shrink-0 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">save</span>
          <span>{saving ? "Saving..." : "Save Settings"}</span>
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center space-y-3">
          <span className="material-symbols-outlined text-4xl text-[#FC7A00] animate-spin">progress_activity</span>
          <p className="text-xs font-bold text-gray-500">Loading Inflow Fee Configuration...</p>
        </div>
      ) : (
        <form id="inflow-fee-form" onSubmit={handleSaveTrigger} className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Left Column: Form Controls */}
          <div className="md:col-span-2 space-y-6">

            {/* Master Enable/Disable Toggle */}
            <div className={cn(
              "p-6 rounded-3xl border transition-all flex items-center justify-between gap-4 shadow-xs",
              enabled
                ? "bg-orange-50/50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900/40"
                : isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
            )}>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={cn("material-symbols-outlined text-2xl font-bold", enabled ? "text-[#FC7A00]" : "text-gray-400")}>
                    {enabled ? "check_circle" : "cancel"}
                  </span>
                  <h3 className="font-extrabold text-sm uppercase tracking-wider">
                    {enabled ? "Auto Inflow Fee Enabled" : "Auto Inflow Fee Disabled"}
                  </h3>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold leading-relaxed">
                  When enabled, eligible incoming wallet deposits above the minimum threshold will automatically be assessed the configured fee.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEnabled(!enabled)}
                className={cn(
                  "w-14 h-8 rounded-full transition-colors relative cursor-pointer shrink-0 p-1",
                  enabled ? "bg-[#FC7A00]" : "bg-gray-300 dark:bg-gray-700"
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded-full bg-white transition-transform shadow-xs",
                  enabled ? "translate-x-6" : "translate-x-0"
                )} />
              </button>
            </div>

            {/* Main Config Card */}
            <div className={cn("p-6 rounded-3xl border space-y-5 shadow-xs", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200")}>
              <h3 className="font-extrabold text-xs uppercase tracking-widest text-[#FC7A00]">
                Deduction Rules &amp; Thresholds
              </h3>

              {/* Fee Narration / Label */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-gray-400 tracking-wider">Fee Label / Narration *</label>
                <input
                  type="text"
                  required
                  value={feeNarration}
                  onChange={(e) => setFeeNarration(e.target.value)}
                  placeholder="e.g. Stamp Duty Charge"
                  className={cn(
                    "w-full rounded-2xl px-4 py-3.5 text-xs font-bold outline-none border transition-all",
                    isDark ? "bg-gray-800 border-gray-700 text-white focus:border-[#FC7A00]" : "bg-gray-50 border-gray-200 text-gray-900 focus:border-[#FC7A00]"
                  )}
                />
                <p className="text-[10px] text-gray-400 font-medium">Displayed on customer receipts and transaction ledger history.</p>
              </div>

              {/* Minimum Threshold Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase text-gray-400 tracking-wider">Minimum Inflow Threshold (₦) *</label>
                  <div className="flex gap-1.5">
                    {[1000, 5000, 10000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setMinThreshold(preset)}
                        className="px-2.5 py-1 text-[10px] font-bold rounded-lg border border-gray-200 dark:border-gray-700 hover:border-[#FC7A00] transition-all cursor-pointer"
                      >
                        ₦{preset.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  required
                  min={0}
                  value={minThreshold}
                  onChange={(e) => setMinThreshold(Math.max(0, Number(e.target.value)))}
                  className={cn(
                    "w-full rounded-2xl px-4 py-3.5 text-xs font-mono font-bold outline-none border transition-all",
                    isDark ? "bg-gray-800 border-gray-700 text-white focus:border-[#FC7A00]" : "bg-gray-50 border-gray-200 text-gray-900 focus:border-[#FC7A00]"
                  )}
                />
                <p className="text-[10px] text-gray-400 font-medium">Deposits strictly LESS than this amount will NOT be charged.</p>
              </div>

              {/* Charge Type Toggle */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-gray-400 tracking-wider">Charge Model *</label>
                <div className="grid grid-cols-2 gap-3 p-1.5 bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setChargeType("FIXED")}
                    className={cn(
                      "py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border",
                      chargeType === "FIXED"
                        ? "bg-[#FC7A00] border-[#FC7A00] text-white shadow-xs"
                        : "bg-transparent border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"
                    )}
                  >
                    Fixed Amount (e.g. ₦50)
                  </button>

                  <button
                    type="button"
                    onClick={() => setChargeType("PERCENTAGE")}
                    className={cn(
                      "py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border",
                      chargeType === "PERCENTAGE"
                        ? "bg-[#FC7A00] border-[#FC7A00] text-white shadow-xs"
                        : "bg-transparent border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white"
                    )}
                  >
                    Percentage (%)
                  </button>
                </div>
              </div>

              {/* Fee Amount Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-gray-400 tracking-wider">
                  {chargeType === "FIXED" ? "Fixed Fee Amount (₦) *" : "Percentage Fee Rate (%) *"}
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step={chargeType === "PERCENTAGE" ? "0.01" : "1"}
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(Math.max(0, Number(e.target.value)))}
                  className={cn(
                    "w-full rounded-2xl px-4 py-3.5 text-xs font-mono font-bold outline-none border transition-all",
                    isDark ? "bg-gray-800 border-gray-700 text-white focus:border-[#FC7A00]" : "bg-gray-50 border-gray-200 text-gray-900 focus:border-[#FC7A00]"
                  )}
                />
              </div>

              {/* Maximum Cap for Percentage */}
              {chargeType === "PERCENTAGE" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-gray-400 tracking-wider">Maximum Cap (₦) (0 = No Cap)</label>
                  <input
                    type="number"
                    min={0}
                    value={maxFeeCap}
                    onChange={(e) => setMaxFeeCap(Math.max(0, Number(e.target.value)))}
                    className={cn(
                      "w-full rounded-2xl px-4 py-3.5 text-xs font-mono font-bold outline-none border transition-all",
                      isDark ? "bg-gray-800 border-gray-700 text-white focus:border-[#FC7A00]" : "bg-gray-50 border-gray-200 text-gray-900 focus:border-[#FC7A00]"
                    )}
                  />
                  <p className="text-[10px] text-gray-400 font-medium">Upper limit on the fee charge regardless of total deposit size.</p>
                </div>
              )}

            </div>
          </div>

          {/* Right Column: Live Calculator Preview */}
          <div className="space-y-6">
            <div className={cn("p-6 rounded-3xl border space-y-5 shadow-xs sticky top-6", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200")}>
              <div className="flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
                <span className="material-symbols-outlined text-[#FC7A00] text-xl">calculate</span>
                <h3 className="font-extrabold text-xs uppercase tracking-wider">Live Simulation Preview</h3>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Test Incoming Deposit Amount (₦)</label>
                <input
                  type="number"
                  min={1}
                  value={sampleDeposit}
                  onChange={(e) => setSampleDeposit(Math.max(1, Number(e.target.value)))}
                  className={cn(
                    "w-full rounded-2xl px-4 py-3 text-xs font-mono font-bold outline-none border",
                    isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-200 text-gray-900"
                  )}
                />
              </div>

              {/* Breakdown Card */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 space-y-3 text-xs">
                <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
                  <span>Gross Deposit</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-white">₦{sampleDeposit.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-center text-[#FC7A00] font-bold border-b pb-2 border-gray-200 dark:border-gray-700">
                  <span>{feeNarration} ({enabled ? (sampleDeposit >= minThreshold ? "Charged" : "Below Min Threshold") : "Disabled"})</span>
                  <span className="font-mono font-black">-₦{sampleFee.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-center pt-1 font-black text-sm">
                  <span className="text-gray-900 dark:text-white">Net Credited Balance</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">₦{sampleNetCredit.toLocaleString()}</span>
                </div>
              </div>

              <div className="p-3 bg-orange-50/50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 rounded-2xl text-[11px] text-orange-800 dark:text-orange-300 space-y-1 font-medium leading-relaxed">
                <p className="font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">bolt</span>
                  Zero Read Overhead
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  Auto inflow rules are cached in-memory for 60s along with global tier limits, costing 0 additional Firestore document reads during deposits.
                </p>
              </div>
            </div>
          </div>

        </form>
      )}

      {/* 2FA OTP Modal */}
      {showOtpModal && (
        <div className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl p-6 text-center shadow-2xl border border-gray-100 dark:border-gray-800"
          >
            <TwoFactorOtpVerificationView
              user={user}
              title="Confirm Auto Inflow Fee Changes"
              description="Verify 2FA Security OTP to apply automatic inflow fee / stamp duty settings."
              onVerifiedSuccess={executeSaveSettings}
              onCancel={() => setShowOtpModal(false)}
            />
          </motion.div>
        </div>
      )}
    </div>
  );
}
