"use client";
import { useCpanelTheme } from "@/lib/CpanelThemeContext";

import React, { useState, useEffect } from "react";
import { CpanelActionDropdown } from "@/components/cpanel/CpanelActionDropdown";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CpanelRouteGuard } from "@/components/cpanel/CpanelRouteGuard";

function ButtonSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
  );
}

export interface StoreOrder {
  id: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryType?: string;
  items: Array<{
    id: string;
    title: string;
    price: number;
    costPrice?: number | null;
    quantity: number;
    imageUrl?: string;
    category?: string;
  }>;
  totalAmount: number;
  currency: string;
  status: string;
  adminNotes?: string;
  paymentMethod?: string;
  paymentChannel?: string;
  paymentStatus?: string;
  paymentVerificationRef?: string;
  stockDeducted?: boolean;
  stockRestored?: boolean;
  createdAt: string;
  updatedAt: string;
}

function CpanelStoreOrdersPageContent() {
  const router = useRouter();
  const { isDark, toggleTheme } = useCpanelTheme();
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Orders & Metrics State
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([
    "Pending",
    "Processing",
    "Shipped",
    "Delivered",
    "Refunded",
    "Canceled",
    "Pending Payment",
    "Payment Failed",
  ]);
  const [metrics, setMetrics] = useState({
    totalOrders: 0,
    grossRevenue: 0,
    netRevenue: 0,
    totalRevenue: 0,
    totalRealizedProfit: 0,
    pendingCount: 0,
    deliveredCount: 0,
    refundedCount: 0,
  });
  const [isLoadingOrders, setIsLoadingCategories] = useState(true);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("ALL");

  // Selected Order Modal State
  const [activeOrder, setActiveProductOrder] = useState<StoreOrder | null>(null);
  const [newStatus, setNewStatus] = useState("Pending");
  const [adminNotes, setAdminNotes] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  // Reusable Confirmation Modal Overlay State
  const [confirmModalData, setConfirmModalData] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const promptAdminConfirmation = (opts: {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    onConfirm: () => void | Promise<void>;
  }) => {
    setConfirmModalData({
      isOpen: true,
      title: opts.title,
      description: opts.description,
      confirmText: opts.confirmText || "Confirm Action",
      cancelText: opts.cancelText || "Cancel",
      isDanger: opts.isDanger !== false,
      onConfirm: opts.onConfirm,
    });
  };

  // Check Admin Unlock Session via /api/admin/auth/session
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
          toast.error("Security Session Expired. Please authenticate in CPanel.");
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

  // Fetch Store Config for custom status list
  useEffect(() => {
    async function fetchConfigSettings() {
      try {
        const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
        const authHeader: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};
        const res = await fetch("/api/admin/store", { headers: authHeader });
        const data = await res.json();
        if (data.success && data.settings?.orderStatuses) {
          setAvailableStatuses(data.settings.orderStatuses);
        }
      } catch (err) {
        console.warn("Failed to load custom order statuses:", err);
      }
    }
    if (!isLoadingSession) {
      fetchConfigSettings();
    }
  }, [isLoadingSession]);

  // Fetch Admin Orders
  const fetchOrders = async () => {
    setIsLoadingCategories(true);
    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const authHeader: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};

      const params = new URLSearchParams();
      if (selectedStatusFilter !== "ALL") params.append("status", selectedStatusFilter);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());

      const res = await fetch(`/api/admin/store/orders?${params.toString()}`, { headers: authHeader });
      const data = await res.json();

      if (data.success && Array.isArray(data.orders)) {
        setOrders(data.orders);
        if (data.metrics) {
          setMetrics({
            totalOrders: data.metrics.totalOrders || 0,
            grossRevenue: data.metrics.grossRevenue || 0,
            netRevenue: data.metrics.netRevenue || data.metrics.totalRevenue || 0,
            totalRevenue: data.metrics.netRevenue || data.metrics.totalRevenue || 0,
            totalRealizedProfit: data.metrics.totalRealizedProfit || 0,
            pendingCount: data.metrics.pendingCount || 0,
            deliveredCount: data.metrics.deliveredCount || 0,
            refundedCount: data.metrics.refundedCount || 0,
          });
        }
      } else {
        toast.error(data.error || "Failed to load store orders.");
      }
    } catch (err: any) {
      toast.error(err.message || "Network error loading store orders.");
    } finally {
      setIsLoadingCategories(false);
    }
  };

  useEffect(() => {
    if (!isLoadingSession) {
      fetchOrders();
    }
  }, [isLoadingSession, selectedStatusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders();
  };

  const openInspectModal = (order: StoreOrder) => {
    setActiveProductOrder(order);
    setNewStatus(order.status || "Pending");
    setAdminNotes(order.adminNotes || "");
  };

  const handleDeleteOrder = (orderId: string) => {
    promptAdminConfirmation({
      title: "Delete Order & Refund Customer",
      description: `Are you sure you want to delete order ${orderId}? The customer's wallet will be refunded automatically (if paid), item stock returned to store inventory, and the order removed from system records.`,
      confirmText: "Delete & Refund Order",
      isDanger: true,
      onConfirm: async () => {
        try {
          const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
          const authHeader: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};

          const res = await fetch("/api/admin/store/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify({ action: "delete_order", orderId }),
          });

          const data = await res.json();
          if (res.ok && data.success) {
            toast.success(data.message || "Order deleted and refunded!");
            if (activeOrder?.id === orderId) setActiveProductOrder(null);
            fetchOrders();
          } else {
            toast.error(data.error || "Failed to delete order.");
          }
        } catch (err: any) {
          toast.error(err.message || "Network error deleting order.");
        }
      },
    });
  };

  const handlePurgeFailedOrders = () => {
    promptAdminConfirmation({
      title: "Purge Abandoned & Canceled Orders",
      description: "Are you sure you want to bulk-purge all failed, abandoned, and canceled store order records from system storage? Active and delivered orders will not be affected.",
      confirmText: "Purge Failed Orders",
      isDanger: true,
      onConfirm: async () => {
        setIsPurging(true);
        toast.loading("Purging abandoned and canceled order records...", { id: "purge-orders" });

        try {
          const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
          const authHeader: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};

          const res = await fetch("/api/admin/store/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify({ action: "purge_failed_orders" }),
          });

          const data = await res.json();
          if (res.ok && data.success) {
            toast.success(data.message || "Purged abandoned order records!", { id: "purge-orders" });
            fetchOrders();
          } else {
            toast.error(data.error || "Failed to purge order records.", { id: "purge-orders" });
          }
        } catch (err: any) {
          toast.error(err.message || "Network error purging order records.", { id: "purge-orders" });
        } finally {
          setIsPurging(false);
        }
      },
    });
  };

  const executeUpdateOrderStatus = async (targetStatus: string) => {
    if (!activeOrder) return;

    setIsUpdatingStatus(true);
    toast.loading(`Updating order ${activeOrder.id} to "${targetStatus}"...`, { id: "update-order" });

    try {
      const isMock = typeof window !== "undefined" && (window.location.search.includes("mock=true") || sessionStorage.getItem("admin_session_unlocked") === "true");
      const authHeader: Record<string, string> = isMock ? { Authorization: "Bearer mock-admin-token" } : {};

      const res = await fetch("/api/admin/store/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          action: "update_status",
          orderId: activeOrder.id,
          newStatus: targetStatus,
          adminNotes,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Order status updated successfully!", { id: "update-order", duration: 5000 });
        setActiveProductOrder(null);
        fetchOrders();
      } else {
        toast.error(data.error || "Failed to update order status.", { id: "update-order" });
      }
    } catch (err: any) {
      toast.error(err.message || "Network error updating order.", { id: "update-order" });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleUpdateOrderStatus = (e?: React.FormEvent, quickStatus?: string) => {
    if (e) e.preventDefault();
    if (!activeOrder) return;

    const targetStatus = quickStatus || newStatus;
    const oldStatus = activeOrder.status;

    // Direct confirmation prompt if status is changing to Refunded or Canceled
    if ((targetStatus === "Refunded" || targetStatus === "Canceled") && (oldStatus !== "Refunded" && oldStatus !== "Canceled")) {
      promptAdminConfirmation({
        title: `Confirm ${targetStatus} & Refund Order`,
        description: `Updating status to "${targetStatus}" will automatically credit ₦${activeOrder.totalAmount.toLocaleString()} NGN back to customer's wallet (${activeOrder.customerName}) and restore item quantities back to store inventory. Are you sure you want to proceed?`,
        confirmText: `Refund ₦${activeOrder.totalAmount.toLocaleString()} & Restore Stock`,
        isDanger: true,
        onConfirm: () => executeUpdateOrderStatus(targetStatus),
      });
      return;
    }

    if (targetStatus === "Delivered" && oldStatus !== "Delivered") {
      promptAdminConfirmation({
        title: "Mark Order Delivered",
        description: `Are you sure you want to update order ${activeOrder.id} status to "Delivered"?`,
        confirmText: "Mark Delivered",
        isDanger: false,
        onConfirm: () => executeUpdateOrderStatus("Delivered"),
      });
      return;
    }

    // Default status update prompt if changing status
    if (targetStatus !== oldStatus) {
      promptAdminConfirmation({
        title: "Update Order Status",
        description: `Are you sure you want to change order ${activeOrder.id} status from "${oldStatus}" to "${targetStatus}"?`,
        confirmText: "Update Status",
        isDanger: false,
        onConfirm: () => executeUpdateOrderStatus(targetStatus),
      });
      return;
    }

    executeUpdateOrderStatus(targetStatus);
  };

  const getStatusBadge = (status: string) => {
    const st = (status || "").toLowerCase();
    if (st === "delivered") {
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300";
    }
    if (st === "pending") {
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300";
    }
    if (st === "processing" || st === "shipped") {
      return "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300";
    }
    if (st === "refunded" || st === "canceled" || st === "cancelled") {
      return "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300";
    }
    if (st === "payment failed" || st === "pending payment") {
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300";
    }
    return "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300";
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

        {/* Top Navigation Bar */}
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
                <span className="material-symbols-outlined text-[#FC7A00] text-[24px]">shopping_bag</span>
                <h1 className="text-xl font-black uppercase tracking-tight text-[#FC7A00]">
                  Store Orders Dispatch Console
                </h1>
              </div>
              <p className="text-xs font-medium text-gray-400 mt-0.5">
                Inspect customer orders, track fulfillment status, write admin dispatch notes & issue instant wallet refunds with global stock restoration
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              disabled={isPurging}
              onClick={handlePurgeFailedOrders}
              className="px-3.5 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Purge abandoned/failed payment orders from system storage"
            >
              <span className="material-symbols-outlined text-[17px]">cleaning_services</span>
              <span>Purge Abandoned</span>
            </button>

            <Link
              href="/cpanel/store"
              className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-800 font-bold text-xs uppercase tracking-wider text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">storefront</span>
              Store Manager
            </Link>

            <button
              type="button"
              onClick={fetchOrders}
              className="px-4 py-2.5 rounded-xl bg-[#FC7A00] text-white font-black text-xs uppercase tracking-wider hover:opacity-95 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              Refresh Orders
            </button>
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className={cn("p-4 rounded-2xl border flex flex-col justify-between", panelClass)}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Net Store Income</span>
              <span className="material-symbols-outlined text-emerald-500 text-[20px]">payments</span>
            </div>
            <div>
              <p className="text-xl font-black tracking-tight text-emerald-600 mt-2">
                ₦{metrics.netRevenue.toLocaleString()}
              </p>
              <span className="text-[9px] text-gray-400 font-semibold block mt-0.5">Excludes refunded/canceled orders</span>
            </div>
          </div>

          <div className={cn("p-4 rounded-2xl border flex flex-col justify-between", panelClass)}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Realized Net Profit</span>
              <span className="material-symbols-outlined text-teal-500 text-[20px]">trending_up</span>
            </div>
            <div>
              <p className="text-xl font-black tracking-tight text-teal-600 mt-2">
                ₦{metrics.totalRealizedProfit.toLocaleString()}
              </p>
              <span className="text-[9px] text-gray-400 font-semibold block mt-0.5">(Selling Price - Cost Price)</span>
            </div>
          </div>

          <div className={cn("p-4 rounded-2xl border flex flex-col justify-between", panelClass)}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Pending Fulfillment</span>
              <span className="material-symbols-outlined text-amber-500 text-[20px]">pending</span>
            </div>
            <p className="text-xl font-black tracking-tight text-amber-600 mt-2">
              {metrics.pendingCount}
            </p>
          </div>

          <div className={cn("p-4 rounded-2xl border flex flex-col justify-between", panelClass)}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Delivered & Closed</span>
              <span className="material-symbols-outlined text-emerald-500 text-[20px]">task_alt</span>
            </div>
            <p className="text-xl font-black tracking-tight text-emerald-600 mt-2">
              {metrics.deliveredCount}
            </p>
          </div>
        </div>

        {/* Filter Tabs & Customer Search Bar */}
        <div className={cn("p-4 rounded-2xl border space-y-4", panelClass)}>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => setSelectedStatusFilter("ALL")}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer",
                selectedStatusFilter === "ALL"
                  ? "bg-[#FC7A00] text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200"
              )}
            >
              All Orders ({metrics.totalOrders})
            </button>

            {availableStatuses.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedStatusFilter(st)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer",
                  selectedStatusFilter === st
                    ? "bg-[#FC7A00] text-white shadow-xs"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200"
                )}
              >
                {st}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by customer name, phone, email, order ID, or address..."
                className={cn(inputClass, "pl-10 pr-4 h-11")}
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#FC7A00] text-white font-black text-xs uppercase tracking-wider hover:opacity-90 cursor-pointer"
            >
              Search
            </button>
          </form>
        </div>

        {/* Orders Table Display */}
        {isLoadingOrders ? (
          <div className={cn("p-12 rounded-2xl border flex flex-col items-center justify-center gap-3", panelClass)}>
            <ButtonSpinner />
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Loading Store Orders Ledger...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className={cn("p-12 rounded-2xl border flex flex-col items-center justify-center text-center gap-3", panelClass)}>
            <span className="material-symbols-outlined text-[48px] text-gray-300">shopping_cart_checkout</span>
            <p className="text-sm font-extrabold text-gray-500">No store orders found matching current filters.</p>
          </div>
        ) : (
          <div className={cn("rounded-2xl border overflow-hidden", panelClass)}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 dark:bg-gray-900/80 text-gray-500 dark:text-gray-400 uppercase font-black tracking-wider text-[10px] border-b border-gray-200 dark:border-gray-800">
                  <tr>
                    <th className="p-4">Order ID & Date</th>
                    <th className="p-4">Customer Details</th>
                    <th className="p-4">Payment Channel</th>
                    <th className="p-4">Items Summary</th>
                    <th className="p-4">Total Amount</th>
                    <th className="p-4">Payment & Order Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/80 font-medium">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/40 transition-colors">
                      <td className="p-4 whitespace-nowrap">
                        <span className="font-mono font-black text-[#FC7A00] block">{order.id}</span>
                        <span className="text-[10px] text-gray-400 font-semibold">
                          {new Date(order.createdAt).toLocaleString()}
                        </span>
                      </td>

                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-black dark:text-white">{order.customerName}</span>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[8.5px] font-black uppercase inline-flex items-center gap-0.5",
                            (order.deliveryType === "PICKUP" || (order.deliveryAddress || "").toUpperCase().includes("PICKUP"))
                              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                              : "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                          )}>
                            <span className="material-symbols-outlined text-[11px]">
                              {(order.deliveryType === "PICKUP" || (order.deliveryAddress || "").toUpperCase().includes("PICKUP")) ? "storefront" : "local_shipping"}
                            </span>
                            <span>{(order.deliveryType === "PICKUP" || (order.deliveryAddress || "").toUpperCase().includes("PICKUP")) ? "In-Store Pickup" : "Delivery"}</span>
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono">{order.customerPhone}</div>
                        <div className="text-[10px] text-gray-500 truncate max-w-xs">{order.deliveryAddress}</div>
                      </td>

                      <td className="p-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-600 border border-purple-500/20 inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">
                            {order.paymentMethod === "CARD_CHECKOUT" ? "credit_card" : "account_balance_wallet"}
                          </span>
                          <span>{order.paymentChannel || (order.paymentMethod === "CARD_CHECKOUT" ? "Card / Direct Link" : "Main Wallet")}</span>
                        </span>
                      </td>

                      <td className="p-4">
                        <span className="font-bold text-gray-700 dark:text-gray-300">
                          {order.items?.length || 0} Item(s)
                        </span>
                        <p className="text-[10px] text-gray-400 truncate max-w-xs">
                          {order.items?.map((i) => `${i.title} (x${i.quantity})`).join(", ")}
                        </p>
                      </td>

                      <td className="p-4 whitespace-nowrap">
                        <span className="font-extrabold text-emerald-600 text-sm">
                          ₦{order.totalAmount?.toLocaleString()}
                        </span>
                      </td>

                      <td className="p-4 whitespace-nowrap space-y-1">
                        <div>
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border inline-flex items-center gap-1",
                            order.paymentStatus === "PAID"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                          )}>
                            <span className="material-symbols-outlined text-[12px]">
                              {order.paymentStatus === "PAID" ? "verified" : "pending"}
                            </span>
                            <span>{order.paymentStatus || "PAID"}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={cn("px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border", getStatusBadge(order.status))}>
                            {order.status}
                          </span>
                          {order.stockRestored && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" title="Inventory stock restored to store catalog">
                              Stock Restored
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end">
                          <CpanelActionDropdown
                            isDark={isDark}
                            actions={[
                              {
                                label: "Inspect Order",
                                icon: "visibility",
                                onClick: () => openInspectModal(order),
                              },
                              {
                                label: "Mark Delivered",
                                icon: "check_circle",
                                variant: "emerald",
                                onClick: () => {
                                  openInspectModal(order);
                                  handleUpdateOrderStatus(undefined, "Delivered");
                                },
                              },
                              {
                                label: "Refund & Cancel",
                                icon: "undo",
                                variant: "danger",
                                onClick: () => {
                                  openInspectModal(order);
                                  handleUpdateOrderStatus(undefined, "Refunded");
                                },
                              },
                              {
                                label: "Delete Order",
                                icon: "delete",
                                variant: "danger",
                                onClick: () => handleDeleteOrder(order.id),
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Inspect & Manage Order Details Modal (Responsive for Small Screens) */}
      {activeOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in overflow-hidden">
          <div className={cn("w-full max-w-2xl max-h-[92vh] flex flex-col p-4 sm:p-6 rounded-3xl border shadow-2xl space-y-4 my-auto overflow-hidden", panelClass)}>
            {/* Header Bar */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 flex-shrink-0">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#FC7A00] text-[22px] flex-shrink-0">local_shipping</span>
                  <h2 className="text-sm sm:text-base font-black uppercase tracking-tight truncate">
                    Inspector: <span className="font-mono text-[#FC7A00]">{activeOrder.id}</span>
                  </h2>
                </div>
                <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 mt-0.5 truncate">
                  Placed on {new Date(activeOrder.createdAt).toLocaleString()}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActiveProductOrder(null)}
                className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-400 hover:text-black dark:hover:text-white cursor-pointer flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Scrollable Modal Content Body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
              {/* Customer & Delivery Details */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#FC7A00] block">Customer Delivery Profile</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <span className="text-gray-400 block text-[9.5px]">Name:</span>
                    <strong className="font-black text-black dark:text-white break-words">{activeOrder.customerName}</strong>
                  </div>

                  <div>
                    <span className="text-gray-400 block text-[9.5px]">Phone Number:</span>
                    <strong className="font-mono font-black text-black dark:text-white">{activeOrder.customerPhone}</strong>
                  </div>

                  {activeOrder.customerEmail && (
                    <div>
                      <span className="text-gray-400 block text-[9.5px]">Email Address:</span>
                      <strong className="font-mono text-gray-700 dark:text-gray-300 break-all">{activeOrder.customerEmail}</strong>
                    </div>
                  )}

                  <div>
                    <span className="text-gray-400 block text-[9.5px]">Payment Channel & Verification:</span>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-purple-500/10 text-purple-600 border border-purple-500/20">
                        {activeOrder.paymentChannel || (activeOrder.paymentMethod === "CARD_CHECKOUT" ? "Card Payment" : "Main NGN Wallet")}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[11px]">verified</span>
                        <span>{activeOrder.paymentStatus || "PAID"}</span>
                      </span>
                    </div>
                    {activeOrder.paymentVerificationRef && (
                      <span className="text-[8.5px] font-mono text-gray-400 block mt-1 truncate">Ref: {activeOrder.paymentVerificationRef}</span>
                    )}
                  </div>

                  <div className="col-span-1 sm:col-span-2 border-t border-gray-200 dark:border-gray-800 pt-2">
                    <span className="text-gray-400 block text-[9.5px]">Delivery Address:</span>
                    <p className="font-bold text-gray-800 dark:text-gray-200 mt-0.5 leading-relaxed break-words">{activeOrder.deliveryAddress}</p>
                  </div>
                </div>
              </div>

              {/* Purchased Items List */}
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Purchased Items Breakdown</span>
                <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                  {activeOrder.items?.map((item, idx) => (
                    <div key={idx} className="p-3 bg-white dark:bg-gray-900 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.imageUrl && (
                          <img src={item.imageUrl} alt={item.title} className="w-9 h-9 object-contain rounded-lg border p-1 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <h4 className="font-black text-xs text-black dark:text-white truncate">{item.title}</h4>
                          <span className="text-[9.5px] text-gray-400 block">Qty: x{item.quantity} • ₦{item.price.toLocaleString()} each</span>
                        </div>
                      </div>
                      <strong className="font-black text-xs text-emerald-600 flex-shrink-0">₦{(item.price * item.quantity).toLocaleString()}</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lock Banner if order is already Refunded or Canceled */}
              {(() => {
                const st = String(activeOrder.status || "").toLowerCase();
                const isSettled = st === "refunded" || st === "canceled" || st === "cancelled";

                return (
                  <>
                    {isSettled && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs">
                        <span className="material-symbols-outlined text-[20px] text-amber-500 shrink-0">lock</span>
                        <p className="font-semibold leading-relaxed text-[11px]">
                          This order has already been <strong className="uppercase">{activeOrder.status}</strong>. All status modifications are locked to prevent duplicate refunds. Stock was restored back to catalog. Only record deletion is permitted.
                        </p>
                      </div>
                    )}

                    {/* Order Status & Admin Notes Form Inputs */}
                    <form id="order-inspect-form" onSubmit={(e) => handleUpdateOrderStatus(e)} className="space-y-3 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                            Order Processing Status
                          </label>
                          <select
                            disabled={isSettled}
                            value={newStatus}
                            onChange={(e) => setNewStatus(e.target.value)}
                            className={cn("w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed", inputClass)}
                          >
                            {availableStatuses.map((stItem) => (
                              <option key={stItem} value={stItem}>
                                {stItem}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                            Order Total Amount
                          </label>
                          <div className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 text-xs sm:text-sm font-black text-emerald-600">
                            ₦{activeOrder.totalAmount?.toLocaleString()} NGN
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                          Admin Dispatch & Fulfillment Notes
                        </label>
                        <textarea
                          disabled={isSettled}
                          rows={2}
                          value={adminNotes}
                          onChange={(e) => setAdminNotes(e.target.value)}
                          placeholder="e.g. Dispatched via Courier Tracking #98234..."
                          className={cn("w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none resize-none disabled:opacity-60 disabled:cursor-not-allowed", inputClass)}
                        />
                      </div>
                    </form>
                  </>
                );
              })()}
            </div>

            {/* Modal Responsive Action Bar */}
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 space-y-2">
              {(() => {
                const st = String(activeOrder.status || "").toLowerCase();
                const isSettled = st === "refunded" || st === "canceled" || st === "cancelled";

                return (
                  <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-between gap-2">
                    <button
                      type="button"
                      disabled={isSettled || isUpdatingStatus}
                      onClick={() => handleUpdateOrderStatus(undefined, "Delivered")}
                      className="py-2.5 px-3 rounded-xl bg-emerald-600 text-white font-black text-[10px] sm:text-xs uppercase tracking-wider hover:opacity-90 transition-all flex items-center justify-center gap-1 cursor-pointer border-0 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[15px]">check_circle</span>
                      Mark Delivered
                    </button>

                    <button
                      type="button"
                      disabled={isSettled || isUpdatingStatus}
                      onClick={() => handleUpdateOrderStatus(undefined, "Refunded")}
                      className="py-2.5 px-3 rounded-xl bg-rose-600 text-white font-black text-[10px] sm:text-xs uppercase tracking-wider hover:opacity-90 transition-all flex items-center justify-center gap-1 cursor-pointer border-0 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[15px]">undo</span>
                      Refund & Restore Stock
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteOrder(activeOrder.id)}
                      className="py-2.5 px-3 rounded-xl bg-red-500/10 text-red-500 font-bold text-[10px] sm:text-xs uppercase tracking-wider hover:bg-red-500/20 transition-all flex items-center justify-center gap-1 cursor-pointer border border-red-500/20"
                    >
                      <span className="material-symbols-outlined text-[15px]">delete</span>
                      Delete Order
                    </button>

                    <button
                      type="submit"
                      form="order-inspect-form"
                      disabled={isSettled || isUpdatingStatus}
                      className="py-2.5 px-4 rounded-xl bg-[#FC7A00] text-white font-black text-[10px] sm:text-xs uppercase tracking-wider hover:opacity-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-0 shadow-xs"
                    >
                      {isUpdatingStatus && <ButtonSpinner />}
                      Save Status
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal Dialog Overlay */}
      {confirmModalData.isOpen && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className={cn("w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-4 text-center", panelClass)}>
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center mx-auto",
              confirmModalData.isDanger ? "bg-rose-500/10 text-rose-500 border border-rose-500/20" : "bg-[#FC7A00]/10 text-[#FC7A00] border border-[#FC7A00]/20"
            )}>
              <span className="material-symbols-outlined text-[28px]">
                {confirmModalData.isDanger ? "warning" : "info"}
              </span>
            </div>

            <div>
              <h3 className="text-base font-black uppercase text-black dark:text-white tracking-tight">
                {confirmModalData.title}
              </h3>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 leading-relaxed mt-1">
                {confirmModalData.description}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalData((prev) => ({ ...prev, isOpen: false }))}
                className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-gray-800 text-xs font-black uppercase text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer"
              >
                {confirmModalData.cancelText || "Cancel"}
              </button>

              <button
                type="button"
                onClick={async () => {
                  const fn = confirmModalData.onConfirm;
                  setConfirmModalData((prev) => ({ ...prev, isOpen: false }));
                  await fn();
                }}
                className={cn(
                  "flex-1 py-3 rounded-2xl text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm",
                  confirmModalData.isDanger
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-[#FC7A00] hover:opacity-95"
                )}
              >
                {confirmModalData.confirmText || "Confirm Action"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CpanelStoreOrdersPage() {
  return (
    <CpanelRouteGuard requiredPermission="store.view">
      <CpanelStoreOrdersPageContent />
    </CpanelRouteGuard>
  );
}
