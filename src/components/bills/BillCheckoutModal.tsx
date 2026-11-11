"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Biller, BillItem, WalletType } from "./types";
import { toast } from "sonner";

interface BillCheckoutModalProps {
  isOpen: boolean;
  selectedBiller: Biller | null;
  selectedItem: BillItem | null;
  pageCategory: string;
  finalAmount: number;
  balance: number;
  bonusBalance: number;
  walletTypeSelected: WalletType;
  customerId: string;
  validatedName: string;
  customAmount: string;
  isValidating: boolean;
  isPaying: boolean;
  isAirtimeInvalid: boolean;
  onClose: () => void;
  onWalletTypeChange: (walletType: WalletType) => void;
  onCustomerIdChange: (val: string) => void;
  onValidateCustomer: () => void;
  onCustomAmountChange: (val: string) => void;
  onPayTrigger: () => void;
  getCustomerFieldLabel: () => string;
  getReviewModalTitle: () => string;
}

export const BillCheckoutModal: React.FC<BillCheckoutModalProps> = ({
  isOpen,
  selectedBiller,
  selectedItem,
  pageCategory,
  finalAmount,
  balance,
  bonusBalance,
  walletTypeSelected,
  customerId,
  validatedName,
  customAmount,
  isValidating,
  isPaying,
  isAirtimeInvalid,
  onClose,
  onWalletTypeChange,
  onCustomerIdChange,
  onValidateCustomer,
  onCustomAmountChange,
  onPayTrigger,
  getCustomerFieldLabel,
  getReviewModalTitle,
}) => {
  if (!isOpen || !selectedItem || !selectedBiller) return null;

  const formatPhoneNumberForVtu = (rawPhone: string): string => {
    let cleaned = rawPhone.replace(/\D/g, "");
    if (cleaned.startsWith("234") && cleaned.length > 10) {
      cleaned = "0" + cleaned.slice(3);
    }
    return cleaned;
  };

  const handlePickContact = async () => {
    // The mobile app provides a native contact picker because the Web Contact Picker
    // API is not available in Android WebView on many devices.
    if (typeof window !== "undefined") {
      const bridge = (window as any).flutter_inappwebview;
      if (bridge && typeof bridge.callHandler === "function") {
        try {
          const nativeContact = await bridge.callHandler("pickContact");
          if (nativeContact && typeof nativeContact === "object") {
            const rawPhone =
              nativeContact.primaryPhone ||
              nativeContact.phone ||
              nativeContact.phoneNumber ||
              (Array.isArray(nativeContact.phones) ? nativeContact.phones[0] : "");

            if (typeof rawPhone === "string" && rawPhone.trim()) {
              const formatted = formatPhoneNumberForVtu(rawPhone);
              onCustomerIdChange(formatted);

              const contactName =
                nativeContact.displayName ||
                nativeContact.name ||
                "";

              toast.success(
                `Selected contact: ${contactName ? contactName + " " : ""}(${formatted})`,
              );
            } else {
              toast.error("The selected contact has no phone number.");
            }
          }
          return;
        } catch (err) {
          console.error("[Contact Picker] Native picker failed:", err);
          toast.error("Unable to access contacts list.");
          return;
        }
      }
    }

    // Normal browser fallback for platforms that implement Contact Picker.
    if (
      typeof window !== "undefined" &&
      "contacts" in navigator &&
      "select" in (navigator as any).contacts
    ) {
      try {
        const contacts = await (navigator as any).contacts.select(
          ["tel", "name"],
          { multiple: false },
        );

        if (
          contacts &&
          contacts.length > 0 &&
          contacts[0].tel &&
          contacts[0].tel.length > 0
        ) {
          const rawTel = contacts[0].tel[0];
          const formatted = formatPhoneNumberForVtu(rawTel);
          onCustomerIdChange(formatted);

          const contactName =
            contacts[0].name && contacts[0].name.length > 0
              ? contacts[0].name[0]
              : "";

          toast.success(
            `Selected contact: ${contactName ? contactName + " " : ""}(${formatted})`,
          );
        }
      } catch (err: any) {
        if (err.name !== "InvalidStateError" && err.name !== "AbortError") {
          toast.error("Unable to access contacts list.");
        }
      }
    } else {
      toast.info(
        "Contact picker is not supported on this browser/device. Please enter the number manually.",
      );
    }
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000]"
          />

          {/* Bottom Sheet Review & Checkout panel */}
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[32px] z-[1001] p-6 pb-8 shadow-2xl text-black max-h-[85dvh] overflow-y-auto custom-scrollbar will-change-transform"
          >
            {/* Drag handle */}
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mb-4 mx-auto" />

            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h3 className="font-hanken font-bold text-base text-black uppercase tracking-wide">
                {getReviewModalTitle()}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer shadow-none"
              >
                <span className="material-symbols-outlined text-[16px] font-bold">close</span>
              </button>
            </div>

            <div className="space-y-5">
              {/* Selected Plan overview detail card */}
              <div className="bg-gray-50 border border-gray-150 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400 font-bold uppercase">Provider</span>
                  <div className="flex items-center gap-2">
                    {selectedBiller.logo && (
                      <div className="w-5 h-5 rounded-md border border-gray-200 bg-white flex items-center justify-center overflow-hidden p-0.5 shrink-0">
                        <img
                          src={selectedBiller.logo}
                          alt={selectedBiller.name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      </div>
                    )}
                    <span className="font-black text-black">{selectedBiller.name}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400 font-bold uppercase">Plan Package</span>
                  <span className="font-black text-black text-right max-w-[200px] truncate">
                    {selectedItem.name}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-gray-100 pt-2 mt-2">
                  <span className="text-gray-400 font-bold uppercase">Price</span>
                  <span className="font-mono font-black text-primary text-sm">
                    ₦{finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Payment Source Selection Toggle (Only for Airtime & Data) */}
              {(pageCategory === "AIRTIME" || pageCategory === "DATA") && (
                <div className="space-y-2 text-left font-hanken">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                    Select Payment Wallet
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Main NGN Wallet Card */}
                    <button
                      type="button"
                      onClick={() => onWalletTypeChange("MAIN")}
                      className={`p-[1.5px] rounded-2xl transition-all duration-300 cursor-pointer text-left ${
                        walletTypeSelected === "MAIN"
                          ? "bg-gradient-to-r from-[#FC7A00] via-[#FF9022] to-[#E06600] shadow-md shadow-[#FC7A00]/15 scale-[1.02]"
                          : "bg-gray-200/80 hover:bg-gray-300 opacity-90"
                      }`}
                    >
                      <div className={`p-3 rounded-[14.5px] h-full flex flex-col justify-between transition-colors ${
                        walletTypeSelected === "MAIN" ? "bg-white" : "bg-gray-50/90"
                      }`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`material-symbols-outlined text-base ${
                              walletTypeSelected === "MAIN" ? "text-[#FC7A00]" : "text-gray-400"
                            }`}>
                              account_balance_wallet
                            </span>
                            <span className="font-extrabold text-[10px] text-gray-700 uppercase tracking-wider">
                              Main Wallet
                            </span>
                          </div>
                          {walletTypeSelected === "MAIN" && (
                            <span className="material-symbols-outlined text-xs text-[#FC7A00] font-black">
                              check_circle
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-sm font-black text-black tracking-tight">
                          ₦{balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </button>

                    {/* Bonus Reward Wallet Card */}
                    <button
                      type="button"
                      onClick={() => onWalletTypeChange("BONUS")}
                      className={`p-[1.5px] rounded-2xl transition-all duration-300 cursor-pointer text-left ${
                        walletTypeSelected === "BONUS"
                          ? "bg-gradient-to-r from-emerald-500 via-teal-400 to-[#70AC00] shadow-md shadow-emerald-500/15 scale-[1.02]"
                          : "bg-gray-200/80 hover:bg-gray-300 opacity-90"
                      }`}
                    >
                      <div className={`p-3 rounded-[14.5px] h-full flex flex-col justify-between transition-colors ${
                        walletTypeSelected === "BONUS" ? "bg-white" : "bg-gray-50/90"
                      }`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`material-symbols-outlined text-base ${
                              walletTypeSelected === "BONUS" ? "text-emerald-600" : "text-gray-400"
                            }`}>
                              stars
                            </span>
                            <span className="font-extrabold text-[10px] text-gray-700 uppercase tracking-wider">
                              Bonus Wallet
                            </span>
                          </div>
                          {walletTypeSelected === "BONUS" && (
                            <span className="material-symbols-outlined text-xs text-emerald-600 font-black">
                              check_circle
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-sm font-black text-emerald-600 tracking-tight">
                          ₦{bonusBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Recipient Details Input Field */}
              <div className="space-y-1.5 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                    {getCustomerFieldLabel()}
                  </label>
                  {(pageCategory === "AIRTIME" || pageCategory === "DATA") && (
                    <button
                      type="button"
                      onClick={handlePickContact}
                      className="text-[10px] font-bold text-[#FC7A00] hover:text-[#E06600] flex items-center gap-1 cursor-pointer transition-colors bg-orange-50 px-2 py-0.5 rounded-lg border border-[#FC7A00]/20"
                    >
                      <span className="material-symbols-outlined text-xs">contacts</span>
                      <span>Choose from Contacts</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={(pageCategory === "AIRTIME" || pageCategory === "DATA") ? "tel" : "text"}
                    inputMode={(pageCategory === "AIRTIME" || pageCategory === "DATA") ? "numeric" : undefined}
                    pattern={(pageCategory === "AIRTIME" || pageCategory === "DATA") ? "[0-9]*" : undefined}
                    placeholder={`Enter your ${getCustomerFieldLabel().toLowerCase()}`}
                    value={customerId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (pageCategory === "AIRTIME" || pageCategory === "DATA") {
                        onCustomerIdChange(val.replace(/\D/g, ""));
                      } else {
                        onCustomerIdChange(val);
                      }
                    }}
                    className={`w-full bg-white border border-black rounded-2xl px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all ${
                      (pageCategory === "AIRTIME" || pageCategory === "DATA") ? "pr-24" : customerId.length >= 6 ? "pr-20" : "pr-4"
                    }`}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {(pageCategory === "AIRTIME" || pageCategory === "DATA") && (
                      <button
                        type="button"
                        onClick={handlePickContact}
                        title="Pick from Contacts"
                        className="p-1.5 rounded-xl bg-gray-100 hover:bg-orange-100 text-gray-600 hover:text-[#FC7A00] transition-all cursor-pointer flex items-center justify-center border border-gray-200"
                      >
                        <span className="material-symbols-outlined text-base">contacts</span>
                      </button>
                    )}
                    {customerId.length >= 6 && (
                      <button
                        type="button"
                        onClick={onValidateCustomer}
                        disabled={isValidating}
                        className="bg-[#FFF0E0] hover:bg-[#FFE0CC] text-primary text-[10px] font-black uppercase px-2.5 py-1.5 rounded-xl active:scale-95 transition-all"
                      >
                        {isValidating ? "Validating..." : "Verify"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {validatedName && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-left">
                  <p className="text-[8px] font-black uppercase text-emerald-600 tracking-wider">
                    Verified Recipient Owner
                  </p>
                  <p className="font-hanken text-xs font-black text-emerald-700 uppercase mt-0.5">
                    {validatedName}
                  </p>
                </div>
              )}

              {/* Manual custom Amount field if not fixed amount */}
              {!selectedItem.is_fixed_amount && (
                <div className="space-y-1.5 text-left">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                    Enter Custom Payment Amount (NGN)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono font-bold text-base text-gray-400">
                      ₦
                    </span>
                    <input
                      type="number"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      placeholder="Amount (e.g. 2000)"
                      value={customAmount}
                      onChange={(e) => onCustomAmountChange(e.target.value.replace(/\D/g, ""))}
                      className="w-full bg-white border border-black rounded-2xl pl-9 pr-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
                    />
                  </div>
                  {isAirtimeInvalid && customAmount !== "" && (
                    <p className="text-[10px] text-rose-500 font-bold text-left mt-1">
                      Airtime amount must be between ₦100 and ₦50,000.
                    </p>
                  )}
                </div>
              )}

              {/* Proceed to checkout trigger */}
              <button
                type="button"
                onClick={onPayTrigger}
                disabled={
                  isPaying ||
                  !customerId ||
                  (pageCategory === "AIRTIME" && isAirtimeInvalid) ||
                  finalAmount <= 0
                }
                className="w-full py-4 mt-2 bg-gradient-to-r from-[#FC7A00] to-[#E06600] text-white text-xs font-black uppercase tracking-widest rounded-xl border border-white/10 cursor-pointer hover:brightness-105 active:scale-98 transition-all disabled:opacity-50"
              >
                Proceed to Pay (₦{finalAmount.toLocaleString()})
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
