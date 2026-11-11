import { describe, expect, it } from "bun:test";

const maskAccountNum = (acc?: string | null): string => {
  if (!acc) return "";
  const clean = String(acc).replace(/\D/g, "");
  if (clean.length <= 4) return clean;
  if (clean.length === 10) {
    return `${clean.slice(0, 3)}****${clean.slice(-3)}`;
  }
  return `${clean.slice(0, 2)}****${clean.slice(-2)}`;
};

describe("Share Receipt Account Number Masking Helper", () => {
  it("masks 10-digit account numbers correctly (e.g. 807****034)", () => {
    expect(maskAccountNum("8071234034")).toBe("807****034");
    expect(maskAccountNum("9696228144")).toBe("969****144");
    expect(maskAccountNum("0123456789")).toBe("012****789");
  });

  it("handles non-digit characters in account numbers", () => {
    expect(maskAccountNum("807-123-4034")).toBe("807****034");
  });

  it("handles shorter account or phone numbers gracefully", () => {
    expect(maskAccountNum("1234")).toBe("1234");
    expect(maskAccountNum("123456")).toBe("12****56");
  });

  it("returns empty string for null or undefined input", () => {
    expect(maskAccountNum(null)).toBe("");
    expect(maskAccountNum(undefined)).toBe("");
  });
});
