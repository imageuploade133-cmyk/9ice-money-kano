"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useModalBackHandler } from "@/lib/useModalBackHandler";

export interface EmergencyBroadcastAttachment {
  name: string;
  url: string;
  size?: string;
  type?: string;
}

export interface EmergencyBroadcastData {
  active: boolean;
  title: string;
  message: string;
  urgency?: "info" | "warning" | "danger" | "emerald";
  badge?: string;
  icon?: string;
  modalBgColor?: string;
  modalTextColor?: string;
  externalUrl?: string;
  externalUrlLabel?: string;
  videoUrl?: string;
  attachments?: EmergencyBroadcastAttachment[];
  images?: string[];
  updatedAt?: string;
  updatedBy?: string;
}

function getEmbedVideoUrl(url: string): { isDirectVideo: boolean; embedUrl: string } {
  if (!url) return { isDirectVideo: false, embedUrl: "" };

  const trimmed = url.trim();
  if (trimmed.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i)) {
    return { isDirectVideo: true, embedUrl: trimmed };
  }

  // Youtube shorts or watch link
  const ytMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([\w-]{11})/);
  if (ytMatch && ytMatch[1]) {
    return { isDirectVideo: false, embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}` };
  }

  // Vimeo
  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/[^\/]*\/videos\/|album\/\d+\/video\/|video\/|)(\d+)/);
  if (vimeoMatch && vimeoMatch[1]) {
    return { isDirectVideo: false, embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
  }

  return { isDirectVideo: false, embedUrl: trimmed };
}

export const EmergencyBroadcastBanner: React.FC = () => {
  const [broadcast, setBroadcast] = useState<EmergencyBroadcastData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);

  // Modal hardware/browser back button handling
  useModalBackHandler(isModalOpen, () => setIsModalOpen(false), "emergency-broadcast-modal");

  useEffect(() => {
    const fetchBroadcast = async () => {
      try {
        const res = await fetch("/api/emergency", { cache: "no-store" });
        const data = await res.json();
        if (data.success && data.broadcast && data.broadcast.active) {
          setBroadcast(data.broadcast);
        } else {
          setBroadcast(null);
        }
      } catch (err) {
        console.warn("[EmergencyBroadcastBanner] Fetch error:", err);
      }
    };

    fetchBroadcast();
    // Poll every 30 seconds for live broadcasts
    const interval = setInterval(fetchBroadcast, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!broadcast || !broadcast.active) return null;

  const urgency = broadcast.urgency || "warning";
  const iconName = broadcast.icon || "campaign";
  const badgeLabel = broadcast.badge || "EMERGENCY BROADCAST";
  const modalBg = broadcast.modalBgColor || "#FFFFFF";
  const modalTextColor = broadcast.modalTextColor || "#111827";

  const { isDirectVideo, embedUrl } = getEmbedVideoUrl(broadcast.videoUrl || "");

  // Render message plain text vs HTML content safely
  const isHtml = broadcast.message ? /<[a-z][\s\S]*>/i.test(broadcast.message) : false;

  return (
    <>
      {/* Sleek, Economical Ticker Banner rendered above wallet balance card */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        onClick={() => setIsModalOpen(true)}
        className={cn(
          "w-full max-w-[280px] min-[360px]:max-w-sm md:max-w-md mx-auto mb-3 px-3 py-2 rounded-2xl backdrop-blur-md flex items-center justify-between gap-2 transition-all cursor-pointer select-none shadow-xs group border",
          urgency === "danger"
            ? "bg-red-500/10 border-red-500/25 text-red-700 dark:text-red-400 hover:bg-red-500/15"
            : urgency === "warning"
            ? "bg-amber-500/10 border-amber-500/25 text-amber-800 dark:text-amber-300 hover:bg-amber-500/15"
            : urgency === "emerald"
            ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/15"
            : "bg-blue-500/10 border-blue-500/25 text-blue-800 dark:text-blue-300 hover:bg-blue-500/15"
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-6 h-6 rounded-full bg-current/15 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[15px] font-bold animate-pulse">
              {iconName}
            </span>
          </div>

          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="px-1.5 py-0.5 rounded-md text-[7.5px] min-[360px]:text-[8px] font-black uppercase tracking-wider bg-current/20 text-current shrink-0">
              {badgeLabel}
            </span>
            <span className="font-extrabold text-[11px] min-[360px]:text-xs truncate text-gray-900 dark:text-gray-100">
              {broadcast.title}
            </span>
          </div>
        </div>

        <span className="material-symbols-outlined text-[16px] text-gray-400 group-hover:text-black dark:group-hover:text-white transition-colors shrink-0">
          chevron_right
        </span>
      </motion.div>

      {/* 100% Full-Screen Borderless Modal Drawer Overlay */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100000] flex flex-col justify-between overflow-hidden font-hanken">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />

            {/* 100% Full Screen Modal Content Container */}
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
              style={{ backgroundColor: modalBg, color: modalTextColor }}
              className="relative w-full h-full inset-0 flex flex-col justify-between overflow-hidden p-4 sm:p-6 shadow-2xl z-10 border-0"
            >
              {/* Header Bar */}
              <div className="flex items-center justify-between border-b border-gray-200/80 dark:border-gray-800/80 pb-3 flex-shrink-0 gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 shadow-xs",
                      urgency === "danger"
                        ? "bg-red-500/15 text-red-600"
                        : urgency === "warning"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : urgency === "emerald"
                        ? "bg-emerald-500/15 text-emerald-600"
                        : "bg-blue-500/15 text-blue-600"
                    )}
                  >
                    <span className="material-symbols-outlined text-[20px] font-bold animate-pulse">
                      {iconName}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-extrabold text-xs min-[360px]:text-sm sm:text-base uppercase tracking-tight truncate flex items-center gap-1.5">
                      <span>Emergency Broadcast</span>
                      {/* Blue Verification Badge Icon */}
                      <span className="material-symbols-outlined text-[18px] text-blue-500 fill-blue-500 shrink-0 select-none">
                        verified
                      </span>
                    </h3>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 rounded-full border border-gray-300/80 dark:border-gray-700/80 flex items-center justify-center text-gray-500 hover:text-black dark:hover:text-white transition-all cursor-pointer bg-black/5 dark:bg-white/10 shrink-0"
                  aria-label="Close broadcast modal"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Scrollable Broadcast Body Content */}
              <div className="flex-1 overflow-y-auto py-5 space-y-5 custom-scrollbar text-left">
                {/* Headline Hero Banner */}
                <div
                  className={cn(
                    "p-4 sm:p-5 rounded-2xl sm:rounded-3xl border space-y-2 text-left shadow-xs transition-all",
                    urgency === "danger"
                      ? "bg-red-500/10 border-red-500/30 text-red-950 dark:text-red-200"
                      : urgency === "warning"
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200"
                      : urgency === "emerald"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200"
                      : "bg-blue-500/10 border-blue-500/30 text-blue-950 dark:text-blue-200"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[8.5px] min-[360px]:text-[9px] font-black uppercase tracking-wider bg-current/20 text-current inline-block">
                      {badgeLabel}
                    </span>
                    {broadcast.updatedAt && (
                      <span className="text-[10px] opacity-75 font-mono font-medium">
                        {new Date(broadcast.updatedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <h2 className="font-extrabold text-base min-[360px]:text-lg sm:text-xl leading-tight">
                    {broadcast.title}
                  </h2>
                </div>

                {/* Main Body Message Paragraph */}
                <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 space-y-2.5 shadow-xs">
                  <span className="text-[9.5px] font-black uppercase tracking-wider opacity-60 block">
                    Full Broadcast Information & Message
                  </span>
                  {isHtml ? (
                    <div
                      className="prose dark:prose-invert max-w-none text-xs sm:text-sm font-medium leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_a]:text-[#FC7A00] [&_a]:underline [&_h3]:text-base [&_h3]:font-black [&_h3]:my-2 [&_img]:max-w-full [&_img]:rounded-xl [&_img]:my-2 [&_img]:shadow-md"
                      dangerouslySetInnerHTML={{ __html: broadcast.message }}
                    />
                  ) : (
                    <p className="font-medium text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                      {broadcast.message}
                    </p>
                  )}
                </div>

                {/* Attached Images Gallery */}
                {Array.isArray(broadcast.images) && broadcast.images.length > 0 && (
                  <div className="space-y-2.5">
                    <span className="text-[9.5px] font-black uppercase tracking-wider opacity-60 block">
                      Attached Images & Photos ({broadcast.images.length})
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {broadcast.images.map((imgUrl, idx) => (
                        <div
                          key={idx}
                          onClick={() => setSelectedPreviewImage(imgUrl)}
                          className="group relative aspect-video rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 bg-black/10 cursor-pointer shadow-xs"
                        >
                          <img
                            src={imgUrl}
                            alt={`Broadcast photo ${idx + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 text-white text-xs font-bold">
                            <span className="material-symbols-outlined text-[20px]">visibility</span>
                            <span>View</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Embedded Video Player */}
                {embedUrl && (
                  <div className="space-y-2.5">
                    <span className="text-[9.5px] font-black uppercase tracking-wider opacity-60 block">
                      Embedded Broadcast Video
                    </span>
                    <div className="aspect-video w-full rounded-2xl sm:rounded-3xl overflow-hidden border border-black/10 dark:border-white/10 bg-black shadow-md">
                      {isDirectVideo ? (
                        <video controls className="w-full h-full object-contain" src={embedUrl} />
                      ) : (
                        <iframe
                          src={embedUrl}
                          title="Broadcast Video"
                          className="w-full h-full border-0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Attached Downloadable Documents */}
                {Array.isArray(broadcast.attachments) && broadcast.attachments.length > 0 && (
                  <div className="space-y-2.5">
                    <span className="text-[9.5px] font-black uppercase tracking-wider opacity-60 block">
                      Attached Documents & Downloads ({broadcast.attachments.length})
                    </span>
                    <div className="space-y-2">
                      {broadcast.attachments.map((doc, idx) => (
                        <a
                          key={idx}
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={doc.name || "document"}
                          className="p-3.5 rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex items-center justify-between gap-3 hover:bg-black/10 dark:hover:bg-white/10 transition-all text-left group text-inherit no-underline"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-xl bg-[#FC7A00]/15 text-[#FC7A00] flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-[20px]">
                                {doc.type === "pdf" ? "picture_as_pdf" : "description"}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <h5 className="font-extrabold text-xs truncate group-hover:text-[#FC7A00] transition-colors">
                                {doc.name || `Attachment ${idx + 1}`}
                              </h5>
                              {doc.size && (
                                <p className="text-[10px] opacity-60 font-mono mt-0.5">
                                  {doc.size}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-[20px] opacity-60 group-hover:opacity-100 group-hover:text-[#FC7A00] transition-all shrink-0">
                            download
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* External Link Button */}
                {broadcast.externalUrl && (
                  <div className="pt-1">
                    <a
                      href={broadcast.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#FC7A00] to-[#E06600] hover:brightness-105 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all text-center no-underline border-0 cursor-pointer"
                    >
                      <span>{broadcast.externalUrlLabel || "Learn More / Open Link"}</span>
                      <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Static Bottom Action Bar */}
              <div className="pt-3.5 border-t border-gray-200/80 dark:border-gray-800/80 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-full py-3.5 sm:py-4 bg-gradient-to-r from-[#FC7A00] via-amber-500 to-[#E06600] text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-md hover:brightness-105 active:scale-98 border-0 flex items-center justify-center gap-2"
                >
                  <span>I Understand & Acknowledge</span>
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Preview Modal Overlay */}
      <AnimatePresence>
        {selectedPreviewImage && (
          <div
            onClick={() => setSelectedPreviewImage(null)}
            className="fixed inset-0 z-[100010] bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          >
            <div className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center">
              <img
                src={selectedPreviewImage}
                alt="Enlarged preview"
                className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
              />
              <button
                type="button"
                onClick={() => setSelectedPreviewImage(null)}
                className="absolute top-2 right-2 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
