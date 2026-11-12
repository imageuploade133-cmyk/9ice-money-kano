import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

const DEFAULT_SETTINGS = {
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
  orderStatuses: ["Pending", "Processing", "Shipped", "Delivered", "Refunded", "Canceled"],
  searchBarMarginTop: 0,
  bannerOverlayFadeEnabled: true,
  bannerSlideIntervalSeconds: 5,
  bannerBorderEnabled: false,
  bannerBorderColor: "#FC7A00",
  bannerBackgroundColor: "#111827",
  bannerImageMode: "cover" as const,
  bannerSlideEffect: "fade" as const,
  bannerImagePosition: "center",
  bannerShowIndicators: true,
  bannerMarginBottom: 20,
  bannerHeightMobile: 176,
  bannerHeightDesktop: 220,
  productPageHeaderAlignment: "left" as const,
  enableProductVideo: true,
  hideCardPayment: false,
  enablePickup: false,
  productCardImageMode: "cover" as const,
};

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "store.view");
    if (!perm.authorized) {
      return perm.response!;
    }

    const docSnap = await adminDb.collection("config").doc("store_data").get();
    const data = docSnap.exists ? docSnap.data() || {} : {};

    return NextResponse.json({
      success: true,
      items: data.items || [],
      slides: data.slides || [],
      categories: data.categories || [],
      settings: data.settings ? { ...DEFAULT_SETTINGS, ...data.settings } : DEFAULT_SETTINGS,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Store GET Error]:", error.message);
    return NextResponse.json({ error: "Failed to fetch store data", details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "store.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const { action, item, slide, itemId, slideId, settings } = body;

    const docRef = adminDb.collection("config").doc("store_data");
    const docSnap = await docRef.get();
    const existingData = docSnap.exists ? docSnap.data() || {} : {};

    let items = Array.isArray(existingData.items) ? [...existingData.items] : [];
    let slides = Array.isArray(existingData.slides) ? [...existingData.slides] : [];
    let currentSettings = existingData.settings
      ? { ...DEFAULT_SETTINGS, ...existingData.settings }
      : { ...DEFAULT_SETTINGS };

    const now = new Date().toISOString();

    if (action === "add_item" || action === "edit_item") {
      if (!item || !item.title) {
        return NextResponse.json({ error: "Item title is required." }, { status: 400 });
      }

      const imagesArray: string[] = Array.isArray(item.images)
        ? item.images.map((img: string) => String(img).trim()).filter(Boolean)
        : (item.imageUrl ? [String(item.imageUrl).trim()] : []);

      const primaryImg = item.coverImageUrl
        ? String(item.coverImageUrl).trim()
        : (imagesArray[0] || (item.imageUrl ? String(item.imageUrl).trim() : ""));

      if (action === "edit_item" && item.id) {
        items = items.map((i: any) => {
          if (i.id === item.id) {
            return {
              ...i,
              title: item.title.trim(),
              description: (item.description || "").trim(),
              costPrice: typeof item.costPrice === "number" ? item.costPrice : (item.costPrice ? Number(item.costPrice) : null),
              price: Number(item.price) || 0,
              discountPrice: typeof item.discountPrice === "number" ? item.discountPrice : (item.discountPrice ? Number(item.discountPrice) : null),
              category: (item.category || "General").trim(),
              imageUrl: primaryImg,
              images: imagesArray,
              coverImageUrl: primaryImg,
              videoUrl: (item.videoUrl || "").trim(),
              autoSlide: Boolean(item.autoSlide),
              inStock: item.inStock !== false,
              stockQuantity: typeof item.stockQuantity === "number" ? item.stockQuantity : (item.stockQuantity ? Number(item.stockQuantity) : null),
              unlimitedStock: Boolean(item.unlimitedStock),
              isHidden: Boolean(item.isHidden),
              updatedAt: now,
            };
          }
          return i;
        });
      } else {
        const newItem = {
          id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          title: item.title.trim(),
          description: (item.description || "").trim(),
          costPrice: typeof item.costPrice === "number" ? item.costPrice : (item.costPrice ? Number(item.costPrice) : null),
          price: Number(item.price) || 0,
          discountPrice: typeof item.discountPrice === "number" ? item.discountPrice : (item.discountPrice ? Number(item.discountPrice) : null),
          category: (item.category || "General").trim(),
          imageUrl: primaryImg,
          images: imagesArray,
          coverImageUrl: primaryImg,
          videoUrl: (item.videoUrl || "").trim(),
          autoSlide: Boolean(item.autoSlide),
          inStock: item.inStock !== false,
          stockQuantity: typeof item.stockQuantity === "number" ? item.stockQuantity : (item.stockQuantity ? Number(item.stockQuantity) : null),
          unlimitedStock: Boolean(item.unlimitedStock),
          isHidden: Boolean(item.isHidden),
          createdAt: now,
          updatedAt: now,
        };
        items.unshift(newItem);
      }
    } else if (action === "toggle_item_visibility") {
      if (!itemId) {
        return NextResponse.json({ error: "itemId is required to toggle visibility." }, { status: 400 });
      }
      items = items.map((i: any) => {
        if (i.id === itemId) {
          return {
            ...i,
            isHidden: !i.isHidden,
            updatedAt: now,
          };
        }
        return i;
      });
    } else if (action === "delete_item") {
      if (!itemId) {
        return NextResponse.json({ error: "itemId is required for deletion." }, { status: 400 });
      }
      items = items.filter((i: any) => i.id !== itemId);
    } else if (action === "add_slide" || action === "edit_slide") {
      if (!slide || !slide.imageUrl) {
        return NextResponse.json({ error: "Slide image URL is required." }, { status: 400 });
      }

      const slidePosition = typeof slide.position === "number" ? Math.max(1, slide.position) : (typeof slide.position === "string" && !isNaN(parseInt(slide.position)) ? Math.max(1, parseInt(slide.position)) : 1);

      if (action === "edit_slide" && slide.id) {
        slides = slides.map((s: any) => {
          if (s.id === slide.id) {
            return {
              ...s,
              imageUrl: slide.imageUrl.trim(),
              title: (slide.title || "").trim(),
              subtitle: (slide.subtitle || "").trim(),
              description: (slide.description || slide.subtitle || "").trim(),
              link: (slide.link || "").trim(),
              position: slidePosition,
              customWidth: typeof slide.customWidth === "number" ? slide.customWidth : (slide.customWidth ? Number(slide.customWidth) : null),
              customHeight: typeof slide.customHeight === "number" ? slide.customHeight : (slide.customHeight ? Number(slide.customHeight) : null),
              mobileHeight: typeof slide.mobileHeight === "number" ? slide.mobileHeight : (slide.mobileHeight ? Number(slide.mobileHeight) : 176),
              desktopHeight: typeof slide.desktopHeight === "number" ? slide.desktopHeight : (slide.desktopHeight ? Number(slide.desktopHeight) : 220),
              marginBottom: typeof slide.marginBottom === "number" ? slide.marginBottom : (slide.marginBottom ? Number(slide.marginBottom) : 20),
              isCrop: slide.isCrop !== undefined ? Boolean(slide.isCrop) : true,
              isHidden: Boolean(slide.isHidden),
              updatedAt: now,
            };
          }
          return s;
        });
      } else {
        const newSlide = {
          id: `slide_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          imageUrl: slide.imageUrl.trim(),
          title: (slide.title || "").trim(),
          subtitle: (slide.subtitle || "").trim(),
          description: (slide.description || slide.subtitle || "").trim(),
          link: (slide.link || "").trim(),
          position: slidePosition,
          customWidth: typeof slide.customWidth === "number" ? slide.customWidth : (slide.customWidth ? Number(slide.customWidth) : null),
          customHeight: typeof slide.customHeight === "number" ? slide.customHeight : (slide.customHeight ? Number(slide.customHeight) : null),
          mobileHeight: typeof slide.mobileHeight === "number" ? slide.mobileHeight : (slide.mobileHeight ? Number(slide.mobileHeight) : 176),
          desktopHeight: typeof slide.desktopHeight === "number" ? slide.desktopHeight : (slide.desktopHeight ? Number(slide.desktopHeight) : 220),
          marginBottom: typeof slide.marginBottom === "number" ? slide.marginBottom : (slide.marginBottom ? Number(slide.marginBottom) : 20),
          isCrop: slide.isCrop !== undefined ? Boolean(slide.isCrop) : true,
          isHidden: Boolean(slide.isHidden),
          createdAt: now,
          updatedAt: now,
        };
        slides.unshift(newSlide);
      }

      // Sort slides by position ascending
      slides.sort((a: any, b: any) => {
        const posA = typeof a.position === "number" ? a.position : 9999;
        const posB = typeof b.position === "number" ? b.position : 9999;
        if (posA !== posB) return posA - posB;
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
    } else if (action === "delete_slide") {
      if (!slideId) {
        return NextResponse.json({ error: "slideId is required for deletion." }, { status: 400 });
      }
      slides = slides.filter((s: any) => s.id !== slideId);
    } else if (action === "update_settings") {
      if (!settings) {
        return NextResponse.json({ error: "settings payload is required." }, { status: 400 });
      }

      currentSettings = {
        storeName: settings.storeName !== undefined ? String(settings.storeName).trim() : currentSettings.storeName,
        storeSubtitle: settings.storeSubtitle !== undefined ? String(settings.storeSubtitle).trim() : currentSettings.storeSubtitle,
        storeNameColor: settings.storeNameColor !== undefined ? String(settings.storeNameColor).trim() : currentSettings.storeNameColor,
        storeSubtitleColor: settings.storeSubtitleColor !== undefined ? String(settings.storeSubtitleColor).trim() : currentSettings.storeSubtitleColor,
        storeLogoUrl: settings.storeLogoUrl !== undefined ? String(settings.storeLogoUrl).trim() : currentSettings.storeLogoUrl,
        storeIconColor: settings.storeIconColor ? String(settings.storeIconColor).trim() : currentSettings.storeIconColor,
        storeIconSize: typeof settings.storeIconSize === "number" ? settings.storeIconSize : currentSettings.storeIconSize,
        storeButtonColor: settings.storeButtonColor ? String(settings.storeButtonColor).trim() : currentSettings.storeButtonColor,
        storeButtonTextColor: settings.storeButtonTextColor ? String(settings.storeButtonTextColor).trim() : currentSettings.storeButtonTextColor,
        storeButtonIcon: settings.storeButtonIcon ? String(settings.storeButtonIcon).trim() : currentSettings.storeButtonIcon,
        hideClearCacheButton: settings.hideClearCacheButton !== undefined ? Boolean(settings.hideClearCacheButton) : currentSettings.hideClearCacheButton,
        topBarIconColor: settings.topBarIconColor ? String(settings.topBarIconColor).trim() : currentSettings.topBarIconColor,
        topBarWishlistIconColor: settings.topBarWishlistIconColor ? String(settings.topBarWishlistIconColor).trim() : currentSettings.topBarWishlistIconColor,
        topBarHistoryIconColor: settings.topBarHistoryIconColor ? String(settings.topBarHistoryIconColor).trim() : currentSettings.topBarHistoryIconColor,
        topBarCartIconColor: settings.topBarCartIconColor ? String(settings.topBarCartIconColor).trim() : currentSettings.topBarCartIconColor,
        enableProductSharing: settings.enableProductSharing !== undefined ? Boolean(settings.enableProductSharing) : currentSettings.enableProductSharing,
        borderColor: (settings.borderColor || currentSettings.borderColor).trim(),
        borderOpacity: typeof settings.borderOpacity === "number" ? settings.borderOpacity : currentSettings.borderOpacity,
        cardBorderRadius: typeof settings.cardBorderRadius === "number" ? settings.cardBorderRadius : currentSettings.cardBorderRadius,
        borderWidth: typeof settings.borderWidth === "number" ? settings.borderWidth : currentSettings.borderWidth,
        hideBorders: settings.hideBorders !== undefined ? Boolean(settings.hideBorders) : currentSettings.hideBorders,
        enableGradientBorder: settings.enableGradientBorder !== undefined ? Boolean(settings.enableGradientBorder) : currentSettings.enableGradientBorder,
        gradientColorStart: settings.gradientColorStart ? String(settings.gradientColorStart).trim() : currentSettings.gradientColorStart,
        gradientColorEnd: settings.gradientColorEnd ? String(settings.gradientColorEnd).trim() : currentSettings.gradientColorEnd,
        recentlyViewedBorderEnabled: settings.recentlyViewedBorderEnabled !== undefined ? Boolean(settings.recentlyViewedBorderEnabled) : currentSettings.recentlyViewedBorderEnabled,
        recentlyViewedBorderColor: settings.recentlyViewedBorderColor ? String(settings.recentlyViewedBorderColor).trim() : currentSettings.recentlyViewedBorderColor,
        recentlyViewedBorderOpacity: typeof settings.recentlyViewedBorderOpacity === "number" ? settings.recentlyViewedBorderOpacity : currentSettings.recentlyViewedBorderOpacity,
        orderStatuses: Array.isArray(settings.orderStatuses) && settings.orderStatuses.length > 0
          ? settings.orderStatuses.map((s: string) => s.trim()).filter(Boolean)
          : currentSettings.orderStatuses,
        searchBarMarginTop: typeof settings.searchBarMarginTop === "number" ? settings.searchBarMarginTop : currentSettings.searchBarMarginTop,
        bannerOverlayFadeEnabled: settings.bannerOverlayFadeEnabled !== undefined ? Boolean(settings.bannerOverlayFadeEnabled) : currentSettings.bannerOverlayFadeEnabled,
        bannerSlideIntervalSeconds: typeof settings.bannerSlideIntervalSeconds === "number" ? settings.bannerSlideIntervalSeconds : currentSettings.bannerSlideIntervalSeconds,
        bannerBorderEnabled: settings.bannerBorderEnabled !== undefined ? Boolean(settings.bannerBorderEnabled) : currentSettings.bannerBorderEnabled,
        bannerBorderColor: settings.bannerBorderColor ? String(settings.bannerBorderColor).trim() : currentSettings.bannerBorderColor,
        bannerBackgroundColor: settings.bannerBackgroundColor ? String(settings.bannerBackgroundColor).trim() : currentSettings.bannerBackgroundColor,
        bannerImageMode: settings.bannerImageMode === "contain" ? "contain" : "cover",
        bannerSlideEffect: settings.bannerSlideEffect === "slide" ? "slide" : "fade",
        bannerImagePosition: settings.bannerImagePosition ? String(settings.bannerImagePosition).trim() : currentSettings.bannerImagePosition,
        bannerShowIndicators: settings.bannerShowIndicators !== undefined ? Boolean(settings.bannerShowIndicators) : currentSettings.bannerShowIndicators,
        bannerMarginBottom: typeof settings.bannerMarginBottom === "number" ? settings.bannerMarginBottom : currentSettings.bannerMarginBottom,
        bannerHeightMobile: typeof settings.bannerHeightMobile === "number" ? settings.bannerHeightMobile : currentSettings.bannerHeightMobile,
        bannerHeightDesktop: typeof settings.bannerHeightDesktop === "number" ? settings.bannerHeightDesktop : currentSettings.bannerHeightDesktop,
        productPageHeaderAlignment: settings.productPageHeaderAlignment === "center" ? "center" : settings.productPageHeaderAlignment === "right" ? "right" : "left",
        enableProductVideo: settings.enableProductVideo !== undefined ? Boolean(settings.enableProductVideo) : currentSettings.enableProductVideo,
        hideCardPayment: settings.hideCardPayment !== undefined ? Boolean(settings.hideCardPayment) : currentSettings.hideCardPayment,
        enablePickup: settings.enablePickup !== undefined ? Boolean(settings.enablePickup) : currentSettings.enablePickup,
        productCardImageMode: settings.productCardImageMode === "contain" ? "contain" : "cover",
      };
    } else {
      return NextResponse.json({ error: "Invalid action specified." }, { status: 400 });
    }

    await docRef.set(
      {
        items,
        slides,
        settings: currentSettings,
        updatedAt: now,
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      message: "Store data updated successfully!",
      items,
      slides,
      settings: currentSettings,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Store POST Error]:", error.message);
    return NextResponse.json({ error: "Failed to update store data", details: error.message }, { status: 500 });
  }
}
