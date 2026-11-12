"use client";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";



import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { useAppConfig } from "@/lib/ConfigContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";

const ButtonSpinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

function CpanelWhatsappPageContent() {
  const { user } = useAuth();
  const { config } = useAppConfig();
  const router = useRouter();

  const { isDark, toggleTheme } = useCpanelTheme();
  const [whatsappStatus, setWhatsappStatus] = useState<"LINKED" | "UNLINKED">("UNLINKED");
  const [whatsappPhoneNumber, setWhatsappPhoneNumber] = useState<string | null>(null);
  const [whatsappLinkedAt, setWhatsappLinkedAt] = useState<string | null>(null);
  const [whatsappQrCode, setWhatsappQrCode] = useState<string | null>(null);
  const [whatsappQrCountdown, setWhatsappQrCountdown] = useState(45);
  const [isLoadingWhatsapp, setIsLoadingWhatsapp] = useState(false);

  // WhatsApp API Configuration
  const [whatsappApiUrlInput, setWhatsappApiUrlInput] = useState("");
  const [whatsappApiKeyInput, setWhatsappApiKeyInput] = useState("");
  const [whatsappInstanceIdInput, setWhatsappInstanceIdInput] = useState("");
  const [whatsappAdminUsernameInput, setWhatsappAdminUsernameInput] = useState("");
  const [whatsappAdminPasswordInput, setWhatsappAdminPasswordInput] = useState("");
  const [isSavingApiConfig, setIsSavingApiConfig] = useState(false);
  const [isLinkingWhatsapp, setIsLinkingWhatsapp] = useState(false);

  // Test Message & OTP Dispatch Form States
  const [testPhone, setTestPhone] = useState("");
  const [testMessageType, setTestMessageType] = useState<"test_otp" | "custom">("test_otp");
  const [testCustomMessage, setTestCustomMessage] = useState("");
  const [isSendingTestMessage, setIsSendingTestMessage] = useState(false);

  const [whatsappLogs, setWhatsappLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] WhatsApp Gateway engine ready.`,
    `[${new Date().toLocaleTimeString()}] Idle: Waiting for administrator action...`
  ]);

  const [adminActionModal, setAdminActionModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    actionLabel: string;
    actionStyle: "danger" | "warning" | "success" | "info";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    actionLabel: "",
    actionStyle: "danger",
    onConfirm: () => {},
  });

  const triggerAdminConfirm = (
    title: string,
    message: string,
    actionLabel: string,
    actionStyle: "danger" | "warning" | "success" | "info",
    onConfirm: () => void
  ) => {
    setAdminActionModal({ isOpen: true, title, message, actionLabel, actionStyle, onConfirm });
  };





  const addWhatsappLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setWhatsappLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  const fetchWhatsappStatus = async (isBackground: boolean = false) => {
    if (!isBackground) setIsLoadingWhatsapp(true);
    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/whatsapp", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const prevStatus = whatsappStatus;
        const newStatus = data.status || "UNLINKED";
        setWhatsappStatus(newStatus);
        setWhatsappPhoneNumber(data.phoneNumber || null);
        setWhatsappLinkedAt(data.linkedAt || null);

        if (data.qrCode) {
          setWhatsappQrCode(data.qrCode);
        }

        if (data.apiConfig) {
          setWhatsappApiUrlInput(data.apiConfig.whatsappApiUrl || "");
          setWhatsappInstanceIdInput(data.apiConfig.whatsappInstanceId || "");
          setWhatsappApiKeyInput("");
          setWhatsappAdminUsernameInput("");
          setWhatsappAdminPasswordInput("");
        }

        if (newStatus === "LINKED") {
          setWhatsappQrCode(null);
          setWhatsappQrCountdown(0);
          if (prevStatus === "UNLINKED") {
            toast.success("WhatsApp device linked successfully!");
            addWhatsappLog(`[SUCCESS] Device linked: ${data.phoneNumber}`);
          }
        } else if (!isBackground) {
          addWhatsappLog(`WhatsApp Gateway disconnected. Please scan the QR code to pair.`);
        }
      }
    } catch (err: any) {
      if (!isBackground) {
        console.error("Failed to load WhatsApp link status:", err);
        addWhatsappLog(`[ERROR] Failed to query status: ${err.message}`);
      }
    } finally {
      if (!isBackground) setIsLoadingWhatsapp(false);
    }
  };

  useEffect(() => {
    fetchWhatsappStatus();
    const isPollingOn = config.whatsappPollingEnabled !== false;
    const intervalMs = (config.whatsappPollingIntervalMinutes || 1) * 60 * 1000;

    if (!isPollingOn) return;

    const interval = setInterval(() => {
      fetchWhatsappStatus(true);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [config.whatsappPollingEnabled, config.whatsappPollingIntervalMinutes]);

  useEffect(() => {
    if (!whatsappQrCode || whatsappStatus === "LINKED" || whatsappQrCountdown <= 0) return;

    const timer = setInterval(() => {
      setWhatsappQrCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFetchRealQrCode();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [whatsappQrCode, whatsappStatus]);

  const handleFetchRealQrCode = async () => {
    setIsLoadingWhatsapp(true);
    addWhatsappLog("Dispatching connect command to generate live QR code from WhatsApp VM...");
    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/whatsapp/connect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();

      if (res.ok && data.success && data.qrCode) {
        setWhatsappQrCode(data.qrCode);
        setWhatsappQrCountdown(45);
        toast.success("Live WhatsApp QR code generated successfully!");
        addWhatsappLog("Received live QR code payload from WhatsApp VM.");
      } else {
        const qrRes = await fetch("/api/admin/whatsapp/qr", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const qrData = await qrRes.json();
        if (qrRes.ok && qrData.qrCode) {
          setWhatsappQrCode(qrData.qrCode);
          setWhatsappQrCountdown(45);
          toast.success("Live WhatsApp QR code retrieved!");
          addWhatsappLog("Retrieved QR code payload from WhatsApp gateway.");
        } else {
          const errMsg = data.error || qrData.error || "QR code is not currently available from WhatsApp VM.";
          toast.error(errMsg);
          addWhatsappLog(`[WARNING] Failed to generate QR code: ${errMsg}`);
        }
      }
    } catch (err: any) {
      console.error("Error generating WhatsApp QR code:", err);
      toast.error("Network error requesting QR code from gateway.");
      addWhatsappLog(`[ERROR] QR code request exception: ${err.message}`);
    } finally {
      setIsLoadingWhatsapp(false);
    }
  };

  const handleReconnectWhatsapp = async () => {
    setIsLinkingWhatsapp(true);
    addWhatsappLog("Dispatching reconnect payload to WhatsApp VM...");
    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/whatsapp/reconnect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Reconnection triggered successfully!");
        addWhatsappLog("WhatsApp instance reconnected successfully.");
        fetchWhatsappStatus();
      } else {
        toast.error(data.error || "Failed to reconnect instance.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error reconnecting WhatsApp.");
    } finally {
      setIsLinkingWhatsapp(false);
    }
  };

  const handleUnlinkWhatsapp = async () => {
    triggerAdminConfirm(
      "Unlink WhatsApp Instance?",
      "Are you absolutely sure you want to unlink and log out the WhatsApp sender instance? This will suspend all WhatsApp OTP dispatch systems immediately!",
      "Unlink Instance",
      "warning",
      async () => {
        setIsLinkingWhatsapp(true);
        addWhatsappLog("Dispatching unlink payload to session manager...");

        try {
          let idToken = "mock-admin-token";
          const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
          if (!isMock && user) {
            idToken = await user.getIdToken();
          }

          const res = await fetch("/api/admin/whatsapp", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ action: "unlink" }),
          });

          const data = await res.json();
          if (res.ok && data.success) {
            setWhatsappStatus("UNLINKED");
            setWhatsappPhoneNumber(null);
            setWhatsappLinkedAt(null);
            addWhatsappLog("WhatsApp Session logged out and destroyed successfully.");
            toast.success("WhatsApp Gateway instance unlinked successfully.");
          } else {
            toast.error(data.error || "Unlink request failed.");
            addWhatsappLog(`[ERROR] Unlink failed: ${data.error}`);
          }
        } catch (err: any) {
          toast.error("Network error unlinking WhatsApp instance.");
          addWhatsappLog(`[ERROR] Unlink API error: ${err.message}`);
        } finally {
          setIsLinkingWhatsapp(false);
        }
      }
    );
  };

  const handleSendTestWhatsappMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      toast.error("Please enter a recipient phone number.");
      return;
    }

    if (testMessageType === "custom" && !testCustomMessage.trim()) {
      toast.error("Please enter custom message content.");
      return;
    }

    setIsSendingTestMessage(true);
    addWhatsappLog(`Dispatching test ${testMessageType === "test_otp" ? "OTP code" : "custom message"} to +${testPhone.trim()}...`);

    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/whatsapp/test-send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          phoneNumber: testPhone.trim(),
          type: testMessageType,
          message: testCustomMessage.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Test message sent!");
        addWhatsappLog(`[SUCCESS] Test message delivered to ${data.recipient || testPhone.trim()}`);
        addWhatsappLog(`Content: ${data.sentText}`);
        if (testMessageType === "custom") setTestCustomMessage("");
      } else {
        toast.error(data.error || "Failed to deliver WhatsApp message.");
        addWhatsappLog(`[ERROR] Test dispatch failed: ${data.error}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Network communication error.");
      addWhatsappLog(`[ERROR] Test dispatch exception: ${err.message}`);
    } finally {
      setIsSendingTestMessage(false);
    }
  };

  const handleSaveWhatsappApiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingApiConfig(true);
    addWhatsappLog("Applying and storing new WhatsApp API VM gateway configs...");

    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "save_api_config",
          whatsappApiUrl: whatsappApiUrlInput.trim(),
          whatsappApiKey: whatsappApiKeyInput.trim(),
          whatsappInstanceId: whatsappInstanceIdInput.trim(),
          whatsappAdminUsername: whatsappAdminUsernameInput.trim(),
          whatsappAdminPassword: whatsappAdminPasswordInput.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("WhatsApp API Credentials secured successfully!");
        addWhatsappLog("Success: WhatsApp API connection keys applied.");
        fetchWhatsappStatus();
      } else {
        toast.error(data.error || "Failed to save configuration.");
      }
    } catch (err: any) {
      toast.error("Network communication failure applying settings.");
      addWhatsappLog(`[ERROR] Save config failed: ${err.message}`);
    } finally {
      setIsSavingApiConfig(false);
    }
  };

  const bgClass = isDark ? "bg-[#0c0f17] text-white" : "bg-gray-50 text-gray-900";
  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full";
  const labelClass = isDark ? "text-gray-300" : "text-gray-900";

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
                <span className="material-symbols-outlined text-orange-500 text-[22px]">hub</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">WhatsApp Gateway Session Manager</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Link WhatsApp sender device, generate QR codes, and configure backend Baileys API endpoints.
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

        {/* Connection Status Banner */}
        <div className={cn(
          "p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4",
          whatsappStatus === "LINKED"
            ? "bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/25 text-emerald-900 dark:text-emerald-300"
            : "bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/25 text-amber-900 dark:text-amber-300"
        )}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-white relative",
              whatsappStatus === "LINKED"
                ? "bg-gradient-to-tr from-emerald-500 to-teal-600 shadow-[0_4px_12px_rgba(16,185,129,0.2)] animate-pulse"
                : "bg-gradient-to-tr from-amber-500 to-orange-600 shadow-[0_4px_12px_rgba(245,158,11,0.2)]"
            )}>
              <span className="material-symbols-outlined text-[30px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                {whatsappStatus === "LINKED" ? "cloud_done" : "cloud_off"}
              </span>
            </div>
            <div>
              <h3 className={cn("font-hanken font-extrabold text-base tracking-tight uppercase", isDark ? "text-white" : "text-gray-900")}>
                Gateway Status: {whatsappStatus === "LINKED" ? "ACTIVE & LINKED" : "DISCONNECTED / OFFLINE"}
              </h3>
              {whatsappStatus === "LINKED" ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                  Node: <span className="font-mono select-all font-bold">{whatsappPhoneNumber}</span> • Connected: <span className="font-mono font-bold">{whatsappLinkedAt ? new Date(whatsappLinkedAt).toLocaleString() : "Just now"}</span>
                </p>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                  WhatsApp OTP dispatch rails are currently disabled. Connect a sender device below to resume.
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={isLoadingWhatsapp}
              onClick={() => fetchWhatsappStatus()}
              className="px-4 py-2.5 bg-black hover:bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isLoadingWhatsapp ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[16px]">refresh</span>}
              <span>Refresh Status</span>
            </button>

            {whatsappStatus === "LINKED" && (
              <>
                <button
                  type="button"
                  disabled={isLinkingWhatsapp}
                  onClick={handleReconnectWhatsapp}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isLinkingWhatsapp ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[16px]">sync</span>}
                  <span>Reconnect</span>
                </button>

                <button
                  type="button"
                  disabled={isLinkingWhatsapp}
                  onClick={handleUnlinkWhatsapp}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-[0_4px_12px_rgba(220,38,38,0.2)] disabled:opacity-50"
                >
                  {isLinkingWhatsapp ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[16px]">logout</span>}
                  <span>Disconnect Device</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Test WhatsApp Message & OTP Dispatch Card */}
        <div className={cn("p-6 rounded-2xl border transition-all duration-300 space-y-4", panelClass)}>
          <div className="border-b pb-3.5 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-orange-500 text-[22px]">send</span>
              <div>
                <h4 className="font-extrabold text-xs uppercase tracking-wider text-gray-900 dark:text-white">
                  Test WhatsApp Message & OTP Dispatch Tool
                </h4>
                <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">
                  Send live test verification OTP codes or custom WhatsApp messages to any recipient phone number
                </p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded text-[8.5px] font-black uppercase bg-orange-500/10 text-orange-500 border border-orange-500/20">
              Admin Diagnostic Tool
            </span>
          </div>

          <form onSubmit={handleSendTestWhatsappMessage} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1 sm:col-span-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Recipient Phone Number *</label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. +2348033123456 or 08033123456"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1 sm:col-span-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Message Type</label>
                <select
                  value={testMessageType}
                  onChange={(e) => setTestMessageType(e.target.value as any)}
                  className={cn(inputClass, "cursor-pointer font-bold")}
                >
                  <option value="test_otp">Test Verification OTP Code</option>
                  <option value="custom">Custom Text Message</option>
                </select>
              </div>

              <div className="sm:col-span-1 flex items-end">
                <button
                  type="submit"
                  disabled={isSendingTestMessage}
                  className="w-full h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {isSendingTestMessage ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">send</span>}
                  <span>Dispatch WhatsApp Message</span>
                </button>
              </div>
            </div>

            {testMessageType === "custom" && (
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Custom Message Body *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Enter message text to deliver via connected WhatsApp Gateway..."
                  value={testCustomMessage}
                  onChange={(e) => setTestCustomMessage(e.target.value)}
                  className={cn("p-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full resize-none", inputClass)}
                />
              </div>
            )}
          </form>
        </div>

        {/* Device Information Card */}
        {whatsappStatus === "LINKED" && (
          <div className={cn("p-6 rounded-2xl border transition-all duration-300 space-y-5", panelClass)}>
            <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-emerald-500 text-[26px]">verified</span>
                <div>
                  <h4 className="font-extrabold text-sm uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Active WhatsApp Sender Device Details
                  </h4>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">
                    Device is connected and ready for automated OTP & notification dispatch
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Status: Connected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-gray-200/60 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 space-y-1">
                <span className="text-[10px] font-black uppercase text-gray-400 block tracking-wider">Device Instance ID</span>
                <strong className="font-extrabold text-sm text-gray-900 dark:text-white block font-mono">
                  {whatsappInstanceIdInput || "Active Instance"}
                </strong>
              </div>

              <div className="p-4 rounded-xl border border-gray-200/60 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 space-y-1">
                <span className="text-[10px] font-black uppercase text-gray-400 block tracking-wider">Phone Number</span>
                <strong className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400 block font-mono">
                  {whatsappPhoneNumber || "Connected Sender"}
                </strong>
              </div>

              <div className="p-4 rounded-xl border border-gray-200/60 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 space-y-1">
                <span className="text-[10px] font-black uppercase text-gray-400 block tracking-wider">Status</span>
                <strong className="font-extrabold text-sm text-emerald-500 block uppercase">
                  Connected
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* QR Pairing & API Config Grid */}
        {whatsappStatus === "UNLINKED" && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className={cn("rounded-2xl p-6 md:col-span-3 border transition-colors duration-300 space-y-6", panelClass)}>
              <div className="border-b pb-4 flex justify-between items-center">
                <div>
                  <h4 className={cn("font-hanken font-extrabold text-sm uppercase", labelClass)}>
                    Link WhatsApp Sender Device
                  </h4>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Setup professional OTP & notification delivery systems</p>
                </div>

                <button
                  type="button"
                  disabled={isLoadingWhatsapp}
                  onClick={handleFetchRealQrCode}
                  className="px-3 py-1.5 bg-[#FC7A00] text-white hover:brightness-105 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all flex items-center gap-1"
                >
                  {isLoadingWhatsapp ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[14px]">refresh</span>}
                  <span>Generate Real QR</span>
                </button>
              </div>

              <div className="flex flex-col items-center py-6 text-center space-y-5">
                <p className="text-xs text-gray-400 max-w-sm leading-relaxed font-semibold">
                  Open WhatsApp on your phone, navigate to <span className="text-[#FC7A00] font-bold">Linked Devices</span>, choose <span className="text-[#FC7A00] font-bold">Link a Device</span>, and point your camera to scan this QR code:
                </p>

                <div className={cn("p-4 rounded-2xl bg-white border inline-block relative overflow-hidden group shadow-xs transition-colors", isDark ? "border-gray-800" : "border-gray-150")}>
                  {whatsappQrCode ? (
                    <img
                      src={whatsappQrCode}
                      alt="WhatsApp Pairing QR Code"
                      className="w-48 h-48 object-contain transition-transform group-hover:scale-102"
                    />
                  ) : (
                    <div className="w-48 h-48 bg-gray-50 dark:bg-gray-800/50 rounded-xl flex flex-col items-center justify-center p-4 text-center">
                      {isLoadingWhatsapp ? <ButtonSpinner /> : <span className="material-symbols-outlined text-gray-400 text-3xl mb-1">qr_code_2</span>}
                      <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 mt-2">
                        {isLoadingWhatsapp ? "Generating QR Code..." : "Click Below to Generate QR Code"}
                      </span>
                    </div>
                  )}
                  {isLinkingWhatsapp && (
                    <div className="absolute inset-0 bg-white/90 dark:bg-black/90 flex flex-col items-center justify-center p-4">
                      <ButtonSpinner />
                      <p className="text-[10px] font-black uppercase text-gray-500 mt-2">Pairing device...</p>
                    </div>
                  )}
                </div>

                {whatsappQrCode && (
                  <div className="flex flex-col items-center gap-2 pt-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#FC7A00] bg-[#FC7A00]/10 px-3.5 py-1.5 rounded-full border border-[#FC7A00]/20">
                      <span className="material-symbols-outlined text-[15px] animate-spin">timer</span>
                      <span>
                        {whatsappQrCountdown > 0
                          ? `QR code expires in ${whatsappQrCountdown}s`
                          : "Refreshing QR code..."}
                      </span>
                    </div>

                    <div className="w-48 bg-gray-200 dark:bg-gray-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#FC7A00] h-full transition-all duration-1000 ease-linear rounded-full"
                        style={{ width: `${Math.max(0, (whatsappQrCountdown / 45) * 100)}%` }}
                      />
                    </div>

                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                      Auto-detecting device link status every 3s...
                    </p>
                  </div>
                )}

                <div className="w-full max-w-sm pt-2">
                  <button
                    type="button"
                    disabled={isLoadingWhatsapp}
                    onClick={handleFetchRealQrCode}
                    className="w-full py-3.5 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    {isLoadingWhatsapp ? <><ButtonSpinner /> Generating Live QR Code...</> : <><span className="material-symbols-outlined text-[18px]">qr_code_2</span> Generate / Refresh Real QR Code</>}
                  </button>
                </div>
              </div>
            </div>

            {/* API Config Panel */}
            <div className={cn("rounded-2xl p-6 md:col-span-2 border transition-colors duration-300 space-y-4", panelClass)}>
              <div className="border-b pb-3.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-[#FC7A00]">API Configuration Keys</h4>
                <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Manage live connection to backend WhatsApp API VM</p>
              </div>

              <form onSubmit={handleSaveWhatsappApiConfig} className="space-y-3.5 text-left">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-gray-400">WHATSAPP_API_URL</label>
                  <input
                    type="url"
                    value={whatsappApiUrlInput}
                    onChange={(e) => setWhatsappApiUrlInput(e.target.value)}
                    placeholder="e.g. http://192.168.1.100:3055"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-gray-400">WHATSAPP_API_KEY</label>
                  <input
                    type="password"
                    value={whatsappApiKeyInput}
                    onChange={(e) => setWhatsappApiKeyInput(e.target.value)}
                    placeholder="Enter API apikey"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-gray-400">WHATSAPP_INSTANCE_ID</label>
                  <input
                    type="text"
                    value={whatsappInstanceIdInput}
                    onChange={(e) => setWhatsappInstanceIdInput(e.target.value)}
                    placeholder="e.g. my-session-instance"
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-gray-400">Admin User</label>
                    <input
                      type="text"
                      value={whatsappAdminUsernameInput}
                      onChange={(e) => setWhatsappAdminUsernameInput(e.target.value)}
                      placeholder="Username"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-gray-400">Admin Pass</label>
                    <input
                      type="password"
                      value={whatsappAdminPasswordInput}
                      onChange={(e) => setWhatsappAdminPasswordInput(e.target.value)}
                      placeholder="Password"
                      className={inputClass}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSavingApiConfig}
                  className="w-full py-3.5 bg-black hover:bg-[#FC7A00] text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingApiConfig ? <><ButtonSpinner /> Saving Configs...</> : "Save API Configuration"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Live Logs Terminal */}
        <div className={cn("rounded-2xl p-6 border transition-colors duration-300 space-y-4", panelClass)}>
          <div className="flex justify-between items-center border-b pb-3">
            <div>
              <h4 className={cn("font-hanken font-extrabold text-xs uppercase", labelClass)}>
                WhatsApp Gateway System Console Logs
              </h4>
              <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Real-time status updates and delivery heartbeats</p>
            </div>

            <button
              type="button"
              onClick={() => setWhatsappLogs([
                `[${new Date().toLocaleTimeString()}] System console buffer cleared.`,
                `[${new Date().toLocaleTimeString()}] Gateway Status: ${whatsappStatus}`
              ])}
              className={cn(
                "px-3 py-1 border hover:border-red-500 hover:text-red-500 transition-all text-[9px] font-black uppercase rounded-lg cursor-pointer",
                isDark ? "border-gray-700 text-gray-400" : "border-gray-200 text-gray-500"
              )}
            >
              Clear Logs
            </button>
          </div>

          <div className="bg-black text-emerald-400 font-mono text-[11px] rounded-xl p-4 h-48 overflow-y-auto border border-gray-800 custom-scrollbar shadow-inner flex flex-col-reverse gap-1.5 selection:bg-emerald-900 selection:text-white">
            {whatsappLogs.map((log, idx) => (
              <div key={idx} className="leading-relaxed whitespace-pre-wrap select-text truncate">
                {log}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Confirmation Modal */}
      {adminActionModal.isOpen && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className={cn("w-[92vw] sm:w-full max-w-sm p-6 rounded-3xl border text-center shadow-2xl space-y-4", panelClass)}>
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center mx-auto border",
              adminActionModal.actionStyle === "danger" && "bg-red-50 text-red-500 border-red-200 dark:bg-red-950/40 dark:border-red-900/50",
              adminActionModal.actionStyle === "warning" && "bg-amber-50 text-amber-500 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900/50"
            )}>
              <span className="material-symbols-outlined text-[24px]">gpp_maybe</span>
            </div>

            <div>
              <h4 className="font-extrabold text-sm uppercase text-gray-900 dark:text-white">{adminActionModal.title}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium leading-relaxed">{adminActionModal.message}</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setAdminActionModal((prev) => ({ ...prev, isOpen: false }))}
                className="py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl text-xs font-black uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdminActionModal((prev) => ({ ...prev, isOpen: false }));
                  adminActionModal.onConfirm();
                }}
                className="py-2.5 bg-red-600 text-white rounded-xl text-xs font-black uppercase cursor-pointer hover:bg-red-700"
              >
                {adminActionModal.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CpanelWhatsappPage() {
  return (
    <CpanelRouteGuard requiredPermission="whatsapp.manage">
      <CpanelWhatsappPageContent />
    </CpanelRouteGuard>
  );
}