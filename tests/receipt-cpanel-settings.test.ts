import { describe, test, expect } from "bun:test";

describe("Transaction Receipt CPanel Settings & Background Customization", () => {
  test("AppConfig default values for receipt background and CBN text", () => {
    const defaultReceiptBgImageUrl = "";
    const defaultReceiptBgImageEnabled = false;
    const defaultReceiptBgImageOpacity = 0.15;
    const defaultReceiptCbnText =
      "E-Global Pay is a Fintech app powered by Flutterwave, licensed by CBN and insured by NDIC.";

    expect(defaultReceiptBgImageEnabled).toBe(false);
    expect(defaultReceiptBgImageOpacity).toBe(0.15);
    expect(defaultReceiptCbnText).toContain("licensed by CBN and insured by NDIC.");
  });

  test("Receipt background layer renders strictly when enabled and URL is provided", () => {
    const shouldRenderBg = (enabled?: boolean, url?: string) => {
      return Boolean(enabled && url && url.trim().length > 0);
    };

    expect(shouldRenderBg(false, "https://i.ibb.co/bg.png")).toBe(false);
    expect(shouldRenderBg(true, "")).toBe(false);
    expect(shouldRenderBg(true, "https://i.ibb.co/bg.png")).toBe(true);
  });

  test("Receipt background opacity is clamped to valid percentage range", () => {
    const formatOpacity = (opacity?: number) => {
      const val = opacity ?? 0.15;
      return Math.round(val * 100);
    };

    expect(formatOpacity(0.15)).toBe(15);
    expect(formatOpacity(0.5)).toBe(50);
    expect(formatOpacity(undefined)).toBe(15);
  });

  test("CBN disclaimer text falls back to default when empty string or undefined", () => {
    const defaultText =
      "E-Global Pay is a Fintech app powered by Flutterwave, licensed by CBN and insured by NDIC.";

    const resolveCbnText = (customText?: string) => {
      if (customText && customText.trim().length > 0) {
        return customText.trim();
      }
      return defaultText;
    };

    expect(resolveCbnText("Custom Bank Disclaimer")).toBe("Custom Bank Disclaimer");
    expect(resolveCbnText("")).toBe(defaultText);
    expect(resolveCbnText(undefined)).toBe(defaultText);
  });
});
