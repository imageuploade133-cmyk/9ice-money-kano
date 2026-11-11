"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

export default function CpanelEstateReportsPage() {
  const { isDark, toggleTheme } = useCpanelTheme();
  const [reports, setReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/estate/admin/reports");
      const data = await res.json();
      if (data.success && Array.isArray(data.reports)) {
        setReports(data.reports);
      } else {
        toast.error("Failed to load property reports.");
      }
    } catch {
      toast.error("Network error fetching reports.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleUpdateReportStatus = async (reportId: string, status: string) => {
    setIsUpdatingStatus(true);
    try {
      const res = await fetch("/api/estate/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, status, adminNote: adminNoteInput }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || `Report marked as ${status}`);
        setSelectedReport(null);
        setAdminNoteInput("");
        fetchReports();
      } else {
        toast.error(data.error || "Failed to update report status.");
      }
    } catch {
      toast.error("Network error updating report.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const filteredReports = reports.filter((rep) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (rep.propertyTitle && rep.propertyTitle.toLowerCase().includes(q)) ||
      (rep.reason && rep.reason.toLowerCase().includes(q)) ||
      (rep.details && rep.details.toLowerCase().includes(q)) ||
      (rep.reporterPhone && rep.reporterPhone.toLowerCase().includes(q))
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
                  <span className="material-symbols-outlined text-red-500 text-[22px]">flag</span>
                  <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Marketplace Flagged Reports</h1>
                </div>
                <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                  Inspect user reports, emergency callback numbers, evidence screenshots, and mark report resolution statuses.
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
                onClick={fetchReports}
                className="px-4 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-sm border-0"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Metric Header Card */}
          <div className={cn("p-4 rounded-2xl border space-y-1 max-w-sm", panelClass)}>
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Reported Listings</span>
              <span className="material-symbols-outlined text-[18px] text-red-500">report_problem</span>
            </div>
            <p className="font-mono text-xl font-black text-red-500">{reports.length}</p>
            <span className="text-[10px] text-gray-400 block">Flagged items with evidence uploads</span>
          </div>

          {/* Premium Search Filter Header */}
          <div className={cn("p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4", panelClass)}>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-red-500 text-[22px]">search</span>
              <h3 className="font-extrabold text-sm uppercase">Reports Directory ({filteredReports.length})</h3>
            </div>

            {/* Styled Gradient Search Container */}
            <div className="relative flex-1 max-w-lg bg-gradient-to-r from-[#FC7A00] via-amber-400 to-[#E06600] p-[1.5px] rounded-2xl shadow-xs">
              <div className={cn("relative w-full rounded-[14.5px] flex items-center h-10 px-3", isDark ? "bg-[#111827]" : "bg-white")}>
                <span className="material-symbols-outlined text-[#FC7A00] text-[18px] mr-2">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search by property title, reason, reporter phone..."
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
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Property Reports...</p>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className={cn("p-12 rounded-2xl border text-center space-y-3", panelClass)}>
              <span className="material-symbols-outlined text-[48px] text-emerald-500">verified</span>
              <p className="text-xs font-black uppercase text-gray-400">No Reports Logged</p>
              <p className="text-[11px] text-gray-500 max-w-md mx-auto">
                No flagged property reports found.
              </p>
            </div>
          ) : (
            <div className={cn("rounded-2xl border overflow-x-auto shadow-xs", panelClass)}>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={cn("border-b text-[10px] font-black uppercase tracking-wider", isDark ? "bg-gray-900/80 border-gray-800 text-gray-400" : "bg-gray-50 border-gray-200 text-gray-500")}>
                    <th className="p-3.5">Property Listing</th>
                    <th className="p-3.5">Report Reason</th>
                    <th className="p-3.5">Reporter Phone</th>
                    <th className="p-3.5">Evidence File</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={cn("divide-y font-semibold", isDark ? "divide-gray-800 text-gray-200" : "divide-gray-100 text-gray-800")}>
                  {filteredReports.map((rep) => (
                    <tr key={rep.id} className={cn("transition-colors", isDark ? "hover:bg-gray-800/40" : "hover:bg-gray-50/80")}>
                      <td className="p-3.5 font-extrabold text-[#FC7A00] max-w-[200px] truncate">{rep.propertyTitle}</td>
                      <td className="p-3.5 font-bold text-red-500">{rep.reason}</td>
                      <td className="p-3.5 font-mono text-gray-300">{rep.reporterPhone || "N/A"}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        {rep.evidenceUrl ? (
                          <a
                            href={rep.evidenceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1 bg-blue-600/10 text-blue-500 border border-blue-500/20 rounded-lg text-[10px] font-black uppercase inline-flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[13px]">image</span>
                            <span>View Evidence</span>
                          </a>
                        ) : (
                          <span className="text-gray-500 text-[10px]">None</span>
                        )}
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span
                          className={cn(
                            "px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase border",
                            rep.status === "RESOLVED"
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : rep.status === "DISMISSED"
                              ? "bg-gray-500/10 text-gray-400 border-gray-500/20"
                              : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                          )}
                        >
                          {rep.status || "PENDING_REVIEW"}
                        </span>
                      </td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedReport(rep)}
                          className="px-3 py-1.5 bg-[#FC7A00] hover:bg-[#e06600] text-white font-black text-[10px] uppercase rounded-xl cursor-pointer border-0 shadow-2xs"
                        >
                          Inspect Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Inspect Report Modal Drawer */}
          {selectedReport && (
            <div className="fixed inset-0 z-[100001] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className={cn("w-full max-w-lg p-6 space-y-4 rounded-3xl border shadow-2xl text-left max-h-[85vh] overflow-y-auto no-scrollbar", panelClass)}>
                <div className="flex items-center justify-between border-b pb-3 border-gray-200 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-red-500 text-[22px]">flag</span>
                    <h3 className="font-extrabold text-sm uppercase text-red-500">Report Details Inspection</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedReport(null)}
                    className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center border-0 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-[10px] font-black uppercase text-gray-400 block">Flagged Property Title</span>
                    <span className="font-extrabold text-sm text-[#FC7A00]">{selectedReport.propertyTitle}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] font-black uppercase text-gray-400 block">Report Reason</span>
                      <span className="font-bold text-red-500">{selectedReport.reason}</span>
                    </div>

                    <div>
                      <span className="text-[10px] font-black uppercase text-gray-400 block">Emergency Reporter Phone</span>
                      <span className="font-mono font-extrabold">{selectedReport.reporterPhone || "Not provided"}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-black uppercase text-gray-400 block mb-1">Full Violation Details</span>
                    <div className="p-3 bg-gray-50 dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-800 font-medium whitespace-pre-line leading-relaxed">
                      {selectedReport.details || "No additional text details provided."}
                    </div>
                  </div>

                  {selectedReport.evidenceUrl && (
                    <div>
                      <span className="text-[10px] font-black uppercase text-gray-400 block mb-1.5">Evidence Screenshot Attachment</span>
                      <div className="w-full h-48 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 relative bg-black flex items-center justify-center">
                        <img src={selectedReport.evidenceUrl} alt="Evidence" className="w-full h-full object-contain" />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Admin Investigation Notes</label>
                    <textarea
                      rows={2}
                      value={adminNoteInput}
                      onChange={(e) => setAdminNoteInput(e.target.value)}
                      placeholder="Add resolution or investigation notes..."
                      className={cn("w-full p-3 rounded-2xl text-xs font-semibold outline-none resize-none border", isDark ? "bg-gray-950 border-gray-800 text-white" : "bg-gray-50 border-gray-200 text-black")}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isUpdatingStatus}
                    onClick={() => handleUpdateReportStatus(selectedReport.id, "DISMISSED")}
                    className="py-2.5 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-extrabold text-[10.5px] uppercase rounded-xl border-0 cursor-pointer"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    disabled={isUpdatingStatus}
                    onClick={() => handleUpdateReportStatus(selectedReport.id, "RESOLVED")}
                    className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10.5px] uppercase rounded-xl cursor-pointer border-0 shadow-2xs"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    disabled={isUpdatingStatus}
                    onClick={() => handleUpdateReportStatus(selectedReport.id, "ACTION_TAKEN")}
                    className="py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-[10.5px] uppercase rounded-xl cursor-pointer border-0 shadow-2xs"
                  >
                    Take Action
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
