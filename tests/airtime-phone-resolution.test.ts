import { describe, test, expect } from "bun:test";

// Phone Number Resolution function logic tested directly
function resolveAirtimePhoneNumber(tx: any): string | null {
  if (tx.phoneNumber && tx.phoneNumber.trim() && tx.phoneNumber !== "Not available") {
    return tx.phoneNumber.trim();
  }
  if (tx.customerId && tx.customerId.trim() && tx.customerId !== "Not available") {
    return tx.customerId.trim();
  }

  const meta = (tx.metadata || {}) as Record<string, any>;
  const metaPhone = meta.phoneNumber || meta.phone || meta.mobile_number || meta.mobile || meta.customer_id || meta.recipient || meta.phone_number;
  if (typeof metaPhone === "string" && metaPhone.trim()) {
    return metaPhone.trim();
  }

  if (tx.recipientName && tx.recipientName.trim()) {
    const cleanRec = tx.recipientName.trim();
    if (/^(\+?234|0)[789][01]\d{8}$/.test(cleanRec.replace(/\s+/g, ""))) {
      return cleanRec;
    }
  }

  const textSearch = `${tx.description || ""} ${tx.narration || ""} ${tx.title || ""} ${tx.reference || ""}`;
  const phoneMatch = textSearch.match(/(?:\+?234|0)[789][01]\d{8}/);
  if (phoneMatch) {
    return phoneMatch[0];
  }

  if (tx.recipientName && /\d{10,14}/.test(tx.recipientName)) {
    const match = tx.recipientName.match(/\d{10,14}/);
    if (match) return match[0];
  }

  return null;
}

describe("Airtime & Data Phone Number Resolution Suite", () => {
  test("Resolves direct phoneNumber field", () => {
    const tx = { type: "AIRTIME", phoneNumber: "08012345678" };
    expect(resolveAirtimePhoneNumber(tx)).toBe("08012345678");
  });

  test("Resolves customerId field when phoneNumber is missing", () => {
    const tx = { type: "AIRTIME", customerId: "08123456789" };
    expect(resolveAirtimePhoneNumber(tx)).toBe("08123456789");
  });

  test("Resolves metadata.phoneNumber when direct fields are absent", () => {
    const tx = { type: "DATA", metadata: { phoneNumber: "09098765432" } };
    expect(resolveAirtimePhoneNumber(tx)).toBe("09098765432");
  });

  test("Resolves recipientName when it is a phone number", () => {
    const tx = { type: "AIRTIME", recipientName: "07011223344" };
    expect(resolveAirtimePhoneNumber(tx)).toBe("07011223344");
  });

  test("Extracts phone number from description when non-structured", () => {
    const tx = { type: "AIRTIME", description: "Airtime topup to 08033445566 successful" };
    expect(resolveAirtimePhoneNumber(tx)).toBe("08033445566");
  });

  test("Returns null when no phone number is present", () => {
    const tx = { type: "AIRTIME", description: "Generic airtime purchase without number" };
    expect(resolveAirtimePhoneNumber(tx)).toBeNull();
  });
});
