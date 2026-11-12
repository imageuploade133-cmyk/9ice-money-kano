"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: "transaction" | "security" | "promo" | "order" | "chat" | "system";
  read: boolean;
  amount?: number;
  currency?: string;
  reference?: string;
  recipientName?: string;
  bankName?: string;
  channel?: string;
  url?: string;
  imageUrl?: string;
  bannerUrl?: string;
}

interface NotificationItemProps {
  notification: Notification;
  onClick: (n: Notification) => void;
  onDelete: (id: string) => void;
}

export function NotificationItem({
  notification: n,
  onClick,
  onDelete,
}: NotificationItemProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={() => onClick(n)}
      className={cn(
        "p-4 rounded-2xl border transition-all cursor-pointer select-none shadow-none relative overflow-hidden",
        n.read
          ? "bg-white border-gray-100 text-gray-500"
          : "bg-white border-[#FC7A00]/35 text-black"
      )}
    >
      {!n.read && (
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#FC7A00] to-[#FF9022]" />
      )}

      <div className="flex gap-4">
        {/* Interactive type icons */}
        <div
          className={cn(
            "w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-xs",
            n.type === "transaction"
              ? "bg-[#0b513d]/10 text-[#0b513d]"
              : n.type === "security"
              ? "bg-[#dc3545]/10 text-[#dc3545]"
              : n.type === "order"
              ? "bg-purple-500/10 text-purple-600"
              : n.type === "chat"
              ? "bg-blue-500/10 text-blue-600"
              : n.type === "system"
              ? "bg-indigo-500/10 text-indigo-600"
              : "bg-[#FC7A00]/10 text-[#FC7A00]"
          )}
        >
          <span className="material-symbols-outlined text-[20px] font-bold">
            {n.type === "transaction"
              ? "payments"
              : n.type === "security"
              ? "gpp_maybe"
              : n.type === "order"
              ? "shopping_bag"
              : n.type === "chat"
              ? "chat_bubble"
              : n.type === "system"
              ? "settings_suggest"
              : "campaign"}
          </span>
        </div>

        <div className="flex-grow pr-6 space-y-1.5">
          <div className="flex justify-between items-start">
            <h4
              className={cn(
                "text-[14px] leading-tight font-hanken",
                n.read ? "font-medium text-gray-700" : "font-bold text-black"
              )}
            >
              {n.title}
            </h4>
            <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap ml-2">
              {n.time}
            </span>
          </div>

          {(n.imageUrl || n.bannerUrl) && (
            <div className="w-full max-h-32 rounded-xl overflow-hidden border border-gray-100 bg-gray-50 my-1.5">
              <img
                src={n.imageUrl || n.bannerUrl}
                alt="Notification Banner"
                className="w-full h-28 object-cover"
              />
            </div>
          )}

          <p
            className={cn(
              "text-[12px] leading-relaxed font-hanken",
              n.read ? "text-gray-400" : "text-gray-600"
            )}
          >
            {n.message}
          </p>
        </div>

        {/* Delete notification button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(n.id);
          }}
          className="absolute right-3 top-3 w-7 h-7 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-200 transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[13px] font-bold">close</span>
        </button>
      </div>
    </motion.div>
  );
}
