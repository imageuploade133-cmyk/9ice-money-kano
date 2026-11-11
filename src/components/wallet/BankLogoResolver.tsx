"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useLogos } from "@/lib/logos-client";

interface BankLogoResolverProps {
  bankName?: string | null;
  bankCode?: string | null;
  className?: string;
  size?: number;
  iconSizeClassName?: string;
}

export const BankLogoResolver: React.FC<BankLogoResolverProps> = ({
  bankName,
  bankCode,
  className,
  size = 28,
  iconSizeClassName = "text-[16px]",
}) => {
  const [imageError, setImageError] = useState(false);
  const { getBankLogo } = useLogos();

  const fullQuery = [bankName, bankCode].filter(Boolean).join(" ");

  useEffect(() => {
    setImageError(false);
  }, [bankName, bankCode]);

  const logoUrl = fullQuery ? getBankLogo(fullQuery) : null;

  if (logoUrl && !imageError) {
    return (
      <div className={cn("relative rounded-full overflow-hidden flex items-center justify-center p-0.5 bg-white border border-gray-100 shadow-3xs flex-shrink-0", className)}>
        <Image
          src={logoUrl}
          alt={bankName || "Bank Logo"}
          width={size}
          height={size}
          className="object-contain w-full h-full rounded-full"
          onError={() => setImageError(true)}
          unoptimized
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-7 h-7 rounded-full bg-orange-50 border border-orange-200/60 text-[#FC7A00] flex items-center justify-center flex-shrink-0 shadow-3xs",
        className
      )}
      title={bankName || "Bank"}
    >
      <span className={cn("material-symbols-outlined font-black", iconSizeClassName)}>
        account_balance
      </span>
    </div>
  );
};
