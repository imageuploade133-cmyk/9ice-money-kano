"use client";

import React from "react";
import { StoreCategory } from "./types";

interface StoreCategoryChipsProps {
  categories: StoreCategory[];
  activeCategory: string;
  onSelectCategory: (categoryName: string) => void;
}

export const StoreCategoryChips: React.FC<StoreCategoryChipsProps> = ({
  categories,
  activeCategory,
  onSelectCategory,
}) => {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-4 select-none">
      {categories
        .filter((c) => !c.isHidden)
        .map((cat) => {
          const isActive = activeCategory.toLowerCase() === cat.name.toLowerCase();
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.name)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 border-0 ${
                isActive
                  ? "bg-[#FC7A00] text-white shadow-xs"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              {cat.imageUrl ? (
                <div className="w-5 h-5 rounded-md bg-gray-100 p-0.5 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img
                    src={cat.imageUrl}
                    alt={cat.name}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
              ) : (
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    isActive ? "text-white" : "text-[#FC7A00]"
                  }`}
                >
                  {cat.iconName || "category"}
                </span>
              )}
              <span>{cat.name}</span>
            </button>
          );
        })}
    </div>
  );
};
