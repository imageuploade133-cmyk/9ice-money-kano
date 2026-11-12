"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { CpanelActionDropdown, CpanelActionItem } from "@/components/cpanel/CpanelActionDropdown";
import Link from "next/link";

const ButtonSpinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

interface HeldDepositRecord {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  reference: string;
  type: string;
  status: string;
  description: string;
  narration?: string;
  recipientName?: string;
  senderName?: string;
  senderAccountNumber?: string;
  senderBankName?: string;
  virtualAccountNumber?: string;
  virtualAccountBankName?: string;
  createdAt: string;
  completedAt?: string;
  metadata?: Record<string, any>;
}

interface Metrics {
  totalHeldCount: number;
  totalHeldAmount: number;
  releasedCount: number;
  releasedAmount: number;
  canceledCount: number;
}

/**
 * Helper to format timestamps into 12-hour AM/PM format (e.g., Oct 5, 2026, 6:42:15 AM)
 */
function format12HourDate(dateInput?: string | number | Date | null): string {
  if (!dateInput) return "N/A";
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return String(dateInput);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return String(dateInput);
  }
}

/**
 * Resolves sender bank name, account number, and full name across record fields & metadata
 */
function resolveSenderBankAndAccount(record: HeldDepositRecord): { bankName: string; accountNumber: string; fullName: string } {
  const meta = (record.metadata || {}) as Record<string, any>;
  const bankName =
    record.senderBankName ||
    meta.senderBankName ||
    meta.sender_bank_name ||
    meta.originatorBankName ||
    meta.originator_bank_name ||
    meta.bankName ||
    meta.bank_name ||
    "Bank";

  const accountNumber =
    record.senderAccountNumber ||
    meta.senderAccountNumber ||
    meta.sender_account_number ||
    meta.originatorAccountNumber ||
    meta.originator_account_number ||
    meta.sender_account ||
    "N/A";

  const fullName =
    record.senderName ||
    meta.senderName ||
    meta.sender_name ||
    meta.originatorName ||
    meta.originator_name ||
    meta.customer_name ||
    record.recipientName ||
    "Deposit Sender";

  return { bankName, accountNumber, fullName };
}

/**
 * Resolves virtual account bank name and virtual account number across record fields & metadata
 */
function resolveVirtualBankAndAccount(record: HeldDepositRecord): { bankName: string; accountNumber: string } {
  const meta = (record.metadata || {}) as Record<string, any>;
  const bankName =
    record.virtualAccountBankName ||
    meta.virtualAccountBankName ||
    meta.virtual_account_bank_name ||
    meta.receivingBankName ||
    meta.receiving_bank_name ||
    record.virtualAccountBankName ||
    meta.bank_name ||
    "E-Global Pay";

  const accountNumber =
    record.virtualAccountNumber ||
    meta.virtualAccountNumber ||
    meta.virtual_account_number ||
    meta.receivingAccountNumber ||
    meta.receiving_account_number ||
    record.virtualAccountNumber ||
    meta.account_number ||
    "N/A";

  return { bankName, accountNumber };
}

