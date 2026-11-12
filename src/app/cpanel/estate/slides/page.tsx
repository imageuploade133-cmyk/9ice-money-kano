"use client";

import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { useAppConfig } from "@/lib/ConfigContext";
import { uploadImageSecurely } from "@/lib/image-upload";
import { UploadProgressBar } from "@/components/UploadProgressBar";
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

interface EstateSlide {
  id: string;
  imageUrl: string;
  title?: string;
  description?: string;
  targetPage: "all" | "bills" | "investment" | "referral" | "transfer" | "store" | "estate";
  link?: string;
  position?: number;
  customWidth?: number | null;
  customHeight?: number | null;
  mobileHeight?: number | null;
  desktopHeight?: number | null;
  marginBottom?: number | null;
  isCrop?: boolean;
  isHidden?: boolean;
  createdAt?: string;
}

function AdminEstateSlidesPageContent() {
  const { user } = useAuth();
  const { config, updateConfig } = useAppConfig();

  // Global CPanel Theme
  const { isDark, toggleTheme } = useCpanelTheme();
  const panelClass = isDark
    ? "bg-[#111827] border-gray-800/80 text-white shadow-2xs"
    : "bg-white border-gray-200/90 text-gray-900 shadow-3xs";
  const inputClass = isDark
    ? "bg-[#111827] border border-gray-700 text-white placeholder-gray-500 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full"
    : "bg-[#F9FAFB] border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-[#FC7A00] focus:ring-1 focus:ring-[#FC7A00] rounded-xl transition-all shadow-3xs max-w-full h-10 px-3 text-xs outline-none font-semibold truncate w-full";

  // Form states for new slide
  const [imageUrl, setImageUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetPage, setTargetPage] = useState<"all" | "bills" | "investment" | "referral" | "transfer" | "store" | "estate">("estate");
  const [link, setLink] = useState("");
  const [position, setPosition] = useState<number>(1);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Banner customize states
  const [bannerOverlayFade, setBannerOverlayFade] = useState(config.bannerOverlayFadeEnabled !== false);
  const [bannerSlideInterval, setBannerSlideInterval] = useState(config.bannerSlideIntervalSeconds || 5);
  const [bannerBorderEnabled, setBannerBorderEnabled] = useState(config.bannerBorderEnabled !== false);
  const [bannerBorderColor, setBannerBorderColor] = useState(config.bannerBorderColor || "#e5e7eb");
  const [bannerBackgroundColor, setBannerBackgroundColor] = useState(config.bannerBackgroundColor || "#111827");
  const [bannerImageMode, setBannerImageMode] = useState<"cover" | "contain">(config.bannerImageMode || "cover");
  const [bannerSlideEffect, setBannerSlideEffect] = useState<"fade" | "slide">(config.bannerSlideEffect || "fade");
  const [bannerImagePosition, setBannerImagePosition] = useState(config.bannerImagePosition || "center");
  const [bannerHeightMobile, setBannerHeightMobile] = useState(config.bannerHeightMobile || 150);
  const [bannerHeightDesktop, setBannerHeightDesktop] = useState(config.bannerHeightDesktop || 220);
  const [bannerShowIndicators, setBannerShowIndicators] = useState(config.bannerShowIndicators !== false);
  const [bannerMarginBottom, setBannerMarginBottom] = useState<number>(config.bannerMarginBottom ?? 24);
  const [isSavingDisplaySettings, setIsSavingDisplaySettings] = useState(false);

  // Per-slide edit modal state
  const [editingSlide, setEditingSlide] = useState<EstateSlide | null>(null);
  const [isUpdatingSlide, setIsUpdatingSlide] = useState(false);

  // List states
  const [slides, setSlides] = useState<EstateSlide[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);

  // Sync customize state with config when config updates
  useEffect(() => {
    setBannerOverlayFade(config.bannerOverlayFadeEnabled !== false);
    setBannerSlideInterval(config.bannerSlideIntervalSeconds || 5);
    setBannerBorderEnabled(config.bannerBorderEnabled !== false);
    setBannerBorderColor(config.bannerBorderColor || "#e5e7eb");
    setBannerBackgroundColor(config.bannerBackgroundColor || "#111827");
    setBannerImageMode(config.bannerImageMode || "cover");
    setBannerSlideEffect(config.bannerSlideEffect || "fade");
    setBannerImagePosition(config.bannerImagePosition || "center");
    setBannerHeightMobile(config.bannerHeightMobile || 150);
    setBannerHeightDesktop(config.bannerHeightDesktop || 220);
    setBannerShowIndicators(config.bannerShowIndicators !== false);
    setBannerMarginBottom(config.bannerMarginBottom ?? 24);
  }, [config]);

  const handleSaveDisplaySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDisplaySettings(true);
    try {
      await updateConfig({
        bannerOverlayFadeEnabled: bannerOverlayFade,
        bannerSlideIntervalSeconds: bannerSlideInterval,
        bannerBorderEnabled: bannerBorderEnabled,
        bannerBorderColor: bannerBorderColor,
        bannerBackgroundColor: bannerBackgroundColor,
        bannerImageMode: bannerImageMode,
        bannerSlideEffect: bannerSlideEffect,
        bannerImagePosition: bannerImagePosition,
        bannerHeightMobile: bannerHeightMobile,
        bannerHeightDesktop: bannerHeightDesktop,
        bannerShowIndicators: bannerShowIndicators,
        bannerMarginBottom: bannerMarginBottom,
      });
      toast.success("Estate banner display settings updated successfully!");
    } catch {
      toast.error("Failed to save banner display configurations.");
    } finally {
      setIsSavingDisplaySettings(false);
    }
  };

  useEffect(() => {
    fetchSlides();
  }, []);

  const fetchSlides = async () => {
    setIsLoadingList(true);
    try {
      const isMock = sessionStorage.getItem("mock") === "true";
      let idToken = "mock-admin-token";
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/banners", {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.banners)) {
        // Filter estate slides or show all assigned to estate
        const estateSlides = data.banners.filter(
          (b: any) => b.targetPage === "estate" || b.targetPage === "all"
        );
        setSlides(estateSlides);
      } else {
        toast.error(data.error || "Failed to load active estate slides.");
      }
    } catch {
      toast.error("Network communication failure loading slides.");
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    toast.loading("Uploading estate slide image securely...");

    setUploadProgress(5);
    try {
      const result = await uploadImageSecurely(file, "estate_banner", (percent) => {
        setUploadProgress(percent);
      });
      toast.dismiss();

      if (result.success && result.url) {
        setImageUrl(result.url);
        toast.success("Slide image uploaded and verified successfully!");
      } else {
        toast.error(result.error || "Failed to upload slide image.");
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "Slide image upload failed.");
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 400);
    }
  };

  const handleEditFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingSlide) return;

    setIsUploading(true);
    toast.loading("Uploading new slide image...");

    setUploadProgress(5);
    try {
      const result = await uploadImageSecurely(file, "estate_banner", (percent) => {
        setUploadProgress(percent);
      });
      toast.dismiss();

      if (result.success && result.url) {
        setEditingSlide({ ...editingSlide, imageUrl: result.url });
        toast.success("Slide image updated successfully!");
      } else {
        toast.error(result.error || "Failed to upload image.");
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || "Image upload failed.");
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 400);
    }
  };

  const handleAddSlide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl.trim()) {
      toast.error("Please upload or enter a slide banner image URL.");
      return;
    }

    setIsSaving(true);
    try {
      const isMock = sessionStorage.getItem("mock") === "true";
      let idToken = "mock-admin-token";
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/banners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          imageUrl: imageUrl.trim(),
          title: title.trim(),
          description: description.trim(),
          targetPage,
          link: link.trim(),
          position: Number(position) || 1,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Estate banner slide deployed!");
        setImageUrl("");
        setTitle("");
        setDescription("");
        setLink("");
        setTargetPage("estate");
        fetchSlides();
      } else {
        toast.error(data.error || "Failed to save slide.");
      }
    } catch {
      toast.error("API connection error while saving slide.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateSlideSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlide) return;

    setIsUpdatingSlide(true);
    try {
      const isMock = sessionStorage.getItem("mock") === "true";
      let idToken = "mock-admin-token";
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/banners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          id: editingSlide.id,
          imageUrl: editingSlide.imageUrl,
          title: editingSlide.title,
          description: editingSlide.description,
          targetPage: editingSlide.targetPage,
          link: editingSlide.link,
          position: Number(editingSlide.position) || 1,
          customWidth: editingSlide.customWidth,
          customHeight: editingSlide.customHeight,
          mobileHeight: editingSlide.mobileHeight,
          desktopHeight: editingSlide.desktopHeight,
          marginBottom: editingSlide.marginBottom,
          isCrop: editingSlide.isCrop,
          isHidden: editingSlide.isHidden,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Slide parameters saved successfully!");
        setEditingSlide(null);
        fetchSlides();
      } else {
        toast.error(data.error || "Failed to update slide.");
      }
    } catch {
      toast.error("API connection error while updating slide.");
    } finally {
      setIsUpdatingSlide(false);
    }
  };

  const handleDeleteSlide = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this estate slide banner?")) {
      return;
    }

    try {
      const isMock = sessionStorage.getItem("mock") === "true";
      let idToken = "mock-admin-token";
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch(`/api/admin/banners?id=${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Slide deleted successfully.");
        fetchSlides();
      } else {
        toast.error(data.error || "Failed to delete slide.");
      }
    } catch {
      toast.error("API connection error while deleting slide.");
    }
  };

  const handleQuickMovePosition = async (slide: EstateSlide, delta: number) => {
    const currentPos = slide.position || 1;
    const newPos = Math.max(1, currentPos + delta);
    if (newPos === currentPos) return;

    try {
      const isMock = sessionStorage.getItem("mock") === "true";
      let idToken = "mock-admin-token";
      if (!isMock && user) {
        idToken = await user.getIdToken();
      }

      const res = await fetch("/api/admin/banners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          id: slide.id,
          imageUrl: slide.imageUrl,
          title: slide.title,
          description: slide.description,
          targetPage: slide.targetPage,
          link: slide.link,
          position: newPos,
          customWidth: slide.customWidth,
          customHeight: slide.customHeight,
          mobileHeight: slide.mobileHeight,
          desktopHeight: slide.desktopHeight,
          marginBottom: slide.marginBottom,
          isCrop: slide.isCrop,
          isHidden: slide.isHidden,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Slide moved to position #${newPos}`);
        fetchSlides();
      } else {
        toast.error(data.error || "Failed to update position.");
      }
    } catch {
      toast.error("Network error updating slide position.");
    }
  };

  return (
    <CpanelRouteGuard requiredPermission="estate.view">
      <div className={cn("min-h-screen flex flex-col font-sans transition-colors duration-300", isDark ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-800")}>

        {/* Sticky Header Bar */}
        <div role="banner" className={cn("sticky top-0 z-40 border-b transition-colors duration-300 px-6 py-4 flex items-center justify-between", isDark ? "bg-gray-950/80 backdrop-blur-md border-gray-850" : "bg-white/80 backdrop-blur-md border-gray-200")}>
          <div className="flex items-center gap-3">
            <Link href="/cpanel" className={cn("w-9 h-9 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50")}>
              <span className="material-symbols-outlined text-[18px] font-bold">arrow_back</span>
            </Link>
            <div>
              <h1 className="font-extrabold text-base tracking-tight leading-tight uppercase">Estate Slides & Banners</h1>
              <p className="text-[10px] text-gray-400 font-semibold">Deploy and customize promotional slideshow banners displayed on E-Global Estate.</p>
            </div>
          </div>

          <button onClick={toggleTheme} className={cn("w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer", isDark ? "bg-gray-900 border-gray-800 text-amber-400 hover:bg-gray-800" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50")}>
            <span className="material-symbols-outlined text-[20px]">{isDark ? "light_mode" : "dark_mode"}</span>
          </button>
        </div>

        <div className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Side: Create/Upload Slide Form & Customizer */}
          <div className="lg:col-span-1 space-y-6">
            {/* Banner Customize Panel */}
            <div className={cn("rounded-2xl p-5 border transition-all shadow-none", panelClass)}>
              <div className={cn("border-b pb-3 mb-4 flex items-center gap-2", isDark ? "border-gray-800" : "border-gray-150")}>
                <span className="material-symbols-outlined text-orange-500 text-[20px]">tune</span>
                <h3 className="font-black text-xs uppercase tracking-wider">Display Settings</h3>
              </div>

              <form onSubmit={handleSaveDisplaySettings} className="space-y-4">
                {/* Fade Overlay */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Remove Overlay Fade</span>
                  <button
                    type="button"
                    onClick={() => setBannerOverlayFade(!bannerOverlayFade)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-[10px] font-black uppercase border transition-all cursor-pointer",
                      !bannerOverlayFade
                        ? "bg-orange-500/10 border-orange-500/20 text-[#FC7A00]"
                        : isDark ? "bg-gray-800 border-gray-700 text-gray-400" : "bg-gray-100 border-gray-200 text-gray-700"
                    )}
                  >
                    {!bannerOverlayFade ? "Fade Removed" : "Fade Active"}
                  </button>
                </div>

                {/* Slider interval */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Slideshow Interval (Seconds)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={bannerSlideInterval}
                    onChange={(e) => setBannerSlideInterval(Math.max(1, parseInt(e.target.value) || 1))}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-orange-500 tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">format_list_numbered</span>
                    Slide Position / Order Number (#)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    placeholder="e.g. 1"
                    value={position}
                    onChange={(e) => setPosition(Math.max(1, parseInt(e.target.value) || 1))}
                    className={cn(inputClass, "font-mono font-bold")}
                  />
                </div>

                {/* Border Toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Remove Border</span>
                  <button
                    type="button"
                    onClick={() => setBannerBorderEnabled(!bannerBorderEnabled)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-[10px] font-black uppercase border transition-all cursor-pointer",
                      !bannerBorderEnabled
                        ? "bg-orange-500/10 border-orange-500/20 text-[#FC7A00]"
                        : isDark ? "bg-gray-800 border-gray-700 text-gray-400" : "bg-gray-100 border-gray-200 text-gray-700"
                    )}
                  >
                    {!bannerBorderEnabled ? "Border Removed" : "Border Active"}
                  </button>
                </div>

                {/* Border Color */}
                {bannerBorderEnabled && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Border Color Hex</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="#e5e7eb"
                        value={bannerBorderColor}
                        onChange={(e) => setBannerBorderColor(e.target.value)}
                        className={inputClass}
                      />
                      <input
                        type="color"
                        value={bannerBorderColor.startsWith("#") ? bannerBorderColor : "#e5e7eb"}
                        onChange={(e) => setBannerBorderColor(e.target.value)}
                        className="w-10 h-10 rounded-xl cursor-pointer border-0 p-0 overflow-hidden shrink-0"
                      />
                    </div>
                  </div>
                )}

                {/* Background Color */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Background Color Hex</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="#111827"
                      value={bannerBackgroundColor}
                      onChange={(e) => setBannerBackgroundColor(e.target.value)}
                      className={inputClass}
                    />
                    <input
                      type="color"
                      value={bannerBackgroundColor.startsWith("#") ? bannerBackgroundColor : "#111827"}
                      onChange={(e) => setBannerBackgroundColor(e.target.value)}
                      className="w-10 h-10 rounded-xl cursor-pointer border-0 p-0 overflow-hidden shrink-0"
                    />
                  </div>
                </div>

                {/* Slide Effect */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Slide Transition Effect</label>
                  <select
                    value={bannerSlideEffect}
                    onChange={(e) => setBannerSlideEffect(e.target.value as "fade" | "slide")}
                    className={cn(inputClass, "cursor-pointer font-bold")}
                  >
                    <option value="fade">Seamless Cross-Fade (No Blinking)</option>
                    <option value="slide">Smooth Slide-In (Right-to-Left)</option>
                  </select>
                </div>

                {/* Crop Height Mobile */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Mobile Height (px)</label>
                  <input
                    type="number"
                    min={80}
                    max={400}
                    value={bannerHeightMobile}
                    onChange={(e) => setBannerHeightMobile(Math.max(80, parseInt(e.target.value) || 120))}
                    className={inputClass}
                  />
                </div>

                {/* Crop Height Desktop */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Desktop Height (px)</label>
                  <input
                    type="number"
                    min={100}
                    max={600}
                    value={bannerHeightDesktop}
                    onChange={(e) => setBannerHeightDesktop(Math.max(100, parseInt(e.target.value) || 200))}
                    className={inputClass}
                  />
                </div>

                {/* Crop Align position */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Image Crop Alignment (Position)</label>
                  <select
                    value={bannerImagePosition}
                    onChange={(e) => setBannerImagePosition(e.target.value)}
                    className={cn(inputClass, "cursor-pointer font-bold")}
                  >
                    <option value="center">Center</option>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </div>

                {/* Image Size Mode (Contain vs Cover) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Image Size Mode</label>
                  <select
                    value={bannerImageMode}
                    onChange={(e) => setBannerImageMode(e.target.value as "cover" | "contain")}
                    className={cn(inputClass, "cursor-pointer font-bold")}
                  >
                    <option value="cover">Crop to Screen Size (Cover - Adjust Height/Alignment above)</option>
                    <option value="contain">Keep Image Aspect Ratio (Don&apos;t Cut Off)</option>
                  </select>
                </div>

                {/* Hide Slide Indicators Toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Slide Indicators / Dots</span>
                  <button
                    type="button"
                    onClick={() => setBannerShowIndicators(!bannerShowIndicators)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-[10px] font-black uppercase border transition-all cursor-pointer",
                      bannerShowIndicators
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                        : isDark ? "bg-gray-800 border-gray-700 text-gray-400" : "bg-gray-100 border-gray-200 text-gray-700"
                    )}
                  >
                    {bannerShowIndicators ? "Indicators Visible" : "Indicators Hidden"}
                  </button>
                </div>

                {/* Global Default Bottom Space / Margin Slider */}
                <div className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">
                      Global Bottom Space / Margin (0 - 100 px)
                    </span>
                    <span className="font-mono text-xs font-black text-indigo-600">
                      {bannerMarginBottom} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={bannerMarginBottom}
                    onChange={(e) => setBannerMarginBottom(parseInt(e.target.value) || 0)}
                    className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-gray-200 rounded-lg appearance-none"
                  />
                  <div className="flex justify-between text-[9px] font-bold text-gray-400">
                    <span>0px (No Gap)</span>
                    <span>24px (Default)</span>
                    <span>100px (Large Gap)</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSavingDisplaySettings}
                  className="w-full py-3 bg-black hover:brightness-110 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSavingDisplaySettings ? <ButtonSpinner /> : "Save Display Settings"}
                </button>
              </form>
            </div>

            {/* Add Estate Slide Form */}
            <div className={cn("rounded-2xl p-5 border transition-all shadow-none", panelClass)}>
              <div className={cn("border-b pb-3 mb-4 flex items-center gap-2", isDark ? "border-gray-800" : "border-gray-150")}>
                <span className="material-symbols-outlined text-orange-500 text-[20px]">add_photo_alternate</span>
                <h3 className="font-black text-xs uppercase tracking-wider">Add Estate Slide</h3>
              </div>

              <form onSubmit={handleAddSlide} className="space-y-4">
                <UploadProgressBar
                  isUploading={isUploading}
                  progress={uploadProgress}
                  label="Uploading Estate Slide Banner..."
                />

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Slide Image <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder="https://..."
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className={inputClass}
                    />
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*, image/gif, image/svg+xml, .gif, .svg"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                        disabled={isUploading}
                      />
                      <button
                        type="button"
                        disabled={isUploading}
                        className={cn("px-3 h-10 border rounded-xl flex items-center justify-center transition-all", isDark ? "bg-gray-850 border-gray-700 text-white" : "bg-gray-100 border-gray-200 text-gray-700")}
                      >
                        {isUploading ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">upload</span>}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Slide Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Luxury Lekki Phase 1 Apartments"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Slide Description</label>
                  <textarea
                    placeholder="e.g. Special weekend discounts on short-let rentals"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={cn(inputClass, "h-16 resize-none")}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Target Page</label>
                  <select
                    value={targetPage}
                    onChange={(e) => setTargetPage(e.target.value as any)}
                    className={cn(inputClass, "cursor-pointer font-bold")}
                  >
                    <option value="estate">Estate Marketplace</option>
                    <option value="all">All Pages (Carousel Loop)</option>
                    <option value="bills">Bills</option>
                    <option value="investment">Investment</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Action Link</label>
                  <input
                    type="text"
                    placeholder="e.g. /estate/seller or property link"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    className={inputClass}
                  />
                </div>

                {imageUrl && (
                  <div className="p-3 bg-black/10 border border-gray-150 rounded-2xl overflow-hidden relative">
                    <p className="text-[9px] font-black uppercase text-gray-400 mb-1">Slide Preview</p>
                    <div className="aspect-[3/1] rounded-lg overflow-hidden border bg-white relative">
                      <img src={imageUrl} alt="Banner Preview" className="w-full h-full object-cover" />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSaving || isUploading}
                  className="w-full py-3 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? <ButtonSpinner /> : "Deploy Estate Banner Slide"}
                </button>
              </form>
            </div>
          </div>

          {/* Right Side: Active Estate Slides */}
          <div className="lg:col-span-2 space-y-6">
            <div className={cn("rounded-2xl p-5 border transition-all shadow-none", panelClass)}>
              <div className={cn("border-b pb-3 mb-4 flex items-center justify-between", isDark ? "border-gray-800" : "border-gray-150")}>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-orange-500 text-[20px]">view_carousel</span>
                  <h3 className="font-black text-xs uppercase tracking-wider">Active Estate Slides ({slides.length})</h3>
                </div>
                <button
                  onClick={fetchSlides}
                  className={cn("p-1.5 border rounded-lg transition-all", isDark ? "border-gray-850 hover:bg-gray-850" : "border-gray-200 hover:bg-gray-50")}
                >
                  <span className="material-symbols-outlined text-[16px] font-bold block">refresh</span>
                </button>
              </div>

              {isLoadingList ? (
                <div className="text-center py-20 text-gray-400 text-xs font-bold uppercase tracking-widest animate-pulse">
                  <ButtonSpinner /> Loading Estate Slides...
                </div>
              ) : slides.length === 0 ? (
                <div className={cn("text-center py-20 border border-dashed rounded-2xl flex flex-col items-center justify-center p-6 space-y-3", isDark ? "border-gray-800" : "border-gray-200")}>
                  <span className="material-symbols-outlined text-[36px] text-gray-400">landscape</span>
                  <p className="text-xs uppercase font-black text-gray-400">No Estate Banners Deployed</p>
                  <p className="text-[11px] text-gray-500 font-semibold max-w-sm mx-auto leading-relaxed">
                    Upload new promotional slides on the left to render them on E-Global Estate home page.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {slides.map((b) => (
                    <div key={b.id} className={cn("p-4 border rounded-2xl flex flex-col md:flex-row gap-4 items-start md:items-center justify-between transition-all", isDark ? "border-gray-850 bg-gray-900/40 hover:bg-gray-850/30" : "border-gray-150 bg-gray-50/50 hover:bg-gray-100/30")}>
                      <div className="flex gap-4 flex-1 items-start min-w-0">
                        <div className="w-24 h-12 rounded-lg border bg-white overflow-hidden flex-shrink-0">
                          <img src={b.imageUrl} alt="Slide Thumbnail" className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-extrabold text-xs uppercase tracking-tight text-orange-500 leading-tight select-all truncate">{b.title || "Untitled Estate Slide"}</h4>
                          <p className={cn("text-[10px] font-medium leading-relaxed truncate mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>{b.description || "No description provided."}</p>
                          <div className="flex flex-wrap gap-2 mt-2 items-center">
                            <div className="flex items-center gap-1">
                              <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400">
                                Position #{b.position || 1}
                              </span>
                              <button
                                type="button"
                                title="Move Up"
                                onClick={() => handleQuickMovePosition(b, -1)}
                                disabled={(b.position || 1) <= 1}
                                className="w-5 h-5 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-orange-500/10 hover:text-orange-500 text-gray-500 disabled:opacity-30 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[12px] font-bold">arrow_upward</span>
                              </button>
                              <button
                                type="button"
                                title="Move Down"
                                onClick={() => handleQuickMovePosition(b, 1)}
                                className="w-5 h-5 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-orange-500/10 hover:text-orange-500 text-gray-500 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[12px] font-bold">arrow_downward</span>
                              </button>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border bg-amber-500/10 border-amber-500/20 text-amber-500">
                              Target: {b.targetPage}
                            </span>
                            {b.link && (
                              <span className={cn("px-2 py-0.5 rounded text-[8px] font-mono border max-w-[150px] truncate", isDark ? "bg-gray-850 border-gray-700 text-white" : "bg-gray-100 border-gray-200 text-gray-600")}>
                                Link: {b.link}
                              </span>
                            )}
                            <span className={cn("px-2 py-0.5 rounded text-[8px] font-bold uppercase border", b.isCrop !== false ? "bg-blue-500/10 border-blue-500/20 text-blue-500" : "bg-amber-500/10 border-amber-500/20 text-amber-500")}>
                              {b.isCrop !== false ? "Cover (Crop)" : "Contain"}
                            </span>
                            {b.isHidden && (
                              <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase border bg-red-500/10 border-red-500/20 text-red-500">
                                Hidden
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setEditingSlide(b)}
                          className={cn("px-3.5 h-10 rounded-xl font-bold text-xs uppercase border tracking-wider transition-all flex items-center gap-1.5 cursor-pointer", isDark ? "bg-gray-850 border-gray-700 text-orange-400 hover:bg-orange-500/10" : "bg-white border-gray-200 text-orange-600 hover:bg-orange-50")}
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                          <span>Customize</span>
                        </button>

                        <button
                          onClick={() => handleDeleteSlide(b.id)}
                          className={cn("px-3.5 h-10 rounded-xl font-bold text-xs uppercase border tracking-wider transition-all flex items-center gap-1.5 cursor-pointer", isDark ? "bg-gray-850 border-gray-700 text-red-400 hover:bg-red-500/10" : "bg-white border-gray-200 text-red-600 hover:bg-red-50")}
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Per-Slide Customizer Modal Drawer */}
        <AnimatePresence>
          {editingSlide && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setEditingSlide(null)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99998]"
              />

              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
                className={cn("fixed bottom-0 left-0 right-0 max-w-lg mx-auto rounded-t-[32px] z-[99999] p-6 pb-8 shadow-2xl border-t overflow-y-auto max-h-[90vh] no-scrollbar", isDark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900")}
              >
                <div className="w-12 h-1.5 bg-gray-300 rounded-full mb-5 mx-auto" />

                <div className="flex items-center justify-between border-b pb-4 mb-5 border-gray-200/50">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-orange-500">tune</span>
                    <h3 className="font-extrabold text-base">Customize Slide Parameters</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingSlide(null)}
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                  </button>
                </div>

                <form onSubmit={handleUpdateSlideSave} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Slide Image URL / Upload New File</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={editingSlide.imageUrl}
                        onChange={(e) => setEditingSlide({ ...editingSlide, imageUrl: e.target.value })}
                        className={inputClass}
                      />
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*, image/gif, image/svg+xml, .gif, .svg"
                          onChange={handleEditFileUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                          disabled={isUploading}
                        />
                        <button
                          type="button"
                          disabled={isUploading}
                          className={cn("px-3 h-[42px] border rounded-xl flex items-center justify-center transition-all", isDark ? "bg-gray-850 border-gray-700 text-white" : "bg-gray-100 border-gray-200 text-gray-700")}
                        >
                          {isUploading ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">upload</span>}
                        </button>
                      </div>
                    </div>
                  </div>

                  {editingSlide.imageUrl && (
                    <div className="p-2 bg-black/10 border border-gray-200/40 rounded-xl overflow-hidden relative">
                      <p className="text-[8.5px] font-black uppercase text-gray-400 mb-1">Slide Image Preview</p>
                      <div className="aspect-[3/1] rounded-lg overflow-hidden border bg-white relative">
                        <img src={editingSlide.imageUrl} alt="Slide Preview" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Title Caption</label>
                      <input
                        type="text"
                        value={editingSlide.title || ""}
                        onChange={(e) => setEditingSlide({ ...editingSlide, title: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Target Page</label>
                      <select
                        value={editingSlide.targetPage}
                        onChange={(e) => setEditingSlide({ ...editingSlide, targetPage: e.target.value as any })}
                        className={cn(inputClass, "cursor-pointer font-bold")}
                      >
                        <option value="estate">Estate Marketplace</option>
                        <option value="all">All Pages</option>
                        <option value="bills">Bills</option>
                        <option value="investment">Investment</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Description</label>
                    <input
                      type="text"
                      value={editingSlide.description || ""}
                      onChange={(e) => setEditingSlide({ ...editingSlide, description: e.target.value })}
                      className={inputClass}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Action Link</label>
                      <input
                        type="text"
                        value={editingSlide.link || ""}
                        onChange={(e) => setEditingSlide({ ...editingSlide, link: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-orange-500 tracking-wider flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">format_list_numbered</span>
                        Position Order (#)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={editingSlide.position || 1}
                        onChange={(e) => setEditingSlide({ ...editingSlide, position: Math.max(1, parseInt(e.target.value) || 1) })}
                        className={cn(inputClass, "font-mono font-bold")}
                      />
                    </div>
                  </div>

                  <div className="p-3.5 bg-orange-500/5 border border-orange-500/20 rounded-2xl space-y-3">
                    <p className="text-[10px] font-black uppercase text-[#FC7A00] tracking-wider flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">stay_current_portrait</span>
                      Per-Slide Mobile Height & Width
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Mobile Height (px)</label>
                        <input
                          type="number"
                          min={10}
                          max={600}
                          placeholder={`Global (${config.bannerHeightMobile || 150}px)`}
                          value={editingSlide.mobileHeight ?? editingSlide.customHeight ?? ""}
                          onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value) : null;
                            setEditingSlide({ ...editingSlide, mobileHeight: val, customHeight: val });
                          }}
                          className={inputClass}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Desktop Height (px)</label>
                        <input
                          type="number"
                          min={50}
                          max={800}
                          placeholder={`Global (${config.bannerHeightDesktop || 220}px)`}
                          value={editingSlide.desktopHeight ?? ""}
                          onChange={(e) => setEditingSlide({ ...editingSlide, desktopHeight: e.target.value ? parseInt(e.target.value) : null })}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black uppercase text-indigo-500 tracking-wider flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">format_line_spacing</span>
                        Slide Bottom Space / Margin (0 - 100 px)
                      </label>
                      <span className="font-mono text-xs font-extrabold text-indigo-600">
                        {editingSlide.marginBottom ?? 24} px
                      </span>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={editingSlide.marginBottom ?? 24}
                      onChange={(e) => setEditingSlide({ ...editingSlide, marginBottom: parseInt(e.target.value) })}
                      className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-gray-200 rounded-lg appearance-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Crop Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingSlide({ ...editingSlide, isCrop: true })}
                        className={cn(
                          "py-2.5 rounded-xl text-xs font-extrabold uppercase border transition-all cursor-pointer flex items-center justify-center gap-1.5",
                          editingSlide.isCrop !== false
                            ? "bg-orange-500/10 border-orange-500 text-orange-500"
                            : isDark ? "bg-gray-800 border-gray-700 text-gray-400" : "bg-gray-50 border-gray-200 text-gray-600"
                        )}
                      >
                        <span className="material-symbols-outlined text-[15px]">crop</span>
                        Cover (Crop)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingSlide({ ...editingSlide, isCrop: false })}
                        className={cn(
                          "py-2.5 rounded-xl text-xs font-extrabold uppercase border transition-all cursor-pointer flex items-center justify-center gap-1.5",
                          editingSlide.isCrop === false
                            ? "bg-emerald-500/10 border-emerald-500 text-emerald-500"
                            : isDark ? "bg-gray-800 border-gray-700 text-gray-400" : "bg-gray-50 border-gray-200 text-gray-600"
                        )}
                      >
                        <span className="material-symbols-outlined text-[15px]">crop_free</span>
                        Contain
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3.5 bg-gray-50 border rounded-xl border-gray-200/50">
                  <UploadProgressBar
                    isUploading={isUploading}
                    progress={uploadProgress}
                    label="Uploading Slide Image..."
                  />

                    <div>
                      <p className="text-xs font-black uppercase tracking-wider">Hide Slide</p>
                      <p className="text-[10px] text-gray-400 font-semibold">Temporarily disable slide without deleting</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingSlide({ ...editingSlide, isHidden: !editingSlide.isHidden })}
                      className={cn(
                        "px-3.5 py-1.5 rounded-xl text-xs font-extrabold uppercase border transition-all cursor-pointer",
                        editingSlide.isHidden
                          ? "bg-rose-500/10 border-rose-500/30 text-rose-500"
                          : "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                      )}
                    >
                      {editingSlide.isHidden ? "Hidden" : "Visible"}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isUpdatingSlide}
                    className="w-full py-3.5 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow-md"
                  >
                    {isUpdatingSlide ? <ButtonSpinner /> : "Save Customizations"}
                  </button>
                </form>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </CpanelRouteGuard>
  );
}

export default function AdminEstateSlidesPage() {
  return <AdminEstateSlidesPageContent />;
}
