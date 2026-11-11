import { describe, test, expect } from "bun:test";

const sanitizeCssString = (css: string): string => {
  if (!css) return "";
  return css
    .replace(/oklab\([^)]+\)/gi, "rgba(0, 0, 0, 0.1)")
    .replace(/oklch\([^)]+\)/gi, "rgba(0, 0, 0, 0.1)")
    .replace(/lab\([^)]+\)/gi, "rgba(0, 0, 0, 0.1)")
    .replace(/lch\([^)]+\)/gi, "rgba(0, 0, 0, 0.1)")
    .replace(/color\([^)]+\)/gi, "rgba(0, 0, 0, 0.1)");
};

describe("HTML2Canvas CSS Sanitization for Modern Color Functions", () => {
  test("replaces oklab(...) color expressions cleanly", () => {
    const rawCss = "color: oklab(0.6 -0.1 0.1); background: oklab(0.9 0 0);";
    const sanitized = sanitizeCssString(rawCss);

    expect(sanitized).not.toContain("oklab");
    expect(sanitized).toContain("rgba(0, 0, 0, 0.1)");
  });

  test("replaces oklch(...) color expressions cleanly", () => {
    const rawCss = "border-color: oklch(0.7 0.2 140);";
    const sanitized = sanitizeCssString(rawCss);

    expect(sanitized).not.toContain("oklch");
    expect(sanitized).toContain("rgba(0, 0, 0, 0.1)");
  });

  test("replaces lab(...), lch(...), and color(...) functions cleanly", () => {
    const rawCss = "background-color: lab(50% 20 30); color: lch(80% 30 120); fill: color(srgb 0 1 0);";
    const sanitized = sanitizeCssString(rawCss);

    expect(sanitized).not.toContain("lab(");
    expect(sanitized).not.toContain("lch(");
    expect(sanitized).not.toContain("color(");
  });
});
