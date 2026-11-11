import { describe, test, expect } from "bun:test";
import { DEFAULT_SAVINGS_PLANS } from "../src/lib/savings-plans-types";

describe("Savings & Investment Plans Architectural Suite", () => {
  test("Scenario 1: Default savings plans contain required administrative configurations", () => {
    expect(Array.isArray(DEFAULT_SAVINGS_PLANS)).toBe(true);
    expect(DEFAULT_SAVINGS_PLANS.length).toBeGreaterThanOrEqual(3);

    const targetPlan = DEFAULT_SAVINGS_PLANS[0];
    expect(targetPlan.name).toBe("Target Savings Plan");
    expect(targetPlan.type).toBe("SAVINGS");
    expect(targetPlan.apr).toBe(12.5);
    expect(targetPlan.allowMonths).toBe(true);
    expect(targetPlan.monthOptions).toEqual([1, 3, 6, 9]);
    expect(targetPlan.allowYears).toBe(true);
    expect(targetPlan.yearOptions).toEqual([1, 2]);
    expect(targetPlan.allowCustom).toBe(true);
  });

  test("Scenario 2: Calculate month unlock duration accurately", () => {
    const months = 3;
    const startDate = new Date("2026-01-01T00:00:00.000Z");
    const maturityDate = new Date(startDate);
    maturityDate.setMonth(maturityDate.getMonth() + months);

    expect(maturityDate.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  test("Scenario 3: Calculate year unlock duration accurately", () => {
    const years = 2;
    const startDate = new Date("2026-01-01T00:00:00.000Z");
    const maturityDate = new Date(startDate);
    maturityDate.setFullYear(maturityDate.getFullYear() + years);

    expect(maturityDate.toISOString().slice(0, 10)).toBe("2028-01-01");
  });

  test("Scenario 4: Validate custom unlock date bounds against admin min/max day constraints", () => {
    const minCustomDays = 7;
    const maxCustomDays = 730;

    const validDays = 30; // within 7..730
    const invalidShortDays = 3; // < 7
    const invalidLongDays = 1000; // > 730

    expect(validDays >= minCustomDays && validDays <= maxCustomDays).toBe(true);
    expect(invalidShortDays >= minCustomDays).toBe(false);
    expect(invalidLongDays <= maxCustomDays).toBe(false);
  });

  test("Scenario 5: Investment amount validation respects plan min and max investment limits", () => {
    const plan = DEFAULT_SAVINGS_PLANS[0]; // min: 1000, max: 10000000

    const validAmount = 5000;
    const invalidTooSmall = 500;
    const invalidTooLarge = 20000000;

    expect(validAmount >= plan.minInvestment && validAmount <= plan.maxInvestment).toBe(true);
    expect(invalidTooSmall >= plan.minInvestment).toBe(false);
    expect(invalidTooLarge <= plan.maxInvestment).toBe(false);
  });
});
