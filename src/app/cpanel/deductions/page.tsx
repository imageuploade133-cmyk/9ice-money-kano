"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface GlobalDeduction {
  id: string;
  deductionId: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  target: string;
  status: "DRAFT" | "PROCESSING" | "COMPLETED" | "PARTIAL" | "FAILED" | string;
  eligibleUsersCount?: number;
  processedUsersCount?: number;
  failedUsersCount?: number;
  indebtedUsersCount?: number;
  totalAssessedAmount?: number;
  totalRecoveredAmount?: number;
  totalOutstandingAmount?: number;
  createdBy: string;
  createdAt: string;
}

interface UserDeductionRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  amountAssessed: number;
  amountRecovered: number;
  amountOutstanding: number;
  walletBalanceBefore: number;
  walletBalanceAfter: number;
  outstandingDebtBefore: number;
  outstandingDebtAfter: number;
  status: string;
  createdAt: string;
}

interface DeductionPreview {
  eligibleUsersCount: number;
  sufficientFundsCount: number;
  indebtedCount: number;
  totalAssessedAmount: number;
  totalImmediateRecovery: number;
  totalNewOutstandingDebt: number;
}

interface AuditLogRecord {
  id: string;
  action: string;
  adminEmail: string;
  adminUid: string;
  adminName: string;
  adminRole: string;
  deductionId: string;
  details: Record<string, any>;
  timestamp: string;
}

