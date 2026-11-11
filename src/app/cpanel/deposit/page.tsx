"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import Link from "next/link";

const ButtonSpinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

interface CustomerProfile {
  uid: string;
  name: string;
  email: string;
  phoneNumber?: string;
  photoURL?: string | null;
  virtualAccountNumber?: string | null;
  virtualAccountBankName?: string | null;
  balances: Record<string, number>;
}

interface DepositLog {
  id: string;
  reference: string;
  userId: string;
  amount: number;
  currency: string;
  description: string;
  adminEmail?: string;
  createdAt: string;
}

function AdminDepositPageContent() {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useCpanelTheme();

  // Panel Styling
  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full px-3.5 py-2.5 text-xs outline-none font-semibold w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full px-3.5 py-2.5 text-xs outline-none font-semibold w-full";

  // Data & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Deposit Audit Logs Pagination States
  const [depositLogs, setDepositLogs] = useState<DepositLog[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogsCount, setTotalLogsCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [lastDocId, setLastDocId] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  // Deposit Form Drawer Modal
  const [selectedUser, setSelectedRequestUser] = useState<CustomerProfile | null>(null);
  const [depositCurrency, setDepositCurrency] = useState<string>("NGN");
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [depositNarration, setDepositNarration] = useState<string>("");
  const [isExecutingDeposit, setIsExecutingDeposit] = useState(false);

  // 4-Digit Admin Access PIN Verification Modal
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", ""]);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  useEffect(() => {
    fetchDepositLogs();
  }, [user]);

  const fetchDepositLogs = async (cursorDocId?: string, direction?: "next" | "prev") => {
    setIsLogsLoading(true);
    try {
      let idToken = "mock-admin-token";
      if (user) {
        idToken = await user.getIdToken();
      }

      let url = "/api/admin/deposit?limit=10";
      if (cursorDocId) {
        url += `&lastDocId=${encodeURIComponent(cursorDocId)}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setDepositLogs(data.depositLogs || []);
        setTotalLogsCount(data.totalLogsCount || 0);
        setHasMore(Boolean(data.hasMore));
        setLastDocId(data.lastDocId || null);

        if (direction === "next" && lastDocId) {
          setCursorStack((prev) => [...prev, lastDocId]);
          setCurrentPage((prev) => prev + 1);
        } else if (direction === "prev") {
          setCursorStack((prev) => prev.slice(0, -1));
          setCurrentPage((prev) => Math.max(1, prev - 1));
        } else if (!direction) {
          setCursorStack([]);
          setCurrentPage(1);
        }
      }
    } catch (err) {
      console.warn("Failed to load deposit audit logs:", err);
    } finally {
      setIsLogsLoading(false);
    }
  };

  const handleNextPage = () => {
    if (!hasMore || !lastDocId || isLogsLoading) return;
    fetchDepositLogs(lastDocId, "next");
  };

  const handlePrevPage = () => {
    if (currentPage <= 1 || isLogsLoading) return;
    const previousCursor = cursorStack[cursorStack.length - 2] || undefined;
    fetchDepositLogs(previousCursor, "prev");
  };

  const handleSearchUsers = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      toast.error("Please enter a customer name, email, phone, or account number.");
      return;
    }

    setIsSearching(true);
    try {
      let idToken = "mock-admin-token";
      if (user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch(`/api/admin/deposit?query=${encodeURIComponent(searchQuery.trim())}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSearchResults(data.searchResults || []);
        if ((data.searchResults || []).length === 0) {
          toast.info("No customer profiles matched your query.");
        }
      } else {
        toast.error(data.error || "Failed to search customer profiles.");
      }
    } catch {
      toast.error("Network communication error searching customers.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleOpenDepositDrawer = (customer: CustomerProfile) => {
    setSelectedRequestUser(customer);
    setDepositCurrency("NGN");
    setDepositAmount("");
    setDepositNarration("");
  };

  const handlePreSubmitValidation = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUser) return;

    const numAmt = Number(depositAmount);
    if (!numAmt || isNaN(numAmt) || numAmt <= 0) {
      toast.error("Please enter a valid positive deposit amount.");
      return;
    }

    // Open PIN verification modal
    setPinDigits(["", "", "", ""]);
    setIsPinModalOpen(true);
  };

  const handlePinDigitPress = (digit: string) => {
    const emptyIdx = pinDigits.findIndex((d) => d === "");
    if (emptyIdx !== -1) {
      const updated = [...pinDigits];
      updated[emptyIdx] = digit;
      setPinDigits(updated);

      if (emptyIdx === 3) {
        const fullPin = updated.join("");
        executeVerifiedDeposit(fullPin);
      }
    }
  };

  const handlePinBackspace = () => {
    const lastFilledIdx = pinDigits.map((d) => d !== "").lastIndexOf(true);
    if (lastFilledIdx !== -1) {
      const updated = [...pinDigits];
      updated[lastFilledIdx] = "";
      setPinDigits(updated);
    }
  };

  const handlePinClear = () => {
    setPinDigits(["", "", "", ""]);
  };

  const executeVerifiedDeposit = async (enteredPin: string) => {
    if (!selectedUser) return;
    setIsVerifyingPin(true);
    toast.loading("Verifying administrative PIN...");

    try {
      let idToken = "mock-admin-token";
      if (user) {
        idToken = await user.getIdToken();
      }

      // 1. Verify 4-digit Transaction PIN first
      const verifyRes = await fetch("/api/auth/pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "verify", pin: enteredPin }),
      });

      const verifyData = await verifyRes.json();
      toast.dismiss();

      if (!verifyRes.ok || !verifyData.success) {
        toast.error(verifyData.error || "Invalid 4-digit Access PIN. Deposit aborted.");
        setPinDigits(["", "", "", ""]);
        setIsVerifyingPin(false);
        return;
      }

      setIsPinModalOpen(false);
      setIsExecutingDeposit(true);
      toast.loading(`Crediting ${selectedUser.name}'s ${depositCurrency} wallet...`);

      // 2. Post deposit payload
      const res = await fetch("/api/admin/deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          targetUid: selectedUser.uid,
          currency: depositCurrency,
          amount: Number(depositAmount),
          narration: depositNarration.trim(),
        }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || "Wallet credited successfully!");

        // Update local balance state in searchResults
        setSearchResults((prev) =>
          prev.map((c) =>
            c.uid === selectedUser.uid
              ? {
                  ...c,
                  balances: {
                    ...c.balances,
                    [depositCurrency]: data.newBalance ?? (c.balances[depositCurrency] + Number(depositAmount)),
                  },
                }
              : c
          )
        );

        setSelectedRequestUser(null);
        fetchDepositLogs();
      } else {
        toast.error(data.error || "Failed to credit customer wallet.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network communication error executing deposit.");
    } finally {
      setIsExecutingDeposit(false);
      setIsVerifyingPin(false);
    }
  };

  const getCurrencySymbol = (curr: string) => {
    switch (curr?.toUpperCase()) {
      case "USD":
        return "$";
      case "EUR":
        return "€";
      case "GBP":
        return "£";
      case "XOF":
        return "CFA";
      default:
        return "₦";
    }
  };

  return (
    <div className={cn("min-h-screen flex flex-col font-sans transition-colors duration-300", isDark ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-800")}>

      {/* Header Bar */}
      <div className={cn("sticky top-0 z-40 border-b transition-colors duration-300 px-6 py-4 flex items-center justify-between", isDark ? "bg-gray-950/80 backdrop-blur-md border-gray-850" : "bg-white/80 backdrop-blur-md border-gray-200")}>
        <div className="flex items-center gap-3">
          <Link href="/cpanel" className={cn("w-9 h-9 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")}>
            <span className="material-symbols-outlined text-[18px] font-bold">arrow_back</span>
          </Link>
          <div>
            <h1 className="font-extrabold text-base tracking-tight leading-tight">Deposit Fund Console</h1>
            <p className="text-[10px] text-gray-400 font-semibold">Search customers, inspect currency balances, and credit customer wallets directly.</p>
          </div>
        </div>

        <button onClick={toggleTheme} className={cn("w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer", isDark ? "bg-gray-900 border-gray-800 text-amber-400 hover:bg-gray-800" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50")}>
          <span className="material-symbols-outlined text-[20px]">{isDark ? "light_mode" : "dark_mode"}</span>
        </button>
      </div>

      <div className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">

        {/* Search Customer Card */}
        <div className={cn("rounded-2xl p-6 border transition-all shadow-none space-y-4", panelClass)}>
          <div className="flex items-center gap-2 border-b pb-3 border-gray-200/50">
            <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">search</span>
            <h3 className="font-black text-sm uppercase tracking-wider">Search Customer Profile</h3>
          </div>

          <form onSubmit={handleSearchUsers} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search by customer full name, email, phone number, virtual account number, or UID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={isSearching}
              className="px-6 py-2.5 bg-[#FC7A00] hover:bg-[#e06600] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSearching ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">search</span>}
              <span>Search Customer</span>
            </button>
          </form>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="pt-2 space-y-3">
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Matched Customer Profiles ({searchResults.length}):</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {searchResults.map((customer) => (
                  <div
                    key={customer.uid}
                    className={cn("p-4 border rounded-2xl space-y-3 transition-all", isDark ? "bg-gray-900/60 border-gray-800" : "bg-gray-50 border-gray-200")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full border border-[#FC7A00]/30 bg-orange-500/10 flex items-center justify-center overflow-hidden shrink-0">
                          {customer.photoURL ? (
                            <img src={customer.photoURL} alt={customer.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="font-black text-[#FC7A00] text-sm">
                              {customer.name ? customer.name.slice(0, 2).toUpperCase() : "US"}
                            </span>
                          )}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xs text-gray-900 dark:text-white">{customer.name}</h4>
                          <p className="text-[11px] text-gray-400 font-medium select-all">{customer.email}</p>
                          {customer.phoneNumber && <p className="text-[10px] font-mono text-gray-400">{customer.phoneNumber}</p>}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenDepositDrawer(customer)}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95 flex items-center gap-1.5 shrink-0"
                      >
                        <span className="material-symbols-outlined text-[16px]">add_card</span>
                        <span>Deposit Fund</span>
                      </button>
                    </div>

                    {/* Virtual Account & Multi-currency balances breakdown */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-gray-200/40 dark:border-gray-800">
                      {["NGN", "USD", "XOF", "EUR", "GBP"].map((curr) => {
                        const bal = customer.balances[curr] ?? 0;
                        const sym = getCurrencySymbol(curr);
                        return (
                          <div key={curr} className="bg-white dark:bg-gray-950 p-2.5 rounded-xl border border-gray-150 dark:border-gray-800 text-center">
                            <span className="text-[9px] font-black uppercase text-gray-400 block">{curr} Balance</span>
                            <p className="font-mono font-extrabold text-xs text-gray-900 dark:text-white mt-0.5">
                              {sym}{bal.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Deposit Audit Logs Table */}
        <div className={cn("rounded-2xl p-6 border transition-all shadow-none space-y-4", panelClass)}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 border-gray-200/50">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FC7A00] text-[20px]">history</span>
              <h3 className="font-black text-xs uppercase tracking-wider">Recent Administrative Deposits Audit Log</h3>
            </div>

            {totalLogsCount > 0 && (
              <span className="text-[10px] font-mono font-bold uppercase text-gray-400">
                Total Audit Records: {totalLogsCount.toLocaleString()}
              </span>
            )}
          </div>

          {depositLogs.length === 0 ? (
            <div className="text-center py-12 border border-dashed rounded-2xl p-6 text-gray-400 text-xs font-bold uppercase tracking-widest">
              {isLogsLoading ? "Loading deposit logs..." : "No recent deposit audit records."}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={cn("border-b text-[10px] font-black uppercase tracking-wider", isDark ? "border-gray-800 text-gray-400" : "border-gray-200 text-gray-500")}>
                    <th className="py-3 px-3">Reference ID</th>
                    <th className="py-3 px-3">Target Customer UID</th>
                    <th className="py-3 px-3">Currency & Amount</th>
                    <th className="py-3 px-3">Narration</th>
                    <th className="py-3 px-3">Admin Email</th>
                    <th className="py-3 px-3 text-right">Date & Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/50 dark:divide-gray-800/50 text-xs">
                  {depositLogs.map((log) => {
                    const sym = getCurrencySymbol(log.currency || "NGN");
                    return (
                      <tr key={log.id} className={cn("transition-colors", isDark ? "hover:bg-gray-900/50" : "hover:bg-gray-50/50")}>
                        <td className="py-3.5 px-3 font-mono font-bold text-gray-900 dark:text-white select-all">
                          {log.reference || log.id}
                        </td>

                        <td className="py-3.5 px-3 font-mono text-gray-500 dark:text-gray-400 truncate max-w-[140px] select-all">
                          {log.userId}
                        </td>

                        <td className="py-3.5 px-3 font-mono font-extrabold text-emerald-500">
                          +{sym}{(Number(log.amount) || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })} ({log.currency || "NGN"})
                        </td>

                        <td className="py-3.5 px-3 text-gray-600 dark:text-gray-300 max-w-xs truncate">
                          {log.description || "Admin Deposit"}
                        </td>

                        <td className="py-3.5 px-3 text-gray-500 dark:text-gray-400 font-medium">
                          {log.adminEmail || "Admin"}
                        </td>

                        <td className="py-3.5 px-3 text-right font-mono text-[11px] text-gray-500 dark:text-gray-400">
                          {new Date(log.createdAt).toLocaleString("en-NG", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="pt-3 border-t border-gray-200/50 dark:border-gray-800 flex items-center justify-between text-xs font-bold">
              <div className="text-[11px] font-mono text-gray-400">
                Page {currentPage} {totalLogsCount > 0 ? `of ${Math.ceil(totalLogsCount / 10)}` : ""}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1 || isLogsLoading}
                  onClick={handlePrevPage}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-40 disabled:pointer-events-none",
                    isDark ? "bg-gray-800 border-gray-700 text-white hover:bg-gray-750" : "bg-gray-100 border-gray-200 text-gray-800 hover:bg-gray-200"
                  )}
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                  <span>Previous</span>
                </button>

                <button
                  type="button"
                  disabled={!hasMore || isLogsLoading}
                  onClick={handleNextPage}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-40 disabled:pointer-events-none",
                    isDark ? "bg-gray-800 border-gray-700 text-white hover:bg-gray-750" : "bg-gray-100 border-gray-200 text-gray-800 hover:bg-gray-200"
                  )}
                >
                  <span>Next</span>
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </button>
              </div>
            </div>
          </>
          )}
        </div>

      </div>

      {/* Interactive Deposit Modal Drawer */}
      <AnimatePresence>
        {selectedUser && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedRequestUser(null)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[99998]"
            />

            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
              className={cn("fixed bottom-0 left-0 right-0 max-w-lg mx-auto rounded-t-[32px] z-[99999] p-6 pb-8 shadow-2xl border-t overflow-y-auto max-h-[92vh] no-scrollbar", isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900")}
            >
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mb-5 mx-auto" />

              <div className="flex items-center justify-between border-b pb-4 mb-5 border-gray-200/50">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-500">add_card</span>
                  <h3 className="font-extrabold text-base uppercase">Deposit Fund To Account</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRequestUser(null)}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                </button>
              </div>

              <form onSubmit={handlePreSubmitValidation} className="space-y-4 text-xs">

                {/* Target Customer Summary */}
                <div className="p-4 bg-gray-50 dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-800 space-y-1">
                  <span className="text-[10px] font-black uppercase text-gray-400">Target Customer</span>
                  <p className="font-black text-sm text-gray-900 dark:text-white">{selectedUser.name}</p>
                  <p className="font-mono text-[11px] text-gray-400">{selectedUser.email}</p>
                </div>

                {/* Currency Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Select Wallet Currency *</label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {["NGN", "USD", "XOF", "EUR", "GBP"].map((curr) => {
                      const active = depositCurrency === curr;
                      return (
                        <button
                          key={curr}
                          type="button"
                          onClick={() => setDepositCurrency(curr)}
                          className={cn(
                            "py-3 rounded-xl font-mono font-black text-xs uppercase border transition-all cursor-pointer",
                            active
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                              : isDark
                              ? "bg-gray-800 border-gray-700 text-gray-300"
                              : "bg-gray-100 border-gray-200 text-gray-700"
                          )}
                        >
                          {curr} ({getCurrencySymbol(curr)})
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Active Wallet Balance Display */}
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Current {depositCurrency} Available Balance</span>
                  <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                    {getCurrencySymbol(depositCurrency)}{(selectedUser.balances[depositCurrency] ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Deposit Amount */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Deposit Amount ({getCurrencySymbol(depositCurrency)}) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="Enter deposit amount e.g. 50000"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className={cn(inputClass, "font-mono font-extrabold text-base")}
                  />
                </div>

                {/* Narration */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Deposit Narration / Reason (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Manual wallet funding credit"
                    value={depositNarration}
                    onChange={(e) => setDepositNarration(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isExecutingDeposit || !depositAmount}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow-md flex items-center justify-center gap-2"
                >
                  {isExecutingDeposit ? (
                    <>
                      <ButtonSpinner />
                      <span>Executing Deposit...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">add_card</span>
                      <span>Proceed to Verify PIN & Credit Wallet</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 4-Digit Admin Access PIN Verification Bottom Drawer Modal */}
      <AnimatePresence>
        {isPinModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPinModalOpen(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[100000]"
            />

            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
              className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white rounded-t-[32px] p-6 pb-8 text-center shadow-2xl z-[100001] border-t border-gray-100 font-hanken text-black max-h-[90vh] overflow-y-auto no-scrollbar space-y-5"
            >
              {/* Drag Handle Indicator */}
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-2" />

              <div className="flex items-center justify-between border-b pb-3 border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">lock</span>
                  </div>
                  <h4 className="font-extrabold text-base uppercase text-gray-900 text-left">Enter Access PIN</h4>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                </button>
              </div>

              <p className="text-[11px] text-gray-500 font-semibold text-left">
                Enter your 4-digit administrative Access PIN to authorize wallet credit deposit for <strong className="text-gray-900">{selectedUser?.name}</strong>.
              </p>

              {/* 4 Pin Boxes */}
              <div className="flex justify-center gap-3 py-2">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "w-12 h-12 rounded-2xl border-2 flex items-center justify-center font-mono font-black text-2xl transition-all shadow-xs",
                      pinDigits[idx] ? "border-emerald-600 bg-emerald-50/30 text-emerald-600" : "border-gray-200 text-gray-400 bg-gray-50"
                    )}
                  >
                    {pinDigits[idx] ? "•" : ""}
                  </div>
                ))}
              </div>

              {/* Numeric Keypad Grid */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                  <button
                    key={num}
                    type="button"
                    disabled={isVerifyingPin}
                    onClick={() => handlePinDigitPress(num)}
                    className="py-3.5 rounded-2xl bg-gray-100 hover:bg-gray-200 font-bold text-lg text-black active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={isVerifyingPin}
                  onClick={handlePinClear}
                  className="py-3.5 rounded-2xl bg-gray-100 hover:bg-gray-200 font-bold text-xs uppercase text-gray-600 active:scale-95 transition-all cursor-pointer"
                >
                  CLEAR
                </button>
                <button
                  type="button"
                  disabled={isVerifyingPin}
                  onClick={() => handlePinDigitPress("0")}
                  className="py-3.5 rounded-2xl bg-gray-100 hover:bg-gray-200 font-bold text-lg text-black active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  0
                </button>
                <button
                  type="button"
                  disabled={isVerifyingPin}
                  onClick={handlePinBackspace}
                  className="py-3.5 rounded-2xl bg-gray-100 hover:bg-gray-200 font-bold text-lg text-black active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-[20px]">backspace</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsPinModalOpen(false)}
                className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold uppercase rounded-2xl cursor-pointer transition-all active:scale-95"
              >
                Cancel
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}

export default function AdminDepositPage() {
  return (
    <CpanelRouteGuard requiredPermission="wallets.manage">
      <AdminDepositPageContent />
    </CpanelRouteGuard>
  );
}
