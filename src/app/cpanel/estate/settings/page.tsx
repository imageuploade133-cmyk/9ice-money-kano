"use client";

import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { cn } from "@/lib/utils";
import { uploadImageSecurely } from "@/lib/image-upload";
import { UploadProgressBar } from "@/components/UploadProgressBar";

export default function CpanelEstateSettingsPage() {
  const { isDark } = useCpanelTheme();

  const [estateLogoUrl, setEstateLogoUrl] = useState("");
  const [estateTitle, setEstateTitle] = useState("E-Global Estate");
  const [estateSubtitle, setEstateSubtitle] = useState("Houses, Apartments & Land");
  const [estateTitleColor, setEstateTitleColor] = useState("#000000");
  const [estateSubtitleColor, setEstateSubtitleColor] = useState("#FC7A00");
  const [autoApproveListings, setAutoApproveListings] = useState(false);
  const [requireAgentKYC, setRequireAgentKYC] = useState(true);
  const [maxActiveListingsPerAgent, setMaxActiveListingsPerAgent] = useState("20");
  const [platformCommissionPercent, setPlatformCommissionPercent] = useState("2.5");
  const [maxTitleLength, setMaxTitleLength] = useState("100");
  const [hidePropertyIcons, setHidePropertyIcons] = useState(false);
  const [enableVoiceNotes, setEnableVoiceNotes] = useState(true);
  const [enableAutoResponses, setEnableAutoResponses] = useState(true);
  const [enableChat, setEnableChat] = useState(true);
  const [enableCalls, setEnableCalls] = useState(true);
  const [enableShare, setEnableShare] = useState(true);
  const [enableReport, setEnableReport] = useState(true);
  const [enableCardBorder, setEnableCardBorder] = useState(true);
  const [cardBorderStyle, setCardBorderStyle] = useState<"gradient" | "solid" | "none">("gradient");
  const [cardBorderColor, setCardBorderColor] = useState("#FC7A00");
  const [chatSecurityNoticeUser, setChatSecurityNoticeUser] = useState("");
  const [chatSecurityNoticeAgent, setChatSecurityNoticeAgent] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState(0);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    setLogoUploadProgress(5);
    try {
      const res = await uploadImageSecurely(file, "estate_logo", (percent) => {
        setLogoUploadProgress(percent);
      });
      if (res.success && res.url) {
        setEstateLogoUrl(res.url);
        toast.success("E-Global Estate Logo uploaded successfully!");
      } else {
        toast.error(res.error || "Failed to upload logo.");
      }
    } catch {
      toast.error("Error uploading logo image.");
    } finally {
      setTimeout(() => {
        setIsUploadingLogo(false);
        setLogoUploadProgress(0);
      }, 400);
    }
  };

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/estate/admin/settings");
      const data = await res.json();
      if (data.success && data.settings) {
        const s = data.settings;
        setEstateLogoUrl(s.estateLogoUrl || "");
        setEstateTitle(s.estateTitle || "E-Global Estate");
        setEstateSubtitle(s.estateSubtitle || "Houses, Apartments & Land");
        setEstateTitleColor(s.estateTitleColor || "#000000");
        setEstateSubtitleColor(s.estateSubtitleColor || "#FC7A00");
        setAutoApproveListings(Boolean(s.autoApproveListings));
        setRequireAgentKYC(Boolean(s.requireAgentKYC));
        setMaxActiveListingsPerAgent(String(s.maxActiveListingsPerAgent || 20));
        setPlatformCommissionPercent(String(s.platformCommissionPercent || 2.5));
        setMaxTitleLength(String(s.maxTitleLength || 100));
        setHidePropertyIcons(Boolean(s.hidePropertyIcons));
        setEnableVoiceNotes(s.enableVoiceNotes !== false);
        setEnableAutoResponses(s.enableAutoResponses !== false);
        setEnableChat(s.enableChat !== false);
        setEnableCalls(s.enableCalls !== false);
        setEnableShare(s.enableShare !== false);
        setEnableReport(s.enableReport !== false);
        setEnableCardBorder(s.enableCardBorder !== false);
        setCardBorderStyle(s.cardBorderStyle === "solid" ? "solid" : s.cardBorderStyle === "none" ? "none" : "gradient");
        setCardBorderColor(s.cardBorderColor || "#FC7A00");
        setChatSecurityNoticeUser(s.chatSecurityNoticeUser || "");
        setChatSecurityNoticeAgent(s.chatSecurityNoticeAgent || "");
      }
    } catch {
      toast.error("Failed to load property settings.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/estate/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estateLogoUrl,
          estateTitle,
          estateSubtitle,
          estateTitleColor,
          estateSubtitleColor,
          autoApproveListings,
          requireAgentKYC,
          maxActiveListingsPerAgent: Number(maxActiveListingsPerAgent) || 20,
          platformCommissionPercent: Number(platformCommissionPercent) || 0,
          maxTitleLength: Number(maxTitleLength) || 100,
          hidePropertyIcons,
          enableVoiceNotes,
          enableAutoResponses,
          enableChat,
          enableCalls,
          enableShare,
          enableReport,
          enableCardBorder,
          cardBorderStyle,
          cardBorderColor,
          chatSecurityNoticeUser,
          chatSecurityNoticeAgent,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(data.message || "Property marketplace settings saved!");
      } else {
        toast.error(data.error || "Failed to save settings.");
      }
    } catch {
      toast.error("Error communicating with server.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn("p-4 sm:p-8 max-w-5xl mx-auto space-y-6 font-hanken text-black", isDark && "text-white")}>
      {/* Sticky Header */}
      <div className="flex items-center justify-between border-b pb-4 border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-[#FC7A00] flex items-center justify-center">
            <span className="material-symbols-outlined text-[24px]">settings</span>
          </div>
          <div>
            <h1 className="font-bodoni font-bold text-xl sm:text-2xl tracking-tight leading-none">
              Property Marketplace Settings
            </h1>
            <p className="text-xs text-gray-500 font-medium mt-1">
              Configure marketplace policies, publishing limits, and chat security disclaimers
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchSettings}
          disabled={isLoading}
          className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-xs font-bold text-gray-800 dark:text-gray-200 cursor-pointer border-0 transition-all active:scale-95 disabled:opacity-50"
        >
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-xs font-bold text-gray-400 animate-pulse">
          Loading Property Settings...
        </div>
      ) : (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* Section 1: Publishing & Approval Rules */}
          <div className={cn("p-5 sm:p-6 rounded-3xl border space-y-4 shadow-xs", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200")}>
            <div className="flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
              <span className="material-symbols-outlined text-[#FC7A00] text-[20px]">published_with_changes</span>
              <h3 className="font-extrabold text-sm uppercase tracking-wide">Publishing & Verification Controls</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={cn("p-4 rounded-2xl border flex items-center justify-between", isDark ? "bg-gray-950 border-gray-800" : "bg-gray-50 border-gray-200")}>
                <div>
                  <span className="text-xs font-bold block">Auto-Approve Property Listings</span>
                  <span className="text-[10.5px] text-gray-500 font-medium block">
                    Automatically publish new listings without manual admin review queue
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoApproveListings(!autoApproveListings)}
                  className={cn("px-3 py-1.5 rounded-xl text-xs font-black uppercase border-0 cursor-pointer transition-all", autoApproveListings ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-700")}
                >
                  {autoApproveListings ? "ON" : "OFF"}
                </button>
              </div>

              <div className={cn("p-4 rounded-2xl border flex items-center justify-between", isDark ? "bg-gray-950 border-gray-800" : "bg-gray-50 border-gray-200")}>
                <div>
                  <span className="text-xs font-bold block">Require Verified Agent Identity</span>
                  <span className="text-[10.5px] text-gray-500 font-medium block">
                    Require agent profile verification before permitting property publishing
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setRequireAgentKYC(!requireAgentKYC)}
                  className={cn("px-3 py-1.5 rounded-xl text-xs font-black uppercase border-0 cursor-pointer transition-all", requireAgentKYC ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-700")}
                >
                  {requireAgentKYC ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-[10.5px] font-black uppercase text-gray-500 block mb-1.5 tracking-wider">
                  Max Active Listings Per Agent
                </label>
                <input
                  type="number"
                  required
                  value={maxActiveListingsPerAgent}
                  onChange={(e) => setMaxActiveListingsPerAgent(e.target.value)}
                  className="w-full p-3.5 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-2xl font-bold text-xs outline-none focus:border-[#FC7A00]"
                />
              </div>

              <div>
                <label className="text-[10.5px] font-black uppercase text-gray-500 block mb-1.5 tracking-wider">
                  Platform Marketplace Commission (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={platformCommissionPercent}
                  onChange={(e) => setPlatformCommissionPercent(e.target.value)}
                  className="w-full p-3.5 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-2xl font-bold text-xs outline-none focus:border-[#FC7A00]"
                />
              </div>
            </div>

            {/* Title Length & Feature Icon Visibility Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-[10.5px] font-black uppercase text-gray-500 block mb-1.5 tracking-wider">
                  Max Title Length (Characters)
                </label>
                <input
                  type="number"
                  min={10}
                  max={200}
                  required
                  value={maxTitleLength}
                  onChange={(e) => setMaxTitleLength(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full p-3.5 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-2xl font-bold text-xs outline-none focus:border-[#FC7A00]"
                />
                <span className="text-[10px] text-gray-500 font-medium mt-1 block">
                  Limits the maximum number of text characters agents can enter when titling properties.
                </span>
              </div>

              <div className={cn("p-4 rounded-2xl border flex items-center justify-between self-start mt-0.5", isDark ? "bg-gray-950 border-gray-800" : "bg-gray-50 border-gray-200")}>
                <div>
                  <span className="text-xs font-bold block">Hide Property Feature Icons</span>
                  <span className="text-[10.5px] text-gray-500 font-medium block">
                    ON/OFF switch to hide bedroom/bathroom/size icon badges on property cards
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setHidePropertyIcons(!hidePropertyIcons)}
                  className={cn("px-3.5 py-1.5 rounded-xl text-xs font-black uppercase border-0 cursor-pointer transition-all", hidePropertyIcons ? "bg-amber-600 text-white" : "bg-gray-200 text-gray-700")}
                >
                  {hidePropertyIcons ? "ON (HIDDEN)" : "OFF (VISIBLE)"}
                </button>
              </div>
            </div>
          </div>

          {/* Section 0: E-Global Estate Logo & Branding Customization */}
          <div className={cn("p-5 sm:p-6 rounded-3xl border space-y-4 shadow-xs", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200")}>
            <div className="flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
              <span className="material-symbols-outlined text-[#FC7A00] text-[20px]">palette</span>
              <h3 className="font-extrabold text-sm uppercase tracking-wide">E-Global Estate Branding & Header Customization</h3>
            </div>

            <UploadProgressBar
              isUploading={isUploadingLogo}
              progress={logoUploadProgress}
              label="Uploading Marketplace Logo..."
            />

            <div className="flex flex-col sm:flex-row items-center gap-4 border-b pb-4 border-gray-100 dark:border-gray-800">
              <div className="w-20 h-20 rounded-2xl border-2 border-[#FC7A00] overflow-hidden bg-white flex items-center justify-center relative shadow-xs flex-shrink-0">
                {estateLogoUrl ? (
                  <img src={estateLogoUrl} alt="Estate Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <span className="material-symbols-outlined text-[36px] text-gray-300">domain</span>
                )}
              </div>

              <div className="space-y-2 flex-1 text-center sm:text-left">
                <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Custom Marketplace Logo</p>
                <p className="text-[10.5px] text-gray-500 font-medium">
                  Upload a custom brand logo image to display on the E-Global Estate header and public marketplace.
                </p>

                <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={isUploadingLogo}
                    className="px-4 py-2 bg-[#FC7A00] hover:bg-[#e06600] text-white text-xs font-black uppercase rounded-xl border-0 cursor-pointer shadow-2xs transition-all disabled:opacity-50"
                  >
                    {isUploadingLogo ? "Uploading..." : estateLogoUrl ? "Change Logo" : "Upload Logo"}
                  </button>
                  {estateLogoUrl && (
                    <button
                      type="button"
                      onClick={() => setEstateLogoUrl("")}
                      className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold uppercase rounded-xl border-0 cursor-pointer transition-all"
                    >
                      Reset Default
                    </button>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </div>
              </div>
            </div>

            {/* Custom Header Title & Subtitle + Text Colors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10.5px] font-black uppercase text-gray-500 block mb-1.5 tracking-wider">
                  Header Main Title
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={estateTitle}
                    onChange={(e) => setEstateTitle(e.target.value)}
                    className="flex-1 p-3.5 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-2xl font-bold text-xs outline-none focus:border-[#FC7A00]"
                  />
                  <input
                    type="color"
                    value={estateTitleColor}
                    onChange={(e) => setEstateTitleColor(e.target.value)}
                    className="w-12 h-12 p-1 rounded-2xl border border-gray-300 dark:border-gray-800 cursor-pointer bg-white"
                    title="Select Title Color"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10.5px] font-black uppercase text-gray-500 block mb-1.5 tracking-wider">
                  Header Subtitle / Tagline
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={estateSubtitle}
                    onChange={(e) => setEstateSubtitle(e.target.value)}
                    className="flex-1 p-3.5 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-2xl font-bold text-xs outline-none focus:border-[#FC7A00]"
                  />
                  <input
                    type="color"
                    value={estateSubtitleColor}
                    onChange={(e) => setEstateSubtitleColor(e.target.value)}
                    className="w-12 h-12 p-1 rounded-2xl border border-gray-300 dark:border-gray-800 cursor-pointer bg-white"
                    title="Select Subtitle Color"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Communication & Voice Note Controls */}
          <div className={cn("p-5 sm:p-6 rounded-3xl border space-y-4 shadow-xs", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200")}>
            <div className="flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
              <span className="material-symbols-outlined text-[#FC7A00] text-[20px]">forum</span>
              <h3 className="font-extrabold text-sm uppercase tracking-wide">Communication & Contact Feature Switches</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={cn("p-4 rounded-2xl border flex items-center justify-between", isDark ? "bg-gray-950 border-gray-800" : "bg-gray-50 border-gray-200")}>
                <div>
                  <span className="text-xs font-bold block">Inquiry Chat Messaging</span>
                  <span className="text-[10.5px] text-gray-500 font-medium block">
                    Global ON/OFF switch to show or hide the Chat button and enable or disable direct chat messaging
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableChat(!enableChat)}
                  className={cn("px-3 py-1.5 rounded-xl text-xs font-black uppercase border-0 cursor-pointer transition-all", enableChat ? "bg-emerald-600 text-white" : "bg-red-600 text-white")}
                >
                  {enableChat ? "ENABLED" : "DISABLED"}
                </button>
              </div>

              <div className={cn("p-4 rounded-2xl border flex items-center justify-between", isDark ? "bg-gray-950 border-gray-800" : "bg-gray-50 border-gray-200")}>
                <div>
                  <span className="text-xs font-bold block">Direct Phone & WhatsApp Calling</span>
                  <span className="text-[10.5px] text-gray-500 font-medium block">
                    Global ON/OFF switch for agent phone call and WhatsApp contact buttons
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableCalls(!enableCalls)}
                  className={cn("px-3 py-1.5 rounded-xl text-xs font-black uppercase border-0 cursor-pointer transition-all", enableCalls ? "bg-emerald-600 text-white" : "bg-red-600 text-white")}
                >
                  {enableCalls ? "ENABLED" : "DISABLED"}
                </button>
              </div>

              <div className={cn("p-4 rounded-2xl border flex items-center justify-between", isDark ? "bg-gray-950 border-gray-800" : "bg-gray-50 border-gray-200")}>
                <div>
                  <span className="text-xs font-bold block">Property Page Share Button</span>
                  <span className="text-[10.5px] text-gray-500 font-medium block">
                    Global ON/OFF switch to show or hide the Share button on property detail pages
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableShare(!enableShare)}
                  className={cn("px-3 py-1.5 rounded-xl text-xs font-black uppercase border-0 cursor-pointer transition-all", enableShare ? "bg-emerald-600 text-white" : "bg-red-600 text-white")}
                >
                  {enableShare ? "ENABLED" : "DISABLED"}
                </button>
              </div>

              <div className={cn("p-4 rounded-2xl border flex items-center justify-between", isDark ? "bg-gray-950 border-gray-800" : "bg-gray-50 border-gray-200")}>
                <div>
                  <span className="text-xs font-bold block">Property Page Report Button</span>
                  <span className="text-[10.5px] text-gray-500 font-medium block">
                    Global ON/OFF switch to show or hide the Report Flag button on property detail pages
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableReport(!enableReport)}
                  className={cn("px-3 py-1.5 rounded-xl text-xs font-black uppercase border-0 cursor-pointer transition-all", enableReport ? "bg-emerald-600 text-white" : "bg-red-600 text-white")}
                >
                  {enableReport ? "ENABLED" : "DISABLED"}
                </button>
              </div>

              <div className={cn("p-4 rounded-2xl border flex items-center justify-between", isDark ? "bg-gray-950 border-gray-800" : "bg-gray-50 border-gray-200")}>
                <div>
                  <span className="text-xs font-bold block">50s Encrypted Voice Notes</span>
                  <span className="text-[10.5px] text-gray-500 font-medium block">
                    Allow buyers & agents to record and exchange 50s voice notes in chat
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableVoiceNotes(!enableVoiceNotes)}
                  className={cn("px-3 py-1.5 rounded-xl text-xs font-black uppercase border-0 cursor-pointer transition-all", enableVoiceNotes ? "bg-emerald-600 text-white" : "bg-red-600 text-white")}
                >
                  {enableVoiceNotes ? "ENABLED" : "DISABLED"}
                </button>
              </div>

              <div className={cn("p-4 rounded-2xl border flex items-center justify-between", isDark ? "bg-gray-950 border-gray-800" : "bg-gray-50 border-gray-200")}>
                <div>
                  <span className="text-xs font-bold block">Agent Automated Chat Auto-Responses</span>
                  <span className="text-[10.5px] text-gray-500 font-medium block">
                    Allow agent custom auto-responses to dispatch on customer inquiries
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableAutoResponses(!enableAutoResponses)}
                  className={cn("px-3 py-1.5 rounded-xl text-xs font-black uppercase border-0 cursor-pointer transition-all", enableAutoResponses ? "bg-emerald-600 text-white" : "bg-red-600 text-white")}
                >
                  {enableAutoResponses ? "ENABLED" : "DISABLED"}
                </button>
              </div>
            </div>
          </div>

          {/* Section 2.5: Card & Section Border Style Controls */}
          <div className={cn("p-5 sm:p-6 rounded-3xl border space-y-4 shadow-xs", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200")}>
            <div className="flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
              <span className="material-symbols-outlined text-[#FC7A00] text-[20px]">crop_square</span>
              <h3 className="font-extrabold text-sm uppercase tracking-wide">Card & Section Border Styling</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={cn("p-4 rounded-2xl border flex items-center justify-between", isDark ? "bg-gray-950 border-gray-800" : "bg-gray-50 border-gray-200")}>
                <div>
                  <span className="text-xs font-bold block">Card Borders (Cof / Uncoff)</span>
                  <span className="text-[10.5px] text-gray-500 font-medium block">
                    ON/OFF toggle to enable (Cof) or disable (Uncoff) outer borders on property cards
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableCardBorder(!enableCardBorder)}
                  className={cn("px-3.5 py-1.5 rounded-xl text-xs font-black uppercase border-0 cursor-pointer transition-all", enableCardBorder ? "bg-emerald-600 text-white" : "bg-red-600 text-white")}
                >
                  {enableCardBorder ? "ENABLED (COFFED)" : "DISABLED (UNCOFFED)"}
                </button>
              </div>

              <div className={cn("p-4 rounded-2xl border flex items-center justify-between", isDark ? "bg-gray-950 border-gray-800" : "bg-gray-50 border-gray-200")}>
                <div>
                  <span className="text-xs font-bold block">Border Type / Style</span>
                  <span className="text-[10.5px] text-gray-500 font-medium block">
                    Choose between Gradient border, Solid border color, or Borderless
                  </span>
                </div>
                <select
                  value={cardBorderStyle}
                  onChange={(e) => setCardBorderStyle(e.target.value as any)}
                  className="p-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl font-black text-xs outline-none cursor-pointer"
                >
                  <option value="gradient">Gradient Border</option>
                  <option value="solid">Solid Color Border</option>
                  <option value="none">Borderless (Clean)</option>
                </select>
              </div>
            </div>

            {cardBorderStyle === "solid" && (
              <div className="pt-2">
                <label className="text-[10.5px] font-black uppercase text-gray-500 block mb-1.5 tracking-wider">
                  Solid Border Color Picker
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={cardBorderColor}
                    onChange={(e) => setCardBorderColor(e.target.value)}
                    className="w-12 h-12 p-1 rounded-2xl border border-gray-300 dark:border-gray-800 cursor-pointer bg-white"
                  />
                  <input
                    type="text"
                    value={cardBorderColor}
                    onChange={(e) => setCardBorderColor(e.target.value)}
                    className="p-3 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-2xl font-mono font-bold text-xs uppercase"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Chat Security Disclaimer Notices */}
          <div className={cn("p-5 sm:p-6 rounded-3xl border space-y-4 shadow-xs", isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200")}>
            <div className="flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
              <span className="material-symbols-outlined text-amber-500 text-[20px]">shield_lock</span>
              <h3 className="font-extrabold text-sm uppercase tracking-wide">Pre-Chat Security Warning Disclaimers</h3>
            </div>

            <div>
              <label className="text-[10.5px] font-black uppercase text-gray-500 block mb-1.5 tracking-wider">
                User / Buyer Security Notice Message
              </label>
              <textarea
                rows={3}
                value={chatSecurityNoticeUser}
                onChange={(e) => setChatSecurityNoticeUser(e.target.value)}
                className="w-full p-3.5 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-2xl font-medium text-xs outline-none focus:border-[#FC7A00] resize-none"
              />
            </div>

            <div>
              <label className="text-[10.5px] font-black uppercase text-gray-500 block mb-1.5 tracking-wider">
                Agent / Publisher Compliance Notice Message
              </label>
              <textarea
                rows={3}
                value={chatSecurityNoticeAgent}
                onChange={(e) => setChatSecurityNoticeAgent(e.target.value)}
                className="w-full p-3.5 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-800 rounded-2xl font-medium text-xs outline-none focus:border-[#FC7A00] resize-none"
              />
            </div>
          </div>

          {/* Save Action Bar */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="py-4 px-8 bg-gradient-to-r from-[#FC7A00] via-amber-500 to-[#E06600] text-white font-black text-xs uppercase rounded-2xl border-0 cursor-pointer shadow-md hover:brightness-105 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              <span>{isSaving ? "Saving Settings..." : "Save Property Settings"}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
