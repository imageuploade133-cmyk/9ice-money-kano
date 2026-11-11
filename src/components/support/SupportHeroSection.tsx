"use client";

import React from "react";

interface SupportHeroSectionProps {
  userName: string;
}

export function SupportHeroSection({ userName }: SupportHeroSectionProps) {
  const firstName = userName.split(" ")[0];

  return (
    <section className="premium-gradient-card premium-gradient-border p-5 relative overflow-hidden bg-gradient-to-br from-surface-container-highest to-surface-container">
      <div className="absolute right-[-10px] top-[-10px] opacity-10">
        <span className="material-symbols-outlined text-[120px] text-primary" style={{ fontVariationSettings: '"wght" 300' }}>
          support_agent
        </span>
      </div>

      <div className="flex gap-4 items-start relative z-10">
        <div className="w-12 h-12 rounded-2xl bg-[#FC7A00]/10 flex items-center justify-center text-[#FC7A00] flex-shrink-0">
          <span className="material-symbols-outlined text-[28px]">headset_mic</span>
        </div>
        <div>
          <h3 className="font-hanken font-extrabold text-sm text-black">How can we assist you, {firstName}?</h3>
          <p className="font-hanken text-xs text-gray-500 mt-1 leading-relaxed font-semibold">
            Reach out directly via call or chat for immediate resolution of transfer issues, limits, or security concerns.
          </p>
        </div>
      </div>
    </section>
  );
}
