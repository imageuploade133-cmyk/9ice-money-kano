"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";

interface FrozenUser {
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  isFrozen: boolean;
  freezeMessage: string;
}

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

function CpanelFreezePageContent() {
  const router = useRouter();
  const { isDark, toggleTheme } = useCpanelTheme();
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<FrozenUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [savingUid, setSavingUid] = useState<string | null>(null);


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

  // Handle Search Users
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      toast.warning("Please enter a search term (email, phone, or name).");
      return;
    }

    setIsLoadingUsers(true);
    setHasSearched(true);

    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};
      const res = await fetch(`/api/admin/freeze?search=${encodeURIComponent(searchQuery.trim())}`, { headers });
      const data = await res.json();

      if (data.success && Array.isArray(data.users)) {
        setUsers(data.users);
        if (data.users.length === 0) {
          toast.info("No matching user accounts found.");
        }
      } else {
        toast.error(data.error || "Failed to search user profiles.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error searching user profiles.");
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Save Freeze / Unfreeze action
  const handleToggleFreeze = async (userItem: FrozenUser, nextIsFrozen: boolean) => {
    setSavingUid(userItem.uid);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const res = await fetch("/api/admin/freeze", {
        method: "POST",
        headers,
        body: JSON.stringify({
          targetUid: userItem.uid,
          isFrozen: nextIsFrozen,
          freezeMessage: userItem.freezeMessage,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(nextIsFrozen ? "Account frozen successfully!" : "Account unfrozen successfully!");
        setUsers((prev) =>
          prev.map((u) => (u.uid === userItem.uid ? { ...u, isFrozen: nextIsFrozen } : u))
        );
      } else {
        toast.error(data.error || "Failed to update freeze status.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error updating freeze status.");
    } finally {
      setSavingUid(null);
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
                <span className="material-symbols-outlined text-red-500 text-[22px]">ac_unit</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Account Freeze Manager</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Freeze user accounts to block outward transfers and display customized notices.
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

        {/* Search Panel */}
        <div className={cn("p-5 rounded-2xl border space-y-4", panelClass)}>
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-[18px]">search</span>
              <input
                type="text"
                placeholder="Search user email, phone number, or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(inputClass, "pl-10 pr-4 h-11")}
              />
            </div>
            <button
              type="submit"
              disabled={isLoadingUsers}
              className="w-full md:w-auto px-6 h-11 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoadingUsers ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">search</span>}
              <span>Search User</span>
            </button>
          </form>
        </div>

        {/* Results List */}
        {isLoadingUsers ? (
          <div className={cn("p-12 rounded-2xl border text-center flex flex-col items-center justify-center gap-3", panelClass)}>
            <ButtonSpinner />
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Searching User Database...</p>
          </div>
        ) : !hasSearched ? (
          <div className={cn("p-12 rounded-2xl border text-center space-y-3", panelClass)}>
            <span className="material-symbols-outlined text-[48px] text-blue-500">lock</span>
            <p className="text-xs font-black uppercase text-gray-400">Search User Account</p>
            <p className="text-[11px] text-gray-500 max-w-md mx-auto">
              Enter an exact email or phone number above to inspect, freeze, or unfreeze target accounts.
            </p>
          </div>
        ) : users.length === 0 ? (
          <div className={cn("p-12 rounded-2xl border text-center space-y-3", panelClass)}>
            <span className="material-symbols-outlined text-[42px] text-gray-400">person_off</span>
            <p className="text-xs font-black uppercase text-gray-400">No Users Found</p>
            <p className="text-[11px] text-gray-500 max-w-md mx-auto">No user profiles matched your search term.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {users.map((userItem) => {
              const isSaving = savingUid === userItem.uid;
              return (
                <div key={userItem.uid} className={cn("p-5 rounded-2xl border space-y-4 transition-all", panelClass)}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/40 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-extrabold text-sm uppercase tracking-tight">{userItem.name}</h3>
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                          userItem.isFrozen
                            ? "bg-red-500/10 border-red-500/20 text-red-500"
                            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                        )}>
                          {userItem.isFrozen ? "ACCOUNT FROZEN" : "ACTIVE"}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-gray-400 mt-1 select-all">{userItem.email} • {userItem.phoneNumber}</p>
                      <p className="text-[10px] font-mono text-gray-500 mt-0.5">UID: {userItem.uid}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      {userItem.isFrozen ? (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleToggleFreeze(userItem, false)}
                          className="px-5 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        >
                          {isSaving ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">lock_open</span>}
                          <span>Unfreeze Account</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleToggleFreeze(userItem, true)}
                          className="px-5 h-10 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        >
                          {isSaving ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">ac_unit</span>}
                          <span>Freeze Account</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Freeze Notice Customizer */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">Custom Freeze Notice Message</label>
                    <textarea
                      value={userItem.freezeMessage}
                      onChange={(e) => {
                        const val = e.target.value;
                        setUsers((prev) =>
                          prev.map((u) => (u.uid === userItem.uid ? { ...u, freezeMessage: val } : u))
                        );
                      }}
                      placeholder="Dear Customer please Contact Us or Visit Our Office for assistance"
                      className={cn("w-full h-20 p-3 rounded-xl text-xs font-semibold outline-none border transition-all resize-none", inputClass)}
                    />
                    <p className="text-[10px] text-gray-400 font-semibold">
                      This exact message will be displayed to the user if they try to execute any outward transfers while frozen.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

export default function CpanelFreezePage() {
  return (
    <CpanelRouteGuard requiredPermission="freeze.manage">
      <CpanelFreezePageContent />
    </CpanelRouteGuard>
  );
}