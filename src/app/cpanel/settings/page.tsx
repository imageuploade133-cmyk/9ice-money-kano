"use client";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";



import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppConfig } from "@/lib/ConfigContext";
import { uploadImageSecurely } from "@/lib/image-upload";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";

const ButtonSpinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

function CpanelSettingsPageContent() {
  const { config, updateConfig } = useAppConfig();
  const router = useRouter();

  const { isDark, toggleTheme } = useCpanelTheme();
  const [logoInput, setLogoInput] = useState(config.logoUrl);
  const [receiptLogoInput, setReceiptLogoInput] = useState(config.receiptLogoUrl || config.logoUrl || "https://i.ibb.co/WWjZrtC7/E-Tech.png");
  const [receiptNameInput, setReceiptNameInput] = useState(config.receiptName || "E-TECH GLOBAL HUB");
  const [receiptBgImageUrlInput, setReceiptBgImageUrlInput] = useState(config.receiptBgImageUrl || "");
  const [receiptBgImageEnabledInput, setReceiptBgImageEnabledInput] = useState(config.receiptBgImageEnabled === true);
  const [receiptBgImageOpacityInput, setReceiptBgImageOpacityInput] = useState(config.receiptBgImageOpacity ?? 0.15);
  const [receiptCbnTextInput, setReceiptCbnTextInput] = useState(config.receiptCbnText || "E-Global Pay is a Fintech app powered by Flutterwave, licensed by CBN and insured by NDIC.");
  const [statementLogoInput, setStatementLogoInput] = useState(config.statementLogoUrl || config.logoUrl || "https://i.ibb.co/WWjZrtC7/E-Tech.png");
  const [statementSignatureInput, setStatementSignatureInput] = useState(config.statementSignatureUrl || "");
  const [statementStampInput, setStatementStampInput] = useState(config.statementStampUrl || "");
  const [statementWatermarkInput, setStatementWatermarkInput] = useState(config.statementWatermarkUrl || "");
  const [statementWatermarkSizeInput, setStatementWatermarkSizeInput] = useState(config.statementWatermarkSize || 100);
  const [statementWatermarkOpacityInput, setStatementWatermarkOpacityInput] = useState(config.statementWatermarkOpacity ?? 0.15);
  const [phone1Input, setPhone1Input] = useState(config.supportPhone1);
  const [phone2Input, setPhone2Input] = useState(config.supportPhone2);
  const [emailInput, setEmailInput] = useState(config.supportEmail);
  const [uploadSizeInput, setUploadSizeInput] = useState(config.maxKycUploadSizeMb || 10);
  const [whatsappPollingEnabled, setWhatsappPollingEnabled] = useState(config.whatsappPollingEnabled !== false);
  const [whatsappPollingIntervalMinutes, setWhatsappPollingIntervalMinutes] = useState(config.whatsappPollingIntervalMinutes || 1);
  const [imgbbApiKeyInput, setImgbbApiKeyInput] = useState(config.hasCustomImgbbApiKey ? "••••••••" : "");
  const [hasCustomImgbbApiKey, setHasCustomImgbbApiKey] = useState(Boolean(config.hasCustomImgbbApiKey));
  const [appVersionInput, setAppVersionInput] = useState(config.appVersion || "1.0.0");
  const [appVersionPushEnabled, setAppVersionPushEnabled] = useState(config.appVersionPushNotificationEnabled !== false);

  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingReceiptLogo, setIsUploadingReceiptLogo] = useState(false);
  const [isUploadingReceiptBg, setIsUploadingReceiptBg] = useState(false);
  const [isUploadingStatementLogo, setIsUploadingStatementLogo] = useState(false);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const [isUploadingStamp, setIsUploadingStamp] = useState(false);
  const [isUploadingWatermark, setIsUploadingWatermark] = useState(false);





  useEffect(() => {
    setLogoInput(config.logoUrl);
    setReceiptLogoInput(config.receiptLogoUrl || config.logoUrl || "https://i.ibb.co/WWjZrtC7/E-Tech.png");
    setReceiptNameInput(config.receiptName || "E-TECH GLOBAL HUB");
    setReceiptBgImageUrlInput(config.receiptBgImageUrl || "");
    setReceiptBgImageEnabledInput(config.receiptBgImageEnabled === true);
    setReceiptBgImageOpacityInput(config.receiptBgImageOpacity ?? 0.15);
    setReceiptCbnTextInput(config.receiptCbnText || "E-Global Pay is a Fintech app powered by Flutterwave, licensed by CBN and insured by NDIC.");
    setStatementLogoInput(config.statementLogoUrl || config.logoUrl || "https://i.ibb.co/WWjZrtC7/E-Tech.png");
    setStatementSignatureInput(config.statementSignatureUrl || "");
    setStatementStampInput(config.statementStampUrl || "");
    setStatementWatermarkInput(config.statementWatermarkUrl || "");
    setStatementWatermarkSizeInput(config.statementWatermarkSize || 100);
    setStatementWatermarkOpacityInput(config.statementWatermarkOpacity ?? 0.15);
    setPhone1Input(config.supportPhone1);
    setPhone2Input(config.supportPhone2);
    setEmailInput(config.supportEmail);
    setUploadSizeInput(config.maxKycUploadSizeMb || 10);
    setWhatsappPollingEnabled(config.whatsappPollingEnabled !== false);
    setWhatsappPollingIntervalMinutes(config.whatsappPollingIntervalMinutes || 1);
    setHasCustomImgbbApiKey(Boolean(config.hasCustomImgbbApiKey));
    setAppVersionInput(config.appVersion || "1.0.0");
    setAppVersionPushEnabled(config.appVersionPushNotificationEnabled !== false);
    if (config.hasCustomImgbbApiKey && !imgbbApiKeyInput) {
      setImgbbApiKeyInput("••••••••");
    }
  }, [config]);

  const handleClearImgbbApiKey = async () => {
    try {
      await updateConfig({ imgbbApiKey: "", clearImgbbApiKey: true } as any);
      setImgbbApiKeyInput("");
      setHasCustomImgbbApiKey(false);
      toast.success("Custom ImgBB API Key removed. System is now using default server environment key.");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove custom ImgBB key.");
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBranding(true);
    try {
      const payload: Record<string, any> = {
        logoUrl: logoInput,
        receiptLogoUrl: receiptLogoInput,
        receiptName: receiptNameInput,
        receiptBgImageUrl: receiptBgImageUrlInput,
        receiptBgImageEnabled: receiptBgImageEnabledInput,
        receiptBgImageOpacity: receiptBgImageOpacityInput,
        receiptCbnText: receiptCbnTextInput,
        statementLogoUrl: statementLogoInput,
        statementSignatureUrl: statementSignatureInput,
        statementStampUrl: statementStampInput,
        statementWatermarkUrl: statementWatermarkInput,
        statementWatermarkSize: statementWatermarkSizeInput,
        statementWatermarkOpacity: statementWatermarkOpacityInput,
        supportPhone1: phone1Input,
        supportPhone2: phone2Input,
        supportEmail: emailInput,
        maxKycUploadSizeMb: uploadSizeInput,
        whatsappPollingEnabled,
        whatsappPollingIntervalMinutes,
        appVersion: appVersionInput.trim() || "1.0.0",
        appVersionPushNotificationEnabled: appVersionPushEnabled,
      };

      if (imgbbApiKeyInput && imgbbApiKeyInput !== "••••••••") {
        payload.imgbbApiKey = imgbbApiKeyInput;
      }

      await updateConfig(payload);
      if (imgbbApiKeyInput && imgbbApiKeyInput !== "••••••••") {
        setHasCustomImgbbApiKey(true);
        setImgbbApiKeyInput("••••••••");
      }
      toast.success("Global branding, ImgBB API key, and system settings applied!");
    } catch (err: unknown) {
      console.error(err);
      toast.error("Failed to commit settings updates to system storage.");
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleReceiptLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingReceiptLogo(true);
    toast.loading("Uploading receipt logo securely...");

    try {
      const result = await uploadImageSecurely(file, "receipt_logo");
      toast.dismiss();

      if (result.success && result.url) {
        const uploadedUrl = result.url;
        setReceiptLogoInput(uploadedUrl);
        updateConfig({ receiptLogoUrl: uploadedUrl });
        toast.success("Receipt logo successfully uploaded and updated!");
      } else {
        toast.error(result.error || "Failed to upload receipt logo!");
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "Receipt logo upload failed.");
    } finally {
      setIsUploadingReceiptLogo(false);
    }
  };

  const handleReceiptBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingReceiptBg(true);
    toast.loading("Uploading receipt background image securely...");

    try {
      const result = await uploadImageSecurely(file, "receipt_logo");
      toast.dismiss();

      if (result.success && result.url) {
        const uploadedUrl = result.url;
        setReceiptBgImageUrlInput(uploadedUrl);
        setReceiptBgImageEnabledInput(true);
        updateConfig({ receiptBgImageUrl: uploadedUrl, receiptBgImageEnabled: true });
        toast.success("Receipt background image uploaded and enabled!");
      } else {
        toast.error(result.error || "Failed to upload receipt background image!");
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "Receipt background upload failed.");
    } finally {
      setIsUploadingReceiptBg(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    toast.loading("Uploading app logo securely...");

    try {
      const result = await uploadImageSecurely(file, "app_logo");
      toast.dismiss();

      if (result.success && result.url) {
        const uploadedUrl = result.url;
        setLogoInput(uploadedUrl);
        updateConfig({ logoUrl: uploadedUrl });
        toast.success("App logo successfully uploaded and updated!");
      } else {
        toast.error(result.error || "Failed to upload logo image!");
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "App logo upload failed.");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleStatementLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingStatementLogo(true);
    toast.loading("Uploading statement logo securely...");

    try {
      const result = await uploadImageSecurely(file, "statement_logo");
      toast.dismiss();

      if (result.success && result.url) {
        const uploadedUrl = result.url;
        setStatementLogoInput(uploadedUrl);
        updateConfig({ statementLogoUrl: uploadedUrl });
        toast.success("Statement logo successfully uploaded and updated!");
      } else {
        toast.error(result.error || "Failed to upload statement logo!");
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "Statement logo upload failed.");
    } finally {
      setIsUploadingStatementLogo(false);
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingSignature(true);
    toast.loading("Uploading authorized signature securely...");

    try {
      const result = await uploadImageSecurely(file, "statement_signature");
      toast.dismiss();

      if (result.success && result.url) {
        const uploadedUrl = result.url;
        setStatementSignatureInput(uploadedUrl);
        updateConfig({ statementSignatureUrl: uploadedUrl });
        toast.success("Authorized signature successfully uploaded and updated!");
      } else {
        toast.error(result.error || "Failed to upload signature!");
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "Signature upload failed.");
    } finally {
      setIsUploadingSignature(false);
    }
  };

  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingStamp(true);
    toast.loading("Uploading official stamp securely...");

    try {
      const result = await uploadImageSecurely(file, "statement_stamp");
      toast.dismiss();

      if (result.success && result.url) {
        const uploadedUrl = result.url;
        setStatementStampInput(uploadedUrl);
        updateConfig({ statementStampUrl: uploadedUrl });
        toast.success("Official stamp successfully uploaded and updated!");
      } else {
        toast.error(result.error || "Failed to upload stamp!");
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "Stamp upload failed.");
    } finally {
      setIsUploadingStamp(false);
    }
  };

  const handleWatermarkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingWatermark(true);
    toast.loading("Uploading traditional watermark logo securely...");

    try {
      const result = await uploadImageSecurely(file, "statement_watermark");
      toast.dismiss();

      if (result.success && result.url) {
        const uploadedUrl = result.url;
        setStatementWatermarkInput(uploadedUrl);
        updateConfig({ statementWatermarkUrl: uploadedUrl });
        toast.success("Traditional watermark logo successfully uploaded and updated!");
      } else {
        toast.error(result.error || "Failed to upload watermark logo!");
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "Watermark upload failed.");
    } finally {
      setIsUploadingWatermark(false);
    }
  };

  const bgClass = isDark ? "bg-[#0c0f17] text-white" : "bg-gray-50 text-gray-900";
  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full";

  return (
    <div className={cn("min-h-screen p-4 md:p-8 font-hanken transition-colors duration-300", bgClass)}>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className={cn("p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4", panelClass)}>
          <div className="flex items-center gap-3">
            <Link
              href="/cpanel"
              className={cn("w-10 h-10 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-[22px]">settings_suggest</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Global Settings</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Configure platform brand logo, statement logo, signature, official stamp, ImgBB API key, document limits, and support contacts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className={cn("px-3 h-10 rounded-xl border font-bold text-xs flex items-center gap-2 transition-all cursor-pointer", isDark ? "bg-gray-900 border-gray-800 text-yellow-400" : "bg-gray-100 border-gray-200 text-gray-700")}
            >
              <span className="material-symbols-outlined text-[18px]">{isDark ? "light_mode" : "dark_mode"}</span>
              <span className="hidden sm:inline">{isDark ? "Light Mode" : "Dark Mode"}</span>
            </button>
            <Link
              href="/cpanel"
              className="px-4 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">dashboard</span>
              <span>Control Panel</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className={cn("rounded-2xl p-6 md:col-span-2 border transition-colors duration-300", panelClass)}>
            <h3 className={cn("font-hanken font-extrabold text-sm border-b pb-3 mb-4 uppercase tracking-wide", isDark ? "border-gray-800 text-white" : "border-gray-100 text-gray-900")}>
              Live Brand Configurations
            </h3>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className={cn("space-y-1 p-4 rounded-xl border transition-colors duration-300", isDark ? "bg-orange-950/20 border-orange-900/30" : "bg-orange-50/50 border-orange-100")}>
                <label className="text-[10px] font-black uppercase text-[#FC7A00] tracking-wider">Max KYC Document Upload Size (MB)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={uploadSizeInput}
                  onChange={(e) => setUploadSizeInput(Math.max(1, parseInt(e.target.value) || 1))}
                  placeholder="e.g. 10"
                  className={inputClass}
                />
                <p className="text-[9px] text-gray-400 mt-1">Configure the maximum permitted file size in MB for Identity document image uploads.</p>
              </div>

              {/* Platform App Version Release Controller */}
              <div className={cn("p-4 rounded-xl border space-y-3 transition-colors duration-300", isDark ? "bg-orange-950/20 border-orange-900/30" : "bg-orange-50/50 border-orange-100")}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#FC7A00] tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">system_update</span>
                      Platform App Version Release & Deploy Update
                    </label>
                    <p className="text-[9px] text-gray-400 mt-0.5">
                      Update or increment the system app version (e.g. 1.0.1, 1.0.2, 1.1.0) when deploying new platform updates. All connected clients will instantly receive a full-screen drawer modal prompting them to click &quot;UPDATE NOW&quot; to clear storage and load fresh system assets.
                    </p>
                  </div>
                  <span className="font-mono px-2.5 py-1 bg-[#FC7A00]/10 border border-[#FC7A00]/30 text-[#FC7A00] rounded-xl text-[10px] font-black">
                    LIVE: v{config.appVersion || "1.0.0"}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400">Target Release Version</label>
                    <input
                      type="text"
                      value={appVersionInput}
                      onChange={(e) => setAppVersionInput(e.target.value)}
                      placeholder="e.g. 1.0.1"
                      className={cn(inputClass, "font-mono font-bold")}
                    />
                  </div>

                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const parts = appVersionInput.split(".");
                        if (parts.length === 3 && !isNaN(Number(parts[2]))) {
                          parts[2] = String(Number(parts[2]) + 1);
                          setAppVersionInput(parts.join("."));
                        } else {
                          setAppVersionInput("1.0.1");
                        }
                      }}
                      className="px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer h-10 flex items-center gap-1 shrink-0"
                    >
                      <span className="material-symbols-outlined text-[16px]">add_circle</span>
                      <span>+ Increment Version</span>
                    </button>
                  </div>
                </div>

                {/* Push Notification Toggle */}
                <div className="flex items-center justify-between border-t border-gray-200/40 dark:border-gray-800 pt-2.5">
                  <div>
                    <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px] text-orange-500">notifications_active</span>
                      Broadcast Version Release Push Notification
                    </span>
                    <p className="text-[8.5px] text-gray-400">Automatically send real-time push alerts to registered user devices when app version changes.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAppVersionPushEnabled(!appVersionPushEnabled)}
                    className={cn(
                      "px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer border transition-all shrink-0",
                      appVersionPushEnabled
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                        : "bg-red-500/10 text-red-500 border-red-500/30"
                    )}
                  >
                    {appVersionPushEnabled ? "PUSH ON" : "PUSH OFF"}
                  </button>
                </div>
              </div>

              {/* ImgBB Image Storage Gateway API Key Controls */}
              <div className={cn("p-4 rounded-xl border space-y-3 transition-colors duration-300", isDark ? "bg-orange-950/20 border-orange-900/30" : "bg-orange-50/50 border-orange-100")}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#FC7A00] tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
                      ImgBB Image Storage Gateway API Key
                    </label>
                    <p className="text-[9px] text-gray-400 mt-0.5">
                      Enter a custom ImgBB API key to override the server environment key. If left blank, the system will automatically use the key configured in server environment.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border",
                        hasCustomImgbbApiKey
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                          : "bg-blue-500/10 text-blue-600 border-blue-500/30"
                      )}
                    >
                      {hasCustomImgbbApiKey ? "CUSTOM KEY ACTIVE" : "SERVER ENV FALLBACK"}
                    </span>
                    {hasCustomImgbbApiKey && (
                      <button
                        type="button"
                        onClick={handleClearImgbbApiKey}
                        className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/30 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                      >
                        Remove Custom Key
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1 pt-1">
                  <input
                    type="password"
                    value={imgbbApiKeyInput}
                    onChange={(e) => setImgbbApiKeyInput(e.target.value)}
                    placeholder={hasCustomImgbbApiKey ? "•••••••• (Enter new key to update)" : "Enter custom ImgBB API key"}
                    className={inputClass}
                  />
                  <p className="text-[9px] text-gray-400">
                    {hasCustomImgbbApiKey
                      ? "A custom key is currently active. Type a new key to change it, or click 'Remove Custom Key' to use server env."
                      : "Currently using server process.env.IMGBB_API_KEY. Enter a key above if you wish to override it."}
                  </p>
                </div>
              </div>

              {/* WhatsApp Automatic Connection Polling Controls */}
              <div className={cn("p-4 rounded-xl border space-y-3 transition-colors duration-300", isDark ? "bg-orange-950/20 border-orange-900/30" : "bg-orange-50/50 border-orange-100")}>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#FC7A00] tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">sync</span>
                      WhatsApp Session Polling Check
                    </label>
                    <p className="text-[9px] text-gray-400 mt-0.5">Automated background status verification with WhatsApp VM gateway to reduce Firestore writes.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWhatsappPollingEnabled(!whatsappPollingEnabled)}
                    className={cn(
                      "px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all",
                      whatsappPollingEnabled
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                        : "bg-red-500/10 text-red-500 border-red-500/30"
                    )}
                  >
                    {whatsappPollingEnabled ? "POLLING ON" : "POLLING OFF"}
                  </button>
                </div>

                {whatsappPollingEnabled && (
                  <div className="space-y-1.5 pt-2 border-t border-gray-200/30 dark:border-gray-800">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Polling Frequency ({whatsappPollingIntervalMinutes} Minute{whatsappPollingIntervalMinutes > 1 ? "s" : ""})</label>
                      <span className="font-mono text-xs font-black text-[#FC7A00]">{whatsappPollingIntervalMinutes}m</span>
                    </div>
                    <select
                      value={whatsappPollingIntervalMinutes}
                      onChange={(e) => setWhatsappPollingIntervalMinutes(Number(e.target.value))}
                      className={cn(inputClass, "font-bold cursor-pointer")}
                    >
                      <option value={1}>Every 1 Minute (High Precision)</option>
                      <option value={2}>Every 2 Minutes</option>
                      <option value={5}>Every 5 Minutes (Recommended - Saves Firestore Writes)</option>
                      <option value={10}>Every 10 Minutes</option>
                      <option value={15}>Every 15 Minutes</option>
                      <option value={30}>Every 30 Minutes</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Statement of Account Branding (Logo, Signature, Stamp) */}
              <div className={cn("p-4 rounded-xl border space-y-4 transition-colors duration-300", isDark ? "bg-orange-950/20 border-orange-900/30" : "bg-orange-50/50 border-orange-100")}>
                <div>
                  <label className="text-[10px] font-black uppercase text-[#FC7A00] tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">description</span>
                    Statement of Account Branding (Logo, Signature & Stamp)
                  </label>
                  <p className="text-[9px] text-gray-400 mt-0.5">Configure the official statement logo, authorized signature, and official stamp rendered when users download or email statements.</p>
                </div>

                {/* Statement Logo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400">Statement Logo URL</label>
                    <input
                      type="url"
                      value={statementLogoInput}
                      onChange={(e) => setStatementLogoInput(e.target.value)}
                      placeholder="https://i.ibb.co/..."
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400">Upload Statement Logo File</label>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingStatementLogo}
                      onChange={handleStatementLogoUpload}
                      className={cn(inputClass, "cursor-pointer py-1.5 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-extrabold file:bg-[#FC7A00]/10 file:text-[#FC7A00]")}
                    />
                  </div>
                </div>

                {/* Signature & Stamp */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-200/30 dark:border-gray-800 pt-3">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px] text-blue-500">draw</span>
                      Authorized Signature Image
                    </label>
                    <input
                      type="url"
                      value={statementSignatureInput}
                      onChange={(e) => setStatementSignatureInput(e.target.value)}
                      placeholder="Signature image URL"
                      className={inputClass}
                    />
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingSignature}
                      onChange={handleSignatureUpload}
                      className={cn(inputClass, "cursor-pointer py-1.5 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-extrabold file:bg-blue-500/10 file:text-blue-600")}
                    />
                    {statementSignatureInput && (
                      <div className="p-2 bg-white rounded-lg border border-gray-200 inline-block max-w-[120px]">
                        <img src={statementSignatureInput} alt="Signature Preview" className="h-10 object-contain" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px] text-purple-500">approval</span>
                      Official Stamp Image
                    </label>
                    <input
                      type="url"
                      value={statementStampInput}
                      onChange={(e) => setStatementStampInput(e.target.value)}
                      placeholder="Stamp image URL"
                      className={inputClass}
                    />
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingStamp}
                      onChange={handleStampUpload}
                      className={cn(inputClass, "cursor-pointer py-1.5 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-extrabold file:bg-purple-500/10 file:text-purple-600")}
                    />
                    {statementStampInput && (
                      <div className="p-2 bg-white rounded-lg border border-gray-200 inline-block max-w-[120px]">
                        <img src={statementStampInput} alt="Stamp Preview" className="h-10 object-contain" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Traditional Watermark Logo (Middle of A4 Statement) */}
                <div className="border-t border-gray-200/30 dark:border-gray-800 pt-4 space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-[#FC7A00] tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">watermark</span>
                      A4 Traditional Background Watermark Logo (Middle of Statement)
                    </label>
                    <p className="text-[9px] text-gray-400 mt-0.5">
                      Upload an official traditional logo watermark displayed in the exact center of A4 size statements. Adjust size and transparency.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-gray-400">Watermark Logo URL</label>
                      <input
                        type="url"
                        value={statementWatermarkInput}
                        onChange={(e) => setStatementWatermarkInput(e.target.value)}
                        placeholder="https://i.ibb.co/..."
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-gray-400">Upload Watermark File</label>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={isUploadingWatermark}
                        onChange={handleWatermarkUpload}
                        className={cn(inputClass, "cursor-pointer py-1.5 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-extrabold file:bg-[#FC7A00]/10 file:text-[#FC7A00]")}
                      />
                    </div>
                  </div>

                  {/* Size and Opacity Controls */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50/80 dark:bg-gray-900/40 p-3.5 rounded-xl border border-gray-200/50 dark:border-gray-800">
                    {/* Size slider & input */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-orange-500">aspect_ratio</span>
                          Watermark Size (MM)
                        </label>
                        <span className="font-mono text-xs font-black text-[#FC7A00]">{statementWatermarkSizeInput} mm</span>
                      </div>
                      <input
                        type="range"
                        min={40}
                        max={180}
                        step={5}
                        value={statementWatermarkSizeInput}
                        onChange={(e) => setStatementWatermarkSizeInput(Number(e.target.value))}
                        className="w-full accent-[#FC7A00] cursor-pointer"
                      />
                      <p className="text-[8.5px] text-gray-400">Controls width/height of centered watermark on 210mm A4 page (40mm - 180mm).</p>
                    </div>

                    {/* Opacity slider & input */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-[#FC7A00]">opacity</span>
                          Watermark Transparency / Opacity
                        </label>
                        <span className="font-mono text-xs font-black text-[#FC7A00]">{Math.round(statementWatermarkOpacityInput * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.05}
                        max={0.80}
                        step={0.01}
                        value={statementWatermarkOpacityInput}
                        onChange={(e) => setStatementWatermarkOpacityInput(Number(e.target.value))}
                        className="w-full accent-[#FC7A00] cursor-pointer"
                      />
                      <p className="text-[8.5px] text-gray-400">Controls background transparency (5% is subtle, 15% standard, 80% high visibility).</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Receipt Branding Settings */}
              <div className={cn("p-4 rounded-xl border space-y-4 transition-colors duration-300", isDark ? "bg-orange-950/20 border-orange-900/30" : "bg-orange-50/50 border-orange-100")}>
                <div>
                  <label className="text-[10px] font-black uppercase text-[#FC7A00] tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                    Transaction Receipt Branding, Background & Regulatory Disclaimer
                  </label>
                  <p className="text-[9px] text-gray-400 mt-0.5">Customize the header name, logo image, background image, transparency, and CBN regulatory disclaimer displayed on Share Receipts.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400">Receipt Header Title / Name</label>
                  <input
                    type="text"
                    value={receiptNameInput}
                    onChange={(e) => setReceiptNameInput(e.target.value)}
                    placeholder="e.g. E-TECH GLOBAL HUB"
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400">Receipt Custom Logo URL</label>
                    <input
                      type="url"
                      value={receiptLogoInput}
                      onChange={(e) => setReceiptLogoInput(e.target.value)}
                      placeholder="https://i.ibb.co/..."
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400">Upload Receipt Logo File</label>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingReceiptLogo}
                      onChange={handleReceiptLogoUpload}
                      className={cn(inputClass, "cursor-pointer py-1.5 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-extrabold file:bg-[#FC7A00]/10 file:text-[#FC7A00]")}
                    />
                  </div>
                </div>

                {/* Background Image Controls */}
                <div className="border-t border-gray-200/30 dark:border-gray-800 pt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px] text-orange-500">wallpaper</span>
                        Receipt Background Image
                      </label>
                      <p className="text-[8.5px] text-gray-400">Upload or configure a background image to render behind the ticket receipt card.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReceiptBgImageEnabledInput(!receiptBgImageEnabledInput)}
                      className={cn(
                        "px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer border transition-all",
                        receiptBgImageEnabledInput
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                          : "bg-red-500/10 text-red-500 border-red-500/30"
                      )}
                    >
                      {receiptBgImageEnabledInput ? "BG IMAGE SHOWN" : "BG IMAGE HIDDEN"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-gray-400">Background Image URL</label>
                      <input
                        type="url"
                        value={receiptBgImageUrlInput}
                        onChange={(e) => setReceiptBgImageUrlInput(e.target.value)}
                        placeholder="https://i.ibb.co/..."
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-gray-400">Upload Background File</label>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={isUploadingReceiptBg}
                        onChange={handleReceiptBgUpload}
                        className={cn(inputClass, "cursor-pointer py-1.5 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-extrabold file:bg-[#FC7A00]/10 file:text-[#FC7A00]")}
                      />
                    </div>
                  </div>

                  {/* Opacity Slider */}
                  <div className="bg-gray-50/80 dark:bg-gray-900/40 p-3 rounded-xl border border-gray-200/50 dark:border-gray-800 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black uppercase text-gray-500 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px] text-[#FC7A00]">opacity</span>
                        Receipt Background Image Transparency / Opacity
                      </label>
                      <span className="font-mono text-xs font-black text-[#FC7A00]">{Math.round(receiptBgImageOpacityInput * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={0.80}
                      step={0.01}
                      value={receiptBgImageOpacityInput}
                      onChange={(e) => setReceiptBgImageOpacityInput(Number(e.target.value))}
                      className="w-full accent-[#FC7A00] cursor-pointer"
                    />
                    <p className="text-[8.5px] text-gray-400">Controls background image transparency on receipt (15% is standard background watermark).</p>
                  </div>
                </div>

                {/* Customizable CBN Disclaimer Text */}
                <div className="border-t border-gray-200/30 dark:border-gray-800 pt-3 space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-blue-500">verified_user</span>
                    Custom CBN / Regulatory Disclaimer Text
                  </label>
                  <textarea
                    rows={2}
                    value={receiptCbnTextInput}
                    onChange={(e) => setReceiptCbnTextInput(e.target.value)}
                    placeholder="Enter custom CBN / NDIC regulatory statement..."
                    className={cn(inputClass, "h-auto py-2 font-normal leading-relaxed text-[11px]")}
                  />
                  <p className="text-[8.5px] text-gray-400">Displayed at the bottom footer of Share Receipts.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400">Core Brand Logo URL</label>
                  <input
                    type="url"
                    value={logoInput}
                    onChange={(e) => setLogoInput(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400">Upload Logo Image File</label>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isUploadingLogo}
                    onChange={handleLogoUpload}
                    className={cn(inputClass, "cursor-pointer py-1.5 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-extrabold file:bg-[#FC7A00]/10 file:text-[#FC7A00]")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400">Toll-Free Support Line</label>
                  <input
                    type="text"
                    value={phone1Input}
                    onChange={(e) => setPhone1Input(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400">VIP Chat Hotline</label>
                  <input
                    type="text"
                    value={phone2Input}
                    onChange={(e) => setPhone2Input(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400">System Support Email</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={isSavingBranding}
                className="px-6 py-3.5 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-98"
              >
                {isSavingBranding ? <><ButtonSpinner /> Saving configurations...</> : "Save Branding Configurations"}
              </button>
            </form>
          </div>

          <div className={cn("border rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden transition-colors duration-300", isDark ? "bg-orange-950/10 border-orange-900/30" : "bg-orange-50 border-orange-100")}>
            <div className="relative z-10">
              <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-wider mb-3">Live Platform Widget Preview</h4>
              <div className={cn("border p-4 rounded-xl space-y-3 transition-colors duration-300", isDark ? "bg-gray-900/80 border-gray-800" : "bg-white/80 border-gray-150")}>
                <div className="flex justify-between items-center">
                  <div className="w-10 h-10 rounded bg-white flex items-center justify-center p-1.5 border border-gray-100">
                    <img src={logoInput || "https://i.ibb.co/WWjZrtC7/E-Tech.png"} alt="Brand Logo Preview" className="object-contain" />
                  </div>
                  <span className="text-[10px] font-mono font-black text-[#FC7A00] bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">LIVE</span>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 uppercase font-black tracking-wide leading-none">Support contact details</p>
                  <p className={cn("text-xs font-black mt-1.5", isDark ? "text-white" : "text-gray-900")}>{emailInput}</p>
                  <p className="text-[11px] font-mono text-gray-400 mt-1">{phone1Input}</p>
                </div>
              </div>

              {/* Live A4 Statement Watermark Preview Card */}
              <div className={cn("border p-4 rounded-xl space-y-3 transition-colors duration-300", isDark ? "bg-gray-900/80 border-gray-800" : "bg-white/80 border-gray-150")}>
                <div className="flex justify-between items-center">
                  <p className="text-[11px] text-gray-400 uppercase font-black tracking-wide leading-none">A4 Statement Watermark Preview</p>
                  <span className="text-[9px] font-mono font-black text-[#FC7A00] bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">A4 PAGE</span>
                </div>
                <div className="relative w-full aspect-[210/297] bg-white border border-gray-200 rounded-lg shadow-inner overflow-hidden p-3 flex flex-col justify-between text-black">
                  {/* Top Bar Representation */}
                  <div className="border-b border-gray-100 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded bg-[#FC7A00]/20 flex items-center justify-center text-[8px] font-bold text-[#FC7A00]">E</div>
                      <span className="text-[9px] font-black tracking-wider text-gray-800">E-GLOBAL PAY</span>
                    </div>
                    <span className="text-[7px] font-bold text-gray-400">STATEMENT OF ACCOUNT</span>
                  </div>

                  {/* Middle Content Placeholder Lines with Centered Watermark Layer */}
                  <div className="relative flex-1 py-2 flex flex-col justify-between">
                    {/* Centered Watermark Image Layer */}
                    {statementWatermarkInput ? (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                        <img
                          src={statementWatermarkInput}
                          alt="Watermark Preview"
                          style={{
                            width: `${(statementWatermarkSizeInput / 210) * 100}%`,
                            opacity: statementWatermarkOpacityInput,
                            maxHeight: "80%",
                            objectFit: "contain",
                          }}
                        />
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                        <span className="text-[8px] font-bold text-gray-300 uppercase tracking-widest text-center px-4">
                          No Watermark Uploaded
                        </span>
                      </div>
                    )}

                    {/* Mock Table Content Lines */}
                    <div className="relative z-10 space-y-1.5 opacity-70">
                      <div className="h-1.5 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-1 bg-gray-100 rounded w-full"></div>
                      <div className="h-1 bg-gray-100 rounded w-5/6"></div>
                      <div className="h-1 bg-gray-100 rounded w-full"></div>
                      <div className="h-1 bg-gray-100 rounded w-2/3"></div>
                      <div className="h-1 bg-gray-100 rounded w-full"></div>
                      <div className="h-1 bg-gray-100 rounded w-4/5"></div>
                    </div>
                  </div>

                  {/* Bottom Footer Line */}
                  <div className="relative z-10 border-t border-gray-100 pt-1 text-[6.5px] text-gray-400 text-center font-semibold">
                    Confidential Electronic Statement • E-Global Pay
                  </div>
                </div>
              </div>
            </div>
            <div className={cn("pt-4 border-t mt-4 relative z-10", isDark ? "border-gray-800" : "border-gray-100")}>
              <p className="text-[10px] text-gray-400 font-bold leading-relaxed font-hanken">
                All alterations committed inside this settings matrix propagates instantly to the global wallet UI client.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function CpanelSettingsPage() {
  return (
    <CpanelRouteGuard requiredPermission="branding.manage">
      <CpanelSettingsPageContent />
    </CpanelRouteGuard>
  );
}