import { describe, test, expect } from "bun:test";

function sanitizeBillErrorMessage(rawMessage: string, billType: string = "bill"): string {
  const msg = String(rawMessage || "").toLowerCase();
  const typeLower = (billType || "bill").toLowerCase();

  if (
    msg.includes("insufficient_balance") ||
    msg.includes("insufficient balance") ||
    msg.includes("clubkonnect") ||
    msg.includes("flutterwave") ||
    msg.includes("rejected request") ||
    msg.includes("provider") ||
    msg.includes("gateway")
  ) {
    if (typeLower.includes("airtime")) {
      return "Airtime purchase network issue. Please try again later.";
    }
    if (typeLower.includes("data")) {
      return "Data purchase network issue. Please try again later.";
    }
    if (typeLower.includes("cable")) {
      return "Cable TV subscription network issue. Please try again later.";
    }
    if (typeLower.includes("electricity") || typeLower.includes("utility")) {
      return "Electricity payment network issue. Please try again later.";
    }
    if (typeLower.includes("waec")) {
      return "WAEC PIN purchase network issue. Please try again later.";
    }
    return "Bill payment network issue. Please try again later.";
  }

  return rawMessage || "Bill payment network issue. Please try again later.";
}

describe("VTU & Bill Error Message Sanitization Suite", () => {
  test("Sanitizes Clubkonnect INSUFFICIENT_BALANCE for airtime", () => {
    const raw = "Clubkonnect API Error: INSUFFICIENT_BALANCE on vendor wallet";
    const result = sanitizeBillErrorMessage(raw, "airtime");
    expect(result).toBe("Airtime purchase network issue. Please try again later.");
  });

  test("Sanitizes Flutterwave provider error for data", () => {
    const raw = "Flutterwave gateway error: Rejected Request - Invalid provider response";
    const result = sanitizeBillErrorMessage(raw, "data");
    expect(result).toBe("Data purchase network issue. Please try again later.");
  });

  test("Sanitizes vendor error for cable TV", () => {
    const raw = "Clubkonnect cable response: insufficient balance";
    const result = sanitizeBillErrorMessage(raw, "cable");
    expect(result).toBe("Cable TV subscription network issue. Please try again later.");
  });

  test("Sanitizes gateway error for electricity", () => {
    const raw = "Gateway error: insufficient_balance for electricity token";
    const result = sanitizeBillErrorMessage(raw, "electricity");
    expect(result).toBe("Electricity payment network issue. Please try again later.");
  });

  test("Sanitizes vendor error for WAEC PIN", () => {
    const raw = "Clubkonnect WAEC purchase failed: provider rejected request";
    const result = sanitizeBillErrorMessage(raw, "waec");
    expect(result).toBe("WAEC PIN purchase network issue. Please try again later.");
  });

  test("Preserves standard user errors (e.g. invalid phone number)", () => {
    const raw = "Invalid phone number format provided.";
    const result = sanitizeBillErrorMessage(raw, "airtime");
    expect(result).toBe("Invalid phone number format provided.");
  });
});
