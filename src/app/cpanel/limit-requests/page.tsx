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

interface LimitRequest {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  bvn: string;
  governmentIdUrl?: string;
  governmentIdType?: string;
  proofOfAddressUrl?: string;
  selfieUrl?: string;
  targetTier: string;
  currentTier?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  assignedTier?: string;
  dailyLimit?: number;
  singleLimit?: number;
  rejectionReason?: string;
  createdAt: string;
}

interface Metrics {
  totalRequests: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
}

function LimitRequestsContent() {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useCpanelTheme();

  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full px-3.5 py-2.5 text-xs outline-none font-semibold w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full px-3.5 py-2.5 text-xs outline-none font-semibold w-full";

  const [requests, setRequests] = useState<LimitRequest[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ totalRequests: 0, pendingCount: 0, approvedCount: 0, rejectedCount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Inspection Drawer state
  const [selectedRequest, setSelectedRequest] = useState<LimitRequest | null>(null);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);

  // Approval Modal state
  const [approveModalReq, setApproveModalReq] = useState<LimitRequest | null>(null);
  const [assignedTier, setAssignedTier] = useState<"Tier 1" | "Tier 2" | "Tier 3">("Tier 2");
  const [customDailyLimit, setCustomDailyLimit] = useState<number>(5000000);
  const [customSingleLimit, setCustomSingleLimit] = useState<number>(2000000);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Rejection Modal state
  const [rejectModalReq, setRejectModalReq] = useState<LimitRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      let idToken = "mock-admin-token";
      if (user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/limit-requests", {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setRequests(data.requests || []);
        if (data.metrics) setMetrics(data.metrics);
      } else {
        toast.error(data.error || "Failed to fetch limit requests.");
      }
    } catch {
      toast.error("Network communication error loading limit requests.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [user]);

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveModalReq) return;

    setIsProcessingAction(true);
    toast.loading("Approving limit upgrade and setting tier...");

    try {
      let idToken = "mock-admin-token";
      if (user) idToken = await user.getIdToken();

      const res = await fetch("/api/admin/limit-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "approve",
          userId: approveModalReq.userId,
          assignedTier,
          dailyLimit: customDailyLimit,
          singleLimit: customSingleLimit,
        }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || "Tier upgrade approved successfully!");
        setApproveModalReq(null);
        setSelectedRequest(null);
        fetchRequests();
      } else {
        toast.error(data.error || "Approval failed.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network error executing approval.");
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalReq) return;

    setIsProcessingAction(true);
    toast.loading("Rejecting tier upgrade request...");

    try {
      let idToken = "mock-admin-token";
      if (user) idToken = await user.getIdToken();

      const res = await fetch("/api/admin/limit-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "reject",
          userId: rejectModalReq.userId,
          rejectionReason,
        }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("Request rejected.");
        setRejectModalReq(null);
        setSelectedRequest(null);
        fetchRequests();
      } else {
        toast.error(data.error || "Rejection failed.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network error executing rejection.");
    } finally {
      setIsProcessingAction(false);
    }
  };

  const filteredRequests = requests.filter((r) => {
    const matchesSearch =
      r.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.bvn.includes(searchQuery);
    const matchesStatus = statusFilter === "ALL" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className={cn("min-h-screen flex flex-col font-sans transition-colors duration-300", isDark ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-800")}>

      {/* Header Bar */}
      <div className={cn("sticky top-0 z-40 border-b transition-colors duration-300 px-6 py-4 flex items-center justify-between", isDark ? "bg-gray-950/80 backdrop-blur-md border-gray-850" : "bg-white/80 backdrop-blur-md border-gray-200")}>
        <div className="flex items-center gap-3">
          <Link href="/cpanel" className={cn("w-9 h-9 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")}>
            <span className="material-symbols-outlined text-[18px] font-bold">arrow_back</span>
          </Link>
          <div>
            <h1 className="font-extrabold text-base tracking-tight leading-tight">Limit Requests Console</h1>
            <p className="text-[10px] text-gray-400 font-semibold">Manage user tier upgrade applications and customize daily transfer limits.</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/cpanel/limits"
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
            <span>Account Limits Manager</span>
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
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-[#FC7A00] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">published_with_changes</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Total Limit Applications</p>
              <h3 className="font-mono text-2xl font-black tracking-tight mt-0.5">{metrics.totalRequests}</h3>
            </div>
          </div>

          <div className={cn("rounded-2xl p-5 border flex items-center gap-4 shadow-none", panelClass)}>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">pending_actions</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Pending Review</p>
              <h3 className="font-mono text-2xl font-black tracking-tight mt-0.5">{metrics.pendingCount}</h3>
            </div>
          </div>

          <div className={cn("rounded-2xl p-5 border flex items-center gap-4 shadow-none", panelClass)}>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">verified</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Approved Upgrades</p>
              <h3 className="font-mono text-2xl font-black tracking-tight mt-0.5">{metrics.approvedCount}</h3>
            </div>
          </div>

          <div className={cn("rounded-2xl p-5 border flex items-center gap-4 shadow-none", panelClass)}>
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">block</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Rejected Requests</p>
              <h3 className="font-mono text-2xl font-black tracking-tight mt-0.5">{metrics.rejectedCount}</h3>
            </div>
          </div>
        </div>

        {/* Requests Table Card */}
        <div className={cn("rounded-2xl p-5 border transition-all shadow-none space-y-4", panelClass)}>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 border-b pb-4 border-gray-200/50">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FC7A00] text-[20px]">manage_accounts</span>
              <h3 className="font-black text-xs uppercase tracking-wider">Tier Upgrade Applications</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search user name, email, BVN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={inputClass}
              />

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={cn(inputClass, "w-auto cursor-pointer font-bold")}
              >
                <option value="ALL">All Status</option>
                <option value="PENDING">Pending ⏳</option>
                <option value="APPROVED">Approved ✅</option>
                <option value="REJECTED">Rejected ❌</option>
              </select>

              <button
                onClick={fetchRequests}
                className={cn("p-2 border rounded-xl transition-all cursor-pointer", isDark ? "border-gray-800 hover:bg-gray-800" : "border-gray-200 hover:bg-gray-100")}
              >
                <span className="material-symbols-outlined text-[18px] font-bold block">refresh</span>
              </button>
            </div>
          </div>

          {/* Table View */}
          {isLoading ? (
            <div className="text-center py-16 text-gray-400 text-xs font-bold uppercase tracking-widest animate-pulse">
              <ButtonSpinner /> Loading Tier Applications...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-2xl flex flex-col items-center justify-center p-6 space-y-3 border-gray-200 dark:border-gray-800">
              <span className="material-symbols-outlined text-[36px] text-gray-400">person_search</span>
              <p className="text-xs uppercase font-black text-gray-400">No Limit Upgrade Requests Found</p>
            </div>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={cn("border-b text-[10px] font-black uppercase tracking-wider", isDark ? "border-gray-800 text-gray-400" : "border-gray-200 text-gray-500")}>
                    <th className="py-3 px-3">Customer Profile</th>
                    <th className="py-3 px-3">BVN / NIN</th>
                    <th className="py-3 px-3">Gov ID Card</th>
                    <th className="py-3 px-3">Current → Target</th>
                    <th className="py-3 px-3">Proof Address</th>
                    <th className="py-3 px-3">Biometric Selfie</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/50 dark:divide-gray-800/50 text-xs">
                  {filteredRequests.map((r) => (
                    <tr key={r.id} className={cn("transition-colors", isDark ? "hover:bg-gray-900/50" : "hover:bg-gray-50/50")}>
                      <td className="py-3.5 px-3">
                        <p className="font-extrabold text-xs text-gray-900 dark:text-white">{r.fullName}</p>
                        <p className="text-[11px] text-gray-400 font-medium">{r.email}</p>
                      </td>

                      <td className="py-3.5 px-3 font-mono font-bold text-gray-700 dark:text-gray-300">
                        {r.bvn}
                      </td>

                      <td className="py-3.5 px-3">
                        {r.governmentIdUrl ? (
                          <button
                            onClick={() => setImageModalUrl(r.governmentIdUrl!)}
                            className="w-12 h-10 rounded-lg border border-orange-500/30 overflow-hidden shrink-0 cursor-pointer hover:scale-105 transition-transform relative group"
                          >
                            <img src={r.governmentIdUrl} alt="Gov ID" className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <span className="text-gray-400 text-[10px]">No ID</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 font-bold">
                        <span className="text-gray-400">{r.currentTier || "Tier 1"}</span>
                        <span className="mx-1 text-[#FC7A00]">→</span>
                        <span className="text-emerald-500 font-extrabold">{r.targetTier || "Tier 2"}</span>
                      </td>

                      <td className="py-3.5 px-3">
                        {r.proofOfAddressUrl ? (
                          <button
                            onClick={() => setImageModalUrl(r.proofOfAddressUrl!)}
                            className="w-12 h-10 rounded-lg border overflow-hidden shrink-0 cursor-pointer hover:scale-105 transition-transform"
                          >
                            <img src={r.proofOfAddressUrl} alt="Address Doc" className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <span className="text-gray-400 text-[10px]">No File</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        {r.selfieUrl ? (
                          <button
                            onClick={() => setImageModalUrl(r.selfieUrl!)}
                            className="w-10 h-10 rounded-full border-2 border-emerald-500 overflow-hidden shrink-0 cursor-pointer hover:scale-105 transition-transform"
                          >
                            <img src={r.selfieUrl} alt="Selfie" className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <span className="text-gray-400 text-[10px]">No Selfie</span>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                          r.status === "APPROVED" && "bg-emerald-500/10 border-emerald-500/20 text-emerald-500",
                          r.status === "PENDING" && "bg-amber-500/10 border-amber-500/20 text-amber-500",
                          r.status === "REJECTED" && "bg-rose-500/10 border-rose-500/20 text-rose-500"
                        )}>
                          {r.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedRequest(r)}
                            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-200 rounded-xl text-[11px] font-extrabold uppercase transition-all cursor-pointer"
                          >
                            Inspect
                          </button>

                          {r.status === "PENDING" && (
                            <>
                              <button
                                onClick={() => {
                                  setApproveModalReq(r);
                                  setAssignedTier((r.targetTier as any) || "Tier 2");
                                  setCustomDailyLimit(r.targetTier === "Tier 3" ? 50000000 : 5000000);
                                  setCustomSingleLimit(r.targetTier === "Tier 3" ? 10000000 : 2000000);
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black uppercase transition-all cursor-pointer shadow-3xs"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => setRejectModalReq(r)}
                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[11px] font-black uppercase transition-all cursor-pointer shadow-3xs"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>

      </div>

      {/* Inspect Request Drawer Modal */}
      <AnimatePresence>
        {selectedRequest && (
          <div className="fixed inset-0 z-[99998] bg-black/70 backdrop-blur-sm flex items-center justify-end">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className={cn("w-full max-w-lg h-full overflow-y-auto p-6 space-y-6 shadow-2xl flex flex-col justify-between", isDark ? "bg-gray-900 text-white" : "bg-white text-gray-900")}
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b pb-4 border-gray-200/50">
                  <h3 className="font-extrabold text-base uppercase">Inspect Limit Upgrade Request</h3>
                  <button onClick={() => setSelectedRequest(null)} className="w-8 h-8 rounded-full border flex items-center justify-center text-gray-400">
                    <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border space-y-2">
                    <p className="text-[10px] uppercase font-black text-gray-400">Customer Details</p>
                    <p className="font-black text-sm text-gray-900 dark:text-white">{selectedRequest.fullName}</p>
                    <p className="font-semibold text-gray-500">{selectedRequest.email}</p>
                    <p className="font-mono text-gray-700 dark:text-gray-300">BVN / NIN: {selectedRequest.bvn}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 dark:bg-gray-800 p-3.5 rounded-2xl border">
                      <p className="text-[10px] uppercase font-black text-gray-400 mb-1">Target Upgrade</p>
                      <p className="font-black text-emerald-500 text-sm">{selectedRequest.targetTier}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-3.5 rounded-2xl border">
                      <p className="text-[10px] uppercase font-black text-gray-400 mb-1">Status</p>
                      <p className="font-black text-amber-500 text-sm">{selectedRequest.status}</p>
                    </div>
                  </div>

                  {/* Documents Inspection */}
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-black text-gray-400">
                      Government ID Card ({selectedRequest.governmentIdType || "National ID Card"})
                    </p>
                    {selectedRequest.governmentIdUrl ? (
                      <div
                        onClick={() => setImageModalUrl(selectedRequest.governmentIdUrl!)}
                        className="rounded-2xl border overflow-hidden max-h-48 cursor-pointer hover:opacity-90 border-orange-500/30"
                      >
                        <img src={selectedRequest.governmentIdUrl} alt="Government ID" className="w-full h-48 object-cover" />
                      </div>
                    ) : (
                      <p className="text-gray-400">No Government ID uploaded.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-black text-gray-400">Proof of Address Document</p>
                    {selectedRequest.proofOfAddressUrl ? (
                      <div
                        onClick={() => setImageModalUrl(selectedRequest.proofOfAddressUrl!)}
                        className="rounded-2xl border overflow-hidden max-h-48 cursor-pointer hover:opacity-90"
                      >
                        <img src={selectedRequest.proofOfAddressUrl} alt="Address Document" className="w-full h-48 object-cover" />
                      </div>
                    ) : (
                      <p className="text-gray-400">No document uploaded.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-black text-gray-400">Biometric Live Selfie</p>
                    {selectedRequest.selfieUrl ? (
                      <div
                        onClick={() => setImageModalUrl(selectedRequest.selfieUrl!)}
                        className="rounded-2xl border overflow-hidden max-h-48 cursor-pointer hover:opacity-90"
                      >
                        <img src={selectedRequest.selfieUrl} alt="Selfie" className="w-full h-48 object-cover" />
                      </div>
                    ) : (
                      <p className="text-gray-400">No selfie uploaded.</p>
                    )}
                  </div>
                </div>
              </div>

              {selectedRequest.status === "PENDING" && (
                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-200/50">
                  <button
                    onClick={() => {
                      setApproveModalReq(selectedRequest);
                      setAssignedTier((selectedRequest.targetTier as any) || "Tier 2");
                      setCustomDailyLimit(selectedRequest.targetTier === "Tier 3" ? 50000000 : 5000000);
                      setCustomSingleLimit(selectedRequest.targetTier === "Tier 3" ? 10000000 : 2000000);
                    }}
                    className="py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase text-xs cursor-pointer"
                  >
                    Approve Request
                  </button>

                  <button
                    onClick={() => setRejectModalReq(selectedRequest)}
                    className="py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black uppercase text-xs cursor-pointer"
                  >
                    Reject Request
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Approval & Limit Customizer Dialog */}
      <AnimatePresence>
        {approveModalReq && (
          <div className="fixed inset-0 z-[100000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn("w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-5", isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900")}
            >
              <div className="flex justify-between items-center border-b pb-3 border-gray-200/50">
                <h3 className="font-extrabold text-sm uppercase">Approve & Customize Limits</h3>
                <button onClick={() => setApproveModalReq(null)} className="w-8 h-8 rounded-full border flex items-center justify-center text-gray-400">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>

              <form onSubmit={handleApprove} className="space-y-4">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-black text-gray-400">Customer</p>
                  <p className="font-black text-xs text-gray-900 dark:text-white">{approveModalReq.fullName}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400">Assign Tier Level</label>
                  <select
                    value={assignedTier}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setAssignedTier(val);
                      if (val === "Tier 3") {
                        setCustomDailyLimit(50000000);
                        setCustomSingleLimit(10000000);
                      } else if (val === "Tier 2") {
                        setCustomDailyLimit(5000000);
                        setCustomSingleLimit(2000000);
                      } else {
                        setCustomDailyLimit(500000);
                        setCustomSingleLimit(200000);
                      }
                    }}
                    className={cn(inputClass, "font-bold cursor-pointer")}
                  >
                    <option value="Tier 1">Tier 1 (₦500,000 / Day)</option>
                    <option value="Tier 2">Tier 2 (₦5,000,000 / Day)</option>
                    <option value="Tier 3">Tier 3 (₦50,000,000 / Day)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400">Custom Daily Transfer Limit (₦)</label>
                  <input
                    type="number"
                    required
                    min={100000}
                    value={customDailyLimit}
                    onChange={(e) => setCustomDailyLimit(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400">Custom Single Transfer Limit (₦)</label>
                  <input
                    type="number"
                    required
                    min={50000}
                    value={customSingleLimit}
                    onChange={(e) => setCustomSingleLimit(Number(e.target.value))}
                    className={inputClass}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isProcessingAction}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md"
                >
                  {isProcessingAction ? <ButtonSpinner /> : "Confirm Approval & Set Limits"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rejection Dialog */}
      <AnimatePresence>
        {rejectModalReq && (
          <div className="fixed inset-0 z-[100000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn("w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-5", isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900")}
            >
              <div className="flex justify-between items-center border-b pb-3 border-gray-200/50">
                <h3 className="font-extrabold text-sm uppercase">Reject Upgrade Request</h3>
                <button onClick={() => setRejectModalReq(null)} className="w-8 h-8 rounded-full border flex items-center justify-center text-gray-400">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>

              <form onSubmit={handleReject} className="space-y-4">
                <p className="text-xs text-gray-500">
                  Are you sure you want to reject the tier upgrade request for <strong className="text-gray-900 dark:text-white">{rejectModalReq.fullName}</strong>?
                </p>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400">Rejection Reason</label>
                  <textarea
                    required
                    placeholder="Enter reason for rejecting this tier upgrade application..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className={cn(inputClass, "h-20 resize-none")}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isProcessingAction}
                  className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md"
                >
                  {isProcessingAction ? <ButtonSpinner /> : "Confirm Rejection"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {imageModalUrl && (
          <div className="fixed inset-0 z-[100010] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="relative max-w-3xl w-full flex flex-col items-center">
              <button
                type="button"
                onClick={() => setImageModalUrl(null)}
                className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/40 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px] font-bold">close</span>
              </button>
              <img
                src={imageModalUrl}
                alt="Document Preview"
                className="w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/20"
              />
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default function LimitRequestsPage() {
  return (
    <CpanelRouteGuard requiredPermission="users.manage">
      <LimitRequestsContent />
    </CpanelRouteGuard>
  );
}
