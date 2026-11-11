"use client";

import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAppConfig } from "@/lib/ConfigContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";

const ButtonSpinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

function AdminDashboardContent() {
  const { config, syncRealFirebaseData } = useAppConfig();

  // Dark/Light Theme state
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const syncTheme = () => {
      if (typeof window !== "undefined") {
        const cached = localStorage.getItem("cpanel_theme");
        if (cached === "dark" || cached === "light") {
          setTheme(cached);
        }
      }
    };

    syncTheme();

    const handleThemeChange = () => syncTheme();
    window.addEventListener("cpanel_theme_change", handleThemeChange);
    window.addEventListener("storage", handleThemeChange);

    return () => {
      window.removeEventListener("cpanel_theme_change", handleThemeChange);
      window.removeEventListener("storage", handleThemeChange);
    };
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      if (typeof window !== "undefined") {
        localStorage.setItem("cpanel_theme", next);
        window.dispatchEvent(new Event("cpanel_theme_change"));
      }
      return next;
    });
  };

  const isDark = theme === "dark";
  const [isSyncingFirebase, setIsSyncingFirebase] = useState(false);

  // Automatically sync metrics on mount
  useEffect(() => {
    syncRealFirebaseData();
  }, []);

  const handleRefreshFirebaseMetrics = async () => {
    setIsSyncingFirebase(true);
    toast.loading("Querying real-time database metrics...");
    try {
      await syncRealFirebaseData();
      toast.dismiss();
      toast.success("All pool balances and daily payout metrics recalculated!");
    } catch {
      toast.dismiss();
      toast.error("Failed to query live metrics.");
    } finally {
      setIsSyncingFirebase(false);
    }
  };

  const todayNet = config.todayNetFlow ?? ((config.todayDeposit || 0) - (config.todayPayout || 0));

  return (
    <div className={cn("min-h-full font-hanken transition-colors duration-300", isDark ? "bg-gray-950 text-gray-100" : "bg-gray-50 text-gray-800")}>
      {/* Header Bar */}
      <div className={cn(
        "flex justify-between items-center px-6 md:px-8 py-5 border-b transition-colors duration-300",
        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
      )}>
        <div>
          <h2 className={cn("font-hanken font-extrabold text-lg sm:text-xl", isDark ? "text-white" : "text-gray-900")}>
            Platform Operations & Metrics
          </h2>
          <p className="text-xs text-gray-400 font-semibold uppercase mt-0.5 tracking-wider font-hanken">
            Enterprise System Suite Dashboard
          </p>
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 duration-300",
            isDark
              ? "bg-gray-800 border-gray-700 text-yellow-400 hover:bg-gray-700"
              : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-black"
          )}
        >
          <span className="material-symbols-outlined text-[16px]">
            {isDark ? "light_mode" : "dark_mode"}
          </span>
          <span className="hidden sm:inline">{isDark ? "Light Mode" : "Dark Mode"}</span>
        </button>
      </div>

      {/* Main Workspace */}
      <div className="p-4 md:p-8 max-w-7xl w-full mx-auto space-y-8 pb-24 md:pb-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Live Sync Banner */}
          <div className={cn(
            "flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl p-5 gap-4 border transition-colors duration-300 shadow-xs",
            isDark ? "bg-orange-950/20 border-orange-900/40 text-white" : "bg-orange-50/80 border-orange-200 text-black"
          )}>
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-sm animate-pulse">published_with_changes</span>
                <h4 className={cn("font-extrabold text-xs uppercase tracking-wider", isDark ? "text-orange-400" : "text-gray-900")}>
                  Real-time Database Recalculation
                </h4>
              </div>
              <p className={cn("text-[11px] font-semibold mt-1", isDark ? "text-gray-400" : "text-gray-600")}>
                Recalculate total registered accounts, multi-currency pool reserves (NGN, USD, XOF), and today&apos;s payouts directly from database.
              </p>
            </div>
            <button
              type="button"
              disabled={isSyncingFirebase}
              onClick={handleRefreshFirebaseMetrics}
              className="px-5 py-2.5 bg-[#FC7A00] hover:bg-[#e06600] text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap self-start sm:self-auto shadow-md active:scale-95 flex items-center justify-center gap-2"
            >
              {isSyncingFirebase ? <><ButtonSpinner /> Recalculating Metrics...</> : (
                <>
                  <span className="material-symbols-outlined text-sm">sync</span>
                  <span>Sync Database Metrics</span>
                </>
              )}
            </button>
          </div>

          {/* SECTION 1: DEDICATED POOL BALANCES (3 CURRENCY POOLS) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className={cn("font-extrabold text-sm uppercase tracking-wider flex items-center gap-2", isDark ? "text-white" : "text-gray-900")}>
                  <span className="material-symbols-outlined text-[#FC7A00] text-lg">account_balance</span>
                  <span>Global User Wallet Pool Reserves</span>
                </h3>
                <p className={cn("text-[11px] font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                  Total liquidity deposited and currently held across all user wallets.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Pool Card 1: NGN Balance */}
              <div className="relative group overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 rounded-2xl p-6 border border-emerald-400/40 text-white shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform pointer-events-none" />
                <div className="flex justify-between items-start relative z-10">
                  <div className="min-w-0 flex-1 pr-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/20 text-[9px] font-black uppercase tracking-wider text-emerald-100">
                      <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                      NGN Currency Pool
                    </span>
                    <p className="font-mono text-2xl sm:text-3xl font-black mt-3 leading-none tracking-tight break-all">
                      ₦{(config.globalNgnBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-[10px] text-emerald-100 font-bold uppercase tracking-wider">
                      <span>Naira Reserve Holdings</span>
                      <span className="font-mono text-white font-black">100% Verified</span>
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-white shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-[26px]">payments</span>
                  </div>
                </div>
              </div>

              {/* Pool Card 2: USD Reserves */}
              <div className="relative group overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 rounded-2xl p-6 border border-indigo-400/40 text-white shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform pointer-events-none" />
                <div className="flex justify-between items-start relative z-10">
                  <div className="min-w-0 flex-1 pr-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/20 text-[9px] font-black uppercase tracking-wider text-indigo-100">
                      <span className="w-2 h-2 rounded-full bg-indigo-300 animate-pulse" />
                      USD Currency Pool
                    </span>
                    <p className="font-mono text-2xl sm:text-3xl font-black mt-3 leading-none tracking-tight break-all">
                      ${(config.globalUsdBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-[10px] text-indigo-100 font-bold uppercase tracking-wider">
                      <span>Dollar Reserve Pool</span>
                      <span className="font-mono text-white font-black">100% Verified</span>
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-white shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-[26px]">credit_card</span>
                  </div>
                </div>
              </div>

              {/* Pool Card 3: XOF Reserves */}
              <div className="relative group overflow-hidden bg-gradient-to-br from-amber-600 via-orange-600 to-amber-700 rounded-2xl p-6 border border-amber-400/40 text-white shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform pointer-events-none" />
                <div className="flex justify-between items-start relative z-10">
                  <div className="min-w-0 flex-1 pr-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/20 text-[9px] font-black uppercase tracking-wider text-amber-100">
                      <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
                      XOF Currency Pool
                    </span>
                    <p className="font-mono text-2xl sm:text-3xl font-black mt-3 leading-none tracking-tight break-all">
                      CFA {(config.globalXofBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-[10px] text-amber-100 font-bold uppercase tracking-wider">
                      <span>CFA Franc Reserve Pool</span>
                      <span className="font-mono text-white font-black">100% Verified</span>
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-white shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-[26px]">account_balance_wallet</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: TODAY'S FINANCIAL FLOWS & TOTAL PAYOUT HIGHLIGHTS */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className={cn("font-extrabold text-sm uppercase tracking-wider flex items-center gap-2", isDark ? "text-white" : "text-gray-900")}>
                  <span className="material-symbols-outlined text-[#FC7A00] text-lg">swap_vertical_circle</span>
                  <span>Today&apos;s Financial Activity & Total Payouts</span>
                </h3>
                <p className={cn("text-[11px] font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                  Live transaction volume summary for deposits, transfers, and total disbursements today.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Activity Card 1: Today's Deposits */}
              <div className="relative group overflow-hidden bg-gradient-to-br from-blue-600 via-cyan-600 to-blue-700 rounded-2xl p-6 border border-cyan-400/40 text-white shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="absolute top-0 right-0 w-28 h-28 bg-white/10 rounded-full blur-xl group-hover:scale-125 transition-transform pointer-events-none" />
                <div className="flex justify-between items-start relative z-10">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-[10px] font-black uppercase text-cyan-100 tracking-wider">Today&apos;s Total Deposits</p>
                    <p className="font-mono text-2xl sm:text-3xl font-black mt-2 leading-none tracking-tight break-all">
                      ₦{(config.todayDeposit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-cyan-100 font-bold uppercase tracking-wider mt-3 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">south_west</span>
                      <span>Total Inflows Received Today</span>
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-white shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-[26px]">add_circle</span>
                  </div>
                </div>
              </div>

              {/* Activity Card 2: Today's Total Payouts */}
              <div className="relative group overflow-hidden bg-gradient-to-br from-rose-600 via-red-600 to-rose-700 rounded-2xl p-6 border border-rose-400/40 text-white shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="absolute top-0 right-0 w-28 h-28 bg-white/10 rounded-full blur-xl group-hover:scale-125 transition-transform pointer-events-none" />
                <div className="flex justify-between items-start relative z-10">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-[10px] font-black uppercase text-rose-100 tracking-wider">Today&apos;s Total Payouts</p>
                    <p className="font-mono text-2xl sm:text-3xl font-black mt-2 leading-none tracking-tight break-all">
                      ₦{(config.todayPayout || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-rose-100 font-bold uppercase tracking-wider mt-3 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">north_east</span>
                      <span>Transfers, Withdrawals &amp; Bills</span>
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-white shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-[26px]">outbound</span>
                  </div>
                </div>
              </div>

              {/* Activity Card 3: Today's Net Flow */}
              <div className={cn(
                "relative group overflow-hidden rounded-2xl p-6 border text-white shadow-md hover:-translate-y-1 transition-all duration-300",
                todayNet >= 0
                  ? "bg-gradient-to-br from-emerald-600 via-green-600 to-teal-700 border-emerald-400/40"
                  : "bg-gradient-to-br from-orange-600 via-rose-600 to-red-700 border-orange-400/40"
              )}>
                <div className="absolute top-0 right-0 w-28 h-28 bg-white/10 rounded-full blur-xl group-hover:scale-125 transition-transform pointer-events-none" />
                <div className="flex justify-between items-start relative z-10">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-[10px] font-black uppercase text-white/90 tracking-wider">Today&apos;s Net Flow Variance</p>
                    <p className="font-mono text-2xl sm:text-3xl font-black mt-2 leading-none tracking-tight break-all">
                      {todayNet >= 0 ? "+" : ""}₦{todayNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <div className="mt-3 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/20 text-[9px] font-black uppercase tracking-wider">
                      <span className="material-symbols-outlined text-xs">
                        {todayNet >= 0 ? "trending_up" : "trending_down"}
                      </span>
                      <span>{todayNet >= 0 ? "Net Positive Inflow" : "Net Outflow Variance"}</span>
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-white shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-[26px]">analytics</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: SYSTEM OVERVIEW & PERFORMANCE METRICS */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className={cn("font-extrabold text-sm uppercase tracking-wider flex items-center gap-2", isDark ? "text-white" : "text-gray-900")}>
                  <span className="material-symbols-outlined text-[#FC7A00] text-lg">grid_view</span>
                  <span>System Operations & Performance</span>
                </h3>
                <p className={cn("text-[11px] font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                  User count, locked savings holdings, bonus wallets, and administrative revenue markups.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Metric Card 1: Registered Users */}
              <div className={cn(
                "rounded-2xl p-5 border transition-all duration-300 shadow-xs hover:shadow-md",
                isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900"
              )}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Registered Users</p>
                    <p className="font-mono text-2xl font-black mt-2 tracking-tight">
                      {(config.totalUsers || 0).toLocaleString()}
                    </p>
                    <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mt-2">Active Accounts</p>
                  </div>
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isDark ? "bg-gray-800 text-orange-400" : "bg-orange-50 text-orange-600")}>
                    <span className="material-symbols-outlined text-xl">group</span>
                  </div>
                </div>
              </div>

              {/* Metric Card 2: Total Fixed Deposit */}
              <div className={cn(
                "rounded-2xl p-5 border transition-all duration-300 shadow-xs hover:shadow-md",
                isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900"
              )}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Total Fixed Deposit</p>
                    <p className="font-mono text-2xl font-black mt-2 tracking-tight">
                      ₦{(config.totalFixedDeposit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] font-bold text-cyan-500 uppercase tracking-wider mt-2">Active Savings Holdings</p>
                  </div>
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isDark ? "bg-gray-800 text-cyan-400" : "bg-cyan-50 text-cyan-600")}>
                    <span className="material-symbols-outlined text-xl">lock</span>
                  </div>
                </div>
              </div>

              {/* Metric Card 3: Total Bonus Wallet */}
              <div className={cn(
                "rounded-2xl p-5 border transition-all duration-300 shadow-xs hover:shadow-md",
                isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900"
              )}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Total Bonus Wallet</p>
                    <p className="font-mono text-2xl font-black mt-2 tracking-tight">
                      ₦{(config.totalBonus || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] font-bold text-teal-500 uppercase tracking-wider mt-2">Aggregated Referral Bonuses</p>
                  </div>
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isDark ? "bg-gray-800 text-teal-400" : "bg-teal-50 text-teal-600")}>
                    <span className="material-symbols-outlined text-xl">featured_play_list</span>
                  </div>
                </div>
              </div>

              {/* Metric Card 4: Total Airtime Purchase */}
              <div className={cn(
                "rounded-2xl p-5 border transition-all duration-300 shadow-xs hover:shadow-md",
                isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900"
              )}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Total Airtime Purchases</p>
                    <p className="font-mono text-2xl font-black mt-2 tracking-tight">
                      ₦{(config.totalAirtimePurchase || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] font-bold text-pink-500 uppercase tracking-wider mt-2">Aggregated Airtime VTU</p>
                  </div>
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isDark ? "bg-gray-800 text-pink-400" : "bg-pink-50 text-pink-600")}>
                    <span className="material-symbols-outlined text-xl">phone_iphone</span>
                  </div>
                </div>
              </div>

              {/* Metric Card 5: Total Transfer Profit */}
              <div className={cn(
                "rounded-2xl p-5 border transition-all duration-300 shadow-xs hover:shadow-md",
                isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900"
              )}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Total Transfer Profit</p>
                    <p className="font-mono text-2xl font-black mt-2 tracking-tight">
                      ₦{(config.totalTransferProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mt-2">Admin Transfer Markups</p>
                  </div>
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isDark ? "bg-gray-800 text-emerald-400" : "bg-emerald-50 text-emerald-600")}>
                    <span className="material-symbols-outlined text-xl">currency_exchange</span>
                  </div>
                </div>
              </div>

              {/* Metric Card 6: Total Data Profit */}
              <div className={cn(
                "rounded-2xl p-5 border transition-all duration-300 shadow-xs hover:shadow-md",
                isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900"
              )}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">Total Data Profit</p>
                    <p className="font-mono text-2xl font-black mt-2 tracking-tight">
                      ₦{(config.totalDataProfit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] font-bold text-fuchsia-500 uppercase tracking-wider mt-2">Admin Data Plan Markups</p>
                  </div>
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isDark ? "bg-gray-800 text-fuchsia-400" : "bg-fuchsia-50 text-fuchsia-600")}>
                    <span className="material-symbols-outlined text-xl">database</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <CpanelRouteGuard requiredPermission="metrics.view">
      <AdminDashboardContent />
    </CpanelRouteGuard>
  );
}
