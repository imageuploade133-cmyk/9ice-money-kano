"use client";

import React from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAppConfig } from "@/lib/ConfigContext";
import { isFeatureEnabled, getFeatureDisabledMessage, FeatureToggleKey } from "@/lib/feature-toggle";
import { toast } from "sonner";
import { triggerHaptic } from "@/lib/haptics";

interface NavItem {
  label: string;
  href: string;
  renderIcon: (isActive: boolean) => React.ReactNode;
}

const navItems: NavItem[] = [
  {
    label: "Wealth",
    href: "/",
    renderIcon: (isActive) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isActive ? "#FC7A00" : "currentColor"} className="w-[18px] h-[18px] min-[360px]:w-[21px] min-[360px]:h-[21px] min-[400px]:w-[24px] min-[400px]:h-[24px] transition-all">
        <path d="M21 18c0 1.1-.9 2-2 2H5a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h14a2 2 0 0 1 2 2v12zm-2 0V6H5v12h14zm-4-4h2v-2h-2v2z" />
      </svg>
    ),
  },
  {
    label: "Cards",
    href: "/cards",
    renderIcon: (isActive) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isActive ? "#FC7A00" : "currentColor"} className="w-[18px] h-[18px] min-[360px]:w-[21px] min-[360px]:h-[21px] min-[400px]:w-[24px] min-[400px]:h-[24px] transition-all">
        <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
      </svg>
    ),
  },
  {
    label: "History",
    href: "/history",
    renderIcon: (isActive) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isActive ? "#FC7A00" : "currentColor"} className="w-[18px] h-[18px] min-[360px]:w-[21px] min-[360px]:h-[21px] min-[400px]:w-[24px] min-[400px]:h-[24px] transition-all">
        <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 7 7 7.07 7.07 0 0 1-6-3.43l-1.42 1.42A8.9 8.9 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8z" />
      </svg>
    ),
  },
  {
    label: "Store",
    href: "/store",
    renderIcon: (isActive) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isActive ? "#FC7A00" : "currentColor"} className="w-[18px] h-[18px] min-[360px]:w-[21px] min-[360px]:h-[21px] min-[400px]:w-[24px] min-[400px]:h-[24px] transition-all">
        <path d="M21.9 8.89l-1.05-4.37c-.22-.9-1-1.52-1.91-1.52H5.05c-.9 0-1.69.63-1.9 1.52L2.1 8.89c-.24 1 .22 2.06 1.11 2.51.13.06.26.1.4.15V19c0 1.1.9 2 2 2h12.82c1.1 0 2-.9 2-2v-7.45c.14-.05.27-.09.4-.15.89-.45 1.35-1.51 1.11-2.51zM18.1 4.5l1.05 4.37c.1.4-.08.82-.43 1-.36.19-.8.1-1-.22L16.5 8h-1l-1.22 1.66c-.22.3-.64.44-1 .28-.35-.14-.58-.49-.58-.88l.1-4.56h5.3zM5.9 4.5h5.3l.1 4.56c0 .39-.23.74-.58.88-.36.16-.78.02-1-.28L8.5 8h-1l-1.22 1.65c-.22.32-.66.41-1 .22-.35-.18-.53-.6-.43-1L5.9 4.5zm11.12 14.5H7v-7.44c.43-.16.82-.45 1.12-.82.68.93 1.95 1.12 2.88.44.93.68 2.2.49 2.88-.44.3.37.69.66 1.12.82V19z" />
      </svg>
    ),
  },
  {
    label: "Investment",
    href: "/investment",
    renderIcon: (isActive) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isActive ? "#FC7A00" : "currentColor"} className="w-[18px] h-[18px] min-[360px]:w-[21px] min-[360px]:h-[21px] min-[400px]:w-[24px] min-[400px]:h-[24px] transition-all">
        <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
      </svg>
    ),
  },
  {
    label: "Profile",
    href: "/profile",
    renderIcon: (isActive) => (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={isActive ? "#FC7A00" : "currentColor"} className="w-[18px] h-[18px] min-[360px]:w-[21px] min-[360px]:h-[21px] min-[400px]:w-[24px] min-[400px]:h-[24px] transition-all">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    ),
  },
];

export const BottomNav: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { config } = useAppConfig();

  const handleNavClick = (e: React.MouseEvent, item: NavItem) => {
    triggerHaptic();

    let featureKey: FeatureToggleKey | null = null;
    if (item.href === "/cards") featureKey = "virtual_cards";
    else if (item.href === "/store") featureKey = "store";
    else if (item.href === "/investment") featureKey = "investment";

    if (featureKey && !isFeatureEnabled(config?.featureToggles, featureKey)) {
      e.preventDefault();
      toast.error(getFeatureDisabledMessage(config?.featureToggles, featureKey));
      return;
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-0.5 pb-3.5 min-[360px]:pb-5.5 pt-2 bg-white/95 backdrop-blur-2xl border-none shadow-[0_-4px_20px_rgba(252,122,0,0.05)] rounded-t-[20px] min-[360px]:rounded-t-[28px]">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={(e) => handleNavClick(e, item)}
            className={cn(
              "flex flex-col items-center justify-center transition-all duration-300 active:scale-95 cursor-pointer flex-1 min-w-0 px-0.5 py-1",
              isActive
                ? "text-[#FC7A00] font-bold"
                : "text-gray-400 hover:text-[#FC7A00]/80"
            )}
          >
            {item.renderIcon(isActive)}
            <span className="font-label-sm text-[7.5px] min-[360px]:text-[9px] min-[400px]:text-[10px] truncate w-full text-center mt-1 tracking-tight font-medium">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};
