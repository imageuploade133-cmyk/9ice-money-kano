"use client";

import React from "react";
import { motion } from "framer-motion";
import { StoreItem, StoreSettings } from "./types";
import { StoreProductCard } from "./StoreProductCard";

interface StoreProductGridProps {
  items: StoreItem[];
  isLoading: boolean;
  searchQuery: string;
  settings: StoreSettings;
  wishlist: StoreItem[];
  navigatingProductId: string | null;
  onOpenProductPage: (item: StoreItem) => void;
  onToggleWishlist: (e: React.MouseEvent, item: StoreItem) => void;
  onAddToCart: (item: StoreItem, qty?: number) => void;
  onBuyNow: (e: React.MouseEvent, item: StoreItem) => void;
}

export const StoreProductGrid: React.FC<StoreProductGridProps> = ({
  items,
  isLoading,
  searchQuery,
  settings,
  wishlist,
  navigatingProductId,
  onOpenProductPage,
  onToggleWishlist,
  onAddToCart,
  onBuyNow,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3.5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border-0 p-3.5 space-y-3 shadow-3xs animate-pulse"
          >
            <div className="w-full h-28 rounded-xl bg-gray-100 skeleton-shimmer" />
            <div className="space-y-2">
              <div className="h-3.5 bg-gray-200 rounded w-3/4 skeleton-shimmer" />
              <div className="h-2.5 bg-gray-100 rounded w-full skeleton-shimmer" />
            </div>
            <div className="pt-2 border-0 flex items-center justify-between">
              <div className="h-4 bg-gray-200 rounded w-12 skeleton-shimmer" />
              <div className="h-7 bg-gray-200 rounded-xl w-16 skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-white rounded-[24px] border-0 p-8 shadow-xs flex flex-col items-center text-center justify-center min-h-[260px]"
      >
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FFF5EB] to-[#FFF0E0] flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[#FC7A00] text-[32px]">
            storefront
          </span>
        </div>
        <h2 className="font-bodoni text-[16px] font-bold text-black mb-1">
          No Matching Products
        </h2>
        <p className="font-hanken text-[11.5px] text-gray-500 leading-relaxed max-w-[240px]">
          {searchQuery
            ? `No products matched "${searchQuery}". Try searching another keyword.`
            : "No storefront products match your selected category at the moment."}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3.5">
      {items.map((item) => (
        <StoreProductCard
          key={item.id}
          item={item}
          settings={settings}
          wishlist={wishlist}
          navigatingProductId={navigatingProductId}
          onOpenProductPage={onOpenProductPage}
          onToggleWishlist={onToggleWishlist}
          onAddToCart={onAddToCart}
          onBuyNow={onBuyNow}
        />
      ))}
    </div>
  );
};
