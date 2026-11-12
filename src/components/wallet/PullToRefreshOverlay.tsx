"use client";

import React from "react";
import { motion } from "framer-motion";
import { AppLogo } from "@/components/AppLogo";
import { useAppConfig } from "@/lib/ConfigContext";

interface PullToRefreshOverlayProps {
  pullDistance: number;
  isRefreshing: boolean;
}

export const PullToRefreshOverlay: React.FC<PullToRefreshOverlayProps> = ({
  pullDistance,
  isRefreshing,
}) => {
  const { config } = useAppConfig();
  const isThresholdReached = pullDistance >= 50;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[100] pointer-events-none select-none transition-all duration-150"
      style={{
        top: `${Math.min(115, 60 + pullDistance * 0.8)}px`,
        opacity: pullDistance > 8 || isRefreshing ? 1 : 0,
        transform: `translateX(-50%) scale(${
          isRefreshing
            ? 1
            : Math.min(1.15, 0.6 + (pullDistance / 50) * 0.45)
        })`,
      }}
    >
      {/* Sleek Native iOS/Android Floating Circular App Icon Card (NO TEXT) */}
      <div
        className={`w-11 h-11 rounded-full bg-white/95 backdrop-blur-xl border flex items-center justify-center transition-all duration-200 shadow-[0_8px_24px_rgba(0,0,0,0.12)] ${
          isThresholdReached || isRefreshing
            ? "border-[#FC7A00] ring-4 ring-[#FC7A00]/15"
            : "border-gray-200"
        }`}
      >
        <motion.div
          animate={
            isRefreshing
              ? { rotate: 360, scale: [1, 1.1, 1] }
              : { rotate: pullDistance * 7.2, scale: isThresholdReached ? 1.12 : 1 }
          }
          transition={
            isRefreshing
              ? {
                  rotate: { repeat: Infinity, duration: 1.0, ease: "linear" },
                  scale: { repeat: Infinity, duration: 1.0, ease: "easeInOut" },
                }
              : { duration: 0 }
          }
          className="w-6 h-6 flex items-center justify-center flex-shrink-0"
        >
          <AppLogo logoUrl={config?.logoUrl} size={24} />
        </motion.div>
      </div>
    </div>
  );
};
