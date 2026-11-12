"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-[#FC7A00] border-t-transparent rounded-full animate-spin" />
  );
}

export default function CpanelEstateInquiriesPage() {
  const { isDark, toggleTheme } = useCpanelTheme();
  const [threads, setThreads] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Inspection Chat Drawer State
  const [selectedThread, setSelectedThread] = useState<any | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  const fetchInquiriesAndSellers = async () => {
    setIsLoading(true);
    try {
      const [inqRes, sellerRes] = await Promise.all([
        fetch(`/api/estate/admin/inquiries${selectedAgentId !== "ALL" ? `?agentId=${selectedAgentId}` : ""}`),
        fetch("/api/estate/admin/sellers"),
      ]);

      const inqData = await inqRes.json();
      const sellerData = await sellerRes.json();

      if (inqData.success && Array.isArray(inqData.threads)) {
        setThreads(inqData.threads);
      } else {
        toast.error("Failed to load customer inquiry threads.");
      }

      if (sellerData.success && Array.isArray(sellerData.sellers)) {
        setSellers(sellerData.sellers);
      }
    } catch {
      toast.error("Network error fetching customer inquiries.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInquiriesAndSellers();
  }, [selectedAgentId]);

  const togglePlayAudio = (msgId: string, audioDataUrl?: string) => {
    if (!audioDataUrl) return;
    if (playingAudioId === msgId) {
      setPlayingAudioId(null);
      return;
    }
    const audio = new Audio(audioDataUrl);
    setPlayingAudioId(msgId);
    audio.onended = () => setPlayingAudioId(null);
    audio.play().catch(() => {
      toast.error("Failed to play voice note audio.");
      setPlayingAudioId(null);
    });
  };

  const filteredThreads = threads.filter((t) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (t.propertyTitle && t.propertyTitle.toLowerCase().includes(q)) ||
      (t.userName && t.userName.toLowerCase().includes(q)) ||
      (t.userPhone && t.userPhone.toLowerCase().includes(q)) ||
      (t.lastMessage && t.lastMessage.toLowerCase().includes(q))
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
                  <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">contact_support</span>
                  <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Customer Inquiries Audit</h1>
                </div>
                <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                  Inspect all inquiry conversations and voice notes exchanged between customers and agents.
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
                onClick={fetchInquiriesAndSellers}
                className="px-4 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-sm border-0"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Metric & Agent Filter Header Bar */}
          <div className={cn("p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4", panelClass)}>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-50/10 border border-[#FC7A00]/20 rounded-2xl">
                <span className="text-[10px] font-black uppercase text-gray-400 block">Total Conversations</span>
                <span className="font-mono text-xl font-black text-[#FC7A00]">{threads.length} Threads</span>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Filter By Agent</label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className={cn("p-2.5 rounded-xl text-xs font-bold outline-none border", isDark ? "bg-gray-950 border-gray-800 text-white" : "bg-gray-50 border-gray-200 text-black")}
                >
                  <option value="ALL">All Property Agents ({sellers.length})</option>
                  {sellers.map((s) => (
                    <option key={s.uid} value={s.uid}>
                      {s.displayName} ({s.agencyName || "Independent"})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Styled Gradient Search Container */}
            <div className="relative flex-1 max-w-lg bg-gradient-to-r from-[#FC7A00] via-amber-400 to-[#E06600] p-[1.5px] rounded-2xl shadow-xs">
              <div className={cn("relative w-full rounded-[14.5px] flex items-center h-10 px-3", isDark ? "bg-[#111827]" : "bg-white")}>
                <span className="material-symbols-outlined text-[#FC7A00] text-[18px] mr-2">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search customer, phone, property title, message..."
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
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Customer Inquiries...</p>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className={cn("p-12 rounded-2xl border text-center space-y-3", panelClass)}>
              <span className="material-symbols-outlined text-[48px] text-gray-400">forum</span>
              <p className="text-xs font-black uppercase text-gray-400">No Conversations Found</p>
              <p className="text-[11px] text-gray-500 max-w-md mx-auto">
                No active customer inquiry threads match your current filter.
              </p>
            </div>
          ) : (
            <div className={cn("rounded-2xl border overflow-x-auto shadow-xs", panelClass)}>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={cn("border-b text-[10px] font-black uppercase tracking-wider", isDark ? "bg-gray-900/80 border-gray-800 text-gray-400" : "bg-gray-50 border-gray-200 text-gray-500")}>
                    <th className="p-3.5">Customer Name & Contact</th>
                    <th className="p-3.5">Property Listing</th>
                    <th className="p-3.5">Last Excerpt</th>
                    <th className="p-3.5">Last Activity</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={cn("divide-y font-semibold", isDark ? "divide-gray-800 text-gray-200" : "divide-gray-100 text-gray-800")}>
                  {filteredThreads.map((t) => (
                    <tr key={t.threadKey} className={cn("transition-colors", isDark ? "hover:bg-gray-800/40" : "hover:bg-gray-50/80")}>
                      <td className="p-3.5">
                        <p className="font-extrabold text-sm text-[#FC7A00]">{t.userName}</p>
                        <p className="text-[10px] font-mono text-gray-400">{t.userPhone || t.userEmail}</p>
                      </td>

                      <td className="p-3.5 font-extrabold max-w-[180px] truncate">{t.propertyTitle}</td>

                      <td className="p-3.5 max-w-xs truncate">
                        {t.lastMessageType === "voice" ? (
                          <span className="text-amber-500 font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">graphic_eq</span>
                            <span>Voice Note Excerpt</span>
                          </span>
                        ) : (
                          <span className="text-gray-300">{t.lastMessage}</span>
                        )}
                      </td>

                      <td className="p-3.5 font-mono text-[10.5px] text-gray-400 whitespace-nowrap">
                        {t.lastMessageTime ? new Date(t.lastMessageTime).toLocaleString() : "N/A"}
                      </td>

                      <td className="p-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedThread(t)}
                          className="px-3.5 py-1.5 bg-[#FC7A00] hover:bg-[#e06600] text-white font-black text-[10px] uppercase rounded-xl cursor-pointer border-0 shadow-2xs"
                        >
                          View Chat Thread
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Full Chat Audit Inspection Drawer Modal */}
          {selectedThread && (
            <div className="fixed inset-0 z-[100001] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className={cn("w-full max-w-lg p-6 space-y-4 rounded-3xl border shadow-2xl text-left max-h-[85vh] flex flex-col justify-between", panelClass)}>
                <div className="flex items-center justify-between border-b pb-3 border-gray-200 dark:border-gray-800 flex-shrink-0">
                  <div>
                    <h3 className="font-extrabold text-sm uppercase text-[#FC7A00]">{selectedThread.propertyTitle}</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">
                      Customer: {selectedThread.userName} ({selectedThread.userPhone || selectedThread.userEmail})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedThread(null)}
                    className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center border-0 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Stream Messages */}
                <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-gray-50 dark:bg-gray-950 rounded-2xl border border-gray-200 dark:border-gray-800 max-h-96">
                  {selectedThread.messages?.map((msg: any) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "p-3 rounded-2xl space-y-1 text-xs max-w-[85%]",
                        msg.senderId === selectedThread.userId
                          ? "bg-[#FC7A00] text-white ml-auto rounded-br-none"
                          : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-bl-none text-black dark:text-white"
                      )}
                    >
                      <div className="flex items-center justify-between text-[9px] opacity-80 pb-0.5 font-bold">
                        <span>{msg.senderName}</span>
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>

                      {msg.messageType === "voice" ? (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => togglePlayAudio(msg.id, msg.audioData)}
                            className="w-8 h-8 rounded-full bg-white text-[#FC7A00] flex items-center justify-center border-0 cursor-pointer shadow-xs"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {playingAudioId === msg.id ? "pause" : "play_arrow"}
                            </span>
                          </button>
                          <span className="font-mono text-[10px] font-bold">Voice Note (00:{String(msg.audioDuration || 0).padStart(2, "0")})</span>
                        </div>
                      ) : (
                        <p className="font-medium whitespace-pre-line leading-relaxed">{msg.message}</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedThread(null)}
                    className="py-2.5 px-6 bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-black text-xs uppercase rounded-xl border-0 cursor-pointer"
                  >
                    Close Audit
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
