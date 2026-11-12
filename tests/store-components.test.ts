import { describe, expect, test } from "bun:test";
import { hexToRgba, getEffectivePrice, StoreItem } from "../src/components/store/types";

describe("Store Components & Utilities Suite", () => {
  test("hexToRgba converts 3-digit and 6-digit hex colors accurately", () => {
    expect(hexToRgba("#FC7A00", 1)).toBe("rgba(252, 122, 0, 1)");
    expect(hexToRgba("#FFF", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
    expect(hexToRgba("invalid", 1)).toBe("rgba(252, 122, 0, 1)");
  });

  test("getEffectivePrice returns promotional price if lower than list price", () => {
    const item1: StoreItem = {
      id: "1",
      title: "Laptop",
      description: "High performance",
      price: 500000,
      discountPrice: 450000,
      category: "Hardware",
      imageUrl: "",
      inStock: true,
    };
    expect(getEffectivePrice(item1)).toBe(450000);

    const item2: StoreItem = {
      id: "2",
      title: "Mouse",
      description: "Wireless",
      price: 15000,
      category: "Accessories",
      imageUrl: "",
      inStock: true,
    };
    expect(getEffectivePrice(item2)).toBe(15000);
  });
});
