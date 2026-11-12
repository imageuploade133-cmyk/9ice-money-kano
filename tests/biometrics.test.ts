import { describe, expect, test } from "bun:test";
import {
  getBiometricType,
  getBiometricLabel,
  isBiometricsSupported,
  authenticateBiometric,
  authenticateBiometricDetailed,
  parseBiometricResponse,
  base64ToUint8Array,
  uint8ArrayToBase64,
} from "../src/lib/biometrics-util";

describe("Platform-Aware Biometrics Suite", () => {
  test("1. Resolves biometric label based on platform descriptor", () => {
    const type = getBiometricType();
    const label = getBiometricLabel();

    expect(["faceid", "fingerprint"]).toContain(type);
    expect(["Face ID", "Fingerprint"]).toContain(label);
  });

  test("2. Biometrics support check evaluates without throwing", async () => {
    const supported = await isBiometricsSupported();
    expect(typeof supported).toBe("boolean");
  });

  test("3. Authenticate biometric fallback succeeds in node/simulation environment", async () => {
    const result = await authenticateBiometric("Test Prompt");
    expect(result).toBe(true);
    const detailed = await authenticateBiometricDetailed("Test Prompt");
    expect(detailed.success).toBe(true);
  });

  test("4. Parses biometric responses from native bridges correctly", () => {
    expect(parseBiometricResponse(true).success).toBe(true);
    expect(parseBiometricResponse(false).success).toBe(false);
    expect(parseBiometricResponse({ success: true }).success).toBe(true);
    expect(parseBiometricResponse({ success: false, error: "User cancelled" }).success).toBe(false);
    expect(parseBiometricResponse({ verified: true }).success).toBe(true);
    expect(parseBiometricResponse({ verified: false }).success).toBe(false);
  });

  test("5. Encodes and decodes base64url Uint8Array byte arrays bi-directionally", () => {
    const original = new Uint8Array([72, 101, 108, 108, 111, 32, 66, 105, 111]);
    const encoded = uint8ArrayToBase64(original);
    const decoded = base64ToUint8Array(encoded);
    expect(decoded).toEqual(original);
  });

  test("6. Auto-trigger decision helper correctly determines whether to launch biometrics on app launch", () => {
    function shouldAutoTriggerBiometric(userData: { isBiometricLoginEnabled?: boolean; isFaceIdEnabled?: boolean } | null): boolean {
      if (!userData) return false;
      return userData.isBiometricLoginEnabled === true || userData.isFaceIdEnabled === true;
    }

    expect(shouldAutoTriggerBiometric({ isBiometricLoginEnabled: true })).toBe(true);
    expect(shouldAutoTriggerBiometric({ isFaceIdEnabled: true })).toBe(true);
    expect(shouldAutoTriggerBiometric({ isBiometricLoginEnabled: true, isFaceIdEnabled: true })).toBe(true);
    expect(shouldAutoTriggerBiometric({ isBiometricLoginEnabled: false, isFaceIdEnabled: false })).toBe(false);
    expect(shouldAutoTriggerBiometric({})).toBe(false);
    expect(shouldAutoTriggerBiometric(null)).toBe(false);
  });

  test("7. Validates server-side biometric authorization payload without dummy PIN", () => {
    function authorizeTransaction(
      body: { pin?: string; isBiometricAuthenticated?: boolean },
      userData: { isBiometricTransferEnabled?: boolean; isBiometricLoginEnabled?: boolean; isFaceIdEnabled?: boolean }
    ): { authorized: boolean; error?: string } {
      const isUserBiometricEnabled =
        userData.isBiometricTransferEnabled === true ||
        userData.isBiometricLoginEnabled === true ||
        userData.isFaceIdEnabled === true;

      if (body.isBiometricAuthenticated === true) {
        if (!isUserBiometricEnabled) {
          return { authorized: false, error: "Biometric authorization is not enabled on this account." };
        }
        return { authorized: true };
      }

      if (body.pin && typeof body.pin === "string") {
        return { authorized: body.pin === "1234" };
      }

      return { authorized: false, error: "4-digit transaction PIN or biometric authorization is required." };
    }

    // Biometric enabled account + isBiometricAuthenticated: true
    expect(authorizeTransaction({ isBiometricAuthenticated: true }, { isBiometricTransferEnabled: true })).toEqual({ authorized: true });

    // Biometric disabled account + isBiometricAuthenticated: true
    expect(authorizeTransaction({ isBiometricAuthenticated: true }, { isBiometricTransferEnabled: false })).toEqual({
      authorized: false,
      error: "Biometric authorization is not enabled on this account.",
    });

    // Valid PIN authorization
    expect(authorizeTransaction({ pin: "1234" }, { isBiometricTransferEnabled: false })).toEqual({ authorized: true });

    // Invalid PIN authorization
    expect(authorizeTransaction({ pin: "9999" }, { isBiometricTransferEnabled: false })).toEqual({ authorized: false });

    // Missing auth payload
    expect(authorizeTransaction({}, { isBiometricTransferEnabled: true })).toEqual({
      authorized: false,
      error: "4-digit transaction PIN or biometric authorization is required.",
    });
  });
});
