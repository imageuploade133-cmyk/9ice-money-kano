"use client";

import React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Biller, BillItem, BillsReceipt } from "./types";

interface BillSuccessReceiptProps {
  receipt: BillsReceipt;
  selectedBiller: Biller | null;
  selectedItem: BillItem | null;
  customerId: string;
  finalAmount: number;
  getCustomerFieldLabel: () => string;
  onPayAnother: () => void;
}

export const BillSuccessReceipt: React.FC<BillSuccessReceiptProps> = ({
  receipt,
  selectedBiller,
  selectedItem,
  customerId,
  finalAmount,
  getCustomerFieldLabel,
  onPayAnother,
}) => {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  return (
    <motion.div
      key="receipt"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="premium-gradient-card premium-gradient-border p-6 shadow-none flex flex-col items-center text-center relative overflow-hidden"
    >
      {/* Visual Stamp */}
      <div className="absolute right-[-10px] top-[-10px] text-[120px] text-emerald-500/5 select-none font-bold rotate-12 pointer-events-none">
        PAID
      </div>

      <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-4 shadow-none animate-bounce-subtle">
        <span
          className="material-symbols-outlined text-[36px]"
          style={{ fontVariationSettings: '"FILL" 1' }}
        >
          check_circle
        </span>
      </div>

      <h2 className="font-bodoni text-[20px] font-bold text-black mb-1">
        Payment Successful
      </h2>
      <p className="font-hanken text-[11.5px] text-gray-500 max-w-[280px] leading-relaxed mb-6">
        Sovereign transaction logged atomically in your secure ledger database.
      </p>

      {/* Receipt Grid */}
      <div className="w-full bg-white border border-gray-150 rounded-2xl p-4 space-y-3 text-left font-hanken text-xs mb-6 shadow-none">
        <div className="flex justify-between border-b border-gray-100 pb-2.5 text-gray-500">
          <span className="font-semibold">Provider</span>
          <div className="flex items-center gap-1.5">
            {selectedBiller?.logo && (
              <div className="w-4 h-4 rounded border border-gray-200 bg-white flex items-center justify-center overflow-hidden p-0.5 shrink-0">
                <img
                  src={selectedBiller.logo}
                  alt={selectedBiller.name}
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <span className="text-black font-extrabold">{selectedBiller?.name}</span>
          </div>
        </div>

        <div className="flex justify-between border-b border-gray-100 pb-2.5 text-gray-500">
          <span className="font-semibold">Package Name</span>
          <span className="text-black font-extrabold">{selectedItem?.name}</span>
        </div>

        <div className="flex justify-between border-b border-gray-100 pb-2.5 text-gray-500">
          <span className="font-semibold">{getCustomerFieldLabel()}</span>
          <span className="text-black font-mono font-bold">{customerId}</span>
        </div>

        <div className="flex justify-between border-b border-gray-100 pb-2.5 text-gray-500">
          <span className="font-semibold">Ref Code</span>
          <div className="flex items-center gap-1.5">
            <span className="text-black font-mono font-bold truncate max-w-[120px]">
              {receipt.reference || receipt.tx_ref || "N/A"}
            </span>
            <button
              type="button"
              onClick={() =>
                copyToClipboard(
                  receipt.reference || receipt.tx_ref || "N/A",
                  "Reference"
                )
              }
              className="text-primary font-bold hover:underline"
            >
              Copy
            </button>
          </div>
        </div>

        {receipt.pins && Array.isArray(receipt.pins) && (
          <div className="border-b border-gray-100 pb-2.5 pt-1 text-gray-500 text-left">
            <span className="font-semibold block mb-2 text-black">Purchased WAEC E-PINs:</span>
            <div className="space-y-2">
              {receipt.pins.map(
                (pinObj: { pin: string; serial?: string }, index: number) => (
                  <div
                    key={index}
                    className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl flex flex-col space-y-1"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-400">PIN</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-black font-extrabold">{pinObj.pin}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(pinObj.pin, "PIN")}
                          className="text-primary font-black hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    {pinObj.serial && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-gray-400">SERIAL</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-black font-bold">{pinObj.serial}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(pinObj.serial!, "Serial")}
                            className="text-primary font-black hover:underline"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-1">
          <span className="font-black text-black">Total Paid Amount</span>
          <span className="font-mono text-emerald-600 font-black text-sm">
            ₦{Number(receipt.amount || finalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onPayAnother}
        className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-widest rounded-xl border border-white/10 cursor-pointer hover:brightness-105 active:scale-98 transition-all"
      >
        Pay Another Bill
      </button>
    </motion.div>
  );
};
