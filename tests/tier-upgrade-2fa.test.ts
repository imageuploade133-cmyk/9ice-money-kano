import { describe, expect, test } from "bun:test";

function maskBvnNin(val?: string | null): string {
  if (!val) return "";
  const clean = val.toString().trim();
  if (clean.length < 5) return clean;
  return `${clean.slice(0, 3)}******${clean.slice(-2)}`;
}

function resolveSubmittedOtp(body: Record<string, any>): string {
  const otpVal = body.otp || body.otpCode || body.otp_code || "";
  return otpVal.toString().trim();
}

describe("Tier Upgrade & 2FA Login OTP Security Suite", () => {
  test("1. BVN/NIN masking masks middle digits cleanly as 255******44", () => {
    expect(maskBvnNin("22212345678")).toBe("222******78");
    expect(maskBvnNin("25511223344")).toBe("255******44");
    expect(maskBvnNin("1234")).toBe("1234");
    expect(maskBvnNin("")).toBe("");
    expect(maskBvnNin(null)).toBe("");
  });

  test("2. 2FA OTP parameter resolver accepts otp, otpCode, and otp_code dynamically", () => {
    expect(resolveSubmittedOtp({ otp: "123456" })).toBe("123456");
    expect(resolveSubmittedOtp({ otpCode: "654321" })).toBe("654321");
    expect(resolveSubmittedOtp({ otp_code: "987654" })).toBe("987654");
    expect(resolveSubmittedOtp({ otpCode: 123456 })).toBe("123456");
    expect(resolveSubmittedOtp({})).toBe("");
  });
});
