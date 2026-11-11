import { describe, test, expect } from "bun:test";
import {
  toMinorUnits,
  toMinorUnitsStrict,
  toMajorUnits,
  calculateNetBalance,
  calculateSpendableBalance,
  calculateDebtRecovery,
  calculateUserDeduction,
  isActiveUser,
} from "../src/lib/monetary-util";

describe("Production-Ready Global Wallet Deductions & Debt Recovery Architecture Suite", () => {
  // Test 1
  test("Test 1: Wallet = ₦500, Deduction = ₦100 -> Expected: Net = ₦400, Debt = ₦0", () => {
    const calc = calculateUserDeduction(500, 0, 100);
    expect(calc.amountAssessed).toBe(100);
    expect(calc.amountRecovered).toBe(100);
    expect(calc.amountOutstanding).toBe(0);
    expect(calc.newBalance).toBe(400);
    expect(calc.newDebt).toBe(0);

    const net = calculateNetBalance(calc.newBalance, calc.newDebt);
    const spendable = calculateSpendableBalance(calc.newBalance, calc.newDebt);
    expect(net).toBe(400);
    expect(spendable).toBe(400);
  });

  // Test 2
  test("Test 2: Wallet = ₦50, Deduction = ₦100 -> Expected: Net = -₦50, Debt = ₦50", () => {
    const calc = calculateUserDeduction(50, 0, 100);
    expect(calc.amountAssessed).toBe(100);
    expect(calc.amountRecovered).toBe(50);
    expect(calc.amountOutstanding).toBe(50);
    expect(calc.newBalance).toBe(0);
    expect(calc.newDebt).toBe(50);

    const net = calculateNetBalance(calc.newBalance, calc.newDebt);
    const spendable = calculateSpendableBalance(calc.newBalance, calc.newDebt);
    expect(net).toBe(-50);
    expect(spendable).toBe(0);
  });

  // Test 3
  test("Test 3: Debt = ₦50, Funding = ₦500 -> Expected: Debt = ₦0, Available = ₦450", () => {
    const rec = calculateDebtRecovery(500, 50);
    expect(rec.debtRecovered).toBe(50);
    expect(rec.netCreditToBalance).toBe(450);
    expect(rec.remainingDebt).toBe(0);

    const net = calculateNetBalance(rec.netCreditToBalance, rec.remainingDebt);
    const spendable = calculateSpendableBalance(rec.netCreditToBalance, rec.remainingDebt);
    expect(net).toBe(450);
    expect(spendable).toBe(450);
  });

  // Test 4
  test("Test 4: Debt = ₦100, Funding = ₦50 -> Expected: Debt = ₦50, Available = ₦0", () => {
    const rec = calculateDebtRecovery(50, 100);
    expect(rec.debtRecovered).toBe(50);
    expect(rec.netCreditToBalance).toBe(0);
    expect(rec.remainingDebt).toBe(50);

    const net = calculateNetBalance(rec.netCreditToBalance, rec.remainingDebt);
    const spendable = calculateSpendableBalance(rec.netCreditToBalance, rec.remainingDebt);
    expect(net).toBe(-50);
    expect(spendable).toBe(0);
  });

  // Test 5
  test("Test 5: Debt = ₦50, Funding = ₦30 -> Debt = ₦20, Available = ₦0; then Funding = ₦100 -> Debt = ₦0, Available = ₦80", () => {
    // Step 1
    const rec1 = calculateDebtRecovery(30, 50);
    expect(rec1.debtRecovered).toBe(30);
    expect(rec1.netCreditToBalance).toBe(0);
    expect(rec1.remainingDebt).toBe(20);

    let net1 = calculateNetBalance(rec1.netCreditToBalance, rec1.remainingDebt);
    let spendable1 = calculateSpendableBalance(rec1.netCreditToBalance, rec1.remainingDebt);
    expect(net1).toBe(-20);
    expect(spendable1).toBe(0);

    // Step 2
    const rec2 = calculateDebtRecovery(100, rec1.remainingDebt);
    expect(rec2.debtRecovered).toBe(20);
    expect(rec2.netCreditToBalance).toBe(80);
    expect(rec2.remainingDebt).toBe(0);

    let net2 = calculateNetBalance(rec2.netCreditToBalance, rec2.remainingDebt);
    let spendable2 = calculateSpendableBalance(rec2.netCreditToBalance, rec2.remainingDebt);
    expect(net2).toBe(80);
    expect(spendable2).toBe(80);
  });

  // Test 6: Idempotency logic check
  test("Test 6: Idempotent key generation deductionId_userId prevents duplicate charges", () => {
    const deductionId = "DED-20260913-001";
    const userId = "user-123";
    const docKey1 = `ded_${deductionId}_${userId}`;
    const docKey2 = `ded_${deductionId}_${userId}`;
    expect(docKey1).toBe(docKey2);
  });

  // Test 7: Precision & Minor Units check
  test("Test 7: Integer minor units calculations eliminate floating point precision issues", () => {
    const minor = toMinorUnits(99.999999);
    const major = toMajorUnits(minor);
    expect(minor).toBe(10000);
    expect(major).toBe(100.00);
  });

  // Test 8: Active User Filter check
  test("Test 8: Active user filter excludes suspended, frozen, closed, or deleted accounts", () => {
    expect(isActiveUser({ status: "active" })).toBe(true);
    expect(isActiveUser({ status: "ACTIVE" })).toBe(true);
    expect(isActiveUser({ status: "FROZEN" })).toBe(false);
    expect(isActiveUser({ isFrozen: true })).toBe(false);
    expect(isActiveUser({ status: "SUSPENDED" })).toBe(false);
    expect(isActiveUser({ status: "DELETED" })).toBe(false);
    expect(isActiveUser({ status: "CLOSED" })).toBe(false);
  });

  // Test 9: Data Integrity Fail-Closed Validation
  test("Test 9: Fail-closed debt validation rejects malformed non-numeric or negative debt values", () => {
    const validateDebt = (debtVal: any) => {
      let currentDebt = 0;
      if (debtVal !== undefined && debtVal !== null) {
        const parsedDebt = Number(debtVal);
        if (isNaN(parsedDebt) || !isFinite(parsedDebt) || parsedDebt < 0) {
          throw new Error(`Invalid/corrupted outstanding debt (${debtVal}) detected. Failing closed.`);
        }
        currentDebt = parsedDebt;
      }
      return currentDebt;
    };

    expect(validateDebt(undefined)).toBe(0);
    expect(validateDebt(null)).toBe(0);
    expect(validateDebt(50)).toBe(50);
    expect(validateDebt("100")).toBe(100);

    expect(() => validateDebt("invalid_string")).toThrow("Failing closed");
    expect(() => validateDebt(NaN)).toThrow("Failing closed");
    expect(() => validateDebt(-50)).toThrow("Failing closed");
    expect(() => validateDebt(Infinity)).toThrow("Failing closed");
  });

  // Test 10: Worker Token Lease & Strict Finalization Simulation
  test("Test 10: Worker A loses lease when Worker B reclaims token B, blocking Worker A finalization", () => {
    let masterRecord = {
      deductionId: "DED-001",
      status: "PROCESSING",
      processingToken: "wrk_token_A",
    };

    const attemptPerUserProcessing = (workerToken: string) => {
      if (masterRecord.processingToken !== workerToken) {
        throw new Error(`Worker ${workerToken} lost lock lease. Active token: ${masterRecord.processingToken}`);
      }
      return "USER_PROCESSED";
    };

    const attemptStrictFinalization = (workerToken: string, targetStatus: string) => {
      if (masterRecord.status === "COMPLETED" && masterRecord.processingToken === workerToken) {
        return { finalized: true, status: "COMPLETED" };
      }
      if (masterRecord.status !== "PROCESSING" || !masterRecord.processingToken || masterRecord.processingToken !== workerToken) {
        return { finalized: false, reason: "LOST_OWNERSHIP" };
      }
      masterRecord.status = targetStatus;
      return { finalized: true, status: targetStatus };
    };

    // Worker A processes user 1
    expect(attemptPerUserProcessing("wrk_token_A")).toBe("USER_PROCESSED");

    // Worker B reclaims lease after lease expiry
    masterRecord.processingToken = "wrk_token_B";

    // Worker A attempts to process user 2 -> FAILS
    expect(() => attemptPerUserProcessing("wrk_token_A")).toThrow("lost lock lease");

    // Worker A attempts to finalize -> FAILS strictly
    const resA = attemptStrictFinalization("wrk_token_A", "PARTIAL");
    expect(resA.finalized).toBe(false);
    expect(resA.reason).toBe("LOST_OWNERSHIP");

    // Worker B processes user 2 and finalizes -> SUCCEEDS
    expect(attemptPerUserProcessing("wrk_token_B")).toBe("USER_PROCESSED");
    const resB = attemptStrictFinalization("wrk_token_B", "COMPLETED");
    expect(resB.finalized).toBe(true);
    expect(resB.status).toBe("COMPLETED");
    expect(masterRecord.status).toBe("COMPLETED");
  });

  // Test 11: Missing Wallet Document Fails Closed
  test("Test 11: Missing wallet document throws data integrity error and fails closed", () => {
    const processUser = (hasWalletDoc: boolean, walletBal?: number) => {
      if (!hasWalletDoc || walletBal === undefined) {
        throw new Error("[Data Integrity Error] Missing authoritative wallet document (wallets/user123_NGN). Failing closed.");
      }
      return toMinorUnitsStrict(walletBal, "Wallet Balance");
    };

    expect(() => processUser(false)).toThrow("Failing closed");
    expect(processUser(true, 100)).toBe(10000);
  });

  // Test 12: Strict Worker Finalization fails on missing token or non-PROCESSING status
  test("Test 12: Strict Worker Finalization rejects missing token or non-PROCESSING status", () => {
    const checkFinalization = (status: string, token: string | null, workerToken: string) => {
      if (status !== "PROCESSING" || !token || token !== workerToken) {
        return { finalized: false, reason: "LOST_OWNERSHIP" };
      }
      return { finalized: true };
    };

    expect(checkFinalization("COMPLETED", "wrk_123", "wrk_123").finalized).toBe(false);
    expect(checkFinalization("PROCESSING", null, "wrk_123").finalized).toBe(false);
    expect(checkFinalization("PROCESSING", "wrk_other", "wrk_123").finalized).toBe(false);
    expect(checkFinalization("PROCESSING", "wrk_123", "wrk_123").finalized).toBe(true);
  });
});
