"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface StoreSettings {
  storeName?: string;
  storeLogoUrl?: string;
  enableProductSharing?: boolean;
  borderColor?: string;
  borderOpacity?: number;
  hideBorders?: boolean;
  enableGradientBorder?: boolean;
  gradientColorStart?: string;
  gradientColorEnd?: string;
  cardBorderRadius?: number;
  borderWidth?: number;
  recentlyViewedBorderEnabled?: boolean;
  recentlyViewedBorderColor?: string;
  recentlyViewedBorderOpacity?: number;
  orderStatuses?: string[];
  searchBarMarginTop?: number;
  bannerOverlayFadeEnabled?: boolean;
  bannerSlideIntervalSeconds?: number;
  bannerBorderEnabled?: boolean;
  bannerBorderColor?: string;
  bannerBackgroundColor?: string;
  bannerImageMode?: "cover" | "contain";
  bannerSlideEffect?: "fade" | "slide";
  bannerImagePosition?: string;
  bannerShowIndicators?: boolean;
  bannerMarginBottom?: number;
  bannerHeightMobile?: number;
  bannerHeightDesktop?: number;
}

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

interface StoreSliderSettingsPanelProps {
  isDark?: boolean;
  initialSettings?: StoreSettings;
  onSettingsUpdated?: (updated: StoreSettings) => void;
}

