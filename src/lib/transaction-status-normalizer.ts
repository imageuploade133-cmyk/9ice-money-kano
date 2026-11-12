export type TransactionLedgerStatus = "DEBITED" | "CREDITED" | "REVERSAL" | "PENDING" | "FAILED" | "HELD";

export interface LedgerStatusResult {
  code: TransactionLedgerStatus;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotBg: string;
  icon: string;
}

/**
 * Normalizes any transaction record into its authoritative bank ledger status and presentation metadata:
 * - Reversal (Official bank terminology for Refunds / Reversals)
 * - Debited (For outgoing debits / payments)
 * - Credited (For incoming credits / deposits)
 * - Pending (For processing transactions)
 * - Failed (For failed transactions)
 */
export const getTransactionLedgerStatus = (tx?: {
  status?: string;
  direction?: string;
  type?: string;
  category?: string;
  description?: string;
  narration?: string;
} | null): LedgerStatusResult => {
  if (!tx) {
    return {
      code: "FAILED",
      label: "Failed",
      badgeBg: "bg-red-50",
      badgeText: "text-red-600",
      badgeBorder: "border-red-100",
      dotBg: "bg-red-500",
      icon: "cancel",
    };
  }

  const s = String(tx.status || "").toUpperCase().trim();
  const dir = String(tx.direction || "").toUpperCase().trim();
  const type = String(tx.type || "").toUpperCase().trim();
  const cat = String(tx.category || "").toUpperCase().trim();
  const desc = String(tx.description || "").toLowerCase();
  const narr = String(tx.narration || "").toLowerCase();

  // 1. REVERSAL / REFUND (Official Bank Term)
  if (
    s === "REFUND" ||
    s === "REFUNDED" ||
    s === "REVERSED" ||
    s === "REVERSAL" ||
    type === "REFUND" ||
    type === "STORE_ORDER_REFUND" ||
    cat === "REFUND" ||
    desc.includes("refund") ||
    desc.includes("reversal") ||
    narr.includes("refund") ||
    narr.includes("reversal")
  ) {
    return {
      code: "REVERSAL",
      label: "Reversal",
      badgeBg: "bg-blue-50",
      badgeText: "text-blue-600",
      badgeBorder: "border-blue-100",
      dotBg: "bg-blue-500",
      icon: "keyboard_backup_api",
    };
  }

  // 2. HELD SAFELY (Deposit limit or balance cap exceeded)
  if (s === "HELD_LIMIT_EXCEEDED" || s === "HELD" || s === "HELD_SAFELY") {
    return {
      code: "HELD",
      label: "Held Safely",
      badgeBg: "bg-amber-50",
      badgeText: "text-amber-700",
      badgeBorder: "border-amber-200",
      dotBg: "bg-amber-500",
      icon: "lock_clock",
    };
  }

  // 3. PENDING
  if (s === "PENDING" || s === "PROCESSING") {
    return {
      code: "PENDING",
      label: "Pending",
      badgeBg: "bg-amber-50",
      badgeText: "text-amber-600",
      badgeBorder: "border-amber-100",
      dotBg: "bg-amber-500",
      icon: "schedule",
    };
  }

  // 3. CANCELED
  if (s === "CANCELED" || s === "CANCELLED") {
    return {
      code: "FAILED",
      label: "Canceled",
      badgeBg: "bg-gray-100",
      badgeText: "text-gray-600",
      badgeBorder: "border-gray-200",
      dotBg: "bg-gray-400",
      icon: "cancel",
    };
  }

  // 4. EXPIRED
  if (s === "EXPIRED") {
    return {
      code: "FAILED",
      label: "Expired",
      badgeBg: "bg-amber-50",
      badgeText: "text-amber-700",
      badgeBorder: "border-amber-200",
      dotBg: "bg-amber-600",
      icon: "timer_off",
    };
  }

  // 5. FAILED
  if (s === "FAILED" || s === "DECLINED" || s === "REJECTED") {
    return {
      code: "FAILED",
      label: "Failed",
      badgeBg: "bg-red-50",
      badgeText: "text-red-600",
      badgeBorder: "border-red-100",
      dotBg: "bg-red-500",
      icon: "cancel",
    };
  }

  // 4. SUCCESS -> Check if Credited or Debited
  const isCredit =
    dir === "CREDIT" ||
    type === "DEPOSIT" ||
    type === "VIRTUAL_ACCOUNT_DEPOSIT" ||
    type === "WALLET_FUNDING" ||
    cat === "DEPOSIT" ||
    type === "SWAP_CREDIT" ||
    desc.includes("deposit") ||
    desc.includes("credited") ||
    desc.includes("funding") ||
    desc.includes("transfer from") ||
    narr.includes("deposit") ||
    narr.includes("transfer from");

  if (isCredit) {
    return {
      code: "CREDITED",
      label: "Credited",
      badgeBg: "bg-emerald-50",
      badgeText: "text-emerald-600",
      badgeBorder: "border-emerald-100",
      dotBg: "bg-emerald-500",
      icon: "check_circle",
    };
  }

  return {
    code: "DEBITED",
    label: "Debited",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-600",
    badgeBorder: "border-emerald-100",
    dotBg: "bg-emerald-500",
    icon: "check_circle",
  };
};

