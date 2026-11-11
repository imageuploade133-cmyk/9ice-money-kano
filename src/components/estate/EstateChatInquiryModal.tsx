"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { EstateProperty, EstateSeller } from "@/estate/types";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { useAuth } from "@/lib/AuthContext";

interface EstateChatInquiryModalProps {
  isOpen: boolean;
  property: EstateProperty | null;
  publisherAgent: EstateSeller | null;
  onClose: () => void;
  onSubmitInquiry: (
    message: string,
    options?: { messageType?: "text" | "voice"; audioData?: string; audioDuration?: number }
  ) => Promise<boolean | void> | void;
}

interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  time: string;
  messageType?: "text" | "voice";
  audioData?: string;
  audioDuration?: number;
  status?: "sent" | "delivered" | "read";
}

export const EstateChatInquiryModal: React.FC<EstateChatInquiryModalProps> = ({
  isOpen,
  property,
  publisherAgent,
  onClose,
  onSubmitInquiry,
}) => {
  const { user } = useAuth();
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Security Notice Modal Agreement State
  const isAgentUser = user?.uid === property?.sellerId || user?.uid === publisherAgent?.uid;
  const agreementStorageKey = isAgentUser ? "estate_chat_agent_agreed" : "estate_chat_user_agreed";
  const [hasAgreedSecurityNotice, setHasAgreedSecurityNotice] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(agreementStorageKey) === "true";
    }
    return false;
  });

  const handleAgreeSecurityNotice = () => {
    setHasAgreedSecurityNotice(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(agreementStorageKey, "true");
    }
  };

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  useModalBackHandler(
    isOpen,
    onClose,
    property ? `estate-chat-inquiry-${property.id}` : "estate-chat-inquiry"
  );

  // Fetch real-time chat history for this property
  const fetchChatHistory = async () => {
    if (!property || !user) return;
    setIsLoadingHistory(true);
    try {
      let idToken = "";
      if (typeof user.getIdToken === "function") {
        idToken = await user.getIdToken();
      }

      const res = await fetch(`/api/estate/inquiries?propertyId=${property.id}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      const data = await res.json();
      if (data.success && Array.isArray(data.inquiries)) {
        const fetchedMsgs: ChatMessage[] = data.inquiries.map((inq: any) => ({
          id: inq.id,
          sender: inq.userId === user.uid ? "user" : "agent",
          text: inq.message,
          messageType: inq.messageType || "text",
          audioData: inq.audioData,
          audioDuration: inq.audioDuration || 0,
          time: new Date(inq.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          status: "read",
        }));

        const agentName = publisherAgent?.displayName || property.sellerName || "Agent";
        const initialWelcome: ChatMessage = {
          id: "welcome",
          sender: "agent",
          text: `Hello! I am ${agentName}. How can I assist you regarding "${property.title}"?`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };

        setMessages([initialWelcome, ...fetchedMsgs]);
      }
    } catch {
      console.warn("Failed to load inquiry history.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen && property) {
      fetchChatHistory();
    }
  }, [isOpen, property?.id, user]);

  // Start Voice Note Recording (Max 50 seconds)
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error("Voice recording is not supported on your browser.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev >= 49) {
            stopRecording(true);
            return 50;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      toast.error("Microphone access denied. Please allow microphone permissions.");
    }
  };

  // Stop Recording & Send Voice Note
  const stopRecording = async (shouldSend = true) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    const finalDuration = recordingDuration;
    setIsRecording(false);

    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach((track) => track.stop());

      if (!shouldSend) {
        audioChunksRef.current = [];
        setRecordingDuration(0);
        return;
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
      audioChunksRef.current = [];
      setRecordingDuration(0);

      if (audioBlob.size === 0) return;

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        const newVoiceMsg: ChatMessage = {
          id: Date.now().toString(),
          sender: "user",
          text: "🎤 Voice Note",
          messageType: "voice",
          audioData: base64Audio,
          audioDuration: finalDuration || 1,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          status: "sent",
        };

        setMessages((prev) => [...prev, newVoiceMsg]);
        setIsSending(true);

        try {
          await onSubmitInquiry("🎤 Voice Note", {
            messageType: "voice",
            audioData: base64Audio,
            audioDuration: finalDuration || 1,
          });

          setTimeout(() => {
            const autoReply =
              publisherAgent?.autoResponseText && publisherAgent.autoResponseText.trim()
                ? publisherAgent.autoResponseText.trim()
                : "Thank you for your voice note! Our agent has received it and will respond shortly.";

            setMessages((prev) => [
              ...prev,
              {
                id: (Date.now() + 1).toString(),
                sender: "agent",
                text: autoReply,
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              },
            ]);
          }, 800);
        } catch {
          toast.error("Failed to send voice note.");
        } finally {
          setIsSending(false);
        }
      };
      reader.readAsDataURL(audioBlob);
    };

    recorder.stop();
  };

  // Play / Pause Voice Note
  const togglePlayAudio = (msgId: string, audioDataUrl?: string) => {
    if (!audioDataUrl) return;

    if (playingAudioId === msgId) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      setPlayingAudioId(null);
      return;
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }

    const audio = new Audio(audioDataUrl);
    audioElementRef.current = audio;
    setPlayingAudioId(msgId);

    audio.onended = () => {
      setPlayingAudioId(null);
    };

    audio.play().catch(() => {
      toast.error("Unable to play voice note.");
      setPlayingAudioId(null);
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!isOpen || !property) return null;

  const quickQuestions = [
    "Is this property still available?",
    "When can I schedule an inspection?",
    "Are the prices negotiable?",
    "What are the payment terms?",
  ];

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) {
      toast.error("Please type a message before sending.");
      return;
    }

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: "sent",
    };

    setMessages((prev) => [...prev, newMsg]);
    if (!textToSend) setInputText("");
    setIsSending(true);

    try {
      await onSubmitInquiry(text.trim());
      setTimeout(() => {
        const autoReply =
          publisherAgent?.autoResponseText && publisherAgent.autoResponseText.trim()
            ? publisherAgent.autoResponseText.trim()
            : "Thank you for your message! Our agent has been notified and will respond shortly.";

        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: "agent",
            text: autoReply,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      }, 800);
    } catch {
      toast.error("Failed to send inquiry. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const agentName = publisherAgent?.displayName || property.sellerName || "Property Agent";
  const agentPhone = publisherAgent?.phone || property.sellerPhone;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed inset-0 z-[100020] bg-gray-50 w-full h-full flex flex-col justify-between overflow-hidden text-black font-hanken"
        >
          {/* Header Bar */}
          <div className="px-4 py-3 bg-white flex items-center justify-between z-10">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all cursor-pointer border-0 active:scale-90 flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>

              <div className="flex items-center gap-2.5 min-w-0">
                {publisherAgent?.avatarUrl && !publisherAgent.mutedFields?.includes("avatar") ? (
                  <div className="w-10 h-10 rounded-full overflow-hidden relative border border-[#FC7A00] flex-shrink-0 shadow-2xs">
                    <Image src={publisherAgent.avatarUrl} alt="Agent" fill className="object-cover" unoptimized />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FC7A00] to-[#E06600] text-white font-black text-sm flex items-center justify-center flex-shrink-0 shadow-2xs">
                    {agentName[0]}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-extrabold text-xs text-black truncate">{agentName}</h3>
                    {(publisherAgent?.isVerified || true) && (
                      <span className="material-symbols-outlined text-emerald-600 text-[15px]" title="Verified Partner">
                        verified
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 font-bold truncate">
                    {publisherAgent?.agencyName || "Estate Direct Partner"} • Active Agent
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Contact Actions */}
            {agentPhone && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={`tel:${agentPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.open(`tel:${agentPhone}`, "_system");
                    }
                  }}
                  className="w-9 h-9 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center cursor-pointer border border-emerald-200 transition-all active:scale-90"
                  title="Call Agent"
                >
                  <span className="material-symbols-outlined text-[18px]">call</span>
                </a>
                <a
                  href={`https://wa.me/${agentPhone.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center cursor-pointer border-0 transition-all active:scale-90"
                  title="WhatsApp Agent"
                >
                  <span className="material-symbols-outlined text-[18px]">chat</span>
                </a>
              </div>
            )}
          </div>

          {/* Property Context Header Card */}
          <div className="px-4 py-2.5 bg-white flex items-center gap-3 flex-shrink-0">
            <div className="w-12 h-12 rounded-xl bg-gray-100 relative overflow-hidden flex-shrink-0 border border-gray-200">
              {property.images && property.images[0] ? (
                <Image src={property.images[0]} alt="Prop" fill className="object-cover" unoptimized />
              ) : (
                <span className="material-symbols-outlined text-[24px] text-gray-400 flex items-center justify-center h-full">
                  domain
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-extrabold text-xs text-black truncate uppercase">{property.title}</h4>
              <p className="font-mono text-xs font-black text-[#FC7A00]">
                ₦{property.price.toLocaleString()}
                {property.purpose !== "Sale" && property.pricePeriod && (
                  <span className="text-[10px] text-gray-500 font-bold"> /{property.pricePeriod}</span>
                )}
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase bg-orange-100 text-[#FC7A00] border border-orange-200 flex-shrink-0">
              For {property.purpose}
            </span>
          </div>

          {/* User-Friendly Privacy & Security Banner */}
          <div className="px-4 py-1.5 bg-emerald-50/80 border-y border-emerald-100/60 flex items-center justify-center gap-1.5 text-[10px] font-extrabold text-emerald-800 flex-shrink-0">
            <span className="material-symbols-outlined text-[14px] text-emerald-600">lock</span>
            <span>End-to-End Private Messaging • Wallet Payment Security Active</span>
          </div>

          {/* Attention / Security Warning Overlay Modal */}
          <AnimatePresence>
            {!hasAgreedSecurityNotice && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[100025] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
              >
                <div className="bg-white rounded-3xl p-6 w-full max-w-sm text-center space-y-4 shadow-2xl border border-gray-100">
                  <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-[36px]">shield_lock</span>
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="font-bodoni font-bold text-lg text-black leading-tight">
                      {isAgentUser ? "Agent Compliance Notice" : "Important Security Notice"}
                    </h3>
                    <p className="text-[11px] font-extrabold text-[#FC7A00] uppercase tracking-wider">
                      {isAgentUser ? `Welcome ${publisherAgent?.displayName || "Agent"}` : `Dear ${user?.displayName || "Valued User"}`}
                    </p>
                  </div>

                  <div className="p-4 bg-orange-50/80 rounded-2xl border border-orange-200/80 text-left text-xs font-medium text-gray-800 leading-relaxed space-y-2">
                    {isAgentUser ? (
                      <p>
                        Do <strong>NOT</strong> request or instruct customers to transfer funds directly to your external personal bank account. To maintain transaction security and keep your live agent status active, provide <strong>ONLY your E-Global Wallet Account</strong> to receive funds.
                      </p>
                    ) : (
                      <p>
                        Do <strong>NOT</strong> deposit or transfer funds directly to an agent&apos;s personal bank account. For high security and transaction control, fund your <strong>E-Global Wallet</strong> account and transfer directly to the agent&apos;s wallet account.
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleAgreeSecurityNotice}
                    className="w-full py-3.5 bg-gradient-to-r from-[#FC7A00] via-amber-500 to-[#E06600] text-white font-black text-xs uppercase rounded-2xl border-0 cursor-pointer shadow-md hover:brightness-105 transition-all"
                  >
                    I Agree & Continue Chat
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chat Stream Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar bg-[#F8F9FA]">
            {isLoadingHistory ? (
              <div className="p-4 text-center text-xs font-bold text-gray-400 animate-pulse">
                Securing chat session...
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[82%] p-3.5 rounded-2xl shadow-2xs space-y-1.5 ${
                      msg.sender === "user"
                        ? "bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white rounded-br-none"
                        : "bg-white text-gray-900 border border-gray-200 rounded-bl-none"
                    }`}
                  >
                    {msg.messageType === "voice" ? (
                      <div className="flex items-center gap-3 py-1 px-1">
                        <button
                          type="button"
                          onClick={() => togglePlayAudio(msg.id, msg.audioData)}
                          className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-90 border-0 flex-shrink-0 ${
                            msg.sender === "user" ? "bg-white text-[#FC7A00]" : "bg-[#FC7A00] text-white"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[22px]">
                            {playingAudioId === msg.id ? "pause" : "play_arrow"}
                          </span>
                        </button>

                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-1 h-5">
                            {[40, 70, 30, 90, 50, 80, 40, 60, 100, 40].map((height, i) => (
                              <span
                                key={i}
                                style={{ height: `${playingAudioId === msg.id ? Math.max(25, (height + (i % 3) * 20) % 100) : 40}%` }}
                                className={`w-1 rounded-full transition-all duration-300 ${
                                  msg.sender === "user" ? "bg-white/90" : "bg-[#FC7A00]"
                                }`}
                              />
                            ))}
                          </div>
                          <span className={`text-[10px] font-mono font-bold block ${msg.sender === "user" ? "text-orange-100" : "text-gray-500"}`}>
                            00:{String(msg.audioDuration || 0).padStart(2, "0")} • Voice Note
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs font-semibold leading-relaxed whitespace-pre-line">{msg.text}</p>
                    )}

                    <div
                      className={`flex items-center justify-end gap-1 text-[9px] font-bold ${
                        msg.sender === "user" ? "text-orange-100" : "text-gray-400"
                      }`}
                    >
                      <span>{msg.time}</span>
                      {msg.sender === "user" && (
                        <span className="material-symbols-outlined text-[13px]">done_all</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Questions Chips & Input Bar */}
          <div className="p-3 bg-white border-t border-gray-150 space-y-2.5 flex-shrink-0 shadow-lg">
            {/* Quick chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {quickQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(q)}
                  className="px-3 py-1.5 rounded-full text-[10px] font-extrabold bg-orange-50 hover:bg-orange-100 text-[#FC7A00] border border-[#FC7A00]/20 flex-shrink-0 cursor-pointer transition-all active:scale-95 whitespace-nowrap"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Input area */}
            {isRecording ? (
              <div className="bg-gradient-to-r from-red-500 to-red-600 p-[1.5px] rounded-2xl animate-pulse">
                <div className="bg-white rounded-[14.5px] p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-600 animate-ping" />
                    <span className="font-mono text-xs font-black text-red-600">
                      Recording Voice... 00:{String(recordingDuration).padStart(2, "0")} / 00:50
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => stopRecording(false)}
                      className="px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold border-0 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => stopRecording(true)}
                      className="w-9 h-9 rounded-xl bg-red-600 hover:bg-red-700 text-white flex items-center justify-center cursor-pointer border-0 shadow-2xs"
                    >
                      <span className="material-symbols-outlined text-[18px]">send</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-[#FC7A00] via-amber-400 to-[#E06600] p-[1.5px] rounded-2xl">
                <div className="bg-white rounded-[14.5px] p-1.5 flex items-center gap-2">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Type your inquiry or message..."
                    className="flex-1 bg-transparent px-3 py-1.5 text-xs font-semibold text-black placeholder-gray-400 outline-none"
                  />

                  {/* Mic Button */}
                  <button
                    type="button"
                    onClick={startRecording}
                    className="w-9 h-9 rounded-xl bg-orange-100 hover:bg-orange-200 text-[#FC7A00] flex items-center justify-center cursor-pointer border-0 transition-all active:scale-90 flex-shrink-0"
                    title="Record Voice Note (Max 50s)"
                  >
                    <span className="material-symbols-outlined text-[20px]">mic</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={isSending || !inputText.trim()}
                    className="w-9 h-9 rounded-xl bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white flex items-center justify-center cursor-pointer border-0 disabled:opacity-50 transition-all active:scale-90 flex-shrink-0 shadow-2xs"
                  >
                    {isSending ? (
                      <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[18px]">send</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
