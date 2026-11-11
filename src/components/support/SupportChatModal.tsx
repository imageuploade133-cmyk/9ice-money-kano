"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { toast } from "sonner";

export interface SupportChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface SupportChatMessage {
  id?: string;
  sender: "user" | "admin";
  senderName: string;
  text?: string;
  audioUrl?: string;
  timestamp: any;
}

export function SupportChatModal({ isOpen, onClose }: SupportChatModalProps) {
  const { user, userData } = useAuth();
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const uid = user?.uid;
  const userName = (userData?.name || user?.displayName || "User") as string;
  const userEmail = (userData?.email || user?.email || "") as string;
  const userPhone = (userData?.phoneNumber || userData?.phone || "") as string;

  useModalBackHandler(isOpen, onClose, "support-chat-modal");

  // Auto scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Real-time Firestore Listener
  useEffect(() => {
    if (!isOpen || !uid) return;

    const chatDocRef = doc(db, "support_chats", uid);
    const messagesColRef = collection(db, "support_chats", uid, "messages");
    const q = query(messagesColRef, orderBy("timestamp", "asc"));

    updateDoc(chatDocRef, { unreadUser: 0 }).catch(() => {});

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: SupportChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          sender: data.sender || "user",
          senderName: data.senderName || "User",
          text: data.text || "",
          audioUrl: data.audioUrl || "",
          timestamp: data.timestamp,
        });
      });
      setMessages(list);
    });

    return () => unsubscribe();
  }, [isOpen, uid]);

  if (!isOpen) return null;

  const handleSendTextMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = inputMessage.trim();
    if (!textToSend || !uid) return;

    setInputMessage("");
    setSending(true);

    try {
      const chatDocRef = doc(db, "support_chats", uid);
      const messagesColRef = collection(db, "support_chats", uid, "messages");

      await setDoc(
        chatDocRef,
        {
          userId: uid,
          userName,
          userEmail,
          userPhone,
          lastMessage: textToSend,
          lastMessageAt: serverTimestamp(),
          unreadAdmin: ((await (await import("firebase/firestore")).getDoc(chatDocRef)).data()?.unreadAdmin || 0) + 1,
          unreadUser: 0,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      await addDoc(messagesColRef, {
        sender: "user",
        senderName: userName,
        text: textToSend,
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString(),
      });

    } catch (err: any) {
      toast.error(err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    try {
      // Android/iOS WebView needs the native permission flow before getUserMedia.
      const bridge =
        typeof window !== "undefined"
          ? (window as any).flutter_inappwebview
          : null;

      if (bridge && typeof bridge.callHandler === "function") {
        const granted = await bridge.callHandler("requestMicrophonePermission");
        if (granted === false) {
          throw new Error("Microphone permission was denied.");
        }
      }

      if (
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        throw new Error("Microphone recording is not supported on this device.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          if (base64Audio && uid) {
            try {
              const chatDocRef = doc(db, "support_chats", uid);
              const messagesColRef = collection(db, "support_chats", uid, "messages");

              await setDoc(
                chatDocRef,
                {
                  userId: uid,
                  userName,
                  userEmail,
                  userPhone,
                  lastMessage: "🎤 Voice Note",
                  lastMessageAt: serverTimestamp(),
                  unreadAdmin: ((await (await import("firebase/firestore")).getDoc(chatDocRef)).data()?.unreadAdmin || 0) + 1,
                  unreadUser: 0,
                  updatedAt: new Date().toISOString(),
                },
                { merge: true }
              );

              await addDoc(messagesColRef, {
                sender: "user",
                senderName: userName,
                audioUrl: base64Audio,
                timestamp: serverTimestamp(),
                createdAt: new Date().toISOString(),
              });

              toast.success("Voice note sent!");
            } catch (err) {
              toast.error("Failed to send voice note.");
            }
          }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

    } catch (err) {
      toast.error("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="fixed inset-0 z-[200050] w-full h-full bg-white flex flex-col justify-between overflow-hidden text-black"
      >
        {/* Full Screen Top Header Bar */}
        <div className="p-4 sm:px-6 bg-gradient-to-r from-[#FC7A00] to-[#FF9022] text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white cursor-pointer transition-all active:scale-95"
              title="Close Support Chat"
            >
              <span className="material-symbols-outlined text-2xl font-bold">arrow_back</span>
            </button>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg leading-tight">Live Support & Helpdesk</h2>
              <p className="text-[11px] text-white/90 font-medium">Real-time Encrypted Support Channel</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full bg-emerald-500 text-white font-mono font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              Online
            </span>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 hidden sm:flex items-center justify-center text-white cursor-pointer transition-all"
              title="Close"
            >
              <span className="material-symbols-outlined text-xl font-bold">close</span>
            </button>
          </div>
        </div>

        {/* Messages Stream Container */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 bg-gray-50/70 max-w-4xl w-full mx-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400 my-auto">
              <div className="w-20 h-20 rounded-3xl bg-[#FC7A00]/10 flex items-center justify-center text-[#FC7A00] mb-4 shadow-sm">
                <span className="material-symbols-outlined text-4xl font-bold">support_agent</span>
              </div>
              <p className="text-base font-extrabold text-gray-800">Administrator Live Support</p>
              <p className="text-xs text-gray-500 max-w-sm mt-1.5 leading-relaxed">
                Need help with your account, transactions, or new device verification? Send a message or record a voice note below. An administrator will respond in real time.
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMe = msg.sender === "user";
              return (
                <div
                  key={msg.id || idx}
                  className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[88%] sm:max-w-[70%] p-4 rounded-2xl text-xs font-medium shadow-2xs leading-relaxed ${
                      isMe
                        ? "bg-gradient-to-r from-[#FC7A00] to-[#FF9022] text-white rounded-tr-none"
                        : "bg-white border border-gray-200/80 text-gray-800 rounded-tl-none"
                    }`}
                  >
                    <p className={`text-[10px] font-black uppercase mb-1 tracking-wider ${isMe ? "text-white/80" : "text-[#FC7A00]"}`}>
                      {isMe ? "You" : "Support Administrator"}
                    </p>
                    {msg.text && <p className="whitespace-pre-wrap text-xs leading-relaxed">{msg.text}</p>}
                    {msg.audioUrl && (
                      <div className="mt-1">
                        <audio controls src={msg.audioUrl} className="w-full h-9 min-w-[200px]" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar Footer */}
        <div className="p-3 sm:p-4 bg-white border-t border-gray-200 shrink-0">
          <form onSubmit={handleSendTextMessage} className="max-w-4xl w-full mx-auto flex items-center gap-2">
            {isRecording ? (
              <div className="flex-1 flex items-center justify-between px-4 py-2.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-600 animate-pulse">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-600 animate-ping" />
                  <span className="text-xs font-bold font-mono">Recording Voice Note... ({recordingSeconds}s)</span>
                </div>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-4 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-rose-700 active:scale-95 transition-all shadow-xs"
                >
                  Stop & Send
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Describe your issue or ask for help..."
                  className="flex-1 px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 text-xs font-medium outline-none focus:border-[#FC7A00] focus:bg-white transition-all"
                />

                <button
                  type="button"
                  onClick={startRecording}
                  className="w-11 h-11 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                  title="Record Voice Note"
                >
                  <span className="material-symbols-outlined text-xl">mic</span>
                </button>

                <button
                  type="submit"
                  disabled={sending || !inputMessage.trim()}
                  className="w-11 h-11 rounded-2xl bg-gradient-to-r from-[#FC7A00] to-[#FF9022] hover:brightness-105 active:scale-95 text-white flex items-center justify-center shrink-0 transition-all disabled:opacity-40 cursor-pointer shadow-xs"
                >
                  <span className="material-symbols-outlined text-xl">send</span>
                </button>
              </>
            )}
          </form>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
