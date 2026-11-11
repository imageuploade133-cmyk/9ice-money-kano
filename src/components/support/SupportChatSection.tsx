"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { SupportChatModal } from "@/components/support/SupportChatModal";
import { toast } from "sonner";

export interface SupportChatMessage {
  id?: string;
  sender: "user" | "admin";
  senderName: string;
  text?: string;
  audioUrl?: string;
  timestamp: any;
}

export function SupportChatSection() {
  const { user } = useAuth();
  const [unreadUserCount, setUnreadUserCount] = useState(0);
  const [lastMessageText, setLastMessageText] = useState("");
  const [isFullScreenModalOpen, setIsFullScreenModalOpen] = useState(false);

  const uid = user?.uid;

  // Real-time Firestore Listener for User Unread Badge & Last Message
  useEffect(() => {
    if (!uid) return;

    const chatDocRef = doc(db, "support_chats", uid);
    const unsubscribe = onSnapshot(chatDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUnreadUserCount(data.unreadUser || 0);
        setLastMessageText(data.lastMessage || "");
      }
    });

    return () => unsubscribe();
  }, [uid]);

  return (
    <>
      <div
        onClick={() => setIsFullScreenModalOpen(true)}
        className="w-full bg-gradient-to-r from-[#FC7A00] to-[#FF9022] hover:brightness-105 active:scale-[0.99] transition-all cursor-pointer p-4 sm:p-5 rounded-2xl text-white shadow-sm flex items-center justify-between group relative overflow-hidden select-none border border-orange-400/30"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
            <span className="material-symbols-outlined text-white text-2xl font-bold">
              support_agent
            </span>
          </div>

          <div className="text-left min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm sm:text-base text-white leading-tight truncate">
                Administrator Live Support
              </h3>
              {unreadUserCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-white text-[#FC7A00] font-mono font-black text-[10px] animate-bounce shrink-0 shadow-2xs">
                  {unreadUserCount} NEW
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/90 font-medium truncate mt-0.5">
              {lastMessageText ? `Latest: ${lastMessageText}` : "Tap to open real-time 24/7 live support chat"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 pl-2">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500 text-white font-mono font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="hidden sm:inline">Online</span>
          </span>

          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white group-hover:translate-x-0.5 transition-transform">
            <span className="material-symbols-outlined text-xl font-bold">
              open_in_full
            </span>
          </div>
        </div>
      </div>

      {/* Full Screen Live Chat Modal */}
      <SupportChatModal
        isOpen={isFullScreenModalOpen}
        onClose={() => setIsFullScreenModalOpen(false)}
      />
    </>
  );
}
