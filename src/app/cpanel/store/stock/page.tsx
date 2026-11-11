"use client";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";



import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";

interface StockItem {
  id: string;
  title: string;
  description: string;
  price: number;
  costPrice?: number | null;
  discountPrice?: number | null;
  category: string;
  imageUrl: string;
  inStock: boolean;
  stockQuantity?: number | null;
  unlimitedStock?: boolean;
  resolvedCostPrice: number;
  resolvedSellingPrice: number;
  unitProfit: number;
  totalEstimatedProfit: number | null;
  isOut: boolean;
  isLow: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface StockSummary {
  totalProducts: number;
  availableStockUnits: number;
  unlimitedCount: number;
  totalCostValue: number;
  potentialRevenue: number;
  potentialProfit: number;
  outOfStockCount: number;
  lowStockCount: number;
}

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

function CpanelStockIncomePageContent() {
  const router = useRouter();
  const { isDark, toggleTheme } = useCpanelTheme();
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  const [summary, setSummary] = useState<StockSummary>({
    totalProducts: 0,
    availableStockUnits: 0,
    unlimitedCount: 0,
    totalCostValue: 0,
    potentialRevenue: 0,
    potentialProfit: 0,
    outOfStockCount: 0,
    lowStockCount: 0,
  });

  const [items, setItems] = useState<StockItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "available" | "low" | "out">("all");

  // Quick Restock Modal State
  const [selectedRestockItem, setSelectedRestockItem] = useState<StockItem | null>(null);
  const [newCostPrice, setNewCostPrice] = useState("");
  const [newSellingPrice, setNewSellingPrice] = useState("");
  const [newDiscountPrice, setNewDiscountPrice] = useState("");
  const [newStockQty, setNewStockQty] = useState("");
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [isInStock, setIsInStock] = useState(true);
  const [isSavingRestock, setIsSavingRestock] = useState(false);

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

  // Fetch Stock & Income Analytics Data
  const fetchStockData = async () => {
    setIsLoading(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};

      const res = await fetch("/api/admin/store/stock", { headers });
      const data = await res.json();

      if (data.success) {
        if (data.summary) setSummary(data.summary);
        if (Array.isArray(data.items)) setItems(data.items);
      } else {
        toast.error(data.error || "Failed to load stock analytics.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error loading stock analytics.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoadingSession) {
      fetchStockData();
    }
  }, [isLoadingSession]);

  const openRestockModal = (item: StockItem) => {
    setSelectedRestockItem(item);
    setNewCostPrice(item.costPrice !== null && item.costPrice !== undefined ? item.costPrice.toString() : "");
    setNewSellingPrice(item.price ? item.price.toString() : "");
    setNewDiscountPrice(item.discountPrice !== null && item.discountPrice !== undefined ? item.discountPrice.toString() : "");
    setNewStockQty(item.stockQuantity !== null && item.stockQuantity !== undefined ? item.stockQuantity.toString() : "");
    setIsUnlimited(Boolean(item.unlimitedStock));
    setIsInStock(item.inStock !== false);
  };

  const handleSaveRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRestockItem) return;

