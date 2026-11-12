"use client";

import React from "react";
import { StoreSettings } from "./types";

interface StoreSearchBarProps {
  searchQuery: string;
  settings: StoreSettings;
  onClick: () => void;
  onClearQuery: (e: React.MouseEvent) => void;
}

export const StoreSearchBar: React.FC<StoreSearchBarProps> = ({
  searchQuery,
  settings,
  onClick,
  onClearQuery,
}) => {
  return (
    <div
      className="relative w-full mb-4 transition-all duration-300 cursor-pointer rounded-2xl bg-gradient-to-r from-[#FC7A00] via-amber-400 to-[#E06600] p-[1.5px] shadow-sm hover:shadow-md"
      style={{
        marginTop: `${settings.searchBarMarginTop || 0}px`,
      }}
      onClick={onClick}
    >
      <div className="relative w-full h-full bg-white rounded-[14px] flex items-center">
        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">
          search
        </span>
        <input
          type="text"
          readOnly
          value={searchQuery}
          placeholder="Search store hardware, memberships, gear..."
          className="w-full bg-transparent rounded-[14px] pl-11 pr-10 py-3 text-xs font-semibold text-black placeholder-gray-400 outline-none border-0 shadow-none transition-all cursor-pointer"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={onClearQuery}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>
    </div>
  );
};
