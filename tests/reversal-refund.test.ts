import { describe, test, expect } from "bun:test";

function calculateTransferRollbackRefund(trfAmount: number, providerFee: number, markup: number, vat = 0, origTotalDebited?: number): number {
  if (origTotalDebited && origTotalDebited >= trfAmount) {
    return origTotalDebited;
  }
  return trfAmount + providerFee + markup + vat;
}

describe("Failed Transfer Rollback & Reversal Refund Calculation", () => {
  test("Failed Transfer ₦5,000 with ₦10 Provider Fee + ₦20 CPanel Commission Markup refunds exactly ₦5,030.00", () => {
    const principal = 5000;
    const providerFee = 10;
    const markup = 20;
    const totalDebited = 5030;

    const refundAmount = calculateTransferRollbackRefund(principal, providerFee, markup, 0, totalDebited);
    expect(refundAmount).toBe(5030);
  });

  test("Failed Transfer without stored totalDebited calculates principal + fee + markup", () => {
    const principal = 5000;
    const providerFee = 10;
    const markup = 20;

    const refundAmount = calculateTransferRollbackRefund(principal, providerFee, markup, 0);
    expect(refundAmount).toBe(5030);
  });
});
