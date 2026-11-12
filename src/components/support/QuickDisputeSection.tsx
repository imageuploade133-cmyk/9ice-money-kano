"use client";

import React from "react";
import { toast } from "sonner";

export function QuickDisputeSection() {
  const handleSimulateDispute = (type: string) => {
    toast.info(`Dispute ticket for "${type}" initiated! Our support system is generating your tracking reference...`);
    setTimeout(() => {
      toast.success("Ticket #ET-99382 Created. A care representative will reach out in a few minutes.");
    }, 1500);
  };

  return (
    <section className="premium-gradient-card premium-gradient-border p-5 space-y-3 bg-white shadow-sm">
      <div>
        <h4 className="font-hanken font-bold text-xs text-black">Need Quick Troubleshooting?</h4>
        <p className="font-hanken text-[10px] text-gray-400 mt-0.5">Click any category to raise a priority claim instantly</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => handleSimulateDispute("Failed Transfer Return")}
          className="p-3 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-xl text-left transition-colors active:scale-95 cursor-pointer flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px] text-[#FC7A00]">payments</span>
          <span className="font-hanken text-[10px] font-bold text-black leading-tight">Failed Transfer</span>
        </button>
        <button
          type="button"
          onClick={() => handleSimulateDispute("Biometric Re-calibration")}
          className="p-3 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-xl text-left transition-colors active:scale-95 cursor-pointer flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px] text-emerald-500">face</span>
          <span className="font-hanken text-[10px] font-bold text-black leading-tight">KYC / Face ID</span>
        </button>
      </div>
    </section>
  );
}
