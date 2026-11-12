"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";

export function PhoneNumberSection() {
  const { userData, updateUserData } = useAuth();
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhoneNumber) return;
    if (!/^\d{10,15}$/.test(newPhoneNumber.trim())) {
      toast.error("Please enter a valid phone number containing 10 to 15 digits.");
      return;
    }

    setIsSavingPhone(true);
    try {
      await updateUserData({
        phoneNumber: newPhoneNumber.trim()
      });
      toast.success("Phone number successfully added to your profile!");
      setNewPhoneNumber("");
    } catch (err: any) {
      console.error("Failed to save phone number:", err);
      toast.error(err.message || "Failed to update phone number. Please try again.");
    } finally {
      setIsSavingPhone(false);
    }
  };

  const registeredPhone = (userData?.phoneNumber || userData?.phone) as string | undefined;

  if (registeredPhone) {
    return (
      <section className="premium-gradient-card premium-gradient-border p-6 space-y-4">
        <h3 className="font-hanken font-bold text-sm tracking-wider uppercase text-gray-500 border-b border-gray-100/60 pb-2.5">
          Registered Phone Number
        </h3>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-emerald-600">check_circle</span>
          <div>
            <p className="font-hanken text-xs font-semibold text-black">
              {registeredPhone}
            </p>
            <p className="font-hanken text-[10px] text-gray-400">
              Your phone number is securely registered and verified.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="premium-gradient-card premium-gradient-border p-6 space-y-4">
      <h3 className="font-hanken font-bold text-sm tracking-wider uppercase text-[#FC7A00] border-b border-gray-100/60 pb-2.5">
        Add Phone Number
      </h3>
      <p className="font-hanken text-xs text-gray-500">
        You currently do not have a phone number associated with your profile. Please add your registered WhatsApp number to secure and enable full wallet features.
      </p>
      <form onSubmit={handleSavePhone} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-black">WhatsApp Phone Number</label>
          <input
            type="tel"
            required
            value={newPhoneNumber}
            onChange={(e) => setNewPhoneNumber(e.target.value.replace(/\D/g, ""))}
            className="w-full bg-white border border-black rounded-2xl px-4 py-3.5 text-xs font-semibold text-black placeholder-gray-400 outline-none focus:border-black/60 shadow-sm transition-all"
            placeholder="e.g. 2348031234567"
          />
          <p className="text-[9px] text-gray-400">Include your country code (e.g. 234 for Nigeria) with no spaces or leading plus sign.</p>
        </div>
        <button
          type="submit"
          disabled={isSavingPhone || !newPhoneNumber}
          className="w-full h-11 bg-black hover:bg-black/80 text-white font-hanken font-bold text-xs rounded-2xl cursor-pointer shadow active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isSavingPhone ? "Saving..." : "Add Phone Number to Profile"}
        </button>
      </form>
    </section>
  );
}
