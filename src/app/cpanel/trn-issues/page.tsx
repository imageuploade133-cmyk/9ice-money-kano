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

interface TrnIssueReport {
  issueId: string;
  uid: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  transactionReference: string;
  transactionId: string;
  amount: number;
  currency: string;
  transactionType: string;
  transactionDate: string;
  recipientName: string;
  issueCategory: string;
  customNote: string;
  screenshotUrl?: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  createdAt: string;
}

function CpanelTrnIssuesPageContent() {
  const { isDark, toggleTheme } = useCpanelTheme();
  const { user } = useAuth();
  const [reports, setReports] = useState<TrnIssueReport[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Action Confirmation & 2FA OTP Modal State
  const [confirmModalReport, setConfirmModalReport] = useState<TrnIssueReport | null>(null);
  const [pendingAction, setPendingAction] = useState<"resolve" | "dismiss" | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [is2faStage, setIs2faStage] = useState(false);

  const bgClass = isDark ? "bg-[#0b0f17] text-white" : "bg-[#f8fafc] text-gray-900";
  const panelClass = isDark ? "bg-[#111827] border-gray-800" : "bg-white border-gray-200/80 shadow-xs";
  const inputClass = isDark
    ? "bg-gray-900 border-gray-800 text-white placeholder-gray-500 focus:border-[#FC7A00]"
    : "bg-gray-50 border-gray-200 text-black placeholder-gray-400 focus:border-[#FC7A00]";

  const fetchTrnReports = async (query = "", pageNum = 1) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/trn-issues?search=${encodeURIComponent(query)}&page=${pageNum}&limit=10`);
      const data = await res.json();
      if (res.ok && data.success) {
        setReports(data.reports || []);
        setCurrentPage(data.page || 1);
        setTotalPages(data.totalPages || 1);
        setTotalCount(data.count || 0);
      } else {
        toast.error(data.error || "Failed to load transaction reports.");
      }
    } catch {
      toast.error("Network error loading transaction reports.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrnReports(searchQuery.trim(), currentPage);
  }, [currentPage]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchTrnReports(searchQuery.trim(), 1);
  };

  const handleOpenActionConfirmation = (report: TrnIssueReport, action: "resolve" | "dismiss") => {
    setConfirmModalReport(report);
    setPendingAction(action);
    setAdminNote("");
    setIs2faStage(false);
  };

  const handleExecuteAction = async () => {
    if (!confirmModalReport || !pendingAction) return;

    const issueId = confirmModalReport.issueId;
    const action = pendingAction;
    setProcessingId(issueId);
    setIs2faStage(false);
    setConfirmModalReport(null);
    setPendingAction(null);

    const label = action === "resolve" ? "Resolving" : "Dismissing";
    toast.loading(`${label} report...`, { id: "trn-action" });

    try {
      const res = await fetch("/api/admin/trn-issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId,
          action,
          adminNote,
        }),
      });

      const data = await res.json();
      toast.dismiss("trn-action");

      if (res.ok && data.success) {
        toast.success(data.message || "Report status updated!");
        setReports((prev) =>
          prev.map((r) =>
            r.issueId === issueId
              ? { ...r, status: action === "resolve" ? "RESOLVED" : "DISMISSED" }
              : r
          )
        );
      } else {
        toast.error(data.error || "Failed to perform action.");
      }
    } catch {
      toast.dismiss("trn-action");
      toast.error("Network error updating report.");
    } finally {
      setProcessingId(null);
    }
  };

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
                <span className="material-symbols-outlined text-red-600 text-[22px]">report_problem</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">TRN Issues & Reports</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Inspect transaction dispute reports, fraud warnings, and credit discrepancies submitted by users.
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

        {/* Search Panel */}
        <div className={cn("p-5 rounded-2xl border space-y-4", panelClass)}>
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-[18px]">search</span>
              <input
                type="text"
                placeholder="Filter by transaction ref, user email, phone, name, or issue category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(inputClass, "pl-10 pr-4 h-11 w-full outline-none rounded-xl text-xs font-semibold")}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full md:w-auto px-6 h-11 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">search</span>}
              <span>Filter Reports</span>
            </button>
          </form>
        </div>

        {/* Reports List */}
        {isLoading ? (
          <div className={cn("p-12 rounded-2xl border text-center flex flex-col items-center justify-center gap-3", panelClass)}>
            <ButtonSpinner />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Transaction Reports...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className={cn("p-12 rounded-2xl border text-center space-y-3", panelClass)}>
            <span className="material-symbols-outlined text-[48px] text-emerald-500">check_circle</span>
            <p className="text-xs font-black uppercase text-gray-400">No Transaction Reports</p>
            <p className="text-[11px] text-gray-500 max-w-md mx-auto">
              There are currently no transaction dispute or fraud reports submitted by users.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase text-gray-400 tracking-wider">
                Transaction Dispute Reports ({totalCount})
              </p>
              <p className="text-xs font-bold text-gray-500">
                Page {currentPage} of {totalPages}
              </p>
            </div>

            {reports.map((report) => {
              const isProcessing = processingId === report.issueId;
              return (
                <div key={report.issueId} className={cn("p-5 rounded-2xl border space-y-4 transition-all", panelClass)}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/40 pb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="material-symbols-outlined text-red-500 text-lg">flag</span>
                        <h3 className="font-extrabold text-sm text-red-600 uppercase tracking-tight">{report.issueCategory}</h3>
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                          report.status === "RESOLVED"
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                            : report.status === "DISMISSED"
                            ? "bg-gray-500/10 border-gray-500/20 text-gray-400"
                            : "bg-red-500/10 border-red-500/20 text-red-500"
                        )}>
                          {report.status}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-gray-400 select-all">
                        Reporter: {report.userName} ({report.userEmail} • {report.userPhone})
                      </p>
                      <p className="text-[10px] font-mono text-gray-500 select-all">
                        Transaction Ref: {report.transactionReference} • Issue ID: {report.issueId}
                      </p>
                    </div>

                    {/* Admin Action Buttons */}
                    {report.status === "PENDING" && (
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleOpenActionConfirmation(report, "resolve")}
                          className="px-4 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        >
                          {isProcessing ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">check_circle</span>}
                          <span>Mark Resolved</span>
                        </button>

                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleOpenActionConfirmation(report, "dismiss")}
                          className="px-3.5 h-10 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Transaction Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1 text-xs">
                    <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100/50">
                      <span className="text-[9.5px] font-black uppercase text-gray-400 block">Reported Amount</span>
                      <span className="font-mono text-sm font-black text-red-600 mt-0.5 block">
                        ₦{report.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100/50">
                      <span className="text-[9.5px] font-black uppercase text-gray-400 block">Recipient / Entity</span>
                      <span className="font-bold text-gray-800 mt-0.5 block truncate">
                        {report.recipientName}
                      </span>
                    </div>

                    <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100/50">
                      <span className="text-[9.5px] font-black uppercase text-gray-400 block">Transaction Type</span>
                      <span className="font-bold text-gray-800 mt-0.5 block uppercase">
                        {report.transactionType}
                      </span>
                    </div>

                    <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100/50">
                      <span className="text-[9.5px] font-black uppercase text-gray-400 block">Reported On</span>
                      <span className="font-semibold text-gray-700 mt-0.5 block">
                        {new Date(report.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Custom Note & Screenshot Proof */}
                  {(report.customNote || report.screenshotUrl) && (
                    <div className="p-3 bg-red-50/60 border border-red-100/80 rounded-xl space-y-2">
                      {report.customNote && (
                        <div className="space-y-0.5">
                          <span className="text-[9.5px] font-black uppercase text-red-600 tracking-wider block">User Provided Explanation</span>
                          <p className="text-xs font-semibold text-red-950 italic">
                            &quot;{report.customNote}&quot;
                          </p>
                        </div>
                      )}

                      {report.screenshotUrl && (
                        <div className="pt-1 space-y-1">
                          <span className="text-[9.5px] font-black uppercase text-red-600 tracking-wider block">Proof Screenshot</span>
                          <a
                            href={report.screenshotUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 p-2 bg-white border border-red-200 rounded-lg hover:border-red-400 transition-all cursor-pointer group"
                          >
                            <img src={report.screenshotUrl} alt="Report Screenshot Proof" className="w-12 h-12 object-cover rounded-md border" />
                            <div className="text-left">
                              <p className="text-[11px] font-bold text-gray-800 group-hover:text-red-600 flex items-center gap-1">
                                <span>View Full Screenshot</span>
                                <span className="material-symbols-outlined text-xs">open_in_new</span>
                              </p>
                              <p className="text-[9.5px] text-gray-500 font-mono">i.ibb.co direct image</p>
                            </div>
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Pagination Previous & Next Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-200/40">
                <button
                  type="button"
                  disabled={currentPage <= 1 || isLoading}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-base">chevron_left</span>
                  <span>Previous</span>
                </button>

                <span className="text-xs font-extrabold text-gray-500">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  disabled={currentPage >= totalPages || isLoading}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-5 py-2.5 bg-[#FC7A00] hover:bg-[#e06600] disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                >
                  <span>Next</span>
                  <span className="material-symbols-outlined text-base">chevron_right</span>
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Confirmation & 2FA OTP Modal Drawer */}
      <AnimatePresence>
        {confirmModalReport && pendingAction && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setConfirmModalReport(null);
                setPendingAction(null);
                setIs2faStage(false);
              }}
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

              {is2faStage ? (
                <TwoFactorOtpVerificationView
                  user={user}
                  title="Admin Security Verification"
                  description={`Complete 2FA OTP verification to confirm ${pendingAction === "resolve" ? "resolving" : "dismissing"} report for transaction ${confirmModalReport.transactionReference}.`}
                  onVerifiedSuccess={handleExecuteAction}
                  onCancel={() => {
                    setIs2faStage(false);
                  }}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2 text-[#FC7A00]">
                      <span className="material-symbols-outlined text-2xl font-bold">
                        {pendingAction === "resolve" ? "check_circle" : "close_ring"}
                      </span>
                      <h3 className="font-extrabold text-base text-black">
                        Confirm Action: {pendingAction === "resolve" ? "Mark Resolved" : "Dismiss Report"}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmModalReport(null);
                        setPendingAction(null);
                      }}
                      className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base font-bold">close</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-600 leading-relaxed">
                      Are you sure you want to {pendingAction === "resolve" ? "mark as resolved" : "dismiss"} the report for transaction{" "}
                      <span className="font-bold text-black uppercase">{confirmModalReport.transactionReference}</span> submitted by{" "}
                      <span className="font-bold text-black">{confirmModalReport.userName}</span>?
                    </p>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                        Admin Note / Resolution Details
                      </label>
                      <textarea
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        placeholder="Add resolution details or inspection note..."
                        className="w-full h-20 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold outline-none focus:border-[#FC7A00] transition-all resize-none"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmModalReport(null);
                        setPendingAction(null);
                      }}
                      className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => setIs2faStage(true)}
                      className={cn(
                        "flex-1 py-3 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm",
                        pendingAction === "resolve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-700 hover:bg-gray-800"
                      )}
                    >
                      <span>Proceed & Verify OTP</span>
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CpanelTrnIssuesPage() {
  return (
    <CpanelRouteGuard requiredPermission="users.view">
      <CpanelTrnIssuesPageContent />
    </CpanelRouteGuard>
  );
}
