import { describe, expect, it } from "bun:test";

interface Transaction {
  type: string;
  narration?: string;
  description: string;
}

function resolveNarrationDisplay(tx: Transaction): string | null {
  if (tx.narration && tx.narration.trim()) {
    const trimmed = tx.narration.trim();
    const lower = trimmed.toLowerCase();
    if (!lower.startsWith("transfer to ") && !lower.startsWith("transfer of ")) {
      return trimmed;
    }
  }
  if (tx.description && tx.description.trim()) {
    const trimmedDesc = tx.description.trim();
    const lowerDesc = trimmedDesc.toLowerCase();
    if (!lowerDesc.startsWith("transfer to ") && !lowerDesc.startsWith("transfer of ") && !lowerDesc.startsWith("wallet funding") && !lowerDesc.startsWith("wallet provisioning")) {
      return trimmedDesc;
    }
  }
  return null;
}

describe("Transfer Narration Display & Resolution", () => {
  it("displays custom user-entered narration when present", () => {
    const tx: Transaction = {
      type: "TRANSFER",
      narration: "Payment for consulting services",
      description: "Payment for consulting services",
    };
    expect(resolveNarrationDisplay(tx)).toBe("Payment for consulting services");
  });

  it("returns null for default auto-generated narration", () => {
    const tx: Transaction = {
      type: "TRANSFER",
      narration: undefined,
      description: "Transfer To John Doe",
    };
    expect(resolveNarrationDisplay(tx)).toBeNull();
  });

  it("falls back to custom description if narration field is empty but description is custom", () => {
    const tx: Transaction = {
      type: "TRANSFER",
      description: "Monthly apartment rent",
    };
    expect(resolveNarrationDisplay(tx)).toBe("Monthly apartment rent");
  });

  it("safely handles missing narration and description without showing placeholders", () => {
    const tx: Transaction = {
      type: "TRANSFER",
      description: "Transfer To Jane Smith",
    };
    expect(resolveNarrationDisplay(tx)).toBeNull();
  });
});
