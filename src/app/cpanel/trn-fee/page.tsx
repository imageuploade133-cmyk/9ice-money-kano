"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { useAuth } from "@/lib/AuthContext";
import { TwoFactorOtpVerificationView } from "@/components/auth/TwoFactorOtpVerificationView";

const ButtonSpinner = () => (
  <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
);

function CpanelTrnFeePageContent() {
  const { isDark, toggleTheme } = useCpanelTheme();
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Settings state
  const [enableTransferFee, setEnableTransferFee] = useState(true);
  const [freeTransfersQuota, setFreeTransfersQuota] = useState(0);
  const [freeTransferResetPeriod, setFreeTransferResetPeriod] = useState<"DAILY" | "WEEKLY" | "MONTHLY" | "NEVER">("NEVER");
  const [showFreeTransfersIndicator, setShowFreeTransfersIndicator] = useState(true);
  const [flatFee, setFlatFee] = useState(10.00);
  const [waiveMarkupOnFree, setWaiveMarkupOnFree] = useState(true);

  // 2FA OTP Confirmation Modal State
  const [show2faModal, setShow2faModal] = useState(false);

  const bgClass = isDark ? "bg-[#0b0f17] text-white" : "bg-[#f8fafc] text-gray-900";
  const panelClass = isDark ? "bg-[#111827] border-gray-800" : "bg-white border-gray-200/80 shadow-xs";
  const inputClass = isDark
    ? "bg-gray-900 border-gray-800 text-white placeholder-gray-500 focus:border-[#FC7A00]"
    : "bg-gray-50 border-gray-200 text-black placeholder-gray-400 focus:border-[#FC7A00]";

  const fetchFeeSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/trn-fee");
      const data = await res.json();
      if (res.ok && data.success && data.config) {
        setEnableTransferFee(data.config.enableTransferFee !== false);
        setFreeTransfersQuota(Number(data.config.freeTransfersQuota) || 0);
        setFreeTransferResetPeriod(data.config.freeTransferResetPeriod || "NEVER");
        setShowFreeTransfersIndicator(data.config.showFreeTransfersIndicator !== false);
        setFlatFee(Number(data.config.flatFee) || 0);
        setWaiveMarkupOnFree(data.config.waiveMarkupOnFree !== false);
      } else {
        toast.error(data.error || "Failed to load Transfer Fee configuration.");
      }
    } catch {
      toast.error("Network error loading Transfer Fee settings.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFeeSettings();
  }, []);

  const handleExecuteSave = async () => {
    setShow2faModal(false);
    setIsSaving(true);
    toast.loading("Updating Transfer Fee configuration...", { id: "trn-fee" });

    try {
      const res = await fetch("/api/admin/trn-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enableTransferFee,
          freeTransfersQuota,
          freeTransferResetPeriod,
          showFreeTransfersIndicator,
          flatFee,
          waiveMarkupOnFree,
        }),
      });

      const data = await res.json();
      toast.dismiss("trn-fee");

      if (res.ok && data.success) {
        toast.success(data.message || "Transfer Fee configuration saved successfully!");
      } else {
        toast.error(data.error || "Failed to save settings.");
      }
    } catch {
      toast.dismiss("trn-fee");
      toast.error("Network error saving configuration.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn("min-h-screen p-4 md:p-8 font-hanken transition-colors duration-300", bgClass)}>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className={cn("p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4", panelClass)}>
          <div className="flex items-center gap-3">
            <Link
              href="/cpanel"
              className={cn("w-10 h-10 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">price_change</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">TRN Fee Configuration</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Toggle transfer fees ON/OFF or configure free transfer quotas for users.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className={cn("px-3 h-10 rounded-xl border font-bold text-xs flex items-center gap-2 transition-all cursor-pointer", isDark ? "bg-gray-900 border-gray-800 text-yellow-400" : "bg-gray-100 border-gray-200 text-gray-700")}
            >
              <span className="material-symbols-outlined text-[18px]">{isDark ? "light_mode" : "dark_mode"}</span>
              <span className="hidden sm:inline">{isDark ? "Light Mode" : "Dark Mode"}</span>
            </button>
            <Link
              href="/cpanel"
              className="px-4 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">dashboard</span>
              <span>Control Panel</span>
            </Link>
          </div>
        </div>

        {/* Configuration Panel */}
        {isLoading ? (
          <div className={cn("p-12 rounded-2xl border text-center flex flex-col items-center justify-center gap-3", panelClass)}>
            <ButtonSpinner />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Fee Settings...</p>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); setShow2faModal(true); }} className="space-y-6">

            {/* Global ON/OFF Fee Switch */}
            <div className={cn("p-6 rounded-2xl border space-y-4", panelClass)}>
              <div className="flex items-center justify-between border-b border-gray-200/40 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl text-[#FC7A00]">toggle_on</span>
                    <h2 className="font-extrabold text-sm uppercase tracking-tight">Global Transfer Fee Switch</h2>
                  </div>
                  <p className={cn("text-xs font-medium", isDark ? "text-gray-400" : "text-gray-500")}>
                    When OFF, all bank transfers are 100% FREE (₦0.00 fee) for all users with zero debit markup.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setEnableTransferFee(!enableTransferFee)}
                  className={cn(
                    "px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 border",
                    enableTransferFee
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                      : "bg-red-500/10 border-red-500/30 text-red-600"
                  )}
                >
                  <span className="material-symbols-outlined text-base">
                    {enableTransferFee ? "check_circle" : "cancel"}
                  </span>
                  <span>{enableTransferFee ? "FEES ENABLED (ON)" : "ALL TRANSFERS FREE (OFF)"}</span>
                </button>
              </div>

              {/* Status Notice Banner */}
              <div className={cn(
                "p-4 rounded-xl border text-xs font-semibold leading-relaxed flex items-center gap-3",
                enableTransferFee
                  ? "bg-orange-50/50 border-orange-200/80 text-orange-900"
                  : "bg-emerald-50/60 border-emerald-200/80 text-emerald-950"
              )}>
                <span className="material-symbols-outlined text-2xl shrink-0">
                  {enableTransferFee ? "info" : "verified"}
                </span>
                <div>
                  <p className="font-bold uppercase text-[11px]">
                    {enableTransferFee ? "Transfer Fee Status: Active" : "100% Free Transfer Mode Active"}
                  </p>
                  <p className="text-[11px] mt-0.5 opacity-90">
                    {enableTransferFee
                      ? "Standard transfer fees and tier markups apply, except for users with available free transfer quota."
                      : "Transfer fee is ₦0.00 NGN. Balance deductions are strictly for the transfer principal amount with zero Flutterwave fee and zero commission."}
                  </p>
                </div>
              </div>
            </div>

            {/* Free Transfer Quota Settings */}
            <div className={cn("p-6 rounded-2xl border space-y-5", panelClass)}>
              <div className="border-b border-gray-200/40 pb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-xl text-[#FC7A00]">card_giftcard</span>
                  <h2 className="font-extrabold text-sm uppercase tracking-tight">Free Transfers Quota & Reset Schedule</h2>
                </div>
                <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                  Set how many free transfers each user receives before transfer fees are charged.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Quota Input */}
                <div className="space-y-1.5">
                  <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-400 block">
                    Free Transfers Per User
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={freeTransfersQuota}
                      onChange={(e) => setFreeTransfersQuota(Math.max(0, parseInt(e.target.value) || 0))}
                      className={cn(inputClass, "w-full h-11 px-4 text-xs font-mono font-bold outline-none rounded-xl")}
                      placeholder="e.g. 3 (0 = No free quota)"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                      Transfers
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Set to 0 if users should be charged immediately without free transfers.
                  </p>
                </div>

                {/* Reset Frequency */}
                <div className="space-y-1.5">
                  <label className="text-[10.5px] font-black uppercase tracking-wider text-gray-400 block">
                    Quota Reset Frequency
                  </label>
                  <select
                    value={freeTransferResetPeriod}
                    onChange={(e: any) => setFreeTransferResetPeriod(e.target.value)}
                    className={cn(inputClass, "w-full h-11 px-4 text-xs font-bold outline-none rounded-xl cursor-pointer")}
                  >
                    <option value="NEVER">NEVER (One-time Lifetime Quota)</option>
                    <option value="DAILY">DAILY (Resets Every Midnight)</option>
                    <option value="WEEKLY">WEEKLY (Resets Every Monday)</option>
                    <option value="MONTHLY">MONTHLY (Resets 1st of Every Month)</option>
                  </select>
                  <p className="text-[10px] text-gray-400">
                    Determines how often a user&apos;s free transfer counter resets.
                  </p>
                </div>
              </div>

              {/* Show Free Transfers Indicator to User Toggle */}
              <div className="pt-3 border-t border-gray-200/40 flex items-center justify-between">
                <div>
                  <label className="text-xs font-extrabold uppercase block flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px] text-[#FC7A00]">visibility</span>
                    Show Remaining Free Transfers Indicator to User
                  </label>
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    ON/OFF toggle to show or hide the &quot;X Free Transfers Remaining&quot; badge to users on transfer modals.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFreeTransfersIndicator(!showFreeTransfersIndicator)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl font-black text-xs uppercase transition-all border cursor-pointer shrink-0 ml-3",
                    showFreeTransfersIndicator
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                      : "bg-gray-100 border-gray-200 text-gray-500"
                  )}
                >
                  {showFreeTransfersIndicator ? "INDICATOR ON" : "INDICATOR OFF"}
                </button>
              </div>

              {/* Waive Admin Commission Toggle */}
              <div className="pt-3 border-t border-gray-200/40 flex items-center justify-between">
                <div>
                  <label className="text-xs font-extrabold uppercase block">
                    Waive Commission Markup on Free Transfers
                  </label>
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    Automatically set admin commission markup to ₦0.00 when transfer is within free quota
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setWaiveMarkupOnFree(!waiveMarkupOnFree)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl font-bold text-xs uppercase transition-all border cursor-pointer shrink-0 ml-3",
                    waiveMarkupOnFree
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                      : "bg-gray-100 border-gray-200 text-gray-600"
                  )}
                >
                  {waiveMarkupOnFree ? "WAIVED (₦0.00)" : "CHARGED"}
                </button>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="w-full md:w-auto px-8 h-12 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
              >
                {isSaving ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">save</span>}
                <span>Save TRN Fee Settings</span>
              </button>
            </div>

          </form>
        )}

      </div>

      {/* 2FA OTP Confirmation Drawer */}
      <AnimatePresence>
        {show2faModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShow2faModal(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[100000]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-3xl p-6 z-[100001] space-y-4 font-hanken shadow-2xl text-black"
            >
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto" />

              <TwoFactorOtpVerificationView
                user={user}
                title="Admin Security Verification"
                description="Complete 2FA OTP verification to confirm updating global transfer fee settings."
                onVerifiedSuccess={handleExecuteSave}
                onCancel={() => setShow2faModal(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CpanelTrnFeePage() {
  return (
    <CpanelRouteGuard requiredPermission="wallets.manage">
      <CpanelTrnFeePageContent />
    </CpanelRouteGuard>
  );
}
