"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { useAppConfig } from "@/lib/ConfigContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  role: string;
  kycStatus: string;
  balance: number;
  bonusBalance: number;
  usdBalance?: number;
  xofBalance?: number;
  createdAt: string;
}

interface TransferTarget {
  bankName?: string;
  bankCode?: string | null;
  accountNumber?: string;
  accountName?: string;
}

interface TransferSource {
  senderName?: string;
  bankName?: string;
  accountNumber?: string;
}

interface TransactionItem {
  id: string;
  amount: number;
  fee?: number;
  vat?: number;
  markup?: number;
  totalDebited?: number;
  totalCredited?: number;
  type: string;
  category?: string;
  direction?: string;
  status: string;
  description: string;
  narration?: string | null;
  createdAt: string;
  reference: string;
  transferTo?: TransferTarget;
  transferFrom?: TransferSource;
}

interface InvestmentItem {
  id: string;
  amount: number;
  interestRate: number;
  status: string;
  createdAt: string;
  maturesAt: string;
  description: string;
}

const ButtonSpinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

function AdminUserHistoryPageContent() {
  const { user, userData } = useAuth();
  const { config } = useAppConfig();
  const router = useRouter();

  // Theme support
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("cpanel_theme");
      if (cached === "dark" || cached === "light") {
        setTheme(cached);
      }
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      if (typeof window !== "undefined") {
        localStorage.setItem("cpanel_theme", next);
      }
      return next;
    });
  };

  const isDark = theme === "dark";
  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full";

  // Admin lock validation
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Check cookie-based admin session on mount
  useEffect(() => {
    const checkCPanelSession = async () => {
      try {
        const res = await fetch("/api/admin/auth/session");
        const data = await res.json();
        if (res.ok && data.success && data.user) {
          setIsAdminUnlocked(true);
          setAdminEmail(data.user.email);
        }
      } catch (err) {
        console.warn("No active admin cookie session found on mount:", err);
      }
    };
    checkCPanelSession();
  }, []);

  // Pre-fill admin email when user loads as fallback
  useEffect(() => {
    if (user?.email && !adminEmail) {
      setAdminEmail(user.email);
    }
  }, [user, adminEmail]);

  // Search Results States
  const [searchQuery, setSearchTerm] = useState("");
  const [targetUser, setTargetUser] = useState<UserProfile | null>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [investments, setInvestments] = useState<InvestmentItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(20);

  // Selected Transaction Modal State
  const [selectedTx, setSelectedTx] = useState<TransactionItem | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    if (!text || text === "N/A") {
      toast.error(`No ${label} available to copy.`);
      return;
    }
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const fetchUserHistory = async (customLimit?: number) => {
    const limitVal = customLimit || historyLimit;
    setIsLoading(true);
    try {
      const isMock = sessionStorage.getItem("mock") === "true";
      let idToken = "mock-admin-token";
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch(`/api/admin/user-history?search=${encodeURIComponent(searchQuery.trim())}&limit=${limitVal}`, {
        headers: {
          "Authorization": `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (!data.user) {
          toast.error(data.error || "No matching account found.");
          setTargetUser(null);
        } else {
          setTargetUser(data.user);
          setTransactions(data.transactions || []);
          setInvestments(data.investments || []);
        }
      } else {
        toast.error(data.error || "Failed to parse query.");
      }
    } catch {
      toast.error("Network communication failure searching user profile.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      toast.warning("Please enter a user email or phone prefix to search.");
      return;
    }
    setHistoryLimit(20);
    setTargetUser(null);
    setTransactions([]);
    setInvestments([]);
    await fetchUserHistory(20);
    toast.success("User timeline populated!");
  };

  const handleAdminVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingPin(true);

    if (!adminEmail.trim()) {
      toast.error("Please enter your admin email address.");
      setIsVerifyingPin(false);
      return;
    }

    if (!adminPin || adminPin.length < 4) {
      toast.error("Please enter your 4-digit Access PIN.");
      setIsVerifyingPin(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: adminEmail,
          pin: adminPin,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsAdminUnlocked(true);
        toast.success(data.message || "Identity PIN Verified. Access Granted!");
      } else {
        toast.error(data.error || "Invalid Email or Access PIN!");
      }
    } catch {
      toast.error("API connection error during verification.");
    } finally {
      setIsVerifyingPin(false);
    }
  };

  if (!isAdminUnlocked) {
    return (
      <main className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-4 text-gray-800" style={{ marginTop: 0 }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-3xl p-8 border border-gray-200 flex flex-col items-center text-center space-y-6"
        >
          <div className="w-16 h-16 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FC7A00]">
            <span className="material-symbols-outlined text-[36px]" style={{ fontVariationSettings: '"FILL" 1' }}>gpp_maybe</span>
          </div>

          <div>
            <h2 className="font-hanken font-extrabold text-2xl tracking-tight text-gray-900 leading-tight">Admin Gatekeeper</h2>
            <p className="font-hanken text-xs text-gray-500 mt-1.5 font-semibold leading-relaxed">
              Enter your administrative credentials to securely search and audit user transactions and history logs.
            </p>
          </div>

          <form onSubmit={handleAdminVerify} className="w-full space-y-4">
            <div className="space-y-1.5 text-left">
              <label className="font-hanken text-[11px] uppercase tracking-wider font-extrabold text-[#FC7A00]">Admin Email Address</label>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-left font-sans text-xs text-gray-900 placeholder-gray-300 outline-none focus:border-[#FC7A00] focus:bg-white transition-all"
              />
            </div>

            <div className="space-y-1.5 text-left">
              <label className="font-hanken text-[11px] uppercase tracking-wider font-extrabold text-[#FC7A00]">Admin Access PIN</label>
              <input
                type="password"
                maxLength={6}
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                placeholder="Enter 4-digit Access PIN"
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 text-center font-mono font-bold text-xl text-gray-900 placeholder-gray-300 outline-none focus:border-[#FC7A00] focus:bg-white transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isVerifyingPin}
              className="w-full py-4 bg-[#FC7A00] text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-[#e06600] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isVerifyingPin ? <><ButtonSpinner /> Verifying Authority...</> : "Verify Authority"}
            </button>
          </form>
        </motion.div>
      </main>
    );
  }

  return (
    <main
      className={cn(
        "min-h-screen flex flex-col font-hanken !mt-0 relative transition-colors duration-300",
        isDark ? "bg-gray-950 text-gray-100" : "bg-gray-50 text-gray-800"
      )}
      style={{ marginTop: 0 }}
    >
      {/* Top Header Row with Back Button */}
      <div role="banner" className={cn(
        "flex justify-between items-center px-8 py-5 border-b transition-colors duration-300",
        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
      )}>
        <div className="flex items-center gap-4">
          <Link
            href="/cpanel"
            className={cn(
              "w-10 h-10 rounded-full border flex items-center justify-center transition-all cursor-pointer hover:brightness-110",
              isDark ? "border-gray-700 bg-gray-800 text-white" : "border-gray-200 bg-white text-gray-800"
            )}
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <div>
            <h1 className={cn("font-hanken font-extrabold text-lg", isDark ? "text-white" : "text-gray-800")}>
              User Ledger Audits
            </h1>
            <p className="text-xs text-gray-400 font-semibold uppercase mt-0.5 tracking-wider font-hanken">Secure User Profiles & Transactions Inspector</p>
          </div>
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
          <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
        </button>
      </div>

      <div className="p-4 md:p-8 overflow-y-auto flex-1 max-w-5xl w-full mx-auto space-y-6 pb-24 md:pb-8">
        {/* Search bar form */}
        <div className={cn("rounded-2xl p-6 border transition-all duration-300 space-y-4", panelClass)}>
          <div>
            <h3 className="font-extrabold text-sm uppercase">Secure Profile Search Engine</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Audit user account profiles, transaction ledgers, and placements</p>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                required
                value={searchQuery}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Enter exact email address or complete phone prefix (e.g. jules@example.com)"
                className={cn(inputClass, "pl-10 pr-4 h-11")}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-3 bg-black hover:bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-wider active:scale-95 disabled:opacity-50 flex-shrink-0 cursor-pointer"
            >
              {isLoading ? <ButtonSpinner /> : "Inspect Profile"}
            </button>
          </form>
        </div>

        {/* Dynamic User Profile Display Panels */}
        <AnimatePresence mode="wait">
          {isLoading ? (
            <div className="py-24 text-center text-gray-400 text-xs font-bold uppercase tracking-widest animate-pulse flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-3 border-gray-200 border-t-[#FC7A00] animate-spin" />
              <span>Querying database timelines securely...</span>
            </div>
          ) : targetUser ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Profile Card Summary & Balances */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {/* Profile card */}
                <div className={cn("p-5 rounded-2xl border transition-colors duration-300 md:col-span-1 space-y-4", panelClass)}>
                  <div className="border-b pb-3.5">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[#FC7A00]">Account Summary</h4>
                    <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Enriched user profile meta-data</p>
                  </div>

                  <div className="space-y-3.5">
                    <div>
                      <p className="text-[10px] font-black uppercase text-gray-400">Legal Name</p>
                      <p className="font-extrabold text-sm mt-0.5 leading-tight">{targetUser.name}</p>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase text-gray-400">Email Address</p>
                      <p className="font-semibold text-xs text-gray-400 mt-0.5 break-all select-all leading-tight">{targetUser.email}</p>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase text-gray-400">Phone Number</p>
                      <p className="font-mono text-xs font-semibold text-gray-400 mt-0.5 select-all leading-tight">{targetUser.phoneNumber}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] font-black uppercase text-gray-400">KYC Status</p>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider inline-block mt-0.5 border",
                          targetUser.kycStatus === "APPROVED" || targetUser.kycStatus === "VERIFIED"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        )}>
                          {targetUser.kycStatus}
                        </span>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-gray-400">System Role</p>
                        <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-gray-500/10 text-gray-400 border border-gray-500/20 inline-block mt-0.5">
                          {targetUser.role}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Main Balance card */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/90 to-orange-600/90 border border-orange-400/30 text-white shadow-xs flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase text-orange-100 tracking-wider">NGN Wallet Balance</p>
                    <p className="font-mono text-xl font-black mt-2 leading-none">
                      ₦{targetUser.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <p className="text-[9px] text-orange-200 font-bold uppercase tracking-wider mt-3">NGN Reserve Balance</p>
                </div>

                {/* USD Balance card */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-500/90 to-blue-600/90 border border-indigo-400/30 text-white shadow-xs flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase text-indigo-100 tracking-wider">USD Wallet Balance</p>
                    <p className="font-mono text-xl font-black mt-2 leading-none">
                      ${(targetUser.usdBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <p className="text-[9px] text-indigo-200 font-bold uppercase tracking-wider mt-3">USD Reserve Balance</p>
                </div>

                {/* XOF Balance card */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-fuchsia-500/90 to-pink-600/90 border border-fuchsia-400/30 text-white shadow-xs flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase text-fuchsia-100 tracking-wider">XOF Wallet Balance</p>
                    <p className="font-mono text-xl font-black mt-2 leading-none">
                      CFA{(targetUser.xofBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <p className="text-[9px] text-fuchsia-200 font-bold uppercase tracking-wider mt-3">XOF Reserve Balance</p>
                </div>

                {/* Bonus Balance card */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-teal-500/90 to-emerald-600/90 border border-teal-400/30 text-white shadow-xs flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase text-teal-100 tracking-wider">Bonus Wallet Balance</p>
                    <p className="font-mono text-xl font-black mt-2 leading-none">
                      ₦{targetUser.bonusBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <p className="text-[9px] text-teal-200 font-bold uppercase tracking-wider mt-3">Commissions & Referrals</p>
                </div>
              </div>

              {/* Transactions list card */}
              <div className={cn("p-6 rounded-2xl border transition-colors duration-300 space-y-4", panelClass)}>
                <div className="border-b pb-3.5 flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-black uppercase text-[#FC7A00] tracking-wider">Transaction History Log</h4>
                    <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Click any row to inspect complete transfer routing & copy reference details ({transactions.length})</p>
                  </div>
                </div>

                <div className="overflow-x-auto pr-1">
                  {transactions.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 uppercase font-black text-xs">
                      No transactional logs exist for this account.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-gray-250 dark:border-gray-800 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                          <th className="pb-3 pl-2">Description</th>
                          <th className="pb-3 text-right">Amount</th>
                          <th className="pb-3 text-center">Type</th>
                          <th className="pb-3 text-center">Status</th>
                          <th className="pb-3 text-center">Reference ID</th>
                          <th className="pb-3 text-center">Timestamp</th>
                          <th className="pb-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-150 dark:divide-gray-850">
                        {transactions.map((tx) => {
                          const isCredit = tx.type === "DEPOSIT" || tx.type === "REFUND";
                          const isSuccess = tx.status === "SUCCESSFUL" || tx.status === "SUCCESS";
                          return (
                            <tr
                              key={tx.id}
                              onClick={() => setSelectedTx(tx)}
                              className="hover:bg-gray-50/80 dark:hover:bg-gray-900/40 cursor-pointer transition-colors"
                            >
                              <td className="py-3 pl-2 max-w-[200px] truncate" title={tx.description}>
                                <p className="font-extrabold text-xs">{tx.description}</p>
                              </td>
                              <td className={cn(
                                "py-3 text-right font-mono font-black text-xs",
                                isCredit ? "text-emerald-500" : (isDark ? "text-white" : "text-gray-900")
                              )}>
                                {isCredit ? "+" : "-"}₦{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 text-center font-bold">
                                <span className="px-2 py-0.5 rounded text-[8px] bg-gray-500/10 border border-gray-500/20 text-gray-400 font-black uppercase tracking-wider">
                                  {tx.type}
                                </span>
                              </td>
                              <td className="py-3 text-center">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider",
                                  isSuccess
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                                )}>
                                  {tx.status}
                                </span>
                              </td>
                              <td className="py-3 text-center font-mono text-[9px] text-gray-500 break-all">
                                {tx.reference}
                              </td>
                              <td className="py-3 text-center text-gray-400 text-[10px] font-semibold font-mono">
                                {new Date(tx.createdAt).toLocaleString()}
                              </td>
                              <td className="py-3 text-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTx(tx);
                                  }}
                                  className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-[#FC7A00]/10 text-[#FC7A00] border border-[#FC7A00]/20 hover:bg-[#FC7A00]/20 transition-all cursor-pointer"
                                >
                                  Inspect
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {transactions.length >= historyLimit && (
                  <div className="pt-4 text-center border-t" style={{ borderColor: isDark ? "#1f2937" : "#e5e7eb" }}>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={async () => {
                        const nextLimit = historyLimit + 20;
                        setHistoryLimit(nextLimit);
                        await fetchUserHistory(nextLimit);
                      }}
                      className={cn(
                        "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 mx-auto",
                        isDark ? "bg-gray-800 text-[#FC7A00] border border-gray-700 hover:bg-gray-750" : "bg-orange-50 text-[#FC7A00] border border-orange-100 hover:bg-orange-100/50"
                      )}
                    >
                      {isLoading ? <ButtonSpinner /> : "Load More Logs"}
                    </button>
                  </div>
                )}
              </div>

              {/* Fixed Deposits list card */}
              {investments.length > 0 && (
                <div className={cn("p-6 rounded-2xl border transition-colors duration-300 space-y-4", panelClass)}>
                  <div className="border-b pb-3.5">
                    <h4 className="text-xs font-black uppercase text-[#FC7A00] tracking-wider">Fixed Deposits Placements</h4>
                    <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Savings placements & matures logs ({investments.length})</p>
                  </div>

                  <div className="overflow-x-auto pr-1">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-gray-250 dark:border-gray-800 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                          <th className="pb-3 pl-2">Savings Plan</th>
                          <th className="pb-3 text-right">Principal</th>
                          <th className="pb-3 text-center">Accrued Yield</th>
                          <th className="pb-3 text-center">Status</th>
                          <th className="pb-3 text-center">Timeline</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-150 dark:divide-gray-850">
                        {investments.map((inv) => {
                          const estYield = inv.amount * (Number(inv.interestRate) / 100);
                          const isActive = inv.status === "ACTIVE";
                          return (
                            <tr key={inv.id} className="hover:bg-gray-50/40 dark:hover:bg-gray-900/10">
                              <td className="py-3 pl-2">
                                <p className="font-extrabold text-xs">{inv.description}</p>
                              </td>
                              <td className="py-3 text-right font-mono font-bold text-xs">
                                ₦{inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 text-center font-mono font-black text-[#FC7A00]">
                                {inv.interestRate}% (+₦{estYield.toLocaleString()})
                              </td>
                              <td className="py-3 text-center">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider",
                                  isActive
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                )}>
                                  {inv.status}
                                </span>
                              </td>
                              <td className="py-3 text-center">
                                <p className="text-[9px] font-semibold text-gray-400">Created: {new Date(inv.createdAt).toLocaleDateString()}</p>
                                <p className="text-[9px] font-extrabold text-[#FC7A00] mt-0.5">Matures: {new Date(inv.maturesAt).toLocaleDateString()}</p>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {investments.length >= historyLimit && (
                    <div className="pt-4 text-center border-t" style={{ borderColor: isDark ? "#1f2937" : "#e5e7eb" }}>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={async () => {
                          const nextLimit = historyLimit + 20;
                          setHistoryLimit(nextLimit);
                          await fetchUserHistory(nextLimit);
                        }}
                        className={cn(
                          "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 mx-auto",
                          isDark ? "bg-gray-800 text-[#FC7A00] border border-gray-700 hover:bg-gray-750" : "bg-orange-50 text-[#FC7A00] border border-orange-100 hover:bg-orange-100/50"
                        )}
                      >
                        {isLoading ? <ButtonSpinner /> : "Load More Deposits"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <div className={cn("border rounded-xl p-8 text-center space-y-1.5", isDark ? "border-orange-950/30 bg-orange-950/10 text-gray-400" : "border-orange-100 bg-orange-50/30 text-gray-500")}>
              <span className="material-symbols-outlined text-[32px] text-[#FC7A00]" style={{ fontVariationSettings: '"FILL" 1' }}>query_stats</span>
              <p className={cn("font-black text-xs uppercase", isDark ? "text-white" : "text-gray-800")}>No Loaded Ledger</p>
              <p className="text-[11px] leading-normal max-w-sm mx-auto font-medium">
                To secure our database reads, please enter an exact user email address or phone prefix in the search panel above to fetch timelines and full financial ledgers.
              </p>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Transaction Full Details Drawer / Modal */}
      <AnimatePresence>
        {selectedTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={cn(
                "w-full max-w-lg rounded-3xl p-6 border shadow-2xl relative space-y-5 overflow-y-auto max-h-[90vh]",
                isDark ? "bg-[#111827] border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900"
              )}
            >
              {/* Modal Header */}
              <div className="flex justify-between items-start border-b pb-4" style={{ borderColor: isDark ? "#1f2937" : "#f3f4f6" }}>
                <div>
                  <span className={cn(
                    "px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border inline-block mb-1",
                    selectedTx.type === "DEPOSIT" || selectedTx.type === "REFUND"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                  )}>
                    {selectedTx.type} ({selectedTx.status})
                  </span>
                  <h3 className="font-extrabold text-lg leading-tight">{selectedTx.description}</h3>
                  <p className="text-[10px] text-gray-400 font-semibold font-mono mt-0.5">
                    {new Date(selectedTx.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  className={cn(
                    "w-8 h-8 rounded-full border flex items-center justify-center text-gray-400 transition-colors cursor-pointer",
                    isDark ? "border-gray-800 hover:bg-gray-800 hover:text-white" : "border-gray-200 hover:bg-gray-100 hover:text-black"
                  )}
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Amount Breakdown */}
              <div className={cn("p-4 rounded-2xl border flex flex-col gap-2", isDark ? "bg-gray-900/60 border-gray-800" : "bg-gray-50 border-gray-200")}>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-gray-400">Principal Amount</span>
                  <span className="font-mono font-black text-sm">₦{selectedTx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                {selectedTx.fee !== undefined && selectedTx.fee > 0 && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[10px] font-black uppercase text-gray-400">Transfer Fee</span>
                    <span className="font-mono text-gray-400">₦{selectedTx.fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {selectedTx.totalDebited !== undefined && selectedTx.totalDebited > 0 && (
                  <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: isDark ? "#374151" : "#e5e7eb" }}>
                    <span className="text-[10px] font-black uppercase text-[#FC7A00]">Total Debit Deduction</span>
                    <span className="font-mono font-black text-base text-[#FC7A00]">₦{selectedTx.totalDebited.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>

              {/* Reference ID Block with Copy Button */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Transaction / Reference ID</label>
                <div className={cn("flex items-center justify-between p-3 rounded-2xl border font-mono text-xs font-bold", isDark ? "bg-gray-900 border-gray-800 text-orange-400" : "bg-orange-50/50 border-orange-100 text-orange-600")}>
                  <span className="break-all select-all pr-2">{selectedTx.reference}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(selectedTx.reference, "Reference ID")}
                    className="p-1.5 rounded-lg bg-[#FC7A00] text-white hover:bg-[#e06600] active:scale-95 transition-all cursor-pointer flex-shrink-0"
                    title="Copy Reference ID"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                  </button>
                </div>
              </div>

              {/* Transfer To (Recipient Destination) Details */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#FC7A00]">
                  <span className="material-symbols-outlined text-[16px]">south_east</span>
                  <span>Transfer To (Destination Bank & Beneficiary)</span>
                </div>
                <div className={cn("p-4 rounded-2xl border space-y-2.5", isDark ? "bg-gray-900/50 border-gray-800" : "bg-white border-gray-200")}>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[9px] font-black uppercase text-gray-400">Recipient Name</p>
                      <p className="font-bold text-xs mt-0.5">{selectedTx.transferTo?.accountName || "N/A"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedTx.transferTo?.accountName || "", "Recipient Name")}
                      className="text-[10px] text-gray-400 hover:text-[#FC7A00] font-black uppercase flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">content_copy</span> Copy
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t" style={{ borderColor: isDark ? "#1f2937" : "#f3f4f6" }}>
                    <div>
                      <p className="text-[9px] font-black uppercase text-gray-400">Destination Bank</p>
                      <div className="flex items-center justify-between pr-2">
                        <p className="font-extrabold text-xs text-[#FC7A00] mt-0.5">{selectedTx.transferTo?.bankName || "N/A"}</p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(selectedTx.transferTo?.bankName || "", "Destination Bank")}
                          className="text-gray-400 hover:text-[#FC7A00] cursor-pointer"
                          title="Copy Bank Name"
                        >
                          <span className="material-symbols-outlined text-[12px]">content_copy</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase text-gray-400">Account Number</p>
                      <div className="flex items-center justify-between pr-2">
                        <p className="font-mono font-extrabold text-xs mt-0.5 select-all">{selectedTx.transferTo?.accountNumber || "N/A"}</p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(selectedTx.transferTo?.accountNumber || "", "Account Number")}
                          className="text-gray-400 hover:text-[#FC7A00] cursor-pointer"
                          title="Copy Account Number"
                        >
                          <span className="material-symbols-outlined text-[12px]">content_copy</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transfer From (Sender Originator) Details */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-emerald-500">
                  <span className="material-symbols-outlined text-[16px]">north_west</span>
                  <span>Transfer From (Originating Sender & Bank)</span>
                </div>
                <div className={cn("p-4 rounded-2xl border space-y-2.5", isDark ? "bg-gray-900/50 border-gray-800" : "bg-white border-gray-200")}>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[9px] font-black uppercase text-gray-400">Sender / Originator Name</p>
                      <p className="font-bold text-xs mt-0.5">{selectedTx.transferFrom?.senderName || targetUser?.name || "N/A"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(selectedTx.transferFrom?.senderName || targetUser?.name || "", "Sender Name")}
                      className="text-[10px] text-gray-400 hover:text-emerald-500 font-black uppercase flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">content_copy</span> Copy
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t" style={{ borderColor: isDark ? "#1f2937" : "#f3f4f6" }}>
                    <div>
                      <p className="text-[9px] font-black uppercase text-gray-400">Originating Bank</p>
                      <div className="flex items-center justify-between pr-2">
                        <p className="font-extrabold text-xs text-emerald-500 mt-0.5">{selectedTx.transferFrom?.bankName || "E-Global Pay"}</p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(selectedTx.transferFrom?.bankName || "E-Global Pay", "Originating Bank")}
                          className="text-gray-400 hover:text-emerald-500 cursor-pointer"
                          title="Copy Originating Bank"
                        >
                          <span className="material-symbols-outlined text-[12px]">content_copy</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase text-gray-400">Sender Account</p>
                      <div className="flex items-center justify-between pr-2">
                        <p className="font-mono font-extrabold text-xs mt-0.5 select-all">{selectedTx.transferFrom?.accountNumber || "N/A"}</p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(selectedTx.transferFrom?.accountNumber || "", "Sender Account")}
                          className="text-gray-400 hover:text-emerald-500 cursor-pointer"
                          title="Copy Sender Account"
                        >
                          <span className="material-symbols-outlined text-[12px]">content_copy</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Narration if available */}
              {selectedTx.narration && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-gray-400">Narration / Remark</p>
                  <p className={cn("p-3 rounded-xl border text-xs font-semibold italic", isDark ? "bg-gray-900 border-gray-800 text-gray-300" : "bg-gray-50 border-gray-200 text-gray-700")}>
                    &ldquo;{selectedTx.narration}&rdquo;
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const fullSnippet = `Transaction Reference: ${selectedTx.reference}\nAmount: ₦${selectedTx.amount}\nStatus: ${selectedTx.status}\nTransfer To: ${selectedTx.transferTo?.accountName} (${selectedTx.transferTo?.bankName} - ${selectedTx.transferTo?.accountNumber})\nTransfer From: ${selectedTx.transferFrom?.senderName} (${selectedTx.transferFrom?.bankName} - ${selectedTx.transferFrom?.accountNumber})`;
                    copyToClipboard(fullSnippet, "Full Transaction Audit Record");
                  }}
                  className="flex-1 py-3 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <span className="material-symbols-outlined text-[16px]">content_copy</span>
                  <span>Copy Full Audit Record</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  className={cn(
                    "px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer",
                    isDark ? "border-gray-700 hover:bg-gray-800 text-gray-300" : "border-gray-200 hover:bg-gray-100 text-gray-700"
                  )}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default function AdminUserHistoryPage() {
  return (
    <CpanelRouteGuard requiredPermission="user_history.view">
      <AdminUserHistoryPageContent />
    </CpanelRouteGuard>
  );
}
