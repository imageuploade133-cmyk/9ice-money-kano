"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { uploadImageSecurely } from "@/lib/image-upload";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";
import { clearStoreCache } from "@/lib/store-cache";

interface StoreSettings {
  storeName?: string;
  storeSubtitle?: string;
  storeNameColor?: string;
  storeSubtitleColor?: string;
  storeLogoUrl?: string;
  storeIconColor?: string;
  storeIconSize?: number;
  storeButtonColor?: string;
  storeButtonTextColor?: string;
  storeButtonIcon?: string;
  hideClearCacheButton?: boolean;
  topBarIconColor?: string;
  topBarWishlistIconColor?: string;
  topBarHistoryIconColor?: string;
  topBarCartIconColor?: string;
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
  productCardImageMode?: "cover" | "contain";
}

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

function CpanelStoreSettingsPageContent() {
  const router = useRouter();
  const { isDark, toggleTheme } = useCpanelTheme();
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Store Settings Form States
  const [storeName, setStoreName] = useState("E-Tech Store");
  const [storeSubtitle, setStoreSubtitle] = useState("Hardware & Premium Gear");
  const [storeNameColor, setStoreNameColor] = useState("#000000");
  const [storeSubtitleColor, setStoreSubtitleColor] = useState("#9CA3AF");
  const [storeLogoUrl, setStoreLogoUrl] = useState("");
  const [storeIconColor, setStoreIconColor] = useState("#FC7A00");
  const [storeIconSize, setStoreIconSize] = useState<number>(20);
  const [storeButtonColor, setStoreButtonColor] = useState("#FC7A00");
  const [storeButtonTextColor, setStoreButtonTextColor] = useState("#FFFFFF");
  const [storeButtonIcon, setStoreButtonIcon] = useState("bolt");
  const [hideClearCacheButton, setHideClearCacheButton] = useState(false);
  const [topBarIconColor, setTopBarIconColor] = useState("#374151");
  const [topBarWishlistIconColor, setTopBarWishlistIconColor] = useState("#EF4444");
  const [topBarHistoryIconColor, setTopBarHistoryIconColor] = useState("#FC7A00");
  const [topBarCartIconColor, setTopBarCartIconColor] = useState("#1F2937");
  const [enableProductSharing, setEnableProductSharing] = useState(true);
  const [productPageHeaderAlignment, setProductPageHeaderAlignment] = useState<"left" | "center" | "right">("left");
  const [enableProductVideo, setEnableProductVideo] = useState(true);
  const [hideCardPayment, setHideCardPayment] = useState(false);
  const [enablePickup, setEnablePickup] = useState(false);
  const [productCardImageMode, setProductCardImageMode] = useState<"cover" | "contain">("cover");
  const [isUploadingStoreLogo, setIsUploadingStoreLogo] = useState(false);
  const [borderColor, setBorderColor] = useState("#FC7A00");
  const [borderOpacity, setBorderOpacity] = useState(100);
  const [hideBorders, setHideBorders] = useState(false);
  const [enableGradientBorder, setEnableGradientBorder] = useState(false);
  const [gradientColorStart, setGradientColorStart] = useState("#FC7A00");
  const [gradientColorEnd, setGradientColorEnd] = useState("#0b513d");
  const [cardBorderRadius, setCardBorderRadius] = useState<number>(16);
  const [borderWidth, setBorderWidth] = useState<number>(1);
  const [recentlyViewedBorderEnabled, setRecentlyViewedBorderEnabled] = useState(true);
  const [recentlyViewedBorderColor, setRecentlyViewedBorderColor] = useState("#FC7A00");
  const [recentlyViewedBorderOpacity, setRecentlyViewedBorderOpacity] = useState(20);
  const [searchBarMarginTop, setSearchBarMarginTop] = useState(0);
  const [orderStatuses, setOrderStatuses] = useState<string[]>([
    "Pending",
    "Processing",
    "Shipped",
    "Delivered",
    "Refunded",
    "Canceled",
  ]);

  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Section Reset Confirmation Modal State
  const [resetConfirmModal, setResetConfirmModal] = useState<{
    isOpen: boolean;
    sectionName: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    sectionName: "",
    onConfirm: () => {},
  });

  const promptResetConfirmation = (sectionName: string, onConfirmAction: () => void) => {
    setResetConfirmModal({
      isOpen: true,
      sectionName,
      onConfirm: onConfirmAction,
    });
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

  const fetchStoreSettings = async () => {
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};

      const res = await fetch("/api/admin/store", { headers });
      const data = await res.json();

      if (data.success && data.settings) {
        setStoreName(data.settings.storeName || "E-Tech Store");
        setStoreSubtitle(data.settings.storeSubtitle || "Hardware & Premium Gear");
        setStoreNameColor(data.settings.storeNameColor || "#000000");
        setStoreSubtitleColor(data.settings.storeSubtitleColor || "#9CA3AF");
        setStoreLogoUrl(data.settings.storeLogoUrl || "");
        setStoreIconColor(data.settings.storeIconColor || "#FC7A00");
        setStoreIconSize(data.settings.storeIconSize ?? 20);
        setStoreButtonColor(data.settings.storeButtonColor || "#FC7A00");
        setStoreButtonTextColor(data.settings.storeButtonTextColor || "#FFFFFF");
        setStoreButtonIcon(data.settings.storeButtonIcon || "bolt");
        setHideClearCacheButton(Boolean(data.settings.hideClearCacheButton));
        setTopBarIconColor(data.settings.topBarIconColor || "#374151");
        setTopBarWishlistIconColor(data.settings.topBarWishlistIconColor || "#EF4444");
        setTopBarHistoryIconColor(data.settings.topBarHistoryIconColor || "#FC7A00");
        setTopBarCartIconColor(data.settings.topBarCartIconColor || "#1F2937");
        setEnableProductSharing(data.settings.enableProductSharing !== false);
        setProductPageHeaderAlignment(
          data.settings.productPageHeaderAlignment === "center"
            ? "center"
            : data.settings.productPageHeaderAlignment === "right"
            ? "right"
            : "left"
        );
        setEnableProductVideo(data.settings.enableProductVideo !== false);
        setHideCardPayment(Boolean(data.settings.hideCardPayment));
        setEnablePickup(Boolean(data.settings.enablePickup));
        setProductCardImageMode(data.settings.productCardImageMode === "contain" ? "contain" : "cover");
        setBorderColor(data.settings.borderColor || "#FC7A00");
        setBorderOpacity(data.settings.borderOpacity ?? 100);
        setHideBorders(Boolean(data.settings.hideBorders));
        setEnableGradientBorder(Boolean(data.settings.enableGradientBorder));
        setGradientColorStart(data.settings.gradientColorStart || "#FC7A00");
        setGradientColorEnd(data.settings.gradientColorEnd || "#0b513d");
        setCardBorderRadius(data.settings.cardBorderRadius ?? 16);
        setBorderWidth(data.settings.borderWidth ?? 1);
        setRecentlyViewedBorderEnabled(data.settings.recentlyViewedBorderEnabled !== false);
        setRecentlyViewedBorderColor(data.settings.recentlyViewedBorderColor || "#FC7A00");
        setRecentlyViewedBorderOpacity(data.settings.recentlyViewedBorderOpacity ?? 20);
        setSearchBarMarginTop(data.settings.searchBarMarginTop ?? 0);
        if (Array.isArray(data.settings.orderStatuses)) {
          setOrderStatuses(data.settings.orderStatuses);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Network error fetching store settings.");
    }
  };

  useEffect(() => {
    if (!isLoadingSession) {
      fetchStoreSettings();
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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const res = await fetch("/api/admin/store", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "update_settings",
          settings: {
            storeName,
            storeSubtitle,
            storeNameColor,
            storeSubtitleColor,
            storeLogoUrl,
              storeIconColor,
              storeIconSize,
              storeButtonColor,
              storeButtonTextColor,
              storeButtonIcon,
              hideClearCacheButton,
              topBarIconColor,
              topBarWishlistIconColor,
              topBarHistoryIconColor,
              topBarCartIconColor,
            enableProductSharing,
            productPageHeaderAlignment,
            enableProductVideo,
            hideCardPayment,
            enablePickup,
            productCardImageMode,
            borderColor,
            borderOpacity,
            hideBorders,
            enableGradientBorder,
            gradientColorStart,
            gradientColorEnd,
            cardBorderRadius,
            borderWidth,
            recentlyViewedBorderEnabled,
            recentlyViewedBorderColor,
            recentlyViewedBorderOpacity,
            orderStatuses,
            searchBarMarginTop,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        clearStoreCache();
        toast.success("Storefront settings updated!");
      } else {
        toast.error(data.error || "Failed to update store settings.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error updating settings.");
    } finally {
      setIsSavingSettings(false);
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

        {/* Sticky Header Bar */}
        <div className={cn("sticky top-0 z-30 p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md shadow-xs", panelClass)}>
          <div className="flex items-center gap-3">
            <Link
              href="/cpanel/store"
              className={cn("w-10 h-10 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-[22px]">settings</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Store Settings</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Configure storefront name, branding logo, card border design, and sharing parameters.
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

        {/* Settings Form Container */}
        <div className="max-w-xl mx-auto">
          <div className={cn("p-6 rounded-2xl border space-y-5", panelClass)}>
            <div className="flex items-center gap-2 border-b border-gray-200/40 pb-3">
              <span className="material-symbols-outlined text-orange-500 text-[22px]">tune</span>
              <div>
                <h3 className="font-extrabold text-xs uppercase tracking-wider">Store Name, Brand Logo & Styling</h3>
                <p className="text-[10.5px] text-gray-400">Configure layout parameters, social product sharing, and product card borders.</p>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">

              {/* Product Card Image Display Mode (Crop / Fill vs Contain) */}
              <div className="p-4 rounded-2xl border border-orange-500/20 bg-orange-500/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-extrabold uppercase text-[#FC7A00] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">crop</span>
                      Product Card Image Crop & Display Mode
                    </label>
                    <span className="text-[10px] text-gray-500 font-medium block mt-0.5">
                      Choose whether product card thumbnails crop to fill box cleanly (Crop / Fill) or fit entire image with padding (Contain)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => promptResetConfirmation("Card Image Display Mode", () => setProductCardImageMode("cover"))}
                    className="text-[9.5px] font-bold text-[#FC7A00] hover:underline uppercase tracking-wider cursor-pointer border-0"
                  >
                    Reset Default
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setProductCardImageMode("cover")}
                    className={cn(
                      "py-3 px-3 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all flex items-center justify-center gap-2",
                      productCardImageMode === "cover"
                        ? "bg-[#FC7A00] text-white border-[#FC7A00] shadow-2xs"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                    )}
                  >
                    <span className="material-symbols-outlined text-[18px]">crop</span>
                    <span>Crop / Fill Box</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setProductCardImageMode("contain")}
                    className={cn(
                      "py-3 px-3 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all flex items-center justify-center gap-2",
                      productCardImageMode === "contain"
                        ? "bg-[#FC7A00] text-white border-[#FC7A00] shadow-2xs"
                        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                    )}
                  >
                    <span className="material-symbols-outlined text-[18px]">crop_free</span>
                    <span>Fit Entire Image</span>
                  </button>
                </div>
              </div>

              {/* Product Page Header Title Alignment Control */}
              <div className="p-4 rounded-2xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-extrabold uppercase text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">format_align_left</span>
                      Product Page Header Title Alignment
                    </label>
                    <span className="text-[10px] text-gray-400 block">
                      Align top header title & category on product detail page (Left, Center, Right)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => promptResetConfirmation("Header Alignment", () => setProductPageHeaderAlignment("left"))}
                    className="text-[9.5px] font-bold text-[#FC7A00] hover:underline uppercase tracking-wider cursor-pointer border-0"
                  >
                    Reset Default
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  {(["left", "center", "right"] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() => setProductPageHeaderAlignment(align)}
                      className={cn(
                        "py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all flex items-center justify-center gap-1.5",
                        productPageHeaderAlignment === align
                          ? "bg-[#FC7A00] text-white border-[#FC7A00] shadow-2xs"
                          : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                      )}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {align === "left" ? "format_align_left" : align === "center" ? "format_align_center" : "format_align_right"}
                      </span>
                      <span>{align}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Hide Card Payment & Enable Store Pickup Toggles */}
              <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                  <div>
                    <label className="text-xs font-extrabold uppercase text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">credit_card_off</span>
                      Store Card Payment Channel Toggle
                    </label>
                    <span className="text-[10px] text-gray-500 font-medium block mt-0.5">
                      ON/OFF switch to hide or show card payment checkout option on public storefront
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHideCardPayment(!hideCardPayment)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all",
                      hideCardPayment
                        ? "bg-red-500/10 text-red-500 border-red-500/30"
                        : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                    )}
                  >
                    {hideCardPayment ? "CARD HIDDEN" : "CARD VISIBLE"}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <label className="text-xs font-extrabold uppercase text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">storefront</span>
                      In-Store Pickup Option Toggle
                    </label>
                    <span className="text-[10px] text-gray-500 font-medium block mt-0.5">
                      ON/OFF switch to allow customers to choose In-Store Pickup during checkout
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnablePickup(!enablePickup)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all",
                      enablePickup
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                        : "bg-gray-200/50 text-gray-500 border-gray-300/40"
                    )}
                  >
                    {enablePickup ? "PICKUP ON" : "PICKUP OFF"}
                  </button>
                </div>
              </div>

              {/* Product Embedded Video ON/OFF Toggle */}
              <div className="p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-extrabold uppercase text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">smart_display</span>
                      Product Embedded Video Display
                    </label>
                    <span className="text-[10px] text-gray-500 font-medium block mt-0.5">
                      Enable or disable embedded video player cards (YouTube, TikTok, Vimeo, MP4) on public product pages
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEnableProductVideo(true)}
                      className="text-[9.5px] font-bold text-gray-400 hover:text-blue-600 uppercase tracking-wider cursor-pointer border-0"
                    >
                      Reset Default
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnableProductVideo(!enableProductVideo)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all",
                        enableProductVideo
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                          : "bg-red-500/10 text-red-500 border-red-500/30"
                      )}
                    >
                      {enableProductVideo ? "VIDEO ON" : "VIDEO OFF"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Product Sharing ON/OFF Toggle */}
              <div className="p-4 rounded-2xl border border-orange-500/20 bg-orange-500/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-extrabold uppercase text-[#FC7A00] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">share</span>
                      Product Sharing Toggle
                    </label>
                    <span className="text-[10px] text-gray-500 font-medium block mt-0.5">
                      Allow users to copy or share product links directly from product detail page
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEnableProductSharing(true)}
                      className="text-[9.5px] font-bold text-gray-400 hover:text-[#FC7A00] uppercase tracking-wider cursor-pointer border-0"
                    >
                      Reset Default
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnableProductSharing(!enableProductSharing)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer border transition-all",
                        enableProductSharing
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                          : "bg-red-500/10 text-red-500 border-red-500/30"
                      )}
                    >
                      {enableProductSharing ? "SHARING ON" : "SHARING OFF"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Top Bar Icons & Clear Cache Toggle Section */}
              <div className="p-4 rounded-2xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-200/30 pb-2">
                  <div>
                    <label className="text-xs font-extrabold uppercase text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">tab</span>
                      Store Top Bar Icons & Clear Cache Button
                    </label>
                    <span className="text-[10px] text-gray-400 block">Configure top bar icon colors and hide/show the Clear Cache button</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      promptResetConfirmation("Top Bar Icons & Cache Toggle", () => {
                        setHideClearCacheButton(false);
                        setTopBarIconColor("#374151");
                        setTopBarWishlistIconColor("#EF4444");
                        setTopBarHistoryIconColor("#FC7A00");
                        setTopBarCartIconColor("#1F2937");
                        toast.info("Reset Top Bar section to defaults.");
                      });
                    }}
                    className="text-[9.5px] font-bold text-[#FC7A00] hover:underline uppercase tracking-wider cursor-pointer border-0"
                  >
                    Reset Section Default
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-gray-950 border border-gray-200/60 dark:border-gray-800">
                  <div>
                    <span className="text-xs font-bold uppercase text-gray-800 dark:text-gray-200 block">Clear Cache Button Visibility</span>
                    <span className="text-[10px] text-gray-400 block">Hide or show the circular cache refresh icon button in store header</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHideClearCacheButton(!hideClearCacheButton)}
                    className={cn(
                      "px-3 py-1 rounded-xl text-xs font-black uppercase cursor-pointer border transition-all",
                      hideClearCacheButton
                        ? "bg-red-500/10 text-red-500 border-red-500/30"
                        : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                    )}
                  >
                    {hideClearCacheButton ? "HIDDEN" : "VISIBLE"}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Refresh Cache Icon</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={topBarIconColor}
                        onChange={(e) => setTopBarIconColor(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={topBarIconColor}
                        onChange={(e) => setTopBarIconColor(e.target.value)}
                        className={cn("h-8 px-2 rounded-lg text-xs font-mono border w-full", inputClass)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Wishlist Icon Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={topBarWishlistIconColor}
                        onChange={(e) => setTopBarWishlistIconColor(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={topBarWishlistIconColor}
                        onChange={(e) => setTopBarWishlistIconColor(e.target.value)}
                        className={cn("h-8 px-2 rounded-lg text-xs font-mono border w-full", inputClass)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Order History Icon Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={topBarHistoryIconColor}
                        onChange={(e) => setTopBarHistoryIconColor(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={topBarHistoryIconColor}
                        onChange={(e) => setTopBarHistoryIconColor(e.target.value)}
                        className={cn("h-8 px-2 rounded-lg text-xs font-mono border w-full", inputClass)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Cart Icon Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={topBarCartIconColor}
                        onChange={(e) => setTopBarCartIconColor(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={topBarCartIconColor}
                        onChange={(e) => setTopBarCartIconColor(e.target.value)}
                        className={cn("h-8 px-2 rounded-lg text-xs font-mono border w-full", inputClass)}
                      />
                    </div>
                  </div>
                </div>

                {/* Live Top Bar Icons Preview */}
                <div className="p-3 bg-white dark:bg-gray-950 rounded-xl border border-gray-200/60 dark:border-gray-800 space-y-1 text-center">
                  <span className="text-[9px] font-extrabold text-[#FC7A00] uppercase tracking-widest block">Live Header Top Bar Icons Preview</span>
                  <div className="flex items-center justify-center gap-3 pt-1">
                    {!hideClearCacheButton && (
                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[18px]" style={{ color: topBarIconColor }}>
                          cached
                        </span>
                      </div>
                    )}
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]" style={{ color: topBarWishlistIconColor }}>
                        favorite
                      </span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]" style={{ color: topBarHistoryIconColor }}>
                        history
                      </span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]" style={{ color: topBarCartIconColor }}>
                        shopping_bag
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Product Card Border Radius Slider */}
              <div className="p-4 rounded-2xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-extrabold uppercase text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">rounded_corner</span>
                    Product Card Border Radius ({cardBorderRadius}px)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => promptResetConfirmation("Card Border Radius", () => setCardBorderRadius(16))}
                      className="text-[9.5px] font-bold text-[#FC7A00] hover:underline uppercase tracking-wider cursor-pointer border-0"
                    >
                      Reset Default
                    </button>
                    <span className="font-mono text-xs font-black text-[#FC7A00]">{cardBorderRadius}px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="32"
                  step="1"
                  value={cardBorderRadius}
                  onChange={(e) => setCardBorderRadius(Number(e.target.value))}
                  className="w-full accent-[#FC7A00] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase">
                  <span>0px (Square)</span>
                  <span>16px (Medium)</span>
                  <span>32px (Fully Rounded)</span>
                </div>
              </div>

              {/* Product Card Border Width Slider */}
              <div className="p-4 rounded-2xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-extrabold uppercase text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">line_weight</span>
                    Product Card Border Width ({borderWidth}px)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => promptResetConfirmation("Card Border Width", () => setBorderWidth(1))}
                      className="text-[9.5px] font-bold text-[#FC7A00] hover:underline uppercase tracking-wider cursor-pointer border-0"
                    >
                      Reset Default
                    </button>
                    <span className="font-mono text-xs font-black text-[#FC7A00]">{borderWidth}px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="1"
                  value={borderWidth}
                  onChange={(e) => setBorderWidth(Number(e.target.value))}
                  className="w-full accent-[#FC7A00] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase">
                  <span>1px (Thin)</span>
                  <span>4px (Medium)</span>
                  <span>8px (Thick)</span>
                </div>
              </div>

              {/* Product Card Border Colors & Gradient Settings */}
              <div className="p-4 rounded-2xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-extrabold uppercase text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">border_style</span>
                      Card Border Styling & Gradient
                    </label>
                    <span className="text-[10px] text-gray-400 block">Show or completely remove border lines around products</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      promptResetConfirmation("Product Card Borders & Gradient", () => {
                        setHideBorders(false);
                        setEnableGradientBorder(false);
                        setBorderColor("#FC7A00");
                        setBorderOpacity(100);
                        setGradientColorStart("#FC7A00");
                        setGradientColorEnd("#0b513d");
                        toast.info("Reset Card Borders section to defaults.");
                      });
                    }}
                    className="text-[9.5px] font-bold text-[#FC7A00] hover:underline uppercase tracking-wider cursor-pointer border-0"
                  >
                    Reset Section Default
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Border Visibility</span>
                  <button
                    type="button"
                    onClick={() => setHideBorders(!hideBorders)}
                    className={cn(
                      "px-3 py-1 rounded-xl text-xs font-black uppercase cursor-pointer border transition-all",
                      hideBorders
                        ? "bg-red-500/10 text-red-500 border-red-500/30"
                        : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                    )}
                  >
                    {hideBorders ? "BORDER HIDDEN" : "BORDER VISIBLE"}
                  </button>
                </div>

                {!hideBorders && (
                  <div className="space-y-3 pt-2 border-t border-gray-200/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-[11px] font-bold uppercase text-gray-600 dark:text-gray-300">
                          Gradient Border Effect
                        </label>
                        <span className="text-[9.5px] text-gray-400 block">Apply 2-color gradient across product borders</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEnableGradientBorder(!enableGradientBorder)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer border transition-all",
                          enableGradientBorder
                            ? "bg-orange-500/10 text-[#FC7A00] border-orange-500/30"
                            : "bg-gray-200/50 text-gray-500 border-gray-300/40"
                        )}
                      >
                        {enableGradientBorder ? "GRADIENT ON" : "SOLID COLOR"}
                      </button>
                    </div>

                    {enableGradientBorder ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Start Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={gradientColorStart}
                              onChange={(e) => setGradientColorStart(e.target.value)}
                              className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                            />
                            <input
                              type="text"
                              value={gradientColorStart}
                              onChange={(e) => setGradientColorStart(e.target.value)}
                              className={cn("h-8 px-2 rounded-lg text-xs font-mono border w-full", inputClass)}
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">End Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={gradientColorEnd}
                              onChange={(e) => setGradientColorEnd(e.target.value)}
                              className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                            />
                            <input
                              type="text"
                              value={gradientColorEnd}
                              onChange={(e) => setGradientColorEnd(e.target.value)}
                              className={cn("h-8 px-2 rounded-lg text-xs font-mono border w-full", inputClass)}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Border Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={borderColor}
                              onChange={(e) => setBorderColor(e.target.value)}
                              className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                            />
                            <input
                              type="text"
                              value={borderColor}
                              onChange={(e) => setBorderColor(e.target.value)}
                              className={cn("h-8 px-2 rounded-lg text-xs font-mono border w-full", inputClass)}
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Opacity ({borderOpacity}%)</label>
                          <input
                            type="range"
                            min="10"
                            max="100"
                            step="5"
                            value={borderOpacity}
                            onChange={(e) => setBorderOpacity(Number(e.target.value))}
                            className="w-full accent-[#FC7A00] cursor-pointer mt-2"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Recently Viewed Product Border Styling */}
              <div className="p-4 rounded-2xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-extrabold uppercase text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">history</span>
                      Recently Viewed Cards Border
                    </label>
                    <span className="text-[10px] text-gray-400 block">Custom border styling for recently viewed products ribbon</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      promptResetConfirmation("Recently Viewed Border Styling", () => {
                        setRecentlyViewedBorderEnabled(true);
                        setRecentlyViewedBorderColor("#FC7A00");
                        setRecentlyViewedBorderOpacity(20);
                        toast.info("Reset Recently Viewed section to defaults.");
                      });
                    }}
                    className="text-[9.5px] font-bold text-[#FC7A00] hover:underline uppercase tracking-wider cursor-pointer border-0"
                  >
                    Reset Section Default
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Recently Viewed Border Toggle</span>
                  <button
                    type="button"
                    onClick={() => setRecentlyViewedBorderEnabled(!recentlyViewedBorderEnabled)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer border transition-all",
                      recentlyViewedBorderEnabled
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                        : "bg-gray-200/50 text-gray-500 border-gray-300/40"
                    )}
                  >
                    {recentlyViewedBorderEnabled ? "ENABLED" : "DISABLED"}
                  </button>
                </div>

                {recentlyViewedBorderEnabled && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Border Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={recentlyViewedBorderColor}
                          onChange={(e) => setRecentlyViewedBorderColor(e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                        />
                        <input
                          type="text"
                          value={recentlyViewedBorderColor}
                          onChange={(e) => setRecentlyViewedBorderColor(e.target.value)}
                          className={cn("h-8 px-2 rounded-lg text-xs font-mono border w-full", inputClass)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Opacity ({recentlyViewedBorderOpacity}%)</label>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        step="5"
                        value={recentlyViewedBorderOpacity}
                        onChange={(e) => setRecentlyViewedBorderOpacity(Number(e.target.value))}
                        className="w-full accent-[#FC7A00] cursor-pointer mt-2"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Search Bar Top Space Adjustment Slider */}
              <div className="p-4 rounded-2xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50 space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-extrabold uppercase text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">search</span>
                    Search Bar Top Space ({searchBarMarginTop}px)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => promptResetConfirmation("Search Bar Top Space", () => setSearchBarMarginTop(0))}
                      className="text-[9.5px] font-bold text-[#FC7A00] hover:underline uppercase tracking-wider cursor-pointer border-0"
                    >
                      Reset Default
                    </button>
                    <span className="font-mono text-xs font-black text-[#FC7A00]">{searchBarMarginTop}px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="2"
                  value={searchBarMarginTop}
                  onChange={(e) => setSearchBarMarginTop(Number(e.target.value))}
                  className="w-full accent-[#FC7A00] cursor-pointer"
                />
              </div>

              {/* Store Header Branding & Titles Section */}
              <div className="p-4 rounded-2xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-200/30 pb-2">
                  <div>
                    <label className="text-xs font-extrabold uppercase text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">badge</span>
                      Store Branding Titles & Text Colors
                    </label>
                    <span className="text-[10px] text-gray-400 block">Customize store main title, subtitle text, and custom font colors</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      promptResetConfirmation("Store Branding Titles", () => {
                        setStoreName("E-Tech Store");
                        setStoreSubtitle("Hardware & Premium Gear");
                        setStoreNameColor("#000000");
                        setStoreSubtitleColor("#9CA3AF");
                        toast.info("Reset Store Titles section to defaults.");
                      });
                    }}
                    className="text-[9.5px] font-bold text-[#FC7A00] hover:underline uppercase tracking-wider cursor-pointer border-0"
                  >
                    Reset Section Default
                  </button>
                </div>

                {/* Store Main Name / Brand Title */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Store Name / Brand Title</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      placeholder="e.g. E-Tech Store"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      className={cn("h-10 px-3 rounded-xl text-xs font-extrabold outline-none border transition-all flex-1", inputClass)}
                    />
                    <div className="flex items-center gap-1 flex-shrink-0" title="Store Title Text Color">
                      <input
                        type="color"
                        value={storeNameColor}
                        onChange={(e) => setStoreNameColor(e.target.value)}
                        className="w-9 h-9 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={storeNameColor}
                        onChange={(e) => setStoreNameColor(e.target.value)}
                        className={cn("h-9 px-2 rounded-lg text-xs font-mono border w-20", inputClass)}
                      />
                    </div>
                  </div>
                </div>

                {/* Store Subtitle / Under Text */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Store Subtitle / Under Text</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Hardware & Premium Gear"
                      value={storeSubtitle}
                      onChange={(e) => setStoreSubtitle(e.target.value)}
                      className={cn("h-10 px-3 rounded-xl text-xs font-bold outline-none border transition-all flex-1", inputClass)}
                    />
                    <div className="flex items-center gap-1 flex-shrink-0" title="Store Subtitle Text Color">
                      <input
                        type="color"
                        value={storeSubtitleColor}
                        onChange={(e) => setStoreSubtitleColor(e.target.value)}
                        className="w-9 h-9 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={storeSubtitleColor}
                        onChange={(e) => setStoreSubtitleColor(e.target.value)}
                        className={cn("h-9 px-2 rounded-lg text-xs font-mono border w-20", inputClass)}
                      />
                    </div>
                  </div>
                </div>

                {/* Live Header Text Preview Box */}
                <div className="p-3 bg-white dark:bg-gray-950 rounded-xl border border-gray-200/60 dark:border-gray-800 space-y-1 text-center">
                  <span className="text-[9px] font-extrabold text-gray-400 uppercase tracking-widest block">Live Header Title Preview</span>
                  <h2 className="font-hanken text-[16px] font-black tracking-tight leading-tight truncate" style={{ color: storeNameColor }}>
                    {storeName || "E-Tech Store"}
                  </h2>
                  <p className="font-hanken text-[10px] font-black uppercase tracking-widest truncate" style={{ color: storeSubtitleColor }}>
                    {storeSubtitle || "Hardware & Premium Gear"}
                  </p>
                </div>
              </div>

              {/* Store Icon Colors & Sizing Controls */}
              <div className="p-4 rounded-2xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-200/30 pb-2">
                  <div>
                    <label className="text-xs font-extrabold uppercase text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">palette</span>
                      Store Icon Color & Icon Resizing Controls
                    </label>
                    <span className="text-[10px] text-gray-400 block">Customize icon colors and resize icon scale across storefront cards and category chips</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      promptResetConfirmation("Store Icon Colors & Sizes", () => {
                        setStoreIconColor("#FC7A00");
                        setStoreIconSize(20);
                        toast.info("Reset Store Icons section to defaults.");
                      });
                    }}
                    className="text-[9.5px] font-bold text-[#FC7A00] hover:underline uppercase tracking-wider cursor-pointer border-0"
                  >
                    Reset Section Default
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Icon Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={storeIconColor}
                        onChange={(e) => setStoreIconColor(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={storeIconColor}
                        onChange={(e) => setStoreIconColor(e.target.value)}
                        className={cn("h-8 px-2 rounded-lg text-xs font-mono border w-full", inputClass)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-gray-400 uppercase">Icon Size ({storeIconSize}px)</label>
                      <span className="font-mono text-[10px] font-black text-[#FC7A00]">{storeIconSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="12"
                      max="36"
                      step="1"
                      value={storeIconSize}
                      onChange={(e) => setStoreIconSize(Number(e.target.value))}
                      className="w-full accent-[#FC7A00] cursor-pointer mt-2"
                    />
                  </div>
                </div>

                {/* Live Icon Color & Size Preview Box */}
                <div className="p-3 bg-white dark:bg-gray-950 rounded-xl border border-gray-200/60 dark:border-gray-800 flex items-center justify-around">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-gray-400 uppercase">Category Icon</span>
                    <span className="material-symbols-outlined" style={{ color: storeIconColor, fontSize: `${storeIconSize}px` }}>
                      category
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-gray-400 uppercase">Cart Icon</span>
                    <span className="material-symbols-outlined" style={{ color: storeIconColor, fontSize: `${storeIconSize}px` }}>
                      add_shopping_cart
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-gray-400 uppercase">History Icon</span>
                    <span className="material-symbols-outlined" style={{ color: storeIconColor, fontSize: `${storeIconSize}px` }}>
                      history
                    </span>
                  </div>
                </div>
              </div>

              {/* Store Button Colors & Icon Customization Section */}
              <div className="p-4 rounded-2xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-200/30 pb-2">
                  <div>
                    <label className="text-xs font-extrabold uppercase text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px]">smart_button</span>
                      Store Action Button Customization
                    </label>
                    <span className="text-[10px] text-gray-400 block">Configure background color, text color, and icon for primary Buy Now action buttons</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      promptResetConfirmation("Store Action Button Customization", () => {
                        setStoreButtonColor("#FC7A00");
                        setStoreButtonTextColor("#FFFFFF");
                        setStoreButtonIcon("bolt");
                        toast.info("Reset Action Button section to defaults.");
                      });
                    }}
                    className="text-[9.5px] font-bold text-[#FC7A00] hover:underline uppercase tracking-wider cursor-pointer border-0"
                  >
                    Reset Section Default
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Button Background Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={storeButtonColor}
                        onChange={(e) => setStoreButtonColor(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={storeButtonColor}
                        onChange={(e) => setStoreButtonColor(e.target.value)}
                        className={cn("h-8 px-2 rounded-lg text-xs font-mono border w-full", inputClass)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Button Text Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={storeButtonTextColor}
                        onChange={(e) => setStoreButtonTextColor(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={storeButtonTextColor}
                        onChange={(e) => setStoreButtonTextColor(e.target.value)}
                        className={cn("h-8 px-2 rounded-lg text-xs font-mono border w-full", inputClass)}
                      />
                    </div>
                  </div>
                </div>

                {/* Button Icon Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block">Button Icon Selection</label>
                  <div className="flex gap-2">
                    {["bolt", "shopping_cart_checkout", "local_shipping", "verified", "arrow_forward", "shopping_bag"].map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setStoreButtonIcon(icon)}
                        className={cn(
                          "w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer",
                          storeButtonIcon === icon
                            ? "border-[#FC7A00] bg-[#FC7A00]/10 text-[#FC7A00]"
                            : "border-gray-200 dark:border-gray-800 text-gray-500 hover:text-gray-900"
                        )}
                      >
                        <span className="material-symbols-outlined text-[18px]">{icon}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Button Preview Box */}
                <div className="p-3 bg-white dark:bg-gray-950 rounded-xl border border-gray-200/60 dark:border-gray-800 space-y-1">
                  <span className="text-[9px] font-extrabold text-[#FC7A00] uppercase tracking-widest block text-center">Live Button Preview</span>
                  <div
                    className="py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-all"
                    style={{ backgroundColor: storeButtonColor, color: storeButtonTextColor }}
                  >
                    <span className="material-symbols-outlined text-[16px]">{storeButtonIcon}</span>
                    <span>Buy Now</span>
                  </div>
                </div>
              </div>

              {/* Store Logo Upload & Preview */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Store Header Logo</label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl border border-gray-200/80 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                    {storeLogoUrl ? (
                      <img src={storeLogoUrl} alt="Store Logo" className="w-full h-full object-contain p-1" />
                    ) : (
                      <span className="material-symbols-outlined text-gray-400 text-[22px]">storefront</span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Paste logo URL (https://...)"
                    value={storeLogoUrl}
                    onChange={(e) => setStoreLogoUrl(e.target.value)}
                    className={cn("flex-1 h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all truncate", inputClass)}
                  />
                  <div className="relative flex-shrink-0">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          uploadImageToImgBB(file, setStoreLogoUrl, setIsUploadingStoreLogo);
                        }
                      }}
                      disabled={isUploadingStoreLogo}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                    />
                    <button
                      type="button"
                      disabled={isUploadingStoreLogo}
                      className={cn("w-10 h-10 border rounded-xl flex items-center justify-center transition-all cursor-pointer", isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-100 border-gray-200 text-gray-700")}
                    >
                      {isUploadingStoreLogo ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">upload</span>}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingSettings}
                className="w-full h-11 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                {isSavingSettings ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">save</span>}
                <span>Save Store Settings</span>
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* Confirmation Modal Overlay for Reset to Default */}
      {resetConfirmModal.isOpen && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className={cn("w-[92vw] sm:w-full max-w-sm p-6 rounded-3xl border text-center shadow-2xl space-y-4", panelClass)}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto bg-amber-50 text-amber-500 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900/50">
              <span className="material-symbols-outlined text-[24px]">restart_alt</span>
            </div>

            <div>
              <h4 className="font-extrabold text-sm uppercase text-gray-900 dark:text-white">Reset Section to Default?</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium leading-relaxed">
                Are you sure you want to reset <strong className="text-[#FC7A00]">{resetConfirmModal.sectionName}</strong> to default settings? Any unsaved edits in this section will be replaced.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setResetConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl text-xs font-black uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setResetConfirmModal((prev) => ({ ...prev, isOpen: false }));
                  resetConfirmModal.onConfirm();
                }}
                className="py-2.5 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-black uppercase cursor-pointer shadow-sm"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CpanelStoreSettingsPage() {
  return (
    <CpanelRouteGuard requiredPermission="store.manage">
      <CpanelStoreSettingsPageContent />
    </CpanelRouteGuard>
  );
}