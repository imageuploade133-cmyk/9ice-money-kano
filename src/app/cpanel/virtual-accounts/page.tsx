"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { CpanelActionDropdown } from "@/components/cpanel/CpanelActionDropdown";
import { toast } from "sonner";

interface VirtualAccountItem {
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  virtualAccountNumber: string;
  virtualAccountBankName: string;
  virtualAccountName: string;
  virtualAccountProvider: string;
  isActive: boolean;
  deactivatedAt: string | null;
  deactivatedBy: string | null;
  kycStatus: string;
  balance: number;
  createdAt: string;
}

export default function CpanelVirtualAccountsPage() {
  const { isDark } = useCpanelTheme();
  const [loading, setLoading] = useState<boolean>(true);
  const [virtualAccounts, setVirtualAccounts] = useState<VirtualAccountItem[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "DEACTIVATED">("ALL");

  // Counts & Cursor Pagination States
  const [counts, setCounts] = useState<{ total: number; active: number; deactivated: number }>({
    total: 0,
    active: 0,
    deactivated: 0,
  });
  const [paginationInfo, setPaginationInfo] = useState<{
    limit: number;
    hasNextPage: boolean;
    lastDocId: string | null;
  }>({
    limit: 20,
    hasNextPage: false,
    lastDocId: null,
  });
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);

  // Confirmation modal state
  const [actionTarget, setActionTarget] = useState<VirtualAccountItem | null>(null);
  const [actionType, setActionType] = useState<"deactivate" | "reactivate" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchVirtualAccounts = useCallback(async (
    startAfterId: string | null = null,
    searchQuery = searchTerm,
    status = statusFilter
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      params.set("status", status);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (startAfterId) params.set("startAfter", startAfterId);

      const res = await fetch(`/api/admin/virtual-accounts?${params.toString()}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.virtualAccounts)) {
        setVirtualAccounts(data.virtualAccounts);
        if (data.counts) {
          setCounts(data.counts);
        }
        if (data.pagination) {
          setPaginationInfo(data.pagination);
        }
      } else {
        toast.error(data.error || "Failed to load virtual accounts.");
        setVirtualAccounts([]);
      }
    } catch (err: any) {
      toast.error("Network error fetching virtual accounts.");
      setVirtualAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    fetchVirtualAccounts(null, "", "ALL");
  }, []);

  const handleNextPage = () => {
    if (paginationInfo.hasNextPage && paginationInfo.lastDocId) {
      const nextIndex = currentPageIndex + 1;
      const newStack = [...cursorStack];
      newStack[nextIndex] = paginationInfo.lastDocId;
      setCursorStack(newStack);
      setCurrentPageIndex(nextIndex);
      fetchVirtualAccounts(paginationInfo.lastDocId, searchTerm, statusFilter);
    }
  };

  const handlePrevPage = () => {
    if (currentPageIndex > 0) {
      const prevIndex = currentPageIndex - 1;
      setCurrentPageIndex(prevIndex);
      fetchVirtualAccounts(cursorStack[prevIndex], searchTerm, statusFilter);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCursorStack([null]);
    setCurrentPageIndex(0);
    fetchVirtualAccounts(null, searchTerm, statusFilter);
  };

  const handleStatusFilterChange = (newStatus: "ALL" | "ACTIVE" | "DEACTIVATED") => {
    setStatusFilter(newStatus);
    setCursorStack([null]);
    setCurrentPageIndex(0);
    fetchVirtualAccounts(null, searchTerm, newStatus);
  };

  const handleToggleStatus = async () => {
    if (!actionTarget || !actionType) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/virtual-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionType,
          targetUid: actionTarget.uid,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || `Account ${actionType}d successfully.`);
        setActionTarget(null);
        setActionType(null);
        fetchVirtualAccounts(searchTerm);
      } else {
        toast.error(data.error || `Failed to ${actionType} virtual account.`);
      }
    } catch (err) {
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  // Filter accounts by status tab if client-side search is active
  const filteredAccounts = virtualAccounts.filter((item) => {
    if (statusFilter === "ACTIVE") return item.isActive;
    if (statusFilter === "DEACTIVATED") return !item.isActive;
    return true;
  });

  const totalCount = counts.total || virtualAccounts.length;
  const activeCount = counts.active || virtualAccounts.filter((a) => a.isActive).length;
  const deactivatedCount = counts.deactivated || virtualAccounts.filter((a) => !a.isActive).length;
  const totalBalanceSum = virtualAccounts.reduce((acc, curr) => acc + (curr.balance || 0), 0);

  return (
    <div className={`min-h-screen p-4 sm:p-6 transition-colors duration-200 ${isDark ? "bg-[#0B0E14] text-gray-100" : "bg-gray-50 text-gray-900"}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Virtual Accounts Management</h1>
          <p className={`text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            Inspect customer virtual account numbers, search across records, and manage account availability.
          </p>
        </div>

        <button
          onClick={() => fetchVirtualAccounts(searchTerm)}
          disabled={loading}
          className={`inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
            isDark ? "bg-[#1E2638] text-white hover:bg-[#2A364F]" : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
          } shadow-sm`}
        >
          <span className="material-symbols-outlined text-lg mr-2">refresh</span>
          Refresh
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className={`p-4 rounded-2xl border ${isDark ? "bg-[#151C2C] border-gray-800" : "bg-white border-gray-200"} shadow-sm`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              Total Accounts
            </span>
            <div className="p-2 rounded-xl bg-orange-500/10 text-[#FC7A00]">
              <span className="material-symbols-outlined text-xl">account_balance</span>
            </div>
          </div>
          <p className="text-2xl font-extrabold mt-2">{totalCount}</p>
        </div>

        <div className={`p-4 rounded-2xl border ${isDark ? "bg-[#151C2C] border-gray-800" : "bg-white border-gray-200"} shadow-sm`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              Active Virtual Accounts
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <span className="material-symbols-outlined text-xl">check_circle</span>
            </div>
          </div>
          <p className="text-2xl font-extrabold text-emerald-500 mt-2">{activeCount}</p>
        </div>

        <div className={`p-4 rounded-2xl border ${isDark ? "bg-[#151C2C] border-gray-800" : "bg-white border-gray-200"} shadow-sm`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              Deactivated Accounts
            </span>
            <div className="p-2 rounded-xl bg-red-500/10 text-red-500">
              <span className="material-symbols-outlined text-xl">block</span>
            </div>
          </div>
          <p className="text-2xl font-extrabold text-red-500 mt-2">{deactivatedCount}</p>
        </div>

        <div className={`p-4 rounded-2xl border ${isDark ? "bg-[#151C2C] border-gray-800" : "bg-white border-gray-200"} shadow-sm`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              Total Balance Pool
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <span className="material-symbols-outlined text-xl">payments</span>
            </div>
          </div>
          <p className="text-2xl font-extrabold text-blue-500 mt-2">
            ₦{totalBalanceSum.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className={`p-4 rounded-2xl border mb-6 ${isDark ? "bg-[#151C2C] border-gray-800" : "bg-white border-gray-200"} shadow-sm flex flex-col md:flex-row items-center justify-between gap-4`}>
        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-200/50 dark:bg-gray-800/50 w-full md:w-auto">
          {(["ALL", "ACTIVE", "DEACTIVATED"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => handleStatusFilterChange(tab)}
              className={`flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                statusFilter === tab
                  ? "bg-[#FC7A00] text-white shadow-sm"
                  : isDark
                  ? "text-gray-400 hover:text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab === "ALL" ? `ALL (${totalCount})` : tab === "ACTIVE" ? `ACTIVE (${activeCount})` : `DEACTIVATED (${deactivatedCount})`}
            </button>
          ))}
        </div>

        {/* Search Input Form */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-96">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Name, Email, Phone, Account #"
              className={`w-full pl-9 pr-4 py-2 text-xs font-medium rounded-xl border transition-all outline-none ${
                isDark
                  ? "bg-[#1A2234] border-gray-700 text-white focus:border-[#FC7A00]"
                  : "bg-gray-50 border-gray-300 text-gray-900 focus:border-[#FC7A00]"
              }`}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  fetchVirtualAccounts("");
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-[#FC7A00] hover:bg-[#e06c00] text-white text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            Search
          </button>
        </form>
      </div>

      {/* Main Table Container */}
      <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-[#151C2C] border-gray-800" : "bg-white border-gray-200"} shadow-sm`}>
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-3 border-[#FC7A00] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              Fetching virtual account records...
            </p>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-gray-400 mb-2">find_in_page</span>
            <p className="text-base font-semibold">No Virtual Accounts Found</p>
            <p className={`text-xs mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {searchTerm ? `No results matching "${searchTerm}"` : "No virtual account records exist for this filter."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b text-[11px] uppercase tracking-wider font-bold ${
                  isDark ? "bg-[#1A2234] border-gray-800 text-gray-400" : "bg-gray-100 border-gray-200 text-gray-600"
                }`}>
                  <th className="p-4">Customer Details</th>
                  <th className="p-4">Virtual Account & Bank</th>
                  <th className="p-4">Provider & KYC</th>
                  <th className="p-4">Wallet Balance</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y text-xs ${isDark ? "divide-gray-800 text-gray-200" : "divide-gray-100 text-gray-800"}`}>
                {filteredAccounts.map((item) => (
                  <tr key={item.uid} className={`hover:bg-orange-500/5 transition-colors`}>
                    {/* Customer */}
                    <td className="p-4">
                      <div className="font-bold text-sm">{item.name}</div>
                      <div className={`text-[11px] ${isDark ? "text-gray-400" : "text-gray-500"}`}>{item.email || "No Email"}</div>
                      <div className={`text-[11px] ${isDark ? "text-gray-400" : "text-gray-500"}`}>{item.phoneNumber || "No Phone"}</div>
                    </td>

                    {/* Virtual Account & Bank */}
                    <td className="p-4">
                      {item.virtualAccountNumber ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm tracking-wide text-[#FC7A00] select-all bg-orange-500/10 px-2 py-0.5 rounded-lg border border-[#FC7A00]/20 inline-block">
                              {item.virtualAccountNumber}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(item.virtualAccountNumber, "Full Account Number")}
                              className="w-7 h-7 rounded-lg border border-gray-300 dark:border-gray-700 hover:border-[#FC7A00] bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-[#FC7A00] transition-all cursor-pointer active:scale-95 shrink-0"
                              title="Copy Full Account Number"
                            >
                              <span className="material-symbols-outlined text-xs">content_copy</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-xs font-extrabold uppercase ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                              {item.virtualAccountBankName || "Wema Bank"}
                            </span>
                          </div>

                          <p className={`text-[10px] font-medium truncate max-w-[220px] ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                            Acct Name: <span className="font-bold">{item.virtualAccountName || item.name}</span>
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-gray-400 italic">
                          <span className="material-symbols-outlined text-sm">link_off</span>
                          <span>No Virtual Account Assigned</span>
                        </div>
                      )}
                    </td>

                    {/* Provider & KYC */}
                    <td className="p-4">
                      <div className="space-y-1.5">
                        {(() => {
                          const prov = (item.virtualAccountProvider || "").toLowerCase();
                          const bank = (item.virtualAccountBankName || "").toLowerCase();

                          let providerLabel = "Flutterwave Gateway Rail";
                          let badgeBg = "bg-orange-500/10 text-orange-500 border-orange-500/20";

                          if (prov === "squad" || prov === "squadco" || bank.includes("gtbank") || bank.includes("gtb") || bank.includes("squad")) {
                            providerLabel = "Squadco (GTBank)";
                            badgeBg = "bg-rose-500/10 text-rose-500 border-rose-500/20";
                          } else if (prov === "paystack" || bank.includes("paystack")) {
                            providerLabel = "Paystack Gateway";
                            badgeBg = "bg-blue-500/10 text-blue-500 border-blue-500/20";
                          } else if (prov === "monnify" || bank.includes("monnify")) {
                            providerLabel = "Monnify Rail";
                            badgeBg = "bg-amber-500/10 text-amber-500 border-amber-500/20";
                          } else if (prov === "korapay" || bank.includes("kora")) {
                            providerLabel = "Korapay Rail";
                            badgeBg = "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
                          } else if (prov === "flutterwave" || bank.includes("wema") || bank.includes("sterling")) {
                            providerLabel = "Flutterwave Gateway";
                            badgeBg = "bg-[#FC7A00]/10 text-[#FC7A00] border-[#FC7A00]/20";
                          }

                          return (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${badgeBg}`}>
                              <span className="material-symbols-outlined text-[13px]">account_balance_wallet</span>
                              <span>{providerLabel}</span>
                            </span>
                          );
                        })()}

                        <div>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                            item.kycStatus === "VERIFIED"
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                          }`}>
                            KYC: {item.kycStatus}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Balance */}
                    <td className="p-4 font-bold text-sm">
                      ₦{item.balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                    </td>

                    {/* Status */}
                    <td className="p-4">
                      {item.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          ACTIVE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-red-500/10 text-red-500 border border-red-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          DEACTIVATED
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right">
                      <CpanelActionDropdown
                        actions={[
                          {
                            label: "Inspect / Replace Account",
                            icon: "sync_alt",
                            onClick: () => {
                              window.location.href = `/cpanel/virtual-account`;
                            },
                          },
                          item.isActive
                            ? {
                                label: "Deactivate Virtual Account",
                                icon: "block",
                                variant: "danger",
                                onClick: () => {
                                  setActionTarget(item);
                                  setActionType("deactivate");
                                },
                              }
                            : {
                                label: "Reactivate Virtual Account",
                                icon: "check_circle",
                                variant: "emerald",
                                onClick: () => {
                                  setActionTarget(item);
                                  setActionType("reactivate");
                                },
                              },
                          {
                            label: "Copy Account Number",
                            icon: "content_copy",
                            onClick: () => copyToClipboard(item.virtualAccountNumber, "Account Number"),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Next/Previous Pagination Controls */}
        <div className={`flex items-center justify-between p-4 border-t text-xs ${
          isDark ? "border-gray-800 text-gray-400" : "border-gray-200 text-gray-600"
        }`}>
          <span className="font-semibold text-[11px] uppercase tracking-wider">
            Page {currentPageIndex + 1} • Showing up to {paginationInfo.limit} records per page
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPageIndex === 0 || loading}
              onClick={handlePrevPage}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
                currentPageIndex === 0 || loading
                  ? "opacity-40 cursor-not-allowed"
                  : isDark
                  ? "bg-[#1E2638] text-white hover:bg-[#2A364F]"
                  : "bg-gray-100 text-gray-800 hover:bg-gray-200 border border-gray-200"
              }`}
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span>
              Previous
            </button>

            <button
              type="button"
              disabled={!paginationInfo.hasNextPage || loading}
              onClick={handleNextPage}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
                !paginationInfo.hasNextPage || loading
                  ? "opacity-40 cursor-not-allowed"
                  : "bg-[#FC7A00] text-white hover:bg-[#e06c00] shadow-sm"
              }`}
            >
              Next
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {actionTarget && actionType && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl ${
            isDark ? "bg-[#151C2C] border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900"
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-3 rounded-2xl ${
                actionType === "deactivate" ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"
              }`}>
                <span className="material-symbols-outlined text-2xl">
                  {actionType === "deactivate" ? "warning" : "verified"}
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold">
                  {actionType === "deactivate" ? "Deactivate Virtual Account?" : "Reactivate Virtual Account?"}
                </h3>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  Customer: <span className="font-semibold text-gray-200">{actionTarget.name}</span>
                </p>
              </div>
            </div>

            <p className={`text-xs mb-6 leading-relaxed ${isDark ? "text-gray-300" : "text-gray-600"}`}>
              {actionType === "deactivate" ? (
                <>
                  Are you sure you want to deactivate virtual account number{" "}
                  <strong className="text-red-500 font-mono">{actionTarget.virtualAccountNumber}</strong>? When deactivated,
                  incoming bank transfers to this account will be flagged and held until reactivated.
                </>
              ) : (
                <>
                  Are you sure you want to reactivate virtual account number{" "}
                  <strong className="text-emerald-500 font-mono">{actionTarget.virtualAccountNumber}</strong>? Incoming transfers to
                  this virtual account will immediately resume processing into the customer&apos;s wallet.
                </>
              )}
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setActionTarget(null);
                  setActionType(null);
                }}
                disabled={isSubmitting}
                className={`px-4 py-2.5 text-xs font-semibold rounded-xl border transition-all ${
                  isDark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleToggleStatus}
                disabled={isSubmitting}
                className={`px-5 py-2.5 text-xs font-bold rounded-xl text-white transition-all shadow-md flex items-center gap-2 ${
                  actionType === "deactivate"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {isSubmitting && (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>{actionType === "deactivate" ? "Deactivate Account" : "Reactivate Account"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
