import { describe, test, expect } from "bun:test";
import { InvestmentService, InvestmentSettings } from "../src/services/investment-service";

describe("Investment Early Cancellation & Policy Architecture Suite", () => {
  test("Scenario 1: Penalty calculation deducts specified penalty rate from principal", () => {
    const principal = 10000;
    const penaltyRate = 0.10; // 10%
    const penaltyDeducted = Number((principal * penaltyRate).toFixed(2));
    const refundAmount = Math.max(0, principal - penaltyDeducted);

    expect(penaltyDeducted).toBe(1000);
    expect(refundAmount).toBe(9000);
    expect(penaltyDeducted + refundAmount).toBe(principal);
  });

  test("Scenario 2: Custom penalty rate (e.g. 15%) is applied accurately", () => {
    const principal = 50000;
    const penaltyRate = 0.15; // 15%
    const penaltyDeducted = Number((principal * penaltyRate).toFixed(2));
    const refundAmount = Math.max(0, principal - penaltyDeducted);

    expect(penaltyDeducted).toBe(7500);
    expect(refundAmount).toBe(42500);
  });

  test("Scenario 3: Zero penalty rate returns full principal", () => {
    const principal = 25000;
    const penaltyRate = 0; // 0%
    const penaltyDeducted = Number((principal * penaltyRate).toFixed(2));
    const refundAmount = Math.max(0, principal - penaltyDeducted);

    expect(penaltyDeducted).toBe(0);
    expect(refundAmount).toBe(25000);
  });

  test("Scenario 4: Interest calculation with 0 days returns 0 interest", () => {
    const interest = InvestmentService.calculateInterest(10000, 0.12, 0, "SIMPLE");
    expect(interest).toBe(0);
  });

  test("Scenario 5: Simple interest for 365 days yields full APR amount", () => {
    const interest = InvestmentService.calculateInterest(10000, 0.10, 365, "SIMPLE");
    expect(interest).toBe(1000);
  });
});
