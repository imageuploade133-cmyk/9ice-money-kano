import { describe, it, expect } from "bun:test";
import { resolveBankName } from "../src/lib/bank-resolver";

describe("Bank Name Resolution & Receipt Display Rules", () => {
  const mockBanks = [
    { id: "035", code: "035", name: "Wema Bank" },
    { id: "058", code: "058", name: "Guaranty Trust Bank" },
    { id: "057", code: "057", name: "Zenith Bank" },
    { id: "011", code: "011", name: "First Bank of Nigeria" },
  ];

  it("1. Direction 'TRANSFER_FROM' strictly resolves senderBankName or senderBankCode", () => {
    const tx = {
      senderBankName: "GTBank",
      senderBankCode: "058",
      virtualAccountBankName: "Wema Bank",
      recipientBankName: "Access Bank",
    };

    const resolved = resolveBankName(tx, mockBanks, "TRANSFER_FROM");
    expect(resolved).toBe("GTBank");
  });

  it("2. Direction 'TRANSFER_FROM' does NOT fall back to receiving or virtual account banks", () => {
    const tx = {
      senderBankName: null,
      senderBankCode: null,
      virtualAccountBankName: "Wema Bank",
      recipientBankName: "Access Bank",
    };

    const resolved = resolveBankName(tx, mockBanks, "TRANSFER_FROM");
    expect(resolved).toBe("Bank"); // Should return default "Bank" when sender bank is unknown
  });

  it("3. Direction 'TRANSFER_TO' resolves virtualAccountBankName or recipientBankName", () => {
    const tx = {
      senderBankName: "Zenith Bank",
      virtualAccountBankName: "Wema Bank",
      recipientBankName: "Wema Bank",
    };

    const resolved = resolveBankName(tx, mockBanks, "TRANSFER_TO");
    expect(resolved).toBe("Wema Bank");
  });

  it("4. Direction 'TRANSFER_FROM' resolves bank name from senderBankCode when senderBankName is missing", () => {
    const tx = {
      senderBankName: null,
      senderBankCode: "057",
      virtualAccountBankName: "Wema Bank",
    };

    const resolved = resolveBankName(tx, mockBanks, "TRANSFER_FROM");
    expect(resolved).toBe("Zenith Bank");
  });

  it("5. Real senderName is preserved and returned cleanly", () => {
    const senderName = "KABIRU SHABA";
    const resolveRealSenderName = (cand?: string | null) => {
      if (!cand || typeof cand !== "string") return null;
      const trimmed = cand.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    expect(resolveRealSenderName(senderName)).toBe("KABIRU SHABA");
    expect(resolveRealSenderName("   JOHN DOE   ")).toBe("JOHN DOE");
    expect(resolveRealSenderName("")).toBeNull();
  });
});
