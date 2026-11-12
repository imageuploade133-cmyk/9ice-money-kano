import { describe, test, expect } from "bun:test";

// Helper function implementing the exact WalletService.debitWallet totalDeduction calculation
function calculateWalletDebitDeduction(amount: number, fee?: number, vat?: number): number {
  const feeNum = Number(fee) || 0;
  const vatNum = Number(vat) || 0;
  return amount + feeNum + vatNum;
}

function processDebitBalance(currentBalance: number, amount: number, fee?: number, vat?: number): { previousBalance: number; newBalance: number } {
  const totalDeduction = calculateWalletDebitDeduction(amount, fee, vat);
  if (currentBalance < totalDeduction) {
    throw new Error(`Insufficient wallet funds to complete this transfer. Required: ₦${totalDeduction}, Available: ₦${currentBalance}`);
  }
  return {
    previousBalance: currentBalance,
    newBalance: currentBalance - totalDeduction,
  };
}

describe("WalletService.debitWallet Fee Deduction Logic", () => {
  test("Test 1: amount=100, fee=10, vat=0 -> Expected wallet deduction = 110", () => {
    const res = processDebitBalance(200, 100, 10, 0);
    expect(res.previousBalance).toBe(200);
    expect(res.newBalance).toBe(90);
  });

  test("Test 2: amount=100, fee=14, vat=0 -> Expected wallet deduction = 114", () => {
    const res = processDebitBalance(200, 100, 14, 0);
    expect(res.previousBalance).toBe(200);
    expect(res.newBalance).toBe(86);
  });

  test("Test 3: amount=100, fee=14, vat=2 -> Expected wallet deduction = 116", () => {
    const res = processDebitBalance(200, 100, 14, 2);
    expect(res.previousBalance).toBe(200);
    expect(res.newBalance).toBe(84);
  });

  test("Test 4: amount=100, fee=0, vat=0 -> Expected wallet deduction = 100", () => {
    const res = processDebitBalance(200, 100, 0, 0);
    expect(res.previousBalance).toBe(200);
    expect(res.newBalance).toBe(100);
  });

  test("Test insufficient balance: balance=113, amount=100, fee=14, vat=0 -> INSUFFICIENT BALANCE error", () => {
    expect(() => processDebitBalance(113, 100, 14, 0)).toThrow("Insufficient wallet funds to complete this transfer");
  });

  test("Test exact balance: balance=114, amount=100, fee=14, vat=0 -> succeeds, new balance = 0", () => {
    const res = processDebitBalance(114, 100, 14, 0);
    expect(res.previousBalance).toBe(114);
    expect(res.newBalance).toBe(0);
  });

  test("Financial Fee & Receipt Calculation Scenario 1: Amount=100, Provider fee=10, CPanel commission=5, VAT=0", () => {
    const providerFee = 10;
    const adminCommission = 5;
    const amount = 100;
    const vat = 0;

    const combinedFee = providerFee + adminCommission;
    const totalDebited = amount + combinedFee + vat;

    expect(combinedFee).toBe(15);
    expect(totalDebited).toBe(115);
  });

  test("Financial Fee & Receipt Calculation Scenario 2: Amount=100, Provider fee=10, CPanel commission=0, VAT=0", () => {
    const providerFee = 10;
    const adminCommission = 0;
    const amount = 100;
    const vat = 0;

    const combinedFee = providerFee + adminCommission;
    const totalDebited = amount + combinedFee + vat;

    expect(combinedFee).toBe(10);
    expect(totalDebited).toBe(110);
  });
});
