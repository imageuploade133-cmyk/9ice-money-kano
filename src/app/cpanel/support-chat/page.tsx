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
import { toast } from "sonner";

export interface SupportChatRoom {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userPhone?: string;
  lastMessage?: string;
  lastMessageAt?: any;
  unreadAdmin?: number;
  unreadUser?: number;
  updatedAt?: string;
}

export interface SupportChatMessage {
  id?: string;
  sender: "user" | "admin";
  senderName: string;
  text?: string;
  audioUrl?: string;
  timestamp: any;
}

export default function CpanelSupportChatPage() {
  const [rooms, setMessagesRooms] = useState<SupportChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<SupportChatRoom | null>(null);
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Real-time listener for all user support chat rooms
  useEffect(() => {
    const chatColRef = collection(db, "support_chats");
    const q = query(chatColRef, orderBy("lastMessageAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomList: SupportChatRoom[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        roomList.push({
          id: docSnap.id,
          userId: data.userId || docSnap.id,
          userName: data.userName || "Customer",
          userEmail: data.userEmail || "",
          userPhone: data.userPhone || "",
          lastMessage: data.lastMessage || "",
          lastMessageAt: data.lastMessageAt,
          unreadAdmin: data.unreadAdmin || 0,
          unreadUser: data.unreadUser || 0,
          updatedAt: data.updatedAt || "",
        });
      });
      setMessagesRooms(roomList);
    });

    return () => unsubscribe();
  }, []);

  // Listen to messages for selected room
  useEffect(() => {
    if (!selectedRoom) return;

    const chatDocRef = doc(db, "support_chats", selectedRoom.id);
    const messagesColRef = collection(db, "support_chats", selectedRoom.id, "messages");
    const q = query(messagesColRef, orderBy("timestamp", "asc"));

    // Reset admin unread count on opening room
    updateDoc(chatDocRef, { unreadAdmin: 0 }).catch(() => {});

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgList: SupportChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        msgList.push({
          id: docSnap.id,
          sender: data.sender || "user",
          senderName: data.senderName || "User",
          text: data.text || "",
          audioUrl: data.audioUrl || "",
          timestamp: data.timestamp,
        });
      });
      setMessages(msgList);
    });

    return () => unsubscribe();
  }, [selectedRoom?.id]);

  const handleAdminSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedRoom || !inputMessage.trim()) return;

    const textToSend = inputMessage.trim();
    setInputMessage("");
    setSending(true);

    try {
      const chatDocRef = doc(db, "support_chats", selectedRoom.id);
      const messagesColRef = collection(db, "support_chats", selectedRoom.id, "messages");

      await setDoc(
        chatDocRef,
        {
          lastMessage: textToSend,
          lastMessageAt: serverTimestamp(),
          unreadAdmin: 0,
          unreadUser: (selectedRoom.unreadUser || 0) + 1,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      await addDoc(messagesColRef, {
        sender: "admin",
        senderName: "Support Administrator",
        text: textToSend,
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString(),
      });

    } catch (err: any) {
      toast.error("Failed to send admin response.");
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    try {
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
          if (base64Audio && selectedRoom) {
            try {
              const chatDocRef = doc(db, "support_chats", selectedRoom.id);
              const messagesColRef = collection(db, "support_chats", selectedRoom.id, "messages");

              await setDoc(
                chatDocRef,
                {
                  lastMessage: "🎤 Admin Voice Note",
                  lastMessageAt: serverTimestamp(),
                  unreadAdmin: 0,
                  unreadUser: (selectedRoom.unreadUser || 0) + 1,
                  updatedAt: new Date().toISOString(),
                },
                { merge: true }
              );

              await addDoc(messagesColRef, {
                sender: "admin",
                senderName: "Support Administrator",
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

  const filteredRooms = rooms.filter((r) =>
    r.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.userEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.userPhone?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto text-black">
      {/* Page Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#FC7A00]/10 border border-[#FC7A00]/30 flex items-center justify-center text-[#FC7A00]">
            <span className="material-symbols-outlined text-2xl font-bold">support_agent</span>
          </div>
          <div>
            <h1 className="text-xl font-black text-black tracking-tight">Support Chat Console</h1>
            <p className="text-xs text-gray-500 font-medium">Real-time Customer Helpdesk & Support Inbox</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-[#FC7A00]/10 text-[#FC7A00] font-mono font-bold text-xs border border-[#FC7A00]/20">
            {rooms.filter((r) => (r.unreadAdmin || 0) > 0).length} Unread User Threads
          </span>
        </div>
      </div>

      {/* Main Grid: User Rooms Directory vs Live Chat Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[600px]">
        {/* Left Directory Sidebar */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex flex-col overflow-hidden">
          <div className="p-3.5 border-b border-gray-150">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by user name, email, phone..."
              className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs outline-none focus:border-[#FC7A00] focus:bg-white transition-all"
            />
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {filteredRooms.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-xs font-bold">
                No support conversations found.
              </div>
            ) : (
              filteredRooms.map((room) => {
                const isSelected = selectedRoom?.id === room.id;
                const hasUnread = (room.unreadAdmin || 0) > 0;

                return (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoom(room)}
                    className={`w-full p-3.5 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      isSelected ? "bg-[#FC7A00]/10 border-l-4 border-[#FC7A00]" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className="font-extrabold text-xs text-black truncate">{room.userName}</p>
                        {hasUnread && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-mono font-bold text-[10px] shrink-0 animate-pulse">
                            {room.unreadAdmin} NEW
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">{room.lastMessage || "No messages yet"}</p>
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{room.userEmail || room.userPhone || room.userId}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Active Chat Workspace */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-200/80 shadow-xs flex flex-col overflow-hidden">
          {selectedRoom ? (
            <>
              {/* Workspace Header */}
              <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="font-extrabold text-sm text-black">{selectedRoom.userName}</h2>
                  <p className="text-xs text-gray-500 font-mono">{selectedRoom.userEmail} {selectedRoom.userPhone ? `• ${selectedRoom.userPhone}` : ""}</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-mono font-bold text-[10px]">
                  USER ID: {selectedRoom.userId.slice(0, 10)}...
                </span>
              </div>

              {/* Chat Timeline */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50/50">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-400 text-xs font-bold">
                    No messages in this conversation.
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isAdmin = msg.sender === "admin";
                    return (
                      <div
                        key={msg.id || idx}
                        className={`flex flex-col ${isAdmin ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-[80%] p-3 rounded-2xl text-xs font-medium shadow-2xs leading-relaxed ${
                            isAdmin
                              ? "bg-[#FC7A00] text-white rounded-tr-none"
                              : "bg-white border border-gray-200 text-gray-800 rounded-tl-none"
                          }`}
                        >
                          <p className={`text-[10px] font-black uppercase mb-1 tracking-wider ${isAdmin ? "text-white/80" : "text-[#FC7A00]"}`}>
                            {isAdmin ? "Support Administrator" : selectedRoom.userName}
                          </p>
                          {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                          {msg.audioUrl && (
                            <div className="mt-1">
                              <audio controls src={msg.audioUrl} className="w-full h-8 min-w-[200px]" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Response Input */}
              <form onSubmit={handleAdminSendMessage} className="p-3 bg-white border-t border-gray-200 flex items-center gap-2">
                {isRecording ? (
                  <div className="flex-1 flex items-center justify-between px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 animate-pulse">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping" />
                      <span className="text-xs font-bold font-mono">Recording Admin Voice Note... ({recordingSeconds}s)</span>
                    </div>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-bold cursor-pointer hover:bg-rose-700"
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
                      placeholder="Type admin response..."
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-medium outline-none focus:border-[#FC7A00] focus:bg-white transition-all"
                    />

                    <button
                      type="button"
                      onClick={startRecording}
                      className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                      title="Record Voice Note"
                    >
                      <span className="material-symbols-outlined text-lg">mic</span>
                    </button>

                    <button
                      type="submit"
                      disabled={sending || !inputMessage.trim()}
                      className="w-10 h-10 rounded-xl bg-[#FC7A00] hover:brightness-105 active:scale-95 text-white flex items-center justify-center shrink-0 transition-all disabled:opacity-40 cursor-pointer shadow-xs"
                    >
                      <span className="material-symbols-outlined text-lg">send</span>
                    </button>
                  </>
                )}
              </form>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
              <span className="material-symbols-outlined text-5xl text-[#FC7A00]/30 mb-3">forum</span>
              <p className="text-sm font-extrabold text-gray-700">No Support Thread Selected</p>
              <p className="text-xs text-gray-400 max-w-sm mt-1">
                Select a user thread from the left directory list to view real-time chat history and reply.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
