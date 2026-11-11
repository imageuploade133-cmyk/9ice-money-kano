"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BottomNav } from "@/components/layout/BottomNav";
import { RouteGuard } from "@/components/RouteGuard";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import BannerSlideshow from "@/components/BannerSlideshow";
import {
  getCachedStore,
  setCachedStore,
  clearStoreCache,
  cacheProductDetail,
  getSavedCart,
  saveCart,
  getSavedWishlist,
  toggleWishlist,
} from "@/lib/store-cache";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { useAppConfig } from "@/lib/ConfigContext";
import { isFeatureEnabled, getFeatureDisabledMessage } from "@/lib/feature-toggle";
import { FeatureDisabledBanner } from "@/components/FeatureDisabledBanner";
import { InvestmentPinModal } from "@/components/investment/InvestmentPinModal";
import {
  StoreItem,
  StoreSlide,
  StoreCategory,
  StoreSettings,
  CartItem,
  OrderRecord,
  getEffectivePrice,
  StoreHeader,
  StoreSearchBar,
  StoreCategoryChips,
  StoreRecentlyViewedSection,
  StoreRecentlyViewedModal,
  StoreProductGrid,
  StoreWishlistModal,
  StoreCartModal,
  StoreOrderHistoryModal,
  StoreSearchModal,
  StoreConfirmedOrderModal,
} from "@/components/store";

