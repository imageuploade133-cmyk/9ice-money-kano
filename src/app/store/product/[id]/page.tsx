"use client";

import { triggerHaptic } from "@/lib/haptics";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { RouteGuard } from "@/components/RouteGuard";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import Image from "next/image";
import {
  StoreItem,
  StoreSettings,
  CartItem,
  getCachedStore,
  getCachedProductDetail,
  getSavedCart,
  saveCart,
  getSavedWishlist,
  isInWishlist,
  toggleWishlist,
} from "@/lib/store-cache";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { useAppConfig } from "@/lib/ConfigContext";
import { isFeatureEnabled, getFeatureDisabledMessage } from "@/lib/feature-toggle";
import { FeatureDisabledBanner } from "@/components/FeatureDisabledBanner";
import { InvestmentPinModal } from "@/components/investment/InvestmentPinModal";

interface ProductReview {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  adminReply?: {
    message: string;
    repliedAt: string;
  } | null;
  createdAt: string;
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const productId = resolvedParams.id;

  const router = useRouter();
  const { userData, user } = useAuth();
  const { config } = useAppConfig();
  const isStoreEnabled = isFeatureEnabled(config?.featureToggles, "store");
  const userName = (userData?.name || user?.displayName || "Verified Customer") as string;

  const [product, setProduct] = useState<StoreItem | null>(() => getCachedProductDetail(productId));
  const [allItems, setAllItems] = useState<StoreItem[]>(() => {
    const cached = getCachedStore();
    return cached ? cached.items : [];
  });
  const [settings, setSettings] = useState<StoreSettings>(() => {
    const cached = getCachedStore();
    return cached ? cached.settings : {};
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => !getCachedProductDetail(productId));

  // Reviews state
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [isLoadingReviews, setIsLoadingLoadingReviews] = useState(true);
  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Gallery slider & Full-Screen Image Viewer state
  const [selectedGalleryIndex, setSelectedGalleryIndex] = useState(0);
  const [productQuantity, setProductQuantity] = useState(1);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useModalBackHandler(isImageViewerOpen, () => setIsImageViewerOpen(false), "product-image-viewer-modal");

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 35 && gallery.length > 1) {
      if (diff > 0) {
        setSelectedGalleryIndex((prev) => (prev + 1) % gallery.length);
      } else {
        setSelectedGalleryIndex((prev) => (prev - 1 + gallery.length) % gallery.length);
      }
    }
    setTouchStartX(null);
  };

  // User state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Checkout & Delivery Profile state
  const [isCheckoutStep, setIsCheckoutStep] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"WALLET_NGN" | "CARD_CHECKOUT">("WALLET_NGN");
  const [customerDeliveryName, setCustomerDeliveryName] = useState<string>(String(userName || ""));
  const [customerDeliveryPhone, setCustomerDeliveryPhone] = useState<string>(String(userData?.phoneNumber || ""));
  const [customerDeliveryAddress, setCustomerDeliveryAddress] = useState<string>("");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isStorePinModalOpen, setIsStorePinModalOpen] = useState<boolean>(false);
  const [confirmedOrder, setConfirmedOrder] = useState<any>(null);

  // Lock body scroll & mobile hardware back button handling across modals
  useModalBackHandler(isCartOpen, () => setIsCartOpen(false), "product-cart-modal");
  useModalBackHandler(Boolean(confirmedOrder), () => setConfirmedOrder(null), "product-confirmed-modal");

  // Load saved cart and wishlist on mount
  useEffect(() => {
    setCart(getSavedCart());
    if (productId) {
      setIsWishlisted(isInWishlist(productId));
    }
  }, [productId]);

  // Track product view in recently viewed list (up to 50 items max)
  const trackRecentlyViewed = (item: StoreItem) => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("e_tech_recently_viewed");
      let list: StoreItem[] = [];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      }
      const filtered = list.filter((p) => p.id !== item.id);
      const updated = [item, ...filtered].slice(0, 50);
      localStorage.setItem("e_tech_recently_viewed", JSON.stringify(updated));
    } catch {
      // Ignore errors
    }
  };

  // Fetch product & reviews data
  useEffect(() => {
    let isMounted = true;

    async function loadProductData() {
      const cachedProduct = getCachedProductDetail(productId);
      const cachedStore = getCachedStore();

      if (cachedStore && isMounted) {
        setAllItems(cachedStore.items);
        setSettings(cachedStore.settings);
      }

      if (cachedProduct && isMounted) {
        setProduct(cachedProduct);
        trackRecentlyViewed(cachedProduct);
        setIsLoading(false);
      } else {
        setIsLoading(true);
        try {
          const res = await fetch("/api/store");
          const data = await res.json();
          if (data.success && isMounted) {
            const items: StoreItem[] = data.items || [];
            setAllItems(items);
            setSettings(data.settings || {});

            const target = items.find((i) => i.id === productId);
            if (target) {
              setProduct(target);
              trackRecentlyViewed(target);
            }
          }
        } catch (err) {
          console.error("Failed to load product detail:", err);
        } finally {
          if (isMounted) setIsLoading(false);
        }
      }

      // Fetch public reviews
      try {
        const revRes = await fetch(`/api/store/reviews?productId=${productId}`);
        const revData = await revRes.json();
        if (revData.success && isMounted) {
          setReviews(revData.reviews || []);
        }
      } catch (err) {
        console.warn("Failed to fetch product reviews:", err);
      } finally {
        if (isMounted) setIsLoadingLoadingReviews(false);
      }
    }

    loadProductData();

    return () => {
      isMounted = false;
    };
  }, [productId]);

  // Submit Customer Review
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) {
      toast.error("Please write a comment for your review.");
      return;
    }

    setIsSubmittingReview(true);
    try {
      const res = await fetch("/api/store/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          authorName: userName,
          rating: newRating,
          comment: newComment,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Thank you for your feedback! Review posted.");
        setReviews([data.review, ...reviews]);
        setNewComment("");
        setNewRating(5);
      } else {
        toast.error(data.error || "Failed to submit review.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error submitting review.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Format embedded video URL for YouTube, TikTok, Vimeo, or direct MP4
  const formatEmbedVideoUrl = (url: string): string => {
    if (!url) return "";
    const trimmed = url.trim();

    // YouTube: watch?v=ID or youtu.be/ID
    const ytMatch = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
    if (ytMatch && ytMatch[1]) {
      return `https://www.youtube.com/embed/${ytMatch[1]}`;
    }

    // Vimeo: vimeo.com/ID
    const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vimeoMatch && vimeoMatch[1]) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }

    // TikTok: tiktok.com/@user/video/ID
    const ttMatch = trimmed.match(/tiktok\.com\/@[\w.-]+\/video\/(\d+)/i);
    if (ttMatch && ttMatch[1]) {
      return `https://www.tiktok.com/embed/v2/${ttMatch[1]}`;
    }

    return trimmed;
  };

  // Gallery slider helper
  const getProductGallery = (item: StoreItem): string[] => {
    if (Array.isArray(item.images) && item.images.length > 0) {
      return item.images;
    }
    if (item.imageUrl) {
      return [item.imageUrl];
    }
    return [];
  };

  // Cart operations
  const updateCart = (newCart: CartItem[]) => {
    setCart(newCart);
    saveCart(newCart);
  };

  const maxStockAllowed = !product?.unlimitedStock && typeof product?.stockQuantity === "number" ? product.stockQuantity : Infinity;
  const isAvailableInStock = product?.inStock && maxStockAllowed > 0;

  const handleAddToCart = (qty: number = 1, showToast: boolean = true) => {
    if (!product) return;
    if (!isAvailableInStock) {
      toast.error("Sorry, this item is currently out of stock!");
      return;
    }

    const existingIndex = cart.findIndex((c) => c.product.id === product.id);
    const existingQty = existingIndex > -1 ? cart[existingIndex].quantity : 0;
    const targetTotalQty = existingQty + qty;

    if (targetTotalQty > maxStockAllowed) {
      toast.error(`Only ${maxStockAllowed} unit${maxStockAllowed === 1 ? "" : "s"} available in stock! ${existingQty > 0 ? `You already have ${existingQty} in your cart.` : ""}`);
      return;
    }

    const itemToCart = {
      ...product,
      price: displayPrice,
    };

    let updatedCart: CartItem[];
    if (existingIndex > -1) {
      updatedCart = [...cart];
      updatedCart[existingIndex].product = itemToCart;
      updatedCart[existingIndex].quantity = targetTotalQty;
    } else {
      updatedCart = [...cart, { product: itemToCart, quantity: qty }];
    }

    updateCart(updatedCart);
    if (showToast) {
      toast.success(`Added ${qty}x ${product.title} to cart!`);
    }
  };

  const handleUpdateCartQuantity = (pId: string, delta: number) => {
    const updatedCart = cart
      .map((item) => {
        if (item.product.id === pId) {
          const maxStockAllowed = !item.product.unlimitedStock && typeof item.product.stockQuantity === "number" ? item.product.stockQuantity : Infinity;
          const newQty = item.quantity + delta;
          if (delta > 0 && newQty > maxStockAllowed) {
            toast.error(`Only ${maxStockAllowed} unit${maxStockAllowed === 1 ? "" : "s"} available in stock!`);
            return item;
          }
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      })
      .filter((item): item is CartItem => item !== null);

    updateCart(updatedCart);
  };

  const handleRemoveFromCart = (pId: string) => {
    const updatedCart = cart.filter((c) => c.product.id !== pId);
    updateCart(updatedCart);
    toast.info("Item removed from cart.");
  };

  const handleToggleWishlist = () => {
    if (!product) return;
    const newState = toggleWishlist(product);
    setIsWishlisted(newState);
    if (newState) {
      toast.success("Saved to Wishlist!");
    } else {
      toast.info("Removed from Wishlist.");
    }
  };

  const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  const handleConfirmCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStoreEnabled) {
      toast.error(getFeatureDisabledMessage(config?.featureToggles, "store"));
      return;
    }

    if (!customerDeliveryName.trim() || !customerDeliveryPhone.trim() || !customerDeliveryAddress.trim()) {
      toast.error("Please fill in all delivery information fields.");
      return;
    }

    if (cart.length === 0) {
      toast.error("Your shopping cart is empty.");
      return;
    }

    if (selectedPaymentMethod === "WALLET_NGN") {
      setIsStorePinModalOpen(true);
      return;
    }

    executeStoreOrder();
  };

  const executeStoreOrder = async (pin?: string, isBiometricAuthenticated?: boolean) => {
    setIsStorePinModalOpen(false);
    setIsPlacingOrder(true);
    toast.loading("Processing order payment...", { id: "place-order" });

    try {
      let idToken = "";
      if (user && typeof user.getIdToken === "function") {
        idToken = await user.getIdToken();
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      };

      const payload = {
        items: cart.map((c) => ({
          id: c.product.id,
          title: c.product.title,
          price: c.product.price,
          quantity: c.quantity,
          imageUrl: c.product.imageUrl,
          category: c.product.category,
        })),
        customerName: customerDeliveryName,
        customerPhone: customerDeliveryPhone,
        deliveryAddress: customerDeliveryAddress,
        paymentMethod: selectedPaymentMethod,
        pin,
        isBiometricAuthenticated,
      };

      const res = await fetch("/api/store/orders", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const targetPaymentUrl = data.paymentUrl || data.paymentLink || data.link;
        if (data.requiresPaymentRedirect && targetPaymentUrl) {
          toast.success("Redirecting to secured card gateway...", { id: "place-order" });
          updateCart([]);
          setIsCheckoutStep(false);
          setIsCartOpen(false);
          window.location.assign(targetPaymentUrl);
        } else {
          toast.success("Order placed successfully!", { id: "place-order" });
          setConfirmedOrder(data.order);
          updateCart([]);
          setIsCheckoutStep(false);
          setIsCartOpen(false);
        }
      } else {
        toast.error(data.error || "Failed to place store order.", { id: "place-order" });
      }
    } catch (err: any) {
      toast.error(err.message || "Network error placing store order.", { id: "place-order" });
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleShareProduct = () => {
    if (typeof window !== "undefined" && navigator.share) {
      navigator
        .share({
          title: product?.title || "E-Tech Store",
          text: `Check out ${product?.title} on ${settings.storeName || "E-Tech Store"}`,
          url: window.location.href,
        })
        .catch(() => {});
    } else if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Product link copied to clipboard!");
    }
  };

  if (isLoading && !product) {
    return (
      <RouteGuard>
        <div className="min-h-dvh bg-[#F4F5F7] text-black pb-32">
          <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md px-4 py-2 border-0 shadow-none">
            <div className="max-w-md mx-auto flex items-center justify-between gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
              <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
              <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
            </div>
          </header>

          <main className="max-w-md mx-auto pt-1 px-3 space-y-2.5">
            <div className="w-full h-72 rounded-2xl bg-white p-2 animate-pulse flex items-center justify-center">
              <div className="w-full h-full bg-gray-100 rounded-xl" />
            </div>
            <div className="bg-white rounded-2xl p-4 space-y-2 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/3" />
              <div className="h-4 bg-gray-200 rounded w-3/4" />
            </div>
          </main>
        </div>
      </RouteGuard>
    );
  }

  if (!product) {
    return (
      <RouteGuard>
        <div className="min-h-dvh bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-3xl bg-orange-50 flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[36px] text-[#FC7A00]">error_outline</span>
          </div>
          <h2 className="font-bodoni text-xl font-bold text-black mb-2">Product Not Found</h2>
          <p className="font-hanken text-xs text-gray-500 max-w-xs mb-6">
            The product you are looking for may have been removed or is temporarily unavailable.
          </p>
          <button
            type="button"
            onClick={() => { triggerHaptic(); router.push("/store"); }}
            className="px-6 py-3 bg-[#FC7A00] text-white rounded-2xl text-xs font-black uppercase tracking-wider active:scale-95 transition-all shadow-sm cursor-pointer border-0"
          >
            Return to Store
          </button>
        </div>
      </RouteGuard>
    );
  }

  const gallery = getProductGallery(product);
  const activeImgUrl = gallery[selectedGalleryIndex] || gallery[0] || product.imageUrl;

  const effectivePromoPrice = product.discountPrice || product.promoPrice;
  const hasPromo = typeof effectivePromoPrice === "number" && effectivePromoPrice > 0 && effectivePromoPrice < product.price;
  const displayPrice = hasPromo ? effectivePromoPrice : product.price;
  const listPrice = hasPromo ? product.price : product.originalPrice;
  const discountPercent = listPrice && listPrice > displayPrice
    ? Math.round(((listPrice - displayPrice) / listPrice) * 100)
    : 0;

  const recommendedProducts = allItems.filter(
    (i) => i.id !== product.id && i.category.toLowerCase() === product.category.toLowerCase()
  );
  const displayRecs = recommendedProducts.length > 0 ? recommendedProducts : allItems.filter((i) => i.id !== product.id);

  const isSharingEnabled = settings.enableProductSharing !== false;

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : product.rating
    ? Number(product.rating).toFixed(1)
    : null;

  return (
    <RouteGuard>
      <div id="store-page-root" className="min-h-dvh bg-[#F4F5F7] text-black pb-28">
        {!isStoreEnabled && (
          <div className="pt-2 px-3.5">
            <FeatureDisabledBanner
              title="E-Tech Store Unavailable"
              message={getFeatureDisabledMessage(config?.featureToggles, "store")}
            />
          </div>
        )}
        {/* Sticky Top Header Bar - Minimal Space */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-3.5 pt-3.5 pb-2.5 border-0 shadow-none">
          <div className="max-w-md mx-auto flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => { triggerHaptic(); router.back(); }}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-800 flex items-center justify-center active:scale-90 transition-all cursor-pointer border-0"
              title="Go Back"
            >
              <span className="material-symbols-outlined text-[18px] font-bold">arrow_back</span>
            </button>

            <div className={`min-w-0 flex-1 px-1 ${
              settings.productPageHeaderAlignment === "center"
                ? "text-center"
                : settings.productPageHeaderAlignment === "right"
                ? "text-right"
                : "text-left"
            }`}>
              <h1 className="font-hanken font-black text-xs uppercase tracking-wide text-black truncate">
                {product.title}
              </h1>
              <p className="font-hanken text-[8.5px] text-[#FC7A00] font-black uppercase tracking-widest truncate">
                {product.category}
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Product Sharing Icon (Controlled by Admin Setting) */}
              {isSharingEnabled && (
                <button
                  type="button"
                  onClick={handleShareProduct}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center active:scale-95 transition-all cursor-pointer border-0"
                  title="Share Product"
                >
                  <span className="material-symbols-outlined text-[17px]">share</span>
                </button>
              )}

              {/* Heart Wishlist Icon */}
              <button
                type="button"
                onClick={handleToggleWishlist}
                className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-all cursor-pointer border-0 ${
                  isWishlisted ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                title="Save to Wishlist"
              >
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{ fontVariationSettings: isWishlisted ? '"FILL" 1' : '"FILL" 0' }}
                >
                  favorite
                </span>
              </button>

              {/* Cart Icon */}
              <button
                type="button"
                onClick={() => setIsCartOpen(true)}
                className="relative w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center active:scale-95 transition-all cursor-pointer border-0"
                title="Shopping Cart"
              >
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{ color: settings.topBarCartIconColor || "#FC7A00" }}
                >
                  shopping_bag
                </span>
                {totalCartItems > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#FC7A00] text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white">
                    {totalCartItems}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area - Temu/Alibaba Minimal Space Standard Layout */}
        <main className="max-w-md mx-auto pt-1 px-3 space-y-2.5">
          {/* Hero Media Carousel */}
          <div className="bg-white rounded-2xl p-2.5 shadow-3xs space-y-2 border-0">
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onClick={() => setIsImageViewerOpen(true)}
              className="w-full h-72 min-[375px]:h-80 rounded-xl bg-gray-50 relative overflow-hidden flex items-center justify-center p-2 cursor-zoom-in group select-none"
            >
              {activeImgUrl ? (
                <Image
                  src={activeImgUrl}
                  alt={product.title}
                  fill
                  className="object-contain p-1 group-hover:scale-102 transition-transform duration-300"
                  unoptimized
                />
              ) : (
                <span className="material-symbols-outlined text-[64px] text-gray-300">storefront</span>
              )}

              {/* Badging */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10">
                <span className="px-2.5 py-0.5 rounded-full text-[8.5px] font-black uppercase bg-black/80 text-white backdrop-blur-md">
                  {product.category}
                </span>
                {discountPercent > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase bg-red-600 text-white shadow-xs">
                    -{discountPercent}%
                  </span>
                )}
              </div>

              {gallery.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedGalleryIndex((prev) => (prev - 1 + gallery.length) % gallery.length);
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-xs z-10 transition-transform active:scale-90 border-0"
                    title="Previous Image"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedGalleryIndex((prev) => (prev + 1) % gallery.length);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-xs z-10 transition-transform active:scale-90 border-0"
                    title="Next Image"
                  >
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </>
              )}

              <div className="absolute bottom-2 right-2 px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-black/75 text-white backdrop-blur-md flex items-center gap-1 z-10">
                <span className="material-symbols-outlined text-[12px]">zoom_in</span>
                <span>{selectedGalleryIndex + 1} / {gallery.length}</span>
              </div>
            </div>

            {/* Gallery Thumbnails */}
            {gallery.length > 1 && (
              <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar py-2 px-0.5 select-none">
                {gallery.map((img, idx) => {
                  const isSelected = selectedGalleryIndex === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedGalleryIndex(idx)}
                      className={`w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 relative transition-all cursor-pointer bg-gray-50 p-1 ${
                        isSelected
                          ? "border-2 border-[#FC7A00] bg-orange-50/40 shadow-xs"
                          : "border border-gray-200/80 opacity-70 hover:opacity-100 hover:border-gray-300"
                      }`}
                    >
                      <img src={img} alt={`Thumb ${idx}`} className="w-full h-full object-contain" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pricing & Title Block */}
          <div className="bg-white rounded-2xl p-3.5 shadow-3xs space-y-2 border-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-2xl font-black text-[#FC7A00]">
                  ₦{displayPrice.toLocaleString()}
                </span>
                {listPrice && listPrice > displayPrice && (
                  <span className="font-mono text-xs text-gray-400 line-through">
                    ₦{listPrice.toLocaleString()}
                  </span>
                )}
                {discountPercent > 0 && (
                  <span className="px-2 py-0.5 rounded text-[8.5px] font-black uppercase bg-red-600 text-white shadow-2xs">
                    -{discountPercent}% OFF
                  </span>
                )}
                {product.discountBadge && (
                  <span className="px-2 py-0.5 rounded text-[8.5px] font-black uppercase bg-red-600 text-white shadow-2xs">
                    {product.discountBadge}
                  </span>
                )}
              </div>

              <div className="flex flex-col items-end gap-0.5">
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                  isAvailableInStock ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                }`}>
                  {isAvailableInStock ? "In Stock" : "Out of Stock"}
                </span>
                {!product.unlimitedStock && typeof product.stockQuantity === "number" && (
                  <span className="text-[9px] font-extrabold uppercase text-gray-500">
                    {product.stockQuantity > 0 ? `${product.stockQuantity} Available` : "0 Available"}
                  </span>
                )}
              </div>
            </div>

            <h2 className="font-hanken font-extrabold text-sm min-[375px]:text-base text-black leading-snug">
              {product.title}
            </h2>

            <div className="flex items-center gap-2.5 pt-1 text-[11px] text-gray-600 flex-wrap">
              {avgRating && (
                <>
                  <div className="flex items-center gap-1 text-amber-500 font-bold">
                    <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                      star
                    </span>
                    <span>{avgRating}</span>
                  </div>
                  <span className="text-gray-300">•</span>
                </>
              )}
              <span className="font-medium text-gray-500">
                {reviews.length} {reviews.length === 1 ? "Customer Review" : "Customer Reviews"}
              </span>
              {Boolean(product.soldCount && product.soldCount > 0) && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="font-bold text-gray-700">{product.soldCount} Sold</span>
                </>
              )}
            </div>
          </div>

          {/* Quantity Selector */}
          <div className="bg-white rounded-2xl p-3.5 shadow-3xs flex items-center justify-between border border-orange-100/60">
            <div className="space-y-0.5">
              <span className="font-hanken text-xs font-black uppercase text-gray-800 block">Quantity</span>
              {!product.unlimitedStock && typeof product.stockQuantity === "number" && (
                <span className="text-[9.5px] font-bold text-gray-500 uppercase block">
                  {product.stockQuantity > 0 ? `${product.stockQuantity} Left in Stock` : "Stock Depleted"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 bg-gray-50/90 p-1.5 rounded-2xl border border-gray-200/80">
              <button
                type="button"
                disabled={!isAvailableInStock || productQuantity <= 1}
                onClick={() => setProductQuantity((q) => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-xl bg-white text-black font-black text-base flex items-center justify-center active:scale-90 cursor-pointer border border-gray-300 hover:border-[#FC7A00] hover:text-[#FC7A00] transition-all shadow-2xs disabled:opacity-40"
              >
                -
              </button>
              <span className="font-mono font-black text-sm w-6 text-center text-black">{productQuantity}</span>
              <button
                type="button"
                disabled={!isAvailableInStock || productQuantity >= maxStockAllowed}
                onClick={() => setProductQuantity((q) => Math.min(maxStockAllowed, q + 1))}
                className="w-8 h-8 rounded-xl bg-white text-black font-black text-base flex items-center justify-center active:scale-90 cursor-pointer border border-gray-300 hover:border-[#FC7A00] hover:text-[#FC7A00] transition-all shadow-2xs disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>

          {/* Description & Overview */}
          <div className="bg-white rounded-2xl p-3.5 shadow-3xs space-y-2 border-0">
            <div className="flex items-center gap-1.5 text-black">
              <span className="material-symbols-outlined text-[#FC7A00] text-[18px]">description</span>
              <h3 className="font-hanken font-extrabold text-xs uppercase tracking-wider text-black">
                Product Details
              </h3>
            </div>
            <p className="font-hanken text-xs text-gray-700 leading-relaxed font-medium">
              {product.description || "Premium quality product built with high reliability and genuine components."}
            </p>
          </div>

          {/* Embedded Product Video (Optional - Controlled by Admin Setting) */}
          {Boolean(product.videoUrl && settings.enableProductVideo !== false) && (
            <div className="bg-white rounded-2xl p-3.5 shadow-3xs space-y-2 border-0">
              <div className="flex items-center gap-1.5 text-black mb-1">
                <span className="material-symbols-outlined text-blue-600 text-[18px]">smart_display</span>
                <h3 className="font-hanken font-extrabold text-xs uppercase tracking-wider text-black">
                  Product Video Preview
                </h3>
              </div>

              <div className="w-full h-52 sm:h-64 rounded-xl bg-black overflow-hidden relative border-0 shadow-inner flex items-center justify-center">
                {product.videoUrl?.match(/\.(mp4|webm|ogg)($|\?)/i) ? (
                  <video
                    controls
                    src={product.videoUrl}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <iframe
                    src={formatEmbedVideoUrl(product.videoUrl || "")}
                    title={`${product.title} Video Preview`}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                )}
              </div>
            </div>
          )}

          {/* Customer Reviews & Feedback Section */}
          <div className="bg-white rounded-2xl p-3.5 shadow-3xs space-y-3 border-0">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#FC7A00] text-[18px]">rate_review</span>
                <h3 className="font-hanken font-extrabold text-xs uppercase tracking-wider text-black">
                  Customer Reviews ({reviews.length})
                </h3>
              </div>
            </div>

            {/* Write a Review Form */}
            <form onSubmit={handleSubmitReview} className="space-y-2.5 bg-gray-50/80 p-3 rounded-xl border-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase text-gray-500">Leave Your Feedback</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setNewRating(star)}
                      className="text-amber-400 cursor-pointer transition-transform active:scale-110"
                    >
                      <span
                        className="material-symbols-outlined text-[18px]"
                        style={{ fontVariationSettings: star <= newRating ? '"FILL" 1' : '"FILL" 0' }}
                      >
                        star
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                rows={2}
                required
                placeholder="Share your experience with this product..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="w-full p-2.5 bg-white rounded-xl text-xs font-medium outline-none border-0 shadow-2xs resize-none"
              />

              <button
                type="submit"
                disabled={isSubmittingReview}
                className="w-full py-2 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all shadow-2xs disabled:opacity-50"
              >
                {isSubmittingReview ? "Posting Review..." : "Submit Review"}
              </button>
            </form>

            {/* Reviews List */}
            {isLoadingReviews ? (
              <p className="text-[10px] font-bold text-gray-400 uppercase text-center py-4">Loading Reviews...</p>
            ) : reviews.length === 0 ? (
              <p className="text-[11px] font-medium text-gray-400 text-center py-4">No reviews posted yet. Be the first to review!</p>
            ) : (
              <div className="space-y-2.5">
                {reviews.map((rev) => (
                  <div key={rev.id} className="p-3 bg-gray-50 rounded-xl space-y-1.5 border-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs uppercase text-gray-900">{rev.authorName}</span>
                      <div className="flex items-center text-amber-400">
                        {[...Array(rev.rating)].map((_, i) => (
                          <span key={i} className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                            star
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-gray-700 font-medium leading-snug">{rev.comment}</p>

                    {/* Official Admin Reply Bubble */}
                    {rev.adminReply && (
                      <div className="mt-2 p-2.5 rounded-lg bg-orange-100/70 text-orange-950 text-[11px] space-y-0.5">
                        <div className="flex items-center gap-1 font-bold text-[#FC7A00]">
                          <span className="material-symbols-outlined text-[14px]">support_agent</span>
                          <span>Store Support Reply:</span>
                        </div>
                        <p className="font-medium leading-relaxed">{rev.adminReply.message}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Related Products Carousel */}
          {displayRecs.length > 0 && (
            <div className="space-y-2 pt-1">
              <h3 className="font-hanken font-extrabold text-xs uppercase tracking-wider text-black flex items-center gap-1.5 px-1">
                <span className="material-symbols-outlined text-[18px] text-[#FC7A00]">thumb_up</span>
                Recommended For You
              </h3>

              <div className="flex gap-2.5 overflow-x-auto no-scrollbar py-1 select-none">
                {displayRecs.slice(0, 8).map((rec) => {
                  const recBorderColor = settings.hideBorders
                    ? "transparent"
                    : settings.enableGradientBorder
                    ? settings.gradientColorStart || "#FC7A00"
                    : settings.borderColor || "#FC7A00";

                  return (
                    <div
                      key={rec.id}
                      onClick={() => router.push(`/store/product/${rec.id}`)}
                      style={{
                        borderColor: recBorderColor,
                        borderRadius: `${settings.cardBorderRadius ?? 16}px`,
                        borderWidth: `${settings.borderWidth ?? 1}px`,
                        ...(settings.enableGradientBorder && !settings.hideBorders
                          ? {
                              borderImage: `linear-gradient(135deg, ${settings.gradientColorStart || "#FC7A00"}, ${settings.gradientColorEnd || "#E06600"}) 1`,
                            }
                          : {}),
                      }}
                      className={`w-32 flex-shrink-0 bg-white shadow-3xs p-2 space-y-1.5 cursor-pointer hover:shadow-xs transition-all ${
                        settings.hideBorders ? "border-0" : "border"
                      }`}
                    >
                    <div className="w-full h-20 rounded-lg bg-gray-50 relative overflow-hidden flex items-center justify-center p-1">
                      {rec.imageUrl ? (
                        <img src={rec.imageUrl} alt={rec.title} className="w-full h-full object-contain p-0.5" />
                      ) : (
                        <span className="material-symbols-outlined text-[20px] text-gray-300">storefront</span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-hanken font-bold text-[10.5px] text-black uppercase line-clamp-1 leading-tight">
                        {rec.title}
                      </h4>
                      <p className="font-mono font-black text-xs text-[#FC7A00] mt-0.5">
                        ₦{rec.price.toLocaleString()}
                      </p>
                    </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {/* Fixed Temu-Style Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-xl border-0 flex items-center gap-2 shadow-2xl z-50 max-w-md mx-auto">
          <button
            type="button"
            onClick={handleToggleWishlist}
            className={`p-2.5 rounded-xl flex flex-col items-center justify-center active:scale-95 transition-all cursor-pointer border-0 ${
              isWishlisted ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            title="Wishlist"
          >
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ fontVariationSettings: isWishlisted ? '"FILL" 1' : '"FILL" 0' }}
            >
              favorite
            </span>
            <span className="text-[7.5px] font-black uppercase mt-0.5">Saved</span>
          </button>

          <button
            type="button"
            disabled={!isAvailableInStock}
            onClick={() => handleAddToCart(productQuantity)}
            className="flex-1 py-3 bg-gray-900 hover:bg-black disabled:bg-gray-300 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1 border-0 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px] text-orange-400">add_shopping_cart</span>
            <span>{isAvailableInStock ? "Add to Cart" : "Out of Stock"}</span>
          </button>

          <button
            type="button"
            disabled={!isAvailableInStock}
            onClick={() => {
              handleAddToCart(productQuantity, false);
              setIsCartOpen(true);
            }}
            style={{
              backgroundColor: isAvailableInStock ? (settings.storeButtonColor || "#FC7A00") : "#9CA3AF",
              color: settings.storeButtonTextColor || "#FFFFFF",
            }}
            className="flex-1 py-3 hover:opacity-90 disabled:bg-gray-300 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1 shadow-md border-0 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">{settings.storeButtonIcon || "bolt"}</span>
            <span>{isAvailableInStock ? "Buy Now" : "Out of Stock"}</span>
          </button>
        </div>

        {/* Shopping Cart Smooth Full Screen Modal */}
        <AnimatePresence>
          {isCartOpen && (
            <div className="fixed inset-0 z-[100002] bg-white flex flex-col justify-between overflow-hidden">
              <motion.div
                initial={{ opacity: 0, y: "100%" }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: "100%" }}
                transition={{ type: "spring", damping: 32, stiffness: 350 }}
                className="w-full h-full flex flex-col text-black max-w-md mx-auto overflow-hidden will-change-transform"
              >
                {/* Header */}
                <div className="px-4 py-3 flex items-center justify-between flex-shrink-0 border-b border-gray-100 bg-white/95 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCartOpen(false)}
                      className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-800 transition-colors cursor-pointer border-0"
                      title="Back"
                    >
                      <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                    </button>
                    <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">shopping_bag</span>
                    <div>
                      <h2 className="font-hanken font-bold text-base text-black uppercase tracking-wide">
                        Cart
                      </h2>
                      <p className="font-hanken text-[9.5px] text-gray-400 font-bold uppercase tracking-widest">
                        {totalCartItems} {totalCartItems === 1 ? "Item" : "Items"} Selected
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCartOpen(false)}
                    className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 hover:text-black transition-colors cursor-pointer border-0"
                    title="Close"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-3.5 custom-scrollbar pb-36">
                  {cart.length === 0 ? (
                    <div className="py-20 flex flex-col items-center text-center space-y-3">
                      <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[48px] text-gray-300">remove_shopping_cart</span>
                      </div>
                      <h3 className="font-bodoni font-bold text-lg text-black">Your Cart is Empty</h3>
                      <p className="font-hanken text-xs text-gray-400 max-w-xs leading-relaxed">
                        Explore storefront hardware and gear to add items to your cart.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsCartOpen(false)}
                        className="mt-2 px-6 py-3 bg-[#FC7A00] text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all border-0 shadow-xs"
                      >
                        Browse Products
                      </button>
                    </div>
                  ) : (
                    cart.map(({ product, quantity }) => (
                      <div
                        key={product.id}
                        className="p-4 bg-gray-50 border-0 rounded-2xl flex items-center justify-between gap-3 shadow-3xs"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-14 h-14 rounded-xl border-0 bg-white overflow-hidden relative flex-shrink-0">
                            {product.imageUrl ? (
                              <Image src={product.imageUrl} alt={product.title} fill className="object-cover" unoptimized />
                            ) : (
                              <span className="material-symbols-outlined text-[28px] text-gray-400 p-2">storefront</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-extrabold text-xs uppercase text-black truncate">{product.title}</h4>
                            <p className="font-mono font-bold text-xs text-[#FC7A00] mt-0.5">
                              ₦{product.price.toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQuantity(product.id, -1)}
                            className="w-8 h-8 rounded-lg border-0 bg-white text-xs font-bold flex items-center justify-center active:scale-90 cursor-pointer shadow-3xs"
                          >
                            -
                          </button>
                          <span className="font-mono font-black text-xs w-4 text-center">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQuantity(product.id, 1)}
                            className="w-8 h-8 rounded-lg border-0 bg-white text-xs font-bold flex items-center justify-center active:scale-90 cursor-pointer shadow-3xs"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromCart(product.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors ml-1 cursor-pointer border-0"
                            title="Remove item"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {cart.length > 0 && !isCheckoutStep && (
                  <div className="p-5 bg-white border-t border-gray-100 space-y-3 shadow-lg z-20 flex-shrink-0">
                    {/* Payment Method Selector Bar directly in Cart */}
                    <div className="space-y-1.5 bg-gray-50 p-3 rounded-2xl border border-gray-150">
                      <label className="text-[9.5px] font-black uppercase text-gray-400 block">
                        Payment Method / Checkout Channel
                      </label>

                      <div className={`grid ${settings.hideCardPayment ? "grid-cols-1" : "grid-cols-2"} gap-2`}>
                        <button
                          type="button"
                          onClick={() => setSelectedPaymentMethod("WALLET_NGN")}
                          className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                            selectedPaymentMethod === "WALLET_NGN"
                              ? "border-[#FC7A00] bg-orange-50/90 text-black font-extrabold"
                              : "border-gray-200 bg-white text-gray-600 font-bold"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="material-symbols-outlined text-[18px] text-[#FC7A00]">
                              account_balance_wallet
                            </span>
                            <span className="text-[10px] uppercase truncate">Main Wallet</span>
                          </div>
                          {selectedPaymentMethod === "WALLET_NGN" && (
                            <span className="material-symbols-outlined text-[16px] text-[#FC7A00]">check_circle</span>
                          )}
                        </button>

                        {!settings.hideCardPayment && (
                          <button
                            type="button"
                            onClick={() => setSelectedPaymentMethod("CARD_CHECKOUT")}
                            className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                              selectedPaymentMethod === "CARD_CHECKOUT"
                                ? "border-emerald-500 bg-emerald-50/90 text-black font-extrabold"
                                : "border-gray-200 bg-white text-gray-600 font-bold"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="material-symbols-outlined text-[18px] text-emerald-600">
                                credit_card
                              </span>
                              <span className="text-[10px] uppercase truncate">Pay with Card</span>
                            </div>
                            {selectedPaymentMethod === "CARD_CHECKOUT" && (
                              <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-gray-500 uppercase tracking-wider">Subtotal ({totalCartItems} items)</span>
                      <span className="font-mono text-lg font-black text-black">₦{cartSubtotal.toLocaleString()}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsCheckoutStep(true)}
                      className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm border-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                      <span>Proceed to Delivery & Payment</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => updateCart([])}
                      className="w-full text-center text-[10px] font-bold text-gray-400 hover:text-red-500 uppercase tracking-wider cursor-pointer transition-colors border-0"
                    >
                      Clear Shopping Cart
                    </button>
                  </div>
                )}

                {isCheckoutStep && (
                  <div className="absolute inset-0 bg-white z-30 p-5 overflow-y-auto flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                        <button
                          type="button"
                          onClick={() => setIsCheckoutStep(false)}
                          className="flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-black border-0"
                        >
                          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                          Back to Cart
                        </button>
                        <span className="text-xs font-black uppercase text-[#FC7A00]">Delivery & Payment</span>
                      </div>

                      <form id="checkout-form" onSubmit={handleConfirmCheckout} className="space-y-3.5">
                        {/* Prominent Payment Method Selector at Top of Checkout Form */}
                        <div className="space-y-1.5 bg-gray-50 p-3 rounded-2xl border border-gray-200">
                          <label className="text-[10px] font-black uppercase text-gray-500 block">
                            Select Payment Method *
                          </label>

                          <div className={`grid ${settings.hideCardPayment ? "grid-cols-1" : "grid-cols-2"} gap-2`}>
                            <button
                              type="button"
                              onClick={() => setSelectedPaymentMethod("WALLET_NGN")}
                              className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                                selectedPaymentMethod === "WALLET_NGN"
                                  ? "border-[#FC7A00] bg-orange-50/80 shadow-xs"
                                  : "border-gray-200 bg-white hover:bg-gray-100"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="material-symbols-outlined text-[20px] text-[#FC7A00]">
                                  account_balance_wallet
                                </span>
                                {selectedPaymentMethod === "WALLET_NGN" && (
                                  <span className="material-symbols-outlined text-[16px] text-[#FC7A00]">check_circle</span>
                                )}
                              </div>
                              <div className="mt-2">
                                <span className="font-extrabold text-[11px] uppercase block text-black">Main Wallet</span>
                                <span className="text-[9px] text-gray-400 font-semibold block">Deduct from NGN balance</span>
                              </div>
                            </button>

                            {!settings.hideCardPayment && (
                              <button
                                type="button"
                                onClick={() => setSelectedPaymentMethod("CARD_CHECKOUT")}
                                className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                                  selectedPaymentMethod === "CARD_CHECKOUT"
                                    ? "border-emerald-500 bg-emerald-50/80 shadow-xs"
                                    : "border-gray-200 bg-white hover:bg-gray-100"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="material-symbols-outlined text-[20px] text-emerald-600">
                                    credit_card
                                  </span>
                                  {selectedPaymentMethod === "CARD_CHECKOUT" && (
                                    <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                                  )}
                                </div>
                                <div className="mt-2">
                                  <span className="font-extrabold text-[11px] uppercase block text-black">Pay with Card</span>
                                  <span className="text-[9px] text-gray-400 font-semibold block">Pay securely using Flutterwave card</span>
                                </div>
                              </button>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">
                            Full Recipient Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={customerDeliveryName}
                            onChange={(e) => setCustomerDeliveryName(e.target.value)}
                            placeholder="e.g. Captain Jules"
                            className="w-full px-3.5 py-2.5 rounded-xl border-0 bg-gray-50 text-xs font-bold outline-none focus:ring-2 focus:ring-[#FC7A00]"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">
                            Phone Number for Delivery Updates *
                          </label>
                          <input
                            type="tel"
                            required
                            value={customerDeliveryPhone}
                            onChange={(e) => setCustomerDeliveryPhone(e.target.value)}
                            placeholder="e.g. 08012345678"
                            className="w-full px-3.5 py-2.5 rounded-xl border-0 bg-gray-50 text-xs font-bold outline-none focus:ring-2 focus:ring-[#FC7A00]"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">
                            Full Delivery Address *
                          </label>
                          <textarea
                            rows={3}
                            required
                            value={customerDeliveryAddress}
                            onChange={(e) => setCustomerDeliveryAddress(e.target.value)}
                            placeholder="e.g. Suite 4B, E-Tech Hub Plaza, Victoria Island, Lagos"
                            className="w-full px-3.5 py-2.5 rounded-xl border-0 bg-gray-50 text-xs font-bold outline-none focus:ring-2 focus:ring-[#FC7A00] resize-none"
                          />
                        </div>

                        <div className="p-3.5 rounded-2xl bg-gray-50 border-0 space-y-1">
                          <div className="flex items-center justify-between text-xs font-bold text-gray-800">
                            <span>Selected Channel:</span>
                            <span className="text-emerald-600 font-black">
                              {selectedPaymentMethod === "CARD_CHECKOUT" ? "Checkout with Card Payment" : "Main NGN Wallet"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs font-black">
                            <span className="text-gray-600">Total Order Charge:</span>
                            <span className="text-[#FC7A00] text-sm">₦{cartSubtotal.toLocaleString()}</span>
                          </div>
                        </div>
                      </form>
                    </div>

                    <div className="pt-4 border-0 space-y-2">
                      <button
                        type="submit"
                        form="checkout-form"
                        disabled={isPlacingOrder}
                        className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white rounded-2xl text-xs font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 border-0"
                      >
                        {isPlacingOrder ? (
                          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="material-symbols-outlined text-[18px]">verified</span>
                        )}
                        <span>Confirm Order & Pay ₦{cartSubtotal.toLocaleString()}</span>
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Full-Screen Zoomable Image Viewer Modal */}
        <AnimatePresence>
          {isImageViewerOpen && (
            <div className="fixed inset-0 z-[100010] bg-black text-white flex flex-col justify-between overflow-hidden">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", damping: 28, stiffness: 300 }}
                className="w-full h-full flex flex-col justify-between p-4 max-w-md mx-auto relative select-none"
              >
                {/* Header Bar */}
                <div className="flex items-center justify-between z-20 pt-2">
                  <span className="text-xs font-mono font-black uppercase tracking-widest text-gray-300">
                    {selectedGalleryIndex + 1} of {gallery.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsImageViewerOpen(false)}
                    className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center backdrop-blur-md transition-all cursor-pointer border-0"
                    title="Close Viewer"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>

                {/* Main Full Image View Area */}
                <div
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  className="flex-1 relative flex items-center justify-center my-4 overflow-hidden"
                >
                  {activeImgUrl ? (
                    <img
                      src={activeImgUrl}
                      alt={product.title}
                      className="max-w-full max-h-full object-contain transition-all duration-300"
                    />
                  ) : (
                    <span className="material-symbols-outlined text-[64px] text-gray-600">storefront</span>
                  )}

                  {/* Prev / Next Arrows */}
                  {gallery.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGalleryIndex((prev) => (prev - 1 + gallery.length) % gallery.length);
                        }}
                        className="absolute left-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 shadow-lg cursor-pointer"
                        title="Previous Image"
                      >
                        <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGalleryIndex((prev) => (prev + 1) % gallery.length);
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 shadow-lg cursor-pointer"
                        title="Next Image"
                      >
                        <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Bottom Thumbnails Strip */}
                {gallery.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar justify-center py-2 z-20">
                    {gallery.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedGalleryIndex(idx)}
                        className={`w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 relative transition-all cursor-pointer bg-gray-900 border ${
                          selectedGalleryIndex === idx ? "border-[#FC7A00] ring-2 ring-[#FC7A00] scale-105" : "border-gray-800 opacity-50"
                        }`}
                      >
                        <img src={img} alt={`Thumb ${idx}`} className="w-full h-full object-contain p-0.5" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Confirmed Order Modal */}
        {confirmedOrder && (
          <div className="fixed inset-0 z-[100004] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="w-full max-w-sm p-6 rounded-3xl bg-white text-black space-y-4 shadow-2xl text-center border-0">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-emerald-600">
                <span className="material-symbols-outlined text-[36px]">check_circle</span>
              </div>

              <div>
                <h3 className="font-black text-base uppercase tracking-tight text-black">Order Placed Successfully!</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Order ID: <strong className="font-mono text-[#FC7A00]">{confirmedOrder.id}</strong>
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-gray-50 border-0 text-left text-xs space-y-1">
                <div className="flex justify-between font-bold">
                  <span className="text-gray-500">Amount Charged:</span>
                  <span className="text-emerald-600 font-black">₦{confirmedOrder.totalAmount?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Recipient:</span>
                  <span className="font-bold">{confirmedOrder.customerName}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[10px]">Address:</span>
                  <span className="font-medium text-[11px] line-clamp-2">{confirmedOrder.deliveryAddress}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setConfirmedOrder(null);
                  router.push("/store");
                }}
                className="w-full py-3 bg-[#FC7A00] text-white rounded-xl font-black text-xs uppercase tracking-wider hover:opacity-90 border-0"
              >
                Close & Return to Store
              </button>
            </div>
          </div>
        )}

        {/* Store Payment PIN / Biometric Authorization Modal */}
        <InvestmentPinModal
          isOpen={isStorePinModalOpen}
          onClose={() => setIsStorePinModalOpen(false)}
          title="Authorize Store Purchase"
          description={`Approving ₦${cart.reduce((s, i) => s + i.product.price * i.quantity, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} store order.`}
          isSubmitting={isPlacingOrder}
          onPinSubmit={(pin, isBiometricAuthenticated) => executeStoreOrder(pin, isBiometricAuthenticated)}
        />
      </div>
    </RouteGuard>
  );
}
