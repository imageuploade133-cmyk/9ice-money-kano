"use client";

import React from "react";

interface ReferralSectionProps {
  onNavigateToReferrals: () => void;
}

export function ReferralSection({ onNavigateToReferrals }: ReferralSectionProps) {
  return (
    <section className="premium-gradient-card premium-gradient-border p-6 space-y-4 relative overflow-hidden">
      <div className="absolute right-0 top-0 opacity-5 text-[100px] select-none pointer-events-none translate-x-1/6 -translate-y-1/6">
        <span className="material-symbols-outlined font-black text-black">group_add</span>
      </div>

      <div className="border-b border-gray-100/60 pb-2.5">
        <h3 className="font-hanken font-bold text-sm tracking-wider uppercase text-gray-500">
          Referral Program
        </h3>
        <p className="font-hanken text-[10px] text-gray-400 mt-0.5">Invite your friends and earn premium bonuses</p>
      </div>

      <p className="font-hanken text-xs leading-relaxed text-gray-600">
        Share your Account ID with users, and earn <strong className="text-black">₦1,000 Naira</strong> atomically once they register and fund their wallets with a minimum of ₦2,000 Naira.
      </p>

      <button
        type="button"
        onClick={onNavigateToReferrals}
        className="w-full bg-[#FC7A00] hover:bg-[#E06600] text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
      >
        <span className="material-symbols-outlined text-[16px]">group_add</span>
        View My Referrals
      </button>
    </section>
  );
}
