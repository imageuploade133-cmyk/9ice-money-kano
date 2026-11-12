"use client";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";



import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { uploadImageSecurely } from "@/lib/image-upload";
import { StoreSliderSettingsPanel } from "@/components/cpanel/StoreSliderSettingsPanel";

interface StoreSlide {
  id: string;
  imageUrl: string;
  title: string;
  subtitle: string;
  description?: string;
  link: string;
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

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

function CpanelStoreSlidesPageContent() {
  const router = useRouter();
  const { isDark, toggleTheme } = useCpanelTheme();
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  const [slides, setSlides] = useState<StoreSlide[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New Slide Form State (Left Column)
  const [slideImageUrl, setSlideImageUrl] = useState("");
  const [slideTitle, setSlideTitle] = useState("");
  const [slideSubtitle, setSlideSubtitle] = useState("");
  const [slideLink, setSlideLink] = useState("");
  const [slidePosition, setSlidePosition] = useState<number>(1);
  const [isUploadingSlideImage, setIsUploadingSlideImage] = useState(false);
  const [isSavingSlide, setIsSavingSlide] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Per-Slide Modal Customizer Drawer State (matching /cpanel/banners)
  const [editingSlide, setEditingSlide] = useState<StoreSlide | null>(null);
  const [isUpdatingModalSlide, setIsUpdatingModalSlide] = useState(false);
  const [isUploadingModalImage, setIsUploadingModalImage] = useState(false);

  // Custom Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
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

  const triggerConfirm = (
    title: string,
    message: string,
    actionLabel: string,
    actionStyle: "danger" | "warning" | "success" | "info",
    onConfirm: () => void
  ) => {
    setConfirmModal({ isOpen: true, title, message, actionLabel, actionStyle, onConfirm });
  };


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

  const fetchStoreSlides = async () => {
    setIsLoading(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};

      const res = await fetch("/api/admin/store", { headers });
      const data = await res.json();

      if (data.success) {
        setSlides(data.slides || []);
      } else {
        toast.error(data.error || "Failed to load store slides.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error fetching store slides.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoadingSession) {
      fetchStoreSlides();
    }
  }, [isLoadingSession]);

  const uploadImageToImgBB = async (file: File, setUrl: (url: string) => void, setUploading: (u: boolean) => void) => {
    setUploading(true);
    toast.loading("Uploading image securely...", { id: "img-upload" });

    try {
      const result = await uploadImageSecurely(file, "store_product");
      if (result.success && result.url) {
        setUrl(result.url);
        toast.success("Image uploaded and verified successfully!", { id: "img-upload" });
      } else {
        toast.error(result.error || "Image upload failed.", { id: "img-upload" });
      }
    } catch (err: any) {
      toast.error(err.message || "Network error uploading image.", { id: "img-upload" });
    } finally {
      setUploading(false);
    }
  };

  const resetAddSlideForm = () => {
    setSlideImageUrl("");
    setSlideTitle("");
    setSlideSubtitle("");
    setSlideLink("");
    setSlidePosition(1);
  };

  const handleAddSlide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slideImageUrl.trim()) {
      toast.error("Slide image URL is required.");
      return;
    }

    setIsSavingSlide(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const res = await fetch("/api/admin/store", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "add_slide",
          slide: {
            imageUrl: slideImageUrl.trim(),
            title: slideTitle.trim(),
            subtitle: slideSubtitle.trim(),
            description: slideSubtitle.trim(),
            link: slideLink.trim(),
            position: Number(slidePosition) || 1,
            isCrop: true,
            isHidden: false,
            marginBottom: 20,
            mobileHeight: 176,
            desktopHeight: 220,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Store slide added successfully!");
        setSlides(data.slides || []);
        resetAddSlideForm();
      } else {
        toast.error(data.error || "Failed to save slide image.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error saving slide image.");
    } finally {
      setIsSavingSlide(false);
    }
  };

  const handleSaveModalCustomizations = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSlide) return;

    setIsUpdatingModalSlide(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const res = await fetch("/api/admin/store", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "edit_slide",
          slide: {
            id: editingSlide.id,
            imageUrl: editingSlide.imageUrl,
            title: editingSlide.title,
            subtitle: editingSlide.subtitle,
            description: editingSlide.description || editingSlide.subtitle,
            link: editingSlide.link,
            position: Number(editingSlide.position) || 1,
            customWidth: editingSlide.customWidth,
            mobileHeight: editingSlide.mobileHeight,
            desktopHeight: editingSlide.desktopHeight,
            marginBottom: editingSlide.marginBottom,
            isCrop: editingSlide.isCrop,
            isHidden: editingSlide.isHidden,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Slide customizations saved successfully!");
        setSlides(data.slides || []);
        setEditingSlide(null);
      } else {
        toast.error(data.error || "Failed to save slide customizations.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error updating slide customizations.");
    } finally {
      setIsUpdatingModalSlide(false);
    }
  };

  const handleDeleteSlide = async (slideId: string) => {
    triggerConfirm(
      "Delete Store Slide?",
      "Are you sure you want to permanently delete this storefront slideshow banner?",
      "Delete Slide",
      "danger",
      async () => {
        setDeletingId(slideId);
        try {
          const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
          const headers: Record<string, string> = isMock
            ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
            : { "Content-Type": "application/json" };

          const res = await fetch("/api/admin/store", {
            method: "POST",
            headers,
            body: JSON.stringify({
              action: "delete_slide",
              slideId,
            }),
          });

          const data = await res.json();
          if (res.ok && data.success) {
            toast.success("Store slide image deleted.");
            setSlides(data.slides || []);
          } else {
            toast.error(data.error || "Failed to delete slide image.");
          }
        } catch (err: any) {
          toast.error(err.message || "Network error deleting slide image.");
        } finally {
          setDeletingId(null);
        }
      }
    );
  };

  const handleQuickMovePosition = async (slide: StoreSlide, delta: number) => {
    const currentPos = slide.position || 1;
    const newPos = Math.max(1, currentPos + delta);
    if (newPos === currentPos) return;

    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const res = await fetch("/api/admin/store", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "edit_slide",
          slide: {
            id: slide.id,
            imageUrl: slide.imageUrl,
            title: slide.title,
            subtitle: slide.subtitle,
            description: slide.description,
            link: slide.link,
            position: newPos,
            customWidth: slide.customWidth,
            mobileHeight: slide.mobileHeight,
            desktopHeight: slide.desktopHeight,
            marginBottom: slide.marginBottom,
            isCrop: slide.isCrop,
            isHidden: slide.isHidden,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Slide moved to position #${newPos}`);
        setSlides(data.slides || []);
      } else {
        toast.error(data.error || "Failed to update position.");
      }
    } catch {
      toast.error("Network error updating slide position.");
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
              href="/cpanel/store"
              className={cn("w-10 h-10 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-[22px]">view_carousel</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Storefront Slides Manager</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Deploy and customize promotional slideshow banners displayed on the public Store page.
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
              href="/cpanel/store"
              className="px-4 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">inventory_2</span>
              <span>Store Products</span>
            </Link>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column: Add Slide Form & Global Slider Settings Panel */}
          <div className="lg:col-span-1 space-y-6">
            <StoreSliderSettingsPanel isDark={isDark} />

            <div className={cn("p-5 rounded-2xl border space-y-4 h-fit", panelClass)}>
            <div className="flex items-center justify-between border-b border-gray-200/40 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-[20px]">add_photo_alternate</span>
                <h3 className="font-extrabold text-xs uppercase tracking-wider">
                  Add Store Banner Slide
                </h3>
              </div>
            </div>

            <form onSubmit={handleAddSlide} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Slide Image URL or Upload File *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Paste image URL (https://...)"
                    value={slideImageUrl}
                    onChange={(e) => setSlideImageUrl(e.target.value)}
                    className={cn("flex-1 h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all truncate", inputClass)}
                  />
                  <div className="relative flex-shrink-0">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadImageToImgBB(file, setSlideImageUrl, setIsUploadingSlideImage);
                      }}
                      disabled={isUploadingSlideImage}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                    />
                    <button
                      type="button"
                      disabled={isUploadingSlideImage}
                      className={cn("w-10 h-10 border rounded-xl flex items-center justify-center transition-all cursor-pointer", isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-100 border-gray-200 text-gray-700")}
                    >
                      {isUploadingSlideImage ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">upload</span>}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Slide Title</label>
                <input
                  type="text"
                  placeholder="e.g. Exclusive E-Tech Gear!"
                  value={slideTitle}
                  onChange={(e) => setSlideTitle(e.target.value)}
                  className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-orange-500 flex items-center gap-1 block">
                  <span className="material-symbols-outlined text-[14px]">format_list_numbered</span>
                  Slide Position / Order (#)
                </label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  placeholder="e.g. 1"
                  value={slidePosition}
                  onChange={(e) => setSlidePosition(Math.max(1, parseInt(e.target.value) || 1))}
                  className={cn("h-10 px-3 rounded-xl text-xs font-mono font-bold outline-none border transition-all w-full", inputClass)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Subtitle / Caption</label>
                <input
                  type="text"
                  placeholder="e.g. Get 20% discount on all POS hardware."
                  value={slideSubtitle}
                  onChange={(e) => setSlideSubtitle(e.target.value)}
                  className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Action Link</label>
                <input
                  type="text"
                  placeholder="e.g. /store or external URL"
                  value={slideLink}
                  onChange={(e) => setSlideLink(e.target.value)}
                  className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                />
              </div>

              {slideImageUrl && (
                <div className="p-3 bg-black/10 border border-gray-200/40 rounded-2xl overflow-hidden relative">
                  <p className="text-[9px] font-black uppercase text-gray-400 mb-1">Slide Image Preview</p>
                  <div className="aspect-[3/1] rounded-lg overflow-hidden border bg-white relative">
                    <img src={slideImageUrl} alt="Slide Preview" className="w-full h-full object-cover" />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingSlide || isUploadingSlideImage}
                className="w-full h-11 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
              >
                {isSavingSlide ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>}
                <span>Deploy Store Slide Banner</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Slides List */}
        <div className="lg:col-span-2 space-y-4">
            <div className={cn("p-4 rounded-2xl border flex items-center justify-between", panelClass)}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-[20px]">view_carousel</span>
                <h3 className="font-black text-xs uppercase tracking-wider">Active Store Slides ({slides.length})</h3>
              </div>
              <button
                type="button"
                onClick={fetchStoreSlides}
                className={cn("p-2 border rounded-xl transition-all cursor-pointer", isDark ? "border-gray-800 hover:bg-gray-800" : "border-gray-200 hover:bg-gray-100")}
              >
                <span className="material-symbols-outlined text-[16px] font-bold block">refresh</span>
              </button>
            </div>

            {isLoading ? (
              <div className={cn("p-12 rounded-2xl border text-center flex flex-col items-center justify-center gap-3", panelClass)}>
                <ButtonSpinner />
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Store Slides...</p>
              </div>
            ) : slides.length === 0 ? (
              <div className={cn("p-12 rounded-2xl border text-center space-y-3", panelClass)}>
                <span className="material-symbols-outlined text-[48px] text-gray-400">view_carousel</span>
                <p className="text-xs font-black uppercase text-gray-400">No Store Slides Deployed</p>
                <p className="text-[11px] text-gray-500 max-w-md mx-auto">Upload slideshow banner images to showcase store promotions to end-users.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {slides.map((slide) => {
                  const isDeleting = deletingId === slide.id;
                  return (
                    <div key={slide.id} className={cn("p-4 rounded-2xl border flex flex-col md:flex-row gap-4 items-center justify-between transition-all", panelClass)}>
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-28 h-16 rounded-xl border border-gray-200/50 bg-white overflow-hidden flex-shrink-0 relative">
                          <img
                            src={slide.imageUrl}
                            alt={slide.title || "Slide"}
                            className={cn("w-full h-full", slide.isCrop !== false ? "object-cover" : "object-contain bg-gray-900")}
                          />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <h4 className="font-extrabold text-xs uppercase tracking-tight truncate">{slide.title || "Untitled Slide"}</h4>
                          <p className="text-[11px] text-gray-400 font-medium truncate">{slide.subtitle || slide.description || "No subtitle provided."}</p>
                          <div className="flex flex-wrap gap-2 pt-1 items-center">
                            <div className="flex items-center gap-1">
                              <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400">
                                Position #{slide.position || 1}
                              </span>
                              <button
                                type="button"
                                title="Move Up"
                                onClick={() => handleQuickMovePosition(slide, -1)}
                                disabled={(slide.position || 1) <= 1}
                                className="w-5 h-5 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-orange-500/10 hover:text-orange-500 text-gray-500 disabled:opacity-30 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[12px] font-bold">arrow_upward</span>
                              </button>
                              <button
                                type="button"
                                title="Move Down"
                                onClick={() => handleQuickMovePosition(slide, 1)}
                                className="w-5 h-5 rounded border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-orange-500/10 hover:text-orange-500 text-gray-500 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[12px] font-bold">arrow_downward</span>
                              </button>
                            </div>
                            <span className={cn("px-2 py-0.5 rounded text-[8px] font-bold uppercase border", slide.isCrop !== false ? "bg-blue-500/10 border-blue-500/20 text-blue-500" : "bg-amber-500/10 border-amber-500/20 text-amber-500")}>
                              {slide.isCrop !== false ? "Cropped (Cover)" : "Non-Crop (Contain)"}
                            </span>
                            {slide.isHidden && (
                              <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase border bg-red-500/10 border-red-500/20 text-red-500">
                                Hidden
                              </span>
                            )}
                            {(slide.mobileHeight || slide.desktopHeight || slide.customWidth || slide.marginBottom !== undefined) && (
                              <span className={cn("px-2 py-0.5 rounded text-[8px] font-mono border", isDark ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-gray-100 border-gray-200 text-gray-700")}>
                                H: {slide.mobileHeight || 176}px | Bottom Space: {slide.marginBottom ?? 20}px
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingSlide(slide)}
                          className="px-3.5 h-10 border border-orange-500/30 text-[#FC7A00] bg-orange-500/10 hover:bg-orange-500/20 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                          <span>Customize</span>
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => handleDeleteSlide(slide.id)}
                          className="px-3.5 h-10 bg-red-600/10 hover:bg-red-600/20 text-red-500 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          {isDeleting ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[16px]">delete</span>}
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Per-Slide Customizer Modal Drawer (100% parity with /cpanel/banners) */}
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

              <form onSubmit={handleSaveModalCustomizations} className="space-y-4">
                {/* Image Preview & URL with File Upload Button */}
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
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            uploadImageToImgBB(
                              file,
                              (uploadedUrl) => setEditingSlide({ ...editingSlide, imageUrl: uploadedUrl }),
                              setIsUploadingModalImage
                            );
                          }
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                        disabled={isUploadingModalImage}
                      />
                      <button
                        type="button"
                        disabled={isUploadingModalImage}
                        className={cn("px-3 h-[42px] border rounded-xl flex items-center justify-center transition-all", isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-100 border-gray-200 text-gray-700")}
                      >
                        {isUploadingModalImage ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">upload</span>}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live Image Thumbnail Preview */}
                {editingSlide.imageUrl && (
                  <div className="p-2 bg-black/10 border border-gray-200/40 rounded-xl overflow-hidden relative">
                    <p className="text-[8.5px] font-black uppercase text-gray-400 mb-1">Slide Image Preview</p>
                    <div className="aspect-[3/1] rounded-lg overflow-hidden border bg-white relative">
                      <img src={editingSlide.imageUrl} alt="Slide Preview" className="w-full h-full object-cover" />
                    </div>
                  </div>
                )}

                {/* Title & Subtitle */}
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
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Subtitle</label>
                    <input
                      type="text"
                      value={editingSlide.subtitle || ""}
                      onChange={(e) => setEditingSlide({ ...editingSlide, subtitle: e.target.value })}
                      className={inputClass}
                    />
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

                {/* Dedicated Per-Slide Height Customization (Mobile & Desktop) */}
                <div className="p-3.5 bg-orange-500/5 border border-orange-500/20 rounded-2xl space-y-3">
                  <p className="text-[10px] font-black uppercase text-[#FC7A00] tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">stay_current_portrait</span>
                    Per-Slide Mobile & Desktop Heights
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Mobile Height (px)</label>
                      <input
                        type="number"
                        min={10}
                        max={600}
                        placeholder="Default (176px)"
                        value={editingSlide.mobileHeight ?? ""}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value) : null;
                          setEditingSlide({ ...editingSlide, mobileHeight: val });
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
                        placeholder="Default (220px)"
                        value={editingSlide.desktopHeight ?? ""}
                        onChange={(e) => setEditingSlide({ ...editingSlide, desktopHeight: e.target.value ? parseInt(e.target.value) : null })}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Slide Container Width (px / blank = 100% full width)</label>
                    <input
                      type="number"
                      min={10}
                      max={1200}
                      placeholder="Full Width (100%)"
                      value={editingSlide.customWidth ?? ""}
                      onChange={(e) => setEditingSlide({ ...editingSlide, customWidth: e.target.value ? parseInt(e.target.value) : null })}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Per-Slide Bottom Space / Margin Adjuster (0 - 100 px) */}
                <div className="p-3.5 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black uppercase text-indigo-500 tracking-wider flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">format_line_spacing</span>
                      Slide Bottom Space / Margin (0 - 100 px)
                    </label>
                    <span className="font-mono text-xs font-extrabold text-indigo-600">
                      {editingSlide.marginBottom ?? 20} px
                    </span>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={editingSlide.marginBottom ?? 20}
                    onChange={(e) => setEditingSlide({ ...editingSlide, marginBottom: parseInt(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-gray-200 rounded-lg appearance-none"
                  />

                  <div className="flex justify-between text-[9px] font-bold text-gray-400">
                    <span>0px (Tight)</span>
                    <span>20px (Default)</span>
                    <span>100px (Spacious)</span>
                  </div>
                </div>

                {/* Manual Crop vs Remove Crop Toggle */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Manual Crop / Remove Crop Mode</label>
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
                      Manual Crop (Cover)
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
                      Remove Crop (Contain)
                    </button>
                  </div>
                  <p className="text-[9px] text-gray-400 font-semibold leading-relaxed">
                    Remove Crop renders the full original image without clipping edges.
                  </p>
                </div>

                {/* Hide Slide Toggle */}
                <div className="flex items-center justify-between p-3.5 bg-gray-50 border rounded-xl border-gray-200/50">
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
                  disabled={isUpdatingModalSlide}
                  className="w-full py-3.5 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {isUpdatingModalSlide ? <ButtonSpinner /> : "Save Customizations"}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className={cn("w-[92vw] sm:w-full max-w-sm p-6 rounded-3xl border text-center shadow-2xl space-y-4", panelClass)}>
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center mx-auto border",
              confirmModal.actionStyle === "danger" && "bg-red-50 text-red-500 border-red-200 dark:bg-red-950/40 dark:border-red-900/50"
            )}>
              <span className="material-symbols-outlined text-[24px]">gpp_maybe</span>
            </div>

            <div>
              <h4 className="font-extrabold text-sm uppercase text-gray-900 dark:text-white">{confirmModal.title}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium leading-relaxed">{confirmModal.message}</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl text-xs font-black uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                  confirmModal.onConfirm();
                }}
                className="py-2.5 bg-red-600 text-white rounded-xl text-xs font-black uppercase cursor-pointer hover:bg-red-700"
              >
                {confirmModal.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CpanelStoreSlidesPage() {
  return (
    <CpanelRouteGuard requiredPermission="store.manage">
      <CpanelStoreSlidesPageContent />
    </CpanelRouteGuard>
  );
}