export default function GlobalDeductionsPage() {
  const { isDark } = useCpanelTheme();

  // Active Tab: "history" (Master Batches) vs "logs" (Dedicated Admin Audit Logs)
  const [activeTab, setActiveTab] = useState<"history" | "logs">("history");

  // Deductions State & Pagination
  const [deductions, setDeductions] = useState<GlobalDeduction[]>([]);
  const [summary, setSummary] = useState({
    totalDeductionsExecuted: 0,
    totalAssessedAmount: 0,
    totalRecoveredAmount: 0,
    totalOutstandingAmount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Dedicated Admin Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logPage, setLogPage] = useState(1);
  const [logTotalPages, setLogTotalPages] = useState(1);
  const [logTotalRecords, setLogTotalRecords] = useState(0);

  // New Deduction Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<"form" | "preview">("form");
  const [name, setName] = useState("Monthly Account Maintenance Fee");
  const [description, setDescription] = useState("Standard service maintenance fee for active wallet accounts");
  const [amount, setAmount] = useState<number | "">(500);

  // Preset Deduction Titles
  const PRESET_DEDUCTIONS: Array<{ title: string; defaultDesc: string; defaultAmt: number | "" }> = [
    { title: "Monthly Account Maintenance Fee", defaultDesc: "Standard service maintenance fee for active wallet accounts", defaultAmt: 500 },
    { title: "Annual Wallet Service Fee", defaultDesc: "Annual account maintenance and security service charge", defaultAmt: 1000 },
    { title: "SMS Alert & Notification Charge", defaultDesc: "Monthly SMS notification and transaction alert maintenance fee", defaultAmt: 200 },
    { title: "Account Verification & KYC Fee", defaultDesc: "Identity verification and automated KYC portal processing fee", defaultAmt: 300 },
    { title: "Government Stamp Duty Charge", defaultDesc: "Regulatory electronic transfer stamp duty charge", defaultAmt: 50 },
    { title: "Custom Administrative Fee", defaultDesc: "", defaultAmt: "" },
  ];

  const handleSelectPreset = (presetTitle: string) => {
    const selected = PRESET_DEDUCTIONS.find((p) => p.title === presetTitle);
    if (selected) {
      setName(selected.title);
      if (selected.defaultDesc) setDescription(selected.defaultDesc);
      setAmount(selected.defaultAmt);
    }
  };

  const [previewData, setPreviewData] = useState<DeductionPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  // Detail Drawer State with Index Pagination
  const [selectedDeduction, setSelectedDeduction] = useState<GlobalDeduction | null>(null);
  const [userRecords, setUserRecords] = useState<UserDeductionRecord[]>([]);
  const [isLoadingUserRecords, setIsLoadingUserRecords] = useState(false);
  const [userRecordsPage, setUserRecordsPage] = useState(1);
  const [userRecordsTotalPages, setUserRecordsTotalPages] = useState(1);
  const [userRecordsTotalCount, setUserRecordsTotalCount] = useState(0);

  // Delete Authorization Modal State
  const [deleteDeduction, setDeleteDeduction] = useState<GlobalDeduction | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDeductions = async () => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: "10",
        search: search.trim(),
      });
      const res = await fetch(`/api/admin/deductions?${queryParams.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setDeductions(data.deductions || []);
        if (data.pagination) {
          setPage(data.pagination.page);
          setTotalPages(data.pagination.totalPages);
          setTotalRecords(data.pagination.totalRecords);
        }
        if (data.summary) {
          setSummary({
            totalDeductionsExecuted: Number(data.summary.totalDeductionsExecuted) || 0,
            totalAssessedAmount: Number(data.summary.totalAssessedAmount) || 0,
            totalRecoveredAmount: Number(data.summary.totalRecoveredAmount) || 0,
            totalOutstandingAmount: Number(data.summary.totalOutstandingAmount) || 0,
          });
        }
      } else {
        toast.error(data.error || "Failed to load global deductions");
      }
    } catch {
      toast.error("Network error fetching global deductions history");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setIsLoadingAuditLogs(true);
    try {
      const queryParams = new URLSearchParams({
        page: String(logPage),
        limit: "15",
        search: logSearch.trim(),
      });
      const res = await fetch(`/api/admin/deductions/logs?${queryParams.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setAuditLogs(data.logs || []);
        if (data.pagination) {
          setLogPage(data.pagination.page);
          setLogTotalPages(data.pagination.totalPages);
          setLogTotalRecords(data.pagination.totalRecords);
        }
      } else {
        toast.error(data.error || "Failed to load deduction audit logs");
      }
    } catch {
      toast.error("Network error fetching deduction audit logs");
    } finally {
      setIsLoadingAuditLogs(false);
    }
  };

  useEffect(() => {
    fetchDeductions();
  }, [page, search]);

  useEffect(() => {
    if (activeTab === "logs") {
      fetchAuditLogs();
    }
  }, [activeTab, logPage, logSearch]);

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmt = Number(amount);
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      toast.error("Please enter a valid amount greater than 0");
      return;
    }

    setIsPreviewing(true);
    try {
      const res = await fetch("/api/admin/deductions/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsedAmt }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPreviewData({
          eligibleUsersCount: Number(data.preview?.eligibleUsersCount) || 0,
          sufficientFundsCount: Number(data.preview?.sufficientFundsCount) || 0,
          indebtedCount: Number(data.preview?.indebtedCount) || 0,
          totalAssessedAmount: Number(data.preview?.totalAssessedAmount) || 0,
          totalImmediateRecovery: Number(data.preview?.totalImmediateRecovery) || 0,
          totalNewOutstandingDebt: Number(data.preview?.totalNewOutstandingDebt) || 0,
        });
        setModalStep("preview");
      } else {
        toast.error(data.error || "Failed to generate preview");
      }
    } catch {
      toast.error("Network error generating preview");
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleExecute = async () => {
    const parsedAmt = Number(amount);
    if (isNaN(parsedAmt) || parsedAmt <= 0) {
      toast.error("Please enter a valid deduction amount");
      return;
    }

    setIsExecuting(true);
    try {
      const res = await fetch("/api/admin/deductions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          amount: parsedAmt,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Global deduction executed successfully!");
        setShowModal(false);
        setModalStep("form");
        setPreviewData(null);
        fetchDeductions();
        if (activeTab === "logs") fetchAuditLogs();
      } else {
        toast.error(data.error || "Failed to execute global deduction");
      }
    } catch {
      toast.error("Network error executing global deduction");
    } finally {
      setIsExecuting(false);
    }
  };

  const handleDeleteMasterDeduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteDeduction) return;

    if (!adminPassword || adminPassword.trim() === "") {
      toast.error("Please enter your administrator password to confirm deletion.");
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch("/api/admin/deductions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deductionId: deleteDeduction.deductionId,
          adminPassword: adminPassword.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Global deduction master record deleted successfully!");
        setDeleteDeduction(null);
        setAdminPassword("");
        fetchDeductions();
        if (activeTab === "logs") fetchAuditLogs();
      } else {
        toast.error(data.error || "Deletion authorization failed.");
      }
    } catch {
      toast.error("Network error deleting deduction history.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleViewUserRecords = async (ded: GlobalDeduction, pageNum = 1) => {
    setSelectedDeduction(ded);
    setUserRecordsPage(pageNum);
    setIsLoadingUserRecords(true);
    try {
      const res = await fetch(`/api/admin/deductions?deductionId=${ded.deductionId}&page=${pageNum}&limit=15`);
      const data = await res.json();
      if (res.ok && data.success) {
        setUserRecords(data.userRecords || []);
        if (data.pagination) {
          setUserRecordsTotalPages(data.pagination.totalPages);
          setUserRecordsTotalCount(data.pagination.totalRecords);
        }
      } else {
        toast.error(data.error || "Failed to fetch user audit logs");
      }
    } catch {
      toast.error("Network error fetching user audit logs");
    } finally {
      setIsLoadingUserRecords(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto font-hanken">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-[#FC7A00] flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">payments</span>
            </div>
            <div>
              <h1 className={cn("text-xl sm:text-2xl font-black tracking-tight", isDark ? "text-white" : "text-gray-900")}>
                Global Wallet Deductions
              </h1>
              <p className={cn("text-xs font-semibold mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Assess maintenance fees or service charges across all active user accounts with automatic debt recovery.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setModalStep("form");
            setPreviewData(null);
            setShowModal(true);
          }}
          className="px-5 py-3 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer self-start sm:self-auto border-0"
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          Assess Global Deduction
        </button>
      </div>

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className={cn("p-4 rounded-3xl border transition-all", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200 shadow-xs")}>
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider">Executed Batches</span>
            <span className="material-symbols-outlined text-[20px] text-[#FC7A00]">verified</span>
          </div>
          <p className={cn("text-xl sm:text-2xl font-black tracking-tight", isDark ? "text-white" : "text-gray-900")}>
            {(summary?.totalDeductionsExecuted ?? 0).toLocaleString()}
          </p>
          <span className="text-[10px] text-gray-400 font-semibold mt-1 block">Master Batches Processed</span>
        </div>

        <div className={cn("p-4 rounded-3xl border transition-all", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200 shadow-xs")}>
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider">Total Assessed</span>
            <span className="material-symbols-outlined text-[20px] text-blue-500">account_balance_wallet</span>
          </div>
          <p className={cn("text-xl sm:text-2xl font-black tracking-tight", isDark ? "text-white" : "text-gray-900")}>
            ₦{(summary?.totalAssessedAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-gray-400 font-semibold mt-1 block">Total Fee Value Assessed</span>
        </div>

        <div className={cn("p-4 rounded-3xl border transition-all", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200 shadow-xs")}>
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider">Recovered Immediately</span>
            <span className="material-symbols-outlined text-[20px] text-emerald-500">price_check</span>
          </div>
          <p className="text-xl sm:text-2xl font-black tracking-tight text-emerald-500">
            ₦{(summary?.totalRecoveredAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-emerald-600/70 font-semibold mt-1 block">Debited directly from balances</span>
        </div>

        <div className={cn("p-4 rounded-3xl border transition-all", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200 shadow-xs")}>
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider">Outstanding Debt</span>
            <span className="material-symbols-outlined text-[20px] text-amber-500">pending_actions</span>
          </div>
          <p className="text-xl sm:text-2xl font-black tracking-tight text-amber-500">
            ₦{(summary?.totalOutstandingAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-amber-600/70 font-semibold mt-1 block">Pending automatic recovery</span>
        </div>
      </div>

      {/* Main Console Tab Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-2">
        <button
          onClick={() => setActiveTab("history")}
          className={cn(
            "px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer border-0",
            activeTab === "history"
              ? "bg-[#FC7A00] text-white shadow-sm"
              : isDark ? "text-gray-400 hover:text-white bg-gray-900" : "text-gray-600 hover:text-black bg-gray-100"
          )}
        >
          <span className="material-symbols-outlined text-[18px]">history</span>
          Master History ({totalRecords})
        </button>

        <button
          onClick={() => setActiveTab("logs")}
          className={cn(
            "px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer border-0",
            activeTab === "logs"
              ? "bg-[#FC7A00] text-white shadow-sm"
              : isDark ? "text-gray-400 hover:text-white bg-gray-900" : "text-gray-600 hover:text-black bg-gray-100"
          )}
        >
          <span className="material-symbols-outlined text-[18px]">admin_panel_settings</span>
          Admin Audit Logs
        </button>
      </div>

      {/* TAB 1: MASTER HISTORY TABLE WITH SEARCH & PAGINATION */}
      {activeTab === "history" && (
        <div className={cn("rounded-3xl border overflow-hidden", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200 shadow-sm")}>
          {/* Table Header Controls */}
          <div className={cn("p-4 sm:p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3", isDark ? "border-gray-800" : "border-gray-100")}>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FC7A00]">manage_search</span>
              <h2 className={cn("font-black text-sm uppercase tracking-wider", isDark ? "text-white" : "text-gray-900")}>
                Global Deduction Master Records
              </h2>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <span className="material-symbols-outlined text-gray-400 text-[18px] absolute left-3 top-1/2 -translate-y-1/2">
                  search
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search title, ID, creator..."
                  className={cn(
                    "w-full pl-9 pr-3 py-2 rounded-xl text-xs font-semibold outline-none transition-all",
                    isDark ? "bg-gray-800 text-white border-gray-700 focus:border-[#FC7A00]" : "bg-gray-50 text-gray-900 border-gray-200 focus:border-[#FC7A00]"
                  )}
                />
              </div>

              <button
                onClick={fetchDeductions}
                className="p-2.5 rounded-xl text-xs font-bold text-[#FC7A00] hover:bg-orange-500/10 transition-all flex items-center justify-center cursor-pointer bg-transparent border-0"
                title="Refresh"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-gray-400 animate-pulse">
              <span className="material-symbols-outlined text-4xl animate-spin mb-2">progress_activity</span>
              <p className="text-xs font-bold uppercase tracking-wider">Loading Deduction Audit History...</p>
            </div>
          ) : deductions.length === 0 ? (
            <div className="p-12 text-center text-gray-400 space-y-2">
              <span className="material-symbols-outlined text-4xl text-gray-300">payments</span>
              <p className="text-sm font-bold text-gray-600 dark:text-gray-400">No Global Deductions Found</p>
              <p className="text-xs text-gray-400">No master deduction records matched your query filter.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={cn("border-b text-[10px] font-black uppercase tracking-wider text-gray-400", isDark ? "border-gray-800 bg-gray-950/50" : "border-gray-100 bg-gray-50")}>
                      <th className="py-3.5 px-4">Deduction Info</th>
                      <th className="py-3.5 px-4">Rate / User</th>
                      <th className="py-3.5 px-4">Users Breakdown</th>
                      <th className="py-3.5 px-4">Immediate Recovery</th>
                      <th className="py-3.5 px-4">Debt Created</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-xs font-medium">
                    {deductions.map((ded) => {
                      const eligible = ded.eligibleUsersCount ?? 0;
                      const processed = ded.processedUsersCount ?? eligible;
                      const failed = ded.failedUsersCount ?? 0;
                      const rate = ded.amount ?? 0;
                      const recovered = ded.totalRecoveredAmount ?? 0;
                      const outstanding = ded.totalOutstandingAmount ?? 0;

                      return (
                        <tr key={ded.id} className={cn("hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors", isDark ? "text-gray-200" : "text-gray-700")}>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-gray-900 dark:text-white">{ded.name}</div>
                            <div className="text-[11px] text-gray-400 truncate max-w-xs">{ded.description || "All Active Users"}</div>
                            <div className="text-[9.5px] text-gray-400 font-mono mt-0.5">
                              ID: {ded.deductionId} • By {ded.createdBy || "Admin"} • {ded.createdAt ? new Date(ded.createdAt).toLocaleString() : "Recently"}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-gray-900 dark:text-white">
                            ₦{rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-gray-800 dark:text-gray-200">{processed} / {eligible} Processed</div>
                            {failed > 0 ? (
                              <span className="text-[10px] font-black text-rose-500">{failed} Failed</span>
                            ) : (
                              <span className="text-[10px] font-semibold text-emerald-600">0 Failed</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-emerald-600">
                            ₦{recovered.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-amber-500">
                            ₦{outstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={cn(
                              "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-block",
                              ded.status === "COMPLETED"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                : ded.status === "PARTIAL"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                                : ded.status === "PROCESSING"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 animate-pulse"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                            )}>
                              {ded.status || "COMPLETED"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleViewUserRecords(ded)}
                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl text-[11px] font-bold transition-all cursor-pointer border-0"
                              >
                                User Audit
                              </button>

                              <button
                                onClick={() => {
                                  setAdminPassword("");
                                  setDeleteDeduction(ded);
                                }}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all cursor-pointer border-0"
                                title="Delete Master History Record"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Pagination Controls */}
              <div className={cn("p-4 border-t flex items-center justify-between text-xs font-bold", isDark ? "border-gray-800 text-gray-400" : "border-gray-100 text-gray-600")}>
                <span>
                  Showing page {page} of {totalPages} ({totalRecords} total master records)
                </span>

                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 disabled:opacity-40 font-black cursor-pointer"
                  >
                    ← Previous
                  </button>

                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 disabled:opacity-40 font-black cursor-pointer"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: DEDICATED ADMIN AUDIT LOGS TABLE */}
      {activeTab === "logs" && (
        <div className={cn("rounded-3xl border overflow-hidden", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200 shadow-sm")}>
          <div className={cn("p-4 sm:p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3", isDark ? "border-gray-800" : "border-gray-100")}>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FC7A00]">admin_panel_settings</span>
              <div>
                <h2 className={cn("font-black text-sm uppercase tracking-wider", isDark ? "text-white" : "text-gray-900")}>
                  Deductions Administrator Audit Trail
                </h2>
                <p className="text-[11px] text-gray-400 font-semibold">
                  Detailed audit records for deduction creation, execution, and deletion with full admin details.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <span className="material-symbols-outlined text-gray-400 text-[18px] absolute left-3 top-1/2 -translate-y-1/2">
                  search
                </span>
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => {
                    setLogSearch(e.target.value);
                    setLogPage(1);
                  }}
                  placeholder="Search admin, email, action..."
                  className={cn(
                    "w-full pl-9 pr-3 py-2 rounded-xl text-xs font-semibold outline-none transition-all",
                    isDark ? "bg-gray-800 text-white border-gray-700 focus:border-[#FC7A00]" : "bg-gray-50 text-gray-900 border-gray-200 focus:border-[#FC7A00]"
                  )}
                />
              </div>

              <button
                onClick={fetchAuditLogs}
                className="p-2.5 rounded-xl text-xs font-bold text-[#FC7A00] hover:bg-orange-500/10 transition-all flex items-center justify-center cursor-pointer bg-transparent border-0"
                title="Refresh Logs"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
            </div>
          </div>

          {isLoadingAuditLogs ? (
            <div className="p-12 text-center text-gray-400 animate-pulse">
              <span className="material-symbols-outlined text-4xl animate-spin mb-2">progress_activity</span>
              <p className="text-xs font-bold uppercase tracking-wider">Loading Administrator Audit Logs...</p>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="p-12 text-center text-gray-400 space-y-2">
              <span className="material-symbols-outlined text-4xl text-gray-300">receipt_long</span>
              <p className="text-sm font-bold text-gray-600 dark:text-gray-400">No Deduction Audit Logs Found</p>
              <p className="text-xs text-gray-400">No administrator action logs were recorded for this filter.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className={cn("border-b text-[10px] font-black uppercase tracking-wider text-gray-400", isDark ? "border-gray-800 bg-gray-950/50" : "border-gray-100 bg-gray-50")}>
                      <th className="py-3.5 px-4">Date & Time</th>
                      <th className="py-3.5 px-4">Administrator</th>
                      <th className="py-3.5 px-4">Action Performed</th>
                      <th className="py-3.5 px-4">Target Deduction</th>
                      <th className="py-3.5 px-4">Execution Breakdown</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-xs font-medium">
                    {auditLogs.map((log) => {
                      const isDelete = log.action.includes("deleted");
                      return (
                        <tr key={log.id} className={cn("hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors", isDark ? "text-gray-200" : "text-gray-700")}>
                          <td className="py-3.5 px-4 font-mono text-[11px] text-gray-500 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-gray-900 dark:text-white">{log.adminName}</div>
                            <div className="text-[10px] text-gray-400">{log.adminEmail}</div>
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-orange-500/10 text-orange-500 border border-orange-500/20 inline-block mt-0.5">
                              {log.adminRole}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={cn(
                              "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-block",
                              isDelete
                                ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            )}>
                              {isDelete ? "DELETED MASTER RECORD" : "EXECUTED DEDUCTION"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-gray-800 dark:text-gray-200">
                            <div>{log.details?.name || log.deductionId}</div>
                            <div className="text-[10px] font-mono text-gray-400">{log.deductionId}</div>
                          </td>
                          <td className="py-3.5 px-4 text-[11px] text-gray-600 dark:text-gray-300">
                            {isDelete ? (
                              <span className="text-rose-500 font-semibold">
                                Deleted at ₦{(log.details?.amount ?? 0).toLocaleString()} rate per user.
                              </span>
                            ) : (
                              <div>
                                <span className="font-bold">Rate: ₦{(log.details?.amount ?? 0).toLocaleString()}</span> • Users: {log.details?.processedUsersCount ?? 0} • Recovered: <span className="text-emerald-600 font-bold">₦{(log.details?.totalRecoveredAmount ?? 0).toLocaleString()}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Audit Log Pagination Controls */}
              <div className={cn("p-4 border-t flex items-center justify-between text-xs font-bold", isDark ? "border-gray-800 text-gray-400" : "border-gray-100 text-gray-600")}>
                <span>
                  Showing log page {logPage} of {logTotalPages} ({logTotalRecords} total audit logs)
                </span>

                <div className="flex items-center gap-2">
                  <button
                    disabled={logPage <= 1}
                    onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 disabled:opacity-40 font-black cursor-pointer"
                  >
                    ← Previous
                  </button>

                  <button
                    disabled={logPage >= logTotalPages}
                    onClick={() => setLogPage((p) => Math.min(logTotalPages, p + 1))}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 disabled:opacity-40 font-black cursor-pointer"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* CREATE & PREVIEW MODAL */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[99998]"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-[5%] bottom-[5%] sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 md:left-1/2 md:-translate-x-1/2 max-w-lg w-full max-h-[90vh] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 shadow-2xl z-[99999] font-hanken flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between pb-3.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-[#FC7A00] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[22px]">payments</span>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base text-gray-900 dark:text-white">
                      {modalStep === "form" ? "Assess Global Wallet Deduction" : "Confirm Deduction Execution"}
                    </h3>
                    <p className="text-[10px] sm:text-[11px] text-gray-400 font-semibold">
                      {modalStep === "form" ? "Step 1: Set Deduction Amount & Purpose" : "Step 2: Review Preview Impact across Users"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowModal(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-black dark:hover:text-white flex items-center justify-center cursor-pointer border-0 shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pt-3.5 space-y-4 no-scrollbar">
              {modalStep === "form" ? (
                <form id="deduction-form" onSubmit={handlePreview} className="space-y-4">
                  {/* Deduction Preset Selection */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                      Select Deduction Preset / Template
                    </label>
                    <select
                      onChange={(e) => handleSelectPreset(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-3.5 py-2.5 text-xs text-gray-900 dark:text-white outline-none focus:border-[#FC7A00] font-bold cursor-pointer"
                    >
                      {PRESET_DEDUCTIONS.map((p) => (
                        <option key={p.title} value={p.title}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase tracking-wider text-[#FC7A00]">
                        Deduction Title / Name (Customizable)
                      </label>
                      <span className="text-[9.5px] text-gray-400 font-semibold">Editable</span>
                    </div>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Monthly Maintenance Fee"
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-xs text-gray-900 dark:text-white outline-none focus:border-[#FC7A00] font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-[#FC7A00]">
                      Description / Reason
                    </label>
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Service maintenance fee for active wallet accounts"
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-xs text-gray-900 dark:text-white outline-none focus:border-[#FC7A00]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase tracking-wider text-[#FC7A00]">
                      Deduction Amount per User (NGN)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400">₦</span>
                      <input
                        type="number"
                        required
                        min={1}
                        step="any"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="500"
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl pl-8 pr-4 py-3 text-sm font-black text-gray-900 dark:text-white outline-none focus:border-[#FC7A00]"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isPreviewing}
                      className="w-full py-4 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-2 border-0"
                    >
                      {isPreviewing ? (
                        <>
                          <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                          Calculating User Impact Preview...
                        </>
                      ) : (
                        <>
                          Preview User Impact →
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4 pt-4">
                  {previewData && (
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                        <span className="text-[10px] text-gray-400 font-bold uppercase block">Eligible Active Users</span>
                        <span className="text-lg font-black text-gray-900 dark:text-white">{(previewData.eligibleUsersCount ?? 0).toLocaleString()}</span>
                      </div>

                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                        <span className="text-[10px] text-gray-400 font-bold uppercase block">Max Assessment</span>
                        <span className="text-lg font-black text-blue-500">₦{(previewData.totalAssessedAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>

                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                        <span className="text-[10px] text-emerald-600 font-bold uppercase block">Immediate Recovery</span>
                        <span className="text-lg font-black text-emerald-600">₦{(previewData.totalImmediateRecovery ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>

                      <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-100 dark:border-amber-900/30">
                        <span className="text-[10px] text-amber-600 font-bold uppercase block">New Debt Created</span>
                        <span className="text-lg font-black text-amber-600">₦{(previewData.totalNewOutstandingDebt ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )}

                  <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-2xl text-left space-y-1">
                    <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-black text-xs uppercase">
                      <span className="material-symbols-outlined text-[16px]">warning</span>
                      Atomic Debit & Debt Recovery Warning
                    </div>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 font-semibold leading-relaxed">
                      Executing this deduction will debit <strong>₦{(Number(amount) || 0).toLocaleString()}</strong> from all active users. Users with insufficient balance will enter an <strong>Outstanding Debt</strong> state and will be automatically debited upon their next wallet deposit.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setModalStep("form")}
                      className="py-3.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-0"
                    >
                      ← Back to Form
                    </button>

                    <button
                      type="button"
                      disabled={isExecuting}
                      onClick={handleExecute}
                      className="py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5 border-0"
                    >
                      {isExecuting ? (
                        <>
                          <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                          Executing Deduction...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          Confirm & Execute
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* DELETE MASTER HISTORY AUTHORIZATION MODAL */}
      <AnimatePresence>
        {deleteDeduction && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteDeduction(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[99998]"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 max-w-md w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[32px] p-6 shadow-2xl z-[99999] font-hanken overflow-hidden"
            >
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[24px]">lock_reset</span>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                      Delete Master History Record
                    </h3>
                    <p className="text-[11px] text-rose-500 font-semibold">
                      Authorization Required
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setDeleteDeduction(null)}
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-black dark:hover:text-white flex items-center justify-center cursor-pointer border-0"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleDeleteMasterDeduction} className="space-y-4 pt-4">
                <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl">
                  <p className="text-xs text-rose-900 dark:text-rose-300 font-bold">
                    You are deleting master history record: <strong className="underline">{deleteDeduction.name}</strong> ({deleteDeduction.deductionId})
                  </p>
                  <p className="text-[11px] text-rose-700/80 dark:text-rose-400/80 font-medium mt-1">
                    Please enter your administrator account password to confirm this action.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-rose-600">
                    Administrator Password *
                  </label>
                  <input
                    type="password"
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Enter your admin account password"
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3 text-xs text-gray-900 dark:text-white outline-none focus:border-rose-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeleteDeduction(null)}
                    className="py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-0"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isDeleting}
                    className="py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5 border-0"
                  >
                    {isDeleting ? (
                      <>
                        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                        Verifying...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">delete</span>
                        Confirm Delete
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* USER AUDIT DETAIL DRAWER */}
      <AnimatePresence>
        {selectedDeduction && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDeduction(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[99998]"
            />

            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed inset-x-4 top-12 bottom-12 md:inset-y-12 md:left-1/2 md:-translate-x-1/2 max-w-3xl w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[32px] p-6 shadow-2xl z-[99999] font-hanken flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <div>
                  <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                    User Audit Log: {selectedDeduction.name}
                  </h3>
                  <p className="text-[11px] text-gray-400 font-semibold">
                    ID: {selectedDeduction.deductionId} | Rate: ₦{(selectedDeduction.amount ?? 0).toLocaleString()}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedDeduction(null)}
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-black dark:hover:text-white flex items-center justify-center cursor-pointer border-0"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pt-4 space-y-3 no-scrollbar">
                {isLoadingUserRecords ? (
                  <div className="p-12 text-center text-gray-400 animate-pulse">
                    <span className="material-symbols-outlined text-4xl animate-spin mb-2">progress_activity</span>
                    <p className="text-xs font-bold uppercase tracking-wider">Loading Per-User Audit Logs...</p>
                  </div>
                ) : userRecords.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-xs">No per-user audit records found for this deduction.</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b text-[10px] font-black uppercase tracking-wider text-gray-400 border-gray-100 dark:border-gray-800">
                            <th className="py-2.5 px-3">User</th>
                            <th className="py-2.5 px-3">Assessed</th>
                            <th className="py-2.5 px-3">Recovered</th>
                            <th className="py-2.5 px-3">Outstanding Debt</th>
                            <th className="py-2.5 px-3">Net Position After</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-xs font-medium">
                          {userRecords.map((ur) => {
                            const assessed = ur.amountAssessed ?? 0;
                            const recovered = ur.amountRecovered ?? 0;
                            const outstanding = ur.amountOutstanding ?? 0;
                            const balAfter = ur.walletBalanceAfter ?? 0;
                            const netAfter = balAfter - outstanding;

                            return (
                              <tr key={ur.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                                <td className="py-2.5 px-3">
                                  <div className="font-bold text-gray-900 dark:text-white">{ur.userName || "User"}</div>
                                  <div className="text-[10px] text-gray-400">{ur.userEmail || ur.userPhone || ur.userId}</div>
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-gray-800 dark:text-gray-200">
                                  ₦{assessed.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 font-bold text-emerald-600">
                                  ₦{recovered.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 font-bold text-amber-500">
                                  ₦{outstanding.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 font-mono font-bold">
                                  <span className={netAfter < 0 ? "text-rose-500" : "text-emerald-600"}>
                                    ₦{netAfter.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Per-User Audit Logs Index Pagination */}
                    <div className="p-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs font-bold text-gray-500">
                      <span>
                        Page {userRecordsPage} of {userRecordsTotalPages} ({userRecordsTotalCount} user records)
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          disabled={userRecordsPage <= 1 || isLoadingUserRecords}
                          onClick={() => handleViewUserRecords(selectedDeduction, userRecordsPage - 1)}
                          className="px-3 py-1 rounded-xl border border-gray-200 dark:border-gray-700 disabled:opacity-40 font-black cursor-pointer"
                        >
                          ← Prev
                        </button>

                        <button
                          disabled={userRecordsPage >= userRecordsTotalPages || isLoadingUserRecords}
                          onClick={() => handleViewUserRecords(selectedDeduction, userRecordsPage + 1)}
                          className="px-3 py-1 rounded-xl border border-gray-200 dark:border-gray-700 disabled:opacity-40 font-black cursor-pointer"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
