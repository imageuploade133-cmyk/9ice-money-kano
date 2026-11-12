"use client";

import React from "react";
import { StoreItem, StoreSettings, hexToRgba } from "./types";

interface StoreRecentlyViewedSectionProps {
  recentlyViewed: StoreItem[];
  settings: StoreSettings;
  onOpenProductPage: (item: StoreItem) => void;
  onOpenViewAll: () => void;
  onClearRecentlyViewed: () => void;
}

export const StoreRecentlyViewedSection: React.FC<StoreRecentlyViewedSectionProps> = ({
  recentlyViewed,
  settings,
  onOpenProductPage,
  onOpenViewAll,
  onClearRecentlyViewed,
}) => {
  if (!recentlyViewed || recentlyViewed.length === 0) return null;

  return (
    <div className="mb-5 space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] text-[#FC7A00]">history</span>
          <h3 className="font-hanken font-extrabold text-xs uppercase tracking-wider text-black">
            Recently Viewed ({recentlyViewed.length})
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenViewAll}
            className="text-[9.5px] font-black text-[#FC7A00] hover:underline uppercase tracking-wider cursor-pointer"
          >
            View All
          </button>
          <button
            type="button"
            onClick={onClearRecentlyViewed}
            className="text-[9.5px] font-bold text-gray-400 hover:text-red-500 uppercase tracking-wider cursor-pointer"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto no-scrollbar py-1 select-none">
        {recentlyViewed.slice(0, 10).map((rv) => {
          const rvBorderColor = settings.recentlyViewedBorderEnabled
            ? hexToRgba(settings.recentlyViewedBorderColor || "#FC7A00", settings.recentlyViewedBorderOpacity ?? 1)
            : "#E5E7EB";

          return (
            <div
              key={rv.id}
              onClick={() => onOpenProductPage(rv)}
              style={{ borderColor: rvBorderColor }}
              className="w-36 flex-shrink-0 bg-white border-0 rounded-2xl p-2.5 space-y-2 cursor-pointer transition-all shadow-3xs hover:shadow-xs"
            >
              <div className="w-full h-24 rounded-xl bg-gray-50 border-0 relative overflow-hidden flex items-center justify-center p-1">
                {rv.imageUrl ? (
                  <img src={rv.imageUrl} alt={rv.title} className="w-full h-full object-contain p-1" />
                ) : (
                  <span className="material-symbols-outlined text-[24px] text-gray-300">storefront</span>
                )}
              </div>
              <div>
                <h4 className="font-hanken font-bold text-[11px] text-black uppercase line-clamp-1 leading-tight">
                  {rv.title}
                </h4>
                <p className="font-mono font-black text-xs text-[#FC7A00] mt-0.5">
                  ₦{rv.price.toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
