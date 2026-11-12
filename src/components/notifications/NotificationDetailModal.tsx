"use client";

import React from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Notification } from "./NotificationItem";
import { useModalBackHandler } from "@/lib/useModalBackHandler";

interface NotificationDetailModalProps {
  notification: Notification | null;
  onClose: () => void;
  onCloseParentTray: () => void;
}

export function NotificationDetailModal({
  notification,
  onClose,
  onCloseParentTray,
}: NotificationDetailModalProps) {
  const [fullImagePreview, setFullImagePreview] = React.useState<string | null>(null);
  useModalBackHandler(
    !!notification,
    onClose,
    "notification-detail"
  );

  if (!notification) return null;

  const handleDetailDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[20000]"
      />

      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
        drag="y"
        dragDirectionLock
        dragConstraints={{ top: 0, bottom: 450 }}
        dragElastic={{ top: 0, bottom: 0.2 }}
        onDragEnd={handleDetailDragEnd}
        className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[32px] h-[90dvh] z-[20001] flex flex-col items-center select-none cursor-default shadow-none touch-none"
      >
        {/* Drag Handle */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mt-4 mb-4 cursor-grab active:cursor-grabbing" />

        {/* Header */}
        <div className="w-full px-6 flex justify-between items-center border-b border-gray-100 pb-4 mb-6">
          <div className="w-8" />
          <h3 className="font-hanken font-bold text-base text-black text-center">
            Detail Information
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] font-bold">close</span>
          </button>
        </div>

        {/* Detail Body Content */}
        <div className="flex-grow overflow-y-auto px-6 w-full custom-scrollbar pb-10">
          <div className="flex flex-col items-center text-center mt-2 mb-6">
            <div
              className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mb-4 shadow-xs",
                notification.type === "transaction"
                  ? "bg-[#0b513d]/10 text-[#0b513d]"
                  : notification.type === "security"
                  ? "bg-[#dc3545]/10 text-[#dc3545]"
                  : notification.type === "order"
                  ? "bg-purple-500/10 text-purple-600"
                  : notification.type === "chat"
                  ? "bg-blue-500/10 text-blue-600"
                  : notification.type === "system"
                  ? "bg-indigo-500/10 text-indigo-600"
                  : "bg-[#FC7A00]/10 text-[#FC7A00]"
              )}
            >
              <span className="material-symbols-outlined text-[32px] font-bold">
                {notification.type === "transaction"
                  ? "payments"
                  : notification.type === "security"
                  ? "gpp_maybe"
                  : notification.type === "order"
                  ? "shopping_bag"
                  : notification.type === "chat"
                  ? "chat_bubble"
                  : notification.type === "system"
                  ? "settings_suggest"
                  : "campaign"}
              </span>
            </div>
            <h4 className="font-hanken font-extrabold text-lg text-black mb-1">
              {notification.title}
            </h4>
            <p className="text-[11px] text-gray-400 font-mono font-medium">
              Received: {notification.time}
            </p>

            {(notification.imageUrl || notification.bannerUrl) && (
              <div
                onClick={() => setFullImagePreview(notification.imageUrl || notification.bannerUrl || null)}
                className="w-full mt-4 rounded-2xl overflow-hidden border border-gray-100 shadow-sm cursor-pointer hover:opacity-95 transition-opacity"
              >
                <img
                  src={notification.imageUrl || notification.bannerUrl}
                  alt="Notification Banner"
                  className="w-full max-h-48 object-cover"
                />
              </div>
            )}
          </div>

          {/* Conditional rendering based on Type */}
          {notification.type === "order" ? (
            <div className="bg-purple-50/60 rounded-2xl p-5 border border-purple-200/80 space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-purple-200/60 pb-3">
                <span className="text-[10px] text-purple-700 uppercase font-extrabold tracking-wider">
                  Store Order Update
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-purple-100 text-purple-800">
                  Store Notice
                </span>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-gray-800 leading-relaxed font-medium">
                  {notification.message}
                </p>
                {notification.reference && (
                  <div className="pt-2 border-t border-purple-200/50 flex justify-between items-center text-xs">
                    <span className="text-gray-500 font-bold">Order Reference:</span>
                    <span className="font-mono font-black text-purple-700">{notification.reference}</span>
                  </div>
                )}
              </div>
            </div>
          ) : notification.type === "chat" ? (
            <div className="bg-blue-50/60 rounded-2xl p-5 border border-blue-200/80 space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-blue-200/60 pb-3">
                <span className="text-[10px] text-blue-700 uppercase font-extrabold tracking-wider">
                  Direct Message / Support Chat
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-100 text-blue-800">
                  Chat Alert
                </span>
              </div>
              <p className="text-xs text-gray-800 leading-relaxed font-medium">
                {notification.message}
              </p>
            </div>
          ) : notification.type === "system" ? (
            <div className="bg-indigo-50/60 rounded-2xl p-5 border border-indigo-200/80 space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-indigo-200/60 pb-3">
                <span className="text-[10px] text-indigo-700 uppercase font-extrabold tracking-wider">
                  System Notification
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-indigo-100 text-indigo-800">
                  System Notice
                </span>
              </div>
              <p className="text-xs text-gray-800 leading-relaxed font-medium">
                {notification.message}
              </p>
            </div>
          ) : notification.type === "transaction" ? (
            (() => {
              const msg = notification.message || "";
              const title = notification.title || "";

              let displayAmount = notification.amount;
              if (displayAmount === undefined || displayAmount === null) {
                const amtMatch = msg.match(/(?:₦|\$|CFA|UGX|KES|GHS|ZMW|RWF|CAD)\s*([\d,]+(?:\.\d{2})?)/i) ||
                  msg.match(/(?:of|credited|debited)\s+([\d,]+(?:\.\d{2})?)/i);
                if (amtMatch && amtMatch[1]) {
                  displayAmount = parseFloat(amtMatch[1].replace(/,/g, ""));
                }
              }

              let displayRecipient = notification.recipientName;
              if (!displayRecipient) {
                const toMatch = msg.match(/(?:to|for)\s+([A-Za-z0-9\s\.\-+]{2,30})(?:\s+is|\.|,|$)/i);
                if (toMatch && toMatch[1]) {
                  displayRecipient = toMatch[1].trim();
                } else {
                  displayRecipient = "Main Wallet";
                }
              }

              let displayBank = notification.bankName;
              if (!displayBank) {
                if (/transfer/i.test(title) || /transfer/i.test(msg)) displayBank = "Bank Transfer";
                else if (/bill|airtime|data|cable|electricity/i.test(msg)) displayBank = "Utility Bill Payment";
                else displayBank = "Wallet Settlement";
              }

              let displayRef = notification.reference;
              if (!displayRef) {
                const refMatch = msg.match(/(?:ref|tx_ref|reference|id):\s*([a-zA-Z0-9_\-]+)/i) ||
                  msg.match(/\b(TXN-[a-zA-Z0-9_\-]+)\b/i);
                displayRef = refMatch ? refMatch[1] : `ALERT-${notification.id.slice(0, 10).toUpperCase()}`;
              }

              const currencySym = notification.currency === "USD" ? "$" : "₦";

              return (
                <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 space-y-4 text-left">
                  <div className="text-center border-b border-dashed border-gray-200 pb-4">
                    <p className="text-[11px] text-gray-400 uppercase tracking-widest font-bold">Transaction Amount</p>
                    <h2 className="text-3xl font-display-lg text-[#0b513d] font-bold mt-1">
                      {displayAmount !== undefined && displayAmount !== null
                        ? `${currencySym}${displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "Notification Alert"}
                    </h2>
                  </div>
                  <div className="space-y-3 pt-2 text-sm font-hanken">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Payment Channel</span>
                      <span className="text-black font-semibold">{notification.channel || displayBank}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Recipient / Beneficiary</span>
                      <span className="text-black font-semibold truncate max-w-[180px]">{displayRecipient}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Status</span>
                      <span className="text-emerald-600 font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: '"FILL" 1' }}>check_circle</span>
                        COMPLETED
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Service Category</span>
                      <span className="text-black font-semibold">{displayBank}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-100 pt-3">
                      <span className="text-gray-400">Reference ID</span>
                      <span className="text-black font-mono text-xs select-all">{displayRef}</span>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : notification.type === "security" ? (
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 space-y-4">
              <div className="text-center border-b border-dashed border-gray-200 pb-4">
                <p className="text-[11px] text-gray-400 uppercase tracking-widest font-bold">Security Status</p>
                <h2 className="text-2xl font-hanken text-black font-bold mt-1">LOG SECURED</h2>
              </div>
              <div className="space-y-3 pt-2 text-sm font-hanken">
                <div className="flex justify-between">
                  <span className="text-gray-400">Device Platform</span>
                  <span className="text-black font-semibold">iPhone 15 Pro</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Location origin</span>
                  <span className="text-black font-semibold">Lagos, Nigeria</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">IP Address</span>
                  <span className="text-black font-mono text-xs">102.89.44.12</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Security Check</span>
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: '"FILL" 1' }}>verified_user</span>
                    PIN VERIFIED
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 space-y-4 text-center">
              <p className="text-[11px] text-gray-400 uppercase tracking-widest font-bold">Infinite Exclusive Pass</p>
              <h2 className="text-2xl font-display-lg text-[#FC7A00] font-bold">ZUMA LOUNGE 15% OFF</h2>
              <p className="font-hanken text-sm text-gray-500 max-w-[280px] mx-auto leading-relaxed pt-2 border-t border-dashed border-gray-200">
                To redeem, present your E-Tech Infinite diamond digital status card at check-in or checkout. Use promo reference code below.
              </p>
              <div className="bg-white border border-[#FC7A00]/30 py-3 px-4 rounded-xl inline-block mt-4">
                <span className="font-mono font-bold text-black tracking-widest text-lg">ETGINFINITE15</span>
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3">
            {notification.type === "transaction" ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCloseParentTray();
                  const txRef = notification.reference;
                  if (txRef && typeof window !== "undefined") {
                    if ((window as any).__openNotificationTransaction) {
                      (window as any).__openNotificationTransaction(txRef);
                    } else {
                      window.location.href = `/?txRef=${encodeURIComponent(txRef)}`;
                    }
                  }
                }}
                className="w-full py-3.5 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-none text-center cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                <span>{notification.reference ? "View Exact Transaction Receipt" : "View Transaction Details"}</span>
              </button>
            ) : notification.type === "order" ? (
              <Link
                href="/store"
                onClick={() => {
                  onClose();
                  onCloseParentTray();
                }}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-none text-center cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">shopping_bag</span>
                <span>Open Store Orders</span>
              </Link>
            ) : notification.url && notification.url !== "/" && notification.url !== "app" && notification.url !== "none" ? (
              notification.url.startsWith("http://") || notification.url.startsWith("https://") ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onCloseParentTray();
                    window.open(notification.url, "_blank", "noopener,noreferrer");
                  }}
                  className="w-full py-3.5 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-none text-center cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  <span>Visit Web Link</span>
                </button>
              ) : (
                <Link
                  href={notification.url}
                  onClick={() => {
                    onClose();
                    onCloseParentTray();
                  }}
                  className="w-full py-3.5 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-none text-center cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">open_in_browser</span>
                  <span>Open Target Screen ({notification.url})</span>
                </Link>
              )
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className="w-full py-3.5 bg-black hover:bg-gray-900 active:scale-95 text-white text-xs font-bold uppercase tracking-widest rounded-2xl transition-all shadow-none cursor-pointer"
            >
              Acknowledge Alert
            </button>
          </div>
        </div>

        {/* Full Image Zoom Modal */}
        <AnimatePresence>
          {fullImagePreview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFullImagePreview(null)}
              className="fixed inset-0 z-[30000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
            >
              <div className="relative max-w-lg w-full flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setFullImagePreview(null)}
                  className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/40 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px] font-bold">close</span>
                </button>
                <img
                  src={fullImagePreview}
                  alt="Full Banner Preview"
                  className="w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/20"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
