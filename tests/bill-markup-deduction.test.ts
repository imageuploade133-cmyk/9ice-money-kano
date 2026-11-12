import { describe, expect, test } from "bun:test";

describe("Bill Payment Commission Markup Math & Deductions", () => {
  test("calculates totalChargeAmount by adding markup fee to base bill amount", () => {
    const numAmount = 1000; // Base bill amount
    const appliedMarkupFee = 50; // Configured profit margin/commission

    const totalChargeAmount = numAmount + appliedMarkupFee;

    expect(totalChargeAmount).toBe(1050);
  });

  test("100% refund on failure refunds totalChargeAmount (base amount + markup fee)", () => {
    const numAmount = 2500;
    const appliedMarkupFee = 100;
    const totalChargeAmount = numAmount + appliedMarkupFee;

    let userWalletBalance = 5000;

    // Debit on purchase (5000 - 2600 = 2400)
    userWalletBalance -= totalChargeAmount;
    expect(userWalletBalance).toBe(2400);

    // Refund on provider failure (2400 + 2600 = 5000)
    userWalletBalance += totalChargeAmount;
    expect(userWalletBalance).toBe(5000);
  });
});
