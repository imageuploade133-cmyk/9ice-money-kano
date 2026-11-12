"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CpanelActionDropdown } from "@/components/cpanel/CpanelActionDropdown";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { CPANEL_PERMISSIONS_CATALOG } from "@/lib/admin-permissions-client";

interface AdminUser {
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  role: "super_admin" | "admin" | "finance" | "kyc_admin" | "support" | "read_only" | "agent" | "user";
  permissions: string[];
  balance: number;
  usdBalance?: number;
  xofBalance?: number;
  bonusBalance?: number;
  createdAt: string;
}

const ButtonSpinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

function CpanelUsersPageContent() {
  const { user } = useAuth();
  const router = useRouter();

  const { isDark, toggleTheme } = useCpanelTheme();
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [searchUserTerm, setSearchUserTerm] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isUpdatingUser, setIsUpdatingUser] = useState<string | null>(null);

  // Administrator PIN creation modal state
  const [pinTargetUser, setPinTargetUser] = useState<AdminUser | null>(null);
  const [adminNewPin, setAdminNewPin] = useState("");
  const [isSavingAdminPin, setIsSavingAdminPin] = useState(false);

  const [newUserForm, setNewUserForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phonePrefix: "+234",
    phoneNumber: "",
    balance: 0,
    role: "user" as AdminUser["role"],
    permissions: [] as string[],
  });

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

  const fetchUsersDirectory = async (searchTermVal?: string) => {
    setIsLoadingUsers(true);
    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const q = searchTermVal !== undefined ? searchTermVal : searchUserTerm;
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(q.trim())}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUsersList(data.users || []);
      } else {
        toast.error(data.error || "Failed to load system users securely.");
      }
    } catch {
      toast.error("Internal network error loading system users.");
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsersDirectory("");
  }, []);

  const handleUserSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchUsersDirectory(searchUserTerm);
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingUser(true);

    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "create",
          ...newUserForm,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "User created successfully!");
        setNewUserForm({
          firstName: "",
          lastName: "",
          email: "",
          password: "",
          phonePrefix: "+234",
          phoneNumber: "",
          balance: 0,
          role: "user",
          permissions: [],
        });
        setUsersList([]);
      } else {
        toast.error(data.error || "Failed to create user securely.");
      }
    } catch {
      toast.error("Network communication failure during user creation.");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleSaveUserPermissions = async (userToUpdate: AdminUser) => {
    setIsUpdatingUser(userToUpdate.uid);
    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "update",
          targetUid: userToUpdate.uid,
          role: userToUpdate.role,
          permissions: userToUpdate.permissions,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Permissions updated successfully!");
        setEditingUser(null);
        setUsersList((prev) =>
          prev.map((u) => (u.uid === userToUpdate.uid ? { ...u, role: userToUpdate.role, permissions: userToUpdate.permissions } : u))
        );
      } else {
        toast.error(data.error || "Failed to update permissions.");
      }
    } catch {
      toast.error("Network communication failure.");
    } finally {
      setIsUpdatingUser(null);
    }
  };

  const handleSaveAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinTargetUser) return;

    if (adminNewPin.length !== 4 || isNaN(Number(adminNewPin))) {
      toast.error("Access PIN must be a 4-digit numeric code.");
      return;
    }

    setIsSavingAdminPin(true);
    toast.loading(`Creating Access PIN for ${pinTargetUser.name}...`);

    try {
      let idToken = "mock-admin-token";
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: "set_pin",
          targetUid: pinTargetUser.uid,
          pin: adminNewPin,
        }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || `Access PIN successfully created for ${pinTargetUser.name}!`);
        setPinTargetUser(null);
        setAdminNewPin("");
      } else {
        toast.error(data.error || "Failed to set Access PIN.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network error creating user Access PIN.");
    } finally {
      setIsSavingAdminPin(false);
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

        {/* Sticky Header Bar */}
        <div className={cn("sticky top-0 z-30 p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md shadow-xs", panelClass)}>
          <div className="flex items-center gap-3">
            <Link
              href="/cpanel"
              className={cn("w-10 h-10 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-[22px]">group</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Users &amp; Permissions Management</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Create authenticated profiles, update user roles, assign security permissions, set Access PINs, and deposit capital.
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
          {/* Left Column: Register New User Form */}
          <div className={cn("rounded-2xl p-6 md:col-span-1 flex flex-col justify-between border transition-colors duration-300", panelClass)}>
            <div>
              <div className={cn("border-b pb-3 mb-4", isDark ? "border-gray-800" : "border-gray-100")}>
                <h3 className={cn("font-hanken font-extrabold text-sm uppercase", labelClass)}>
                  Secure User Creator
                </h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Setup Authenticated Profile &amp; Roles</p>
              </div>

              <form onSubmit={handleCreateUserSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400">First Name</label>
                    <input
                      type="text"
                      required
                      value={newUserForm.firstName}
                      onChange={(e) => setNewUserForm({ ...newUserForm, firstName: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400">Last Name</label>
                    <input
                      type="text"
                      required
                      value={newUserForm.lastName}
                      onChange={(e) => setNewUserForm({ ...newUserForm, lastName: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400">Secret Password</label>
                  <input
                    type="password"
                    required
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1 col-span-1">
                    <label className="text-[10px] font-black uppercase text-gray-400">Prefix</label>
                    <select
                      value={newUserForm.phonePrefix}
                      onChange={(e) => setNewUserForm({ ...newUserForm, phonePrefix: e.target.value })}
                      className={cn(inputClass, "cursor-pointer font-bold")}
                    >
                      <option value="+234">+234</option>
                      <option value="+227">+227</option>
                    </select>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-black uppercase text-gray-400">Phone Number</label>
                    <input
                      type="tel"
                      required
                      value={newUserForm.phoneNumber}
                      onChange={(e) => setNewUserForm({ ...newUserForm, phoneNumber: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400">Opening Balance (₦)</label>
                  <input
                    type="number"
                    value={newUserForm.balance}
                    onChange={(e) => setNewUserForm({ ...newUserForm, balance: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400">System Role</label>
                  <select
                    value={newUserForm.role}
                    onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value as any })}
                    className={cn(inputClass, "cursor-pointer font-bold")}
                  >
                    <option value="user">USER (Standard Customer)</option>
                    <option value="agent">AGENT (Privileged Operative)</option>
                    <option value="super_admin">SUPER ADMIN (Full Platform Control)</option>
                    <option value="admin">ADMIN (Standard Operations)</option>
                    <option value="finance">FINANCE (Withdrawals &amp; Deposits)</option>
                    <option value="kyc_admin">KYC ADMIN (Document Approvals)</option>
                    <option value="support">SUPPORT (Customer Helpdesk)</option>
                    <option value="read_only">READ ONLY (Auditor)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Assign Security Permissions ({newUserForm.permissions.length})</label>
                  <div className={cn("max-h-48 overflow-y-auto space-y-1.5 p-3 rounded-xl border transition-colors duration-300", isDark ? "bg-gray-800/50 border-gray-700" : "bg-gray-50 border-gray-200")}>
                    {CPANEL_PERMISSIONS_CATALOG.map((p) => {
                      const checked = newUserForm.permissions.includes(p.key) || newUserForm.permissions.includes("*");
                      return (
                        <label key={p.key} className={cn("flex items-center gap-2 cursor-pointer select-none text-[11px] font-bold hover:text-[#FC7A00]", isDark ? "text-gray-300 hover:text-white" : "text-gray-600 hover:text-gray-900")}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const updated = checked
                                ? newUserForm.permissions.filter((k) => k !== p.key && k !== "*")
                                : [...newUserForm.permissions, p.key];
                              setNewUserForm({ ...newUserForm, permissions: updated });
                            }}
                            className="rounded border-gray-300 text-[#FC7A00] focus:ring-[#FC7A00] h-3.5 w-3.5 cursor-pointer"
                          />
                          <span>{p.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isCreatingUser}
                  className="w-full py-3 bg-black hover:bg-[#FC7A00] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 disabled:opacity-50"
                >
                  {isCreatingUser ? <><ButtonSpinner /> Provisioning Account...</> : "Create Secured User"}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: User Directory */}
          <div className={cn("rounded-2xl p-6 md:col-span-2 space-y-5 flex flex-col justify-between border transition-colors duration-300", panelClass)}>
            <div className="space-y-4">
              <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between border-b pb-3 gap-3", isDark ? "border-gray-800" : "border-gray-100")}>
                <div>
                  <h3 className={cn("font-hanken font-extrabold text-sm uppercase", labelClass)}>
                    System Directory ({usersList.length})
                  </h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">High volume, ultra low-read cost directory search</p>
                </div>
              </div>

              <form onSubmit={handleUserSearchSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchUserTerm}
                    onChange={(e) => setSearchUserTerm(e.target.value)}
                    placeholder="Search by name, email, phone number, or BVN..."
                    className={cn(inputClass, "pl-10 pr-4 h-11")}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoadingUsers}
                  className="px-5 py-3 bg-black hover:bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-wider active:scale-95 disabled:opacity-50 flex-shrink-0 cursor-pointer"
                >
                  {isLoadingUsers ? <ButtonSpinner /> : "Search"}
                </button>
              </form>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {isLoadingUsers ? (
                  <div className="text-center py-12 text-gray-400 uppercase tracking-widest font-bold text-xs">
                    <ButtonSpinner /> Interrogating User Registry...
                  </div>
                ) : usersList.length === 0 ? (
                  <div className={cn("border rounded-xl p-6 text-center space-y-1.5", isDark ? "border-orange-950/30 bg-orange-950/10 text-gray-400" : "border-orange-100 bg-orange-50/30 text-gray-500")}>
                    <span className="material-symbols-outlined text-[32px] text-[#FC7A00]" style={{ fontVariationSettings: '"FILL" 1' }}>query_stats</span>
                    <p className={cn("font-black text-xs uppercase", isDark ? "text-white" : "text-gray-800")}>No Loaded Records</p>
                    <p className="text-[11px] leading-normal max-w-sm mx-auto font-medium">
                      Please enter an exact user email address or phone number in the search bar above to fetch.
                    </p>
                  </div>
                ) : (
                  usersList.map((u) => {
                    const isEditing = editingUser?.uid === u.uid;
                    return (
                      <div key={u.uid} className={cn("p-4 border rounded-xl transition-all space-y-3", isDark ? "border-gray-800 bg-gray-800/40 hover:bg-gray-800/80" : "border-gray-150 bg-gray-50/50 hover:bg-gray-50")}>
                        <div className="flex justify-between items-start flex-wrap gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className={cn("font-extrabold text-sm leading-none", isDark ? "text-white" : "text-gray-900")}>{u.name}</h4>
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider",
                                u.role === "admin" && "bg-rose-500/10 text-rose-400 border border-rose-500/20",
                                u.role === "agent" && "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
                                u.role === "user" && (isDark ? "bg-gray-700 text-gray-300 border border-gray-600" : "bg-gray-100 text-gray-600 border border-gray-200")
                              )}>
                                {u.role}
                              </span>
                            </div>
                            <p className="text-xs font-semibold mt-1 select-all text-gray-400">{u.email}</p>
                            <p className="text-[10px] font-mono text-gray-400 mt-0.5">{u.phoneNumber}</p>
                          </div>

                          <div className="text-right space-y-1">
                            <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Balances</p>
                            <p className="font-mono text-[11px] font-black text-emerald-500 leading-none">₦{u.balance.toLocaleString()}</p>
                            <p className="font-mono text-[10px] font-extrabold text-blue-500 leading-none">${(u.usdBalance || 0).toLocaleString()}</p>
                            <p className="font-mono text-[9px] font-bold text-indigo-500 leading-none">CFA{(u.xofBalance || 0).toLocaleString()}</p>
                          </div>
                        </div>

                        {!isEditing && (
                          <div className="flex justify-between items-center flex-wrap gap-2 pt-1 border-t border-gray-200/30 relative">
                            <div className="flex flex-wrap gap-1">
                              {u.permissions.length === 0 ? (
                                <span className="text-[9px] text-gray-400 font-bold uppercase italic">Standard Permissions</span>
                              ) : (
                                u.permissions.map((p) => (
                                  <span key={p} className="px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-[#FC7A00] text-[8px] font-black uppercase tracking-wider">
                                    {p.replace("can_", "").replace("_", " ")}
                                  </span>
                                ))
                              )}
                            </div>

                            <CpanelActionDropdown
                              isDark={isDark}
                              direction="up"
                              actions={[
                                {
                                  label: "Manage User",
                                  icon: "admin_panel_settings",
                                  onClick: () => setEditingUser(u),
                                },
                                {
                                  label: "Set Access PIN",
                                  icon: "lock_reset",
                                  variant: "warning",
                                  onClick: () => {
                                    setAdminNewPin("");
                                    setPinTargetUser(u);
                                  },
                                },
                                {
                                  label: "Cash Deposit",
                                  icon: "payments",
                                  variant: "emerald",
                                  onClick: () => setEditingUser(u),
                                },
                              ]}
                            />
                          </div>
                        )}

                        {isEditing && editingUser && (
                          <div className={cn("p-4 border rounded-xl space-y-4 transition-colors duration-300", isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
                            <div className="space-y-3.5">
                              <p className="text-[10px] font-black uppercase text-[#FC7A00]">Modify Privileges &amp; Permissions</p>

                              <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-gray-400">Change Role</label>
                                <select
                                  value={editingUser.role}
                                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as any })}
                                  className={cn(inputClass, "cursor-pointer font-bold")}
                                >
                                  <option value="user">USER (Standard Customer)</option>
                                  <option value="agent">AGENT (Privileged Operative)</option>
                                  <option value="super_admin">SUPER ADMIN (Full Access)</option>
                                  <option value="admin">ADMIN (Standard Operations)</option>
                                  <option value="finance">FINANCE (Withdrawals &amp; Deposits)</option>
                                  <option value="kyc_admin">KYC ADMIN (Document Approvals)</option>
                                  <option value="support">SUPPORT (Customer Helpdesk)</option>
                                  <option value="read_only">READ ONLY (Auditor)</option>
                                </select>
                              </div>

                              <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase text-gray-400 block">Manage Assigned Permissions ({editingUser.permissions.length})</label>
                                <div className="max-h-40 overflow-y-auto space-y-1.5 p-3 rounded-xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50">
                                  {CPANEL_PERMISSIONS_CATALOG.map((p) => {
                                    const isChecked = editingUser.permissions.includes(p.key) || editingUser.permissions.includes("*");
                                    return (
                                      <label key={p.key} className={cn("flex items-center gap-1.5 cursor-pointer text-[10px] font-bold", isDark ? "text-gray-300" : "text-gray-600")}>
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => {
                                            const updated = isChecked
                                              ? editingUser.permissions.filter((k) => k !== p.key && k !== "*")
                                              : [...editingUser.permissions, p.key];
                                            setEditingUser({ ...editingUser, permissions: updated });
                                          }}
                                          className="rounded text-[#FC7A00] h-3 w-3 cursor-pointer"
                                        />
                                        <span>{p.label}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex justify-end gap-2 pt-2 border-t border-gray-150/10">
                                <button
                                  type="button"
                                  onClick={() => setEditingUser(null)}
                                  className="px-3 py-1.5 bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 hover:text-white text-[10px] font-black uppercase rounded-lg cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={isUpdatingUser === u.uid}
                                  onClick={() => handleSaveUserPermissions(editingUser)}
                                  className="px-3 py-1.5 bg-black hover:bg-orange-500 text-white text-[10px] font-black uppercase rounded-lg cursor-pointer disabled:opacity-50"
                                >
                                  {isUpdatingUser === u.uid ? <><ButtonSpinner /> Saving...</> : "Apply Changes"}
                                </button>
                              </div>
                            </div>

                            {/* Administrative Deposit */}
                            <div className={cn("p-3.5 rounded-xl border space-y-3 transition-colors duration-300", isDark ? "bg-gray-900 border-gray-850" : "bg-gray-50 border-gray-150")}>
                              <p className="text-[10px] font-black uppercase text-emerald-500">Cash Deposit</p>

                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-black uppercase text-gray-400">Currency</label>
                                  <select
                                    id={`deposit-currency-${u.uid}`}
                                    className={cn(inputClass, "cursor-pointer font-bold")}
                                  >
                                    <option value="NGN">NGN (₦)</option>
                                    <option value="USD">USD ($)</option>
                                    <option value="XOF">XOF (CFA)</option>
                                  </select>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[9px] font-black uppercase text-gray-400">Amount to Credit</label>
                                  <input
                                    type="number"
                                    id={`deposit-amount-${u.uid}`}
                                    placeholder="e.g. 5000"
                                    className={inputClass}
                                  />
                                </div>
                              </div>

                              <button
                                type="button"
                                disabled={isUpdatingUser === u.uid}
                                onClick={async () => {
                                  const currencySelect = document.getElementById(`deposit-currency-${u.uid}`) as HTMLSelectElement;
                                  const amountInput = document.getElementById(`deposit-amount-${u.uid}`) as HTMLInputElement;
                                  const currency = currencySelect?.value || "NGN";
                                  const amount = parseFloat(amountInput?.value || "0");

                                  if (isNaN(amount) || amount <= 0) {
                                    toast.error("Please enter a valid positive amount to deposit.");
                                    return;
                                  }

                                  triggerAdminConfirm(
                                    "Confirm Secured Deposit?",
                                    `Are you sure you want to securely credit ${currency} ${amount.toLocaleString()} to user "${u.name.toUpperCase()}"?`,
                                    "Credit Wallet",
                                    "success",
                                    async () => {
                                      setIsUpdatingUser(u.uid);
                                      try {
                                        let idToken = "mock-admin-token";
                                        const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
                                        if (!isMock && user) {
                                          idToken = await user.getIdToken();
                                        }

                                        const res = await fetch("/api/admin/deposit", {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                            Authorization: `Bearer ${idToken}`,
                                          },
                                          body: JSON.stringify({
                                            targetUid: u.uid,
                                            amount,
                                            currency,
                                          }),
                                        });

                                        const data = await res.json();
                                        if (res.ok && data.success) {
                                          toast.success(data.message || `Wallet credited successfully!`);
                                          if (amountInput) amountInput.value = "";
                                          fetchUsersDirectory(searchUserTerm);
                                        } else {
                                          toast.error(data.error || "Failed to complete deposit.");
                                        }
                                      } catch {
                                        toast.error("Network communication failure during deposit.");
                                      } finally {
                                        setIsUpdatingUser(null);
                                      }
                                    }
                                  );
                                }}
                                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                              >
                                {isUpdatingUser === u.uid ? <><ButtonSpinner /> Processing Deposit...</> : "Execute Credit Deposit"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Set User Access PIN Drawer Modal */}
      <AnimatePresence>
        {pinTargetUser && (
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
                  <h3 className="font-extrabold text-sm uppercase">Create User Access PIN</h3>
                </div>
                <button onClick={() => setPinTargetUser(null)} className="w-8 h-8 rounded-full border flex items-center justify-center text-gray-400 hover:text-black dark:hover:text-white cursor-pointer">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>

              <form onSubmit={handleSaveAdminPin} className="space-y-4">
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-1 text-center">
                  <p className="text-[10px] font-black uppercase text-amber-500">Target User Profile</p>
                  <p className="font-extrabold text-base text-gray-900 dark:text-white">{pinTargetUser.name}</p>
                  <p className="font-mono text-xs text-gray-400 select-all">{pinTargetUser.email}</p>
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
                    value={adminNewPin}
                    onChange={(e) => setAdminNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className={cn(inputClass, "h-12 text-center font-mono font-black text-2xl tracking-widest")}
                  />
                  <p className="text-[10px] text-gray-400 text-center">
                    Setting this PIN will allow the user to log in and authorize transactions immediately.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setPinTargetUser(null)}
                    className="py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-2xl text-xs font-black uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingAdminPin || adminNewPin.length !== 4}
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

      {/* Confirmation Modal */}
      {adminActionModal.isOpen && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className={cn("w-[92vw] sm:w-full max-w-sm p-6 rounded-3xl border text-center shadow-2xl space-y-4", panelClass)}>
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center mx-auto border",
              adminActionModal.actionStyle === "danger" && "bg-red-50 text-red-500 border-red-200 dark:bg-red-950/40 dark:border-red-900/50",
              adminActionModal.actionStyle === "success" && "bg-emerald-50 text-emerald-500 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/50"
            )}>
              <span className="material-symbols-outlined text-[24px]">verified_user</span>
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
                className="py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase cursor-pointer hover:bg-emerald-700"
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

export default function CpanelUsersPage() {
  return (
    <CpanelRouteGuard requiredPermission="users.view">
      <CpanelUsersPageContent />
    </CpanelRouteGuard>
  );
}
