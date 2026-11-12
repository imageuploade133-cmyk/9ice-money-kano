"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { BillItem, parseDataPlan, getDataPlanCategory } from "./types";

interface BillPlanSelectionCardProps {
  items: BillItem[];
  selectedItem: BillItem | null;
  isLoading: boolean;
  pageCategory: string;
  onSelectItem: (item: BillItem) => void;
}

export const BillPlanSelectionCard: React.FC<BillPlanSelectionCardProps> = ({
  items,
  selectedItem,
  isLoading,
  pageCategory,
  onSelectItem,
}) => {
  const [activeDataTab, setActiveDataTab] = useState<string>("ALL");
  const sortedItems = [...items].sort((a, b) => a.amount - b.amount);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="premium-gradient-card premium-gradient-border p-6 shadow-none space-y-4"
    >
      <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
        Choose Plan / Package
      </label>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 bg-gray-50 border border-gray-150 rounded-2xl animate-pulse flex flex-col justify-between p-3.5"
            >
              <div className="flex justify-between items-center">
                <div className="h-4 bg-gray-200 rounded w-12" />
                <div className="h-3 bg-gray-200 rounded w-10" />
              </div>
              <div className="h-3 bg-gray-200 rounded w-20 mt-2" />
              <div className="h-4 bg-gray-200 rounded w-1/2 mt-4" />
            </div>
          ))}
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="py-8 text-center text-gray-400 font-hanken text-xs font-semibold">
          No plans available from this provider.
        </div>
      ) : pageCategory === "DATA" ? (
        <div className="space-y-4">
          <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin no-scrollbar">
            {[
              { id: "ALL", label: "All Plans" },
              { id: "1GB", label: "1GB / Popular" },
              { id: "DAILY", label: "Daily Plans" },
              { id: "WEEKEND", label: "Weekend" },
              { id: "WEEKLY", label: "Weekly" },
              { id: "MONTHLY", label: "Monthly / More" },
            ].map((tab) => {
              const count =
                tab.id === "ALL"
                  ? sortedItems.length
                  : sortedItems.filter((item) => getDataPlanCategory(item) === tab.id).length;

              const isTabActive = activeDataTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveDataTab(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-[11px] font-bold tracking-tight whitespace-nowrap flex items-center gap-1.5 transition-all duration-200 cursor-pointer border ${
                    isTabActive
                      ? "bg-black border-black text-white"
                      : "bg-white border-gray-150 text-gray-600 hover:border-gray-200"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono font-black ${
                      isTabActive ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {(() => {
            const filteredPlans = sortedItems.filter((item) => {
              if (activeDataTab === "ALL") return true;
              return getDataPlanCategory(item) === activeDataTab;
            });

            if (filteredPlans.length === 0) {
              return (
                <div className="py-8 text-center text-gray-400 font-hanken text-xs font-semibold">
                  No plans available under this category.
                </div>
              );
            }

            return (
              <div className="grid grid-cols-2 gap-3 pr-1">
                {filteredPlans.map((i) => {
                  const isSelected = selectedItem?.id === i.id;
                  const planInfo = parseDataPlan(i.name);

                  return (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => onSelectItem(i)}
                      className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between h-[120px] transition-all duration-300 cursor-pointer shadow-none ${
                        isSelected
                          ? "bg-orange-50/50 border-[#FC7A00]"
                          : "bg-gray-50/50 border-gray-150 hover:bg-gray-50"
                      }`}
                    >
                      <div className="w-full">
                        <div className="flex justify-between items-start gap-1 w-full">
                          <span
                            className={`px-2 py-0.5 rounded-lg font-mono text-[11px] font-black tracking-tight leading-none ${
                              isSelected ? "bg-[#FC7A00] text-white" : "bg-gray-200 text-gray-700"
                            }`}
                          >
                            {planInfo.size}
                          </span>
                          <span className="text-[8px] text-gray-400 font-bold uppercase truncate">
                            {planInfo.duration}
                          </span>
                        </div>
                        <p className="font-hanken text-[10px] font-extrabold text-black mt-2 leading-tight line-clamp-2">
                          {planInfo.displayName}
                        </p>
                      </div>

                      <div className="w-full text-right mt-2 pt-1 border-t border-gray-100/30 flex justify-between items-center">
                        <span className="text-[7.5px] text-gray-400 font-bold uppercase">Price</span>
                        <span className="font-mono text-[11.5px] font-black text-black">
                          ₦{i.amount.toLocaleString()}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
      ) : (
        /* Standard package selector (e.g. Airtime, Cable, Utility) */
        <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1 no-scrollbar">
          {sortedItems.map((i) => {
            const isSelected = selectedItem?.id === i.id;
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => onSelectItem(i)}
                className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all duration-300 cursor-pointer shadow-none ${
                  isSelected
                    ? "bg-orange-50/50 border-[#FC7A00]"
                    : "bg-gray-50/50 border-gray-150 hover:bg-gray-50"
                }`}
              >
                <div className="min-w-0 flex-1 pr-3">
                  <p className="font-hanken text-[12px] font-extrabold text-black leading-tight">
                    {i.name}
                  </p>
                  <p className="font-hanken text-[9px] text-gray-400 font-bold mt-1 uppercase tracking-wider">
                    {i.is_fixed_amount ? "Standard Package" : "Custom Payment Amount"}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span
                    className={`px-3 py-1.5 rounded-full font-mono text-[11px] font-black ${
                      isSelected ? "bg-[#FC7A00] text-white" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {i.is_fixed_amount ? `₦${i.amount.toLocaleString()}` : "Enter Amount"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};
