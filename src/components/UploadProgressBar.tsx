"use client";

import React from "react";

interface UploadProgressBarProps {
  progress: number;
  label?: string;
  isUploading: boolean;
}

export const UploadProgressBar: React.FC<UploadProgressBarProps> = ({
  progress,
  label = "Uploading File...",
  isUploading,
}) => {
  if (!isUploading) return null;

  return (
    <div className="p-3.5 bg-orange-50/90 border border-orange-200/90 rounded-2xl space-y-2 my-2.5 shadow-2xs">
      <div className="flex items-center justify-between text-xs font-black text-[#FC7A00]">
        <span className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
          <span>{label}</span>
        </span>
        <span className="font-mono font-black text-xs">{progress}%</span>
      </div>
      <div className="w-full bg-orange-200/60 h-2.5 rounded-full overflow-hidden p-0.5">
        <div
          className="bg-gradient-to-r from-[#FC7A00] via-amber-400 to-[#E06600] h-full rounded-full transition-all duration-300 shadow-2xs"
          style={{ width: `${Math.max(5, Math.min(progress, 100))}%` }}
        />
      </div>
    </div>
  );
};
