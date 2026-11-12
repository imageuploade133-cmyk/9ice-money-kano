"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StoreItem, StoreCategory } from "./types";

interface StoreSearchModalProps {
  isOpen: boolean;
  searchModalQuery: string;
  searchModalCategory: string;
  categories: StoreCategory[];
  items: StoreItem[];
  visibleSearchLimit: number;
  onClose: () => void;
  onSearchModalQueryChange: (query: string) => void;
  onSearchModalCategoryChange: (category: string) => void;
  onLoadMore: () => void;
  onOpenProductPage: (item: StoreItem) => void;
}

export const StoreSearchModal: React.FC<StoreSearchModalProps> = ({
  isOpen,
  searchModalQuery,
  searchModalCategory,
  categories,
  items,
  visibleSearchLimit,
  onClose,
  onSearchModalQueryChange,
  onSearchModalCategoryChange,
  onLoadMore,
  onOpenProductPage,
}) => {
  if (!isOpen) return null;

  const q = searchModalQuery.toLowerCase().trim();
  const results = items.filter((item) => {
    const matchesCategory =
      searchModalCategory === "ALL" ||
      item.category.toLowerCase() === searchModalCategory.toLowerCase();
    const matchesQuery =
      !q ||
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q);
    return matchesCategory && matchesQuery;
  });

  const paginatedResults = results.slice(0, visibleSearchLimit);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100005] bg-white flex flex-col justify-between overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 350 }}
            className="w-full h-full flex flex-col text-black max-w-md mx-auto overflow-hidden will-change-transform"
          >
            {/* Header with Gradient Search Input Container & Back Button */}
            <div className="px-4 py-3 flex items-center justify-between gap-2.5 flex-shrink-0 border-b border-gray-100 bg-white/95 backdrop-blur-md">
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-800 transition-colors cursor-pointer border-0 flex-shrink-0"
                title="Back"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>

              {/* Enhanced Search Bar Container with Gradient Border */}
              <div className="relative flex-1 rounded-2xl bg-gradient-to-r from-[#FC7A00] via-amber-400 to-[#E06600] p-[1.5px] shadow-xs">
                <div className="relative w-full h-full bg-white rounded-[14px] flex items-center">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">
                    search
                  </span>
                  <input
                    type="text"
                    autoFocus
                    value={searchModalQuery}
                    onChange={(e) => onSearchModalQueryChange(e.target.value)}
                    placeholder="Search store products, gear, hardware..."
                    className="w-full bg-transparent rounded-[14px] pl-9 pr-8 py-2 text-xs font-semibold text-black placeholder-gray-400 outline-none border-0 shadow-none"
                  />
                  {searchModalQuery && (
                    <button
                      type="button"
                      onClick={() => onSearchModalQueryChange("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black border-0"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:text-black transition-colors cursor-pointer border-0 flex-shrink-0"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="px-5 py-2 flex gap-2 overflow-x-auto no-scrollbar border-b border-gray-100 flex-shrink-0 select-none">
              {categories
                .filter((c) => !c.isHidden)
                .map((cat) => {
                  const isActive = searchModalCategory.toLowerCase() === cat.name.toLowerCase();
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => onSearchModalCategoryChange(cat.name)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer border-0 ${
                        isActive
                          ? "bg-[#FC7A00] text-white shadow-xs"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar pb-24">
              {results.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mx-auto text-gray-300">
                    <span className="material-symbols-outlined text-[32px]">search_off</span>
                  </div>
                  <h3 className="font-bodoni font-bold text-base text-black">No Products Found</h3>
                  <p className="font-hanken text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
                    {q
                      ? `No store items matched "${q}". Try searching another keyword.`
                      : "No products match the selected category filter."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider">
                    Showing {paginatedResults.length} of {results.length} matched products
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {paginatedResults.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          onClose();
                          onOpenProductPage(item);
                        }}
                        className="bg-gray-50 rounded-2xl p-3 flex flex-col justify-between space-y-2.5 cursor-pointer hover:bg-gray-100 transition-all border-0 shadow-xs"
                      >
                        <div className="w-full h-24 rounded-xl bg-white relative overflow-hidden flex items-center justify-center p-1 border-0">
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
                        </div>
                        <div>
                          <h4 className="font-hanken font-extrabold text-xs uppercase text-black line-clamp-1 leading-tight">
                            {item.title}
                          </h4>
                          <p className="font-mono font-black text-xs text-[#FC7A00] mt-0.5">
                            ₦{item.price.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {results.length > visibleSearchLimit && (
                    <div className="pt-3 text-center">
                      <button
                        type="button"
                        onClick={onLoadMore}
                        className="px-6 py-3 bg-[#FC7A00] text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all cursor-pointer border-0 shadow-xs"
                      >
                        Load More Products ({results.length - visibleSearchLimit} remaining)
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
