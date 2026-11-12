"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

interface AdminProfileData {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  role: string;
  permissions: string[];
  createdAt: string;
  lastLoginAt: string;
}

export default function CpanelAdminProfilePage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useCpanelTheme();

  const [profile, setProfile] = useState<AdminProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Phone number form state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isUpdatingPhone, setIsUpdatingPhone] = useState(false);

  // Password form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const fetchProfile = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/profile");
      const data = await res.json();

      if (res.ok && data.success && data.profile) {
        setProfile(data.profile);
        setPhoneNumber(data.profile.phoneNumber || "");
      } else {
        toast.error(data.error || "Failed to load administrator profile.");
      }
    } catch {
      toast.error("Network communication failure loading profile.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleUpdatePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingPhone(true);

    try {
      const res = await fetch("/api/admin/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_phone", phoneNumber }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Phone number updated!");
        fetchProfile();
      } else {
        toast.error(data.error || "Failed to update phone number.");
      }
    } catch {
      toast.error("Network communication error.");
    } finally {
      setIsUpdatingPhone(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    setIsChangingPassword(true);

    try {
      const res = await fetch("/api/admin/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change_password", newPassword }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Password changed successfully!");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error(data.error || "Failed to change password.");
      }
    } catch {
      toast.error("Network communication error.");
    } finally {
      setIsChangingPassword(false);
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
      <div className="max-w-4xl mx-auto space-y-6">

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
                <span className="material-symbols-outlined text-orange-500 text-[22px]">account_circle</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Administrator Profile</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Full personal control over your phone number and security credentials.
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

        {isLoading ? (
          <div className={cn("p-12 rounded-2xl border text-center flex flex-col items-center justify-center gap-3", panelClass)}>
            <ButtonSpinner />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Administrator Profile...</p>
          </div>
        ) : profile ? (
          <div className="space-y-6">

            {/* Profile Information Overview */}
            <div className={cn("p-6 rounded-2xl border space-y-4", panelClass)}>
              <div className="flex items-center justify-between border-b border-gray-200/40 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-[#FC7A00] flex items-center justify-center font-black text-xl">
                    {profile.displayName.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-black text-base uppercase tracking-tight">{profile.displayName}</h2>
                      <span className="px-2.5 py-0.5 rounded text-[9px] font-black uppercase bg-orange-500/10 text-orange-500 border border-orange-500/20">
                        {profile.role.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-gray-400 mt-0.5">{profile.email}</p>
                  </div>
                </div>

                <div className="text-right text-[10px] text-gray-400 font-mono hidden sm:block">
                  <p>UID: {profile.uid}</p>
                  <p className="mt-0.5">Created: {new Date(profile.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Granted Permissions List */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Active Granted Permissions ({profile.permissions.length})</label>
                <div className="flex flex-wrap gap-1.5">
                  {profile.permissions.includes("*") ? (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-black uppercase tracking-wider">
                      ★ WILDCARD SUPER ADMIN ACCESS (*)
                    </span>
                  ) : profile.permissions.length === 0 ? (
                    <span className="text-[11px] text-gray-400 italic">No custom granular permissions assigned.</span>
                  ) : (
                    profile.permissions.map((perm) => (
                      <span key={perm} className="px-2.5 py-1 rounded-lg bg-orange-500/10 text-[#FC7A00] border border-orange-500/20 text-[10px] font-black uppercase tracking-wider">
                        {perm}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Update Phone Number Form */}
              <div className={cn("p-6 rounded-2xl border space-y-4 h-fit", panelClass)}>
                <div className="flex items-center gap-2 border-b border-gray-200/40 pb-3">
                  <span className="material-symbols-outlined text-orange-500 text-[20px]">phone</span>
                  <h3 className="font-extrabold text-xs uppercase tracking-wider">Update Phone Number</h3>
                </div>

                <form onSubmit={handleUpdatePhone} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400 block">WhatsApp / Contact Phone Number</label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. +2348033123456 or 08033123456"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className={cn("h-11 px-3.5 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isUpdatingPhone}
                    className="w-full h-11 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {isUpdatingPhone ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">save</span>}
                    <span>Save Phone Number</span>
                  </button>
                </form>
              </div>

              {/* Change Password Form */}
              <div className={cn("p-6 rounded-2xl border space-y-4 h-fit", panelClass)}>
                <div className="flex items-center gap-2 border-b border-gray-200/40 pb-3">
                  <span className="material-symbols-outlined text-orange-500 text-[20px]">lock_reset</span>
                  <h3 className="font-extrabold text-xs uppercase tracking-wider">Change Administrator Password</h3>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black uppercase text-gray-400 block">New Password *</label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-[10px] font-bold text-gray-400 hover:text-[#FC7A00]"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      placeholder="At least 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={cn("h-11 px-3.5 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400 block">Confirm New Password *</label>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={cn("h-11 px-3.5 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="w-full h-11 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {isChangingPassword ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">key</span>}
                    <span>Update Password</span>
                  </button>
                </form>
              </div>

            </div>

          </div>
        ) : null}

      </div>
    </div>
  );
}
