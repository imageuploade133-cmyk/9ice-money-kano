"use client";

import React from "react";
import { StoreSettings } from "./types";
import { triggerHaptic } from "@/lib/haptics";

interface StoreHeaderProps {
  settings: StoreSettings;
  wishlistCount: number;
  cartCount: number;
  orderCount?: number;
  onClearCache: () => void;
  onOpenWishlist: () => void;
  onOpenMyOrders: () => void;
  onOpenCart: () => void;
}

export const StoreHeader: React.FC<StoreHeaderProps> = ({
  settings,
  wishlistCount,
  cartCount,
  orderCount,
  onClearCache,
  onOpenWishlist,
  onOpenMyOrders,
  onOpenCart,
}) => {
  return (
    <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md pt-3.5 pb-2.5 px-margin-mobile border-0 shadow-none">
      <div className="max-w-md mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {settings.storeLogoUrl && (
            <div className="w-9 h-9 rounded-xl bg-transparent border-0 flex items-center justify-center p-0 overflow-hidden flex-shrink-0">
              <img
                src={settings.storeLogoUrl}
                alt="Store Logo"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </div>
          )}
          <div className="min-w-0">
            <h1
              className="font-hanken text-[18px] min-[375px]:text-[20px] font-black tracking-tight leading-tight truncate"
              style={{ color: settings.storeNameColor || undefined }}
            >
              {settings.storeName || "E-Tech Store"}
            </h1>
            <p
              className="font-hanken text-[9.5px] font-black uppercase tracking-widest mt-0.5 truncate"
              style={{ color: settings.storeSubtitleColor || undefined }}
            >
              {settings.storeSubtitle || "Hardware & Premium Gear"}
            </p>
          </div>
        </div>

        {/* Wallet Header Uniform Circular Icon Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Refresh Cache Button - Controlled by Admin ON/OFF Toggle */}
          {!settings.hideClearCacheButton && (
            <button
              type="button"
              onClick={() => { triggerHaptic(); onClearCache(); }}
              className="w-8 h-8 min-[375px]:w-9 min-[375px]:h-9 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center hover:bg-gray-100 active:scale-90 transition-all cursor-pointer"
              title="Clear Cache & Refresh Store Data"
            >
              <span
                className="material-symbols-outlined text-[18px] min-[375px]:text-[20px]"
                style={{ color: settings.topBarIconColor || "#374151" }}
              >
                cached
              </span>
            </button>
          )}

          {/* Wishlist Button */}
          <button
            type="button"
            onClick={() => { triggerHaptic(); onOpenWishlist(); }}
            className="relative w-8 h-8 min-[375px]:w-9 min-[375px]:h-9 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center hover:bg-gray-100 active:scale-90 transition-all cursor-pointer"
            title="Wishlist / Favorites"
          >
            <span
              className="material-symbols-outlined text-[18px] min-[375px]:text-[20px]"
              style={{ color: settings.topBarWishlistIconColor || "#EF4444" }}
            >
              favorite
            </span>
            {wishlistCount > 0 && (
              <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center border border-white">
                {wishlistCount}
              </span>
            )}
          </button>

          {/* Order History Icon Button */}
          <button
            type="button"
            onClick={() => { triggerHaptic(); onOpenMyOrders(); }}
            className="relative w-8 h-8 min-[375px]:w-9 min-[375px]:h-9 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center hover:bg-gray-100 active:scale-90 transition-all cursor-pointer"
            title="Order History"
          >
            <span
              className="material-symbols-outlined text-[18px] min-[375px]:text-[20px]"
              style={{ color: settings.topBarHistoryIconColor || "#FC7A00" }}
            >
              history
            </span>
            {orderCount !== undefined && orderCount > 0 && (
              <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-[#FC7A00] text-white text-[8px] font-bold rounded-full flex items-center justify-center border border-white">
                {orderCount}
              </span>
            )}
          </button>

          {/* Shopping Cart Icon Button */}
          <button
            type="button"
            onClick={() => { triggerHaptic(); onOpenCart(); }}
            className="relative w-8 h-8 min-[375px]:w-9 min-[375px]:h-9 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center hover:bg-gray-100 active:scale-90 transition-all cursor-pointer"
            title="Shopping Cart"
          >
            <span
              className="material-symbols-outlined text-[18px] min-[375px]:text-[20px]"
              style={{ color: settings.topBarCartIconColor || "#1F2937" }}
            >
              shopping_bag
            </span>
            {cartCount > 0 && (
              <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-[#FC7A00] text-white text-[8px] font-bold rounded-full flex items-center justify-center border border-white">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
