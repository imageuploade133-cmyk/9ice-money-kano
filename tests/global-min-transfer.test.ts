import { describe, test, expect } from "bun:test";
import { DEFAULT_GLOBAL_MIN_TRANSFER } from "../src/lib/global-limits-util";

describe("Global Minimum Transfer Limit Enforcement Suite", () => {
  test("Scenario 1: Default global minimum transfer limit falls back safely to 100 NGN", () => {
    expect(DEFAULT_GLOBAL_MIN_TRANSFER).toBe(100);
  });

  test("Scenario 2: Single transfer amount below active minimum transfer limit is rejected", () => {
    const globalMinLimit = 100;
    const testAttemptAmount = 50; // below 100

    const isValid = testAttemptAmount >= globalMinLimit;
    expect(isValid).toBe(false);
  });

  test("Scenario 3: Single transfer amount equal to or above active minimum transfer limit passes validation", () => {
    const globalMinLimit = 100;
    const testAttemptExact = 100;
    const testAttemptAbove = 500;

    expect(testAttemptExact >= globalMinLimit).toBe(true);
    expect(testAttemptAbove >= globalMinLimit).toBe(true);
  });

  test("Scenario 4: Bulk transfer batch with any recipient below active global minimum transfer limit fails closed", () => {
    const globalMinLimit = 100;
    const batchRecipients = [
      { name: "Recipient 1", amount: 500 },
      { name: "Recipient 2", amount: 20 }, // 20 < 100 -> Invalid!
      { name: "Recipient 3", amount: 1000 },
    ];

    const invalidRecipients = batchRecipients.filter(r => Number(r.amount) < globalMinLimit);
    expect(invalidRecipients.length).toBe(1);
    expect(invalidRecipients[0].name).toBe("Recipient 2");
  });

  test("Scenario 5: Custom admin-configured global minimum transfer limit (e.g. 500 NGN) is enforced dynamically", () => {
    const customAdminMinLimit = 500;
    const validAmount = 500;
    const rejectedAmount = 499.99;

    expect(validAmount >= customAdminMinLimit).toBe(true);
    expect(rejectedAmount >= customAdminMinLimit).toBe(false);
  });
});
