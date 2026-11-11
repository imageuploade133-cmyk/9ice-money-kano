"use client";

import React, { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useLogos } from "@/lib/logos-client";

interface TransactionIconProps {
  type: string;
  description?: string;
  recipientName?: string;
  bankName?: string;
  className?: string;
  iconSizeClassName?: string;
}

export const TransactionIcon: React.FC<TransactionIconProps> = ({
  type,
  description = "",
  recipientName = "",
  bankName = "",
  className,
  iconSizeClassName = "text-[20px]",
}) => {
  const [imageError, setImageError] = useState(false);
  const { getBillerLogo, getBankLogo, getStoreLogo } = useLogos();

  // Reset image error state whenever inputs or target logo changes
  React.useEffect(() => {
    setImageError(false);
  }, [type, description, recipientName, bankName]);

  const normalizedType = (type || "").toUpperCase().trim();
  const fullContext = `${description} ${recipientName} ${bankName}`.toLowerCase();

  const isRefund = normalizedType.includes("REFUND") || normalizedType.includes("REVERSAL") || fullContext.includes("refund") || fullContext.includes("reversal");
  const isStore = !isRefund && (normalizedType.includes("STORE") || fullContext.includes("store order") || fullContext.includes("store purchase") || fullContext.includes("store"));
  const isAirtime = !isRefund && (normalizedType.includes("AIRTIME") || fullContext.includes("airtime"));
  const isData = !isRefund && (normalizedType.includes("DATA") || fullContext.includes("data"));
  const isSwap = !isRefund && (normalizedType.includes("SWAP") || fullContext.includes("swap") || fullContext.includes("exchange"));
  const isTransfer = !isRefund && (normalizedType.includes("TRANSFER") || normalizedType.includes("WITHDRAWAL") || normalizedType.includes("SEND") || fullContext.includes("transfer to"));
  const isDeposit = !isRefund && (normalizedType.includes("DEPOSIT") || normalizedType.includes("CASHOUT") || normalizedType.includes("CARD_FUND") || normalizedType.includes("WALLET_FUNDING") || normalizedType.includes("FUND"));
  const isInvestment = !isRefund && (normalizedType.includes("INVESTMENT") || fullContext.includes("investment") || fullContext.includes("fixed deposit"));
  const isCable = !isRefund && (normalizedType.includes("CABLE") || fullContext.includes("dstv") || fullContext.includes("gotv") || fullContext.includes("startimes"));
  const isElectricity = !isRefund && (normalizedType.includes("ELECTRIC") || fullContext.includes("electricity") || fullContext.includes("meter") || fullContext.includes("kedco") || fullContext.includes("ikedc"));
  const isWaec = !isRefund && (normalizedType.includes("WAEC") || fullContext.includes("waec") || fullContext.includes("exam"));

  // Lookup administrator-uploaded logo or fallback
  const billerLogo = (isAirtime || isData || isCable || isElectricity || isWaec || isSwap || isStore || isInvestment)
    ? getBillerLogo(fullContext)
    : null;
  const storeLogo = isStore ? (billerLogo || getStoreLogo()) : null;
  const logoUrl = storeLogo || billerLogo;

  if (logoUrl && !imageError) {
    return (
      <div className={cn("relative rounded-full overflow-hidden flex items-center justify-center p-1 bg-white border border-gray-100 shadow-3xs flex-shrink-0", className)}>
        <Image
          src={logoUrl}
          alt="Provider Logo"
          width={28}
          height={28}
          className="object-contain w-full h-full rounded-full"
          onError={() => setImageError(true)}
          unoptimized
        />
      </div>
    );
  }

  // Fallback to specific Material Symbols icon for each transaction type
  let iconName = "receipt_long";
  let iconBgColor = "bg-gray-50 text-gray-700 border-gray-200";

  if (isStore) {
    iconName = "shopping_bag";
    iconBgColor = "bg-orange-50 text-orange-600 border-orange-200/50";
  } else if (isRefund || isDeposit) {
    // ↙ INCOMING GREEN ARROW ICON
    iconName = "south_west";
    iconBgColor = "bg-emerald-50 text-emerald-600 border-emerald-200/50";
  } else if (isTransfer) {
    // ↗ OUTGOING ORANGE ARROW ICON
    iconName = "north_east";
    iconBgColor = "bg-[#FFF2E6] text-[#FC7A00] border-[#FFE4CC]/50";
  } else if (isSwap) {
    iconName = "swap_horiz";
    iconBgColor = "bg-blue-50 text-blue-600 border-blue-200/50";
  } else if (isAirtime) {
    iconName = "cell_tower";
    iconBgColor = "bg-amber-50 text-amber-600 border-amber-200/50";
  } else if (isData) {
    iconName = "swap_vert";
    iconBgColor = "bg-purple-50 text-purple-600 border-purple-200/50";
  } else if (isCable) {
    iconName = "tv";
    iconBgColor = "bg-indigo-50 text-indigo-600 border-indigo-200/50";
  } else if (isElectricity) {
    iconName = "bolt";
    iconBgColor = "bg-amber-50 text-amber-500 border-amber-200/50";
  } else if (isWaec) {
    iconName = "school";
    iconBgColor = "bg-teal-50 text-teal-600 border-teal-200/50";
  } else if (normalizedType.includes("CARD")) {
    iconName = "credit_card";
    iconBgColor = "bg-cyan-50 text-cyan-600 border-cyan-200/50";
  }

  return (
    <div
      className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border shadow-3xs",
        iconBgColor,
        className
      )}
    >
      <span className={cn("material-symbols-outlined font-black", iconSizeClassName)}>
        {iconName}
      </span>
    </div>
  );
};
