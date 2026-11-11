"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";

interface TierLimitState {
  tier1MaxBalance: number;
  tier1DailyDepositLimit: number;
  tier1DailyTransferLimit: number;
  tier1SingleTransferLimit: number;

  tier2MaxBalance: number;
  tier2DailyDepositLimit: number;
  tier2DailyTransferLimit: number;
  tier2SingleTransferLimit: number;

  tier3MaxBalance: number;
  tier3DailyDepositLimit: number;
  tier3DailyTransferLimit: number;
  tier3SingleTransferLimit: number;

  dailyResetWindowHours: number;
}

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

interface SearchedUser {
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  role: string;
  balance?: number;
}

function SetLimitsPageContent() {
  const { isDark, toggleTheme } = useCpanelTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Dynamic Tier Options state
  const [tierOptions, setTierOptions] = useState<{ id: string; name: string; dailyLimit: number; singleLimit: number; maxBalance: number }[]>([
    { id: "tier_1", name: "Tier 1", dailyLimit: 500000, singleLimit: 200000, maxBalance: 300000 },
    { id: "tier_2", name: "Tier 2", dailyLimit: 5000000, singleLimit: 2000000, maxBalance: 5000000 },
    { id: "tier_3", name: "Tier 3", dailyLimit: 50000000, singleLimit: 10000000, maxBalance: 50000000 },
  ]);

  // Approve KYC Modal Drawer state
  const [isApproveKycModalOpen, setIsApproveKycModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SearchedUser | null>(null);

  const [approveProvider, setApproveProvider] = useState<"flutterwave" | "squad">("flutterwave");
  const [approveTier, setApproveTier] = useState<string>("Tier 2");
  const [approveUserBalance, setApproveUserBalance] = useState<number>(0);
  const [approveMaxBalance, setApproveMaxBalance] = useState<number>(5000000);
  const [approveDailyLimit, setApproveDailyLimit] = useState<number>(5000000);
  const [approveSingleLimit, setApproveSingleLimit] = useState<number>(2000000);
  const [isApprovingKyc, setIsApprovingKyc] = useState(false);

  const [limits, setLimits] = useState<TierLimitState>({
    tier1MaxBalance: 300000,
    tier1DailyDepositLimit: 500000,
    tier1DailyTransferLimit: 500000,
    tier1SingleTransferLimit: 200000,

    tier2MaxBalance: 5000000,
    tier2DailyDepositLimit: 5000000,
    tier2DailyTransferLimit: 5000000,
    tier2SingleTransferLimit: 2000000,

    tier3MaxBalance: 50000000,
    tier3DailyDepositLimit: 50000000,
    tier3DailyTransferLimit: 50000000,
    tier3SingleTransferLimit: 10000000,

    dailyResetWindowHours: 24,
  });

  useEffect(() => {
    fetchLimits();
    fetchTierLevels();
  }, []);

  const fetchLimits = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/set-limits");
      const data = await res.json();
      if (res.ok && data.success && data.limits) {
        setLimits((prev) => ({
          ...prev,
          ...data.limits,
        }));
      }
    } catch {
      toast.error("Failed to load global default tier limits.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTierLevels = async () => {
    try {
      const res = await fetch("/api/admin/tier-levels");
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.tierLevels) && data.tierLevels.length > 0) {
        setTierOptions(data.tierLevels);
      }
    } catch {
      // Ignore background tier levels fetch errors
    }
  };

  const handleSearchUsers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearchingUsers(true);
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setSearchResults(data.users || []);
        if ((data.users || []).length === 0) {
          toast.error("No users found matching your search term.");
        }
      } else {
        toast.error(data.error || "Failed to search user accounts.");
      }
    } catch {
      toast.error("Network communication error searching users.");
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleSelectTierForUser = (tierName: string) => {
    setApproveTier(tierName);
    const matched = tierOptions.find((t) => t.name === tierName || t.id === tierName);
    if (matched) {
      setApproveMaxBalance(matched.maxBalance);
      setApproveDailyLimit(matched.dailyLimit);
      setApproveSingleLimit(matched.singleLimit);
    } else {
      if (tierName === "Tier 3") {
        setApproveMaxBalance(limits.tier3MaxBalance || 50000000);
        setApproveDailyLimit(limits.tier3DailyTransferLimit || 50000000);
        setApproveSingleLimit(limits.tier3SingleTransferLimit || 10000000);
      } else if (tierName === "Tier 2") {
        setApproveMaxBalance(limits.tier2MaxBalance || 5000000);
        setApproveDailyLimit(limits.tier2DailyTransferLimit || 5000000);
        setApproveSingleLimit(limits.tier2SingleTransferLimit || 2000000);
      } else {
        setApproveMaxBalance(limits.tier1MaxBalance || 300000);
        setApproveDailyLimit(limits.tier1DailyDepositLimit || 500000);
        setApproveSingleLimit(limits.tier1SingleTransferLimit || 200000);
      }
    }
  };

  const handleSelectUserAccount = (u: SearchedUser) => {
    setSelectedUser(u);
    setApproveUserBalance(Number(u.balance) || 0);
  };

  const handleApproveKycAndLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      toast.error("Please search and select a target user first.");
      return;
    }

    setIsApprovingKyc(true);
    toast.loading(`Approving KYC & setting limits for ${selectedUser.name}...`);

    try {
      const res = await fetch("/api/admin/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          targetUid: selectedUser.uid,
          provider: approveProvider,
          tier: approveTier,
          balance: approveUserBalance,
          dailyLimit: approveDailyLimit,
          singleLimit: approveSingleLimit,
          maxBalance: approveMaxBalance,
        }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || `KYC approved & limits updated for ${selectedUser.name}!`);
        setIsApproveKycModalOpen(false);
        setSelectedUser(null);
        setSearchQuery("");
        setSearchResults([]);
      } else {
        toast.error(data.error || "Failed to approve KYC and set user limits.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network communication failure approving KYC.");
    } finally {
      setIsApprovingKyc(false);
    }
  };

  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    toast.loading("Saving Global Default Transaction Limits...");

    try {
      const res = await fetch("/api/admin/set-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(limits),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || "Global Default Transaction Limits saved successfully!");
      } else {
        toast.error(data.error || "Failed to save limits.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network communication error saving limits.");
    } finally {
      setIsSaving(false);
    }
  };

  const bgClass = isDark ? "bg-[#0c0f17] text-white" : "bg-gray-50 text-gray-900";
  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-11 px-3.5 text-xs outline-none font-bold w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-11 px-3.5 text-xs outline-none font-bold w-full";

  if (isLoading) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center p-6 font-hanken", bgClass)}>
        <div className="flex flex-col items-center gap-3">
          <ButtonSpinner />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Set Limits Configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen p-4 md:p-8 font-hanken transition-colors duration-300", bgClass)}>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Header */}
        <div className={cn("p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4", panelClass)}>
          <div className="flex items-center gap-3">
            <Link
              href="/cpanel/limits"
              className={cn("w-10 h-10 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-[22px]">tune</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Set Limits</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  Global Defaults
                </span>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Configure global default transaction limits across Tier 1, Tier 2, and Tier 3 levels and set custom rolling reset window hours.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setIsApproveKycModalOpen(true)}
              className="px-4 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">verified</span>
              <span>Approve KYC &amp; Set User Limits</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className={cn("px-3 h-10 rounded-xl border font-bold text-xs flex items-center gap-2 transition-all cursor-pointer", isDark ? "bg-gray-900 border-gray-800 text-yellow-400" : "bg-gray-100 border-gray-200 text-gray-700")}
            >
              <span className="material-symbols-outlined text-[18px]">{isDark ? "light_mode" : "dark_mode"}</span>
              <span className="hidden sm:inline">{isDark ? "Light Mode" : "Dark Mode"}</span>
            </button>

            <Link
              href="/cpanel/limits"
              className="px-4 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
              <span>Account Limits Manager</span>
            </Link>
          </div>
        </div>

        {/* Dedicated Section: APPROVE KYC & SET LIMITS Workspace */}
        <div className={cn("p-6 rounded-2xl border space-y-5", panelClass)}>
          <div className="flex items-center justify-between border-b pb-3 border-gray-200/40 dark:border-gray-800 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-emerald-500 text-[24px]">verified</span>
              <div>
                <h2 className="font-extrabold text-base uppercase tracking-tight">APPROVE KYC &amp; SET LIMITS</h2>
                <p className="text-xs text-gray-400 font-medium">Search customer account, assign Tier level, set wallet available balance, and configure transfer limits.</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-black uppercase rounded-full">
              Quick Manager
            </span>
          </div>

          {!selectedUser ? (
            <div className="space-y-4 text-xs">
              <form onSubmit={handleSearchUsers} className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Search Customer Account *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by Full Name, Email, Phone, or BVN..."
                    className={inputClass}
                  />
                  <button
                    type="submit"
                    disabled={isSearchingUsers}
                    className="px-5 h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {isSearchingUsers ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">search</span>}
                    <span>Search</span>
                  </button>
                </div>
              </form>

              {searchResults.length > 0 && (
                <div className="space-y-2 pt-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Matching Accounts ({searchResults.length})</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                    {searchResults.map((u) => (
                      <div
                        key={u.uid}
                        onClick={() => handleSelectUserAccount(u)}
                        className={cn(
                          "p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all hover:border-emerald-500",
                          isDark ? "bg-gray-800/80 border-gray-700 hover:bg-gray-800" : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                        )}
                      >
                        <div>
                          <p className="font-extrabold text-sm uppercase text-gray-900 dark:text-white">{u.name}</p>
                          <p className="font-mono text-[11px] text-gray-400">{u.email} • {u.phoneNumber}</p>
                          <p className="text-[10px] font-bold text-emerald-500 mt-0.5">Balance: ₦{(u.balance || 0).toLocaleString("en-NG")}</p>
                        </div>
                        <button
                          type="button"
                          className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-black uppercase rounded-xl"
                        >
                          Select
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleApproveKycAndLimits} className="space-y-4 text-xs">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase text-emerald-500">Selected Customer</span>
                  <p className="font-extrabold text-base text-gray-900 dark:text-white">{selectedUser.name}</p>
                  <p className="font-mono text-xs text-gray-400">{selectedUser.email} • {selectedUser.phoneNumber}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="px-3 py-1.5 text-xs font-black uppercase tracking-wider text-rose-500 border border-rose-500/30 rounded-xl hover:bg-rose-500/10 cursor-pointer"
                >
                  Change User
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">ASSIGN TIER LEVEL *</label>
                  <select
                    value={approveTier}
                    onChange={(e) => handleSelectTierForUser(e.target.value)}
                    className={cn(inputClass, "cursor-pointer font-bold")}
                  >
                    {tierOptions.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name} (Max Balance: ₦{t.maxBalance.toLocaleString("en-NG")})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Virtual Account Gateway Rail *</label>
                  <select
                    value={approveProvider}
                    onChange={(e) => setApproveProvider(e.target.value as any)}
                    className={cn(inputClass, "cursor-pointer font-bold")}
                  >
                    <option value="flutterwave">Flutterwave Gateway Rail</option>
                    <option value="squad">Squadco (GTBank) Virtual Account Rail</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">User Available Balance (₦) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={approveUserBalance}
                    onChange={(e) => setApproveUserBalance(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Maximum Tier Balance Cap (₦)</label>
                  <input
                    type="number"
                    required
                    min={100000}
                    value={approveMaxBalance}
                    onChange={(e) => setApproveMaxBalance(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Daily Transfer Limit (₦)</label>
                  <input
                    type="number"
                    required
                    min={100000}
                    value={approveDailyLimit}
                    onChange={(e) => setApproveDailyLimit(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Single Transfer Limit (₦)</label>
                  <input
                    type="number"
                    required
                    min={50000}
                    value={approveSingleLimit}
                    onChange={(e) => setApproveSingleLimit(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  disabled={isApprovingKyc}
                  className="px-4 py-2.5 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold uppercase rounded-xl hover:bg-gray-300 dark:hover:bg-gray-700 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isApprovingKyc}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  {isApprovingKyc && <ButtonSpinner />}
                  <span>Approve KYC &amp; Set Limits</span>
                </button>
              </div>
            </form>
          )}
        </div>

        <form onSubmit={handleSaveLimits} className="space-y-6">

          {/* Daily Reset Window Configuration Card */}
          <div className={cn("p-6 rounded-2xl border space-y-3", panelClass)}>
            <div className="flex items-center gap-2 border-b pb-3 border-gray-200/40 dark:border-gray-800">
              <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">schedule</span>
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wider">Daily Limit Reset Window</h3>
                <p className="text-[11px] text-gray-400 font-medium">Customize the rolling hours window after which daily transfer and deposit limits reset.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Reset Window (Hours) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min={1}
                    max={168}
                    value={limits.dailyResetWindowHours}
                    onChange={(e) => setLimits({ ...limits, dailyResetWindowHours: Number(e.target.value) })}
                    className={inputClass}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">HOURS</span>
                </div>
              </div>

              <div className="p-3.5 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-center gap-3">
                <span className="material-symbols-outlined text-orange-500 text-[24px]">info</span>
                <p className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                  Currently set to a <strong className="text-[#FC7A00]">{limits.dailyResetWindowHours}-Hour</strong> rolling limit window. User daily inflows &amp; outflows automatically reset after {limits.dailyResetWindowHours} hours.
                </p>
              </div>
            </div>
          </div>

          {/* Tier Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Tier 1 Defaults Card */}
            <div className={cn("p-6 rounded-2xl border space-y-4", panelClass)}>
              <div className="flex items-center justify-between border-b pb-3 border-gray-200/40 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-gray-500 text-[22px]">workspace_premium</span>
                  <h3 className="font-extrabold text-sm uppercase tracking-wider">Tier 1 Defaults</h3>
                </div>
                <span className="px-2.5 py-0.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[10px] font-black uppercase rounded-full">
                  Basic
                </span>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Maximum Account Balance (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={limits.tier1MaxBalance}
                    onChange={(e) => setLimits({ ...limits, tier1MaxBalance: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Daily Deposit / Inflow Limit (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={limits.tier1DailyDepositLimit}
                    onChange={(e) => setLimits({ ...limits, tier1DailyDepositLimit: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Daily Transfer / Outflow Limit (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={limits.tier1DailyTransferLimit}
                    onChange={(e) => setLimits({ ...limits, tier1DailyTransferLimit: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Single Transfer Cap (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={limits.tier1SingleTransferLimit}
                    onChange={(e) => setLimits({ ...limits, tier1SingleTransferLimit: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Tier 2 Defaults Card */}
            <div className={cn("p-6 rounded-2xl border space-y-4", panelClass)}>
              <div className="flex items-center justify-between border-b pb-3 border-gray-200/40 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-500 text-[22px]">workspace_premium</span>
                  <h3 className="font-extrabold text-sm uppercase tracking-wider">Tier 2 Defaults</h3>
                </div>
                <span className="px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase rounded-full">
                  Verified
                </span>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Maximum Account Balance (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={limits.tier2MaxBalance}
                    onChange={(e) => setLimits({ ...limits, tier2MaxBalance: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Daily Deposit / Inflow Limit (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={limits.tier2DailyDepositLimit}
                    onChange={(e) => setLimits({ ...limits, tier2DailyDepositLimit: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Daily Transfer / Outflow Limit (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={limits.tier2DailyTransferLimit}
                    onChange={(e) => setLimits({ ...limits, tier2DailyTransferLimit: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Single Transfer Cap (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={limits.tier2SingleTransferLimit}
                    onChange={(e) => setLimits({ ...limits, tier2SingleTransferLimit: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Tier 3 Defaults Card */}
            <div className={cn("p-6 rounded-2xl border space-y-4", panelClass)}>
              <div className="flex items-center justify-between border-b pb-3 border-gray-200/40 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500 text-[22px]">workspace_premium</span>
                  <h3 className="font-extrabold text-sm uppercase tracking-wider">Tier 3 Defaults</h3>
                </div>
                <span className="px-2.5 py-0.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase rounded-full">
                  Premium
                </span>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Maximum Account Balance (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={limits.tier3MaxBalance}
                    onChange={(e) => setLimits({ ...limits, tier3MaxBalance: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Daily Deposit / Inflow Limit (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={limits.tier3DailyDepositLimit}
                    onChange={(e) => setLimits({ ...limits, tier3DailyDepositLimit: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Daily Transfer / Outflow Limit (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={limits.tier3DailyTransferLimit}
                    onChange={(e) => setLimits({ ...limits, tier3DailyTransferLimit: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Single Transfer Cap (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={limits.tier3SingleTransferLimit}
                    onChange={(e) => setLimits({ ...limits, tier3SingleTransferLimit: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Action Bar */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-4 bg-[#FC7A00] hover:bg-[#e06600] text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <ButtonSpinner />
                  <span>Saving Configuration...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">save</span>
                  <span>Save Global Default Transaction Limits</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>

      {/* Approve KYC & Set Custom User Limits Modal Drawer */}
      {isApproveKycModalOpen && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className={cn("w-full max-w-lg p-6 rounded-3xl border shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto no-scrollbar", panelClass)}>
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: isDark ? "#1f2937" : "#f3f4f6" }}>
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-emerald-500 text-[26px]">verified</span>
                <div>
                  <h3 className="text-base font-extrabold uppercase">Approve KYC &amp; Set User Limits</h3>
                  <p className="text-[10px] text-gray-400">Search customer, assign Tier, virtual account rail &amp; custom limits.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsApproveKycModalOpen(false);
                  setSelectedUser(null);
                }}
                className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-black dark:hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Step 1: Search and Select User */}
            {!selectedUser ? (
              <div className="space-y-4 text-xs">
                <form onSubmit={handleSearchUsers} className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-400">Search Customer Account *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by Full Name, Email, Phone, or BVN..."
                      className={inputClass}
                    />
                    <button
                      type="submit"
                      disabled={isSearchingUsers}
                      className="px-5 h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      {isSearchingUsers ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">search</span>}
                      <span>Search</span>
                    </button>
                  </div>
                </form>

                {searchResults.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <label className="text-[10px] font-black uppercase text-gray-400">Matching Customer Accounts ({searchResults.length})</label>
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {searchResults.map((u) => (
                        <div
                          key={u.uid}
                          onClick={() => setSelectedUser(u)}
                          className={cn(
                            "p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all hover:border-emerald-500",
                            isDark ? "bg-gray-800/80 border-gray-700 hover:bg-gray-800" : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                          )}
                        >
                          <div>
                            <p className="font-extrabold text-sm uppercase text-gray-900 dark:text-white">{u.name}</p>
                            <p className="font-mono text-[11px] text-gray-400">{u.email} • {u.phoneNumber}</p>
                          </div>
                          <button
                            type="button"
                            className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-black uppercase rounded-xl"
                          >
                            Select
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Step 2: Configure KYC Approval & Limits */
              <form onSubmit={handleApproveKycAndLimits} className="space-y-4 text-xs">
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase text-emerald-500">Selected Customer</span>
                    <p className="font-extrabold text-sm text-gray-900 dark:text-white">{selectedUser.name}</p>
                    <p className="font-mono text-[11px] text-gray-400">{selectedUser.email} • {selectedUser.phoneNumber}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedUser(null)}
                    className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-500 border border-rose-500/30 rounded-lg hover:bg-rose-500/10 cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase text-gray-400">Virtual Account Gateway Provider *</label>
                  <select
                    value={approveProvider}
                    onChange={(e) => setApproveProvider(e.target.value as any)}
                    className={cn(inputClass, "cursor-pointer font-bold")}
                  >
                    <option value="flutterwave">Flutterwave Gateway Rail</option>
                    <option value="squad">Squadco (GTBank) Virtual Account Rail</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase text-gray-400">Assign Tier Level *</label>
                    <select
                      value={approveTier}
                      onChange={(e) => handleSelectTierForUser(e.target.value)}
                      className={cn(inputClass, "cursor-pointer font-bold")}
                    >
                      {tierOptions.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name} (₦{t.dailyLimit.toLocaleString("en-NG")} / Day)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase text-gray-400">User Available Balance (₦) *</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={approveUserBalance}
                      onChange={(e) => setApproveUserBalance(Number(e.target.value))}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase text-gray-400">Maximum Tier Balance Cap (₦)</label>
                  <input
                    type="number"
                    required
                    min={100000}
                    value={approveMaxBalance}
                    onChange={(e) => setApproveMaxBalance(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase text-gray-400">Daily Transfer Limit (₦)</label>
                  <input
                    type="number"
                    required
                    min={100000}
                    value={approveDailyLimit}
                    onChange={(e) => setApproveDailyLimit(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase text-gray-400">Single Transfer Limit (₦)</label>
                  <input
                    type="number"
                    required
                    min={50000}
                    value={approveSingleLimit}
                    onChange={(e) => setApproveSingleLimit(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-gray-200/50 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsApproveKycModalOpen(false);
                      setSelectedUser(null);
                    }}
                    disabled={isApprovingKyc}
                    className="px-4 py-2.5 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold uppercase rounded-xl hover:bg-gray-300 dark:hover:bg-gray-700 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isApprovingKyc}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    {isApprovingKyc && <ButtonSpinner />}
                    <span>Approve KYC &amp; Set Limits</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SetLimitsPage() {
  return (
    <CpanelRouteGuard requiredPermission="limits.manage">
      <SetLimitsPageContent />
    </CpanelRouteGuard>
  );
}
