"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";

interface TierLevelItem {
  id: string;
  name: string;
  dailyLimit: number;
  singleLimit: number;
  maxBalance: number;
  description?: string;
  isDefault?: boolean;
}

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

function CpanelTierLevelsPageContent() {
  const { isDark, toggleTheme } = useCpanelTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [tierLevels, setTierLevels] = useState<TierLevelItem[]>([]);

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<TierLevelItem | null>(null);

  const [formName, setFormName] = useState("");
  const [formDailyLimit, setFormDailyLimit] = useState<number>(5000000);
  const [formSingleLimit, setFormSingleLimit] = useState<number>(2000000);
  const [formMaxBalance, setFormMaxBalance] = useState<number>(5000000);
  const [formDescription, setFormDescription] = useState("");

  useEffect(() => {
    fetchTierLevels();
  }, []);

  const fetchTierLevels = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/tier-levels");
      const data = await res.json();
      if (res.ok && data.success) {
        setTierLevels(data.tierLevels || []);
      } else {
        toast.error(data.error || "Failed to load tier levels.");
      }
    } catch {
      toast.error("Network communication error loading tier levels.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingTier(null);
    setFormName("");
    setFormDailyLimit(5000000);
    setFormSingleLimit(2000000);
    setFormMaxBalance(5000000);
    setFormDescription("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (tier: TierLevelItem) => {
    setEditingTier(tier);
    setFormName(tier.name);
    setFormDailyLimit(tier.dailyLimit);
    setFormSingleLimit(tier.singleLimit);
    setFormMaxBalance(tier.maxBalance);
    setFormDescription(tier.description || "");
    setIsModalOpen(true);
  };

  const handleSaveTierForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error("Tier Level Name is required.");
      return;
    }

    setIsSaving(true);
    toast.loading(editingTier ? "Updating Tier Level..." : "Creating New Tier Level...");

    try {
      const payload = {
        action: editingTier ? "update" : "create",
        id: editingTier?.id,
        name: formName.trim(),
        dailyLimit: Number(formDailyLimit),
        singleLimit: Number(formSingleLimit),
        maxBalance: Number(formMaxBalance),
        description: formDescription.trim(),
      };

      const res = await fetch("/api/admin/tier-levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || "Tier Level saved successfully!");
        setTierLevels(data.tierLevels || []);
        setIsModalOpen(false);
      } else {
        toast.error(data.error || "Failed to save tier level.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network communication error saving tier level.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTier = async (tier: TierLevelItem) => {
    if (!confirm(`Are you sure you want to delete Tier Level "${tier.name}"?`)) return;

    toast.loading(`Deleting Tier Level "${tier.name}"...`);
    try {
      const res = await fetch("/api/admin/tier-levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: tier.id }),
      });

      toast.dismiss();
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(data.message || "Tier Level deleted successfully!");
        setTierLevels(data.tierLevels || []);
      } else {
        toast.error(data.error || "Failed to delete tier level.");
      }
    } catch {
      toast.dismiss();
      toast.error("Network communication error deleting tier level.");
    }
  };

  const bgClass = isDark ? "bg-[#0c0f17] text-white" : "bg-gray-50 text-gray-900";
  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-11 px-3.5 text-xs outline-none font-bold w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-11 px-3.5 text-xs outline-none font-bold w-full";

  if (isLoading) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center p-6 font-hanken", bgClass)}>
        <div className="flex flex-col items-center gap-3">
          <ButtonSpinner />
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Assign Tier Levels Manager...</p>
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
              href="/cpanel/set-limits"
              className={cn("w-10 h-10 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-[22px]">workspace_premium</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Assign Tier Levels Manager</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  Dynamic Configuration
                </span>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Create and manage dynamic Assign Tier Levels for KYC document approval and transaction limit controls.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="px-4 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span>Create New Tier Level</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className={cn("px-3 h-10 rounded-xl border font-bold text-xs flex items-center gap-2 transition-all cursor-pointer", isDark ? "bg-gray-900 border-gray-800 text-yellow-400" : "bg-gray-100 border-gray-200 text-gray-700")}
            >
              <span className="material-symbols-outlined text-[18px]">{isDark ? "light_mode" : "dark_mode"}</span>
              <span className="hidden sm:inline">{isDark ? "Light Mode" : "Dark Mode"}</span>
            </button>

            <Link
              href="/cpanel/kyc"
              className="px-4 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">verified_user</span>
              <span>KYC Queue</span>
            </Link>
          </div>
        </div>

        {/* Tier Levels Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tierLevels.map((tier) => (
            <div key={tier.id} className={cn("p-6 rounded-2xl border space-y-4 flex flex-col justify-between", panelClass)}>
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-3 border-gray-200/40 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-orange-500 text-[22px]">workspace_premium</span>
                    <h3 className="font-extrabold text-sm uppercase tracking-wider text-gray-900 dark:text-white">{tier.name}</h3>
                  </div>
                  {tier.isDefault ? (
                    <span className="px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase rounded-full">
                      Default
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase rounded-full">
                      Custom
                    </span>
                  )}
                </div>

                {tier.description && (
                  <p className="text-xs text-gray-400 font-medium">{tier.description}</p>
                )}

                <div className="space-y-2 pt-1 text-xs">
                  <div className="flex justify-between items-center p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/50 dark:border-gray-800">
                    <span className="font-bold text-gray-400 uppercase text-[10px]">Max Balance Cap</span>
                    <span className="font-mono font-black text-emerald-500">₦{tier.maxBalance.toLocaleString("en-NG")}</span>
                  </div>

                  <div className="flex justify-between items-center p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/50 dark:border-gray-800">
                    <span className="font-bold text-gray-400 uppercase text-[10px]">Daily Transfer Limit</span>
                    <span className="font-mono font-black text-[#FC7A00]">₦{tier.dailyLimit.toLocaleString("en-NG")}</span>
                  </div>

                  <div className="flex justify-between items-center p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200/50 dark:border-gray-800">
                    <span className="font-bold text-gray-400 uppercase text-[10px]">Single Transfer Cap</span>
                    <span className="font-mono font-black text-indigo-500">₦{tier.singleLimit.toLocaleString("en-NG")}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200/40 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => handleOpenEditModal(tier)}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  <span>Edit</span>
                </button>

                {!tier.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTier(tier)}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

      </div>

      {/* Create / Edit Tier Level Modal Drawer */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className={cn("w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-5", panelClass)}>
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: isDark ? "#1f2937" : "#f3f4f6" }}>
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-orange-500 text-[24px]">workspace_premium</span>
                <div>
                  <h3 className="text-base font-extrabold uppercase">{editingTier ? "Edit Tier Level" : "Create New Tier Level"}</h3>
                  <p className="text-[10px] text-gray-400">Configure Assign Tier name, balance caps, and transfer limits.</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full border border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-black dark:hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveTierForm} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase text-gray-400">Tier Level Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Tier 4 - VIP Corporate"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase text-gray-400">Maximum Tier Balance Cap (₦) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={formMaxBalance}
                  onChange={(e) => setFormMaxBalance(Number(e.target.value))}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase text-gray-400">Daily Transfer Limit (₦) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={formDailyLimit}
                  onChange={(e) => setFormDailyLimit(Number(e.target.value))}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase text-gray-400">Single Transfer Limit (₦) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={formSingleLimit}
                  onChange={(e) => setFormSingleLimit(Number(e.target.value))}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase text-gray-400">Description (Optional)</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g. High-tier business accounts"
                  className={inputClass}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-200/50 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2.5 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold uppercase rounded-xl hover:bg-gray-300 dark:hover:bg-gray-700 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  {isSaving && <ButtonSpinner />}
                  <span>Save Tier Level</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CpanelTierLevelsPage() {
  return (
    <CpanelRouteGuard requiredPermission="limits.manage">
      <CpanelTierLevelsPageContent />
    </CpanelRouteGuard>
  );
}
