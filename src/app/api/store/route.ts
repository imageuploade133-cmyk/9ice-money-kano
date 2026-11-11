import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { DEFAULT_STORE_CATEGORIES } from "@/lib/store-defaults";

export async function GET() {
  try {
    const docSnap = await adminDb.collection("config").doc("store_data").get();
    const data = docSnap.exists ? docSnap.data() || {} : {};

    const categories = Array.isArray(data.categories) && data.categories.length > 0
      ? data.categories
      : DEFAULT_STORE_CATEGORIES;

    const rawItems = Array.isArray(data.items) ? data.items : [];
    const visibleItems = rawItems.filter((i: any) => !i.isHidden);

    const defaultSettings = {
      storeName: "E-Tech Store",
      storeSubtitle: "Hardware & Premium Gear",
      storeNameColor: "#000000",
      storeSubtitleColor: "#9CA3AF",
      storeLogoUrl: "",
      storeIconColor: "#FC7A00",
      storeIconSize: 20,
      storeButtonColor: "#FC7A00",
      storeButtonTextColor: "#FFFFFF",
      storeButtonIcon: "bolt",
      hideClearCacheButton: false,
      topBarIconColor: "#374151",
      topBarWishlistIconColor: "#EF4444",
      topBarHistoryIconColor: "#FC7A00",
      topBarCartIconColor: "#1F2937",
      enableProductSharing: true,
      borderColor: "#FC7A00",
      borderOpacity: 100,
      cardBorderRadius: 16,
      borderWidth: 1,
      hideBorders: false,
      enableGradientBorder: false,
      gradientColorStart: "#FC7A00",
      gradientColorEnd: "#0b513d",
      recentlyViewedBorderEnabled: true,
      recentlyViewedBorderColor: "#FC7A00",
      recentlyViewedBorderOpacity: 20,
      productPageHeaderAlignment: "left" as const,
      enableProductVideo: true,
    };

    const storeSlides = Array.isArray(data.slides) ? [...data.slides] : [];
    storeSlides.sort((a: any, b: any) => {
      const posA = typeof a.position === "number" ? a.position : 9999;
      const posB = typeof b.position === "number" ? b.position : 9999;
      if (posA !== posB) return posA - posB;
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    return NextResponse.json({
      success: true,
      items: visibleItems,
      slides: storeSlides,
      categories,
      settings: data.settings ? { ...defaultSettings, ...data.settings } : defaultSettings,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Store GET Error]:", error.message);

    return NextResponse.json({
      success: true,
      items: [],
      slides: [],
      categories: DEFAULT_STORE_CATEGORIES,
      settings: { storeName: "E-Tech Store", storeLogoUrl: "", borderColor: "#FC7A00", hideBorders: false },
    });
  }
}
