"use client";

import React, { useState, useEffect } from "react";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { toast } from "sonner";
import { EstatePropertyEditLog } from "@/estate/types";

export default function AdminPropertyEditsPage() {
  const { isDark } = useCpanelTheme();
  const [edits, setEdits] = useState<EstatePropertyEditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Pagination states
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [currentStartAfter, setCurrentStartAfter] = useState<string>("");
  const [hasNextPage, setHasNextPage] = useState(false);
  const [lastDocId, setLastDocId] = useState<string | null>(null);
  const [pendingPropertiesCount, setPendingPropertiesCount] = useState(0);

  // Selected edit log for diff inspection drawer
  const [selectedEdit, setSelectedEdit] = useState<EstatePropertyEditLog | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Status counts per tab
  const [statusCounts, setStatusCounts] = useState<{ [key: string]: number }>({
    ALL: 0,
    PENDING_REVIEW: 0,
    APPROVED: 0,
    REJECTED: 0,
    FLAGGED: 0,
  });

  // Dedicated Delete Confirmation Modal state
  const [auditToDelete, setAuditToDelete] = useState<EstatePropertyEditLog | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchEdits = async (startAfterOverride?: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("status", activeTab);
      params.append("limit", "12");

      const targetCursor = startAfterOverride !== undefined ? startAfterOverride : currentStartAfter;
      if (targetCursor) {
        params.append("startAfter", targetCursor);
      }
      if (debouncedSearch) {
        params.append("search", debouncedSearch);
      }

      const res = await fetch(`/api/estate/admin/edits?${params.toString()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.edits)) {
        setEdits(data.edits);
        if (data.pagination) {
          setHasNextPage(Boolean(data.pagination.hasNextPage));
          setLastDocId(data.pagination.lastDocId || null);
        }
        if (data.metrics?.pendingPropertiesCount !== undefined) {
          setPendingPropertiesCount(data.metrics.pendingPropertiesCount);
        }
        if (data.statusCounts) {
          setStatusCounts(data.statusCounts);
        }
      } else {
        toast.error(data.error || "Failed to load property edits.");
      }
    } catch {
      toast.error("Network error loading property edit logs.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setCursorHistory([]);
    setCurrentStartAfter("");
    fetchEdits("");
  }, [activeTab, debouncedSearch]);

  const handleNextPage = () => {
    if (!lastDocId) return;
    setCursorHistory((prev) => [...prev, currentStartAfter]);
    setCurrentStartAfter(lastDocId);
    fetchEdits(lastDocId);
  };

  const handlePrevPage = () => {
    if (cursorHistory.length === 0) return;
    const prevCursor = cursorHistory[cursorHistory.length - 1];
    setCursorHistory((prev) => prev.slice(0, prev.length - 1));
    setCurrentStartAfter(prevCursor);
    fetchEdits(prevCursor);
  };

  const currentPageNumber = cursorHistory.length + 1;

  const handleAction = async (action: "approve" | "reject" | "flag" | "delete", targetEditLogId?: string) => {
    const editId = targetEditLogId || selectedEdit?.id;
    if (!editId) return;

    if (action === "delete") {
      const editObj = edits.find((e) => e.id === editId) || selectedEdit;
      if (editObj) {
        setAuditToDelete(editObj);
      }
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch("/api/estate/admin/edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editLogId: editId,
          action,
          adminNote: adminNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(data.message || `Action ${action} executed successfully.`);
        if (selectedEdit?.id === editId) {
          setSelectedEdit(null);
          setAdminNote("");
        }
        fetchEdits();
      } else {
        toast.error(data.error || "Failed to execute action.");
      }
    } catch {
      toast.error("Network error executing edit moderation.");
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "REJECTED":
        return "bg-red-100 text-red-800 border-red-200";
      case "FLAGGED":
        return "bg-amber-100 text-amber-800 border-amber-200";
      default:
        return "bg-orange-100 text-[#FC7A00] border-orange-200";
    }
  };

  return (
    <div className={`p-4 md:p-8 space-y-6 min-h-screen ${isDark ? "bg-gray-950 text-white" : "bg-gray-50 text-black"}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950/30 text-[#FC7A00] flex items-center justify-center">
            <span className="material-symbols-outlined text-[28px]">rate_review</span>
          </div>
          <div>
            <h1 className="font-bodoni font-bold text-lg md:text-xl text-black dark:text-white">
              Property Edits & Audit Trail
            </h1>
            <p className="text-xs text-gray-500 font-medium">
              Inspect live edits made by agents on published listings, approve, reject, or flag to Support.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pendingPropertiesCount > 0 && (
            <span className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">pending_actions</span>
              <span>{pendingPropertiesCount} Pending Submissions</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => fetchEdits()}
            className="px-4 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-xs font-black uppercase rounded-xl cursor-pointer border-0 flex items-center gap-1.5 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search Bar & Filter Tabs */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">search</span>
            <h3 className="font-extrabold text-sm uppercase">Audit Search</h3>
          </div>

          <div className="relative flex-1 max-w-lg bg-gradient-to-r from-[#FC7A00] via-amber-400 to-[#E06600] p-[1.5px] rounded-2xl shadow-xs">
            <div className={`relative w-full rounded-[14.5px] flex items-center h-10 px-3 ${isDark ? "bg-[#111827]" : "bg-white"}`}>
              <span className="material-symbols-outlined text-[#FC7A00] text-[18px] mr-2">search</span>
              <input
                type="text"
                placeholder="Search property title, agent name, property ID, edit ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full bg-transparent border-0 outline-none text-xs font-semibold placeholder-gray-400 truncate ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="ml-2 text-gray-400 hover:text-black dark:hover:text-white border-0 cursor-pointer text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 select-none">
          {["ALL", "PENDING_REVIEW", "APPROVED", "REJECTED", "FLAGGED"].map((tab) => {
            const count = statusCounts[tab] !== undefined ? statusCounts[tab] : 0;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap border-0 cursor-pointer transition-all flex items-center gap-1.5 ${
                  activeTab === tab
                    ? "bg-[#FC7A00] text-white shadow-2xs"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                }`}
              >
                <span>{tab.replace("_", " ")}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  activeTab === tab ? "bg-white/20 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Edits List */}
      {isLoading ? (
        <div className="p-8 text-center text-xs font-bold text-gray-400 animate-pulse">
          Loading property edit records...
        </div>
      ) : edits.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 p-12 rounded-3xl text-center space-y-2 border border-gray-200 dark:border-gray-800">
          <span className="material-symbols-outlined text-[48px] text-gray-300">find_in_page</span>
          <h3 className="font-bold text-sm text-gray-700 dark:text-gray-300">No Property Edit Logs Found</h3>
          <p className="text-xs text-gray-400">No edit logs matched your search or status filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {edits.map((edit) => (
              <div
                key={edit.id}
                onClick={() => {
                  setSelectedEdit(edit);
                  setAdminNote(edit.adminNote || "");
                }}
                className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-200 dark:border-gray-800 hover:border-[#FC7A00] transition-all cursor-pointer space-y-3 shadow-xs relative"
              >
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${getStatusBadge(edit.status)}`}>
                    {edit.status}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {new Date(edit.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div>
                  <h3 className="font-extrabold text-sm text-black dark:text-white truncate">
                    {edit.propertyTitle || edit.newData?.title || "Property Listing"}
                  </h3>
                  <p className="text-xs text-[#FC7A00] font-black uppercase truncate mt-0.5">
                    Agent: {edit.sellerName || "Partner Agent"}
                  </p>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl text-[11px] space-y-1 font-mono">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Prev Price:</span>
                    <span className="font-bold text-gray-700 dark:text-gray-300">
                      ₦{edit.previousData?.price?.toLocaleString() || "0"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#FC7A00]">New Price:</span>
                    <span className="font-black text-[#FC7A00]">
                      ₦{edit.newData?.price?.toLocaleString() || "0"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    className="flex-1 py-2 bg-[#FC7A00]/10 hover:bg-[#FC7A00]/20 text-[#FC7A00] font-black text-xs uppercase rounded-xl cursor-pointer border-0 transition-all flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">visibility</span>
                    <span>Inspect Diffs</span>
                  </button>
                  <button
                    type="button"
                    title="Delete Agent Audit Record"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAction("delete", edit.id);
                    }}
                    className="w-9 h-9 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 text-red-600 dark:text-red-400 rounded-xl flex items-center justify-center border-0 cursor-pointer transition-all shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Cursor Pagination Bar (Preview & Next) */}
          <div className="p-4 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-semibold shadow-xs">
            <span className="text-gray-400">
              Page <strong className="text-black dark:text-white">{currentPageNumber}</strong> • Showing {edits.length} record{edits.length === 1 ? "" : "s"}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={cursorHistory.length === 0 || isLoading}
                onClick={handlePrevPage}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-black uppercase cursor-pointer disabled:opacity-40 border-0 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                <span>Preview</span>
              </button>

              <button
                type="button"
                disabled={!hasNextPage || isLoading}
                onClick={handleNextPage}
                className="px-4 py-2 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-black uppercase cursor-pointer disabled:opacity-40 border-0 flex items-center gap-1 shadow-2xs"
              >
                <span>Next</span>
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diff Inspection Modal Drawer */}
      {selectedEdit && (
        <div className="fixed inset-0 z-[100050] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-3xl p-6 space-y-5 max-h-[90vh] overflow-y-auto no-scrollbar border border-gray-200 dark:border-gray-800 text-black dark:text-white">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="font-extrabold text-base uppercase">Property Edit Diff Audit</h3>
                <p className="text-xs text-gray-500 font-mono">ID: {selectedEdit.propertyId}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEdit(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center border-0 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Comparison Side-by-side Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold">
              {/* Previous Version */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-2">
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                  Previous Snapshot
                </span>
                <div>
                  <span className="text-[10px] text-gray-400 block uppercase">Title</span>
                  <span className="font-bold">{selectedEdit.previousData?.title || "-"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block uppercase">Price</span>
                  <span className="font-mono font-bold">₦{selectedEdit.previousData?.price?.toLocaleString() || "0"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block uppercase">Address</span>
                  <span className="font-medium">{selectedEdit.previousData?.location?.address || "-"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block uppercase">Description</span>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 line-clamp-3">{selectedEdit.previousData?.description || "-"}</p>
                </div>
              </div>

              {/* New Edited Version */}
              <div className="p-4 bg-orange-50/50 dark:bg-orange-950/20 rounded-2xl border border-orange-200 dark:border-orange-800/40 space-y-2">
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-[#FC7A00] text-white">
                  New Edited Snapshot
                </span>
                <div>
                  <span className="text-[10px] text-[#FC7A00] block uppercase font-bold">Title</span>
                  <span className="font-extrabold text-[#FC7A00]">{selectedEdit.newData?.title || "-"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#FC7A00] block uppercase font-bold">Price</span>
                  <span className="font-mono font-black text-base text-[#FC7A00]">₦{selectedEdit.newData?.price?.toLocaleString() || "0"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#FC7A00] block uppercase font-bold">Address</span>
                  <span className="font-semibold">{selectedEdit.newData?.location?.address || "-"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#FC7A00] block uppercase font-bold">Description</span>
                  <p className="text-[11px] text-gray-800 dark:text-gray-200 line-clamp-3">{selectedEdit.newData?.description || "-"}</p>
                </div>
              </div>
            </div>

            {/* Admin Note Input */}
            <div>
              <label className="text-[10.5px] font-black uppercase text-gray-400 block mb-1">
                Administrator Note / Feedback Reason
              </label>
              <textarea
                rows={2}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="e.g. Price update verified OR Please contact Support regarding address mismatch."
                className="w-full p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-xs font-medium outline-none focus:border-[#FC7A00]"
              />
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleAction("approve")}
                className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded-2xl border-0 cursor-pointer disabled:opacity-50 transition-all"
              >
                Approve Update
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleAction("reject")}
                className="py-3 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase rounded-2xl border-0 cursor-pointer disabled:opacity-50 transition-all"
              >
                Reject & Revert
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleAction("flag")}
                className="py-3 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase rounded-2xl border-0 cursor-pointer disabled:opacity-50 transition-all"
              >
                Flag & Contact
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleAction("delete")}
                className="py-3 bg-gray-900 dark:bg-gray-800 hover:bg-black text-red-400 font-black text-xs uppercase rounded-2xl border border-red-500/30 cursor-pointer disabled:opacity-50 transition-all flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>Delete Audit</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal Overlay */}
      {auditToDelete && (
        <div className="fixed inset-0 z-[100080] bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl p-6 space-y-4 border border-gray-200 dark:border-gray-800 text-black dark:text-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">delete_forever</span>
              </div>
              <div>
                <h3 className="font-extrabold text-base uppercase leading-tight">Delete Agent Audit Record?</h3>
                <p className="text-[11px] text-gray-400 font-mono mt-0.5">Property ID: {auditToDelete.propertyId}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
              <p className="leading-relaxed font-medium">
                Are you sure you want to permanently delete this property edit audit record?
              </p>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-150 dark:border-gray-700 space-y-1">
                <p className="font-bold text-black dark:text-white truncate">
                  Property: {auditToDelete.propertyTitle || auditToDelete.newData?.title || "Property Listing"}
                </p>
                <p className="text-gray-500 text-[11px]">
                  Agent: <strong className="text-[#FC7A00]">{auditToDelete.sellerName || "Partner Agent"}</strong>
                </p>
              </div>
              <p className="text-[10.5px] text-red-500 font-bold">
                ⚠️ This action will permanently remove the audit record and cannot be undone.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setAuditToDelete(null)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-800 dark:text-gray-200 font-black text-xs uppercase rounded-2xl border-0 cursor-pointer transition-all"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    const res = await fetch("/api/estate/admin/edits", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        editLogId: auditToDelete.id,
                        action: "delete",
                      }),
                    });

                    const data = await res.json();
                    if (data.success) {
                      toast.success(data.message || "Property edit audit record deleted successfully.");
                      if (selectedEdit?.id === auditToDelete.id) {
                        setSelectedEdit(null);
                        setAdminNote("");
                      }
                      setAuditToDelete(null);
                      fetchEdits();
                    } else {
                      toast.error(data.error || "Failed to delete audit record.");
                    }
                  } catch {
                    toast.error("Network error deleting audit record.");
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase rounded-2xl border-0 cursor-pointer disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
