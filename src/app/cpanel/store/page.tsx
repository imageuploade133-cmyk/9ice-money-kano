"use client";
import React, { useState, useEffect } from "react";
import { CpanelActionDropdown } from "@/components/cpanel/CpanelActionDropdown";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";
import { uploadImageSecurely } from "@/lib/image-upload";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";

interface StoreItem {
  id: string;
  title: string;
  description: string;
  price: number;
  costPrice?: number | null;
  discountPrice?: number | null;
  category: string;
  imageUrl: string;
  images?: string[];
  coverImageUrl?: string;
  videoUrl?: string;
  autoSlide?: boolean;
  inStock: boolean;
  stockQuantity?: number | null;
  unlimitedStock?: boolean;
  createdAt: string;
}

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

function CpanelStorePageContent() {
  const router = useRouter();
  const { isDark, toggleTheme } = useCpanelTheme();
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Data states
  const [items, setItems] = useState<StoreItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter state for CPanel
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "IN_STOCK" | "OUT_OF_STOCK" | "HIDDEN">("ALL");

  // Interactive Card Image Carousel Indexes
  const [cardImageIndexes, setCardImageIndexes] = useState<Record<string, number>>({});

  // Visibility Toggling ID
  const [isTogglingVisibilityId, setIsTogglingVisibilityId] = useState<string | null>(null);

  // Item Form & Edit Modal state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemTitle, setItemTitle] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemCostPrice, setItemCostPrice] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemDiscountPrice, setItemDiscountPrice] = useState("");
  const [itemCategory, setItemCategory] = useState("Hardware");
  const [itemImages, setItemImages] = useState<string[]>([]);
  const [itemCoverUrl, setItemCoverUrl] = useState("");
  const [itemVideoUrl, setItemVideoUrl] = useState("");
  const [itemAutoSlide, setItemAutoSlide] = useState(true);
  const [itemInStock, setItemInStock] = useState(true);
  const [itemStockQuantity, setItemStockQuantity] = useState<string>("");
  const [itemUnlimitedStock, setItemUnlimitedStock] = useState(true);
  const [itemIsHidden, setItemIsHidden] = useState(false);
  const [newImageInput, setNewImageInput] = useState("");
  const [isUploadingItemImage, setIsUploadingItemImage] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);

  // Deleting item ID
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  // Theme Syncing

  // Auth & Session Check
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

  // Fetch Store Data & Dynamic Categories
  const fetchStoreData = async () => {
    setIsLoading(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};

      const [storeRes, catRes] = await Promise.all([
        fetch("/api/admin/store", { headers }),
        fetch("/api/admin/store/categories", { headers })
      ]);

      const data = await storeRes.json();
      const catData = await catRes.json();

      if (data.success) {
        setItems(data.items || []);
      } else {
        toast.error(data.error || "Failed to load store data.");
      }

      if (catData.success && Array.isArray(catData.categories)) {
        setCategories(catData.categories);
      }
    } catch (err: any) {
      toast.error(err.message || "Network error fetching store data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoadingSession) {
      fetchStoreData();
    }
  }, [isLoadingSession]);

  // Upload file to ImgBB helper
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

  const getDefaultCategoryName = () => {
    const validCat = categories.find((c) => c && c.name && c.name !== "ALL");
    return validCat ? validCat.name : "Electronics";
  };

  const resetItemForm = () => {
    setEditingItemId(null);
    setItemTitle("");
    setItemDescription("");
    setItemCostPrice("");
    setItemPrice("");
    setItemDiscountPrice("");
    setItemCategory(getDefaultCategoryName());
    setItemImages([]);
    setItemCoverUrl("");
    setItemVideoUrl("");
    setItemAutoSlide(true);
    setItemInStock(true);
    setItemStockQuantity("");
    setItemUnlimitedStock(true);
    setItemIsHidden(false);
    setNewImageInput("");
  };

  const handleStartEditItem = (item: StoreItem) => {
    setEditingItemId(item.id);
    setItemTitle(item.title || "");
    setItemDescription(item.description || "");
    setItemCostPrice(item.costPrice !== null && item.costPrice !== undefined ? item.costPrice.toString() : "");
    setItemPrice(item.price ? item.price.toString() : "");
    setItemDiscountPrice(item.discountPrice !== null && item.discountPrice !== undefined ? item.discountPrice.toString() : "");
    setItemCategory(item.category || getDefaultCategoryName());
    const existingImgs = Array.isArray(item.images) && item.images.length > 0 ? item.images : (item.imageUrl ? [item.imageUrl] : []);
    setItemImages(existingImgs);
    setItemCoverUrl(item.coverImageUrl || item.imageUrl || existingImgs[0] || "");
    setItemVideoUrl(item.videoUrl || "");
    setItemAutoSlide(item.autoSlide !== false);
    setItemInStock(item.inStock !== false);
    setItemStockQuantity(item.stockQuantity !== null && item.stockQuantity !== undefined ? item.stockQuantity.toString() : "");
    setItemUnlimitedStock(item.unlimitedStock !== false && (item.stockQuantity === null || item.stockQuantity === undefined));
    setNewImageInput("");
    setIsProductModalOpen(true);
  };

  const handleToggleVisibility = async (itemId: string) => {
    setIsTogglingVisibilityId(itemId);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const res = await fetch("/api/admin/store", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "toggle_item_visibility",
          itemId,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Product visibility updated!");
        setItems(data.items || []);
      } else {
        toast.error(data.error || "Failed to update product visibility.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error updating visibility.");
    } finally {
      setIsTogglingVisibilityId(null);
    }
  };

  const handleOpenAddModal = () => {
    resetItemForm();
    setIsProductModalOpen(true);
  };

  const handleAddImageToProduct = (urlToAdd: string) => {
    const trimmed = urlToAdd.trim();
    if (!trimmed) return;
    if (itemImages.includes(trimmed)) {
      toast.info("Image URL already added.");
      return;
    }
    const updated = [...itemImages, trimmed];
    setItemImages(updated);
    if (!itemCoverUrl) setItemCoverUrl(trimmed);
    setNewImageInput("");
    toast.success("Image added to product list!");
  };

  const handleRemoveImageFromProduct = (index: number) => {
    const removedUrl = itemImages[index];
    const updated = itemImages.filter((_, i) => i !== index);
    setItemImages(updated);
    if (itemCoverUrl === removedUrl) {
      setItemCoverUrl(updated[0] || "");
    }
  };

  // Add or Edit Item Submit
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemTitle.trim()) {
      toast.error("Item title is required.");
      return;
    }

    setIsSavingItem(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const action = editingItemId ? "edit_item" : "add_item";
      const primaryCover = itemCoverUrl || itemImages[0] || "";

      const res = await fetch("/api/admin/store", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action,
          item: {
            id: editingItemId || undefined,
            title: itemTitle,
            description: itemDescription,
            costPrice: itemCostPrice !== "" ? parseFloat(itemCostPrice) : null,
            price: parseFloat(itemPrice) || 0,
            discountPrice: itemDiscountPrice !== "" ? parseFloat(itemDiscountPrice) : null,
            category: itemCategory,
            imageUrl: primaryCover,
            images: itemImages.length > 0 ? itemImages : (primaryCover ? [primaryCover] : []),
            coverImageUrl: primaryCover,
            videoUrl: itemVideoUrl,
            autoSlide: itemAutoSlide,
            inStock: itemInStock,
            stockQuantity: itemUnlimitedStock ? null : (itemStockQuantity !== "" ? parseInt(itemStockQuantity) : null),
            unlimitedStock: itemUnlimitedStock,
            isHidden: itemIsHidden,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(editingItemId ? "Store item updated successfully!" : "Store item added successfully!");
        setItems(data.items || []);
        setIsProductModalOpen(false);
        resetItemForm();
      } else {
        toast.error(data.error || "Failed to save store item.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error saving store item.");
    } finally {
      setIsSavingItem(false);
    }
  };

  // Delete Item with Confirmation Modal
  const handleDeleteItem = async (itemId: string) => {
    const targetItem = items.find((i) => i.id === itemId);
    const itemTitle = targetItem ? targetItem.title.toUpperCase() : "THIS PRODUCT";

    triggerConfirm(
      "Delete Store Product?",
      `Are you sure you want to permanently delete product "${itemTitle}" from your store?`,
      "Delete Product",
      "danger",
      async () => {
        setDeletingId(itemId);
        try {
          const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
          const headers: Record<string, string> = isMock
            ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
            : { "Content-Type": "application/json" };

          const res = await fetch("/api/admin/store", {
            method: "POST",
            headers,
            body: JSON.stringify({
              action: "delete_item",
              itemId,
            }),
          });

          const data = await res.json();
          if (res.ok && data.success) {
            toast.success("Store item deleted.");
            setItems(data.items || []);
          } else {
            toast.error(data.error || "Failed to delete item.");
          }
        } catch (err: any) {
          toast.error(err.message || "Network error deleting item.");
        } finally {
          setDeletingId(null);
        }
      }
    );
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

        {/* Sticky Top Header Bar */}
        <div className={cn("sticky top-0 z-30 p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md shadow-xs", panelClass)}>
          <div className="flex items-center gap-3">
            <Link
              href="/cpanel"
              className={cn("w-10 h-10 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-[22px]">inventory_2</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Store Products Manager</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Add, update, or remove product catalog items for end-users on your digital store.
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
              href="/cpanel"
              className="px-4 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">dashboard</span>
              <span>Control Panel</span>
            </Link>
          </div>
        </div>

        {/* Top Metrics Summary Bar: Total Products, Catalog Value, Potential Profit if Sold */}
        {(() => {
          const totalProductsCount = items.length;
          const totalValue = items.reduce((sum, i) => {
            const price = i.discountPrice || i.price || 0;
            const qty = i.unlimitedStock ? 1 : (i.stockQuantity || 1);
            return sum + (price * qty);
          }, 0);

          const totalCost = items.reduce((sum, i) => {
            const cost = i.costPrice || 0;
            const qty = i.unlimitedStock ? 1 : (i.stockQuantity || 1);
            return sum + (cost * qty);
          }, 0);

          const totalPotentialProfit = Math.max(0, totalValue - totalCost);

          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              <div className={cn("p-4 rounded-2xl border space-y-1", panelClass)}>
                <div className="flex items-center justify-between text-gray-400">
                  <span className="text-[10px] font-black uppercase tracking-wider">Total Products</span>
                  <span className="material-symbols-outlined text-[18px] text-[#FC7A00]">inventory_2</span>
                </div>
                <p className="font-mono text-xl font-black">{totalProductsCount}</p>
              </div>

              <div className={cn("p-4 rounded-2xl border space-y-1", panelClass)}>
                <div className="flex items-center justify-between text-gray-400">
                  <span className="text-[10px] font-black uppercase tracking-wider">Catalog Selling Value</span>
                  <span className="material-symbols-outlined text-[18px] text-emerald-500">payments</span>
                </div>
                <p className="font-mono text-xl font-black text-emerald-600">₦{totalValue.toLocaleString()}</p>
              </div>

              <div className={cn("p-4 rounded-2xl border space-y-1", panelClass)}>
                <div className="flex items-center justify-between text-gray-400">
                  <span className="text-[10px] font-black uppercase tracking-wider">Wholesale Cost Value</span>
                  <span className="material-symbols-outlined text-[18px] text-amber-500">shopping_bag</span>
                </div>
                <p className="font-mono text-xl font-black text-amber-600">₦{totalCost.toLocaleString()}</p>
              </div>

              <div className={cn("p-4 rounded-2xl border space-y-1 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5", panelClass)}>
                <div className="flex items-center justify-between text-emerald-600">
                  <span className="text-[10px] font-black uppercase tracking-wider">Potential Profit If Sold</span>
                  <span className="material-symbols-outlined text-[18px]">trending_up</span>
                </div>
                <p className="font-mono text-xl font-black text-emerald-600">+₦{totalPotentialProfit.toLocaleString()}</p>
              </div>
            </div>
          );
        })()}

        {/* Store Items Grid & Powerful Search + Filters */}
        <div className="space-y-4">
          <div className={cn("p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4", panelClass)}>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">inventory_2</span>
              <h3 className="font-extrabold text-sm uppercase">Products Directory ({items.length})</h3>
            </div>

            {/* Powerful Search Bar */}
            <div className="relative flex-1 max-w-md">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Search products by title, category, description, ID..."
                value={adminSearchQuery}
                onChange={(e) => setAdminSearchQuery(e.target.value)}
                className={cn("pl-9 pr-8 h-10 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
              />
              {adminSearchQuery && (
                <button
                  type="button"
                  onClick={() => setAdminSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black border-0"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleOpenAddModal}
              className="px-4 py-2.5 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-sm flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Add Product</span>
            </button>
          </div>

          {/* Status Filter Tabs (ALL, IN STOCK, OUT OF STOCK, HIDDEN) */}
          {(() => {
            const inStockCount = items.filter((i: any) => i.inStock && !i.isHidden).length;
            const outOfStockCount = items.filter((i: any) => !i.inStock && !i.isHidden).length;
            const hiddenCount = items.filter((i: any) => Boolean(i.isHidden)).length;

            return (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 select-none">
                <button
                  type="button"
                  onClick={() => setStatusFilter("ALL")}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer border",
                    statusFilter === "ALL"
                      ? "bg-[#FC7A00] text-white border-[#FC7A00] shadow-2xs"
                      : isDark ? "bg-gray-900 border-gray-800 text-gray-400" : "bg-white border-gray-200 text-gray-600"
                  )}
                >
                  All Products ({items.length})
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter("IN_STOCK")}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer border",
                    statusFilter === "IN_STOCK"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                      : isDark ? "bg-gray-900 border-gray-800 text-emerald-500" : "bg-white border-gray-200 text-emerald-600"
                  )}
                >
                  In Stock ({inStockCount})
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter("OUT_OF_STOCK")}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer border",
                    statusFilter === "OUT_OF_STOCK"
                      ? "bg-red-600 text-white border-red-600 shadow-2xs"
                      : isDark ? "bg-gray-900 border-gray-800 text-red-500" : "bg-white border-gray-200 text-red-600"
                  )}
                >
                  Out of Stock ({outOfStockCount})
                </button>

                <button
                  type="button"
                  onClick={() => setStatusFilter("HIDDEN")}
                  className={cn(
                    "px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer border",
                    statusFilter === "HIDDEN"
                      ? "bg-purple-600 text-white border-purple-600 shadow-2xs"
                      : isDark ? "bg-gray-900 border-gray-800 text-purple-400" : "bg-white border-gray-200 text-purple-700"
                  )}
                >
                  Hidden ({hiddenCount})
                </button>
              </div>
            );
          })()}

          {/* Filtered Items Grid */}
          <div className="w-full">
            {(() => {
              const q = adminSearchQuery.toLowerCase().trim();
              const filteredList = items.filter((item: any) => {
                const matchesSearch =
                  !q ||
                  item.title.toLowerCase().includes(q) ||
                  item.category.toLowerCase().includes(q) ||
                  item.description.toLowerCase().includes(q) ||
                  item.id.toLowerCase().includes(q);

                let matchesStatus = true;
                if (statusFilter === "IN_STOCK") matchesStatus = Boolean(item.inStock && !item.isHidden);
                if (statusFilter === "OUT_OF_STOCK") matchesStatus = Boolean(!item.inStock && !item.isHidden);
                if (statusFilter === "HIDDEN") matchesStatus = Boolean(item.isHidden);

                return matchesSearch && matchesStatus;
              });

              if (isLoading) {
                return (
                  <div className={cn("p-12 rounded-2xl border text-center flex flex-col items-center justify-center gap-3", panelClass)}>
                    <ButtonSpinner />
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Loading Storefront Products...</p>
                  </div>
                );
              }

              if (filteredList.length === 0) {
                return (
                  <div className={cn("p-12 rounded-2xl border text-center space-y-3", panelClass)}>
                    <span className="material-symbols-outlined text-[48px] text-gray-400">inventory_2</span>
                    <p className="text-xs font-black uppercase text-gray-400">No Matching Store Products</p>
                    <p className="text-[11px] text-gray-500 max-w-md mx-auto">
                      {adminSearchQuery
                        ? `No products matched search query "${adminSearchQuery}".`
                        : "No products match the selected status filter."}
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredList.map((item: any) => {
                    const isDeleting = deletingId === item.id;
                    const isTogglingVisibility = isTogglingVisibilityId === item.id;
                    const galleryImages = Array.isArray(item.images) && item.images.length > 0 ? item.images : (item.imageUrl ? [item.imageUrl] : []);
                    const activeImageIdx = cardImageIndexes[item.id] || 0;
                    const currentCardImage = galleryImages[activeImageIdx] || galleryImages[0] || item.imageUrl || "";

                    const sellPrice = item.discountPrice || item.price || 0;
                    const costPrice = item.costPrice || 0;
                    const unitProfit = sellPrice - costPrice;
                    const isProfitable = unitProfit > 0;
                    const unitProfitPct = costPrice > 0 ? Math.round((unitProfit / costPrice) * 100) : 0;
                    const stockQuantity = !item.unlimitedStock && typeof item.stockQuantity === "number" ? item.stockQuantity : 1;
                    const totalCardProfit = unitProfit * stockQuantity;

                    return (
                      <div key={item.id} className={cn("p-4 rounded-2xl border flex flex-col justify-between space-y-3 transition-all relative", panelClass)}>
                        <div className="space-y-3">
                          {/* Image Carousel Card Header */}
                          <div className="w-full h-44 rounded-xl border border-gray-200/50 bg-white overflow-hidden relative flex items-center justify-center group select-none">
                            {currentCardImage ? (
                              <img src={currentCardImage} alt={item.title} className="w-full h-full object-contain p-2" />
                            ) : (
                              <span className="material-symbols-outlined text-[48px] text-gray-300">storefront</span>
                            )}

                            {/* Image Slide Prev / Next Overlay Buttons */}
                            {galleryImages.length > 1 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCardImageIndexes((prev) => ({
                                      ...prev,
                                      [item.id]: (activeImageIdx - 1 + galleryImages.length) % galleryImages.length,
                                    }));
                                  }}
                                  className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center shadow-md cursor-pointer transition-transform active:scale-90 border-0"
                                  title="Previous Image"
                                >
                                  <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setCardImageIndexes((prev) => ({
                                      ...prev,
                                      [item.id]: (activeImageIdx + 1) % galleryImages.length,
                                    }));
                                  }}
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center shadow-md cursor-pointer transition-transform active:scale-90 border-0"
                                  title="Next Image"
                                >
                                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                                </button>

                                {/* Gallery Slide Counter Dots */}
                                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/70 text-white text-[8px] font-mono font-bold backdrop-blur-xs">
                                  {activeImageIdx + 1} / {galleryImages.length}
                                </div>
                              </>
                            )}

                            {/* Category Badge */}
                            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase bg-black/75 text-white backdrop-blur-xs">
                              {item.category}
                            </span>

                            {/* Hidden Status Tag */}
                            {item.isHidden && (
                              <span className="absolute top-2 right-2 px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase bg-purple-600 text-white shadow-xs">
                                HIDDEN FROM STORE
                              </span>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-extrabold text-xs uppercase tracking-tight truncate">{item.title}</h4>
                              <div className="text-right">
                                {item.discountPrice ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[10px] text-gray-400 line-through">₦{item.price.toLocaleString()}</span>
                                    <span className="font-mono font-black text-sm text-emerald-600">₦{item.discountPrice.toLocaleString()}</span>
                                  </div>
                                ) : (
                                  <span className="font-mono font-black text-sm text-[#FC7A00]">₦{item.price.toLocaleString()}</span>
                                )}
                              </div>
                            </div>

                            <p className="text-[10.5px] text-gray-400 font-medium line-clamp-2 mt-1 leading-relaxed">
                              {item.description || "No description provided."}
                            </p>
                          </div>

                          {/* Profit & Unit Margin Summary Banner */}
                          <div className="p-2.5 rounded-xl border border-gray-200/50 bg-gray-50/70 dark:bg-gray-900/60 grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="text-[9px] font-extrabold text-gray-400 uppercase block">Wholesale Cost:</span>
                              <span className="font-mono font-bold text-gray-700 dark:text-gray-300">
                                {item.costPrice ? `₦${Number(item.costPrice).toLocaleString()}` : "Not Set"}
                              </span>
                            </div>

                            <div className="text-right">
                              <span className="text-[9px] font-extrabold text-emerald-600 uppercase block">Profit / Unit:</span>
                              <span className={cn("font-mono font-black", isProfitable ? "text-emerald-600" : "text-gray-500")}>
                                {isProfitable ? `+₦${unitProfit.toLocaleString()} (${unitProfitPct}%)` : "₦0"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-gray-200/40">
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider border",
                              item.inStock ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
                            )}>
                              {item.inStock ? (item.unlimitedStock ? "IN STOCK" : `${item.stockQuantity} UNITS`) : "OUT OF STOCK"}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Hide / Unhide Store Visibility Quick Button */}
                            <button
                              type="button"
                              disabled={isTogglingVisibility}
                              onClick={() => handleToggleVisibility(item.id)}
                              className={cn(
                                "px-2 py-1 rounded-lg text-[9.5px] font-extrabold uppercase tracking-wider border flex items-center gap-1 cursor-pointer transition-all",
                                item.isHidden
                                  ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:border-purple-800 dark:text-purple-300"
                                  : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
                              )}
                              title={item.isHidden ? "Unhide from public store" : "Hide from public store"}
                            >
                              {isTogglingVisibility ? (
                                <ButtonSpinner />
                              ) : (
                                <span className="material-symbols-outlined text-[14px]">
                                  {item.isHidden ? "visibility_off" : "visibility"}
                                </span>
                              )}
                              <span>{item.isHidden ? "Hidden" : "Visible"}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleStartEditItem(item)}
                              className="text-[10px] font-bold text-[#FC7A00] hover:underline uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[14px]">edit</span>
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => handleDeleteItem(item.id)}
                              className="text-[10px] font-bold text-red-500 hover:underline uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                            >
                              {isDeleting ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[14px]">delete</span>}
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

      </div>

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
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

      {/* Standalone Product Add/Edit Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
          <div className={cn("w-[94vw] sm:w-full max-w-xl p-4 sm:p-6 rounded-3xl border shadow-2xl space-y-4 my-auto max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col justify-between", panelClass)}>
            <div className="flex items-center justify-between border-b border-gray-200/40 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">
                  {editingItemId ? "edit_note" : "add_box"}
                </span>
                <h3 className="font-extrabold text-sm uppercase tracking-wider">
                  {editingItemId ? "Edit Product" : "Add Store Product"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsProductModalOpen(false);
                  resetItemForm();
                }}
                className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-400 hover:text-black dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4 text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Product Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. E-Tech POS Terminal V2"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                />
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase text-gray-400 block">Category</label>
                    <Link href="/cpanel/store/categories" className="text-[9.5px] font-bold text-[#FC7A00] hover:underline">
                      + Manage Categories
                    </Link>
                  </div>
                  <select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value)}
                    className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border cursor-pointer w-full", inputClass)}
                  >
                    {categories.length > 0 ? (
                      categories.filter((c) => c.name !== "ALL").map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="Electronics">Electronics</option>
                        <option value="Fashion">Fashion</option>
                        <option value="Airtime & Utilities">Airtime & Utilities</option>
                        <option value="Gift Cards">Gift Cards</option>
                        <option value="Gadgets & Phones">Gadgets & Phones</option>
                        <option value="General">General</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400 block">Cost Price (₦)</label>
                    <input
                      type="number"
                      placeholder="Wholesale cost"
                      value={itemCostPrice}
                      onChange={(e) => setItemCostPrice(e.target.value)}
                      className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-[#FC7A00] block">Selling Price (₦) *</label>
                    <input
                      type="number"
                      required
                      placeholder="Standard price"
                      value={itemPrice}
                      onChange={(e) => setItemPrice(e.target.value)}
                      className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-emerald-500 block">Discount Price (₦)</label>
                    <input
                      type="number"
                      placeholder="Sale price"
                      value={itemDiscountPrice}
                      onChange={(e) => setItemDiscountPrice(e.target.value)}
                      className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                    />
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase text-[#FC7A00]">Inventory & Stock Control</span>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={itemUnlimitedStock}
                      onChange={(e) => {
                        setItemUnlimitedStock(e.target.checked);
                        if (e.target.checked) setItemStockQuantity("");
                      }}
                      className="w-4 h-4 text-[#FC7A00] rounded"
                    />
                    <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">Unlimited Stock (No Quantity Cap)</span>
                  </label>
                </div>

                {!itemUnlimitedStock && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-gray-400 block">Available Units / Stock Count</label>
                    <input
                      type="number"
                      min={0}
                      required={!itemUnlimitedStock}
                      placeholder="e.g. 50"
                      value={itemStockQuantity}
                      onChange={(e) => setItemStockQuantity(e.target.value)}
                      className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                    />
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-2xl border border-gray-200/50 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between">
                <div>
                  <span className="text-xs font-extrabold uppercase text-purple-600 dark:text-purple-400 block">Product Visibility</span>
                  <span className="text-[10px] text-gray-400 font-medium block">Hide or unhide this product from public storefront</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={itemIsHidden}
                    onChange={(e) => setItemIsHidden(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded"
                  />
                  <span className="text-[11px] font-extrabold text-purple-700 dark:text-purple-300">Hide Product</span>
                </label>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 block">
                  Product Images ({itemImages.length})
                </label>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Paste image URL (https://...)"
                    value={newImageInput}
                    onChange={(e) => setNewImageInput(e.target.value)}
                    className={cn("flex-1 h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all truncate", inputClass)}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddImageToProduct(newImageInput)}
                    className="px-3 h-10 bg-gray-100 dark:bg-gray-800 hover:bg-[#FC7A00] hover:text-white rounded-xl text-xs font-bold uppercase transition-all cursor-pointer"
                  >
                    + Add
                  </button>
                  <div className="relative flex-shrink-0">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          uploadImageToImgBB(file, (uploadedUrl) => {
                            handleAddImageToProduct(uploadedUrl);
                          }, setIsUploadingItemImage);
                        }
                      }}
                      disabled={isUploadingItemImage}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                    />
                    <button
                      type="button"
                      disabled={isUploadingItemImage}
                      className={cn("w-10 h-10 border rounded-xl flex items-center justify-center transition-all cursor-pointer", isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-100 border-gray-200 text-gray-700")}
                    >
                      {isUploadingItemImage ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">upload</span>}
                    </button>
                  </div>
                </div>

                {itemImages.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pt-1">
                    {itemImages.map((imgUrl, idx) => {
                      const isCover = itemCoverUrl === imgUrl || (!itemCoverUrl && idx === 0);
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "relative h-20 rounded-2xl border overflow-hidden bg-white shadow-2xs flex items-center justify-center p-1 transition-all",
                            isCover ? "border-[#FC7A00] ring-2 ring-[#FC7A00]/30 bg-orange-50/20" : "border-gray-200"
                          )}
                        >
                          <img src={imgUrl} alt={`Thumbnail ${idx}`} className="w-full h-full object-contain rounded-xl" />

                          {/* Cover Badge or Set Cover Button */}
                          {isCover ? (
                            <span className="absolute top-1 left-1 px-2 py-0.5 rounded-lg text-[7.5px] font-black uppercase bg-[#FC7A00] text-white shadow-2xs z-10">
                              COVER
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setItemCoverUrl(imgUrl)}
                              className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-lg text-[7.5px] font-extrabold uppercase bg-black/75 hover:bg-[#FC7A00] text-white backdrop-blur-xs transition-colors cursor-pointer z-10 border-0"
                              title="Set as Cover Image"
                            >
                              Make Cover
                            </button>
                          )}

                          {/* Always Visible Remove Button (Windows & iOS Touch Native) */}
                          <button
                            type="button"
                            onClick={() => handleRemoveImageFromProduct(idx)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md cursor-pointer transition-transform active:scale-90 z-20 border-0"
                            title="Remove Image"
                          >
                            <span className="material-symbols-outlined text-[13px] font-bold">close</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400 block">Description</label>
                <textarea
                  placeholder="Enter short details about this item..."
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  className={cn("w-full h-20 p-3 rounded-xl text-xs font-semibold outline-none border transition-all resize-none", inputClass)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 flex items-center gap-1 block">
                  <span className="material-symbols-outlined text-[15px]">smart_display</span>
                  <span>Product Video URL (Optional - YouTube, TikTok, Vimeo, or MP4)</span>
                </label>
                <input
                  type="url"
                  placeholder="e.g. https://www.youtube.com/watch?v=... or https://www.tiktok.com/@user/video/..."
                  value={itemVideoUrl}
                  onChange={(e) => setItemVideoUrl(e.target.value)}
                  className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-200/40">
                <button
                  type="button"
                  onClick={() => {
                    setIsProductModalOpen(false);
                    resetItemForm();
                  }}
                  className="px-4 h-10 bg-gray-200 dark:bg-gray-800 text-xs font-bold uppercase rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingItem || isUploadingItemImage}
                  className="px-6 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingItem ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">{editingItemId ? "save" : "add"}</span>}
                  <span>{editingItemId ? "Save Product Changes" : "Add Product"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CpanelStorePage() {
  return (
    <CpanelRouteGuard requiredPermission="store.view">
      <CpanelStorePageContent />
    </CpanelRouteGuard>
  );
}