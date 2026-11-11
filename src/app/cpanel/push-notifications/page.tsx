"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { uploadImageSecurely } from "@/lib/image-upload";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import Link from "next/link";

const ButtonSpinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

interface PushNotificationLog {
  id: string;
  title: string;
  body: string;
  type: "promo" | "system" | "security";
  imageUrl?: string;
  url?: string;
  target: "all" | "user";
  targetUserId?: string | null;
  sentCount: number;
  targetCount: number;
  errorsCount: number;
  adminEmail: string;
  createdAt: string;
}

interface Metrics {
  totalBroadcasts: number;
  totalSent: number;
  activeTokens: number;
}

function PushNotificationsContent() {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useCpanelTheme();

  // Admin lock validation
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("admin_session_unlocked") === "true";
    }
    return false;
  });
  const [adminPin, setAdminPin] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Styling classes
  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full px-3.5 py-2.5 text-xs outline-none font-semibold w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full px-3.5 py-2.5 text-xs outline-none font-semibold w-full";

  // Data states
  const [logs, setLogs] = useState<PushNotificationLog[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ totalBroadcasts: 0, totalSent: 0, activeTokens: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  // Form states inside Create / Edit Modal Drawer
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [target, setTarget] = useState<"all" | "user">("all");
  const [targetUserId, setTargetUserId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"promo" | "system" | "security">("promo");
  const [imageUrl, setImageUrl] = useState("");
  const [url, setUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Delete modal state
  const [deletingLog, setDeletingLog] = useState<PushNotificationLog | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Full image preview modal state
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);

  // Check CPanel cookie session on mount
  useEffect(() => {
    const checkCPanelSession = async () => {
      try {
        const res = await fetch("/api/admin/auth/session");
        const data = await res.json();
        if (res.ok && data.success && data.user) {
          setIsAdminUnlocked(true);
          setAdminEmail(data.user.email);
          if (typeof window !== "undefined") {
            sessionStorage.setItem("admin_session_unlocked", "true");
          }
        } else {
          const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
          if (!isMock) {
            setIsAdminUnlocked(false);
            if (typeof window !== "undefined") {
              sessionStorage.removeItem("admin_session_unlocked");
            }
          } else {
            setIsAdminUnlocked(true);
          }
        }
      } catch (err) {
        console.warn("No active admin cookie session found:", err);
      }
    };
    checkCPanelSession();
  }, []);

  useEffect(() => {
    if (user?.email && !adminEmail) {
      setAdminEmail(user.email);
    }
  }, [user, adminEmail]);

  useEffect(() => {
    if (isAdminUnlocked) {
      fetchLogs();
    }
  }, [isAdminUnlocked]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const isMock = sessionStorage.getItem("mock") === "true";
      let idToken = "mock-admin-token";
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/notifications/push", {
        headers: { "Authorization": `Bearer ${idToken}` }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setLogs(data.logs || []);
        if (data.metrics) setMetrics(data.metrics);
      } else {
        toast.error(data.error || "Failed to fetch push notification logs.");
      }
    } catch {
      toast.error("Network communication failure loading push logs.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingPin(true);

    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail.trim(), pin: adminPin.trim() })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsAdminUnlocked(true);
        toast.success(data.message || "Identity Verified. Access Granted!");
      } else {
        toast.error(data.error || "Invalid Email or Access PIN!");
      }
    } catch {
      toast.error("API connection error during verification.");
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    toast.loading("Uploading banner image to secure storage...");

    try {
      const result = await uploadImageSecurely(file, "banner");
      toast.dismiss();

      if (result.success && result.url) {
        setImageUrl(result.url);
        toast.success("Banner image uploaded and attached successfully!");
      } else {
        toast.error(result.error || "Failed to upload banner image.");
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "Image upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setIsEditMode(false);
    setEditingId(null);
    setTarget("all");
    setTargetUserId("");
    setTitle("");
    setMessage("");
    setType("promo");
    setImageUrl("");
    setUrl("");
    setIsModalOpen(true);
  };

  const handleOpenResendModal = (log: PushNotificationLog) => {
    setIsEditMode(false);
    setEditingId(null);
    setTarget(log.target);
    setTargetUserId(log.targetUserId || "");
    setTitle(log.title);
    setMessage(log.body);
    setType(log.type);
    setImageUrl(log.imageUrl || "");
    setUrl(log.url || "");
    setIsModalOpen(true);
    toast.info("Notification parameters pre-filled for re-send.");
  };

  const handleOpenEditModal = (log: PushNotificationLog) => {
    setIsEditMode(true);
    setEditingId(log.id);
    setTarget(log.target);
    setTargetUserId(log.targetUserId || "");
    setTitle(log.title);
    setMessage(log.body);
    setType(log.type);
    setImageUrl(log.imageUrl || "");
    setUrl(log.url || "");
    setIsModalOpen(true);
  };

  const handleDeleteNotification = async () => {
    if (!deletingLog) return;
    setIsDeleting(true);
    toast.loading("Deleting notification record...");

    try {
      const isMock = sessionStorage.getItem("mock") === "true";
      let idToken = "mock-admin-token";
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/notifications/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action: "delete",
          id: deletingLog.id
        })
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || "Notification record deleted successfully!");
        setDeletingLog(null);
        fetchLogs();
      } else {
        toast.error(data.error || "Failed to delete notification record.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network error deleting notification record.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSendOrUpdatePush = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error("Please enter a push notification title.");
      return;
    }

    if (!message.trim()) {
      toast.error("Please enter a notification message body.");
      return;
    }

    if (target === "user" && !targetUserId.trim()) {
      toast.error("Please enter a target User ID for single user push.");
      return;
    }

    setIsSending(true);
    toast.loading(isEditMode ? "Updating notification record..." : "Dispatching push notification to target devices...");

    try {
      const isMock = sessionStorage.getItem("mock") === "true";
      let idToken = "mock-admin-token";
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/notifications/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action: isEditMode ? "update" : "send",
          id: isEditMode ? editingId : undefined,
          target,
          targetUserId: target === "user" ? targetUserId.trim() : null,
          title: title.trim(),
          message: message.trim(),
          type,
          imageUrl: imageUrl.trim(),
          url: url.trim()
        })
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || (isEditMode ? "Notification updated successfully!" : "Push notification broadcasted successfully!"));
        setIsModalOpen(false);
        setEditingId(null);
        setIsEditMode(false);
        setTitle("");
        setMessage("");
        setImageUrl("");
        setUrl("");
        setTargetUserId("");
        fetchLogs();
      } else {
        toast.error(data.error || "Operation failed.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network communication error.");
    } finally {
      setIsSending(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.adminEmail.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "ALL" || log.type.toUpperCase() === typeFilter.toUpperCase();
    return matchesSearch && matchesType;
  });

  if (!isAdminUnlocked) {
    return (
      <main className="min-h-screen bg-[#f3f4f6] flex items-center justify-center p-4 text-gray-800" style={{ marginTop: 0 }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-3xl p-8 border border-gray-200 flex flex-col items-center text-center space-y-6"
        >
          <div className="w-16 h-16 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FC7A00]">
            <span className="material-symbols-outlined text-[36px]" style={{ fontVariationSettings: '"FILL" 1' }}>campaign</span>
          </div>

          <div>
            <h2 className="font-hanken font-extrabold text-2xl tracking-tight text-gray-900 leading-tight">Admin Push Console</h2>
            <p className="font-hanken text-xs text-gray-500 mt-1.5 font-semibold leading-relaxed">
              Enter your administrative credentials to manage FCM push notification broadcasts.
            </p>
          </div>

          <form onSubmit={handleAdminVerify} className="w-full space-y-4">
            <div className="space-y-1.5 text-left">
              <label className="font-hanken text-[11px] uppercase tracking-wider font-extrabold text-[#FC7A00]">Admin Email Address</label>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 text-left font-sans text-xs text-gray-900 placeholder-gray-300 outline-none focus:border-[#FC7A00] focus:bg-white transition-all"
              />
            </div>

            <div className="space-y-1.5 text-left">
              <label className="font-hanken text-[11px] uppercase tracking-wider font-extrabold text-[#FC7A00]">Admin Access PIN</label>
              <input
                type="password"
                maxLength={6}
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                placeholder="Enter 4-digit Access PIN"
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 text-center font-mono font-bold text-xl text-gray-900 placeholder-gray-300 outline-none focus:border-[#FC7A00] focus:bg-white transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isVerifyingPin}
              className="w-full py-4 bg-[#FC7A00] text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-[#e06600] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isVerifyingPin ? <ButtonSpinner /> : "Verify Identity"}
            </button>
          </form>

          <Link href="/cpanel" className="text-[11px] font-bold text-gray-400 hover:text-gray-900 uppercase tracking-widest transition-all">
            ← Return to Control Panel
          </Link>
        </motion.div>
      </main>
    );
  }

  return (
    <div className={cn("min-h-screen flex flex-col font-sans transition-colors duration-300", isDark ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-800")}>

      {/* Header Bar */}
      <div className={cn("sticky top-0 z-40 border-b transition-colors duration-300 px-6 py-4 flex items-center justify-between", isDark ? "bg-gray-950/80 backdrop-blur-md border-gray-850" : "bg-white/80 backdrop-blur-md border-gray-200")}>
        <div className="flex items-center gap-3">
          <Link href="/cpanel" className={cn("w-9 h-9 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")}>
            <span className="material-symbols-outlined text-[18px] font-bold">arrow_back</span>
          </Link>
          <div>
            <h1 className="font-extrabold text-base tracking-tight leading-tight">Push Notifications</h1>
            <p className="text-[10px] text-gray-400 font-semibold">Broadcast rich FCM push notifications with banner images directly to user devices.</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2.5 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-sm active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px] font-bold">add_alert</span>
            <span>Send Push Notification</span>
          </button>

          <button onClick={toggleTheme} className={cn("w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer", isDark ? "bg-gray-900 border-gray-800 text-amber-400 hover:bg-gray-800" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50")}>
            <span className="material-symbols-outlined text-[20px]">{isDark ? "light_mode" : "dark_mode"}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">

        {/* Top Summary Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={cn("rounded-2xl p-5 border flex items-center gap-4 shadow-none", panelClass)}>
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-[#FC7A00] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">campaign</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Total Broadcasts</p>
              <h3 className="font-mono text-2xl font-black tracking-tight mt-0.5">{metrics.totalBroadcasts}</h3>
            </div>
          </div>

          <div className={cn("rounded-2xl p-5 border flex items-center gap-4 shadow-none", panelClass)}>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">send</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Total Delivered Messages</p>
              <h3 className="font-mono text-2xl font-black tracking-tight mt-0.5">{metrics.totalSent}</h3>
            </div>
          </div>

          <div className={cn("rounded-2xl p-5 border flex items-center gap-4 shadow-none", panelClass)}>
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">devices</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Active Target Devices</p>
              <h3 className="font-mono text-2xl font-black tracking-tight mt-0.5">{metrics.activeTokens}</h3>
            </div>
          </div>
        </div>

        {/* Directory Table Card */}
        <div className={cn("rounded-2xl p-5 border transition-all shadow-none space-y-4", panelClass)}>

          {/* Table Search & Filters Header */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 border-b pb-4 border-gray-200/50">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FC7A00] text-[20px]">history</span>
              <h3 className="font-black text-xs uppercase tracking-wider">Broadcast History</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px]">
                <input
                  type="text"
                  placeholder="Search broadcasts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={inputClass}
                />
              </div>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className={cn(inputClass, "w-auto cursor-pointer font-bold")}
              >
                <option value="ALL">All Types</option>
                <option value="PROMO">Promo 🎁</option>
                <option value="SYSTEM">System ⚙️</option>
                <option value="SECURITY">Security 🛡️</option>
              </select>

              <button
                onClick={fetchLogs}
                className={cn("p-2 border rounded-xl transition-all cursor-pointer", isDark ? "border-gray-800 hover:bg-gray-800" : "border-gray-200 hover:bg-gray-100")}
              >
                <span className="material-symbols-outlined text-[18px] font-bold block">refresh</span>
              </button>
            </div>
          </div>

          {/* Logs Table */}
          {isLoading ? (
            <div className="text-center py-16 text-gray-400 text-xs font-bold uppercase tracking-widest animate-pulse">
              <ButtonSpinner /> Loading Broadcast Logs...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-2xl flex flex-col items-center justify-center p-6 space-y-3 border-gray-200 dark:border-gray-800">
              <span className="material-symbols-outlined text-[36px] text-gray-400">notifications_off</span>
              <p className="text-xs uppercase font-black text-gray-400">No Push Broadcasts Found</p>
              <p className="text-[11px] text-gray-500 font-semibold max-w-sm mx-auto leading-relaxed">Click &quot;Send Push Notification&quot; above to dispatch your first rich push alert to user devices.</p>
            </div>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={cn("border-b text-[10px] font-black uppercase tracking-wider", isDark ? "border-gray-800 text-gray-400" : "border-gray-200 text-gray-500")}>
                    <th className="py-3 px-3">Banner</th>
                    <th className="py-3 px-3">Notification Title & Body</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Audience</th>
                    <th className="py-3 px-3">Delivery Stats</th>
                    <th className="py-3 px-3">Actions</th>
                    <th className="py-3 px-3 text-right">Date & Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/50 dark:divide-gray-800/50 text-xs">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className={cn("transition-colors", isDark ? "hover:bg-gray-900/50" : "hover:bg-gray-50/50")}>
                      <td className="py-3.5 px-3">
                        {log.imageUrl ? (
                          <button
                            onClick={() => setSelectedImagePreview(log.imageUrl!)}
                            className="w-14 h-10 rounded-lg border bg-gray-100 overflow-hidden shrink-0 cursor-pointer hover:scale-105 transition-transform"
                          >
                            <img src={log.imageUrl} alt="Banner" className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <div className="w-14 h-10 rounded-lg border bg-gray-100/50 dark:bg-gray-800 border-dashed flex items-center justify-center text-gray-400 text-[10px] font-bold">
                            No Image
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3 max-w-xs">
                        <p className="font-extrabold text-xs text-gray-900 dark:text-white truncate">{log.title}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium line-clamp-2 mt-0.5">{log.body}</p>
                        {log.url && (
                          <span className="inline-block mt-1 text-[9px] font-mono font-bold text-orange-500 truncate max-w-[200px]">
                            Link: {log.url}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                          log.type === "promo" && "bg-orange-500/10 border-orange-500/20 text-[#FC7A00]",
                          log.type === "system" && "bg-blue-500/10 border-blue-500/20 text-blue-500",
                          log.type === "security" && "bg-rose-500/10 border-rose-500/20 text-rose-500"
                        )}>
                          {log.type}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                          {log.target === "all" ? "All Users" : `User: ${log.targetUserId?.slice(0, 8)}...`}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {log.sentCount} / {log.targetCount} Delivered
                        </div>
                        {log.errorsCount > 0 && (
                          <div className="font-mono text-[10px] text-rose-500 font-bold">
                            {log.errorsCount} Errors
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenResendModal(log)}
                            className="p-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-[#FC7A00] font-bold text-[10px] uppercase flex items-center gap-1 transition-all cursor-pointer"
                            title="Re-send notification"
                          >
                            <span className="material-symbols-outlined text-[14px]">replay</span>
                            <span>Re-send</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(log)}
                            className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 font-bold text-[10px] uppercase flex items-center gap-1 transition-all cursor-pointer"
                            title="Edit notification"
                          >
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeletingLog(log)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold text-[10px] uppercase flex items-center gap-1 transition-all cursor-pointer"
                            title="Delete record"
                          >
                            <span className="material-symbols-outlined text-[14px]">delete</span>
                          </button>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-right font-mono text-[11px] text-gray-500 dark:text-gray-400">
                        {new Date(log.createdAt).toLocaleString("en-NG", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>

      </div>

      {/* Interactive Push Notification Dispatch Drawer Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[99998]"
            />

            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
              className={cn("fixed bottom-0 left-0 right-0 max-w-2xl mx-auto rounded-t-[32px] z-[99999] p-6 pb-8 shadow-2xl border-t overflow-y-auto max-h-[92vh] no-scrollbar", isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900")}
            >
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mb-5 mx-auto" />

              <div className="flex items-center justify-between border-b pb-4 mb-5 border-gray-200/50">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#FC7A00]">campaign</span>
                  <h3 className="font-extrabold text-base">
                    {isEditMode ? "Edit Notification Record" : "Send FCM Push Notification"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                </button>
              </div>

              <form onSubmit={handleSendOrUpdatePush} className="space-y-4">

                {/* Target Audience Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Target Audience</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTarget("all")}
                      className={cn(
                        "py-3 rounded-xl text-xs font-black uppercase border transition-all cursor-pointer flex items-center justify-center gap-2",
                        target === "all"
                          ? "bg-[#FC7A00] border-[#FC7A00] text-white shadow-sm"
                          : isDark ? "bg-gray-800 border-gray-700 text-gray-400" : "bg-gray-100 border-gray-200 text-gray-600"
                      )}
                    >
                      <span className="material-symbols-outlined text-[16px]">groups</span>
                      <span>All Active Users</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTarget("user")}
                      className={cn(
                        "py-3 rounded-xl text-xs font-black uppercase border transition-all cursor-pointer flex items-center justify-center gap-2",
                        target === "user"
                          ? "bg-[#FC7A00] border-[#FC7A00] text-white shadow-sm"
                          : isDark ? "bg-gray-800 border-gray-700 text-gray-400" : "bg-gray-100 border-gray-200 text-gray-600"
                      )}
                    >
                      <span className="material-symbols-outlined text-[16px]">person</span>
                      <span>Specific User</span>
                    </button>
                  </div>
                </div>

                {target === "user" && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-orange-500 tracking-wider">Target User ID (Account UID)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. user_uid_12345"
                      value={targetUserId}
                      onChange={(e) => setTargetUserId(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}

                {/* Notification Type & Title */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Notification Type</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as any)}
                      className={cn(inputClass, "cursor-pointer font-bold")}
                    >
                      <option value="promo">Promo 🎁</option>
                      <option value="system">System ⚙️</option>
                      <option value="security">Security 🛡️</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex justify-between">
                      <span>Push Title <span className="text-red-500">*</span></span>
                      <span className="font-mono text-[9px] text-gray-400">{title.length}/65</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={65}
                      placeholder="e.g. 🚀 Special Promo: 50% Cashback!"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Message Body */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex justify-between">
                    <span>Notification Message Body <span className="text-red-500">*</span></span>
                    <span className="font-mono text-[9px] text-gray-400">{message.length}/240</span>
                  </label>
                  <textarea
                    required
                    maxLength={240}
                    placeholder="Enter the full message body text that will display on the user's mobile screen..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className={cn(inputClass, "h-20 resize-none")}
                  />
                </div>

                {/* Banner Image Uploader */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Banner Image (Optional - High Engagement)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="https://i.ibb.co/..."
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className={inputClass}
                    />
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                        disabled={isUploading}
                      />
                      <button
                        type="button"
                        disabled={isUploading}
                        className={cn("px-3.5 h-10 border rounded-xl flex items-center justify-center transition-all cursor-pointer", isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-100 border-gray-200 text-gray-700")}
                      >
                        {isUploading ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">upload</span>}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Target Action Link Selector */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Target Action Link (App Screen or External URL)</label>

                  {/* Quick Preset Buttons */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-extrabold uppercase text-gray-400">Quick App Screen Presets:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: "📱 Just Open App", path: "" },
                        { label: "🛒 Store", path: "/store" },
                        { label: "🏡 Estate", path: "/estate" },
                        { label: "⚡ Bills", path: "/bills" },
                        { label: "📈 Investments", path: "/investment" },
                        { label: "💬 Live Support", path: "/support" },
                        { label: "📜 History", path: "/history" },
                        { label: "👤 Profile", path: "/profile" },
                        { label: "🎁 Referrals", path: "/referrals" },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setUrl(preset.path)}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer",
                            url === preset.path
                              ? "bg-[#FC7A00] border-[#FC7A00] text-white"
                              : isDark
                              ? "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600"
                              : "bg-gray-100 border-gray-200 text-gray-700 hover:border-gray-300"
                          )}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. /store, /bills, /estate or https://example.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  {url && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold">
                      {url.startsWith("http://") || url.startsWith("https://") ? (
                        <span className="text-emerald-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                          External Website Link (Opens in native external browser)
                        </span>
                      ) : (
                        <span className="text-[#FC7A00] flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">open_in_browser</span>
                          Internal App Screen Deep Link
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Real-time Mobile Push Card Preview */}
                <div className="p-4 bg-gray-100 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl space-y-2">
                  <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Live Mobile Device Push Preview</p>

                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-3.5 shadow-md space-y-2 text-gray-900 dark:text-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-md bg-[#FC7A00] flex items-center justify-center text-white text-[10px] font-black">e</div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">E-Global Pay</span>
                      </div>
                      <span className="text-[9px] font-mono text-gray-400">now</span>
                    </div>

                    <div className="space-y-1">
                      <p className="font-extrabold text-xs leading-snug">{title || "Your Notification Title"}</p>
                      <p className="text-[11px] text-gray-600 dark:text-gray-300 font-medium leading-relaxed">{message || "Your notification body message preview will display here..."}</p>
                    </div>

                    {imageUrl && (
                      <div className="mt-2 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 max-h-36 bg-black/10">
                        <img src={imageUrl} alt="Banner Preview" className="w-full h-36 object-cover" />
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSending || isUploading}
                  className="w-full py-4 bg-[#FC7A00] hover:bg-[#e06600] active:scale-95 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-orange-500/10 flex items-center justify-center gap-2"
                >
                  {isSending ? (
                    <>
                      <ButtonSpinner />
                      <span>{isEditMode ? "Saving Changes..." : "Broadcasting Push Notification..."}</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">{isEditMode ? "save" : "send"}</span>
                      <span>{isEditMode ? "Save Changes" : "Broadcast Push Notification"}</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingLog && (
          <div className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn("w-full max-w-sm rounded-3xl p-6 text-center space-y-4 shadow-2xl border", isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-100 text-gray-900")}
            >
              <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-[24px]">delete</span>
              </div>

              <div>
                <h4 className="font-extrabold text-base uppercase">Delete Notification Record?</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium leading-relaxed">
                  Are you sure you want to delete the broadcast log for <strong className="text-black dark:text-white">&quot;{deletingLog.title}&quot;</strong>? This action cannot be undone.
                </p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeletingLog(null)}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-700 dark:text-gray-300 text-xs font-bold uppercase rounded-2xl cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteNotification}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase rounded-2xl cursor-pointer transition-all shadow-sm active:scale-95 disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Delete Record"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full Image Preview Modal */}
      <AnimatePresence>
        {selectedImagePreview && (
          <div className="fixed inset-0 z-[100000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="relative max-w-3xl w-full flex flex-col items-center">
              <button
                type="button"
                onClick={() => setSelectedImagePreview(null)}
                className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/40 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px] font-bold">close</span>
              </button>
              <img
                src={selectedImagePreview}
                alt="Full Banner Preview"
                className="w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/20"
              />
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

export default function PushNotificationsPage() {
  return (
    <CpanelRouteGuard requiredPermission="branding.manage">
      <PushNotificationsContent />
    </CpanelRouteGuard>
  );
}
