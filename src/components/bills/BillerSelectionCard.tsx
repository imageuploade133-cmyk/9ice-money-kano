"use client";

import React from "react";
import { Biller } from "./types";

interface BillerSelectionCardProps {
  billers: Biller[];
  selectedBiller: Biller | null;
  isLoading: boolean;
  onSelectBiller: (biller: Biller) => void;
}

export const BillerSelectionCard: React.FC<BillerSelectionCardProps> = ({
  billers,
  selectedBiller,
  isLoading,
  onSelectBiller,
}) => {
  return (
    <div className="premium-gradient-card premium-gradient-border p-6 shadow-none space-y-4">
      <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
        Choose Network / Provider
      </label>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-gray-50 border border-gray-200 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {billers.map((b) => {
            const isSelected = selectedBiller?.id === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelectBiller(b)}
                className={`p-3 rounded-2xl border text-left transition-all duration-300 flex items-center gap-3 cursor-pointer shadow-none ${
                  isSelected
                    ? "bg-orange-50/50 border-[#FC7A00]"
                    : "bg-gray-50/50 border-gray-150 hover:bg-gray-50"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl border border-gray-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 relative ${
                    isSelected ? "border-[#FC7A00]" : ""
                  }`}
                >
                  {b.logo ? (
                    <img
                      src={b.logo}
                      alt={b.name}
                      className="w-full h-full object-contain p-1"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="font-extrabold text-xs text-gray-700">
                      {b.name.substring(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-hanken text-[11px] font-extrabold text-black truncate leading-tight">
                    {b.name}
                  </p>
                  <p className="font-hanken text-[8.5px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                    Select
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
