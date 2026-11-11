"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { uploadImageSecurely } from "@/lib/image-upload";
import {
  CommunicationBrandingConfig,
  DEFAULT_COMMUNICATION_BRANDING,
  renderTemplateVariables,
} from "@/lib/communication-defaults";

const ButtonSpinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

export default function CommunicationBrandingPage() {
  const { isDark } = useCpanelTheme();

  const [activeTab, setActiveTab] = useState<"sender" | "email_otp" | "whatsapp_otp" | "welcome" | "reply_to">("sender");
  const [config, setConfig] = useState<CommunicationBrandingConfig>(DEFAULT_COMMUNICATION_BRANDING);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Live preview mode
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  // Image Uploading States
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingOtpBanner, setIsUploadingOtpBanner] = useState(false);
  const [isUploadingWaBanner, setIsUploadingWaBanner] = useState(false);
  const [isUploadingWelcomeBanner, setIsUploadingWelcomeBanner] = useState(false);

  // Modal States
  const [showTestEmailModal, setShowTestEmailModal] = useState(false);
  const [testChannel, setTestChannel] = useState<"email" | "whatsapp">("email");
  const [testRecipientEmail, setTestRecipientEmail] = useState("");
  const [testRecipientPhone, setTestRecipientPhone] = useState("");
  const [testTemplateType, setTestTemplateType] = useState<"otp" | "welcome" | "whatsapp_otp">("otp");
  const [isSendingTest, setIsSendingTest] = useState(false);

  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const logoFileRef = useRef<HTMLInputElement>(null);
  const otpBannerFileRef = useRef<HTMLInputElement>(null);
  const waBannerFileRef = useRef<HTMLInputElement>(null);
  const welcomeBannerFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};
      const res = await fetch("/api/admin/communication", { headers });
      const data = await res.json();
      if (res.ok && data.success && data.config) {
        setConfig(data.config);
      }
    } catch {
      toast.error("Failed to load communication branding configuration.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(isMock ? { Authorization: "Bearer mock-admin-token" } : {}),
      };

      const res = await fetch("/api/admin/communication", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "update_config",
          ...config,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Communication templates saved successfully!");
        if (data.config) setConfig(data.config);
      } else {
        toast.error(data.error || "Failed to save communication templates.");
      }
    } catch {
      toast.error("Network communication error saving settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    setIsResetting(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(isMock ? { Authorization: "Bearer mock-admin-token" } : {}),
      };

      const res = await fetch("/api/admin/communication", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "reset_defaults" }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.config) {
        setConfig(data.config);
        toast.success("Templates reset to system default!");
        setShowResetModal(false);
      } else {
        toast.error(data.error || "Failed to reset templates.");
      }
    } catch {
      toast.error("Network communication error during reset.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();

    if (testChannel === "email") {
      if (!testRecipientEmail.trim() || !testRecipientEmail.includes("@")) {
        toast.error("Please enter a valid recipient email address.");
        return;
      }
    } else {
      const cleanPhone = testRecipientPhone.replace(/\D/g, "");
      if (!cleanPhone || cleanPhone.length < 8) {
        toast.error("Please enter a valid recipient phone number.");
        return;
      }
    }

    setIsSendingTest(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(isMock ? { Authorization: "Bearer mock-admin-token" } : {}),
      };

      const res = await fetch("/api/admin/communication", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "send_test",
          channel: testChannel,
          recipientEmail: testRecipientEmail.trim(),
          recipientPhone: testRecipientPhone.trim(),
          templateType: testChannel === "whatsapp" ? "whatsapp_otp" : testTemplateType,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || `Test message dispatched successfully!`);
        setShowTestEmailModal(false);
      } else {
        toast.error(data.error || "Failed to dispatch test communication.");
      }
    } catch {
      toast.error("Network error dispatching test communication.");
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleImageUpload = async (
    file: File,
    target: "sender_logo" | "email_otp_banner" | "whatsapp_banner" | "welcome_banner",
    setLoadingState: (val: boolean) => void
  ) => {
    // Validate file type
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type.toLowerCase())) {
      toast.error("Invalid image format. Only PNG, JPEG, and WebP images are allowed.");
      return;
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size exceeds 5MB limit. Please upload a smaller image.");
      return;
    }

    setLoadingState(true);
    try {
      const result = await uploadImageSecurely(file);
      if (result && result.url) {
        if (target === "sender_logo") {
          setConfig((prev) => ({
            ...prev,
            sender: { ...prev.sender, logoUrl: result.url },
          }));
        } else if (target === "email_otp_banner") {
          setConfig((prev) => ({
            ...prev,
            emailOtp: { ...prev.emailOtp, bannerUrl: result.url },
          }));
        } else if (target === "whatsapp_banner") {
          setConfig((prev) => ({
            ...prev,
            whatsappOtp: { ...prev.whatsappOtp, bannerUrl: result.url },
          }));
        } else if (target === "welcome_banner") {
          setConfig((prev) => ({
            ...prev,
            welcomeEmail: { ...prev.welcomeEmail, bannerUrl: result.url },
          }));
        }
        toast.success("Image uploaded successfully!");
      } else {
        toast.error("Failed to process image upload.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to upload image.");
    } finally {
      setLoadingState(false);
    }
  };

  const inputClass = `w-full px-4 py-3 rounded-2xl text-xs font-semibold border transition-all ${
    isDark
      ? "bg-gray-900 border-gray-700 text-white focus:border-[#FC7A00]"
      : "bg-gray-50 border-gray-200 text-gray-900 focus:border-[#FC7A00] focus:bg-white"
  }`;

  const labelClass = `block text-[10px] font-black uppercase tracking-wider mb-1.5 ${
    isDark ? "text-gray-400" : "text-gray-500"
  }`;

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[600px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#FC7A00] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Loading Communication Settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 font-hanken">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#FC7A00] text-[28px]">mark_email_unread</span>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">Communication & Email Branding</h1>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-semibold">
            Customize transactional email senders, Reply-To addresses, Email & WhatsApp OTP templates, and Welcome Email branding.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-2xl text-xs font-bold transition-all cursor-pointer"
          >
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={() => setShowTestEmailModal(true)}
            className="px-4 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-800 dark:hover:bg-gray-700 text-white rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">send</span>
            Send Test Message
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="px-5 py-2.5 bg-[#FC7A00] hover:bg-[#e06600] active:scale-95 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2 shadow-md"
          >
            {isSaving ? <><ButtonSpinner /> Saving...</> : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 border-b border-gray-200 dark:border-gray-800">
        {[
          { id: "sender", label: "Email Sender", icon: "badge" },
          { id: "email_otp", label: "Email OTP", icon: "lock" },
          { id: "whatsapp_otp", label: "WhatsApp OTP", icon: "chat" },
          { id: "welcome", label: "Welcome Email", icon: "handshake" },
          { id: "reply_to", label: "Reply-To", icon: "reply" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-[#FC7A00] text-white shadow-sm"
                : isDark
                ? "bg-gray-900 text-gray-400 hover:text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: EMAIL SENDER */}
      {activeTab === "sender" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4 bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#FC7A00]">Sender Details & Address</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Sender Display Name</label>
                  <input
                    type="text"
                    value={config.sender.senderName}
                    onChange={(e) => setConfig({ ...config, sender: { ...config.sender, senderName: e.target.value } })}
                    placeholder="e.g. E-Global Pay"
                    className={inputClass}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Brand name displayed in recipient inboxes.</p>
                </div>

                <div>
                  <label className={labelClass}>Sender Email Address</label>
                  <input
                    type="email"
                    value={config.sender.senderEmail}
                    onChange={(e) => setConfig({ ...config, sender: { ...config.sender, senderEmail: e.target.value } })}
                    placeholder="e.g. notifications@emakemrnd.com.ng"
                    className={inputClass}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Verified outbound sending domain email.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Reply-To Email Address</label>
                  <input
                    type="email"
                    value={config.sender.replyToEmail}
                    onChange={(e) => setConfig({ ...config, sender: { ...config.sender, replyToEmail: e.target.value } })}
                    placeholder="e.g. support@emakemrnd.com.ng"
                    className={inputClass}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Receives direct replies from recipients.</p>
                </div>

                <div>
                  <label className={labelClass}>Company / Legal Brand Name</label>
                  <input
                    type="text"
                    value={config.sender.companyName}
                    onChange={(e) => setConfig({ ...config, sender: { ...config.sender, companyName: e.target.value } })}
                    placeholder="e.g. E-Global Pay Tech Hub"
                    className={inputClass}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Used in email footers and compliance disclaimers.</p>
                </div>
              </div>

              <div>
                <label className={labelClass}>Default Email Footer Text</label>
                <textarea
                  rows={2}
                  value={config.sender.footerText}
                  onChange={(e) => setConfig({ ...config, sender: { ...config.sender, footerText: e.target.value } })}
                  placeholder="e.g. © E-Global Pay Tech Hub. All rights reserved."
                  className={inputClass}
                />
              </div>
            </div>

            {/* Sender Logo Upload Card */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 space-y-4 flex flex-col items-center text-center">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#FC7A00]">Brand Logo</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Uploaded logo appears at the top of all transactional emails (PNG, JPG, WebP, max 5MB).
              </p>

              <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center p-2 bg-gray-50 dark:bg-gray-800 relative overflow-hidden">
                {config.sender.logoUrl ? (
                  <img src={config.sender.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="material-symbols-outlined text-gray-400 text-[36px]">image</span>
                )}
              </div>

              <input
                type="file"
                ref={logoFileRef}
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, "sender_logo", setIsUploadingLogo);
                }}
              />

              <div className="flex gap-2 w-full">
                <button
                  type="button"
                  disabled={isUploadingLogo}
                  onClick={() => logoFileRef.current?.click()}
                  className="flex-1 py-2.5 bg-black hover:bg-gray-800 text-white rounded-2xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {isUploadingLogo ? "Uploading..." : config.sender.logoUrl ? "Replace Logo" : "Upload Logo"}
                </button>
                {config.sender.logoUrl && (
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, sender: { ...config.sender, logoUrl: "" } })}
                    className="px-3 py-2.5 border border-red-200 text-red-500 hover:bg-red-50 rounded-2xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* TAB 2: EMAIL OTP TEMPLATE */}
      {activeTab === "email_otp" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form Column */}
            <div className="space-y-4 bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#FC7A00]">Email OTP Design & Content</h3>

              <div>
                <label className={labelClass}>Email Subject</label>
                <input
                  type="text"
                  value={config.emailOtp.subject}
                  onChange={(e) => setConfig({ ...config, emailOtp: { ...config.emailOtp, subject: e.target.value } })}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Header Title</label>
                  <input
                    type="text"
                    value={config.emailOtp.heading}
                    onChange={(e) => setConfig({ ...config, emailOtp: { ...config.emailOtp, heading: e.target.value } })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Greeting</label>
                  <input
                    type="text"
                    value={config.emailOtp.greeting}
                    onChange={(e) => setConfig({ ...config, emailOtp: { ...config.emailOtp, greeting: e.target.value } })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Main Message Body</label>
                <textarea
                  rows={3}
                  value={config.emailOtp.mainMessage}
                  onChange={(e) => setConfig({ ...config, emailOtp: { ...config.emailOtp, mainMessage: e.target.value } })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>OTP Expiry Notice Text</label>
                <input
                  type="text"
                  value={config.emailOtp.expiryText}
                  onChange={(e) => setConfig({ ...config, emailOtp: { ...config.emailOtp, expiryText: e.target.value } })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Security Warning Text</label>
                <input
                  type="text"
                  value={config.emailOtp.securityWarning}
                  onChange={(e) => setConfig({ ...config, emailOtp: { ...config.emailOtp, securityWarning: e.target.value } })}
                  className={inputClass}
                />
              </div>

              {/* Banner Upload */}
              <div>
                <label className={labelClass}>Optional Email Banner / Cover Image</label>
                <div className="flex items-center gap-3">
                  {config.emailOtp.bannerUrl && (
                    <img src={config.emailOtp.bannerUrl} alt="OTP Banner" className="w-16 h-10 object-cover rounded-lg border" />
                  )}
                  <input
                    type="file"
                    ref={otpBannerFileRef}
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, "email_otp_banner", setIsUploadingOtpBanner);
                    }}
                  />
                  <button
                    type="button"
                    disabled={isUploadingOtpBanner}
                    onClick={() => otpBannerFileRef.current?.click()}
                    className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingOtpBanner ? "Uploading..." : config.emailOtp.bannerUrl ? "Replace Banner" : "Upload Cover Banner"}
                  </button>
                  {config.emailOtp.bannerUrl && (
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, emailOtp: { ...config.emailOtp, bannerUrl: "" } })}
                      className="px-3 py-2 text-red-500 hover:underline text-xs font-bold cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Helper Variables Legend */}
              <div className="pt-2">
                <span className="text-[10px] font-black uppercase text-gray-400 block mb-1">Available Safe Variables:</span>
                <div className="flex flex-wrap gap-1.5">
                  {["{{otp}}", "{{name}}", "{{brandName}}", "{{expiryMinutes}}"].map((varName) => (
                    <span key={varName} className="font-mono text-[10px] bg-orange-50 text-[#FC7A00] border border-orange-200 px-2 py-0.5 rounded-md font-bold">
                      {varName}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Preview Column */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-gray-500">Live Email Preview</h3>
                <div className="flex items-center gap-1 bg-gray-200 dark:bg-gray-800 p-1 rounded-xl text-[10px] font-bold">
                  <button
                    onClick={() => setPreviewDevice("desktop")}
                    className={`px-2.5 py-1 rounded-lg transition-all ${previewDevice === "desktop" ? "bg-white dark:bg-gray-900 shadow-sm text-black dark:text-white" : "text-gray-500"}`}
                  >
                    Desktop
                  </button>
                  <button
                    onClick={() => setPreviewDevice("mobile")}
                    className={`px-2.5 py-1 rounded-lg transition-all ${previewDevice === "mobile" ? "bg-white dark:bg-gray-900 shadow-sm text-black dark:text-white" : "text-gray-500"}`}
                  >
                    Mobile
                  </button>
                </div>
              </div>

              <div className={`mx-auto transition-all ${previewDevice === "mobile" ? "max-w-[340px]" : "w-full"}`}>
                <div className="bg-white border border-gray-200 rounded-3xl p-6 text-left shadow-lg font-sans text-gray-900">
                  {config.sender.logoUrl && (
                    <div className="text-center mb-4">
                      <img src={config.sender.logoUrl} alt="Logo" className="max-h-10 mx-auto object-contain" />
                    </div>
                  )}

                  {config.emailOtp.bannerUrl && (
                    <div className="mb-4">
                      <img src={config.emailOtp.bannerUrl} alt="Cover" className="w-full h-24 object-cover rounded-xl" />
                    </div>
                  )}

                  <h2 className="font-extrabold text-base text-center mb-2">{renderTemplateVariables(config.emailOtp.heading, { brandName: config.sender.senderName })}</h2>
                  <p className="text-xs font-semibold text-gray-700 mb-1">{renderTemplateVariables(config.emailOtp.greeting, { name: "John Doe" })}</p>
                  <p className="text-xs text-gray-600 mb-4">{renderTemplateVariables(config.emailOtp.mainMessage, { brandName: config.sender.senderName })}</p>

                  <div className="bg-orange-50 border-2 border-dashed border-[#FC7A00] rounded-2xl p-4 text-center my-4">
                    <span className="font-mono text-3xl font-black text-[#FC7A00] tracking-widest">123456</span>
                    <p className="text-[10px] text-gray-500 mt-2 font-bold">{renderTemplateVariables(config.emailOtp.expiryText, { expiryMinutes: 10 })}</p>
                  </div>

                  <p className="text-[11px] text-red-600 font-bold text-center mb-4">{config.emailOtp.securityWarning}</p>
                  <hr className="border-gray-100 my-4" />
                  <p className="text-[10px] text-gray-400 text-center">{config.emailOtp.footer || config.sender.footerText}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* TAB 3: WHATSAPP OTP */}
      {activeTab === "whatsapp_otp" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4 bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#FC7A00]">WhatsApp OTP Customization</h3>

              <div>
                <label className={labelClass}>Brand / App Identifier</label>
                <input
                  type="text"
                  value={config.whatsappOtp.brandName}
                  onChange={(e) => setConfig({ ...config, whatsappOtp: { ...config.whatsappOtp, brandName: e.target.value } })}
                  className={inputClass}
                />
              </div>

              {/* Bold OTP Toggle Checkbox */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-600 text-[20px]">format_bold</span>
                  <div>
                    <span className="font-extrabold text-xs text-gray-900 dark:text-white block">Bold OTP Code Number (*123456*)</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 block font-medium">Formats the 6-digit verification PIN in bold asterisks for high visibility on WhatsApp.</span>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={config.whatsappOtp.boldOtp !== false}
                    onChange={(e) => setConfig({
                      ...config,
                      whatsappOtp: { ...config.whatsappOtp, boldOtp: e.target.checked }
                    })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* WhatsApp Banner Image Upload */}
              <div>
                <label className={labelClass}>WhatsApp OTP Header Banner Image</label>
                <div className="flex items-center gap-3">
                  {config.whatsappOtp.bannerUrl && (
                    <img src={config.whatsappOtp.bannerUrl} alt="WhatsApp Banner" className="w-16 h-10 object-cover rounded-lg border border-gray-200 dark:border-gray-800" />
                  )}
                  <input
                    type="file"
                    ref={waBannerFileRef}
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, "whatsapp_banner", setIsUploadingWaBanner);
                    }}
                  />
                  <button
                    type="button"
                    disabled={isUploadingWaBanner}
                    onClick={() => waBannerFileRef.current?.click()}
                    className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingWaBanner ? "Uploading..." : config.whatsappOtp.bannerUrl ? "Replace Banner" : "Upload Banner Image"}
                  </button>
                  {config.whatsappOtp.bannerUrl && (
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, whatsappOtp: { ...config.whatsappOtp, bannerUrl: "" } })}
                      className="px-3 py-2 text-red-500 hover:underline text-xs font-bold cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">When set, WhatsApp dispatches include this banner image alongside your OTP message.</p>
              </div>

              <div>
                <label className={labelClass}>Full WhatsApp Message Template</label>
                <textarea
                  rows={5}
                  value={config.whatsappOtp.messageTemplate}
                  onChange={(e) => setConfig({ ...config, whatsappOtp: { ...config.whatsappOtp, messageTemplate: e.target.value } })}
                  className={`${inputClass} font-mono text-xs`}
                />
                <p className="text-[10px] text-gray-400 mt-1">This text is dispatched directly to user WhatsApp numbers.</p>
              </div>

              <div className="pt-2">
                <span className="text-[10px] font-black uppercase text-gray-400 block mb-1">Available WhatsApp Variables:</span>
                <div className="flex flex-wrap gap-1.5">
                  {["{{otp}}", "{{name}}", "{{brandName}}", "{{expiryMinutes}}"].map((varName) => (
                    <span key={varName} className="font-mono text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-md font-bold">
                      {varName}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* WhatsApp Bubble Preview */}
            <div className="space-y-4">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-gray-500">WhatsApp Live Chat Preview</h3>
              <div className="bg-[#efeae2] dark:bg-gray-950 p-6 rounded-3xl border border-gray-300 dark:border-gray-800 min-h-[300px] flex items-center justify-center">
                <div className="bg-white dark:bg-gray-900 text-black dark:text-white p-3.5 rounded-2xl rounded-tl-none shadow-md max-w-[320px] font-sans text-xs whitespace-pre-wrap leading-relaxed border-l-4 border-emerald-500 space-y-2">
                  {/* Render Banner Image if configured */}
                  {config.whatsappOtp.bannerUrl && (
                    <div className="rounded-xl overflow-hidden mb-2 border border-gray-100 dark:border-gray-800">
                      <img src={config.whatsappOtp.bannerUrl} alt="WhatsApp OTP Banner" className="w-full h-32 object-cover" />
                    </div>
                  )}

                  <div>
                    {renderTemplateVariables(config.whatsappOtp.messageTemplate, {
                      name: "Valued Customer",
                      brandName: config.whatsappOtp.brandName || "E-Global Pay",
                      otp: config.whatsappOtp.boldOtp !== false ? "*123456*" : "123456",
                      expiryMinutes: 10,
                    })}
                  </div>
                  <div className="text-[9px] text-gray-400 text-right pt-1 border-t border-gray-100 dark:border-gray-800">
                    Just now • WhatsApp Verification
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* TAB 4: WELCOME EMAIL */}
      {activeTab === "welcome" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4 bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#FC7A00]">Welcome Email Design</h3>

              <div>
                <label className={labelClass}>Subject Line</label>
                <input
                  type="text"
                  value={config.welcomeEmail.subject}
                  onChange={(e) => setConfig({ ...config, welcomeEmail: { ...config.welcomeEmail, subject: e.target.value } })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Main Heading</label>
                <input
                  type="text"
                  value={config.welcomeEmail.heading}
                  onChange={(e) => setConfig({ ...config, welcomeEmail: { ...config.welcomeEmail, heading: e.target.value } })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Welcome Message Body</label>
                <textarea
                  rows={4}
                  value={config.welcomeEmail.welcomeMessage}
                  onChange={(e) => setConfig({ ...config, welcomeEmail: { ...config.welcomeEmail, welcomeMessage: e.target.value } })}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>CTA Button Text</label>
                  <input
                    type="text"
                    value={config.welcomeEmail.ctaButtonText}
                    onChange={(e) => setConfig({ ...config, welcomeEmail: { ...config.welcomeEmail, ctaButtonText: e.target.value } })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>CTA Button Target URL</label>
                  <input
                    type="url"
                    value={config.welcomeEmail.ctaButtonUrl}
                    onChange={(e) => setConfig({ ...config, welcomeEmail: { ...config.welcomeEmail, ctaButtonUrl: e.target.value } })}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Welcome Banner */}
              <div>
                <label className={labelClass}>Optional Welcome Banner</label>
                <div className="flex items-center gap-3">
                  {config.welcomeEmail.bannerUrl && (
                    <img src={config.welcomeEmail.bannerUrl} alt="Banner" className="w-16 h-10 object-cover rounded-lg border" />
                  )}
                  <input
                    type="file"
                    ref={welcomeBannerFileRef}
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, "welcome_banner", setIsUploadingWelcomeBanner);
                    }}
                  />
                  <button
                    type="button"
                    disabled={isUploadingWelcomeBanner}
                    onClick={() => welcomeBannerFileRef.current?.click()}
                    className="px-4 py-2 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingWelcomeBanner ? "Uploading..." : config.welcomeEmail.bannerUrl ? "Replace Banner" : "Upload Welcome Banner"}
                  </button>
                  {config.welcomeEmail.bannerUrl && (
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, welcomeEmail: { ...config.welcomeEmail, bannerUrl: "" } })}
                      className="px-3 py-2 text-red-500 hover:underline text-xs font-bold cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Live Welcome Email Preview */}
            <div className="space-y-4">
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-gray-500">Welcome Email Preview</h3>
              <div className="bg-white border border-gray-200 rounded-3xl p-6 text-left shadow-lg font-sans text-gray-900 max-w-[420px] mx-auto">
                {(config.welcomeEmail.logoUrl || config.sender.logoUrl) && (
                  <div className="text-center mb-4">
                    <img src={config.welcomeEmail.logoUrl || config.sender.logoUrl} alt="Logo" className="max-h-12 mx-auto object-contain" />
                  </div>
                )}

                {config.welcomeEmail.bannerUrl && (
                  <div className="mb-4">
                    <img src={config.welcomeEmail.bannerUrl} alt="Banner" className="w-full h-32 object-cover rounded-xl" />
                  </div>
                )}

                <h2 className="font-extrabold text-lg text-center mb-2">{renderTemplateVariables(config.welcomeEmail.heading, { brandName: config.sender.senderName })}</h2>
                <p className="text-xs font-semibold text-gray-700 mb-2">{renderTemplateVariables(config.welcomeEmail.greeting, { name: "Jane Doe" })}</p>
                <p className="text-xs text-gray-600 leading-relaxed mb-6">{renderTemplateVariables(config.welcomeEmail.welcomeMessage, { brandName: config.sender.senderName, email: "jane@example.com" })}</p>

                <div className="text-center my-6">
                  <span
                    style={{ backgroundColor: config.welcomeEmail.primaryColor || "#FC7A00" }}
                    className="inline-block text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider"
                  >
                    {config.welcomeEmail.ctaButtonText || "Access Wallet Dashboard"}
                  </span>
                </div>

                <hr className="border-gray-100 my-4" />
                <p className="text-[10px] text-gray-400 text-center">{config.welcomeEmail.footer || config.sender.footerText}</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* TAB 5: REPLY-TO */}
      {activeTab === "reply_to" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="max-w-2xl bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 space-y-4">
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#FC7A00]">Dedicated Reply-To Configuration</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              When customers reply to transactional emails, their responses will automatically route to this support email address.
            </p>

            <div>
              <label className={labelClass}>Reply-To Support Email Address</label>
              <input
                type="email"
                value={config.sender.replyToEmail}
                onChange={(e) => setConfig({ ...config, sender: { ...config.sender, replyToEmail: e.target.value } })}
                placeholder="e.g. support@emakemrnd.com.ng"
                className={inputClass}
              />
            </div>

            <div className="p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 rounded-2xl text-xs text-gray-700 dark:text-gray-300 space-y-1">
              <span className="font-bold block text-[#FC7A00]">Domain Security Tip:</span>
              <p className="text-[11px] leading-relaxed">
                Ensure your Reply-To domain is monitored by your customer support team to prevent missed user inquiries.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* TEST COMMUNICATION DISPATCH MODAL */}
      <AnimatePresence>
        {showTestEmailModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
                <h3 className="font-black text-sm uppercase tracking-wider">Send Test Communication</h3>
                <button
                  type="button"
                  onClick={() => setShowTestEmailModal(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-black dark:hover:text-white"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>

              <form onSubmit={handleSendTestEmail} className="space-y-4">
                {/* Channel Switcher */}
                <div>
                  <label className={labelClass}>Dispatch Channel</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTestChannel("email")}
                      className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                        testChannel === "email" ? "bg-[#FC7A00] text-white shadow-xs" : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">mail</span>
                      Email
                    </button>
                    <button
                      type="button"
                      onClick={() => setTestChannel("whatsapp")}
                      className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                        testChannel === "whatsapp" ? "bg-emerald-600 text-white shadow-xs" : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">chat</span>
                      WhatsApp
                    </button>
                  </div>
                </div>

                {testChannel === "email" ? (
                  <>
                    <div>
                      <label className={labelClass}>Target Recipient Email</label>
                      <input
                        type="email"
                        required
                        value={testRecipientEmail}
                        onChange={(e) => setTestRecipientEmail(e.target.value)}
                        placeholder="Enter recipient email..."
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>Email Template Type</label>
                      <select
                        value={testTemplateType}
                        onChange={(e) => setTestTemplateType(e.target.value as any)}
                        className={inputClass}
                      >
                        <option value="otp">Email OTP Template</option>
                        <option value="welcome">Welcome Email Template</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className={labelClass}>Target WhatsApp Phone Number</label>
                    <input
                      type="tel"
                      required
                      value={testRecipientPhone}
                      onChange={(e) => setTestRecipientPhone(e.target.value)}
                      placeholder="e.g. +2348033123456 or 08033123456"
                      className={inputClass}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Dispatches configured WhatsApp OTP message template to WhatsApp API Gateway.</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTestEmailModal(false)}
                    className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-2xl text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSendingTest}
                    className={`flex-1 py-3 ${
                      testChannel === "whatsapp" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[#FC7A00] hover:bg-[#e06600]"
                    } text-white rounded-2xl text-xs font-black uppercase tracking-wider disabled:opacity-50 transition-all`}
                  >
                    {isSendingTest ? <><ButtonSpinner /> Dispatching...</> : `Dispatch Test ${testChannel === "whatsapp" ? "WhatsApp" : "Email"}`}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* RESET CONFIRMATION MODAL */}
      <AnimatePresence>
        {showResetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 w-full max-w-sm text-center space-y-4 shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-[28px]">restart_alt</span>
              </div>
              <h3 className="font-extrabold text-base">Reset Communication Templates?</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This will revert all Email Sender, Email OTP, WhatsApp OTP, and Welcome Email branding templates back to system default.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-2xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isResetting}
                  onClick={handleResetDefaults}
                  className="flex-1 py-3 bg-red-600 text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-red-700 disabled:opacity-50"
                >
                  {isResetting ? <><ButtonSpinner /> Resetting...</> : "Confirm Reset"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