export const StoreSliderSettingsPanel: React.FC<StoreSliderSettingsPanelProps> = ({
  isDark = false,
  initialSettings,
  onSettingsUpdated,
}) => {
  const [isLoading, setIsLoading] = useState(!initialSettings);
  const [isSaving, setIsSaving] = useState(false);

  // All 7 requested Store Slider fields
  const [slideEffect, setSlideEffect] = useState<"fade" | "slide">("fade");
  const [backgroundColor, setBackgroundColor] = useState("#111827");
  const [overlayFadeEnabled, setOverlayFadeEnabled] = useState(true);
  const [slideIntervalSeconds, setSlideIntervalSeconds] = useState(5);
  const [cropAlignment, setCropAlignment] = useState("center");
  const [imageSizeMode, setImageSizeMode] = useState<"cover" | "contain">("cover");
  const [showIndicators, setShowIndicators] = useState(true);

  // Full settings object storage for payload merge
  const [fullSettings, setFullSettings] = useState<StoreSettings>(initialSettings || {});

  useEffect(() => {
    if (initialSettings) {
      applySettings(initialSettings);
      setIsLoading(false);
    } else {
      fetchCurrentSettings();
    }
  }, [initialSettings]);

  const applySettings = (s: StoreSettings) => {
    setFullSettings(s);
    setSlideEffect(s.bannerSlideEffect || "fade");
    setBackgroundColor(s.bannerBackgroundColor || "#111827");
    setOverlayFadeEnabled(s.bannerOverlayFadeEnabled !== false);
    setSlideIntervalSeconds(s.bannerSlideIntervalSeconds || 5);
    setCropAlignment(s.bannerImagePosition || "center");
    setImageSizeMode(s.bannerImageMode || "cover");
    setShowIndicators(s.bannerShowIndicators !== false);
  };

  const fetchCurrentSettings = async () => {
    setIsLoading(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};

      const res = await fetch("/api/admin/store", { headers });
      const data = await res.json();

      if (res.ok && data.success && data.settings) {
        applySettings(data.settings);
      }
    } catch (err) {
      console.warn("Error loading store slider settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSliderSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const updatedPayload: StoreSettings = {
        ...fullSettings,
        bannerSlideEffect: slideEffect,
        bannerBackgroundColor: backgroundColor,
        bannerOverlayFadeEnabled: overlayFadeEnabled,
        bannerSlideIntervalSeconds: Math.max(1, slideIntervalSeconds),
        bannerImagePosition: cropAlignment,
        bannerImageMode: imageSizeMode,
        bannerShowIndicators: showIndicators,
      };

      const res = await fetch("/api/admin/store", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "update_settings",
          settings: updatedPayload,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Store slider display configurations saved!");
        const savedSettings = data.settings || updatedPayload;
        applySettings(savedSettings);
        if (onSettingsUpdated) {
          onSettingsUpdated(savedSettings);
        }
      } else {
        toast.error(data.error || "Failed to update slider settings.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error saving slider configurations.");
    } finally {
      setIsSaving(false);
    }
  };

  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full";

  if (isLoading) {
    return (
      <div className={cn("p-5 rounded-2xl border text-center flex flex-col items-center justify-center gap-2", panelClass)}>
        <ButtonSpinner />
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Loading Slider Configurations...</p>
      </div>
    );
  }

  return (
    <div className={cn("p-5 rounded-2xl border space-y-4 transition-all", panelClass)}>
      <div className="border-b border-gray-200/40 dark:border-gray-800 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-orange-500 text-[20px]">tune</span>
          <h3 className="font-extrabold text-xs uppercase tracking-wider">Store Slider Display Settings</h3>
        </div>
        <button
          type="button"
          onClick={fetchCurrentSettings}
          className="text-[10px] font-bold text-gray-400 hover:text-black dark:hover:text-white uppercase cursor-pointer"
        >
          Refresh
        </button>
      </div>

      <form onSubmit={handleSaveSliderSettings} className="space-y-4">
        {/* 1. SLIDE TRANSITION EFFECT */}
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-gray-400 block">
            1. Slide Transition Effect
          </label>
          <select
            value={slideEffect}
            onChange={(e) => setSlideEffect(e.target.value as "fade" | "slide")}
            className={cn(inputClass, "cursor-pointer font-bold")}
          >
            <option value="fade">Seamless Cross-Fade (No Blinking)</option>
            <option value="slide">Smooth Slide-In (Right to Left)</option>
          </select>
        </div>

        {/* 2. BACKGROUND COLOR HEX */}
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-gray-400 block">
            2. Background Color Hex
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="#111827"
              value={backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
              className={inputClass}
            />
            <input
              type="color"
              value={backgroundColor.startsWith("#") ? backgroundColor : "#111827"}
              onChange={(e) => setBackgroundColor(e.target.value)}
              className="w-10 h-10 rounded-xl cursor-pointer border-0 p-0 overflow-hidden flex-shrink-0"
            />
          </div>
        </div>

        {/* 3. REMOVE OVERLAY FADE */}
        <div className="p-3.5 rounded-xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between">
          <div>
            <label className="text-[10.5px] font-extrabold uppercase text-[#FC7A00] block">
              3. Overlay Fade
            </label>
            <span className="text-[9.5px] text-gray-400 font-semibold block mt-0.5">
              Remove gradient overlay dark fade
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOverlayFadeEnabled(!overlayFadeEnabled)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border cursor-pointer transition-all",
              overlayFadeEnabled
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                : "bg-orange-500/10 border-orange-500/30 text-[#FC7A00]"
            )}
          >
            {overlayFadeEnabled ? "Fade Active" : "Fade Removed"}
          </button>
        </div>

        {/* 4. SLIDESHOW INTERVAL (SECONDS) */}
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-gray-400 block">
            4. Slideshow Interval (Seconds)
          </label>
          <input
            type="number"
            min={1}
            max={60}
            required
            value={slideIntervalSeconds}
            onChange={(e) => setSlideIntervalSeconds(parseInt(e.target.value) || 5)}
            className={inputClass}
          />
        </div>

        {/* 5. IMAGE CROP ALIGNMENT (POSITION) */}
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-gray-400 block">
            5. Image Crop Alignment (Position)
          </label>
          <select
            value={cropAlignment}
            onChange={(e) => setCropAlignment(e.target.value)}
            className={cn(inputClass, "cursor-pointer font-bold")}
          >
            <option value="center">Center</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>

        {/* 6. IMAGE SIZE MODE */}
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-gray-400 block">
            6. Image Size Mode
          </label>
          <select
            value={imageSizeMode}
            onChange={(e) => setImageSizeMode(e.target.value as "cover" | "contain")}
            className={cn(inputClass, "cursor-pointer font-bold")}
          >
            <option value="cover">Crop to Screen Size (Cover)</option>
            <option value="contain">Keep Full Aspect Ratio (Contain)</option>
          </select>
        </div>

        {/* 7. SLIDE INDICATORS / DOTS */}
        <div className="p-3.5 rounded-xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between">
          <div>
            <label className="text-[10.5px] font-extrabold uppercase text-[#FC7A00] block">
              7. Slide Indicators / Dots
            </label>
            <span className="text-[9.5px] text-gray-400 font-semibold block mt-0.5">
              Display carousel bottom navigation dots
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowIndicators(!showIndicators)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border cursor-pointer transition-all",
              showIndicators
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                : "bg-red-500/10 border-red-500/30 text-red-500"
            )}
          >
            {showIndicators ? "Dots Visible" : "Dots Hidden"}
          </button>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="w-full h-11 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
        >
          {isSaving ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">save</span>}
          <span>Save Slider Settings</span>
        </button>
      </form>
    </div>
  );
};
