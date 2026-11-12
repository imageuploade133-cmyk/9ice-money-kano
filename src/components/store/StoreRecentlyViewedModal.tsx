"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StoreItem, StoreSettings, hexToRgba, getEffectivePrice } from "./types";

interface StoreRecentlyViewedModalProps {
  isOpen: boolean;
  recentlyViewed: StoreItem[];
  visibleLimit: number;
  settings: StoreSettings;
  onClose: () => void;
  onOpenProductPage: (item: StoreItem) => void;
  onClearAllHistory: () => void;
  onLoadMore: () => void;
}

export const StoreRecentlyViewedModal: React.FC<StoreRecentlyViewedModalProps> = ({
  isOpen,
  recentlyViewed,
  visibleLimit,
  settings,
  onClose,
  onOpenProductPage,
  onClearAllHistory,
  onLoadMore,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100007] bg-white flex flex-col justify-between overflow-hidden">
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
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-800 transition-colors cursor-pointer border-0"
                  title="Back"
                >
                  <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                </button>
                <span className="material-symbols-outlined text-[#FC7A00] text-[22px]">history</span>
                <h2 className="font-hanken font-extrabold text-base text-black uppercase tracking-wide">
                  Recently Viewed
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 hover:text-black transition-colors cursor-pointer border-0"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar pb-24">
              {recentlyViewed.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <span className="material-symbols-outlined text-[48px] text-gray-300">history_toggle_off</span>
                  <p className="font-bold text-xs text-gray-500">Your recently viewed history is empty.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-[10px] font-extrabold uppercase text-gray-400">
                    <span>
                      Showing {Math.min(visibleLimit, recentlyViewed.length)} of {recentlyViewed.length} items
                    </span>
                    <button
                      type="button"
                      onClick={onClearAllHistory}
                      className="text-red-500 hover:underline cursor-pointer border-0"
                    >
                      Clear All History
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    {recentlyViewed.slice(0, visibleLimit).map((item) => {
                      const rvBorderColor = settings.hideBorders
                        ? "transparent"
                        : settings.enableGradientBorder
                        ? settings.gradientColorStart || "#FC7A00"
                        : settings.recentlyViewedBorderEnabled
                        ? hexToRgba(settings.recentlyViewedBorderColor || "#FC7A00", settings.recentlyViewedBorderOpacity ?? 1)
                        : hexToRgba(settings.borderColor || "#FC7A00", settings.borderOpacity ?? 1);

                      const effPrice = getEffectivePrice(item);
                      const hasPromo = effPrice < item.price;

                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            onClose();
                            onOpenProductPage(item);
                          }}
                          style={{
                            borderColor: rvBorderColor,
                            borderRadius: `${settings.cardBorderRadius ?? 16}px`,
                            borderWidth: `${settings.borderWidth ?? 1}px`,
                            ...(settings.enableGradientBorder && !settings.hideBorders
                              ? {
                                  borderImage: `linear-gradient(135deg, ${settings.gradientColorStart || "#FC7A00"}, ${settings.gradientColorEnd || "#E06600"}) 1`,
                                }
                              : {}),
                          }}
                          className={`bg-white p-3.5 flex flex-col justify-between space-y-3 cursor-pointer hover:bg-gray-50 transition-all shadow-3xs ${
                            settings.hideBorders ? "border-0" : "border"
                          }`}
                        >
                          <div className="w-full h-28 rounded-xl bg-gray-50 relative overflow-hidden flex items-center justify-center p-1 border-0">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.title} className="w-full h-full object-contain p-1" />
                            ) : (
                              <span className="material-symbols-outlined text-[32px] text-gray-300">storefront</span>
                            )}
                            <span className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded text-[8px] font-black uppercase bg-black/75 text-white backdrop-blur-xs">
                              {item.category}
                            </span>
                          </div>

                          <div>
                            <h4 className="font-hanken font-extrabold text-xs uppercase text-black line-clamp-1 leading-tight">
                              {item.title}
                            </h4>
                            <div className="flex items-baseline gap-1 mt-1 flex-wrap">
                              <span className="font-mono font-black text-xs text-[#FC7A00]">
                                ₦{effPrice.toLocaleString()}
                              </span>
                              {hasPromo && (
                                <span className="font-mono text-[9.5px] text-gray-400 line-through">
                                  ₦{item.price.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {recentlyViewed.length > visibleLimit && (
                    <div className="pt-3 text-center">
                      <button
                        type="button"
                        onClick={onLoadMore}
                        className="px-6 py-3 bg-[#FC7A00] text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all cursor-pointer border-0 shadow-xs"
                      >
                        Load More History ({recentlyViewed.length - visibleLimit} remaining)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
