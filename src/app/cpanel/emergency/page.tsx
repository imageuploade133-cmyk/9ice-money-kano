"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { uploadImageSecurely } from "@/lib/image-upload";
import { UploadProgressBar } from "@/components/UploadProgressBar";

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

export interface EmergencyBroadcastAttachment {
  name: string;
  url: string;
  size?: string;
  type?: string;
}

const MODAL_BG_PRESETS = [
  { label: "Pure White", bg: "#FFFFFF", text: "#111827" },
  { label: "Soft Slate", bg: "#F8FAFC", text: "#0F172A" },
  { label: "Soft Warm", bg: "#FFFBEB", text: "#78350F" },
  { label: "Emerald Tint", bg: "#F0FDF4", text: "#064E3B" },
  { label: "Blue Tint", bg: "#EFF6FF", text: "#1E3A8A" },
  { label: "Dark Mode", bg: "#0F172A", text: "#FFFFFF" },
];

function getEmbedVideoUrl(url: string): { isDirectVideo: boolean; embedUrl: string } {
  if (!url) return { isDirectVideo: false, embedUrl: "" };

  const trimmed = url.trim();
  if (trimmed.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i)) {
    return { isDirectVideo: true, embedUrl: trimmed };
  }

  const ytMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([\w-]{11})/);
  if (ytMatch && ytMatch[1]) {
    return { isDirectVideo: false, embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}` };
  }

  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/[^\/]*\/videos\/|album\/\d+\/video\/|video\/|)(\d+)/);
  if (vimeoMatch && vimeoMatch[1]) {
    return { isDirectVideo: false, embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
  }

  return { isDirectVideo: false, embedUrl: trimmed };
}

function CpanelEmergencyPageContent() {
  const router = useRouter();
  const { isDark, toggleTheme } = useCpanelTheme();
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Form & Broadcast State
  const [isActive, setIsActive] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [urgency, setUrgency] = useState<"info" | "warning" | "danger" | "emerald">("warning");
  const [badge, setBadge] = useState("EMERGENCY BROADCAST");
  const [icon, setIcon] = useState("campaign");
  const [modalBgColor, setModalBgColor] = useState("#FFFFFF");
  const [modalTextColor, setModalTextColor] = useState("#111827");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalUrlLabel, setExternalUrlLabel] = useState("Learn More / Open Link");
  const [videoUrl, setVideoUrl] = useState("");
  const [attachments, setAttachments] = useState<EmergencyBroadcastAttachment[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
  const [updatedBy, setUpdatedBy] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  // New Document Input helper state
  const [newDocName, setNewDocName] = useState("");
  const [newDocUrl, setNewDocUrl] = useState("");

  // Preview Mode Switcher (Banner vs Full Modal)
  const [previewTab, setPreviewTab] = useState<"banner" | "modal">("banner");

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const docFileInputRef = useRef<HTMLInputElement | null>(null);
  const richEditorRef = useRef<HTMLDivElement | null>(null);

  // Check Admin Unlock Session
  useEffect(() => {
    async function checkSession() {
      const isMock =
        typeof window !== "undefined" &&
        (window.location.search.includes("mock=true") ||
          sessionStorage.getItem("admin_session_unlocked") === "true");
      if (isMock) {
        setIsLoadingSession(false);
        return;
      }
      try {
        const res = await fetch("/api/admin/auth/session");
        const data = await res.json();
        if (!res.ok || !data.success) {
          toast.error("Session expired. Please log in.");
          router.push("/cpanel");
          return;
        }
      } catch (err) {
        console.error("Session check failed:", err);
      } finally {
        setIsLoadingSession(false);
      }
    }
    checkSession();
  }, [router]);

  // Fetch Current Emergency Broadcast Settings
  const fetchBroadcast = async () => {
    setIsLoading(true);
    try {
      const isMock =
        typeof window !== "undefined" &&
        (window.location.search.includes("mock=true") ||
          sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { Authorization: "Bearer mock-admin-token" }
        : {};

      const res = await fetch("/api/admin/emergency", { headers });
      const data = await res.json();

      if (data.success && data.broadcast) {
        const b = data.broadcast;
        setIsActive(Boolean(b.active));
        setTitle(b.title || "");
        setMessage(b.message || "");
        setUrgency(b.urgency || "warning");
        setBadge(b.badge || "EMERGENCY BROADCAST");
        setIcon(b.icon || "campaign");
        setModalBgColor(b.modalBgColor || "#FFFFFF");
        setModalTextColor(b.modalTextColor || "#111827");
        setExternalUrl(b.externalUrl || "");
        setExternalUrlLabel(b.externalUrlLabel || "Learn More / Open Link");
        setVideoUrl(b.videoUrl || "");
        setAttachments(Array.isArray(b.attachments) ? b.attachments : []);
        setImages(Array.isArray(b.images) ? b.images : []);
        setUpdatedAt(b.updatedAt || "");
        setUpdatedBy(b.updatedBy || "");
      } else {
        toast.error(data.error || "Failed to load broadcast settings.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error loading emergency broadcast.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoadingSession) {
      fetchBroadcast();
    }
  }, [isLoadingSession]);

  // Keep rich editor innerHTML in sync with message state when loaded or updated
  useEffect(() => {
    if (richEditorRef.current && richEditorRef.current.innerHTML !== message) {
      richEditorRef.current.innerHTML = message;
    }
  }, [message]);

  const inlineEditorImageInputRef = useRef<HTMLInputElement | null>(null);

  // Rich text formatting helpers using native document commands (WYSIWYG Word-style)
  const applyRichFormat = (command: string, value: string | undefined = undefined) => {
    if (!richEditorRef.current) return;
    richEditorRef.current.focus();

    if (command === "createLink") {
      const url = prompt("Enter website or link URL:", "https://");
      if (!url) return;
      document.execCommand("createLink", false, url);
    } else if (command === "insertImage") {
      const choice = prompt("Type '1' to upload image file from computer/phone, or paste image URL directly:", "1");
      if (!choice) return;
      if (choice.trim() === "1") {
        inlineEditorImageInputRef.current?.click();
        return;
      } else if (choice.startsWith("http://") || choice.startsWith("https://")) {
        document.execCommand("insertImage", false, choice.trim());
      } else {
        toast.error("Invalid image URL provided.");
        return;
      }
    } else if (command === "clear") {
      richEditorRef.current.innerHTML = "";
      setMessage("");
      return;
    } else {
      document.execCommand(command, false, value);
    }

    if (richEditorRef.current) {
      setMessage(richEditorRef.current.innerHTML);
    }
  };

  // Upload inline image directly into rich editor content
  const handleInlineEditorImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setUploadProgress(0);
    try {
      const result = await uploadImageSecurely(file, "editor_inline_image", (percent) => {
        setUploadProgress(percent);
      });
      if (result.success && result.url) {
        if (richEditorRef.current) {
          richEditorRef.current.focus();
          document.execCommand("insertImage", false, result.url);
          setMessage(richEditorRef.current.innerHTML);
        }
        toast.success("Inline image inserted into editor!");
      } else {
        toast.error(result.error || "Failed to upload image.");
      }
    } catch (err: any) {
      toast.error(err.message || "Error uploading image.");
    } finally {
      setIsUploadingImage(false);
      setUploadProgress(0);
      if (inlineEditorImageInputRef.current) inlineEditorImageInputRef.current.value = "";
    }
  };

  // Image Upload Handler
  const handleUploadImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setUploadProgress(0);
    try {
      const result = await uploadImageSecurely(file, "broadcast_image", (percent) => {
        setUploadProgress(percent);
      });
      if (result.success && result.url) {
        const imageUrl: string = result.url;
        setImages((prev) => [...prev, imageUrl]);
        toast.success("Broadcast image uploaded successfully!");
      } else {
        toast.error(result.error || "Failed to upload image.");
      }
    } catch (err: any) {
      toast.error(err.message || "Error uploading image.");
    } finally {
      setIsUploadingImage(false);
      setUploadProgress(0);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    toast.info("Image removed.");
  };

  // Document Upload File Handler
  const handleUploadDocFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDoc(true);
    setUploadProgress(0);
    try {
      const result = await uploadImageSecurely(file, "broadcast_doc", (percent) => {
        setUploadProgress(percent);
      });
      if (result.success && result.url) {
        const sizeKb = file.size ? `${(file.size / 1024).toFixed(1)} KB` : "Document";
        const fileExt = file.name.split(".").pop() || "doc";
        const newDoc: EmergencyBroadcastAttachment = {
          name: file.name,
          url: result.url,
          size: sizeKb,
          type: fileExt.toLowerCase() === "pdf" ? "pdf" : "doc",
        };
        setAttachments((prev) => [...prev, newDoc]);
        toast.success("Document attached successfully!");
      } else {
        toast.error(result.error || "Failed to upload document file.");
      }
    } catch (err: any) {
      toast.error(err.message || "Error uploading document file.");
    } finally {
      setIsUploadingDoc(false);
      setUploadProgress(0);
      if (docFileInputRef.current) docFileInputRef.current.value = "";
    }
  };

  // Manual Document Link Add
  const handleAddManualDoc = () => {
    if (!newDocName.trim() || !newDocUrl.trim()) {
      toast.error("Document name and download URL are required.");
      return;
    }
    const fileExt = newDocUrl.split(".").pop()?.split("?")[0] || "doc";
    const newDoc: EmergencyBroadcastAttachment = {
      name: newDocName.trim(),
      url: newDocUrl.trim(),
      size: "File Link",
      type: fileExt.toLowerCase() === "pdf" ? "pdf" : "doc",
    };
    setAttachments((prev) => [...prev, newDoc]);
    setNewDocName("");
    setNewDocUrl("");
    toast.success("Document link attached!");
  };

  const handleRemoveAttachment = (indexToRemove: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    toast.info("Attachment removed.");
  };

  // Save Broadcast Form
  const handleSaveBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isActive && (!title.trim() || !message.trim())) {
      toast.error("Title and Message are required when broadcast is active.");
      return;
    }

    setIsSaving(true);
    toast.loading(isActive ? "Publishing broadcast live..." : "Updating broadcast settings...", { id: "save-broadcast" });

    try {
      const isMock =
        typeof window !== "undefined" &&
        (window.location.search.includes("mock=true") ||
          sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const res = await fetch("/api/admin/emergency", {
        method: "POST",
        headers,
        body: JSON.stringify({
          active: isActive,
          title,
          message,
          urgency,
          badge,
          icon,
          modalBgColor,
          modalTextColor,
          externalUrl,
          externalUrlLabel,
          videoUrl,
          attachments,
          images,
        }),
      });

      const data = await res.json();
      toast.dismiss("save-broadcast");

      if (res.ok && data.success) {
        toast.success(data.message || "Broadcast updated successfully!");
        if (data.broadcast) {
          setUpdatedAt(data.broadcast.updatedAt);
          setUpdatedBy(data.broadcast.updatedBy);
        }
      } else {
        toast.error(data.error || "Failed to update emergency broadcast.");
      }
    } catch (err: any) {
      toast.dismiss("save-broadcast");
      toast.error(err.message || "Network error saving broadcast.");
    } finally {
      setIsSaving(false);
    }
  };

  const bgClass = isDark ? "bg-[#0c0f17] text-white" : "bg-white text-gray-900";
  const panelClass = isDark
    ? "bg-[#111827] border-gray-800 text-white shadow-xs"
    : "bg-white border-gray-200 text-gray-900 shadow-xs";
  const inputClass = isDark
    ? "bg-[#1f2937] border border-gray-700 text-white placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full"
    : "bg-gray-50 border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full";

  const embedVideoData = getEmbedVideoUrl(videoUrl);

  if (isLoadingSession) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center p-6", bgClass)}>
        <div className="flex flex-col items-center gap-3">
          <ButtonSpinner />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
            Verifying Admin Access...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen p-4 md:p-8 font-hanken transition-colors duration-300", bgClass)}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className={cn("p-5 rounded-3xl border flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs", panelClass)}>
          <div className="flex items-center gap-3.5">
            <Link
              href="/cpanel"
              className={cn(
                "w-11 h-11 rounded-2xl border flex items-center justify-center transition-all shadow-xs",
                isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200"
              )}
            >
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-rose-500 text-[26px]">campaign</span>
                <h1 className="font-black text-lg md:text-xl uppercase tracking-tight text-gray-900 dark:text-white">
                  Emergency Broadcast Manager
                </h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-600")}>
                Broadcast urgent announcements, upload documents, embed videos, attach images, and customize broadcast modal colors.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className={cn("px-3.5 h-10 rounded-xl border font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs", isDark ? "bg-gray-900 border-gray-800 text-yellow-400" : "bg-gray-100 border-gray-200 text-gray-700")}
            >
              <span className="material-symbols-outlined text-[18px]">{isDark ? "light_mode" : "dark_mode"}</span>
              <span className="hidden sm:inline">{isDark ? "Light Mode" : "Dark Mode"}</span>
            </button>
            <button
              type="button"
              onClick={fetchBroadcast}
              className="px-4 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs border-0"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Live Status Toggle Card */}
        <div className={cn("p-6 rounded-3xl border space-y-4 shadow-xs", panelClass)}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <span className={cn(
                  "w-3.5 h-3.5 rounded-full animate-ping",
                  isActive ? "bg-emerald-500" : "bg-gray-400"
                )} />
                <h3 className="font-extrabold text-sm md:text-base uppercase tracking-wide">
                  Live Broadcast Status: <span className={isActive ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"}>{isActive ? "ACTIVE & LIVE ON USER DASHBOARDS" : "DISABLED"}</span>
                </h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {isActive
                  ? "Broadcast banner ticker is live at the top of all user wallet cards. Tapping it presents the full broadcast modal."
                  : "Broadcast is currently disabled and hidden from user wallet cards."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={cn(
                "px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md flex items-center gap-2 border-0 shrink-0",
                isActive
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-300"
              )}
            >
              <span className="material-symbols-outlined text-[20px]">
                {isActive ? "toggle_on" : "toggle_off"}
              </span>
              <span>{isActive ? "Disable Broadcast" : "Enable Live Broadcast"}</span>
            </button>
          </div>

          {updatedAt && (
            <p className="text-[11px] text-gray-400 font-mono">
              Last modified on {new Date(updatedAt).toLocaleString()} by {updatedBy || "System Admin"}
            </p>
          )}
        </div>

        {/* Form & Live Mobile Preview Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Broadcast Editor Form (7 cols) */}
          <div className={cn("lg:col-span-7 p-6 rounded-3xl border space-y-6 shadow-xs", panelClass)}>
            <div className="border-b border-gray-200 dark:border-gray-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base uppercase tracking-wide text-gray-900 dark:text-white">
                  Broadcast Configuration & Media Editor
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 font-bold uppercase mt-0.5">
                  Headline, message, attachments, images, video & modal background color
                </p>
              </div>
              <span className="material-symbols-outlined text-[#FC7A00] text-[24px]">edit_note</span>
            </div>

            {isLoading ? (
              <div className="py-16 text-center text-xs font-bold uppercase text-gray-400 animate-pulse space-y-2">
                <ButtonSpinner />
                <p>Loading Broadcast Settings...</p>
              </div>
            ) : (
              <form onSubmit={handleSaveBroadcast} className="space-y-5">
                {/* 1. Headline Title */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase text-gray-600 dark:text-gray-300 block">
                    Broadcast Headline / Title *
                  </label>
                  <input
                    type="text"
                    required={isActive}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Scheduled System Upgrade & Maintenance Notice"
                    className={inputClass}
                  />
                </div>

                {/* 2. Badge & Urgency Theme */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase text-gray-600 dark:text-gray-300 block">
                      Badge Label Text
                    </label>
                    <input
                      type="text"
                      value={badge}
                      onChange={(e) => setBadge(e.target.value)}
                      placeholder="e.g. EMERGENCY BROADCAST"
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black uppercase text-gray-600 dark:text-gray-300 block">
                      Urgency Theme / Card Accent
                    </label>
                    <select
                      value={urgency}
                      onChange={(e) => setUrgency(e.target.value as any)}
                      className={cn(inputClass, "cursor-pointer font-bold")}
                    >
                      <option value="warning">Warning / Alert (Orange/Amber)</option>
                      <option value="danger">Danger / Critical (Red)</option>
                      <option value="info">Information (Blue)</option>
                      <option value="emerald">Success / Update (Green)</option>
                    </select>
                  </div>
                </div>

                {/* 3. Icon Selection */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase text-gray-600 dark:text-gray-300 block">
                    Material Icon Symbol
                  </label>
                  <div className="flex items-center gap-3">
                    <select
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                      className={cn(inputClass, "cursor-pointer font-bold flex-1")}
                    >
                      <option value="campaign">campaign (Loudspeaker)</option>
                      <option value="warning">warning (Warning Triangle)</option>
                      <option value="error">error (Error Alert)</option>
                      <option value="info">info (Info Circle)</option>
                      <option value="verified">verified (Official Badge)</option>
                      <option value="build">build (Maintenance Wrench)</option>
                      <option value="notifications_active">notifications_active (Active Bell)</option>
                      <option value="security">security (Security Shield)</option>
                      <option value="payments">payments (Payments Notice)</option>
                    </select>
                    <div className="w-10 h-10 rounded-xl bg-[#FC7A00]/15 text-[#FC7A00] flex items-center justify-center shrink-0 border border-[#FC7A00]/30">
                      <span className="material-symbols-outlined text-[20px]">{icon || "campaign"}</span>
                    </div>
                  </div>
                </div>

                {/* 4. Full Broadcast Message with Visual WYSIWYG Editor */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-[11px] font-black uppercase text-gray-600 dark:text-gray-300 block">
                      Full Broadcast Information / Message *
                    </label>
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Visual Rich Text Editor</span>
                  </div>

                  {/* Hidden Input for Inline Rich Editor Image Upload */}
                  <input
                    ref={inlineEditorImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleInlineEditorImageUpload}
                    className="hidden"
                  />

                  {/* WYSIWYG Formatting Toolbar */}
                  <div className="flex flex-wrap items-center gap-1.5 p-2 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => applyRichFormat("bold")}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-xs text-gray-800 dark:text-gray-200 hover:bg-[#FC7A00] hover:text-white transition-all cursor-pointer shadow-3xs"
                      title="Bold text"
                    >
                      Bold
                    </button>
                    <button
                      type="button"
                      onClick={() => applyRichFormat("italic")}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 italic font-bold text-xs text-gray-800 dark:text-gray-200 hover:bg-[#FC7A00] hover:text-white transition-all cursor-pointer shadow-3xs"
                      title="Italic text"
                    >
                      Italic
                    </button>
                    <button
                      type="button"
                      onClick={() => applyRichFormat("underline")}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 underline font-bold text-xs text-gray-800 dark:text-gray-200 hover:bg-[#FC7A00] hover:text-white transition-all cursor-pointer shadow-3xs"
                      title="Underline text"
                    >
                      Underline
                    </button>
                    <button
                      type="button"
                      onClick={() => applyRichFormat("formatBlock", "<h3>")}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-extrabold text-xs text-gray-800 dark:text-gray-200 hover:bg-[#FC7A00] hover:text-white transition-all cursor-pointer shadow-3xs"
                      title="Heading"
                    >
                      Heading
                    </button>
                    <button
                      type="button"
                      onClick={() => applyRichFormat("insertUnorderedList")}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-xs text-gray-800 dark:text-gray-200 hover:bg-[#FC7A00] hover:text-white transition-all cursor-pointer flex items-center gap-1 shadow-3xs"
                      title="Bullet List"
                    >
                      <span className="material-symbols-outlined text-[14px]">format_list_bulleted</span>
                      <span>Bullets</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyRichFormat("insertOrderedList")}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-xs text-gray-800 dark:text-gray-200 hover:bg-[#FC7A00] hover:text-white transition-all cursor-pointer flex items-center gap-1 shadow-3xs"
                      title="Numbered List"
                    >
                      <span className="material-symbols-outlined text-[14px]">format_list_numbered</span>
                      <span>Numbered</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyRichFormat("createLink")}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-xs text-gray-800 dark:text-gray-200 hover:bg-[#FC7A00] hover:text-white transition-all cursor-pointer flex items-center gap-1 shadow-3xs"
                      title="Insert Link"
                    >
                      <span className="material-symbols-outlined text-[14px]">link</span>
                      <span>Link</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyRichFormat("insertImage")}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-xs text-gray-800 dark:text-gray-200 hover:bg-[#FC7A00] hover:text-white transition-all cursor-pointer flex items-center gap-1 shadow-3xs"
                      title="Import Image inside text"
                    >
                      <span className="material-symbols-outlined text-[14px]">image</span>
                      <span>Image</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyRichFormat("clear")}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 font-bold text-xs hover:bg-red-500 hover:text-white transition-all cursor-pointer ml-auto shadow-3xs"
                      title="Clear content"
                    >
                      Clear
                    </button>
                  </div>

                  {/* Visual ContentEditable Word-style Rich Editor */}
                  <div
                    ref={richEditorRef}
                    contentEditable={true}
                    suppressContentEditableWarning={true}
                    onInput={(e) => setMessage((e.target as HTMLDivElement).innerHTML)}
                    onBlur={(e) => setMessage((e.target as HTMLDivElement).innerHTML)}
                    className={cn(
                      "w-full p-4 rounded-2xl text-xs font-medium outline-none min-h-[160px] overflow-y-auto prose dark:prose-invert max-w-none transition-all",
                      inputClass
                    )}
                  />
                </div>

                {/* 5. Broadcast Modal Background Color Customizer */}
                <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-xs uppercase tracking-wide text-gray-900 dark:text-white">
                        Full Broadcast Modal Theme & Background Color
                      </h4>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                        Default background is White (#FFFFFF). Customize background and text colors.
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-gray-400 text-[20px]">palette</span>
                  </div>

                  {/* Preset Color Chips */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                    {MODAL_BG_PRESETS.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setModalBgColor(p.bg);
                          setModalTextColor(p.text);
                        }}
                        className={cn(
                          "p-2 rounded-xl border flex flex-col items-center justify-center gap-1 text-[10px] font-bold transition-all cursor-pointer shadow-xs",
                          modalBgColor.toUpperCase() === p.bg.toUpperCase()
                            ? "border-[#FC7A00] ring-2 ring-[#FC7A00]/30 scale-105"
                            : "border-gray-300 dark:border-gray-700"
                        )}
                        style={{ backgroundColor: p.bg, color: p.text }}
                      >
                        <span className="truncate w-full text-center">{p.label}</span>
                        <span className="text-[9px] opacity-70 font-mono">{p.bg}</span>
                      </button>
                    ))}
                  </div>

                  {/* Custom Hex Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-200 dark:border-gray-800">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-gray-500 block">
                        Modal Background Hex Color
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={modalBgColor}
                          onChange={(e) => setModalBgColor(e.target.value)}
                          className="w-10 h-10 rounded-xl cursor-pointer border border-gray-300 p-0.5 shrink-0"
                        />
                        <input
                          type="text"
                          value={modalBgColor}
                          onChange={(e) => setModalBgColor(e.target.value)}
                          placeholder="#FFFFFF"
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-gray-500 block">
                        Modal Text Hex Color
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={modalTextColor}
                          onChange={(e) => setModalTextColor(e.target.value)}
                          className="w-10 h-10 rounded-xl cursor-pointer border border-gray-300 p-0.5 shrink-0"
                        />
                        <input
                          type="text"
                          value={modalTextColor}
                          onChange={(e) => setModalTextColor(e.target.value)}
                          placeholder="#111827"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 6. Attached Images & Photos */}
                <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 space-y-3 bg-gray-50/50 dark:bg-gray-900/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-xs uppercase tracking-wide text-gray-900 dark:text-white">
                        Attached Images & Photo Gallery
                      </h4>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                        Upload images or banner photos to display inside the broadcast modal.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={isUploadingImage}
                      className="px-3 py-1.5 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs border-0"
                    >
                      <span className="material-symbols-outlined text-[16px]">add_photo_alternate</span>
                      <span>Upload Image</span>
                    </button>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleUploadImageFile}
                      className="hidden"
                    />
                  </div>

                  <UploadProgressBar progress={uploadProgress} label="Uploading Image..." isUploading={isUploadingImage} />

                  {images.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                      {images.map((url, idx) => (
                        <div key={idx} className="relative aspect-video rounded-xl overflow-hidden border border-gray-300 dark:border-gray-700 bg-gray-100 group">
                          <img src={url} alt={`Upload ${idx}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(idx)}
                            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center shadow-md hover:bg-red-700 cursor-pointer"
                            title="Remove image"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-400 italic font-medium pt-1">No images attached yet.</p>
                  )}
                </div>

                {/* 7. Attached Documents & Files */}
                <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 space-y-3 bg-gray-50/50 dark:bg-gray-900/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-xs uppercase tracking-wide text-gray-900 dark:text-white">
                        Attached Documents & File Downloads
                      </h4>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                        Upload or link PDF/DOC documents for users to download.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => docFileInputRef.current?.click()}
                      disabled={isUploadingDoc}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs border-0"
                    >
                      <span className="material-symbols-outlined text-[16px]">upload_file</span>
                      <span>Upload File</span>
                    </button>
                    <input
                      ref={docFileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.txt,.zip"
                      onChange={handleUploadDocFile}
                      className="hidden"
                    />
                  </div>

                  <UploadProgressBar progress={uploadProgress} label="Uploading Document..." isUploading={isUploadingDoc} />

                  {/* Manual File URL input */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
                    <input
                      type="text"
                      value={newDocName}
                      onChange={(e) => setNewDocName(e.target.value)}
                      placeholder="Document Name (e.g. Terms PDF)"
                      className={cn(inputClass, "sm:col-span-5")}
                    />
                    <input
                      type="text"
                      value={newDocUrl}
                      onChange={(e) => setNewDocUrl(e.target.value)}
                      placeholder="Document Download URL (https://...)"
                      className={cn(inputClass, "sm:col-span-5")}
                    />
                    <button
                      type="button"
                      onClick={handleAddManualDoc}
                      className="sm:col-span-2 px-3 h-10 bg-gray-800 hover:bg-gray-900 text-white rounded-xl text-xs font-bold uppercase transition-all cursor-pointer border-0"
                    >
                      Add
                    </button>
                  </div>

                  {/* Attachment Directory List */}
                  {attachments.length > 0 ? (
                    <div className="space-y-2 pt-2">
                      {attachments.map((doc, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between gap-3 shadow-3xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="material-symbols-outlined text-rose-500 text-[20px]">description</span>
                            <div className="min-w-0 flex-1">
                              <p className="font-extrabold text-xs truncate text-gray-900 dark:text-white">{doc.name}</p>
                              <p className="text-[10px] text-gray-400 font-mono truncate">{doc.url}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(idx)}
                            className="w-7 h-7 rounded-full bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all cursor-pointer border-0 shrink-0"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-400 italic font-medium pt-1">No documents attached yet.</p>
                  )}
                </div>

                {/* 8. Video Embed URL & External Link */}
                <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 space-y-3 bg-gray-50/50 dark:bg-gray-900/50">
                  <h4 className="font-extrabold text-xs uppercase tracking-wide text-gray-900 dark:text-white">
                    Embedded Video & External Link
                  </h4>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-gray-500 block">
                      Embedded Video URL (YouTube / Vimeo / MP4 Link)
                    </label>
                    <input
                      type="text"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="e.g. https://www.youtube.com/watch?v=VIDEO_ID or https://domain.com/video.mp4"
                      className={inputClass}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-gray-500 block">
                        External Action Link URL
                      </label>
                      <input
                        type="text"
                        value={externalUrl}
                        onChange={(e) => setExternalUrl(e.target.value)}
                        placeholder="https://example.com/update"
                        className={inputClass}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-gray-500 block">
                        Action Button Label
                      </label>
                      <input
                        type="text"
                        value={externalUrlLabel}
                        onChange={(e) => setExternalUrlLabel(e.target.value)}
                        placeholder="Learn More / Open Link"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Action Button */}
                <div className="pt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full sm:w-auto px-8 py-4 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md active:scale-95 border-0 flex items-center justify-center gap-2"
                  >
                    {isSaving ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[20px]">campaign</span>}
                    <span>Save & Publish Emergency Broadcast</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Right Column: Live Interactive Mobile Preview (5 cols) */}
          <div className={cn("lg:col-span-5 p-6 rounded-3xl border space-y-5 shadow-xs sticky top-6", panelClass)}>
            <div className="border-b border-gray-200 dark:border-gray-800 pb-3 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wide text-gray-900 dark:text-white">
                  Live Interactive Preview
                </h3>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase mt-0.5">
                  Real-time preview on user devices
                </p>
              </div>

              {/* View Switcher */}
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setPreviewTab("banner")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer border-0",
                    previewTab === "banner"
                      ? "bg-[#FC7A00] text-white shadow-xs"
                      : "text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
                  )}
                >
                  Banner Ticker
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab("modal")}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer border-0",
                    previewTab === "modal"
                      ? "bg-[#FC7A00] text-white shadow-xs"
                      : "text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
                  )}
                >
                  Full Modal
                </button>
              </div>
            </div>

            {previewTab === "banner" ? (
              /* Wallet Ticker Banner Preview */
              <div className="space-y-4 p-4 rounded-3xl bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 text-center">
                  Top of Wallet Balance Card
                </p>

                {/* Ticker Banner */}
                <div
                  onClick={() => setPreviewTab("modal")}
                  className={cn(
                    "p-3 rounded-2xl border flex items-center justify-between gap-2.5 transition-all shadow-xs cursor-pointer select-none",
                    urgency === "danger"
                      ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"
                      : urgency === "warning"
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-400"
                      : urgency === "emerald"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-400"
                      : "bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-400"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-full bg-current/15 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px] font-bold animate-pulse">{icon || "campaign"}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-current/20 text-current shrink-0">
                          {badge || "NOTICE"}
                        </span>
                        <h4 className="font-extrabold text-xs truncate text-black dark:text-white">
                          {title || "Broadcast Headline"}
                        </h4>
                      </div>
                      <p className="text-[10.5px] font-medium text-gray-600 dark:text-gray-300 truncate mt-0.5">
                        {message ? message.replace(/<[^>]*>?/gm, "") : "Broadcast message snippet..."}
                      </p>
                    </div>
                  </div>

                  <span className="material-symbols-outlined text-[18px] text-gray-400 shrink-0">chevron_right</span>
                </div>

                {/* Mock Wallet Card */}
                <div className="aspect-[1.586/1] w-full rounded-2xl bg-gradient-to-br from-[#0c1324] to-[#1e293b] p-4 text-white flex flex-col justify-between shadow-md">
                  <div className="flex justify-between items-center text-[10px] text-gray-300 font-bold uppercase tracking-wider">
                    <span>Available Balance</span>
                    <span className="px-2 py-0.5 bg-white/10 rounded">Tier 3 VIP</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-black font-mono">₦1,250,000.00</h2>
                    <p className="text-[9px] text-emerald-400 font-bold mt-0.5">Reward Bonus: ₦1,000.00</p>
                  </div>
                  <div className="flex justify-between items-end text-[10px]">
                    <div>
                      <span className="text-[8px] text-gray-400 block uppercase">Account Holder</span>
                      <strong className="font-extrabold">ABDULKADIR SHABA</strong>
                    </div>
                    <span className="font-mono font-bold bg-white/10 px-2 py-0.5 rounded">NGN</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Full Broadcast Modal Preview */
              <div
                className="rounded-3xl p-5 border shadow-xl space-y-4 overflow-y-auto max-h-[600px] text-left transition-all"
                style={{ backgroundColor: modalBgColor, color: modalTextColor }}
              >
                <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px]">{icon || "campaign"}</span>
                    <span className="font-extrabold text-xs uppercase">{badge || "BROADCAST"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewTab("banner")}
                    className="w-7 h-7 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-xs"
                  >
                    ✕
                  </button>
                </div>

                {/* Headline */}
                <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 space-y-1">
                  <span className="text-[9px] font-black uppercase opacity-60">Official Announcement</span>
                  <h3 className="font-extrabold text-sm">{title || "Headline Title"}</h3>
                </div>

                {/* Message Body */}
                <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 space-y-2 text-xs font-medium leading-relaxed">
                  <span className="text-[9px] font-black uppercase opacity-60 block">Message Body</span>
                  {message ? (
                    <div
                      className="prose dark:prose-invert max-w-none text-xs font-medium leading-relaxed space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_a]:text-[#FC7A00] [&_a]:underline [&_h3]:text-sm [&_h3]:font-extrabold [&_img]:max-w-full [&_img]:rounded-xl [&_img]:my-2"
                      dangerouslySetInnerHTML={{ __html: message }}
                    />
                  ) : (
                    <p className="italic opacity-60">Write broadcast text message above...</p>
                  )}
                </div>

                {/* Attached Images */}
                {images.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-black uppercase opacity-60 block">Attached Images ({images.length})</span>
                    <div className="grid grid-cols-2 gap-2">
                      {images.map((img, i) => (
                        <div key={i} className="aspect-video rounded-xl overflow-hidden bg-black/10">
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Embedded Video */}
                {embedVideoData.embedUrl && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-black uppercase opacity-60 block">Embedded Video</span>
                    <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black">
                      {embedVideoData.isDirectVideo ? (
                        <video controls className="w-full h-full object-contain" src={embedVideoData.embedUrl} />
                      ) : (
                        <iframe src={embedVideoData.embedUrl} title="Video" className="w-full h-full border-0" />
                      )}
                    </div>
                  </div>
                )}

                {/* Attached Documents */}
                {attachments.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-black uppercase opacity-60 block">Downloadable Documents ({attachments.length})</span>
                    <div className="space-y-1.5">
                      {attachments.map((doc, i) => (
                        <div key={i} className="p-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 flex items-center justify-between text-xs">
                          <span className="truncate font-bold">{doc.name}</span>
                          <span className="material-symbols-outlined text-[16px]">download</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Link Button */}
                {externalUrl && (
                  <div className="pt-1">
                    <div className="w-full py-3 bg-[#FC7A00] text-white rounded-xl text-center text-xs font-black uppercase tracking-wider">
                      {externalUrlLabel || "Learn More"}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CpanelEmergencyPage() {
  return (
    <CpanelRouteGuard requiredPermission="settings.manage">
      <CpanelEmergencyPageContent />
    </CpanelRouteGuard>
  );
}
