"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence, PanInfo, useAnimation } from "framer-motion";
import { useModalBackHandler } from "@/lib/useModalBackHandler";

interface LogoutDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const LogoutDrawer: React.FC<LogoutDrawerProps> = ({ isOpen, onClose, onConfirm }) => {
  const controls = useAnimation();

  useModalBackHandler(isOpen, onClose, "logout-drawer");

  // Prevent background body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Handle drag to dismiss gesture
  const handleDragEnd = async (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) {
      onClose();
    } else {
      controls.start({ y: 0 });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Blur/Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] pointer-events-auto"
          />

          {/* Bottom Drawer Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
            drag="y"
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 450 }}
            dragElastic={{ top: 0, bottom: 0.2 }} // Minimize elastic overshoot to avoid hooking
            onDragEnd={handleDragEnd}
            className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[24px] border-t border-gray-200 p-6 pb-8 z-[9999] flex flex-col items-center select-none cursor-default shadow-none touch-none"
          >
            {/* Instagram/TikTok Draggable indicator bar */}
            <div className="w-10 h-1 bg-gray-300 rounded-full mb-4 cursor-grab active:cursor-grabbing" />

            {/* Header style like Instagram/TikTok comment drawer */}
            <div className="w-full flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
              <div className="w-8" /> {/* Spacer matched to button width */}
              <h2 className="font-hanken font-bold text-base text-black text-center">
                Sign Out
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] font-bold">close</span>
              </button>
            </div>

            <div className="w-14 h-14 rounded-full bg-[#dc3545]/10 flex items-center justify-center text-[#dc3545] mb-4">
              <span className="material-symbols-outlined text-[28px]">logout</span>
            </div>

            <p className="font-hanken text-sm text-gray-500 text-center max-w-[290px] mb-8 leading-relaxed">
              Are you sure you want to log out of your secure E-Tech account? You will need your login details and PIN to gain access again.
            </p>

            {/* Clear stack button actions that are completely visible and overlay BottomNav */}
            <div className="flex flex-col gap-3 w-full">
              <button
                type="button"
                onClick={onConfirm}
                className="w-full py-4 bg-[#dc3545] hover:bg-[#c82333] active:scale-95 text-white text-xs font-bold uppercase tracking-widest rounded-2xl transition-all shadow-none cursor-pointer"
              >
                Log Out
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-4 bg-white hover:bg-gray-50 active:scale-95 text-black text-xs font-bold uppercase tracking-widest rounded-2xl transition-all shadow-none cursor-pointer premium-gradient-border"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
