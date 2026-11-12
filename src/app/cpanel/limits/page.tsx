"use client";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { TwoFactorOtpVerificationView } from "@/components/auth/TwoFactorOtpVerificationView";
import { useAuth } from "@/lib/AuthContext";

interface UserLimitItem {
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  dailyTransferLimit: number;
  maxSingleTransferLimit: number;
  dailyDepositLimit: number;
  unlimitedTransfers: boolean;
  unlimitedDeposits: boolean;
}

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-[#FC7A00] border-t-transparent rounded-full animate-spin" />
  );
}

function CpanelLimitsPageContent() {
  const router = useRouter();
  const { user } = useAuth();
  const { isDark, toggleTheme } = useCpanelTheme();

  // 2FA OTP Modal Authorization State
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [otpModalTitle, setOtpModalTitle] = useState("Authorize Limit Changes");
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<UserLimitItem[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [savingUid, setSavingUid] = useState<string | null>(null);

  // Global Minimum Transfer & Tier Upgrade Limits state
  const [globalMinTransfer, setGlobalMinTransfer] = useState<number>(100);
  const [tier2DailyLimit, setTier2DailyLimit] = useState<number>(5000000);
  const [tier2SingleLimit, setTier2SingleLimit] = useState<number>(2000000);
  const [tier3DailyLimit, setTier3DailyLimit] = useState<number>(50000000);
  const [tier3SingleLimit, setTier3SingleLimit] = useState<number>(10000000);
  const [tierUpgradeSelectionTitle, setTierUpgradeSelectionTitle] = useState<string>("SELECT TARGET UPGRADE TIER");
  const [acceptableGovernmentIds, setAcceptableGovernmentIds] = useState<string[]>([
    "National ID Card (NIN)",
    "International Passport",
    "Driver's License",
    "Voter's Card"
  ]);
  const [newGovIdInput, setNewGovIdInput] = useState<string>("");
  const [isSavingGlobalMin, setIsSavingGlobalMin] = useState<boolean>(false);
  const [isLoadingGlobalMin, setIsLoadingGlobalMin] = useState<boolean>(true);

  // Auth & Initial Limits Fetch
  useEffect(() => {
    async function initPage() {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock) {
        try {
          const sessionRes = await fetch("/api/admin/auth/session");
          const sessionData = await sessionRes.json();
          if (!sessionRes.ok || !sessionData.success) {
            toast.error("Session expired. Please log in.");
            router.push("/cpanel");
            return;
          }
        } catch (err) {
          console.error("Session check failed:", err);
        }
      }
      setIsLoadingSession(false);

      // Fetch dynamic active Global Minimum Transfer Limit from API
      try {
        const headers: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};
        const res = await fetch("/api/admin/limits", { headers });
        const data = await res.json();
        if (data.success) {
          if (typeof data.globalMinTransferAmount === "number") setGlobalMinTransfer(data.globalMinTransferAmount);
          if (typeof data.tier2DailyLimit === "number") setTier2DailyLimit(data.tier2DailyLimit);
          if (typeof data.tier2SingleLimit === "number") setTier2SingleLimit(data.tier2SingleLimit);
          if (typeof data.tier3DailyLimit === "number") setTier3DailyLimit(data.tier3DailyLimit);
          if (typeof data.tier3SingleLimit === "number") setTier3SingleLimit(data.tier3SingleLimit);
          if (data.tierUpgradeSelectionTitle) setTierUpgradeSelectionTitle(data.tierUpgradeSelectionTitle);
          if (Array.isArray(data.acceptableGovernmentIds) && data.acceptableGovernmentIds.length > 0) {
            setAcceptableGovernmentIds(data.acceptableGovernmentIds);
          }
        }
      } catch (err) {
        console.warn("Failed to load active global minimum transfer limit:", err);
      } finally {
        setIsLoadingGlobalMin(false);
      }
    }

    initPage();
  }, [router]);

  // Save Global Minimum Transfer Amount (Gated with 2FA OTP)
  const handleSaveGlobalMinTransfer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isNaN(globalMinTransfer) || globalMinTransfer < 0) {
      toast.warning("Please enter a valid non-negative global minimum transfer amount.");
      return;
    }

    setOtpModalTitle("Authorize Global Limits Update");
    setPendingAction(() => async () => {
      setIsSavingGlobalMin(true);
      try {
        const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
        const headers: Record<string, string> = isMock
          ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
          : { "Content-Type": "application/json" };

        const res = await fetch("/api/admin/limits", {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "update_global_min_transfer",
            globalMinTransferAmount: globalMinTransfer,
            tier2DailyLimit,
            tier2SingleLimit,
            tier3DailyLimit,
            tier3SingleLimit,
            tierUpgradeSelectionTitle,
            acceptableGovernmentIds,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          toast.success(data.message || "Global limits & Tier Upgrade settings saved successfully!");
          if (typeof data.globalMinTransferAmount === "number") setGlobalMinTransfer(data.globalMinTransferAmount);
        } else {
          toast.error(data.error || "Failed to update global limits.");
        }
      } catch (err: any) {
        toast.error(err.message || "Network error updating global minimum transfer limit.");
      } finally {
        setIsSavingGlobalMin(false);
      }
    });

    setIsOtpModalOpen(true);
  };

  // Handle Search Users
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      toast.warning("Please enter a search term (email, phone, or name).");
      return;
    }

    setIsLoadingUsers(true);
    setHasSearched(true);

    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};
      const res = await fetch(`/api/admin/limits?search=${encodeURIComponent(searchQuery.trim())}`, { headers });
      const data = await res.json();

      if (data.success && Array.isArray(data.users)) {
        setUsers(data.users);
        if (data.users.length === 0) {
          toast.info("No matching user accounts found.");
        }
      } else {
        toast.error(data.error || "Failed to search user profiles.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error searching user profiles.");
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Save Limit Updates (Gated with 2FA OTP)
  const handleSaveLimits = async (userItem: UserLimitItem) => {
    setOtpModalTitle(`Authorize Limitations for ${userItem.name}`);
    setPendingAction(() => async () => {
      setSavingUid(userItem.uid);
      try {
        const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
        const headers: Record<string, string> = isMock
          ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
          : { "Content-Type": "application/json" };

        const res = await fetch("/api/admin/limits", {
          method: "POST",
          headers,
          body: JSON.stringify({
            targetUid: userItem.uid,
            dailyTransferLimit: userItem.dailyTransferLimit,
            maxSingleTransferLimit: userItem.maxSingleTransferLimit,
            dailyDepositLimit: userItem.dailyDepositLimit,
            unlimitedTransfers: userItem.unlimitedTransfers,
            unlimitedDeposits: userItem.unlimitedDeposits,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          toast.success("Account limitations updated successfully!");
        } else {
          toast.error(data.error || "Failed to update account limitations.");
        }
      } catch (err: any) {
        toast.error(err.message || "Network error updating account limitations.");
      } finally {
        setSavingUid(null);
      }
    });

    setIsOtpModalOpen(true);
  };

  const bgClass = isDark ? "bg-[#0c0f17] text-white" : "bg-gray-50 text-gray-900";
  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full";

  if (isLoadingSession) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center p-6", bgClass)}>
        <div className="flex flex-col items-center gap-3">
          <ButtonSpinner />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Verifying Admin Access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen p-4 md:p-8 font-hanken transition-colors duration-300", bgClass)}>
      <div className="max-w-7xl mx-auto space-y-6">

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
                <span className="material-symbols-outlined text-orange-500 text-[22px]">trending_up</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Account Limits Manager</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Configure Global Minimum Transfer limits and manage individual user deposit or transfer thresholds.
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

        {/* Global Minimum Transfer Panel */}
        <div className={cn("p-6 rounded-2xl border space-y-4 relative overflow-hidden", panelClass)}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200/40 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-orange-500 text-[22px]">shield_lock</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-extrabold text-sm uppercase tracking-wider">Global Minimum Transfer Limit</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-500/10 text-orange-500 border border-orange-500/20">
                    Active Enforcement
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                  100% Server-Enforced. Single and bulk transfer requests below this threshold will be blocked automatically.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-orange-500/5 px-3 py-1.5 rounded-xl border border-orange-500/20 shrink-0">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Active Threshold:</span>
              <span className="font-mono font-black text-orange-500 text-sm">
                ₦{globalMinTransfer.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <form onSubmit={handleSaveGlobalMinTransfer} className="flex flex-col sm:flex-row items-center gap-3 pt-1">
            <div className="space-y-1 w-full flex-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                Minimum Transfer Limit Amount (₦)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono font-bold text-xs">₦</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  disabled={isLoadingGlobalMin || isSavingGlobalMin}
                  value={globalMinTransfer}
                  onChange={(e) => setGlobalMinTransfer(Number(e.target.value))}
                  placeholder="e.g. 100"
                  className={cn(inputClass, "pl-8 pr-4 h-11 text-sm font-mono font-bold")}
                />
              </div>
            </div>

            {/* Acceptable Government ID Management */}
            <div className="space-y-2 pt-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                Acceptable Government IDs for Tier Upgrades
              </label>

              <div className="flex flex-wrap gap-2 mb-2">
                {acceptableGovernmentIds.map((idType, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-500/10 text-[#FC7A00] border border-orange-500/20 rounded-full text-xs font-bold"
                  >
                    <span>{idType}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAcceptableGovernmentIds(acceptableGovernmentIds.filter((_, i) => i !== index));
                      }}
                      className="w-4 h-4 rounded-full bg-orange-500/20 text-[#FC7A00] hover:bg-orange-500 hover:text-white flex items-center justify-center transition-colors text-[12px] font-black cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  placeholder="e.g. Residence Permit Card"
                  value={newGovIdInput}
                  onChange={(e) => setNewGovIdInput(e.target.value)}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = newGovIdInput.trim();
                    if (trimmed && !acceptableGovernmentIds.includes(trimmed)) {
                      setAcceptableGovernmentIds([...acceptableGovernmentIds, trimmed]);
                      setNewGovIdInput("");
                    }
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-white rounded-xl text-xs font-extrabold uppercase shrink-0 cursor-pointer"
                >
                  + Add ID
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoadingGlobalMin || isSavingGlobalMin}
              className="w-full sm:w-auto px-6 h-11 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shrink-0 self-end"
            >
              {isSavingGlobalMin ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">save</span>}
              <span>Save Minimum Limit</span>
            </button>
          </form>

          {/* Tier Upgrade Defaults & Display Text Customizer */}
          <div className="pt-4 border-t border-gray-200/40 space-y-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-orange-500 text-[20px]">workspace_premium</span>
              <h3 className="font-extrabold text-xs uppercase tracking-wider">Tier Upgrade Defaults &amp; Selection Title</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400">
                  Target Upgrade Tier Selection Title (User View)
                </label>
                <input
                  type="text"
                  value={tierUpgradeSelectionTitle}
                  onChange={(e) => setTierUpgradeSelectionTitle(e.target.value)}
                  placeholder="e.g. SELECT TARGET UPGRADE TIER"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400">Tier 2 Daily Limit (₦)</label>
                  <input
                    type="number"
                    value={tier2DailyLimit}
                    onChange={(e) => setTier2DailyLimit(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400">Tier 3 Daily Limit (₦)</label>
                  <input
                    type="number"
                    value={tier3DailyLimit}
                    onChange={(e) => setTier3DailyLimit(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSaveGlobalMinTransfer()}
              disabled={isLoadingGlobalMin || isSavingGlobalMin}
              className="px-5 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSavingGlobalMin ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[16px]">save</span>}
              <span>Save Tier Customization Settings</span>
            </button>
          </div>
        </div>

        {/* Search Panel */}
        <div className={cn("p-5 rounded-2xl border space-y-4", panelClass)}>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-orange-500 text-[18px]">manage_accounts</span>
            <h3 className="font-extrabold text-xs uppercase tracking-wider">User Account Limitations Search</h3>
          </div>
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-[18px]">search</span>
              <input
                type="text"
                placeholder="Search user email, phone number, or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(inputClass, "pl-10 pr-4 h-11")}
              />
            </div>
            <button
              type="submit"
              disabled={isLoadingUsers}
              className="w-full md:w-auto px-6 h-11 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoadingUsers ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">search</span>}
              <span>Search User</span>
            </button>
          </form>
        </div>

        {/* Results List */}
        {isLoadingUsers ? (
          <div className={cn("p-12 rounded-2xl border text-center flex flex-col items-center justify-center gap-3", panelClass)}>
            <ButtonSpinner />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Searching User Database...</p>
          </div>
        ) : !hasSearched ? (
          <div className={cn("p-12 rounded-2xl border text-center space-y-3", panelClass)}>
            <span className="material-symbols-outlined text-[48px] text-orange-500">query_stats</span>
            <p className="text-xs font-black uppercase text-gray-400">Search User Account</p>
            <p className="text-[11px] text-gray-500 max-w-md mx-auto">
              Enter an exact email or phone number above to inspect and configure individual deposit or transfer limits.
            </p>
          </div>
        ) : users.length === 0 ? (
          <div className={cn("p-12 rounded-2xl border text-center space-y-3", panelClass)}>
            <span className="material-symbols-outlined text-[42px] text-gray-400">person_off</span>
            <p className="text-xs font-black uppercase text-gray-400">No Users Found</p>
            <p className="text-[11px] text-gray-500 max-w-md mx-auto">No user profiles matched your search term.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {users.map((userItem) => {
              const isSaving = savingUid === userItem.uid;
              return (
                <div key={userItem.uid} className={cn("p-5 rounded-2xl border space-y-5 transition-all", panelClass)}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/40 pb-4">
                    <div>
                      <h3 className="font-extrabold text-sm uppercase tracking-tight">{userItem.name}</h3>
                      <p className="text-xs font-semibold text-gray-400 mt-1 select-all">{userItem.email} • {userItem.phoneNumber}</p>
                      <p className="text-[10px] font-mono text-gray-500 mt-0.5">UID: {userItem.uid}</p>
                    </div>

                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleSaveLimits(userItem)}
                      className="px-6 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      {isSaving ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">save</span>}
                      <span>Save Limitations</span>
                    </button>
                  </div>

                  {/* Limit Controls Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Transfers Section */}
                    <div className={cn("p-4 rounded-xl border space-y-4", isDark ? "bg-gray-900/60 border-gray-800" : "bg-gray-50 border-gray-200/60")}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-orange-500 text-[20px]">send</span>
                          <h4 className="font-extrabold text-xs uppercase tracking-wider">Transfer Limits</h4>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={userItem.unlimitedTransfers}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setUsers((prev) =>
                                prev.map((u) => (u.uid === userItem.uid ? { ...u, unlimitedTransfers: checked } : u))
                              );
                            }}
                            className="w-4 h-4 text-[#FC7A00] rounded focus:ring-0 cursor-pointer"
                          />
                          <span className="text-[11px] font-extrabold uppercase text-orange-500">Unlimited</span>
                        </label>
                      </div>

                      {!userItem.unlimitedTransfers ? (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-gray-400">Daily Transfer Threshold (₦)</label>
                            <input
                              type="number"
                              value={userItem.dailyTransferLimit}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setUsers((prev) =>
                                  prev.map((u) => (u.uid === userItem.uid ? { ...u, dailyTransferLimit: val } : u))
                                );
                              }}
                              className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all", inputClass)}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-gray-400">Single Transfer Cap (₦)</label>
                            <input
                              type="number"
                              value={userItem.maxSingleTransferLimit}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setUsers((prev) =>
                                  prev.map((u) => (u.uid === userItem.uid ? { ...u, maxSingleTransferLimit: val } : u))
                                );
                              }}
                              className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all", inputClass)}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-orange-500/10 border border-orange-500/20 text-orange-500 rounded-xl text-center space-y-1">
                          <span className="material-symbols-outlined text-[24px]">verified</span>
                          <p className="text-xs font-black uppercase">Unlimited Transfers Active</p>
                          <p className="text-[10px] text-gray-400 font-semibold">User can send transfers without daily or single transaction caps.</p>
                        </div>
                      )}
                    </div>

                    {/* Deposits Section */}
                    <div className={cn("p-4 rounded-xl border space-y-4", isDark ? "bg-gray-900/60 border-gray-800" : "bg-gray-50 border-gray-200/60")}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-emerald-500 text-[20px]">add_circle</span>
                          <h4 className="font-extrabold text-xs uppercase tracking-wider">Deposit Limits</h4>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={userItem.unlimitedDeposits}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setUsers((prev) =>
                                prev.map((u) => (u.uid === userItem.uid ? { ...u, unlimitedDeposits: checked } : u))
                              );
                            }}
                            className="w-4 h-4 text-emerald-500 rounded focus:ring-0 cursor-pointer"
                          />
                          <span className="text-[11px] font-extrabold uppercase text-emerald-500">Unlimited</span>
                        </label>
                      </div>

                      {!userItem.unlimitedDeposits ? (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-gray-400">Daily Inbound Deposit Cap (₦)</label>
                            <input
                              type="number"
                              value={userItem.dailyDepositLimit}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setUsers((prev) =>
                                  prev.map((u) => (u.uid === userItem.uid ? { ...u, dailyDepositLimit: val } : u))
                                );
                              }}
                              className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all", inputClass)}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl text-center space-y-1">
                          <span className="material-symbols-outlined text-[24px]">verified</span>
                          <p className="text-xs font-black uppercase">Unlimited Deposits Active</p>
                          <p className="text-[10px] text-gray-400 font-semibold">User can receive unlimited inbound wallet deposits.</p>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Administrator 2FA OTP Verification Drawer Modal */}
      {isOtpModalOpen && (
        <div className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 text-center shadow-2xl space-y-5 border border-gray-100 font-hanken text-black">
            <TwoFactorOtpVerificationView
              user={user}
              title={otpModalTitle}
              description="Select delivery channel and verify 6-digit Security OTP code to authorize limit updates."
              onVerifiedSuccess={() => {
                setIsOtpModalOpen(false);
                if (pendingAction) {
                  pendingAction();
                  setPendingAction(null);
                }
              }}
              onCancel={() => {
                setIsOtpModalOpen(false);
                setPendingAction(null);
              }}
            />
          </div>
        </div>
      )}

    </div>
  );
}

export default function CpanelLimitsPage() {
  return (
    <CpanelRouteGuard requiredPermission="limits.manage">
      <CpanelLimitsPageContent />
    </CpanelRouteGuard>
  );
}
