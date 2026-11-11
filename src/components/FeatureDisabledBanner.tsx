"use client";

import React from "react";
import { motion } from "framer-motion";

interface FeatureDisabledBannerProps {
  title?: string;
  message?: string;
  icon?: string;
}

export const FeatureDisabledBanner: React.FC<FeatureDisabledBannerProps> = ({
  title = "Operation Unavailable",
  message = "This operation is currently not available. Please try again later.",
  icon = "block",
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-amber-50 border border-amber-200/80 rounded-2xl text-center space-y-3 max-w-md mx-auto my-4 shadow-sm"
    >
      <div className="w-12 h-12 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
        <span className="material-symbols-outlined text-[24px]">{icon}</span>
      </div>
      <div>
        <h3 className="font-hanken font-bold text-sm text-amber-900 uppercase tracking-wider">{title}</h3>
        <p className="font-hanken text-xs text-amber-800/90 mt-1 leading-relaxed">
          {message}
        </p>
      </div>
    </motion.div>
  );
};