    setIsSavingRestock(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const headers: Record<string, string> = isMock
        ? { "Content-Type": "application/json", Authorization: "Bearer mock-admin-token" }
        : { "Content-Type": "application/json" };

      const res = await fetch("/api/admin/store/stock", {
        method: "POST",
        headers,
        body: JSON.stringify({
          itemId: selectedRestockItem.id,
          costPrice: newCostPrice !== "" ? parseFloat(newCostPrice) : null,
          price: parseFloat(newSellingPrice) || 0,
          discountPrice: newDiscountPrice !== "" ? parseFloat(newDiscountPrice) : null,
          stockQuantity: isUnlimited ? null : (newStockQty !== "" ? parseInt(newStockQty) : 0),
          unlimitedStock: isUnlimited,
          inStock: isInStock,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Stock levels updated successfully!");
        setSelectedRestockItem(null);
        fetchStockData();
      } else {
        toast.error(data.error || "Failed to update stock levels.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error saving stock.");
    } finally {
      setIsSavingRestock(false);
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || item.title.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (activeFilter === "available") return !item.isOut && !item.isLow;
    if (activeFilter === "low") return item.isLow;
    if (activeFilter === "out") return item.isOut;
    return true;
  });

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

        {/* Top Header */}
        <div className={cn("p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4", panelClass)}>
          <div className="flex items-center gap-3">
            <Link
              href="/cpanel/store"
              className={cn("w-10 h-10 rounded-xl border flex items-center justify-center transition-all", isDark ? "bg-gray-900 border-gray-800 text-white hover:bg-gray-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100")}
              title="Return to Storefront Manager"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-[22px]">trending_up</span>
                <h1 className="font-extrabold text-base md:text-lg uppercase tracking-tight">Stock Income & Inventory Analytics</h1>
              </div>
              <p className={cn("text-xs font-medium mt-0.5", isDark ? "text-gray-400" : "text-gray-500")}>
                Real-time breakdown of available stock units, inventory valuation cost, potential store revenue, and profit margins.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/cpanel/store/orders"
              className="px-4 h-10 bg-gradient-to-r from-orange-500 to-[#FC7A00] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
              <span>Orders</span>
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              className={cn("px-3 h-10 rounded-xl border font-bold text-xs flex items-center gap-2 transition-all cursor-pointer", isDark ? "bg-gray-900 border-gray-800 text-yellow-400" : "bg-gray-100 border-gray-200 text-gray-700")}
            >
              <span className="material-symbols-outlined text-[18px]">{isDark ? "light_mode" : "dark_mode"}</span>
              <span className="hidden sm:inline">{isDark ? "Light Mode" : "Dark Mode"}</span>
            </button>
          </div>
        </div>

        {/* Analytics Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className={cn("p-4 rounded-2xl border space-y-1.5", panelClass)}>
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Available Stock</span>
              <span className="material-symbols-outlined text-[18px] text-blue-500">inventory</span>
            </div>
            <div className="font-mono font-extrabold text-xl sm:text-2xl text-blue-600 dark:text-blue-400">
              {summary.availableStockUnits.toLocaleString()} <span className="text-xs text-gray-400">units</span>
            </div>
            <p className="text-[10px] text-gray-400 font-medium">Across {summary.totalProducts} catalog products ({summary.unlimitedCount} unlimited)</p>
          </div>

          <div className={cn("p-4 rounded-2xl border space-y-1.5", panelClass)}>
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Stock Valuation Cost</span>
              <span className="material-symbols-outlined text-[18px] text-orange-500">payments</span>
            </div>
            <div className="font-mono font-extrabold text-xl sm:text-2xl text-orange-600 dark:text-orange-400">
              ₦{summary.totalCostValue.toLocaleString()}
            </div>
            <p className="text-[10px] text-gray-400 font-medium">Total wholesale capital invested in current stock</p>
          </div>

          <div className={cn("p-4 rounded-2xl border space-y-1.5", panelClass)}>
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Potential Revenue</span>
              <span className="material-symbols-outlined text-[18px] text-purple-500">point_of_sale</span>
            </div>
            <div className="font-mono font-extrabold text-xl sm:text-2xl text-purple-600 dark:text-purple-400">
              ₦{summary.potentialRevenue.toLocaleString()}
            </div>
            <p className="text-[10px] text-gray-400 font-medium">Gross income when all available stock is sold</p>
          </div>

          <div className={cn("p-4 rounded-2xl border space-y-1.5", panelClass)}>
            <div className="flex items-center justify-between text-gray-400">
              <span className="text-[10px] font-black uppercase tracking-wider">Estimated Stock Profit</span>
              <span className="material-symbols-outlined text-[18px] text-emerald-500">show_chart</span>
            </div>
            <div className="font-mono font-extrabold text-xl sm:text-2xl text-emerald-600 dark:text-emerald-400">
              ₦{summary.potentialProfit.toLocaleString()}
            </div>
            <p className="text-[10px] text-gray-400 font-medium">Net profit margin (Revenue minus Cost)</p>
          </div>
        </div>

        {/* Filter Pills & Search Input */}
        <div className={cn("p-4 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4", panelClass)}>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full md:w-auto">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap",
                activeFilter === "all" ? "bg-[#FC7A00] text-white shadow-sm" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              )}
            >
              All Items ({summary.totalProducts})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("available")}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap",
                activeFilter === "available" ? "bg-emerald-600 text-white shadow-sm" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              )}
            >
              Available Stock
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("low")}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap",
                activeFilter === "low" ? "bg-amber-500 text-white shadow-sm" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              )}
            >
              Low Stock ({summary.lowStockCount})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("out")}
              className={cn(
                "px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap",
                activeFilter === "out" ? "bg-red-600 text-white shadow-sm" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              )}
            >
              Out of Stock ({summary.outOfStockCount})
            </button>
          </div>

          <div className="relative w-full md:w-80">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product title, category..."
              className={cn(inputClass, "pl-10 pr-4 h-10")}
            />
          </div>
        </div>

        {/* Stock Inventory Items Table */}
        <div className={cn("p-5 rounded-2xl border space-y-4", panelClass)}>
          <div className="flex items-center justify-between border-b border-gray-200/40 pb-3">
            <h3 className="font-extrabold text-xs uppercase tracking-wider">Inventory Breakdown ({filteredItems.length})</h3>
            <button
              type="button"
              onClick={fetchStockData}
              className="text-xs font-bold text-[#FC7A00] hover:underline uppercase flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              <span>Refresh Analytics</span>
            </button>
          </div>

          {isLoading ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
              <ButtonSpinner />
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Computing Stock & Income Metrics...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <span className="material-symbols-outlined text-[48px] text-gray-400">inventory</span>
              <p className="text-xs font-black uppercase text-gray-400">No stock records found for filter</p>
            </div>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200/40 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                    <th className="pb-3 pr-4">Product</th>
                    <th className="pb-3 px-3">Category</th>
                    <th className="pb-3 px-3">Stock Qty</th>
                    <th className="pb-3 px-3">Cost Price</th>
                    <th className="pb-3 px-3">Selling Price</th>
                    <th className="pb-3 px-3">Unit Profit</th>
                    <th className="pb-3 px-3">Est. Total Profit</th>
                    <th className="pb-3 pl-3 text-right">Quick Restock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/40 text-xs">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/30 transition-colors">
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl border border-gray-200/60 bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                            ) : (
                              <span className="material-symbols-outlined text-gray-300 text-[20px]">storefront</span>
                            )}
                          </div>
                          <div>
                            <h4 className="font-extrabold uppercase text-xs text-gray-900 dark:text-white line-clamp-1">{item.title}</h4>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {item.isOut ? (
                                <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-red-500/10 text-red-500 border border-red-500/20">OUT OF STOCK</span>
                              ) : item.isLow ? (
                                <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">LOW STOCK</span>
                              ) : (
                                <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">IN STOCK</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 font-semibold text-gray-500 dark:text-gray-400 uppercase text-[11px]">
                        {item.category}
                      </td>

                      <td className="py-3.5 px-3 font-mono font-extrabold text-sm">
                        {item.unlimitedStock ? (
                          <span className="text-purple-600 dark:text-purple-400 uppercase text-[10px] font-black tracking-wider">UNLIMITED ∞</span>
                        ) : (
                          <span className={cn(item.isOut ? "text-red-500" : item.isLow ? "text-amber-500" : "text-gray-900 dark:text-white")}>
                            {item.stockQuantity !== null && item.stockQuantity !== undefined ? item.stockQuantity.toLocaleString() : 0} units
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 font-mono text-gray-500 dark:text-gray-400">
                        ₦{item.resolvedCostPrice.toLocaleString()}
                      </td>

                      <td className="py-3.5 px-3 font-mono font-bold text-[#FC7A00]">
                        ₦{item.resolvedSellingPrice.toLocaleString()}
                      </td>

                      <td className="py-3.5 px-3 font-mono font-bold">
                        <span className={item.unitProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
                          ₦{item.unitProfit.toLocaleString()}
                        </span>
                      </td>

                      <td className="py-3.5 px-3 font-mono font-extrabold">
                        {item.unlimitedStock ? (
                          <span className="text-gray-400 font-sans text-[10px]">N/A (Unlimited)</span>
                        ) : (
                          <span className={(item.totalEstimatedProfit || 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
                            ₦{(item.totalEstimatedProfit || 0).toLocaleString()}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() => openRestockModal(item)}
                          className="px-3 py-1.5 bg-[#FC7A00] hover:bg-[#e06600] text-white rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer"
                        >
                          Restock / Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Quick Restock / Stock Price Edit Modal */}
      {selectedRestockItem && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
          <div className={cn("w-[94vw] sm:w-full max-w-md p-5 sm:p-6 rounded-3xl border shadow-2xl space-y-4 my-auto max-h-[85vh] overflow-y-auto no-scrollbar", panelClass)}>
            <div className="flex items-center justify-between border-b border-gray-200/40 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">inventory</span>
                <h3 className="font-extrabold text-xs uppercase tracking-wider">
                  Update Stock Levels & Prices
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRestockItem(null)}
                className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-400 hover:text-black dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200/50 flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl border border-gray-200 bg-white overflow-hidden flex-shrink-0">
                <img src={selectedRestockItem.imageUrl} alt={selectedRestockItem.title} className="w-full h-full object-cover" />
              </div>
              <div>
                <h4 className="font-extrabold text-xs uppercase text-gray-900 dark:text-white">{selectedRestockItem.title}</h4>
                <p className="text-[10px] font-mono text-gray-400 uppercase mt-0.5">{selectedRestockItem.category}</p>
              </div>
            </div>

            <form onSubmit={handleSaveRestock} className="space-y-3.5 text-left">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Cost Price (₦)</label>
                  <input
                    type="number"
                    placeholder="Wholesale cost"
                    value={newCostPrice}
                    onChange={(e) => setNewCostPrice(e.target.value)}
                    className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-[#FC7A00] block">Selling Price (₦) *</label>
                  <input
                    type="number"
                    required
                    placeholder="Standard price"
                    value={newSellingPrice}
                    onChange={(e) => setNewSellingPrice(e.target.value)}
                    className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-emerald-500 block">Discount Price (₦)</label>
                <input
                  type="number"
                  placeholder="Sale price (optional)"
                  value={newDiscountPrice}
                  onChange={(e) => setNewDiscountPrice(e.target.value)}
                  className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={isUnlimited}
                  onChange={(e) => setIsUnlimited(e.target.checked)}
                  className="w-4 h-4 text-[#FC7A00] rounded"
                />
                <span className="text-xs font-bold uppercase text-gray-700 dark:text-gray-300">Unlimited Stock (No Quantity Cap)</span>
              </label>

              {!isUnlimited && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 block">Current Available Units *</label>
                  <input
                    type="number"
                    min={0}
                    required={!isUnlimited}
                    value={newStockQty}
                    onChange={(e) => setNewStockQty(e.target.value)}
                    className={cn("h-10 px-3 rounded-xl text-xs font-semibold outline-none border transition-all w-full", inputClass)}
                  />
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isInStock}
                  onChange={(e) => setIsInStock(e.target.checked)}
                  className="w-4 h-4 text-[#FC7A00] rounded"
                />
                <span className="text-xs font-bold uppercase text-gray-700 dark:text-gray-300">In Stock for Ordering</span>
              </label>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-200/40">
                <button
                  type="button"
                  onClick={() => setSelectedRestockItem(null)}
                  className="px-4 h-10 bg-gray-200 dark:bg-gray-800 text-xs font-bold uppercase rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRestock}
                  className="px-6 h-10 bg-[#FC7A00] hover:bg-[#e06600] text-white text-xs font-bold uppercase rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingRestock ? <ButtonSpinner /> : <span className="material-symbols-outlined text-[18px]">save</span>}
                  <span>Save Stock Level</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CpanelStockIncomePage() {
  return (
    <CpanelRouteGuard requiredPermission="store.view">
      <CpanelStockIncomePageContent />
    </CpanelRouteGuard>
  );
}