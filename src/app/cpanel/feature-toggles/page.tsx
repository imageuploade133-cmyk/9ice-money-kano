"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  DEFAULT_FEATURE_TOGGLES,
  FEATURE_METADATA,
  FeatureToggleKey,
  FeatureToggles,
  DEFAULT_DISABLED_NOTICE,
} from "@/lib/feature-toggle";
import { useAppConfig } from "@/lib/ConfigContext";

export default function CpanelFeatureTogglesPage() {
  const { updateConfig } = useAppConfig();
  const [toggles, setToggles] = useState<FeatureToggles>(DEFAULT_FEATURE_TOGGLES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchToggles();
  }, []);

  const fetchToggles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/feature-toggles");
      const data = await res.json();
      if (res.ok && data.success && data.toggles) {
        setToggles(data.toggles);
      }
    } catch (err) {
      console.warn("Failed to fetch feature toggles:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleChange = (key: FeatureToggleKey, enabled: boolean) => {
    setToggles((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        enabled,
        disabledNotice: prev[key]?.disabledNotice || DEFAULT_DISABLED_NOTICE,
      },
    }));
  };

  const handleNoticeChange = (key: FeatureToggleKey, disabledNotice: string) => {
    setToggles((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        disabledNotice,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/feature-toggles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toggles }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save feature toggles");
      }

      // Also sync to global app config state
      await updateConfig({ featureToggles: data.toggles });

      toast.success("Service feature controls updated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Error saving feature controls.");
    } finally {
      setSaving(false);
    }
  };

  const keys = Object.keys(FEATURE_METADATA) as FeatureToggleKey[];
  const disabledCount = keys.filter((k) => !toggles[k]?.enabled).length;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6 font-hanken">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-200/80 dark:border-gray-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-[#FC7A00]/15 text-[#FC7A00] flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[24px]">toggle_on</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                Service Feature Controls
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                Turn specific platform operations ON or OFF instantly across mobile and web interfaces
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            {disabledCount} Disabled
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="py-3 px-6 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md hover:brightness-105 active:scale-98 border-0 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">save</span>
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-900 dark:text-blue-300 text-xs font-medium leading-relaxed flex items-start gap-3">
        <span className="material-symbols-outlined text-blue-500 text-[20px] shrink-0 mt-0.5">info</span>
        <div>
          When a service section is turned <strong>OFF</strong>, users attempting to access that feature will be shown an interactive notice message:
          <em className="block mt-1 text-blue-700 dark:text-blue-200 font-semibold font-mono">
            &quot;This operation is currently not available. Please try again later.&quot;
          </em>
          Backend API endpoints are also guarded server-side to prevent unauthorized requests.
        </div>
      </div>

      {/* Grid of Toggle Cards */}
      {loading ? (
        <div className="p-12 text-center text-gray-400 space-y-3">
          <div className="w-8 h-8 border-3 border-[#FC7A00] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold">Loading service controls...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {keys.map((key) => {
            const meta = FEATURE_METADATA[key];
            const item = toggles[key] || { enabled: true, disabledNotice: DEFAULT_DISABLED_NOTICE };
            const isEnabled = item.enabled !== false;

            return (
              <div
                key={key}
                className={`p-5 rounded-3xl border transition-all flex flex-col justify-between space-y-4 shadow-xs ${
                  isEnabled
                    ? "bg-white dark:bg-gray-900 border-gray-200/80 dark:border-gray-800"
                    : "bg-red-500/5 dark:bg-red-950/20 border-red-500/30"
                }`}
              >
                {/* Card Top Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                        isEnabled
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-red-500/15 text-red-600 dark:text-red-400"
                      }`}
                    >
                      <span className="material-symbols-outlined text-[22px]">{meta.icon}</span>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                        <span>{meta.name}</span>
                      </h3>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium leading-tight mt-0.5">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ON / OFF Switch */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                  <span className="text-xs font-black uppercase tracking-wider opacity-80">
                    Status:{" "}
                    <span className={isEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                      {isEnabled ? "ACTIVE (ON)" : "DISABLED (OFF)"}
                    </span>
                  </span>

                  <button
                    type="button"
                    onClick={() => handleToggleChange(key, !isEnabled)}
                    className={`relative w-12 h-6 rounded-full transition-colors duration-200 ease-in-out p-1 cursor-pointer focus:outline-none ${
                      isEnabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-700"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                        isEnabled ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Notice Input */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                    Custom Notice (when OFF)
                  </label>
                  <input
                    type="text"
                    value={item.disabledNotice || DEFAULT_DISABLED_NOTICE}
                    onChange={(e) => handleNoticeChange(key, e.target.value)}
                    disabled={isEnabled}
                    placeholder={DEFAULT_DISABLED_NOTICE}
                    className="w-full text-xs p-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50 focus:border-[#FC7A00] outline-none transition-all"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
