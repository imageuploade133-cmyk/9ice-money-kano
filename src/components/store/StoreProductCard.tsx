"use client";

import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { StoreItem, StoreSettings, hexToRgba } from "./types";

interface StoreProductCardProps {
  item: StoreItem;
  settings: StoreSettings;
  wishlist: StoreItem[];
  navigatingProductId: string | null;
  onOpenProductPage: (item: StoreItem) => void;
  onToggleWishlist: (e: React.MouseEvent, item: StoreItem) => void;
  onAddToCart: (item: StoreItem, qty?: number) => void;
  onBuyNow: (e: React.MouseEvent, item: StoreItem) => void;
}

export const StoreProductCard: React.FC<StoreProductCardProps> = ({
  item,
  settings,
  wishlist,
  navigatingProductId,
  onOpenProductPage,
  onToggleWishlist,
  onAddToCart,
  onBuyNow,
}) => {
  const hideBorders = Boolean(settings.hideBorders);
  const productBorderColor = settings.hideBorders
    ? "transparent"
    : settings.enableGradientBorder
    ? settings.gradientColorStart || "#FC7A00"
    : hexToRgba(settings.borderColor || "#FC7A00", settings.borderOpacity ?? 1);

  const itemInWishlist = wishlist.some((w) => w.id === item.id);
  const isNavigatingThis = navigatingProductId === item.id;
  const displayCoverUrl = item.coverImageUrl || item.imageUrl || (item.images && item.images[0]) || "";
  const imageCount =
    Array.isArray(item.images) && item.images.length > 0
      ? item.images.length
      : displayCoverUrl
      ? 1
      : 0;

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      style={{
        borderColor: productBorderColor,
        borderRadius: `${settings.cardBorderRadius ?? 16}px`,
        borderWidth: `${settings.borderWidth ?? 1}px`,
        ...(settings.enableGradientBorder && !settings.hideBorders
          ? {
              borderImage: `linear-gradient(135deg, ${
                settings.gradientColorStart || "#FC7A00"
              }, ${settings.gradientColorEnd || "#E06600"}) 1`,
            }
          : {}),
      }}
      className={`bg-white p-3 flex flex-col justify-between space-y-3 shadow-xs transition-all cursor-pointer group relative ${
        hideBorders ? "border-0" : "border"
      }`}
      onClick={() => onOpenProductPage(item)}
    >
      {/* Navigation Feedback Loading Overlay */}
      {isNavigatingThis && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-xs z-30 rounded-[inherit] flex flex-col items-center justify-center p-2 text-center animate-fade-in">
          <span className="material-symbols-outlined text-[24px] text-[#FC7A00] animate-spin mb-1">
            progress_activity
          </span>
          <span className="font-hanken text-[9.5px] font-black uppercase tracking-wider text-black">
            Opening Product...
          </span>
        </div>
      )}
      <div className="space-y-2">
        {/* Product Image Thumbnail */}
        <div className="w-full h-28 min-[375px]:h-32 rounded-xl bg-gray-50 border-0 overflow-hidden relative flex items-center justify-center p-1">
          {displayCoverUrl ? (
            <Image
              src={displayCoverUrl}
              alt={item.title}
              fill
              className={`${
                settings.productCardImageMode === "contain"
                  ? "object-contain p-2"
                  : "object-cover"
              } group-hover:scale-105 transition-transform duration-300`}
              unoptimized
            />
          ) : (
            <span className="material-symbols-outlined text-[36px] text-gray-300">
              storefront
            </span>
          )}

          {/* Heart Wishlist Quick Button */}
          <button
            type="button"
            onClick={(e) => onToggleWishlist(e, item)}
            className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center text-gray-600 hover:text-red-500 shadow-xs z-10 transition-transform active:scale-90 border-0"
            title={itemInWishlist ? "Remove from Wishlist" : "Save to Wishlist"}
          >
            <span
              className={`material-symbols-outlined text-[15px] ${
                itemInWishlist ? "text-red-500" : ""
              }`}
              style={{ fontVariationSettings: itemInWishlist ? '"FILL" 1' : '"FILL" 0' }}
            >
              favorite
            </span>
          </button>

          {/* Multiple Image Gallery Indicator Badge */}
          {imageCount > 1 && (
            <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded text-[8px] font-black uppercase bg-black/75 text-white backdrop-blur-xs flex items-center gap-1 z-10">
              <span className="material-symbols-outlined text-[10px]">collections</span>
              <span>{imageCount}</span>
            </span>
          )}

          <span className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded text-[8px] font-black uppercase bg-black/75 text-white backdrop-blur-xs">
            {item.category}
          </span>
        </div>

        <div>
          <h3 className="font-hanken font-extrabold text-xs uppercase text-black line-clamp-1 leading-tight group-hover:text-[#FC7A00] transition-colors">
            {item.title}
          </h3>
          <p className="font-hanken text-[10px] text-gray-400 font-medium line-clamp-2 mt-0.5 leading-relaxed">
            {item.description}
          </p>
        </div>
      </div>

      <div className="pt-2 border-t border-gray-100 space-y-2">
        <div className="flex items-baseline justify-between gap-1 flex-wrap">
          {(() => {
            const effectivePromoPrice = item.discountPrice || item.promoPrice;
            const hasPromo =
              typeof effectivePromoPrice === "number" &&
              effectivePromoPrice > 0 &&
              effectivePromoPrice < item.price;
            const displayPrice = hasPromo ? effectivePromoPrice : item.price;
            const listPrice = hasPromo ? item.price : item.originalPrice;
            const discountPct =
              listPrice && listPrice > displayPrice
                ? Math.round(((listPrice - displayPrice) / listPrice) * 100)
                : 0;

            return (
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-mono font-black text-xs min-[375px]:text-sm text-[#FC7A00]">
                  ₦{displayPrice.toLocaleString()}
                </span>
                {listPrice && listPrice > displayPrice && (
                  <span className="font-mono text-[10px] text-gray-400 line-through">
                    ₦{listPrice.toLocaleString()}
                  </span>
                )}
                {discountPct > 0 && (
                  <span className="px-1.5 py-0.2 rounded text-[7.5px] font-black uppercase bg-red-600 text-white shadow-2xs">
                    -{discountPct}%
                  </span>
                )}
              </div>
            );
          })()}

          <span
            className={`text-[8px] font-black uppercase ${
              item.inStock && (item.unlimitedStock || typeof item.stockQuantity !== "number" || item.stockQuantity > 0)
                ? "text-emerald-600"
                : "text-red-500"
            }`}
          >
            {item.inStock
              ? (!item.unlimitedStock && typeof item.stockQuantity === "number"
                  ? (item.stockQuantity > 0 ? `${item.stockQuantity} Left` : "Out of Stock")
                  : "In Stock")
              : "Out of Stock"}
          </span>
        </div>

        <div className="flex gap-1.5">
          {/* Add to Cart Quick Icon Button */}
          <button
            type="button"
            disabled={!item.inStock}
            onClick={(e) => {
              e.stopPropagation();
              onAddToCart(item, 1);
            }}
            className="p-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-900 rounded-xl cursor-pointer active:scale-95 transition-all flex items-center justify-center border-0 shadow-none"
            title="Add to Cart"
          >
            <span
              className="material-symbols-outlined"
              style={{
                color: settings.storeIconColor || "#FC7A00",
                fontSize: settings.storeIconSize ? `${settings.storeIconSize}px` : "16px",
              }}
            >
              add_shopping_cart
            </span>
          </button>

          {/* Buy Now Direct Button */}
          {(() => {
            const isAvailableInStock =
              item.inStock &&
              (item.unlimitedStock || typeof item.stockQuantity !== "number" || item.stockQuantity > 0);

            return (
              <button
                type="button"
                disabled={!isAvailableInStock}
                onClick={(e) => isAvailableInStock && onBuyNow(e, item)}
                style={{
                  backgroundColor: isAvailableInStock
                    ? settings.storeButtonColor || "#FC7A00"
                    : "#9CA3AF",
                  color: settings.storeButtonTextColor || "#FFFFFF",
                }}
                className={`flex-1 py-2 rounded-xl text-[9.5px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 shadow-2xs border-0 ${
                  isAvailableInStock
                    ? "hover:opacity-90 cursor-pointer active:scale-95"
                    : "cursor-not-allowed opacity-75"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {isAvailableInStock ? settings.storeButtonIcon || "bolt" : "block"}
                </span>
                <span>{isAvailableInStock ? "Buy Now" : "Out of Stock"}</span>
              </button>
            );
          })()}
        </div>
      </div>
    </motion.div>
  );
};
