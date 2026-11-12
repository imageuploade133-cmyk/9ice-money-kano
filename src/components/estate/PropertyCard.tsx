"use client";

import React, { useState } from "react";
import Image from "next/image";
import { EstateProperty } from "@/estate/types";

interface PropertyCardProps {
  property: EstateProperty;
  onOpenDetails: (property: EstateProperty) => void;
  onSaveFavorite?: (e: React.MouseEvent, property: EstateProperty) => void;
  isSaved?: boolean;
  hideIcons?: boolean;
  onInspectAgent?: (e: React.MouseEvent, sellerId?: string, sellerName?: string, sellerPhone?: string) => void;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  onOpenDetails,
  onSaveFavorite,
  isSaved,
  hideIcons = false,
  onInspectAgent,
}) => {
  const images = property.images && property.images.length > 0 ? property.images : [];
  const [activeImgIndex, setActiveImgIndex] = useState(0);

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (images.length > 1) {
      setActiveImgIndex((prev) => (prev + 1) % images.length);
    }
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (images.length > 1) {
      setActiveImgIndex((prev) => (prev - 1 + images.length) % images.length);
    }
  };

  const displayImage = images[activeImgIndex] || "";

  return (
    <div
      onClick={() => onOpenDetails(property)}
      className="bg-gradient-to-br from-[#FC7A00] via-amber-300 to-[#E06600] p-[1.5px] rounded-2xl shadow-xs hover:shadow-xl hover:scale-[1.01] transition-all duration-300 cursor-pointer group relative overflow-hidden flex flex-col justify-between h-full"
    >
      <div className="bg-white rounded-[14.5px] p-3 space-y-3 h-full flex flex-col justify-between">
        <div className="space-y-2.5">
          {/* Property Thumbnail Container with Image Swiper */}
          <div className="w-full h-38 min-[375px]:h-42 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden relative flex items-center justify-center p-1">
            {displayImage ? (
              <Image
                src={displayImage}
                alt={property.title}
                fill
                className="object-cover transition-transform duration-500 ease-out"
                unoptimized
              />
            ) : (
              <span className="material-symbols-outlined text-[42px] text-gray-300">
                domain
              </span>
            )}

            {/* Agent Profile Icon & Name Badge on Top-Left */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onInspectAgent) {
                  onInspectAgent(e, property.sellerId, property.sellerName, property.sellerPhone);
                } else {
                  onOpenDetails(property);
                }
              }}
              className="absolute top-2.5 left-2.5 h-8 px-2.5 rounded-full bg-white/65 hover:bg-white/90 backdrop-blur-md flex items-center gap-1.5 text-black shadow-xs z-10 hover:scale-105 active:scale-95 transition-all border border-white/50 cursor-pointer overflow-hidden max-w-[60%]"
              title="View Agent Profile"
            >
              {property.sellerAvatarUrl ? (
                <div className="w-5 h-5 rounded-full overflow-hidden relative border border-[#FC7A00] flex-shrink-0">
                  <Image src={property.sellerAvatarUrl} alt="Agent" fill className="object-cover" unoptimized />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-[#FC7A00] text-white flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[15px] text-white">account_circle</span>
                </div>
              )}
              <span className="text-[9.5px] font-black text-black uppercase tracking-tight truncate">
                {property.sellerName || "Agent"}
              </span>
            </button>

            {/* Favorite Heart Trigger */}
            {onSaveFavorite && (
              <button
                type="button"
                onClick={(e) => onSaveFavorite(e, property)}
                className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center text-gray-700 hover:text-red-500 shadow-md z-10 transition-transform active:scale-90 border-0 cursor-pointer"
                title={isSaved ? "Remove Favorite" : "Save Property"}
              >
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    isSaved ? "text-red-500" : ""
                  }`}
                  style={{ fontVariationSettings: isSaved ? '"FILL" 1' : '"FILL" 0' }}
                >
                  favorite
                </span>
              </button>
            )}

            {/* Image Swap Prev/Next Arrow Triggers (when multiple images exist) */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrevImage}
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center opacity-80 group-hover:opacity-100 z-10 border-0 cursor-pointer active:scale-90 transition-all"
                  title="Previous Image"
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                </button>
                <button
                  type="button"
                  onClick={handleNextImage}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center opacity-80 group-hover:opacity-100 z-10 border-0 cursor-pointer active:scale-90 transition-all"
                  title="Next Image"
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </button>

                {/* Dot Pagination Indicator */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-xs">
                  {images.map((_, idx) => (
                    <div
                      key={idx}
                      className={`w-1.5 h-1.5 rounded-full transition-all ${
                        activeImgIndex === idx ? "bg-[#FC7A00] w-3" : "bg-white/60"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Status Pill Badge (Draft, Pending Review, Rejected, Published / Live) */}
            {property.status === "DRAFT" ? (
              <span className="absolute top-2.5 right-2.5 px-3 py-1 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider text-white bg-slate-700 shadow-lg border border-white/20 z-10">
                DRAFT
              </span>
            ) : property.status === "PENDING_REVIEW" ? (
              <span className="absolute top-2.5 right-2.5 px-3 py-1 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider text-white bg-red-600 shadow-lg border border-white/20 z-10">
                PENDING REVIEW
              </span>
            ) : property.status === "PUBLISHED" || property.status === "APPROVED" ? (
              <span className="absolute top-2.5 right-2.5 px-3 py-1 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider text-white bg-emerald-600 shadow-lg border border-white/20 z-10">
                PUBLISHED
              </span>
            ) : property.status === "REJECTED" ? (
              <span className="absolute top-2.5 right-2.5 px-3 py-1 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider text-white bg-rose-700 shadow-lg border border-white/20 z-10">
                REJECTED
              </span>
            ) : null}

            {/* Purpose Badge */}
            <span
              className={`absolute bottom-2.5 right-2.5 px-2.5 py-0.5 rounded-lg text-[8.5px] font-black uppercase tracking-wider text-white shadow-md backdrop-blur-xs z-10 ${
                property.purpose === "Sale"
                  ? "bg-emerald-600/90"
                  : property.purpose === "Short-let"
                  ? "bg-purple-600/90"
                  : "bg-[#FC7A00]/95"
              }`}
            >
              For {property.purpose}
            </span>

            {/* Featured Tag */}
            {property.featured && (
              <span className="absolute bottom-2.5 left-2.5 px-2.5 py-0.5 rounded-lg text-[8px] font-black uppercase bg-gradient-to-r from-amber-400 to-amber-500 text-black shadow-md flex items-center gap-1 z-10">
                <span className="material-symbols-outlined text-[10px]">star</span>
                <span>Featured</span>
              </span>
            )}
          </div>

          {/* Info Body */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="px-2 py-0.5 bg-orange-50 text-[#FC7A00] rounded-md text-[8.5px] font-black uppercase tracking-wider">
                {property.propertyType}
              </span>
              <span className="text-[9.5px] font-extrabold text-gray-500 flex items-center gap-0.5 truncate">
                <span className="material-symbols-outlined text-[12px] text-[#FC7A00]">location_on</span>
                <span>{property.location?.city || property.location?.state || "Nigeria"}</span>
              </span>
            </div>

            <h3 className="font-hanken font-extrabold text-xs text-black line-clamp-2 break-words group-hover:text-[#FC7A00] transition-colors leading-tight">
              {property.title}
            </h3>

            <p className="font-hanken text-[10.5px] text-gray-400 line-clamp-1 leading-relaxed">
              {property.location?.address}
            </p>

            {/* Features icons row */}
            {!hideIcons && (
              <div className="flex items-center gap-3 pt-1 text-[10px] font-bold text-gray-600 flex-wrap">
                {typeof property.bedrooms === "number" && property.bedrooms > 0 && (
                  <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg">
                    <span className="material-symbols-outlined text-[14px] text-gray-400">bed</span>
                    <span>{property.bedrooms} Bed</span>
                  </div>
                )}
                {typeof property.bathrooms === "number" && property.bathrooms > 0 && (
                  <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg">
                    <span className="material-symbols-outlined text-[14px] text-gray-400">bathtub</span>
                    <span>{property.bathrooms} Bath</span>
                  </div>
                )}
                {property.propertySize && (
                  <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg truncate">
                    <span className="material-symbols-outlined text-[14px] text-gray-400">square_foot</span>
                    <span>{property.propertySize}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Price Footer */}
        <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between">
          <div>
            <span className="font-mono font-black text-sm text-[#FC7A00]">
              ₦{property.price.toLocaleString()}
            </span>
            {property.purpose !== "Sale" && property.pricePeriod && property.pricePeriod !== "None" && (
              <span className="text-[9px] text-gray-400 font-bold"> /{property.pricePeriod}</span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetails(property);
            }}
            className="px-3 py-1.5 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white rounded-xl text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer border-0 shadow-xs hover:brightness-105 active:scale-95 flex items-center gap-1"
          >
            <span>Explore</span>
            <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
};
