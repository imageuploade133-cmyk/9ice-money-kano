"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { EstateSeller } from "@/estate/types";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

export default function CpanelEstateSellersPage() {
  const { isDark, toggleTheme } = useCpanelTheme();
  const [sellers, setSellers] = useState<EstateSeller[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);

  // Ban seller modal state
  const [selectedBanSeller, setSelectedBanSeller] = useState<EstateSeller | null>(null);
  const [banReasonInput, setBanReasonInput] = useState("");

  // Restrict publishing modal state
  const [selectedRestrictSeller, setSelectedRestrictSeller] = useState<EstateSeller | null>(null);
  const [restrictionHoursInput, setRestrictionHoursInput] = useState<number>(24);
  const [customRestrictDateTime, setCustomRestrictDateTime] = useState<string>("");

  const fetchSellers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/estate/admin/sellers");
      const data = await res.json();
      if (data.success && Array.isArray(data.sellers)) {
        setSellers(data.sellers);
      } else {
        toast.error("Failed to load seller directory.");
      }
    } catch {
      toast.error("Network error fetching sellers.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSellers();
  }, []);

  const handleAdminSellerAction = async (action: string, sellerUid: string, extra = {}) => {
    setExecutingActionId(sellerUid);
    try {
      const res = await fetch("/api/estate/admin/sellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sellerUid, ...extra }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || "Seller status updated.");
        setSelectedBanSeller(null);
        setBanReasonInput("");
        setSelectedRestrictSeller(null);
        fetchSellers();
      } else {
        toast.error(data.error || "Seller action failed.");
      }
    } catch {
      toast.error("Network error updating seller status.");
    } finally {
      setExecutingActionId(null);
    }
  };

  const verifiedCount = sellers.filter((s) => s.isVerified).length;
  const pendingCount = sellers.filter((s) => !s.isVerified).length;
  const restrictedOrBannedCount = sellers.filter((s) => s.bannedFromPublishing || s.publishingRestricted).length;

  const filteredSellers = sellers.filter((sel) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (sel.displayName && sel.displayName.toLowerCase().includes(q)) ||
      (sel.agencyName && sel.agencyName.toLowerCase().includes(q)) ||
      (sel.phone && sel.phone.toLowerCase().includes(q)) ||
      (sel.email && sel.email.toLowerCase().includes(q))
    );
  });

  const bgClass = isDark ? "bg-[#0c0f17] text-white" : "bg-gray-50 text-gray-900";
  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";

  return (
    <CpanelRouteGuard requiredPermission="estate.view">
      <div className={cn("min-h-screen p-4 md:p-8 font-hanken transition-colors duration-300 space-y-6", bgClass)}>
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Sticky Top Header Bar */}
          <div className={cn("sticky top-0 z-30 p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md shadow-xs", panelClass)}>
            <div className="flex items-center gap-3">
              <Link
                href="/cpanel"
                className={cn("w-10 h-10 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">badge</span>
                  <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Sellers & Property Agents</h1>
                </div>
                <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                  Verify property agents, review agency credentials, ban sellers, or temporarily restrict publishing privileges.
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
              <button
                type="button"
                onClick={fetchSellers}
                className="px-4 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-sm border-0"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Metric Cards Summary Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
            <div className={cn("p-4 rounded-2xl border space-y-1", panelClass)}>
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-[10px] font-black uppercase tracking-wider">Total Agents</span>
                <span className="material-symbols-outlined text-[18px] text-purple-500">groups</span>
              </div>
              <p className="font-mono text-xl font-black text-purple-600">{sellers.length}</p>
              <span className="text-[10px] text-gray-400 block">Property partners directory</span>
            </div>

            <div className={cn("p-4 rounded-2xl border space-y-1", panelClass)}>
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-[10px] font-black uppercase tracking-wider">Verified Agents</span>
                <span className="material-symbols-outlined text-[18px] text-emerald-500">verified_user</span>
              </div>
              <p className="font-mono text-xl font-black text-emerald-600">{verifiedCount}</p>
              <span className="text-[10px] text-gray-400 block">ID authenticated agents</span>
            </div>

            <div className={cn("p-4 rounded-2xl border space-y-1", panelClass)}>
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-[10px] font-black uppercase tracking-wider">Pending Verification</span>
                <span className="material-symbols-outlined text-[18px] text-amber-500">hourglass_top</span>
              </div>
              <p className="font-mono text-xl font-black text-amber-500">{pendingCount}</p>
              <span className="text-[10px] text-gray-400 block">Awaiting verification</span>
            </div>

            <div className={cn("p-4 rounded-2xl border space-y-1", panelClass)}>
              <div className="flex items-center justify-between text-gray-400">
                <span className="text-[10px] font-black uppercase tracking-wider">Banned / Restricted</span>
                <span className="material-symbols-outlined text-[18px] text-red-500">block</span>
              </div>
              <p className="font-mono text-xl font-black text-red-500">{restrictedOrBannedCount}</p>
              <span className="text-[10px] text-gray-400 block">Publishing restricted</span>
            </div>
          </div>

          {/* Premium Search Filter Header */}
          <div className={cn("p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4", panelClass)}>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">manage_search</span>
              <h3 className="font-extrabold text-sm uppercase">Agent Directory ({filteredSellers.length})</h3>
            </div>

            {/* Styled Gradient Search Container */}
            <div className="relative flex-1 max-w-lg bg-gradient-to-r from-[#FC7A00] via-amber-400 to-[#E06600] p-[1.5px] rounded-2xl shadow-xs">
              <div className={cn("relative w-full rounded-[14.5px] flex items-center h-10 px-3", isDark ? "bg-[#111827]" : "bg-white")}>
                <span className="material-symbols-outlined text-[#FC7A00] text-[18px] mr-2">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search by name, agency, phone, email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(
                    "w-full bg-transparent border-0 outline-none text-xs font-semibold placeholder-gray-400 truncate",
                    isDark ? "text-white" : "text-gray-900"
                  )}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="ml-2 text-gray-400 hover:text-black dark:hover:text-white border-0 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Directory Table */}
          {isLoading ? (
            <div className={cn("p-12 rounded-2xl border text-center flex flex-col items-center justify-center gap-3", panelClass)}>
              <ButtonSpinner />
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Sellers Directory...</p>
            </div>
          ) : filteredSellers.length === 0 ? (
            <div className={cn("p-12 rounded-2xl border text-center space-y-3", panelClass)}>
              <span className="material-symbols-outlined text-[48px] text-gray-400">badge</span>
              <p className="text-xs font-black uppercase text-gray-400">No Seller Agents Found</p>
              <p className="text-[11px] text-gray-500 max-w-md mx-auto">
                No seller or agency profiles match your search criteria.
              </p>
            </div>
          ) : (
            <div className={cn("rounded-2xl border overflow-x-auto shadow-xs", panelClass)}>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={cn("border-b text-[10px] font-black uppercase tracking-wider", isDark ? "bg-gray-900/80 border-gray-800 text-gray-400" : "bg-gray-50 border-gray-200 text-gray-500")}>
                    <th className="p-3.5">Agent / Agency Name</th>
                    <th className="p-3.5">Contact Details</th>
                    <th className="p-3.5">Verification</th>
                    <th className="p-3.5">Publishing Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={cn("divide-y font-semibold", isDark ? "divide-gray-800 text-gray-200" : "divide-gray-100 text-gray-800")}>
                  {filteredSellers.map((sel) => {
                    const isExecuting = executingActionId === sel.uid;
                    const isBanned = sel.bannedFromPublishing;
                    const isRestricted = sel.publishingRestricted && sel.restrictedUntil && new Date(sel.restrictedUntil).getTime() > Date.now();

                    return (
                      <tr key={sel.uid} className={cn("transition-colors", isDark ? "hover:bg-gray-800/40" : "hover:bg-gray-50/80")}>
                        <td className="p-3.5">
                          <p className="font-extrabold text-sm text-[#FC7A00]">{sel.displayName}</p>
                          <p className="text-[10px] text-gray-400 uppercase font-black">{sel.agencyName || "Independent Agent"}</p>
                        </td>

                        <td className="p-3.5">
                          <p className="font-extrabold font-mono">{sel.phone}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{sel.email}</p>
                        </td>

                        <td className="p-3.5 whitespace-nowrap">
                          <span
                            className={cn(
                              "px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase border",
                              sel.isVerified
                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            )}
                          >
                            {sel.isVerified ? "Verified Agent" : "Unverified"}
                          </span>
                        </td>

                        <td className="p-3.5 whitespace-nowrap">
                          {isBanned ? (
                            <span className="px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase border bg-red-500/10 text-red-500 border-red-500/20">
                              BANNED
                            </span>
                          ) : isRestricted ? (
                            <div>
                              <span className="px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase border bg-orange-500/10 text-orange-500 border-orange-500/20 block w-fit">
                                RESTRICTED
                              </span>
                              <span className="text-[8.5px] text-gray-400 block mt-0.5 font-mono">
                                Until {new Date(sel.restrictedUntil!).toLocaleDateString()}
                              </span>
                            </div>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase border bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                              ACTIVE
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {!sel.isVerified ? (
                              <button
                                type="button"
                                disabled={isExecuting}
                                onClick={() => handleAdminSellerAction("verify", sel.uid)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9.5px] uppercase rounded-lg cursor-pointer border-0 disabled:opacity-50"
                              >
                                Verify
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isExecuting}
                                onClick={() => handleAdminSellerAction("reject", sel.uid)}
                                className="px-2.5 py-1 bg-gray-600 hover:bg-gray-700 text-white font-black text-[9.5px] uppercase rounded-lg cursor-pointer border-0 disabled:opacity-50"
                              >
                                Revoke
                              </button>
                            )}

                            {isBanned ? (
                              <button
                                type="button"
                                disabled={isExecuting}
                                onClick={() => handleAdminSellerAction("unban", sel.uid)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9.5px] uppercase rounded-lg cursor-pointer border-0 disabled:opacity-50"
                              >
                                Unban
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isExecuting}
                                onClick={() => setSelectedBanSeller(sel)}
                                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-black text-[9.5px] uppercase rounded-lg cursor-pointer border-0 disabled:opacity-50"
                              >
                                Ban
                              </button>
                            )}

                            {isRestricted ? (
                              <button
                                type="button"
                                disabled={isExecuting}
                                onClick={() => handleAdminSellerAction("unrestrict", sel.uid)}
                                className="px-2.5 py-1 bg-[#FC7A00] hover:bg-[#e06600] text-white font-black text-[9.5px] uppercase rounded-lg cursor-pointer border-0 disabled:opacity-50"
                              >
                                Unrestrict
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isExecuting}
                                onClick={() => setSelectedRestrictSeller(sel)}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-black text-[9.5px] uppercase rounded-lg cursor-pointer border-0 disabled:opacity-50"
                              >
                                Restrict
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Ban Seller Modal */}
          {selectedBanSeller && (
            <div className="fixed inset-0 z-[100001] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className={cn("w-full max-w-sm p-5 space-y-3 rounded-3xl border shadow-2xl text-left", panelClass)}>
                <h3 className="font-extrabold text-sm uppercase text-red-500">Ban Seller Agent</h3>
                <p className="text-xs text-gray-400 font-medium">
                  Ban &quot;{selectedBanSeller.displayName}&quot; permanently from publishing estate listings?
                </p>
                <textarea
                  rows={3}
                  value={banReasonInput}
                  onChange={(e) => setBanReasonInput(e.target.value)}
                  placeholder="Reason for ban..."
                  className={cn("w-full p-3 rounded-xl text-xs font-semibold outline-none resize-none", isDark ? "bg-[#111827] border border-gray-700 text-white" : "bg-gray-50 border border-gray-200 text-black")}
                />
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedBanSeller(null)}
                    className="w-1/2 py-2.5 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold text-xs uppercase rounded-xl cursor-pointer border-0"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAdminSellerAction("ban", selectedBanSeller.uid, {
                        banReason: banReasonInput,
                      })
                    }
                    className="w-1/2 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase rounded-xl cursor-pointer border-0"
                  >
                    Confirm Ban
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Restrict Publishing Modal */}
          {selectedRestrictSeller && (
            <div className="fixed inset-0 z-[100001] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className={cn("w-full max-w-sm p-5 space-y-3.5 rounded-3xl border shadow-2xl text-left", panelClass)}>
                <h3 className="font-extrabold text-sm uppercase text-amber-500">Restrict Publishing Privilege</h3>
                <p className="text-xs text-gray-400 font-medium">
                  Select a quick duration or specify a custom date and time for restricting &quot;{selectedRestrictSeller.displayName}&quot;.
                </p>

                <div className="space-y-2 pt-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Quick Duration Presets</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { hours: 1, label: "1 Hour" },
                      { hours: 24, label: "24 Hours (1 Day)" },
                      { hours: 72, label: "72 Hours (3 Days)" },
                      { hours: 168, label: "168 Hours (7 Days)" },
                      { hours: 720, label: "720 Hours (30 Days)" },
                    ].map((opt) => (
                      <button
                        key={opt.hours}
                        type="button"
                        onClick={() => {
                          setRestrictionHoursInput(opt.hours);
                          setCustomRestrictDateTime("");
                        }}
                        className={cn(
                          "py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                          restrictionHoursInput === opt.hours && !customRestrictDateTime
                            ? "bg-[#FC7A00] text-white border-[#FC7A00]"
                            : isDark ? "bg-gray-900 border-gray-800 text-gray-300" : "bg-gray-100 border-gray-200 text-gray-800"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">
                    Or Custom Expiry Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={customRestrictDateTime}
                    onChange={(e) => setCustomRestrictDateTime(e.target.value)}
                    className={cn(
                      "w-full p-3 rounded-xl text-xs font-bold outline-none border",
                      isDark ? "bg-[#111827] border-gray-800 text-white" : "bg-gray-50 border-gray-200 text-black"
                    )}
                  />
                  <p className="text-[9.5px] text-gray-400 font-medium">
                    Setting a custom date & time overrides preset hours.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRestrictSeller(null);
                      setCustomRestrictDateTime("");
                    }}
                    className="w-1/2 py-2.5 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold text-xs uppercase rounded-xl cursor-pointer border-0"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleAdminSellerAction("restrict", selectedRestrictSeller.uid, {
                        restrictionHours: restrictionHoursInput,
                        customUntilIso: customRestrictDateTime ? new Date(customRestrictDateTime).toISOString() : null,
                      })
                    }
                    className="w-1/2 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase rounded-xl cursor-pointer border-0"
                  >
                    Confirm Restrict
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </CpanelRouteGuard>
  );
}
