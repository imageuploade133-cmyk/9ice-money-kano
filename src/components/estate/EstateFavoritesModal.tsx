"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EstateProperty } from "@/estate/types";
import { PropertyCard } from "./PropertyCard";
import { useModalBackHandler } from "@/lib/useModalBackHandler";

interface EstateFavoritesModalProps {
  isOpen: boolean;
  properties: EstateProperty[];
  isLoading?: boolean;
  onClose: () => void;
  onOpenPropertyDetails: (property: EstateProperty) => void;
  onRemoveFavorite: (e: React.MouseEvent, property: EstateProperty) => void;
  onRefresh?: () => void;
}

export const EstateFavoritesModal: React.FC<EstateFavoritesModalProps> = ({
  isOpen,
  properties,
  isLoading = false,
  onClose,
  onOpenPropertyDetails,
  onRemoveFavorite,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  useModalBackHandler(isOpen, onClose, "estate-favorites-modal");

  if (!isOpen) return null;

  const filteredProperties = properties.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      p.title.toLowerCase().includes(q) ||
      p.location?.address?.toLowerCase().includes(q) ||
      p.location?.city?.toLowerCase().includes(q) ||
      p.propertyType.toLowerCase().includes(q) ||
      p.purpose.toLowerCase().includes(q)
    );
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed inset-0 z-[100000] bg-white w-full h-full flex flex-col justify-between overflow-hidden text-black font-hanken"
        >
          {/* Header Bar */}
          <div className="px-4 py-3.5 flex items-center justify-between flex-shrink-0 bg-white z-20">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all cursor-pointer border-0 active:scale-90"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
              </button>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-red-500 text-[20px]">
                    favorite
                  </span>
                  <h2 className="font-hanken font-extrabold text-sm text-black uppercase tracking-tight">
                    Saved Favorites
                  </h2>
                </div>
                <p className="font-hanken text-[10px] text-gray-400 font-bold uppercase">
                  {properties.length} Property Listing{properties.length === 1 ? "" : "s"} Saved
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-all cursor-pointer border-0 active:scale-90"
                  title="Refresh Favorites"
                >
                  <span className="material-symbols-outlined text-[18px]">refresh</span>
                </button>
              )}
            </div>
          </div>

          {/* Main Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar pb-24">
            {/* Search Box within Favorites */}
            {properties.length > 0 && (
              <div className="relative w-full bg-gradient-to-r from-[#FC7A00] via-amber-400 to-[#E06600] p-[1.5px] rounded-2xl shadow-2xs">
                <div className="relative w-full bg-white rounded-[14.5px] flex items-center">
                  <span className="material-symbols-outlined absolute left-3.5 text-[#FC7A00] text-[20px]">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search saved properties..."
                    className="w-full bg-transparent border-0 pl-11 pr-10 py-3 text-xs font-semibold text-black placeholder-gray-400 outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 text-gray-400 hover:text-black border-0 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Content List */}
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-72 bg-white border border-gray-150 rounded-2xl p-3 animate-pulse space-y-3"
                  >
                    <div className="w-full h-40 bg-gray-100 rounded-xl" />
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredProperties.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center space-y-3 border border-gray-150 shadow-xs my-8">
                <span className="material-symbols-outlined text-[56px] text-gray-300">
                  favorite_border
                </span>
                <h3 className="font-bodoni font-bold text-lg text-black">
                  {properties.length === 0 ? "No Saved Favorites Yet" : "No Matching Saved Properties"}
                </h3>
                <p className="font-hanken text-xs text-gray-500 max-w-sm mx-auto">
                  {properties.length === 0
                    ? "Click the heart icon on any property listing to save it to your personal favorites collection."
                    : "No properties in your saved favorites match your search criteria."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredProperties.map((prop) => (
                  <PropertyCard
                    key={prop.id}
                    property={prop}
                    onOpenDetails={onOpenPropertyDetails}
                    onSaveFavorite={onRemoveFavorite}
                    isSaved={true}
                  />
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
