"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { triggerHaptic } from "@/lib/haptics";

interface EstateHeaderProps {
  title?: string;
  subtitle?: string;
  favoritesCount?: number;
  showBackButton?: boolean;
  onRefresh?: () => void;
  onOpenFavorites?: () => void;
}

export const EstateHeader: React.FC<EstateHeaderProps> = ({
  title,
  subtitle,
  favoritesCount = 0,
  showBackButton = false,
  onRefresh,
  onOpenFavorites,
}) => {
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [headerTitle, setHeaderTitle] = useState<string>(title || "E-Global Estate");
  const [headerSubtitle, setHeaderSubtitle] = useState<string>(subtitle || "Houses, Apartments & Land");
  const [titleColor, setTitleColor] = useState<string>("#000000");
  const [subtitleColor, setSubtitleColor] = useState<string>("#FC7A00");

  useEffect(() => {
    fetch("/api/estate/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.settings) {
          const s = data.settings;
          if (s.estateLogoUrl) setLogoUrl(s.estateLogoUrl);
          if (s.estateTitle) setHeaderTitle(s.estateTitle);
          if (s.estateSubtitle) setHeaderSubtitle(s.estateSubtitle);
          if (s.estateTitleColor) setTitleColor(s.estateTitleColor);
          if (s.estateSubtitleColor) setSubtitleColor(s.estateSubtitleColor);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md pt-3.5 pb-2.5 px-4 md:px-8 shadow-2xs">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {showBackButton ? (
            <Link
              href="/estate"
              onClick={() => triggerHaptic()}
              className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 hover:text-black active:scale-90 transition-all cursor-pointer flex-shrink-0 border-0"
              title="Back to Marketplace"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </Link>
          ) : logoUrl ? (
            <div className="w-9 h-9 rounded-xl border border-gray-200 overflow-hidden relative flex-shrink-0 bg-white">
              <Image src={logoUrl} alt="Estate Logo" fill className="object-contain p-0.5" unoptimized />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FFF5EB] to-[#FFF0E0] flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[#FC7A00] text-[20px]">
                domain
              </span>
            </div>
          )}

          <div className="min-w-0">
            <h1
              style={{ color: titleColor }}
              className="font-hanken text-[17px] min-[375px]:text-[19px] font-black tracking-tight leading-tight truncate"
            >
              {headerTitle}
            </h1>
            <p
              style={{ color: subtitleColor }}
              className="font-hanken text-[9.5px] font-extrabold uppercase tracking-widest mt-0.5 truncate"
            >
              {headerSubtitle}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {onOpenFavorites && (
            <button
              type="button"
              onClick={() => { triggerHaptic(); onOpenFavorites(); }}
              className="relative w-8 h-8 min-[375px]:w-9 min-[375px]:h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 active:scale-90 transition-all cursor-pointer border-0"
              title="Saved Properties"
            >
              <span className="material-symbols-outlined text-[18px] text-red-500">
                favorite
              </span>
              {favoritesCount > 0 && (
                <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center border border-white">
                  {favoritesCount}
                </span>
              )}
            </button>
          )}

          <Link
            href="/estate/seller"
            className="px-3.5 py-2 rounded-xl bg-[#FC7A00] hover:bg-[#e06600] text-white text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer border-0 shadow-2xs"
          >
            <span className="material-symbols-outlined text-[16px]">add_home_work</span>
            <span className="hidden sm:inline">Seller Hub</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
