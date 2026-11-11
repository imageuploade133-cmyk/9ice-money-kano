import { describe, test, expect } from "bun:test";

// Helper function mirroring PDF A4 Watermark Centering Math
function calculateA4WatermarkPosition(
  watermarkSizeMm: number,
  naturalWidth: number,
  naturalHeight: number
) {
  const aspectRatio = naturalHeight / naturalWidth;
  let w = watermarkSizeMm;
  let h = watermarkSizeMm * aspectRatio;

  if (h > 240) {
    h = 240;
    w = 240 / aspectRatio;
  }

  // A4 page dimensions: 210mm x 297mm
  const x = (210 - w) / 2;
  const y = (297 - h) / 2;

  return { x, y, w, h };
}

// Helper function for normalizing watermark opacity bounds
function normalizeWatermarkOpacity(opacity?: number): number {
  if (opacity === undefined || opacity === null || isNaN(opacity)) {
    return 0.15; // default 15% opacity
  }
  return Math.min(0.80, Math.max(0.05, opacity));
}

// Helper function for normalizing watermark size bounds
function normalizeWatermarkSize(size?: number): number {
  if (size === undefined || size === null || isNaN(size)) {
    return 100; // default 100mm size
  }
  return Math.min(180, Math.max(40, size));
}

describe("Statement Watermark Mathematical & Architectural Suite", () => {
  test("Calculates exact center x and y coordinates on A4 page (210mm x 297mm) for a square watermark", () => {
    const watermarkSize = 100; // 100mm
    const result = calculateA4WatermarkPosition(watermarkSize, 500, 500);

    expect(result.w).toBe(100);
    expect(result.h).toBe(100);
    expect(result.x).toBe((210 - 100) / 2); // 55mm
    expect(result.y).toBe((297 - 100) / 2); // 98.5mm
  });

  test("Maintains image aspect ratio for non-square traditional logos", () => {
    // 2:1 aspect ratio logo (width 1000, height 500)
    const result = calculateA4WatermarkPosition(120, 1000, 500);

    expect(result.w).toBe(120);
    expect(result.h).toBe(60); // 120 * (500/1000) = 60mm
    expect(result.x).toBe((210 - 120) / 2); // 45mm
    expect(result.y).toBe((297 - 60) / 2); // 118.5mm
  });

  test("Caps height to 240mm for unusually tall watermark images to fit inside A4 margins", () => {
    // Very tall logo (width 100, height 500)
    const result = calculateA4WatermarkPosition(100, 100, 500);

    expect(result.h).toBe(240); // capped height
    expect(result.w).toBe(240 / 5); // 48mm
    expect(result.y).toBe((297 - 240) / 2); // 28.5mm
  });

  test("Opacity normalization enforces standard range between 0.05 and 0.80", () => {
    expect(normalizeWatermarkOpacity(undefined)).toBe(0.15); // Default fallback
    expect(normalizeWatermarkOpacity(0.01)).toBe(0.05); // Min cap
    expect(normalizeWatermarkOpacity(0.95)).toBe(0.80); // Max cap
    expect(normalizeWatermarkOpacity(0.25)).toBe(0.25); // Valid custom value
  });

  test("Size normalization enforces standard range between 40mm and 180mm", () => {
    expect(normalizeWatermarkSize(undefined)).toBe(100); // Default fallback
    expect(normalizeWatermarkSize(10)).toBe(40); // Min cap
    expect(normalizeWatermarkSize(250)).toBe(180); // Max cap
    expect(normalizeWatermarkSize(140)).toBe(140); // Valid custom value
  });
});