export default function StorePage() {
  const router = useRouter();
  const { userData, user } = useAuth();
  const { config } = useAppConfig();
  const isStoreEnabled = isFeatureEnabled(config?.featureToggles, "store");
  const userName = (userData?.name || user?.displayName || "Captain") as string;

  const [items, setItems] = useState<StoreItem[]>([]);
  const [slides, setSlides] = useState<StoreSlide[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [settings, setSettings] = useState<StoreSettings>({ borderColor: "#FC7A00", hideBorders: false });
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");

  // Full screen search drawer state with paginated 20-item lazy load
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchModalQuery, setSearchModalQuery] = useState("");
  const [searchModalCategory, setSearchModalCategory] = useState("ALL");
  const [visibleSearchLimit, setVisibleSearchLimit] = useState(20);

  // Recently Viewed products state (saves up to 50 items locally)
  const [recentlyViewed, setRecentlyViewed] = useState<StoreItem[]>([]);
  const [isAllRecentlyViewedOpen, setIsAllRecentlyViewedOpen] = useState(false);
  const [visibleRecentlyViewedLimit, setVisibleRecentlyViewedLimit] = useState(10);

  // Wishlist state & Wishlist Drawer
  const [wishlist, setWishlist] = useState<StoreItem[]>([]);
  const [isWishlistModalOpen, setIsWishlistModalOpen] = useState(false);

  // Load recently viewed & wishlist on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const rawRv = localStorage.getItem("e_tech_recently_viewed");
        if (rawRv) {
          const parsedRv = JSON.parse(rawRv);
          if (Array.isArray(parsedRv)) setRecentlyViewed(parsedRv);
        }
      } catch {
        // Ignore parse errors
      }
    }
    setWishlist(getSavedWishlist());
  }, []);

  const handleToggleWishlistProduct = (e: React.MouseEvent, product: StoreItem) => {
    e.stopPropagation();
    const newState = toggleWishlist(product);
    setWishlist(getSavedWishlist());
    if (newState) {
      toast.success(`Saved ${product.title} to Wishlist!`);
    } else {
      toast.info(`Removed ${product.title} from Wishlist.`);
    }
  };

  // Full screen Cart drawer state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Checkout & Delivery Profile state
  const [isCheckoutStep, setIsCheckoutStep] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"WALLET_NGN" | "CARD_CHECKOUT">("WALLET_NGN");
  const [customerDeliveryName, setCustomerDeliveryName] = useState<string>(String(userName || ""));
  const [customerDeliveryPhone, setCustomerDeliveryPhone] = useState<string>(String(userData?.phoneNumber || ""));
  const [customerDeliveryAddress, setCustomerDeliveryAddress] = useState<string>("");
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isStorePinModalOpen, setIsStorePinModalOpen] = useState<boolean>(false);
  const [confirmedOrder, setConfirmedOrder] = useState<OrderRecord | null>(null);

  // Customer Order History Drawer state
  const [isMyOrdersOpen, setIsMyOrdersOpen] = useState(false);
  const [myOrders, setMyOrders] = useState<OrderRecord[]>([]);
  const [isLoadingMyOrders, setIsLoadingMyOrders] = useState(false);

  // Lock body scroll and handle hardware back button across all store drawers
  useModalBackHandler(isCartOpen, () => setIsCartOpen(false), "store-cart-modal");
  useModalBackHandler(isMyOrdersOpen, () => setIsMyOrdersOpen(false), "store-myorders-modal");
  useModalBackHandler(isSearchModalOpen, () => setIsSearchModalOpen(false), "store-search-modal");
  useModalBackHandler(isWishlistModalOpen, () => setIsWishlistModalOpen(false), "store-wishlist-modal");
  useModalBackHandler(isAllRecentlyViewedOpen, () => setIsAllRecentlyViewedOpen(false), "store-recentlyviewed-modal");
  useModalBackHandler(Boolean(confirmedOrder), () => setConfirmedOrder(null), "store-confirmed-modal");

  // Load Cart from localStorage on mount and fetch user order count
  useEffect(() => {
    setCart(getSavedCart());
  }, []);

  useEffect(() => {
    if (user) {
      fetchMyOrders();
    }
  }, [user]);

  // Sync Cart changes to localStorage
  const updateCart = (newCart: CartItem[]) => {
    setCart(newCart);
    saveCart(newCart);
  };

  // Fetch Storefront Data with Low Read Cache Strategy
  const fetchStoreData = async (forceRefresh: boolean = false) => {
    if (!forceRefresh) {
      const cached = getCachedStore();
      if (cached) {
        setItems(cached.items);
        setSlides(cached.slides);
        setCategories(cached.categories || []);
        setSettings(cached.settings || {});
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    try {
      const res = await fetch(forceRefresh ? "/api/store?fresh=true" : "/api/store");
      const data = await res.json();
      if (data.success) {
        const fetchedItems: StoreItem[] = data.items || [];
        const fetchedSlides: StoreSlide[] = data.slides || [];
        const fetchedCategories: StoreCategory[] = data.categories || [];
        const fetchedSettings: StoreSettings = data.settings || {};
        setItems(fetchedItems);
        setSlides(fetchedSlides);
        setCategories(fetchedCategories);
        setSettings(fetchedSettings);
        setCachedStore(fetchedItems, fetchedSlides, fetchedCategories, fetchedSettings);
      }
    } catch (err) {
      console.error("Failed to load store data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStoreData(false);
  }, []);

  // Clean local storage / cache handler
  const handleClearStoreCache = () => {
    clearStoreCache();
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("e_tech_recently_viewed");
      } catch {
        // Ignore
      }
    }
    setRecentlyViewed([]);
    toast.success("Clearing store cache and reloading fresh data...");
    fetchStoreData(true);
  };

  // Product Navigation Loading State for instant user feedback
  const [navigatingProductId, setNavigatingProductId] = useState<string | null>(null);

  // Open Real Product Detail Page with Card Loading Feedback
  const handleOpenProductPage = (item: StoreItem) => {
    cacheProductDetail(item);
    setNavigatingProductId(item.id);
    router.push(`/store/product/${item.id}`);
  };

  // Cart operations
  const handleAddToCart = (product: StoreItem, qty: number = 1) => {
    const maxStockAllowed = !product.unlimitedStock && typeof product.stockQuantity === "number" ? product.stockQuantity : Infinity;
    const isAvailableInStock = product.inStock && maxStockAllowed > 0;

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

    const effectivePrice = getEffectivePrice(product);
    const productWithEffectivePrice = {
      ...product,
      price: effectivePrice,
    };

    let updatedCart: CartItem[];
    if (existingIndex > -1) {
      updatedCart = [...cart];
      updatedCart[existingIndex].product = productWithEffectivePrice;
      updatedCart[existingIndex].quantity = targetTotalQty;
    } else {
      updatedCart = [...cart, { product: productWithEffectivePrice, quantity: qty }];
    }

    updateCart(updatedCart);
    toast.success(`Added ${qty}x ${product.title} to cart!`);
  };

  const handleUpdateCartQuantity = (productId: string, delta: number) => {
    const updatedCart = cart
      .map((item) => {
        if (item.product.id === productId) {
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

  const handleRemoveFromCart = (productId: string) => {
    const updatedCart = cart.filter((c) => c.product.id !== productId);
    updateCart(updatedCart);
    toast.info("Item removed from cart.");
  };

  const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  const fetchMyOrders = async () => {
    setIsLoadingMyOrders(true);
    try {
      let idToken = "";
      if (user && typeof user.getIdToken === "function") {
        idToken = await user.getIdToken();
      }
      const headers: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {};

      const res = await fetch("/api/store/orders", { headers });
      const data = await res.json();
      if (data.success && Array.isArray(data.orders)) {
        setMyOrders(data.orders);
      }
    } catch (err) {
      console.warn("Failed to fetch customer order history:", err);
    } finally {
      setIsLoadingMyOrders(false);
    }
  };

  const handleConfirmCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerDeliveryName.trim() || !customerDeliveryPhone.trim() || !customerDeliveryAddress.trim()) {
      toast.error("Please fill in all delivery information fields.");
      return;
    }

    if (!isStoreEnabled) {
      toast.error(getFeatureDisabledMessage(config?.featureToggles, "store"));
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

  // Search & Category Filtered Products
  const filteredItems = items.filter((item) => {
    const itemCat = (item.category || "").trim().toLowerCase();
    const targetCat = (activeCategory || "ALL").trim().toLowerCase();
    const matchesCategory = targetCat === "all" || itemCat === targetCat;
    const query = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !query ||
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      itemCat.includes(query);

    return matchesCategory && matchesQuery;
  });

  return (
    <RouteGuard>
      <div id="store-page-root" className="min-h-dvh bg-background text-on-background pb-20">
        {/* Sticky App Top Bar */}
        <StoreHeader
          settings={settings}
          wishlistCount={wishlist.length}
          cartCount={totalCartItems}
          orderCount={myOrders.length}
          onClearCache={handleClearStoreCache}
          onOpenWishlist={() => {
            setWishlist(getSavedWishlist());
            setIsWishlistModalOpen(true);
          }}
          onOpenMyOrders={() => {
            fetchMyOrders();
            setIsMyOrdersOpen(true);
          }}
          onOpenCart={() => setIsCartOpen(true)}
        />

        <main className="max-w-md mx-auto pt-3 px-margin-mobile flex-grow pb-16 text-black">
          {/* Robust Dynamic Store Slideshow */}
          <BannerSlideshow
            page="store"
            fallbackSlides={slides.map((s) => ({
              id: s.id,
              imageUrl: s.imageUrl,
              title: s.title,
              description: s.subtitle,
              targetPage: "store" as const,
              link: s.link,
              customWidth: s.customWidth,
              customHeight: s.customHeight,
              mobileHeight: s.mobileHeight,
              desktopHeight: s.desktopHeight,
              marginBottom: s.marginBottom,
              isCrop: s.isCrop,
              isHidden: s.isHidden,
            }))}
          />

          {/* Feature Disabled Banner */}
          {!isStoreEnabled && (
            <FeatureDisabledBanner
              title="E-Tech Store Unavailable"
              message={getFeatureDisabledMessage(config?.featureToggles, "store")}
            />
          )}

          {/* Search Input Bar with Gradient Border */}
          <StoreSearchBar
            searchQuery={searchQuery}
            settings={settings}
            onClick={() => {
              setSearchModalQuery(searchQuery);
              setSearchModalCategory(activeCategory);
              setVisibleSearchLimit(20);
              setIsSearchModalOpen(true);
            }}
            onClearQuery={(e) => {
              e.stopPropagation();
              setSearchQuery("");
            }}
          />

          {/* Category Filter Chips */}
          <StoreCategoryChips
            categories={categories}
            activeCategory={activeCategory}
            onSelectCategory={(catName) => setActiveCategory(catName)}
          />

          {/* Recently Viewed Horizontal Ribbon */}
          <StoreRecentlyViewedSection
            recentlyViewed={recentlyViewed}
            settings={settings}
            onOpenProductPage={handleOpenProductPage}
            onOpenViewAll={() => {
              setVisibleRecentlyViewedLimit(10);
              setIsAllRecentlyViewedOpen(true);
            }}
            onClearRecentlyViewed={() => {
              setRecentlyViewed([]);
              if (typeof window !== "undefined") localStorage.removeItem("e_tech_recently_viewed");
            }}
          />

          {/* Products Grid */}
          <StoreProductGrid
            items={filteredItems}
            isLoading={isLoading}
            searchQuery={searchQuery}
            settings={settings}
            wishlist={wishlist}
            navigatingProductId={navigatingProductId}
            onOpenProductPage={handleOpenProductPage}
            onToggleWishlist={handleToggleWishlistProduct}
            onAddToCart={handleAddToCart}
            onBuyNow={(e, item) => {
              e.stopPropagation();
              handleAddToCart(item, 1);
              setIsCartOpen(true);
            }}
          />
        </main>

        {/* Floating Cart Badge Button (Mobile) */}
        {totalCartItems > 0 && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="fixed bottom-24 right-4 z-[90] px-4 py-3 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white rounded-full shadow-lg border-0 flex items-center gap-2.5 active:scale-95 transition-all cursor-pointer"
          >
            <div className="relative">
              <span className="material-symbols-outlined text-[22px]">shopping_bag</span>
              <span className="absolute -top-1 -right-2.5 bg-black text-white text-[9px] font-black px-1.5 py-0.2 rounded-full border-0">
                {totalCartItems}
              </span>
            </div>
            <span className="font-hanken font-black text-xs uppercase tracking-wider">
              ₦{cartSubtotal.toLocaleString()}
            </span>
          </motion.button>
        )}

        {/* Wishlist Full Screen Modal */}
        <StoreWishlistModal
          isOpen={isWishlistModalOpen}
          wishlist={wishlist}
          onClose={() => setIsWishlistModalOpen(false)}
          onOpenProductPage={handleOpenProductPage}
          onToggleWishlistProduct={handleToggleWishlistProduct}
          onAddToCart={handleAddToCart}
        />

        {/* Shopping Cart & Checkout Modal */}
        <StoreCartModal
          isOpen={isCartOpen}
          cart={cart}
          totalCartItems={totalCartItems}
          cartSubtotal={cartSubtotal}
          isCheckoutStep={isCheckoutStep}
          selectedPaymentMethod={selectedPaymentMethod}
          customerDeliveryName={customerDeliveryName}
          customerDeliveryPhone={customerDeliveryPhone}
          customerDeliveryAddress={customerDeliveryAddress}
          isPlacingOrder={isPlacingOrder}
          hideCardPayment={settings.hideCardPayment}
          enablePickup={settings.enablePickup}
          userBalance={userData?.balance ?? 0}
          onClose={() => setIsCartOpen(false)}
          onUpdateCartQuantity={handleUpdateCartQuantity}
          onRemoveFromCart={handleRemoveFromCart}
          onClearCart={() => updateCart([])}
          onSetSelectedPaymentMethod={(m) => setSelectedPaymentMethod(m)}
          onSetIsCheckoutStep={(val) => setIsCheckoutStep(val)}
          onSetCustomerDeliveryName={(val) => setCustomerDeliveryName(val)}
          onSetCustomerDeliveryPhone={(val) => setCustomerDeliveryPhone(val)}
          onSetCustomerDeliveryAddress={(val) => setCustomerDeliveryAddress(val)}
          onConfirmCheckout={handleConfirmCheckout}
        />

        {/* Order History Modal */}
        <StoreOrderHistoryModal
          isOpen={isMyOrdersOpen}
          myOrders={myOrders}
          isLoadingMyOrders={isLoadingMyOrders}
          onClose={() => setIsMyOrdersOpen(false)}
        />

        {/* Recently Viewed Modal */}
        <StoreRecentlyViewedModal
          isOpen={isAllRecentlyViewedOpen}
          recentlyViewed={recentlyViewed}
          visibleLimit={visibleRecentlyViewedLimit}
          settings={settings}
          onClose={() => setIsAllRecentlyViewedOpen(false)}
          onOpenProductPage={handleOpenProductPage}
          onClearAllHistory={() => {
            setRecentlyViewed([]);
            if (typeof window !== "undefined") localStorage.removeItem("e_tech_recently_viewed");
            setIsAllRecentlyViewedOpen(false);
          }}
          onLoadMore={() => setVisibleRecentlyViewedLimit((prev) => prev + 10)}
        />

        {/* Search Modal */}
        <StoreSearchModal
          isOpen={isSearchModalOpen}
          searchModalQuery={searchModalQuery}
          searchModalCategory={searchModalCategory}
          categories={categories}
          items={items}
          visibleSearchLimit={visibleSearchLimit}
          onClose={() => {
            setSearchQuery(searchModalQuery);
            setActiveCategory(searchModalCategory);
            setIsSearchModalOpen(false);
          }}
          onSearchModalQueryChange={(q) => {
            setSearchModalQuery(q);
            setVisibleSearchLimit(20);
          }}
          onSearchModalCategoryChange={(cat) => {
            setSearchModalCategory(cat);
            setVisibleSearchLimit(20);
          }}
          onLoadMore={() => setVisibleSearchLimit((prev) => prev + 20)}
          onOpenProductPage={handleOpenProductPage}
        />

        {/* Order Confirmation Modal */}
        <StoreConfirmedOrderModal
          confirmedOrder={confirmedOrder}
          onClose={() => setConfirmedOrder(null)}
        />

        {/* Store Payment PIN / Biometric Authorization Modal */}
        <InvestmentPinModal
          isOpen={isStorePinModalOpen}
          onClose={() => setIsStorePinModalOpen(false)}
          title="Authorize Store Purchase"
          description={`Approving ₦${cartSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} store order.`}
          isSubmitting={isPlacingOrder}
          onPinSubmit={(pin, isBiometricAuthenticated) => executeStoreOrder(pin, isBiometricAuthenticated)}
        />

        <BottomNav />
      </div>
    </RouteGuard>
  );
}