/**
 * Determines authoritatively whether a transaction is a credit (deposit, refund, reversal, incoming)
 * or a debit (transfer, withdrawal, bill payment, store purchase).
 *
 * REFUND / REVERSAL transactions are strictly treated as CREDIT so they are never rendered with a minus sign.
 */
export const isCreditTransaction = (tx?: {
  status?: string;
  direction?: string;
  type?: string;
  category?: string;
  description?: string;
  narration?: string;
} | null): boolean => {
  if (!tx) return false;

  const s = String(tx.status || "").toUpperCase().trim();
  const dir = String(tx.direction || "").toUpperCase().trim();
  const type = String(tx.type || "").toUpperCase().trim();
  const cat = String(tx.category || "").toUpperCase().trim();
  const desc = String(tx.description || "").toLowerCase();
  const narr = String(tx.narration || "").toLowerCase();

  // Non-successful status for WALLET_FUNDING / DEPOSIT is NOT a confirmed credit (no + sign)
  if (
    (type === "WALLET_FUNDING" || type === "DEPOSIT" || type === "VIRTUAL_ACCOUNT_DEPOSIT" || cat === "DEPOSIT") &&
    s !== "SUCCESS" &&
    s !== "SUCCESSFUL" &&
    s !== "CREDITED"
  ) {
    return false;
  }

  // 1. REFUND / REVERSAL is strictly a CREDIT (wallet refund)
  if (
    s === "REFUND" ||
    s === "REFUNDED" ||
    s === "REVERSED" ||
    s === "REVERSAL" ||
    type === "REFUND" ||
    type === "STORE_ORDER_REFUND" ||
    cat === "REFUND" ||
    desc.includes("refund") ||
    desc.includes("reversal") ||
    narr.includes("refund") ||
    narr.includes("reversal")
  ) {
    return true;
  }

  // 2. Explicit direction
  if (dir === "CREDIT" || dir === "INCOMING") {
    return true;
  }

  // 3. Types / categories / descriptions representing deposits or credits
  if (
    type === "DEPOSIT" ||
    type === "VIRTUAL_ACCOUNT_DEPOSIT" ||
    type === "WALLET_FUNDING" ||
    type === "CASHOUT" ||
    type === "SWAP_CREDIT" ||
    cat === "DEPOSIT" ||
    desc.includes("deposit") ||
    desc.includes("credited") ||
    desc.includes("funding") ||
    desc.includes("transfer from") ||
    narr.includes("deposit") ||
    narr.includes("transfer from")
  ) {
    return true;
  }

  return false;
};

/**
 * Normalizes the exact wallet presentation display amount for Activity Log & History lists.
 *
 * Accounting Rules:
 *
 * FOR REFUND / REVERSAL / CREDIT:
 * Priority:
 * 1. tx.totalCredited
 * 2. tx.amount + providerFee + markup + vat (if providerFee or markup exist)
 * 3. tx.amount
 *
 * FOR TRANSFER / DEBIT / WITHDRAWAL / BILLS:
 * Priority:
 * 1. tx.totalDebited
 * 2. tx.amount + fee + markup + vat (if fee or markup exist)
 * 3. tx.amount
 */
export const getTransactionDisplayAmount = (tx?: {
  amount?: number;
  fee?: number;
  providerFee?: number;
  markup?: number;
  vat?: number;
  totalDebited?: number;
  totalCredited?: number;
  status?: string;
  direction?: string;
  type?: string;
  category?: string;
  description?: string;
  narration?: string;
} | null): number => {
  if (!tx) return 0;

  const baseAmount = Number(tx.amount) || 0;
  const isCredit = isCreditTransaction(tx);

  if (isCredit) {
    // 1. Check explicit totalCredited
    if (tx.totalCredited !== undefined && tx.totalCredited !== null && Number(tx.totalCredited) > 0) {
      return Number(tx.totalCredited);
    }

    const providerFee = Number(tx.providerFee ?? tx.fee) || 0;
    const markup = Number(tx.markup) || 0;
    const vat = Number(tx.vat) || 0;

    // If tx.amount is base amount (e.g. 5000) and fees/markup were stored, sum them
    if (providerFee > 0 || markup > 0 || vat > 0) {
      return baseAmount + providerFee + markup + vat;
    }

    return baseAmount;
  } else {
    // FOR DEBIT (TRANSFER / WITHDRAWAL / BILLS)
    if (tx.totalDebited !== undefined && tx.totalDebited !== null && Number(tx.totalDebited) > 0) {
      return Number(tx.totalDebited);
    }

    const fee = Number(tx.fee) || 0;
    const markup = Number(tx.markup) || 0;
    const vat = Number(tx.vat) || 0;

    if (fee > 0 || markup > 0 || vat > 0) {
      return baseAmount + fee + markup + vat;
    }

    return baseAmount;
  }
};
