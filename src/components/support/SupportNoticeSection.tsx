"use client";

import React from "react";

export function SupportNoticeSection() {
  return (
    <section className="premium-gradient-card premium-gradient-border p-5 space-y-4 bg-white shadow-sm">
      <h4 className="font-hanken font-bold text-[12px] uppercase tracking-wider text-gray-400 border-b border-gray-100 pb-2">
        Calling Support: Steps & Security Notice
      </h4>

      <div className="space-y-3.5">
        {/* Step 1 */}
        <div className="flex gap-3 items-start">
          <div className="w-5 h-5 rounded-full bg-[#FC7A00] text-white flex items-center justify-center font-mono text-[10px] font-bold mt-0.5 flex-shrink-0">
            1
          </div>
          <div>
            <p className="font-hanken font-bold text-xs text-black">Locate Your Account Details</p>
            <p className="font-hanken text-[10px] text-gray-400 mt-0.5 leading-relaxed font-semibold">
              Find your Customer ID or registered email. Providing this to our agent expedites identity confirmation.
            </p>
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex gap-3 items-start">
          <div className="w-5 h-5 rounded-full bg-[#FC7A00] text-white flex items-center justify-center font-mono text-[10px] font-bold mt-0.5 flex-shrink-0">
            2
          </div>
          <div>
            <p className="font-hanken font-bold text-xs text-black">Tap the Phone Link below</p>
            <p className="font-hanken text-[10px] text-gray-400 mt-0.5 leading-relaxed font-semibold">
              We support one-touch direct dial. Click any hotline below to initiate a premium, immediate call connection.
            </p>
          </div>
        </div>

        {/* Step 3 - Critical Security Notice */}
        <div className="flex gap-3 items-start p-3 bg-error-container/40 border border-error/15 rounded-2xl">
          <div className="w-5 h-5 rounded-full bg-error text-error-container flex items-center justify-center mt-0.5 flex-shrink-0">
            <span className="material-symbols-outlined text-[12px] font-bold">gpp_maybe</span>
          </div>
          <div>
            <p className="font-hanken font-bold text-xs text-error">CRITICAL SECURITY WARNING</p>
            <p className="font-hanken text-[10px] text-gray-600 mt-0.5 leading-relaxed font-semibold">
              Our support agents will <strong className="text-black underline">NEVER</strong> ask for your Access PIN, login password, or transaction OTP tokens. Never share this data with anyone over phone or chat.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
