"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";

interface AdminUserRecord {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  role: "super_admin" | "admin" | "support" | "finance" | "kyc_admin" | "read_only";
  permissions: string[];
  status: "active" | "disabled" | "suspended";
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
  mfaEnabled?: boolean;
}

interface PermissionCatalogItem {
  key: string;
  label: string;
  category: string;
}

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

function CpanelAdminsPageContent() {
  const router = useRouter();
  const { isDark, toggleTheme } = useCpanelTheme();
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [admins, setAdmins] = useState<AdminUserRecord[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionCatalogItem[]>([]);
  const [callerRole, setCallerRole] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // Form states for creating admin
  const [newEmail, setNewEmail] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newRole, setNewRole] = useState<AdminUserRecord["role"]>("admin");
  const [newPermissions, setNewPermissions] = useState<string[]>(["users.view", "transactions.view", "kyc.view"]);
  const [isCreating, setIsCreating] = useState(false);

  // Editing admin modal state
  const [editingAdmin, setEditingAdmin] = useState<AdminUserRecord | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);

  // Set PIN state
  const [pinTargetAdmin, setPinTargetAdmin] = useState<AdminUserRecord | null>(null);
  const [adminAccessPin, setAdminAccessPin] = useState("");
  const [isSavingAdminPin, setIsSavingAdminPin] = useState(false);

  // Auth & Session Check
  useEffect(() => {
    async function checkSession() {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
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

  // Fetch Administrators Directory
  const fetchAdmins = async () => {
    setIsLoading(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};
      const res = await fetch("/api/admin/admins", { headers });
      const data = await res.json();

      if (data.success) {
        setAdmins(data.admins || []);
        if (Array.isArray(data.catalog)) setPermissionCatalog(data.catalog);
        if (data.callerRole) setCallerRole(data.callerRole);
      } else {
        toast.error(data.error || "Failed to load administrator directory.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error loading admin directory.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoadingSession) {
      fetchAdmins();
    }
  }, [isLoadingSession]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      toast.error("Administrator email address is required.");
      return;
    }

    if (newPin && (newPin.length !== 4 || isNaN(Number(newPin)))) {
      toast.error("Access PIN must be a 4-digit numeric code.");
      return;
    }

    setIsCreating(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create_admin",
          adminData: {
            email: newEmail,
            password: newPassword,
            displayName: newDisplayName,
            phoneNumber: newPhoneNumber,
            role: newRole,
            permissions: newPermissions,
            pin: newPin,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Administrator account created!");
        setNewEmail("");
        setNewDisplayName("");
        setNewPhoneNumber("");
        setNewPassword("");
        setNewPin("");
        setNewPermissions(["users.view", "transactions.view", "kyc.view"]);
        fetchAdmins();
      } else {
        toast.error(data.error || "Failed to create administrator account.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error creating administrator.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;

    setIsUpdating(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "update_admin",
          adminData: {
            targetUid: editingAdmin.uid,
            displayName: editingAdmin.displayName,
            phoneNumber: editingAdmin.phoneNumber,
            role: editingAdmin.role,
            permissions: editingAdmin.permissions,
            status: editingAdmin.status,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Administrator updated!");
        setEditingAdmin(null);
        fetchAdmins();
      } else {
        toast.error(data.error || "Failed to update administrator.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error updating administrator.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinTargetAdmin) return;

    if (adminAccessPin.length !== 4 || isNaN(Number(adminAccessPin))) {
      toast.error("Access PIN must be a 4-digit numeric code.");
      return;
    }

    setIsSavingAdminPin(true);
    toast.loading(`Setting Access PIN for ${pinTargetAdmin.displayName || pinTargetAdmin.email}...`);

    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "set_pin",
          adminData: {
            targetUid: pinTargetAdmin.uid,
            pin: adminAccessPin,
          },
        }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || "Access PIN successfully created and updated!");
        setPinTargetAdmin(null);
        setAdminAccessPin("");
        fetchAdmins();
      } else {
        toast.error(data.error || "Failed to set Access PIN.");
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "Network error setting Access PIN.");
    } finally {
      setIsSavingAdminPin(false);
    }
  };

  const handleDeleteAdmin = async (targetUid: string) => {
    if (!confirm("Are you sure you want to remove this administrator account?")) return;

    setDeletingUid(targetUid);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "delete_admin",
          adminData: { targetUid },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Administrator removed.");
        fetchAdmins();
      } else {
        toast.error(data.error || "Failed to delete administrator.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error deleting administrator.");
    } finally {
      setDeletingUid(null);
    }
  };

  const bgClass = isDark ? "bg-[#0c0f17] text-white" : "bg-gray-50 text-gray-900";
  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full";

  if (isLoadingSession) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center p-6", bgClass)}>
        <div className="flex flex-col items-center gap-3">
          <ButtonSpinner />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Verifying Admin Access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen p-4 md:p-8 font-hanken transition-colors duration-300", bgClass)}>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Top Header */}
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
                <span className="material-symbols-outlined text-orange-500 text-[22px]">admin_panel_settings</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Admin Management</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Provision Administrators, set Access PINs, assign granular permissions, and enforce Role-Based Access Control (RBAC).
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column: Create New Administrator Form */}
          <div className={cn("p-5 rounded-2xl border space-y-4 lg:col-span-1 h-fit", panelClass)}>
            <div className="flex items-center gap-2 border-b border-gray-200/40 pb-3">
              <span className="material-symbols-outlined text-orange-500 text-[20px]">person_add</span>
              <h3 className="font-extrabold text-xs uppercase tracking-wider">+ Add Administrator</h3>
            </div>

            <form onSubmit={handleCreateAdmin} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Administrator Email *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. admin@e-tech-hub.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe (Finance Admin)"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">WhatsApp Phone Number</label>
                <input
                  type="tel"
                  placeholder="e.g. +2348033123456"
                  value={newPhoneNumber}
                  onChange={(e) => setNewPhoneNumber(e.target.value)}
                  className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Initial Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="6+ chars"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-amber-500 block">Access PIN (4 Digits)</label>
                  <input
                    type="password"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="e.g. 1234"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className={cn("h-10 px-3 rounded-xl text-xs font-mono font-bold outline-none border transition-all w-full", inputClass)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className={cn("h-10 px-3 rounded-xl text-xs font-bold outline-none border cursor-pointer w-full", inputClass)}
                >
                  <option value="super_admin">SUPER ADMIN (Full Access)</option>
                  <option value="admin">ADMIN (Standard Operations)</option>
                  <option value="finance">FINANCE (Withdrawals &amp; Deposits)</option>
                  <option value="kyc_admin">KYC ADMIN (Document Approvals)</option>
                  <option value="support">SUPPORT (Customer Helpdesk)</option>
                  <option value="read_only">READ ONLY (Auditor)</option>
                </select>
              </div>

              {/* Granular Permissions Selection */}
              <div className="space-y-2 pt-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Granular Permissions ({newPermissions.length})</label>
                <div className="max-h-48 overflow-y-auto space-y-1.5 p-3 rounded-xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50">
                  {permissionCatalog.map((perm) => {
                    const isChecked = newPermissions.includes(perm.key) || newPermissions.includes("*");
                    return (
                      <label key={perm.key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setNewPermissions(newPermissions.filter((p) => p !== perm.key && p !== "*"));
                            } else {
                              setNewPermissions([...newPermissions, perm.key]);
                            }
                          }}
                          className="w-3.5 h-3.5 text-[#FC7A00] rounded"
                        />
                        <span className="text-[10.5px] font-bold text-gray-700 dark:text-gray-300">{perm.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full h-11 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isCreating ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">person_add</span>}
                <span>Provision Administrator</span>
              </button>
            </form>
          </div>

          {/* Right Column: Admin List Table */}
          <div className="lg:col-span-2 space-y-4">
            {isLoading ? (
              <div className={cn("p-12 rounded-2xl border text-center flex flex-col items-center justify-center gap-3", panelClass)}>
                <ButtonSpinner />
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Administrator Directory...</p>
              </div>
            ) : admins.length === 0 ? (
              <div className={cn("p-12 rounded-2xl border text-center space-y-3", panelClass)}>
                <span className="material-symbols-outlined text-[48px] text-gray-400">admin_panel_settings</span>
                <p className="text-xs font-black uppercase text-gray-400">No Administrators Configured</p>
                <p className="text-[11px] text-gray-500 max-w-md mx-auto">Create administrator accounts on the left to assign roles and grant CPanel access.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {admins.map((adm) => {
                  const isDeleting = deletingUid === adm.uid;
                  return (
                    <div key={adm.uid} className={cn("p-5 rounded-2xl border space-y-3 transition-all", panelClass)}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200/40 pb-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-extrabold text-sm uppercase tracking-tight">{adm.displayName || adm.email.split("@")[0]}</h4>
                            <span className={cn(
                              "px-2.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider border",
                              adm.role === "super_admin" ? "bg-purple-500/10 text-purple-500 border-purple-500/20" : "bg-orange-500/10 text-orange-500 border-orange-500/20"
                            )}>
                              {adm.role.replace("_", " ")}
                            </span>
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[8px] font-black uppercase border",
                              adm.status === "active" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
                            )}>
                              {adm.status}
                            </span>
                          </div>
                          <p className="text-xs font-mono text-gray-400 mt-1">{adm.email}</p>
                          {adm.phoneNumber && (
                            <p className="text-[10px] font-mono font-bold text-[#FC7A00] mt-0.5 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">phone</span>
                              <span>{adm.phoneNumber}</span>
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setAdminAccessPin("");
                              setPinTargetAdmin(adm);
                            }}
                            className="px-3 h-8 bg-amber-500/10 hover:bg-amber-500 hover:text-white text-amber-600 dark:text-amber-400 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer border border-amber-500/20"
                          >
                            <span className="material-symbols-outlined text-[14px]">lock_reset</span>
                            <span>Set PIN</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditingAdmin(adm)}
                            className="px-3 h-8 bg-gray-100 dark:bg-gray-800 hover:bg-[#FC7A00] hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                            <span>Edit Role</span>
                          </button>

                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => handleDeleteAdmin(adm.uid)}
                            className="px-3 h-8 bg-red-600/10 hover:bg-red-600/20 text-red-500 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center gap-1 cursor-pointer"
                          >
                            {isDeleting ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[14px]">delete</span>}
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono flex-wrap gap-2">
                        <span>UID: {adm.uid}</span>
                        <span>Created: {new Date(adm.createdAt).toLocaleDateString()}</span>
                        {adm.lastLoginAt && <span>Last Login: {new Date(adm.lastLoginAt).toLocaleString()}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Set Admin Access PIN Modal Drawer */}
        <AnimatePresence>
          {pinTargetAdmin && (
            <div className="fixed inset-0 z-[100000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn("w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-5", isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900")}
              >
                <div className="flex justify-between items-center border-b pb-3 border-gray-200/50">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-500 text-[22px]">lock_reset</span>
                    <h3 className="font-extrabold text-sm uppercase">Create Admin Access PIN</h3>
                  </div>
                  <button onClick={() => setPinTargetAdmin(null)} className="w-8 h-8 rounded-full border flex items-center justify-center text-gray-400 hover:text-black dark:hover:text-white cursor-pointer">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>

                <form onSubmit={handleSaveAdminPin} className="space-y-4">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-1 text-center">
                    <p className="text-[10px] font-black uppercase text-amber-500">Target Administrator Profile</p>
                    <p className="font-extrabold text-base text-gray-900 dark:text-white">{pinTargetAdmin.displayName || pinTargetAdmin.email}</p>
                    <p className="font-mono text-xs text-gray-400 select-all">{pinTargetAdmin.email}</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-400 block text-center">
                      New 4-Digit Access PIN
                    </label>
                    <input
                      type="password"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      maxLength={4}
                      required
                      placeholder="e.g. 1234"
                      value={adminAccessPin}
                      onChange={(e) => setAdminAccessPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      className={cn(inputClass, "h-12 text-center font-mono font-black text-2xl tracking-widest")}
                    />
                    <p className="text-[10px] text-gray-400 text-center">
                      Setting this Access PIN will allow the administrator to authorize sensitive administrative actions securely.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setPinTargetAdmin(null)}
                      className="py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-2xl text-xs font-black uppercase cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingAdminPin || adminAccessPin.length !== 4}
                      className="py-3 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                    >
                      {isSavingAdminPin ? <ButtonSpinner /> : "Save Access PIN"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Edit Admin Modal */}
        {editingAdmin && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100000] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className={cn("w-[94vw] sm:w-full max-w-md p-5 sm:p-6 rounded-3xl border space-y-4 shadow-2xl my-auto max-h-[85vh] overflow-y-auto no-scrollbar", panelClass)}>
              <div className="flex justify-between items-center border-b border-gray-200/40 pb-3">
                <h3 className="font-extrabold text-sm uppercase">Edit Administrator Privileges</h3>
                <button
                  type="button"
                  onClick={() => setEditingAdmin(null)}
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-black flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdateAdmin} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Display Name</label>
                  <input
                    type="text"
                    value={editingAdmin.displayName}
                    onChange={(e) => setEditingAdmin({ ...editingAdmin, displayName: e.target.value })}
                    className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">WhatsApp Phone Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. +2348033123456"
                    value={editingAdmin.phoneNumber || ""}
                    onChange={(e) => setEditingAdmin({ ...editingAdmin, phoneNumber: e.target.value })}
                    className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Role</label>
                  <select
                    value={editingAdmin.role}
                    onChange={(e) => setEditingAdmin({ ...editingAdmin, role: e.target.value as any })}
                    className={cn("h-10 px-3 rounded-xl text-xs font-bold outline-none border cursor-pointer w-full", inputClass)}
                  >
                    <option value="super_admin">SUPER ADMIN</option>
                    <option value="admin">ADMIN</option>
                    <option value="finance">FINANCE</option>
                    <option value="kyc_admin">KYC ADMIN</option>
                    <option value="support">SUPPORT</option>
                    <option value="read_only">READ ONLY</option>
                  </select>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Granular Permissions ({editingAdmin.permissions.length})</label>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 p-3 rounded-xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50">
                    {permissionCatalog.map((perm) => {
                      const isChecked = editingAdmin.permissions.includes(perm.key) || editingAdmin.permissions.includes("*");
                      return (
                        <label key={perm.key} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setEditingAdmin({
                                  ...editingAdmin,
                                  permissions: editingAdmin.permissions.filter((p) => p !== perm.key && p !== "*")
                                });
                              } else {
                                setEditingAdmin({
                                  ...editingAdmin,
                                  permissions: [...editingAdmin.permissions, perm.key]
                                });
                              }
                            }}
                            className="w-3.5 h-3.5 text-[#FC7A00] rounded"
                          />
                          <span className="text-[10.5px] font-bold text-gray-700 dark:text-gray-300">{perm.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Account Status</label>
                  <select
                    value={editingAdmin.status}
                    onChange={(e) => setEditingAdmin({ ...editingAdmin, status: e.target.value as any })}
                    className={cn("h-10 px-3 rounded-xl text-xs font-bold outline-none border cursor-pointer w-full", inputClass)}
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled / Suspended</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-gray-200/40">
                  <button
                    type="button"
                    onClick={() => setEditingAdmin(null)}
                    className="px-4 h-10 bg-gray-200 dark:bg-gray-800 text-xs font-bold uppercase rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="px-5 h-10 bg-[#FC7A00] text-white text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-1.5"
                  >
                    {isUpdating ? <ButtonSpinner /> : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function CpanelAdminsPage() {
  return (
    <CpanelRouteGuard requiredPermission="admins.view">
      <CpanelAdminsPageContent />
    </CpanelRouteGuard>
  );
}
