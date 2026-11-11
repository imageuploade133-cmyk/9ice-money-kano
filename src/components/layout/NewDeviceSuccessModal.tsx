"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useModalBackHandler } from "@/lib/useModalBackHandler";
import { AppLogo } from "@/components/AppLogo";
import { getDetailedDeviceName } from "@/lib/device-util";

export interface NewDeviceSuccessModalProps {
  isOpen: boolean;
  previousDeviceName?: string;
  currentDeviceName?: string;
  onContinue: () => void;
}

export function NewDeviceSuccessModal({
  isOpen,
  previousDeviceName,
  currentDeviceName,
  onContinue,
}: NewDeviceSuccessModalProps) {
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);

  useModalBackHandler(isOpen, onContinue, "new-device-success-modal");

  if (!isOpen) return null;

  const localDevice = getDetailedDeviceName();
  const prevDevice = (!previousDeviceName || previousDeviceName === "Web Browser" || previousDeviceName === "Web/Mobile Browser")
    ? "Previous Mobile Device"
    : previousDeviceName;
  const currDevice = (!currentDeviceName || currentDeviceName === "Web Browser" || currentDeviceName === "Web/Mobile Browser")
    ? localDevice
    : currentDeviceName;

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newRipple = { id: Date.now(), x, y };
    setRipples((prev) => [...prev, newRipple]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 600);
    onContinue();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="fixed inset-0 z-[200000] w-full h-full bg-white flex flex-col justify-between overflow-y-auto p-4 sm:p-6 text-black"
      >
        <div className="max-w-md w-full mx-auto my-auto flex flex-col items-center text-center justify-center space-y-4 sm:space-y-5 py-2">
          {/* Top Logo / Security Emblem */}
          <div className="relative flex flex-col items-center justify-center">
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 mb-2 flex items-center justify-center">
              <AppLogo size={64} />
            </div>
            <div className="w-12 h-12 rounded-2xl bg-[#70AC00]/10 border border-[#70AC00]/30 flex items-center justify-center text-[#70AC00] -mt-5 shadow-xs bg-white">
              <span className="material-symbols-outlined text-2xl font-bold">verified</span>
            </div>
          </div>

          <div>
            <span className="px-3 py-1 rounded-full text-[10px] font-black bg-[#70AC00]/15 text-[#70AC00] border border-[#70AC00]/30 uppercase tracking-widest inline-block mb-1.5">
              NEW DEVICE ACTIVATED
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-black tracking-tight leading-tight">
              Logged Out From Old Device
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 font-semibold leading-relaxed mt-1.5 max-w-sm mx-auto">
              You have successfully verified and logged into your account on this new device. Your old device session has been automatically signed out.
            </p>
          </div>

          {/* Session Cards Breakdown */}
          <div className="w-full space-y-3 text-left">
            {/* Old Device Card (Revoked) */}
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-rose-100/80 flex items-center justify-center text-rose-600 shrink-0">
                    <span className="material-symbols-outlined text-base font-bold">phonelink_off</span>
                  </div>
                  <span className="text-[11px] font-black text-rose-600 uppercase tracking-wider">
                    Old Device Logged Out
                  </span>
                </div>
                <span className="text-[9px] bg-rose-100 text-rose-700 font-black px-2.5 py-0.5 rounded-full border border-rose-200 uppercase tracking-wider">
                  Signed Out
                </span>
              </div>
              <p className="text-xs font-bold text-gray-900 truncate pl-9 font-mono tracking-tight">{prevDevice}</p>
            </div>

            {/* New Device Card (Active Now) */}
            <div className="p-[1.5px] rounded-2xl bg-gradient-to-r from-[#FC7A00] via-[#FF9022] to-[#70AC00] shadow-xs">
              <div className="p-4 rounded-[14px] bg-emerald-50/60 border border-emerald-200/80">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                      <span className="material-symbols-outlined text-base font-bold">smartphone</span>
                    </div>
                    <span className="text-[11px] font-black text-emerald-700 uppercase tracking-wider">
                      Active Device Now
                    </span>
                  </div>
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-black px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    Active
                  </span>
                </div>
                <p className="text-xs font-bold text-black truncate pl-9 font-mono tracking-tight">{currDevice}</p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="w-full pt-2">
            <button
              type="button"
              onClick={handleButtonClick}
              className="relative overflow-hidden w-full bg-gradient-to-r from-[#FC7A00] to-[#FF9022] hover:brightness-105 active:scale-98 text-white py-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-[#FC7A00]/20"
            >
              {ripples.map((ripple) => (
                <span
                  key={ripple.id}
                  className="absolute bg-white/30 rounded-full pointer-events-none animate-ripple"
                  style={{
                    left: ripple.x,
                    top: ripple.y,
                    width: 100,
                    height: 100,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              ))}
              <span>Continue to Wallet</span>
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Footer Security Notice */}
        <div className="max-w-md w-full mx-auto text-center pt-3 border-t border-gray-200 shrink-0">
          <p className="text-[10px] text-gray-500 font-semibold flex items-center justify-center gap-1">
            <span className="material-symbols-outlined text-emerald-600 text-xs font-bold">shield</span>
            E-Global Pay Enterprise Security Guard • Single Active Device
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
