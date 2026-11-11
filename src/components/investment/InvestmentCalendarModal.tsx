"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SavingsPlanData } from "@/lib/savings-plans-types";
import { useModalBackHandler } from "@/lib/useModalBackHandler";

interface InvestmentCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  calendarMonth: Date;
  setCalendarMonth: React.Dispatch<React.SetStateAction<Date>>;
  selectedPlan: SavingsPlanData;
  customMaturityDate: string;
  onSelectDate: (dateStr: string) => void;
}

export function InvestmentCalendarModal({
  isOpen,
  onClose,
  calendarMonth,
  setCalendarMonth,
  selectedPlan,
  customMaturityDate,
  onSelectDate,
}: InvestmentCalendarModalProps) {
  useModalBackHandler(isOpen, onClose, "investment-calendar-modal");

  if (!isOpen) return null;

  const minAllowedDate = new Date();
  minAllowedDate.setDate(minAllowedDate.getDate() + (selectedPlan.minCustomDays || 1));
  minAllowedDate.setHours(0, 0, 0, 0);

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const daysArray: (Date | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    daysArray.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    daysArray.push(new Date(year, month, day));
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 220 }}
          className="relative bg-white w-full max-w-md rounded-t-[32px] p-6 shadow-2xl border-t border-gray-100 z-10"
        >
          <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bodoni text-[16px] font-bold text-black flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[20px]">
                calendar_month
              </span>
              Pick Unlock Date
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-500 hover:text-black transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>

          <div className="flex items-center justify-between mb-4 px-1">
            <button
              type="button"
              onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}
              className="w-8 h-8 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <span className="font-hanken text-sm font-extrabold text-black">
              {monthNames[month]} {year}
            </span>
            <button
              type="button"
              onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}
              className="w-8 h-8 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((dayName) => (
              <span key={dayName} className="font-hanken text-[10px] font-extrabold text-gray-400 uppercase tracking-wider py-1">
                {dayName}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-6">
            {daysArray.map((dayDate, idx) => {
              if (!dayDate) {
                return <div key={`empty-${idx}`} className="aspect-square" />;
              }

              const compareDate = new Date(dayDate);
              compareDate.setHours(0, 0, 0, 0);

              const isBeforeMin = compareDate < minAllowedDate;
              const formattedValue = dayDate.toISOString().split("T")[0];
              const isSelected = customMaturityDate === formattedValue;

              return (
                <button
                  key={formattedValue}
                  type="button"
                  disabled={isBeforeMin}
                  onClick={() => {
                    onSelectDate(formattedValue);
                    onClose();
                  }}
                  className={`aspect-square rounded-xl font-hanken text-xs font-bold transition-all flex flex-col items-center justify-center relative cursor-pointer ${
                    isSelected
                      ? "bg-primary text-white shadow-sm"
                      : isBeforeMin
                      ? "text-gray-300 bg-gray-50/50 cursor-not-allowed line-through"
                      : "text-black hover:bg-gray-100 active:scale-95"
                  }`}
                >
                  <span>{dayDate.getDate()}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 border border-gray-200 text-gray-500 hover:text-black rounded-xl font-hanken text-[12.5px] font-bold tracking-wide active:scale-95 transition-all"
          >
            Close Calendar
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
