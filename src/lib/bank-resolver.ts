import { BankLogoItem } from "./logos-client";

export interface TransactionBankFields {
  recipientBankName?: string | null;
  beneficiaryBankName?: string | null;
  senderBankName?: string | null;
  virtualAccountBankName?: string | null;
  bankName?: string | null;

  recipientBankCode?: string | null;
  beneficiaryBankCode?: string | null;
  senderBankCode?: string | null;
  bankCode?: string | null;
}

export type BankListItem = BankLogoItem | {
  id?: string | number | null;
  code?: string | number | null;
  bankCode?: string | number | null;
  bank_code?: string | number | null;
  name?: string | null;
  bankName?: string | number | null;
  bank_name?: string | number | null;
  [key: string]: any;
};

/**
 * Resolves the display bank name for a transaction using a 3-tier priority rule:
 * 1. Directionally appropriate stored bank name (first non-empty string after trimming)
 * 2. Bank code lookup against the existing bank list (string matching, preserving leading zeros)
 * 3. Fallback to "Bank"
 */
export function resolveBankName(
  transaction?: TransactionBankFields | null,
  bankList?: BankListItem[] | BankLogoItem[] | null,
  direction?: "TRANSFER_TO" | "TRANSFER_FROM"
): string {
  if (!transaction) return "Bank";

  // Priority 1: Stored Bank Name aligned with direction
  const candidateNames = direction === "TRANSFER_FROM"
    ? [
        transaction.senderBankName,
      ]
    : direction === "TRANSFER_TO"
    ? [
        transaction.recipientBankName,
        transaction.beneficiaryBankName,
        transaction.virtualAccountBankName,
        transaction.bankName,
      ]
    : [
        transaction.recipientBankName,
        transaction.beneficiaryBankName,
        transaction.senderBankName,
        transaction.virtualAccountBankName,
        transaction.bankName,
      ];

  for (const name of candidateNames) {
    if (typeof name === "string") {
      const trimmed = name.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  // Priority 2: Bank Code Lookup aligned with direction
  const candidateCodes = direction === "TRANSFER_FROM"
    ? [
        transaction.senderBankCode,
      ]
    : direction === "TRANSFER_TO"
    ? [
        transaction.recipientBankCode,
        transaction.beneficiaryBankCode,
        transaction.bankCode,
      ]
    : [
        transaction.recipientBankCode,
        transaction.beneficiaryBankCode,
        transaction.senderBankCode,
        transaction.bankCode,
      ];

  let targetCode: string | null = null;
  for (const c of candidateCodes) {
    if (c !== undefined && c !== null) {
      const codeStr = String(c).trim();
      if (codeStr.length > 0) {
        targetCode = codeStr;
        break;
      }
    }
  }

  if (targetCode && Array.isArray(bankList) && bankList.length > 0) {
    const matchedBank = bankList.find((b: any) => {
      if (!b) return false;
      const itemCode = b.code !== undefined && b.code !== null ? String(b.code).trim() : null;
      const itemBankCode = b.bankCode !== undefined && b.bankCode !== null ? String(b.bankCode).trim() : null;
      const itemBank_code = b.bank_code !== undefined && b.bank_code !== null ? String(b.bank_code).trim() : null;
      const itemId = b.id !== undefined && b.id !== null ? String(b.id).trim() : null;

      return (
        itemCode === targetCode ||
        itemBankCode === targetCode ||
        itemBank_code === targetCode ||
        itemId === targetCode
      );
    });

    if (matchedBank) {
      const matchedName = (
        (matchedBank as any).name ||
        (matchedBank as any).bankName ||
        (matchedBank as any).bank_name ||
        ""
      );
      if (typeof matchedName === "string" && matchedName.trim().length > 0) {
        return matchedName.trim();
      }
    }
  }

  // Priority 3: Fallback string "Bank"
  return "Bank";
}