function HeldDepositsPageContent() {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useCpanelTheme();

  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full px-3.5 py-2.5 text-xs outline-none font-semibold w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full px-3.5 py-2.5 text-xs outline-none font-semibold w-full";

  const [records, setRecords] = useState<HeldDepositRecord[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    totalHeldCount: 0,
    totalHeldAmount: 0,
    releasedCount: 0,
    releasedAmount: 0,
    canceledCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("HELD");

  // Drawer / Inspection state
  const [selectedRecord, setSelectedRecord] = useState<HeldDepositRecord | null>(null);

  // Approval Modal state
  const [approveModalRecord, setApproveModalRecord] = useState<HeldDepositRecord | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Cancel Modal state
  const [cancelModalRecord, setCancelModalRecord] = useState<HeldDepositRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const fetchHeldDeposits = async () => {
    setIsLoading(true);
    try {
      let idToken = "mock-admin-token";
      if (user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch(`/api/admin/held-deposits?status=${statusFilter}&search=${encodeURIComponent(searchQuery.trim())}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setRecords(data.records || []);
        if (data.metrics) setMetrics(data.metrics);
      } else {
        toast.error(data.error || "Failed to fetch held deposits.");
      }
    } catch {
      toast.error("Network communication error loading held deposits.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHeldDeposits();
  }, [user, statusFilter]);

  const handleApproveRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveModalRecord) return;

    setIsProcessingAction(true);
    toast.loading("Releasing held deposit & crediting user wallet...");

    try {
      let idToken = "mock-admin-token";
      if (user) idToken = await user.getIdToken();

      const res = await fetch("/api/admin/held-deposits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "approve",
          id: approveModalRecord.id,
          reference: approveModalRecord.reference,
        }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || "Held deposit released successfully!");
        setApproveModalRecord(null);
        setSelectedRecord(null);
        fetchHeldDeposits();
      } else {
        toast.error(data.error || "Release failed.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network error executing release.");
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleCancelDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalRecord) return;

    setIsProcessingAction(true);
    toast.loading("Canceling held deposit...");

    try {
      let idToken = "mock-admin-token";
      if (user) idToken = await user.getIdToken();

      const res = await fetch("/api/admin/held-deposits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "cancel",
          id: cancelModalRecord.id,
          reason: cancelReason,
        }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("Held deposit canceled.");
        setCancelModalRecord(null);
        setSelectedRecord(null);
        fetchHeldDeposits();
      } else {
        toast.error(data.error || "Cancellation failed.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network error executing cancellation.");
    } finally {
      setIsProcessingAction(false);
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
            <h1 className="font-extrabold text-base tracking-tight leading-tight">Blocked &amp; Held Deposits</h1>
            <p className="text-[10px] text-gray-400 font-semibold">Inspect and approve deposits held safely due to tier deposit limits or maximum balance caps.</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/cpanel/set-limits"
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
            <span>Set Limits</span>
          </Link>

          <button onClick={toggleTheme} className={cn("w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer", isDark ? "bg-gray-900 border-gray-800 text-amber-400 hover:bg-gray-800" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50")}>
            <span className="material-symbols-outlined text-[20px]">{isDark ? "light_mode" : "dark_mode"}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className={cn("rounded-2xl p-5 border flex items-center gap-4 shadow-none", panelClass)}>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">lock_clock</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Active Held Deposits</p>
              <h3 className="font-mono text-2xl font-black tracking-tight mt-0.5">{metrics.totalHeldCount}</h3>
            </div>
          </div>

          <div className={cn("rounded-2xl p-5 border flex items-center gap-4 shadow-none", panelClass)}>
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-[#FC7A00] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">payments</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Total Held Funds</p>
              <h3 className="font-mono text-2xl font-black tracking-tight mt-0.5">₦{metrics.totalHeldAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</h3>
            </div>
          </div>

          <div className={cn("rounded-2xl p-5 border flex items-center gap-4 shadow-none", panelClass)}>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">task_alt</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Released Funds</p>
              <h3 className="font-mono text-2xl font-black tracking-tight mt-0.5">₦{metrics.releasedAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</h3>
            </div>
          </div>

          <div className={cn("rounded-2xl p-5 border flex items-center gap-4 shadow-none", panelClass)}>
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">cancel</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Canceled Requests</p>
              <h3 className="font-mono text-2xl font-black tracking-tight mt-0.5">{metrics.canceledCount}</h3>
            </div>
          </div>
        </div>

        {/* Requests Table Card */}
        <div className={cn("rounded-2xl p-5 border transition-all shadow-none space-y-4", panelClass)}>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 border-b pb-4 border-gray-200/50">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FC7A00] text-[20px]">security</span>
              <h3 className="font-black text-xs uppercase tracking-wider">Held Deposits Directory</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <form onSubmit={(e) => { e.preventDefault(); fetchHeldDeposits(); }} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search ref, email, name, UID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={inputClass}
                />
                <button
                  type="submit"
                  className="px-3.5 py-2.5 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase transition-all shrink-0 cursor-pointer"
                >
                  Search
                </button>
              </form>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={cn(inputClass, "w-auto cursor-pointer font-bold")}
              >
                <option value="HELD">Blocked &amp; Held 🔒</option>
                <option value="RELEASED">Released &amp; Credited ✅</option>
                <option value="CANCELED">Canceled ❌</option>
                <option value="ALL">All Records</option>
              </select>

              <button
                onClick={fetchHeldDeposits}
                className={cn("p-2 border rounded-xl transition-all cursor-pointer", isDark ? "border-gray-800 hover:bg-gray-800" : "border-gray-200 hover:bg-gray-100")}
              >
                <span className="material-symbols-outlined text-[18px] font-bold block">refresh</span>
              </button>
            </div>
          </div>

          {/* Table View */}
          {isLoading ? (
            <div className="text-center py-16 text-gray-400 text-xs font-bold uppercase tracking-widest animate-pulse">
              <ButtonSpinner /> Loading Held Deposits...
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-2xl flex flex-col items-center justify-center p-6 space-y-3 border-gray-200 dark:border-gray-800">
              <span className="material-symbols-outlined text-[36px] text-gray-400">verified_user</span>
              <p className="text-xs uppercase font-black text-gray-400">No Blocked or Held Deposits Found</p>
            </div>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={cn("border-b text-[10px] font-black uppercase tracking-wider", isDark ? "border-gray-800 text-gray-400" : "border-gray-200 text-gray-500")}>
                    <th className="py-3 px-3">Reference &amp; Date</th>
                    <th className="py-3 px-3">Customer UID</th>
                    <th className="py-3 px-3">Sender Details</th>
                    <th className="py-3 px-3">Virtual Account</th>
                    <th className="py-3 px-3">Held Amount</th>
                    <th className="py-3 px-3">Held Reason</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/50 dark:divide-gray-800/50 text-xs">
                  {records.map((r) => {
                    const status = String(r.status || "").toUpperCase();
                    const isHeld = status === "HELD_LIMIT_EXCEEDED" || status === "HELD" || Boolean(r.metadata?.isHeldDeposit && !r.metadata?.wasHeldReleased);
                    const heldAmt = Number(r.metadata?.heldAmount ?? r.amount ?? 0);
                    const sender = resolveSenderBankAndAccount(r);
                    const virtual = resolveVirtualBankAndAccount(r);

                    return (
                      <tr key={r.id} className={cn("transition-colors", isDark ? "hover:bg-gray-900/50" : "hover:bg-gray-50/50")}>
                        <td className="py-3.5 px-3 font-mono font-bold text-gray-900 dark:text-white select-all">
                          <div>{r.reference || r.id}</div>
                          <p className="text-[10px] text-gray-400 font-normal">
                            {format12HourDate(r.createdAt)}
                          </p>
                        </td>

                        <td className="py-3.5 px-3 font-mono text-gray-600 dark:text-gray-300 truncate max-w-[120px] select-all">
                          {r.userId}
                        </td>

                        <td className="py-3.5 px-3 font-semibold text-gray-700 dark:text-gray-300">
                          <div>{sender.fullName}</div>
                          <p className="text-[10px] text-gray-400 font-mono">
                            {sender.bankName} • {sender.accountNumber}
                          </p>
                        </td>

                        <td className="py-3.5 px-3 font-semibold text-gray-700 dark:text-gray-300">
                          <div className="font-mono">{virtual.bankName}</div>
                          <p className="text-[10px] text-gray-400 font-mono">
                            {virtual.accountNumber}
                          </p>
                        </td>

                        <td className="py-3.5 px-3 font-mono font-black text-amber-500 text-sm">
                          ₦{heldAmt.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </td>

                        <td className="py-3.5 px-3 text-gray-500 max-w-xs truncate text-[11px]">
                          {r.metadata?.heldReason || r.narration || "Deposit limit exceeded"}
                        </td>

                        <td className="py-3.5 px-3">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                            isHeld && "bg-amber-500/10 border-amber-500/20 text-amber-500",
                            r.metadata?.wasHeldReleased && "bg-emerald-500/10 border-emerald-500/20 text-emerald-500",
                            (status === "CANCELED" || status === "REJECTED") && "bg-rose-500/10 border-rose-500/20 text-rose-500"
                          )}>
                            {isHeld ? "Held Safely 🔒" : r.metadata?.wasHeldReleased ? "Released ✅" : status}
                          </span>
                        </td>

                        <td className="py-3.5 px-3 text-right">
                          {(() => {
                            const actions: CpanelActionItem[] = [
                              {
                                label: "Inspect Details",
                                icon: "visibility",
                                onClick: () => setSelectedRecord(r),
                              },
                              ...(isHeld
                                ? [
                                    {
                                      label: "Approve & Credit",
                                      icon: "task_alt",
                                      variant: "emerald" as const,
                                      onClick: () => setApproveModalRecord(r),
                                    },
                                    {
                                      label: "Cancel Deposit",
                                      icon: "cancel",
                                      variant: "danger" as const,
                                      onClick: () => setCancelModalRecord(r),
                                    },
                                  ]
                                : []),
                            ];
                            return <CpanelActionDropdown actions={actions} />;
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>

      </div>

      {/* Inspect Record Drawer Modal */}
      <AnimatePresence>
        {selectedRecord && (
          <div className="fixed inset-0 z-[99998] bg-black/70 backdrop-blur-sm flex items-center justify-end">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className={cn("w-full max-w-lg h-full overflow-y-auto p-6 space-y-6 shadow-2xl flex flex-col justify-between", isDark ? "bg-gray-900 text-white" : "bg-white text-gray-900")}
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b pb-4 border-gray-200/50">
                  <h3 className="font-extrabold text-base uppercase">Inspect Held Deposit Details</h3>
                  <button onClick={() => setSelectedRecord(null)} className="w-8 h-8 rounded-full border flex items-center justify-center text-gray-400">
                    <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                  </button>
                </div>

                {(() => {
                  const sender = resolveSenderBankAndAccount(selectedRecord);
                  const virtual = resolveVirtualBankAndAccount(selectedRecord);

                  return (
                    <div className="space-y-4 text-xs">
                      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-1">
                        <p className="text-[10px] font-black uppercase text-amber-600">Held Amount</p>
                        <p className="font-mono font-black text-2xl text-amber-600">
                          ₦{(Number(selectedRecord.metadata?.heldAmount ?? selectedRecord.amount ?? 0)).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[11px] text-gray-500 font-semibold">{selectedRecord.metadata?.heldReason || selectedRecord.narration}</p>
                      </div>

                      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border space-y-2.5 font-semibold">
                        <div className="flex justify-between border-b pb-2 border-gray-200/60 dark:border-gray-700">
                          <span className="text-gray-400">Reference ID</span>
                          <span className="font-mono font-bold select-all">{selectedRecord.reference || selectedRecord.id}</span>
                        </div>

                        <div className="flex justify-between border-b pb-2 border-gray-200/60 dark:border-gray-700">
                          <span className="text-gray-400">Customer UID</span>
                          <span className="font-mono font-bold select-all truncate max-w-[180px]">{selectedRecord.userId}</span>
                        </div>

                        <div className="flex justify-between border-b pb-2 border-gray-200/60 dark:border-gray-700">
                          <span className="text-gray-400">Sender Name</span>
                          <span className="font-bold">{sender.fullName}</span>
                        </div>

                        <div className="flex justify-between border-b pb-2 border-gray-200/60 dark:border-gray-700">
                          <span className="text-gray-400">Sender Bank / Account</span>
                          <span className="font-mono font-bold">{sender.bankName} • {sender.accountNumber}</span>
                        </div>

                        <div className="flex justify-between border-b pb-2 border-gray-200/60 dark:border-gray-700">
                          <span className="text-gray-400">Virtual Account Deposited</span>
                          <span className="font-mono font-bold">{virtual.bankName} • {virtual.accountNumber}</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-gray-400">Deposit Date</span>
                          <span className="font-mono">{format12HourDate(selectedRecord.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {(selectedRecord.status === "HELD_LIMIT_EXCEEDED" || selectedRecord.status === "HELD") && (
                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-200/50">
                  <button
                    onClick={() => setApproveModalRecord(selectedRecord)}
                    className="py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase text-xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">task_alt</span>
                    <span>Approve &amp; Credit</span>
                  </button>

                  <button
                    onClick={() => setCancelModalRecord(selectedRecord)}
                    className="py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black uppercase text-xs cursor-pointer"
                  >
                    Cancel Deposit
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Release & Credit Approval Dialog */}
      <AnimatePresence>
        {approveModalRecord && (
          <div className="fixed inset-0 z-[100000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn("w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-5", isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900")}
            >
              <div className="flex justify-between items-center border-b pb-3 border-gray-200/50">
                <h3 className="font-extrabold text-sm uppercase">Approve &amp; Release Funds</h3>
                <button onClick={() => setApproveModalRecord(null)} className="w-8 h-8 rounded-full border flex items-center justify-center text-gray-400">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>

              <form onSubmit={handleApproveRelease} className="space-y-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center space-y-1">
                  <span className="text-[10px] font-black uppercase text-emerald-600">Release Amount to Credit</span>
                  <p className="font-mono font-black text-2xl text-emerald-600">
                    ₦{(Number(approveModalRecord.metadata?.heldAmount ?? approveModalRecord.amount ?? 0)).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-gray-500">Target User UID: <span className="font-mono font-bold select-all">{approveModalRecord.userId}</span></p>
                </div>

                <p className="text-xs text-gray-500 leading-relaxed font-medium">
                  Executing this approval will atomically credit <strong>₦{(Number(approveModalRecord.metadata?.heldAmount ?? approveModalRecord.amount ?? 0)).toLocaleString()}</strong> into the user&apos;s available NGN wallet, set transaction status to <strong>SUCCESS</strong>, and send an FCM push notification.
                </p>

                <button
                  type="submit"
                  disabled={isProcessingAction}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
                >
                  {isProcessingAction ? <ButtonSpinner /> : <><span className="material-symbols-outlined text-[18px]">task_alt</span><span>Confirm Release &amp; Credit Wallet</span></>}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cancel Dialog */}
      <AnimatePresence>
        {cancelModalRecord && (
          <div className="fixed inset-0 z-[100000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn("w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-5", isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900")}
            >
              <div className="flex justify-between items-center border-b pb-3 border-gray-200/50">
                <h3 className="font-extrabold text-sm uppercase">Cancel Held Deposit</h3>
                <button onClick={() => setCancelModalRecord(null)} className="w-8 h-8 rounded-full border flex items-center justify-center text-gray-400">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>

              <form onSubmit={handleCancelDeposit} className="space-y-4">
                <p className="text-xs text-gray-500">
                  Are you sure you want to cancel the held deposit for reference <strong className="font-mono text-gray-900 dark:text-white select-all">{cancelModalRecord.reference}</strong>?
                </p>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400">Cancellation Reason</label>
                  <textarea
                    required
                    placeholder="Enter reason for canceling this held deposit..."
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className={cn(inputClass, "h-20 resize-none")}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isProcessingAction}
                  className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md"
                >
                  {isProcessingAction ? <ButtonSpinner /> : "Confirm Cancellation"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default function HeldDepositsPage() {
  return (
    <CpanelRouteGuard requiredPermission="wallets.manage">
      <HeldDepositsPageContent />
    </CpanelRouteGuard>
  );
}
