"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ButtonSpinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

function CpanelEmailConnectContent() {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useCpanelTheme();

  // Configuration States
  const [emailApiUrlInput, setEmailApiUrlInput] = useState("https://whatsapp-b5os.onrender.com/api/email/send");
  const [emailApiKeyInput, setEmailApiKeyInput] = useState("");
  const [emailApiKeyMasked, setEmailApiKeyMasked] = useState("email_live_4a7t...*******");
  const [emailInstanceIdInput, setEmailInstanceIdInput] = useState("inst_33647102");
  const [emailAdminUsernameInput, setEmailAdminUsernameInput] = useState("");
  const [emailAdminPasswordInput, setEmailAdminPasswordInput] = useState("");
  const [senderNameInput, setSenderNameInput] = useState("E-Global Pay");
  const [senderEmailInput, setSenderEmailInput] = useState("no-reply@eglobalpay.com");
  const [status, setStatus] = useState<"CONNECTED" | "DISCONNECTED">("CONNECTED");
  const [grantedScopes, setGrantedScopes] = useState<string[]>(["email.send", "email.otp", "email.templates", "email.logs"]);
  const [dailyLimit, setDailyLimit] = useState("2,000,000");
  const [dailyUsed, setDailyUsed] = useState(1);
  const [lastActivity, setLastActivity] = useState<string>(new Date().toLocaleString());
  const [apiKeysList, setApiKeysList] = useState<any[]>([]);

  // UI & Modal States
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [showRawKey, setShowRawKey] = useState<Record<string, boolean>>({});
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // New Key Form States
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyUrl, setNewKeyUrl] = useState("https://whatsapp-b5os.onrender.com/api/email/send");
  const [newKeySecret, setNewKeySecret] = useState("");
  const [newKeyInstanceId, setNewKeyInstanceId] = useState("inst_33647102");
  const [newKeyAdminUsername, setNewKeyAdminUsername] = useState("");
  const [newKeyAdminPassword, setNewKeyAdminPassword] = useState("");
  const [newKeySenderName, setNewKeySenderName] = useState("E-Global Pay");
  const [newKeySenderEmail, setNewKeySenderEmail] = useState("no-reply@eglobalpay.com");

  // Test Email Form
  const [testRecipient, setTestRecipient] = useState("");
  const [testSubject, setTestSubject] = useState("Email Gateway Connection Test - E-Global Pay");
  const [testMessage, setTestMessage] = useState("Hello! This is a live connection test email sent from E-Global Control Panel.");

  // Console Logs
  const [logs, setLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] Email Gateway engine initialized.`,
    `[${new Date().toLocaleTimeString()}] Target Provider: WhatsAPI HUB Multi-Device Email Gateway.`
  ]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/email-connect", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();

      if (res.ok && data.success && data.config) {
        const c = data.config;
        if (c.emailApiUrl) setEmailApiUrlInput(c.emailApiUrl);
        if (c.emailApiKeyMasked) setEmailApiKeyMasked(c.emailApiKeyMasked);
        if (c.emailInstanceId) setEmailInstanceIdInput(c.emailInstanceId);
        if (c.emailAdminUsername) setEmailAdminUsernameInput(c.emailAdminUsername);
        if (c.senderName) setSenderNameInput(c.senderName);
        if (c.senderEmail) setSenderEmailInput(c.senderEmail);
        if (c.status) setStatus(c.status);
        if (Array.isArray(c.grantedScopes)) setGrantedScopes(c.grantedScopes);
        if (c.dailyLimit) setDailyLimit(c.dailyLimit);
        if (typeof c.dailyUsed === "number") setDailyUsed(c.dailyUsed);
        if (c.lastActivity) setLastActivity(new Date(c.lastActivity).toLocaleString());
        if (Array.isArray(c.apiKeys)) setApiKeysList(c.apiKeys);

        addLog(`Status refreshed: ${c.status || "CONNECTED"}. Gateway active.`);
      }
    } catch (err: any) {
      console.error("Failed to fetch Email Connect config:", err);
      addLog(`[ERROR] Status fetch failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    addLog("Saving Email Gateway configuration parameters...");

    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/email-connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "save_config",
          emailApiUrl: emailApiUrlInput.trim(),
          emailApiKey: emailApiKeyInput.trim(),
          emailInstanceId: emailInstanceIdInput.trim(),
          emailAdminUsername: emailAdminUsernameInput.trim(),
          emailAdminPassword: emailAdminPasswordInput.trim(),
          senderName: senderNameInput.trim(),
          senderEmail: senderEmailInput.trim(),
          grantedScopes,
          dailyLimit,
          status,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Email API configurations saved successfully!");
        addLog("[SUCCESS] Saved new Email API settings and secret keys.");
        setEmailApiKeyInput("");
        fetchConfig();
      } else {
        toast.error(data.error || "Failed to save configuration.");
        addLog(`[ERROR] Save failed: ${data.error}`);
      }
    } catch (err: any) {
      toast.error("Network communication failure saving settings.");
      addLog(`[ERROR] Save exception: ${err.message}`);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = status === "CONNECTED" ? "DISCONNECTED" : "CONNECTED";
    addLog(`Toggling Gateway status to ${newStatus}...`);

    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/email-connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "toggle_status", newStatus }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatus(newStatus);
        toast.success(`Email Gateway set to ${newStatus}!`);
        addLog(`[SUCCESS] Status set to ${newStatus}.`);
      } else {
        toast.error(data.error || "Failed to update status.");
      }
    } catch (err: any) {
      toast.error("Network error toggling status.");
      addLog(`[ERROR] Toggle exception: ${err.message}`);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient.trim()) {
      toast.error("Please enter a target recipient email address.");
      return;
    }

    setIsSendingTest(true);
    addLog(`Dispatching test connection email to <${testRecipient.trim()}>...`);

    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/email-connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "test_connection",
          targetEmail: testRecipient.trim(),
          customSubject: testSubject.trim(),
          customMessage: testMessage.trim(),
          dailyUsed,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Test connection email dispatched successfully!");
        addLog(`[SUCCESS] Test email delivered to ${testRecipient.trim()}`);
        setDailyUsed((prev) => prev + 1);
        setLastActivity(new Date().toLocaleString());
        fetchConfig();
      } else {
        toast.error(data.error || "Test dispatch failed.");
        addLog(`[ERROR] Test dispatch failed: ${data.error}`);
      }
    } catch (err: any) {
      toast.error("Network communication error during test dispatch.");
      addLog(`[ERROR] Exception: ${err.message}`);
    } finally {
      setIsSendingTest(false);
    }
  };

  const toggleScope = (scope: string) => {
    setGrantedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeySecret.trim()) {
      toast.error("Please enter an API Secret Key.");
      return;
    }

    setIsCreatingKey(true);
    addLog("Creating and registering new Email API Key credential...");

    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/email-connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "create_key",
          keyName: newKeyName.trim() || newKeySenderName.trim() || "New Email API Key",
          emailApiUrl: newKeyUrl.trim(),
          emailApiKey: newKeySecret.trim(),
          emailInstanceId: newKeyInstanceId.trim(),
          emailAdminUsername: newKeyAdminUsername.trim(),
          emailAdminPassword: newKeyAdminPassword.trim(),
          senderName: newKeySenderName.trim(),
          senderEmail: newKeySenderEmail.trim(),
          grantedScopes,
          dailyLimit,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("New Email API Key registered and connected!");
        addLog(`[SUCCESS] Registered Email API key: ${newKeyName.trim() || newKeySenderName.trim()}`);
        setIsCreateModalOpen(false);
        setNewKeySecret("");
        setNewKeyName("");
        fetchConfig();
      } else {
        toast.error(data.error || "Failed to create Email API Key.");
        addLog(`[ERROR] Create key failed: ${data.error}`);
      }
    } catch (err: any) {
      toast.error("Network error creating Email API Key.");
      addLog(`[ERROR] Create key exception: ${err.message}`);
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to delete this Email API Key entry?")) return;

    addLog(`Deleting Email API Key [${keyId}]...`);
    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/email-connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "delete_key", keyId }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Email API Key deleted.");
        addLog(`[SUCCESS] Key [${keyId}] deleted.`);
        fetchConfig();
      } else {
        toast.error(data.error || "Failed to delete key.");
      }
    } catch (err: any) {
      toast.error("Error deleting API key.");
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

        {/* Header Bar */}
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
                <span className="material-symbols-outlined text-orange-500 text-[22px]">alternate_email</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Email Connect & Gateway Portal</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Manage dedicated, project-isolated Email API keys, external gateway credentials, and test connection dispatches.
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

        {/* Top Dark Header Card (Matching Screenshot Header) */}
        <div className="bg-[#0b1329] text-white rounded-2xl p-6 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
          <div>
            <span className="px-2.5 py-0.5 rounded text-[9px] font-black uppercase bg-[#FC7A00]/20 text-[#FC7A00] border border-[#FC7A00]/30 tracking-wider">
              INDEPENDENT CREDENTIALS
            </span>
            <h2 className="text-lg md:text-xl font-extrabold tracking-tight mt-2">Email API Keys & External Integrations</h2>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Manage dedicated, project-isolated Email API keys for payment gateways, mobile apps, and multi-project dispatches.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs uppercase rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>Create Email API Key</span>
          </button>
        </div>

        {/* Summary Metric Cards (Matching Screenshot) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={cn("p-4 rounded-2xl border flex items-center justify-between gap-3", panelClass)}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-500 flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">key</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-gray-400 block tracking-wider">Total Email API Keys</span>
                <span className="text-xl font-black">{apiKeysList.length || 1}</span>
              </div>
            </div>
          </div>

          <div className={cn("p-4 rounded-2xl border flex items-center justify-between gap-3", panelClass)}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">check_circle</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-gray-400 block tracking-wider">Active Keys</span>
                <span className="text-xl font-black text-emerald-500">
                  {apiKeysList.filter((k) => k.status === "CONNECTED" || k.isActive !== false).length || (status === "CONNECTED" ? 1 : 0)}
                </span>
              </div>
            </div>
          </div>

          <div className={cn("p-4 rounded-2xl border flex items-center justify-between gap-3", panelClass)}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-500/10 border border-gray-500/20 text-gray-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">block</span>
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-gray-400 block tracking-wider">Inactive Keys</span>
                <span className="text-xl font-black text-gray-400">
                  {apiKeysList.filter((k) => k.status === "DISCONNECTED" || k.isActive === false).length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Configured Email API Keys Card */}
        <div className={cn("p-6 rounded-2xl border space-y-5", panelClass)}>
          <div className="flex items-center justify-between border-b pb-4 flex-wrap gap-2">
            <div>
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-gray-900 dark:text-white">
                Configured Email API Keys ({apiKeysList.length || 1})
              </h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">
                Each key generates an independent <code className="text-[#FC7A00]">email_live_[id]</code> credential bound to its project tenant.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="px-3 py-1.5 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>Create Key</span>
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={fetchConfig}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isLoading ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[16px]">refresh</span>}
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Directory of Keys */}
          {apiKeysList.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">No keys found. Click Create Key above to add one.</div>
          ) : (
            apiKeysList.map((keyItem, index) => {
              const keyId = keyItem.id || `key-${index}`;
              const isVisible = Boolean(showRawKey[keyId]);

              return (
                <div key={keyId} className="border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-4 bg-gray-50/50 dark:bg-gray-900/40">
                  {/* Top Row: Icon, Name, Status Badge, Instance Tag */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[22px]">sim_card</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">
                            {index + 1}. {keyItem.name || keyItem.senderName || senderNameInput || "Global Email Key"}
                          </h4>
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
                            keyItem.status === "CONNECTED" || keyItem.isActive !== false
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                          )}>
                            {keyItem.status === "CONNECTED" || keyItem.isActive !== false ? "• Connected" : "• Disconnected"}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-gray-400 font-medium">
                          {keyItem.emailApiKeyMasked || emailApiKeyMasked} <span className="text-gray-500">({keyItem.emailInstanceId || emailInstanceIdInput || "inst_33647102"})</span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteApiKey(keyId)}
                      className="px-2.5 py-1 text-xs font-extrabold text-rose-500 hover:text-rose-600 bg-rose-500/10 border border-rose-500/20 rounded-xl cursor-pointer transition-all"
                      title="Delete Key"
                    >
                      Delete
                    </button>
                  </div>

                  {/* Masked API Key Input with View Button */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={isVisible ? "text" : "password"}
                        readOnly
                        value={isVisible ? (keyItem.emailApiKey || emailApiKeyInput || "email_live_4a7t998273xkw129837") : (keyItem.emailApiKeyMasked || emailApiKeyMasked)}
                        className={cn(inputClass, "font-mono font-bold bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 select-all")}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowRawKey((prev) => ({ ...prev, [keyId]: !prev[keyId] }))}
                      className="px-4 h-10 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isVisible ? "visibility_off" : "visibility"}
                      </span>
                      <span>{isVisible ? "Hide Key" : "View Key"}</span>
                    </button>
                  </div>

                  {/* Daily Usage & Last Activity Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white dark:bg-gray-950 p-4 rounded-xl border border-gray-200/60 dark:border-gray-800/80">
                    <div>
                      <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Daily Today / Limit</span>
                      <strong className="font-extrabold text-sm text-gray-900 dark:text-white block mt-0.5 font-mono">
                        {keyItem.dailyUsed ?? dailyUsed} ({keyItem.dailyLimit || dailyLimit})
                      </strong>
                    </div>

                    <div>
                      <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Last Activity</span>
                      <strong className="font-extrabold text-xs text-gray-700 dark:text-gray-300 block mt-0.5 font-mono">
                        {keyItem.lastActivity ? new Date(keyItem.lastActivity).toLocaleString() : lastActivity}
                      </strong>
                    </div>
                  </div>

                  {/* Granted Scopes Badges */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Granted Scopes</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(keyItem.grantedScopes || grantedScopes).map((scope: string) => (
                        <span
                          key={scope}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Test Email Connection Diagnostic Card */}
        <div className={cn("p-6 rounded-2xl border transition-all duration-300 space-y-4", panelClass)}>
          <div className="border-b pb-3.5 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-orange-500 text-[22px]">forward_to_inbox</span>
              <div>
                <h4 className="font-extrabold text-xs uppercase tracking-wider text-gray-900 dark:text-white">
                  Test Email Gateway Connection Tool
                </h4>
                <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">
                  Send a live test verification email to any recipient email address to confirm gateway health
                </p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded text-[8.5px] font-black uppercase bg-orange-500/10 text-orange-500 border border-orange-500/20">
              Admin Diagnostic Tool
            </span>
          </div>

          <form onSubmit={handleSendTestEmail} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1 sm:col-span-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Recipient Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. admin@example.com"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1 sm:col-span-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Email Subject Line *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter subject"
                  value={testSubject}
                  onChange={(e) => setTestSubject(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="sm:col-span-1 flex items-end">
                <button
                  type="submit"
                  disabled={isSendingTest}
                  className="w-full h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {isSendingTest ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">send</span>}
                  <span>Dispatch Test Email</span>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-gray-400 block">Custom Message Body</label>
              <textarea
                rows={2}
                placeholder="Enter test email message body..."
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className={cn("p-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full resize-none", inputClass)}
              />
            </div>
          </form>
        </div>

        {/* API Credentials & Settings Panel */}
        <div id="api-config-section" className={cn("p-6 rounded-2xl border transition-all duration-300 space-y-4", panelClass)}>
          <div className="border-b pb-3.5">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#FC7A00]">Email API Gateway Credentials & Parameters</h4>
            <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Configure live connection variables for the WhatsAPI Email Gateway</p>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-400 block">EMAIL_API_URL Endpoint</label>
                <input
                  type="url"
                  required
                  value={emailApiUrlInput}
                  onChange={(e) => setEmailApiUrlInput(e.target.value)}
                  placeholder="e.g. https://whatsapp-b5os.onrender.com/api/email/send"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-400 block">EMAIL_INSTANCE_ID / PROJECT_ID</label>
                <input
                  type="text"
                  required
                  value={emailInstanceIdInput}
                  onChange={(e) => setEmailInstanceIdInput(e.target.value)}
                  placeholder="e.g. inst_33647102"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-[9px] font-black uppercase text-gray-400 block">EMAIL_API_KEY (Leave blank to keep existing)</label>
                <input
                  type="password"
                  value={emailApiKeyInput}
                  onChange={(e) => setEmailApiKeyInput(e.target.value)}
                  placeholder="Enter new Email API Secret Key"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-gray-400 block">Admin Username</label>
                  <input
                    type="text"
                    value={emailAdminUsernameInput}
                    onChange={(e) => setEmailAdminUsernameInput(e.target.value)}
                    placeholder="Gateway Admin Username"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-gray-400 block">Admin Password</label>
                  <input
                    type="password"
                    value={emailAdminPasswordInput}
                    onChange={(e) => setEmailAdminPasswordInput(e.target.value)}
                    placeholder="Gateway Admin Password"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-400 block">Default Sender Name</label>
                <input
                  type="text"
                  required
                  value={senderNameInput}
                  onChange={(e) => setSenderNameInput(e.target.value)}
                  placeholder="e.g. E-Global Pay"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-gray-400 block">Default Sender Email</label>
                <input
                  type="email"
                  required
                  value={senderEmailInput}
                  onChange={(e) => setSenderEmailInput(e.target.value)}
                  placeholder="e.g. no-reply@eglobalpay.com"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Granted Scopes Checkboxes */}
            <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-800">
              <label className="text-[9px] font-black uppercase text-gray-400 block">Granted API Scopes</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {["email.send", "email.otp", "email.templates", "email.logs"].map((sc) => (
                  <label key={sc} className="flex items-center gap-2 cursor-pointer text-xs font-mono font-bold">
                    <input
                      type="checkbox"
                      checked={grantedScopes.includes(sc)}
                      onChange={() => toggleScope(sc)}
                      className="rounded text-[#FC7A00] focus:ring-[#FC7A00]"
                    />
                    <span>{sc}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingConfig}
              className="w-full py-3.5 bg-black dark:bg-[#FC7A00] hover:bg-[#FC7A00] text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isSavingConfig ? <><ButtonSpinner /> Saving Configurations...</> : "Save Email API Configuration"}
            </button>
          </form>
        </div>

        {/* Live Logs Terminal */}
        <div className={cn("rounded-2xl p-6 border transition-colors duration-300 space-y-4", panelClass)}>
          <div className="flex justify-between items-center border-b pb-3">
            <div>
              <h4 className={cn("font-extrabold text-xs uppercase", isDark ? "text-gray-200" : "text-gray-800")}>
                Email Gateway System Console Logs
              </h4>
              <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Real-time status updates and test connection outputs</p>
            </div>

            <button
              type="button"
              onClick={() => setLogs([
                `[${new Date().toLocaleTimeString()}] Console buffer cleared.`,
                `[${new Date().toLocaleTimeString()}] Status: ${status}`
              ])}
              className={cn(
                "px-3 py-1 border hover:border-red-500 hover:text-red-500 transition-all text-[9px] font-black uppercase rounded-lg cursor-pointer",
                isDark ? "border-gray-700 text-gray-400" : "border-gray-200 text-gray-500"
              )}
            >
              Clear Logs
            </button>
          </div>

          <div className="bg-black text-emerald-400 font-mono text-[11px] rounded-xl p-4 h-44 overflow-y-auto border border-gray-800 custom-scrollbar shadow-inner flex flex-col-reverse gap-1.5 selection:bg-emerald-900 selection:text-white">
            {logs.map((log, idx) => (
              <div key={idx} className="leading-relaxed whitespace-pre-wrap select-text truncate">
                {log}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Create Email API Key Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100005] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className={cn("w-[94vw] sm:w-full max-w-lg p-6 rounded-3xl border shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto no-scrollbar", panelClass)}>
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">add_circle</span>
                <h3 className="font-extrabold text-sm uppercase text-gray-900 dark:text-white">Create Email API Key</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-black dark:hover:text-white flex items-center justify-center cursor-pointer border-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateApiKey} className="space-y-4 text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Key Name / Description</label>
                <input
                  type="text"
                  placeholder="e.g. Mobile App Email Key or Gateway Sender 2"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">EMAIL_API_KEY Secret *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. email_live_4a7t998273xkw129837 or inst_33647102"
                  value={newKeySecret}
                  onChange={(e) => setNewKeySecret(e.target.value)}
                  className={cn(inputClass, "font-mono font-bold")}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">API Endpoint URL</label>
                  <input
                    type="url"
                    value={newKeyUrl}
                    onChange={(e) => setNewKeyUrl(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Instance ID / Project ID</label>
                  <input
                    type="text"
                    value={newKeyInstanceId}
                    onChange={(e) => setNewKeyInstanceId(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Admin Username</label>
                  <input
                    type="text"
                    placeholder="Gateway Username"
                    value={newKeyAdminUsername}
                    onChange={(e) => setNewKeyAdminUsername(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Admin Password</label>
                  <input
                    type="password"
                    placeholder="Gateway Password"
                    value={newKeyAdminPassword}
                    onChange={(e) => setNewKeyAdminPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Sender Name</label>
                  <input
                    type="text"
                    value={newKeySenderName}
                    onChange={(e) => setNewKeySenderName(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Sender Email</label>
                  <input
                    type="email"
                    value={newKeySenderEmail}
                    onChange={(e) => setNewKeySenderEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-black uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingKey}
                  className="flex-1 py-3 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isCreatingKey ? <ButtonSpinner /> : "Create & Connect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CpanelEmailConnectPage() {
  return (
    <CpanelRouteGuard requiredPermission="email_connect.manage">
      <CpanelEmailConnectContent />
    </CpanelRouteGuard>
  );
}
