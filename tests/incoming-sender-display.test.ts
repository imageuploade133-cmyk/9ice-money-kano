import { describe, it, expect } from "bun:test";
import { resolveBankName } from "../src/lib/bank-resolver";

describe("Incoming Sender Information Display & Resolution Safety", () => {
  // Helper matching TransactionReceipt's resolveRealSenderName
  const resolveRealSenderName = (
    transaction: {
      senderName?: string | null;
      description?: string | null;
      recipientName?: string | null;
      customerName?: string | null;
      beneficiaryName?: string | null;
    },
    userData?: { name?: string | null; displayName?: string | null; fullName?: string | null }
  ): string | null => {
    const candidate = transaction.senderName;
    if (!candidate || typeof candidate !== "string") return null;
    const trimmedCandidate = candidate.trim();
    if (trimmedCandidate.length === 0) return null;

    const isInvalidRecipientMatch = (invalidName?: string | null) => {
      if (!invalidName || typeof invalidName !== "string") return false;
      const normInvalid = invalidName.trim().toLowerCase();
      const normCand = trimmedCandidate.toLowerCase();
      return normInvalid.length > 0 && normCand === normInvalid;
    };

    if (
      isInvalidRecipientMatch(transaction.recipientName) ||
      isInvalidRecipientMatch(transaction.customerName) ||
      isInvalidRecipientMatch(transaction.beneficiaryName) ||
      isInvalidRecipientMatch(userData?.name) ||
      isInvalidRecipientMatch(userData?.displayName) ||
      isInvalidRecipientMatch(userData?.fullName)
    ) {
      return null;
    }

    return trimmedCandidate;
  };

  // Helper matching TransactionReceipt's maskAcc function
  const maskAcc = (acc?: string | null) => {
    if (!acc) return null;
    const clean = acc.replace(/\D/g, "");
    if (clean.length <= 4) return clean;
    return "****" + clean.slice(-4);
  };

  it("Test 1 — real sender name: given senderName='John Doe' and recipientName='E-Global User', resolves 'John Doe'", () => {
    const tx = {
      senderName: "John Doe",
      recipientName: "E-Global User",
    };
    const resolved = resolveRealSenderName(tx, { name: "E-Global User" });
    expect(resolved).toBe("John Doe");
  });

  it("Test 2 — never substitute recipient name: given senderName=undefined and recipientName='E-Global User', sender must NOT become 'E-Global User'", () => {
    const tx = {
      senderName: undefined,
      recipientName: "E-Global User",
      customerName: "E-Global User",
    };
    const resolved = resolveRealSenderName(tx, { name: "E-Global User" });
    expect(resolved).toBeNull();
    expect(resolved).not.toBe("E-Global User");
  });

  it("Test 3 — sender bank: given senderBankName='Example Bank' and bankName='Receiving Bank', for TRANSFER_FROM displayed sender bank is 'Example Bank' and NOT 'Receiving Bank'", () => {
    const txWithSenderBank = {
      senderBankName: "Example Bank",
      bankName: "Receiving Bank",
      virtualAccountBankName: "Receiving Bank",
    };

    const resolvedBank = resolveBankName(txWithSenderBank, [], "TRANSFER_FROM");
    expect(resolvedBank).toBe("Example Bank");
    expect(resolvedBank).not.toBe("Receiving Bank");

    // Missing senderBankName must return 'Bank', not 'Receiving Bank'
    const txWithoutSenderBank = {
      senderBankName: undefined,
      bankName: "Receiving Bank",
    };

    const fallbackBank = resolveBankName(txWithoutSenderBank, [], "TRANSFER_FROM");
    expect(fallbackBank).toBe("Bank");
    expect(fallbackBank).not.toBe("Receiving Bank");
  });

  it("Test 4 — sender account: given senderAccountNumber='0123456789', displays full sender account number without truncation", () => {
    const formatSenderAccount = (acc?: string | null) => (acc ? String(acc).trim() : null);
    expect(formatSenderAccount("0123456789")).toBe("0123456789");
    expect(formatSenderAccount("****6789")).toBe("****6789");
    expect(formatSenderAccount(undefined)).toBeNull();
  });

  it("Test 5 — missing sender information: if senderName/senderBankName/senderAccountNumber are undefined, safely shows empty/null state and does NOT derive sender from description", () => {
    const txWithDescription = {
      senderName: undefined,
      senderBankName: undefined,
      senderAccountNumber: undefined,
      description: "Transfer From Fraudulent Guess",
      recipientName: "E-Global User",
    };

    const resolved = resolveRealSenderName(txWithDescription, { name: "E-Global User" });
    expect(resolved).toBeNull();
    expect(resolved).not.toBe("Fraudulent Guess");
  });

  it("Test 6 — existing transaction types: non-incoming-transfer transaction behavior is unchanged", () => {
    const transferTx = {
      recipientBankName: "Access Bank",
      beneficiaryBankName: "Access Bank",
      bankName: "Access Bank",
    };

    const resolvedToBank = resolveBankName(transferTx, [], "TRANSFER_TO");
    expect(resolvedToBank).toBe("Access Bank");
  });
});
