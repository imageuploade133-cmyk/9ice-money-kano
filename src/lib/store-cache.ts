export interface StoreItem {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  images?: string[];
  coverImageUrl?: string;
  videoUrl?: string;
  autoSlide?: boolean;
  inStock: boolean;
  stockQuantity?: number;
  unlimitedStock?: boolean;
  specs?: string[];
  features?: string[];
  rating?: number;
  soldCount?: number;
  originalPrice?: number;
  costPrice?: number | null;
  discountPrice?: number | null;
  promoPrice?: number;
  discountBadge?: string;
}

export interface StoreSlide {
  id: string;
  imageUrl: string;
  title: string;
  subtitle: string;
  link: string;
  customWidth?: number | null;
  customHeight?: number | null;
  mobileHeight?: number | null;
  desktopHeight?: number | null;
  marginBottom?: number | null;
  isCrop?: boolean;
  isHidden?: boolean;
  createdAt?: string;
}

export interface StoreCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  backupUrl?: string;
  iconName?: string;
  isHidden?: boolean;
  sortOrder?: number;
}

export interface StoreSettings {
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
  borderWidth?: number;
  cardBorderRadius?: number;
  hideBorders?: boolean;
  enableGradientBorder?: boolean;
  gradientColorStart?: string;
  gradientColorEnd?: string;
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
  productPageHeaderAlignment?: "left" | "center" | "right";
  enableProductVideo?: boolean;
  hideCardPayment?: boolean;
  enablePickup?: boolean;
  productCardImageMode?: "cover" | "contain";
}

export interface CartItem {
  product: StoreItem;
  quantity: number;
}

const CACHE_KEY = "e_tech_store_cache";
const CART_KEY = "e_tech_store_cart";
const WISHLIST_KEY = "e_tech_store_wishlist";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache TTL for low Firestore reads

let memoryStoreCache: { items: StoreItem[]; slides: StoreSlide[]; categories: StoreCategory[]; settings: StoreSettings; timestamp: number } | null = null;
const memoryProductDetails = new Map<string, StoreItem>();

export const getCachedStore = (): { items: StoreItem[]; slides: StoreSlide[]; categories: StoreCategory[]; settings: StoreSettings } | null => {
  if (memoryStoreCache && (Date.now() - memoryStoreCache.timestamp < CACHE_TTL_MS)) {
    return { items: memoryStoreCache.items, slides: memoryStoreCache.slides, categories: memoryStoreCache.categories, settings: memoryStoreCache.settings };
  }

  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (Date.now() - parsed.timestamp < CACHE_TTL_MS)) {
          memoryStoreCache = parsed;
          return { items: parsed.items, slides: parsed.slides, categories: parsed.categories || [], settings: parsed.settings || {} };
        }
      }
    } catch {
      // Ignore cache parse errors
    }
  }

  return null;
};

export const setCachedStore = (items: StoreItem[], slides: StoreSlide[], categories: StoreCategory[] = [], settings: StoreSettings = {}) => {
  const cacheData = { items, slides, categories, settings, timestamp: Date.now() };
  memoryStoreCache = cacheData;

  items.forEach((item) => {
    memoryProductDetails.set(item.id, item);
  });

  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch {
      // Ignore storage write errors
    }
  }
};

export const clearStoreCache = () => {
  memoryStoreCache = null;
  memoryProductDetails.clear();
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch {
      // Ignore storage removal errors
    }
  }
};

export const cacheProductDetail = (item: StoreItem) => {
  if (item && item.id) {
    memoryProductDetails.set(item.id, item);
  }
};

export const getCachedProductDetail = (id: string): StoreItem | null => {
  // Validate memory cache freshness against TTL
  if (memoryStoreCache && (Date.now() - memoryStoreCache.timestamp < CACHE_TTL_MS)) {
    if (memoryProductDetails.has(id)) {
      return memoryProductDetails.get(id) || null;
    }
  }

  const cachedStore = getCachedStore();
  if (cachedStore) {
    const found = cachedStore.items.find((item) => item.id === id);
    if (found) {
      memoryProductDetails.set(id, found);
      return found;
    }
  }

  // Clear expired detail memory if TTL exceeded
  memoryProductDetails.delete(id);
  return null;
};

export const getSavedCart = (): CartItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveCart = (cart: CartItem[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    // Ignore storage errors
  }
};

export const getSavedWishlist = (): StoreItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WISHLIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveWishlist = (wishlist: StoreItem[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
  } catch {
    // Ignore storage errors
  }
};

export const isInWishlist = (productId: string): boolean => {
  const list = getSavedWishlist();
  return list.some((item) => item.id === productId);
};

export const toggleWishlist = (product: StoreItem): boolean => {
  const list = getSavedWishlist();
  const exists = list.some((item) => item.id === product.id);
  let updated: StoreItem[];
  if (exists) {
    updated = list.filter((item) => item.id !== product.id);
  } else {
    updated = [product, ...list];
  }
  saveWishlist(updated);
  return !exists;
};
