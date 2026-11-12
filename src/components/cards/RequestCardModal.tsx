"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { BillingAddress } from "@/types/cards";

interface RequestCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultName: string;
  isMinting: boolean;
  mintProgress: number;
  mintStatusText: string;
  onRequestCard: (data: {
    currency: "USD" | "NGN";
    amount: number;
    billingAddress: BillingAddress;
    nameOnCard: string;
  }) => Promise<void>;
}

export const RequestCardModal: React.FC<RequestCardModalProps> = ({
  isOpen,
  onClose,
  defaultName,
  isMinting,
  mintProgress,
  mintStatusText,
  onRequestCard,
}) => {
  const [formCurrency, setFormCurrency] = useState<"USD" | "NGN">("USD");
  const [initialAmount, setInitialAmount] = useState("10");
  const [formName, setFormName] = useState(defaultName || "DISPLAY NAME");
  const [billingCountry, setBillingCountry] = useState("US");
  const [billingState, setBillingState] = useState("CA");
  const [billingCity, setBillingCity] = useState("San Francisco");
  const [billingPostalCode, setBillingPostalCode] = useState("94105");
  const [billingStreetAddress, setBillingStreetAddress] = useState("333 Fremont Street");

  useModalBackHandler(isOpen, onClose, "request-card-modal");

  useEffect(() => {
    if (defaultName) {
      setFormName(defaultName.toUpperCase());
    }
  }, [defaultName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isMinting) return;

    // Field validation with explicit toast notifications for missing fields
    if (!initialAmount || initialAmount.trim() === "") {
      toast.error("Please fill in the Initial Funding Amount.");
      return;
    }

    const initAmt = Number(initialAmount);
    if (isNaN(initAmt) || initAmt < 0) {
      toast.error("Please enter a valid initial funding amount.");
      return;
    }

    if (!formName || formName.trim() === "") {
      toast.error("Please fill in the Card Holder Display Name.");
      return;
    }

    if (!billingCountry || billingCountry.trim() === "") {
      toast.error("Please fill in the Billing Country Code.");
      return;
    }

    if (!billingState || billingState.trim() === "") {
      toast.error("Please fill in the Billing State / Region.");
      return;
    }

    if (!billingCity || billingCity.trim() === "") {
      toast.error("Please fill in the Billing City.");
      return;
    }

    if (!billingPostalCode || billingPostalCode.trim() === "") {
      toast.error("Please fill in the Billing Postal / ZIP Code.");
      return;
    }

    if (!billingStreetAddress || billingStreetAddress.trim() === "") {
      toast.error("Please fill in the Billing Street Address.");
      return;
    }

    await onRequestCard({
      currency: formCurrency,
      amount: initAmt,
      nameOnCard: formName.trim(),
      billingAddress: {
        country: billingCountry.trim().toUpperCase(),
        state: billingState.trim(),
        city: billingCity.trim(),
        postalCode: billingPostalCode.trim(),
        address: billingStreetAddress.trim(),
      },
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-[99998]"
          />

          {/* High Z-Index Loading Progress Overlay during Card Minting */}
          <AnimatePresence>
            {isMinting && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100005] flex flex-col items-center justify-center p-6 text-white text-center select-none"
              >
                <div className="w-full max-w-xs bg-[#111827] border border-gray-800 rounded-3xl p-6 shadow-2xl space-y-5 flex flex-col items-center">
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                      className="absolute inset-0 rounded-full border-3 border-gray-800 border-t-[#FC7A00] border-r-[#FF9022]"
                    />
                    <span className="material-symbols-outlined text-[#FC7A00] text-[28px] animate-pulse">
                      credit_card
                    </span>
                  </div>

                  <div className="space-y-1 w-full">
                    <h4 className="font-hanken font-extrabold text-base text-white uppercase tracking-wider">
                      Minting Virtual Card
                    </h4>
                    <p className="font-mono text-2xl font-black text-[#FC7A00]">
                      {Math.min(100, Math.max(0, mintProgress))}%
                    </p>
                  </div>

                  {/* Progress Bar Container */}
                  <div className="w-full bg-gray-800 h-2.5 rounded-full overflow-hidden p-0.5 border border-gray-700">
                    <motion.div
                      className="bg-gradient-to-r from-[#FC7A00] to-[#FF9022] h-full rounded-full transition-all duration-200"
                      style={{ width: `${Math.min(100, Math.max(0, mintProgress))}%` }}
                    />
                  </div>

                  <p className="font-hanken text-[11px] font-bold text-gray-300 uppercase tracking-widest leading-relaxed h-8 flex items-center justify-center">
                    {mintStatusText || "PROCESSING VIRTUAL CARD ISSUANCE..."}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Full-Screen Hardware-Accelerated Container */}
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280, mass: 0.9 }}
            className="fixed inset-0 w-full h-full max-w-md mx-auto bg-white z-[99999] flex flex-col justify-between shadow-none overflow-hidden text-black will-change-transform"
          >
            {/* Full-screen Sticky Top Header with Single Close Button */}
            <div className="safe-top w-full px-6 py-4 flex justify-between items-center border-b border-gray-100 bg-white flex-shrink-0">
              <div className="w-8" />
              <h3 className="font-hanken font-extrabold text-base text-black text-center">
                Request Virtual Card
              </h3>
              <button
                type="button"
                disabled={isMinting}
                onClick={onClose}
                className="w-9 h-9 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition-all cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px] font-bold">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="flex-grow flex flex-col justify-between overflow-y-auto w-full">
              <div className="p-6 space-y-5 flex-grow">
                {/* Currency Selector */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">1. Select Card Currency</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormCurrency("USD")}
                      className={cn(
                        "p-3 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer",
                        formCurrency === "USD"
                          ? "border-[#FC7A00] bg-[#FC7A00]/5 ring-1 ring-[#FC7A00]"
                          : "border-gray-200 bg-white"
                      )}
                    >
                      <span className="material-symbols-outlined text-[20px] text-[#FC7A00]">currency_exchange</span>
                      <div>
                        <p className="font-hanken font-bold text-xs text-black">US Dollar (USD)</p>
                        <p className="font-hanken text-[9px] text-gray-400">$2.00 setup cost</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormCurrency("NGN")}
                      className={cn(
                        "p-3 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer",
                        formCurrency === "NGN"
                          ? "border-[#FC7A00] bg-[#FC7A00]/5 ring-1 ring-[#FC7A00]"
                          : "border-gray-200 bg-white"
                      )}
                    >
                      <span className="material-symbols-outlined text-[20px] text-[#FC7A00]">payments</span>
                      <div>
                        <p className="font-hanken font-bold text-xs text-black">Naira (NGN)</p>
                        <p className="font-hanken text-[9px] text-gray-400">Zero setup fee</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Initial Funding Amount */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">2. Initial Funding Amount</label>
                  <input
                    type="text"
                    value={initialAmount}
                    onChange={(e) => setInitialAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="w-full bg-white border border-black rounded-2xl px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                    placeholder="0.00"
                  />
                </div>

                {/* Display Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">3. Card Holder Display Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value.toUpperCase())}
                    className="w-full bg-white border border-black rounded-2xl px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                    placeholder="CARD DISPLAY NAME"
                  />
                </div>

                {/* Billing Address Details */}
                <div className="space-y-3.5 pt-2 border-t border-gray-100">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">4. Card Billing Address</label>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[8px] font-bold text-gray-400">Country Code</span>
                      <input
                        type="text"
                        value={billingCountry}
                        onChange={(e) => setBillingCountry(e.target.value.toUpperCase())}
                        className="w-full bg-white border border-black rounded-xl px-3 py-2 text-[11px] font-semibold text-black outline-none"
                        placeholder="US"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[8px] font-bold text-gray-400">State / Region</span>
                      <input
                        type="text"
                        value={billingState}
                        onChange={(e) => setBillingState(e.target.value)}
                        className="w-full bg-white border border-black rounded-xl px-3 py-2 text-[11px] font-semibold text-black outline-none"
                        placeholder="CA"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[8px] font-bold text-gray-400">City</span>
                      <input
                        type="text"
                        value={billingCity}
                        onChange={(e) => setBillingCity(e.target.value)}
                        className="w-full bg-white border border-black rounded-xl px-3 py-2 text-[11px] font-semibold text-black outline-none"
                        placeholder="San Francisco"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[8px] font-bold text-gray-400">Postal / ZIP Code</span>
                      <input
                        type="text"
                        value={billingPostalCode}
                        onChange={(e) => setBillingPostalCode(e.target.value)}
                        className="w-full bg-white border border-black rounded-xl px-3 py-2 text-[11px] font-semibold text-black outline-none"
                        placeholder="94105"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[8px] font-bold text-gray-400">Street Address</span>
                    <input
                      type="text"
                      value={billingStreetAddress}
                      onChange={(e) => setBillingStreetAddress(e.target.value)}
                      className="w-full bg-white border border-black rounded-xl px-3 py-2 text-[11px] font-semibold text-black outline-none"
                      placeholder="333 Fremont Street"
                    />
                  </div>
                </div>
              </div>

              {/* Footer Submit */}
              <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-col gap-3 flex-shrink-0">
                <div className="flex justify-between text-xs font-semibold text-gray-500">
                  <span>Card Issuance Setup:</span>
                  <span className="font-bold text-black">
                    {formCurrency === "USD" ? "$2.00 USD" : "Free (₦0.00)"}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isMinting}
                  className="w-full py-4 bg-gradient-to-r from-[#FC7A00] to-[#FF9022] hover:brightness-105 active:scale-95 text-white text-xs font-bold uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">add_card</span>
                  Mint Digital Card Now
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
