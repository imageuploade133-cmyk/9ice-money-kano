"use client";

import React from "react";
import { useRouter } from "next/navigation";

export const Promotions: React.FC = () => {
  const router = useRouter();

  return (
    <section className="space-y-3 min-[360px]:space-y-4 mb-stack-xl">
      <div className="flex justify-between items-end">
        <h3 className="font-headline-md text-[18px] min-[360px]:text-[24px] text-on-surface font-bold">
          Privileges
        </h3>
        <button
          onClick={() => router.push("/referrals")}
          className="font-label-sm text-[11px] min-[360px]:text-label-sm text-primary font-bold cursor-pointer hover:underline"
        >
          View All
        </button>
      </div>

      <div
        onClick={() => router.push("/referrals")}
        className="relative overflow-hidden rounded-3xl p-5 text-white bg-gradient-to-br from-[#FC7A00] via-[#F4511E] to-[#D84315] border border-black/10 shadow-md shadow-orange-500/10 cursor-pointer active:scale-[0.99] transition-all group"
      >
        {/* Abstract glowing background shapes */}
        <div className="absolute right-0 top-0 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none group-hover:scale-110 transition-transform duration-500" />
        <div className="absolute -left-10 -bottom-10 w-28 h-28 bg-black/10 rounded-full blur-xl pointer-events-none" />

        {/* Floating icon background representation */}
        <div className="absolute right-4 bottom-4 opacity-15 text-[90px] select-none pointer-events-none translate-x-1/6 translate-y-1/6">
          <span className="material-symbols-outlined font-black text-white">
            group_add
          </span>
        </div>

        <div className="flex items-start gap-4 relative z-10">
          <div className="w-11 h-11 rounded-full bg-white/20 border border-white/30 flex items-center justify-center shrink-0 shadow-inner">
            <span className="material-symbols-outlined text-white text-[22px] font-bold">
              celebration
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="bg-white/20 text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">
                Refer & Earn
              </span>
              <span className="text-white/80 text-[9px] font-bold uppercase tracking-wider">
                Unlimited Rewards
              </span>
            </div>

            <h4 className="font-headline-md text-[16px] min-[360px]:text-[19px] text-white mb-1.5 font-bold leading-tight">
              Get ₦1,000 For Every Referral!
            </h4>
            <p className="font-body-md text-[11px] min-[360px]:text-[12px] text-white/90 mb-4 leading-relaxed max-w-[90%]">
              Invite friends to E-Tech using your Account ID. Receive <strong className="text-white underline decoration-wavy">₦1,000 NGN</strong> instantly once they fund their wallet with a minimum of ₦2,000.
            </p>

            <button className="bg-white text-[#D84315] font-label-sm text-[11.5px] font-bold px-4.5 py-2.5 rounded-2xl hover:bg-white/95 active:scale-95 transition-all flex items-center gap-1.5 shadow-md shadow-black/5 cursor-pointer">
              <span>Start Inviting</span>
              <span className="material-symbols-outlined text-xs font-bold">
                arrow_forward
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
