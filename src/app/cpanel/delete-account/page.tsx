"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
const ButtonSpinner = () => (
  <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
);
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { useAuth } from "@/lib/AuthContext";
import { TwoFactorOtpVerificationView } from "@/components/auth/TwoFactorOtpVerificationView";

interface DeletionRequestUser {
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  balance: number;
  kycStatus: string;
  kycLevel: number;
  isBanned: boolean;
  isFrozen: boolean;
  deleteRequestedAt: string;
  deleteReason: string;
  virtualAccountNumber: string;
  createdAt: string;
}

type AdminPendingAction = "ban" | "unban" | "dismiss_request";

function CpanelDeleteAccountPageContent() {
  const { isDark, toggleTheme } = useCpanelTheme();
  const { user } = useAuth();
  const [requests, setRequests] = useState<DeletionRequestUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [processingUid, setProcessingUid] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Action Confirmation & 2FA OTP Modal State
  const [confirmModalUser, setConfirmModalUser] = useState<DeletionRequestUser | null>(null);
  const [pendingAction, setPendingAction] = useState<AdminPendingAction | null>(null);
  const [is2faStage, setIs2faStage] = useState(false);

  const bgClass = isDark ? "bg-[#0b0f17] text-white" : "bg-[#f8fafc] text-gray-900";
  const panelClass = isDark ? "bg-[#111827] border-gray-800" : "bg-white border-gray-200/80 shadow-xs";
  const inputClass = isDark
    ? "bg-gray-900 border-gray-800 text-white placeholder-gray-500 focus:border-[#FC7A00]"
    : "bg-gray-50 border-gray-200 text-black placeholder-gray-400 focus:border-[#FC7A00]";

  const fetchDeletionRequests = async (query = "", pageNum = 1) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/delete-account?search=${encodeURIComponent(query)}&page=${pageNum}&limit=10`);
      const data = await res.json();
      if (res.ok && data.success) {
        setRequests(data.requests || []);
        setCurrentPage(data.page || 1);
        setTotalPages(data.totalPages || 1);
        setTotalCount(data.count || 0);
      } else {
        toast.error(data.error || "Failed to load deletion requests.");
      }
    } catch {
      toast.error("Network error loading account deletion requests.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletionRequests(searchQuery.trim(), currentPage);
  }, [currentPage]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchDeletionRequests(searchQuery.trim(), 1);
  };

  const handleOpenActionConfirmation = (userItem: DeletionRequestUser, action: AdminPendingAction) => {
    setConfirmModalUser(userItem);
    setPendingAction(action);
    setIs2faStage(false);
  };

  const handleExecuteAction = async () => {
    if (!confirmModalUser || !pendingAction) return;

    const targetUid = confirmModalUser.uid;
    const action = pendingAction;
    setProcessingUid(targetUid);
    setIs2faStage(false);
    setConfirmModalUser(null);
    setPendingAction(null);

    const label = action === "ban" ? "Banning" : action === "unban" ? "Unbanning" : "Dismissing request for";
    toast.loading(`${label} account...`, { id: "admin-action" });

    try {
      const res = await fetch("/api/admin/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUid,
          action,
          banReason: confirmModalUser.deleteReason || "Requested account deletion.",
        }),
      });

      const data = await res.json();
      toast.dismiss("admin-action");

      if (res.ok && data.success) {
        toast.success(data.message || "Action executed successfully!");
        if (action === "ban") {
          setRequests((prev) =>
            prev.map((r) => (r.uid === targetUid ? { ...r, isBanned: true } : r))
          );
        } else if (action === "unban") {
          setRequests((prev) =>
            prev.map((r) => (r.uid === targetUid ? { ...r, isBanned: false } : r))
          );
        } else if (action === "dismiss_request") {
          setRequests((prev) => prev.filter((r) => r.uid !== targetUid));
        }
      } else {
        toast.error(data.error || "Failed to perform action.");
      }
    } catch {
      toast.dismiss("admin-action");
      toast.error("Network error executing action.");
    } finally {
      setProcessingUid(null);
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
                <span className="material-symbols-outlined text-red-600 text-[22px]">delete_forever</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Account Deletion Requests</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Inspect customer account deletion requests, verify wallet balances, and manage account ban controls.
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
                placeholder="Filter by user email, phone number, name, or UID..."
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
              <span>Filter Requests</span>
            </button>
          </form>
        </div>

        {/* Requests List */}
        {isLoading ? (
          <div className={cn("p-12 rounded-2xl border text-center flex flex-col items-center justify-center gap-3", panelClass)}>
            <ButtonSpinner />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Deletion Requests...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className={cn("p-12 rounded-2xl border text-center space-y-3", panelClass)}>
            <span className="material-symbols-outlined text-[48px] text-emerald-500">check_circle</span>
            <p className="text-xs font-black uppercase text-gray-400">No Account Deletion Requests</p>
            <p className="text-[11px] text-gray-500 max-w-md mx-auto">
              There are currently no pending account deletion requests from users.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase text-gray-400 tracking-wider">
                Pending Deletion Requests ({totalCount})
              </p>
              <p className="text-xs font-bold text-gray-500">
                Page {currentPage} of {totalPages}
              </p>
            </div>

            {requests.map((userItem) => {
              const isProcessing = processingUid === userItem.uid;
              return (
                <div key={userItem.uid} className={cn("p-5 rounded-2xl border space-y-4 transition-all", panelClass)}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/40 pb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-extrabold text-sm uppercase tracking-tight">{userItem.name}</h3>
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                          userItem.isBanned
                            ? "bg-red-500/10 border-red-500/20 text-red-500"
                            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                        )}>
                          {userItem.isBanned ? "ACCOUNT BANNED" : "ACTIVE USER"}
                        </span>
                        {userItem.isFrozen && (
                          <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/10 border border-blue-500/20 text-blue-500">
                            FROZEN
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-semibold text-gray-400 select-all">
                        Email: {userItem.email} • Phone: {userItem.phoneNumber}
                      </p>
                      <p className="text-[10px] font-mono text-gray-500">
                        UID: {userItem.uid} • Virtual Account: {userItem.virtualAccountNumber}
                      </p>
                    </div>

                    {/* Ban / Unban Actions */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {userItem.isBanned ? (
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleOpenActionConfirmation(userItem, "unban")}
                          className="px-4 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        >
                          {isProcessing ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">lock_open</span>}
                          <span>Unband User</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleOpenActionConfirmation(userItem, "ban")}
                          className="px-4 h-10 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        >
                          {isProcessing ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">block</span>}
                          <span>Band Account</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleOpenActionConfirmation(userItem, "dismiss_request")}
                        className="px-3.5 h-10 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>

                  {/* Account Metrics & Deletion Reason */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-xs">
                    <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100/50">
                      <span className="text-[9.5px] font-black uppercase text-gray-400 block">Wallet Balance</span>
                      <span className="font-mono text-sm font-black text-emerald-600 mt-0.5 block">
                        ₦{userItem.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100/50">
                      <span className="text-[9.5px] font-black uppercase text-gray-400 block">Identity / KYC Tier</span>
                      <span className="font-bold text-gray-800 mt-0.5 block uppercase">
                        {userItem.kycStatus} (Tier {userItem.kycLevel})
                      </span>
                    </div>

                    <div className="p-3 bg-gray-50/50 rounded-xl border border-gray-100/50">
                      <span className="text-[9.5px] font-black uppercase text-gray-400 block">Request Date</span>
                      <span className="font-semibold text-gray-700 mt-0.5 block">
                        {new Date(userItem.deleteRequestedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Deletion Reason */}
                  <div className="p-3 bg-red-50/60 border border-red-100/80 rounded-xl space-y-1">
                    <span className="text-[9.5px] font-black uppercase text-red-600 tracking-wider block">User Submitted Reason</span>
                    <p className="text-xs font-semibold text-red-950 italic">
                      &quot;{userItem.deleteReason}&quot;
                    </p>
                  </div>
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
        {confirmModalUser && pendingAction && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setConfirmModalUser(null);
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
                  description={`Complete 2FA OTP verification to confirm ${pendingAction === "ban" ? "banning" : pendingAction === "unban" ? "unbanning" : "dismissing request for"} ${confirmModalUser.name}.`}
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
                        {pendingAction === "ban" ? "block" : pendingAction === "unban" ? "lock_open" : "close_ring"}
                      </span>
                      <h3 className="font-extrabold text-base text-black">
                        Confirm Action: {pendingAction === "ban" ? "Band Account" : pendingAction === "unban" ? "Unband User" : "Dismiss Request"}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmModalUser(null);
                        setPendingAction(null);
                      }}
                      className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base font-bold">close</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-600 leading-relaxed">
                      Are you sure you want to {pendingAction === "ban" ? "ban" : pendingAction === "unban" ? "unban" : "dismiss deletion request for"}{" "}
                      <span className="font-bold text-black uppercase">{confirmModalUser.name}</span> ({confirmModalUser.email})?
                    </p>

                    {pendingAction === "ban" && (
                      <div className="p-3 bg-red-50 border border-red-100 rounded-2xl text-red-800 text-[11px] font-semibold flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg shrink-0">warning</span>
                        <span>Banning this account will immediately revoke all active sessions and block future login attempts.</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmModalUser(null);
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
                        pendingAction === "ban" ? "bg-red-600 hover:bg-red-700" : "bg-[#FC7A00] hover:bg-[#e06600]"
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

export default function CpanelDeleteAccountPage() {
  return (
    <CpanelRouteGuard requiredPermission="users.manage">
      <CpanelDeleteAccountPageContent />
    </CpanelRouteGuard>
  );
}
