"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface CpanelActionItem {
  label: string;
  icon?: string;
  onClick: () => void;
  variant?: "default" | "danger" | "warning" | "emerald";
  disabled?: boolean;
}

interface CpanelActionDropdownProps {
  actions: CpanelActionItem[];
  align?: "left" | "right";
  direction?: "down" | "up";
  isDark?: boolean;
}

export const CpanelActionDropdown: React.FC<CpanelActionDropdownProps> = ({
  actions,
  align = "right",
  direction = "down",
  isDark = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 192; // 12rem / w-48
    const menuEstimatedHeight = Math.min(validActions.length * 40 + 16, 260);

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let targetTop = 0;
    let targetLeft = 0;

    // Determine vertical direction dynamically if boundary constraint occurs
    let shouldOpenUp = direction === "up";
    if (shouldOpenUp && spaceAbove < menuEstimatedHeight && spaceBelow > spaceAbove) {
      shouldOpenUp = false;
    } else if (!shouldOpenUp && spaceBelow < menuEstimatedHeight && spaceAbove > spaceBelow) {
      shouldOpenUp = true;
    }

    if (shouldOpenUp) {
      targetTop = rect.top + window.scrollY - menuEstimatedHeight - 6;
    } else {
      targetTop = rect.bottom + window.scrollY + 6;
    }

    // Horizontal alignment & boundary constraint check
    if (align === "right") {
      targetLeft = rect.right + window.scrollX - menuWidth;
    } else {
      targetLeft = rect.left + window.scrollX;
    }

    // Keep menu strictly inside viewport horizontal edges
    const minLeft = window.scrollX + 8;
    const maxLeft = window.scrollX + window.innerWidth - menuWidth - 8;
    targetLeft = Math.max(minLeft, Math.min(targetLeft, maxLeft));

    setMenuCoords({ top: targetTop, left: targetLeft });
  };

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, align, direction]);

  const validActions = actions.filter((act) => !act.disabled);
  if (validActions.length === 0) return null;

  const menuContent = (
    <div
      ref={menuRef}
      style={{
        position: "absolute",
        top: `${menuCoords.top}px`,
        left: `${menuCoords.left}px`,
      }}
      className={cn(
        "w-48 rounded-2xl border shadow-2xl z-[999999] overflow-hidden py-1.5 animate-in fade-in zoom-in-95 duration-150",
        isDark
          ? "bg-[#111827] border-gray-800 text-white shadow-black/80"
          : "bg-white border-gray-200 text-gray-900 shadow-gray-400/50"
      )}
    >
      {validActions.map((action, idx) => {
        const isDanger = action.variant === "danger";
        const isWarning = action.variant === "warning";
        const isEmerald = action.variant === "emerald";

        return (
          <button
            key={idx}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
              action.onClick();
            }}
            className={cn(
              "w-full px-3.5 py-2.5 text-xs font-bold font-hanken flex items-center gap-2.5 transition-colors cursor-pointer text-left select-none",
              isDark
                ? isDanger
                  ? "text-rose-400 hover:bg-rose-500/10"
                  : isWarning
                  ? "text-amber-400 hover:bg-amber-500/10"
                  : isEmerald
                  ? "text-emerald-400 hover:bg-emerald-500/10"
                  : "text-gray-200 hover:bg-gray-800 hover:text-white"
                : isDanger
                ? "text-rose-600 hover:bg-rose-50"
                : isWarning
                ? "text-amber-700 hover:bg-amber-50"
                : isEmerald
                ? "text-emerald-700 hover:bg-emerald-50"
                : "text-gray-700 hover:bg-orange-50/80 hover:text-[#FC7A00]"
            )}
          >
            {action.icon && (
              <span className="material-symbols-outlined text-[17px] shrink-0">
                {action.icon}
              </span>
            )}
            <span className="truncate">{action.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={cn(
          "w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer select-none",
          isDark
            ? "bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700 hover:border-gray-600"
            : "bg-gray-100 border-gray-200 text-gray-600 hover:text-black hover:bg-gray-200"
        )}
        title="Actions Menu"
      >
        <span className="material-symbols-outlined text-[20px] font-bold">more_vert</span>
      </button>

      {isOpen && mounted && createPortal(menuContent, document.body)}
    </div>
  );
};
