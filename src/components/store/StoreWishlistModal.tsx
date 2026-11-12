"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StoreItem, getEffectivePrice } from "./types";

interface StoreWishlistModalProps {
  isOpen: boolean;
  wishlist: StoreItem[];
  onClose: () => void;
  onOpenProductPage: (item: StoreItem) => void;
  onToggleWishlistProduct: (e: React.MouseEvent, item: StoreItem) => void;
  onAddToCart: (item: StoreItem, qty?: number) => void;
}

export const StoreWishlistModal: React.FC<StoreWishlistModalProps> = ({
  isOpen,
  wishlist,
  onClose,
  onOpenProductPage,
  onToggleWishlistProduct,
  onAddToCart,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100008] bg-white flex flex-col justify-between overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 350 }}
            className="w-full h-full flex flex-col text-black max-w-md mx-auto overflow-hidden will-change-transform"
          >
            {/* Full Screen Header */}
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
                <span className="material-symbols-outlined text-red-500 text-[22px]">
                  favorite
                </span>
                <h2 className="font-hanken font-extrabold text-base text-black uppercase tracking-wide">
                  Wishlist
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

            {/* Scrollable Wishlist Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              {wishlist.length === 0 ? (
                <div className="py-20 flex flex-col items-center text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-400">
                    <span className="material-symbols-outlined text-[36px]">
                      favorite_border
                    </span>
                  </div>
                  <h3 className="font-bodoni font-bold text-base text-black">
                    Your Wishlist is Empty
                  </h3>
                  <p className="font-hanken text-xs text-gray-400 max-w-xs leading-relaxed">
                    Tap the heart icon on any product to save it to your personal wishlist.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                    Saved Items ({wishlist.length})
                  </p>

                  <div className="grid grid-cols-2 gap-3.5">
                    {wishlist.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          onClose();
                          onOpenProductPage(item);
                        }}
                        className="bg-gray-50 rounded-2xl p-3 flex flex-col justify-between space-y-2.5 cursor-pointer hover:bg-gray-100 transition-all border-0 shadow-3xs"
                      >
                        <div className="w-full h-28 rounded-xl bg-white relative overflow-hidden flex items-center justify-center p-1 border-0">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-full h-full object-contain p-1"
                            />
                          ) : (
                            <span className="material-symbols-outlined text-[28px] text-gray-300">
                              storefront
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => onToggleWishlistProduct(e, item)}
                            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-red-50 text-red-500 flex items-center justify-center shadow-xs border-0"
                            title="Remove"
                          >
                            <span
                              className="material-symbols-outlined text-[15px]"
                              style={{ fontVariationSettings: '"FILL" 1' }}
                            >
                              favorite
                            </span>
                          </button>
                        </div>

                        <div>
                          <h4 className="font-hanken font-extrabold text-xs uppercase text-black line-clamp-1 leading-tight">
                            {item.title}
                          </h4>
                          {(() => {
                            const effPrice = getEffectivePrice(item);
                            const hasPromo = effPrice < item.price;
                            return (
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
                            );
                          })()}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToCart(item, 1);
                          }}
                          className="w-full py-2 bg-[#FC7A00] text-white rounded-xl text-[9.5px] font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-1 shadow-2xs border-0"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            add_shopping_cart
                          </span>
                          <span>Add to Cart</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
