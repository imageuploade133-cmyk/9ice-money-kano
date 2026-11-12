"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export const OfflineDrawer: React.FC = () => {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOffline(!window.navigator.onLine);

      const handleOnline = () => {
        setIsOffline(false);
        toast.success("Back online. Synced!");
      };

      const handleOffline = () => {
        setIsOffline(true);
        toast.error("You are offline.");
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  const handleManualCheck = () => {
    if (typeof window !== "undefined") {
      const isNowOnline = window.navigator.onLine;
      if (isNowOnline) {
        setIsOffline(false);
        toast.success("Back online. Synced!");
      } else {
        toast.error("Still offline. Check connection.");
      }
    }
  };

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ y: -60, x: "-50%", opacity: 0 }}
          animate={{ y: 0, x: "-50%", opacity: 1 }}
          exit={{ y: -60, x: "-50%", opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 350 }}
          className="fixed left-1/2 z-[9999999] w-[90%] max-w-sm bg-gradient-to-r from-[#0c1324] to-[#141d30] border border-[#FC7A00]/40 rounded-2xl p-3.5 shadow-xl flex items-center justify-between gap-3 text-white backdrop-blur-md"
          style={{ top: "16px" }}
        >
          {/* Status Details */}
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              {/* Pulsing ring */}
              <span className="absolute -inset-1 rounded-full bg-[#FC7A00]/25 animate-ping" />
              <div className="w-8 h-8 rounded-full bg-[#FC7A00]/10 flex items-center justify-center text-[#FC7A00] border border-[#FC7A00]/20">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4.5 h-4.5">
                  <path d="M23.64 5.39a19.78 19.78 0 0 0-3.32-2.1l-.83 1.44a17.84 17.84 0 0 1 2.83 1.77l1.32-1.11zM1 9l2 2c2.99-2.99 7.02-4.59 11-4.17l.83-1.44C10.05 4.8 5.16 6.51 1 9zm21.64.39A19.5 19.5 0 0 0 16 7.42l-.83 1.44a17.7 17.7 0 0 1 5.15 1.64l1.32-1.11zM12 18.25a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0z" />
                </svg>
              </div>
            </div>

            <div className="text-left">
              <h4 className="font-hanken font-extrabold text-[11px] uppercase tracking-widest text-[#FC7A00]">
                No Internet
              </h4>
              <p className="font-hanken text-[10px] text-gray-300 font-medium leading-tight">
                Check your connection
              </p>
            </div>
          </div>

          {/* Quick Action Button */}
          <button
            type="button"
            onClick={handleManualCheck}
            className="px-3.5 py-1.5 bg-[#FC7A00] hover:bg-[#D46600] active:scale-95 text-white text-[9px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-none flex-shrink-0"
          >
            Retry
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
