/**
 * Centralized Monetary & Accounting Engine
 * Enforces integer minor units (kobo/cents) arithmetic for precision to eliminate floating point issues (e.g. 99.999999 or 100.000001).
 * Defines official wallet net position and spendable balance calculations with strict fail-closed data integrity validation.
 */

/**
 * Converts a major currency amount to minor units (e.g. 100.50 NGN -> 10050 Kobo) with strict fail-closed validation.
 * Throws explicit errors for malformed non-numeric values, NaN, Infinity, or negative numbers where non-negative is required.
 */
export function toMinorUnitsStrict(amount: number | string | null | undefined, name = "Amount"): number {
  if (amount === null || amount === undefined) return 0;
  if (typeof amount === "string" && amount.trim() === "") return 0;

  const num = typeof amount === "number" ? amount : Number(amount);
  if (isNaN(num) || !isFinite(num)) {
    throw new Error(`[Financial Data Integrity Error] ${name} is malformed or non-numeric: ${amount}`);
  }
  if (num < 0) {
    throw new Error(`[Financial Data Integrity Error] ${name} cannot be negative: ${num}`);
  }
  return Math.round(num * 100);
}

/**
 * Converts a major currency amount to minor units safely.
 */
export function toMinorUnits(amount: number | string | null | undefined): number {
  return toMinorUnitsStrict(amount, "Amount");
}

/**
 * Converts minor units (e.g. 10050 Kobo) back to major currency units (e.g. 100.50 NGN).
 */
export function toMajorUnits(minorUnits: number): number {
  if (isNaN(minorUnits) || !isFinite(minorUnits)) {
    throw new Error(`[Financial Data Integrity Error] Invalid minor units: ${minorUnits}`);
  }
  return Math.round(minorUnits) / 100;
}

/**
 * Calculates net wallet position: Net Balance = Asset Balance - Outstanding Debt.
 * Example: Wallet = ₦50, Debt = ₦100 => Net = -₦50.
 */
export function calculateNetBalance(walletBalance: number, outstandingDebt: number): number {
  const balMinor = toMinorUnitsStrict(walletBalance, "Wallet Balance");
  const debtMinor = toMinorUnitsStrict(outstandingDebt, "Outstanding Debt");
  return toMajorUnits(balMinor - debtMinor);
}

/**
 * Calculates spendable balance: Spendable = Math.max(0, Asset Balance - Outstanding Debt).
 * Users with negative or zero net balance cannot spend borrowed/debt funds.
 */
export function calculateSpendableBalance(walletBalance: number, outstandingDebt: number): number {
  const balMinor = toMinorUnitsStrict(walletBalance, "Wallet Balance");
  const debtMinor = toMinorUnitsStrict(outstandingDebt, "Outstanding Debt");
  const netMinor = balMinor - debtMinor;
  return toMajorUnits(Math.max(0, netMinor));
}

/**
 * Evaluates atomic debt recovery breakdown upon incoming funding/credit.
 * Example 1: Debt = ₦100, Funding = ₦500 => Recovered = ₦100, Net Credit = ₦400, New Debt = ₦0
 * Example 2: Debt = ₦100, Funding = ₦50 => Recovered = ₦50, Net Credit = ₦0, New Debt = ₦50
 */
export function calculateDebtRecovery(
  creditAmount: number,
  currentDebt: number
): {
  debtRecovered: number;
  netCreditToBalance: number;
  remainingDebt: number;
} {
  const creditMinor = toMinorUnitsStrict(creditAmount, "Credit Amount");
  const debtMinor = toMinorUnitsStrict(currentDebt, "Current Debt");

  if (creditMinor <= 0 || debtMinor <= 0) {
    return {
      debtRecovered: 0,
      netCreditToBalance: toMajorUnits(creditMinor),
      remainingDebt: toMajorUnits(debtMinor),
    };
  }

  const recoveredMinor = Math.min(creditMinor, debtMinor);
  const netCreditMinor = creditMinor - recoveredMinor;
  const remainingDebtMinor = debtMinor - recoveredMinor;

  return {
    debtRecovered: toMajorUnits(recoveredMinor),
    netCreditToBalance: toMajorUnits(netCreditMinor),
    remainingDebt: toMajorUnits(remainingDebtMinor),
  };
}

/**
 * Evaluates whether a user account is active and eligible for global deductions.
 * Excludes frozen, suspended, deleted, closed, inactive, or banned accounts.
 */
export function isActiveUser(uData: Record<string, any>): boolean {
  if (!uData) return false;
  if (uData.isFrozen === true || uData.frozen === true) return false;
  const status = String(uData.status || "active").toUpperCase();
  if (["FROZEN", "SUSPENDED", "DELETED", "CLOSED", "INACTIVE", "BANNED"].includes(status)) {
    return false;
  }
  return true;
}

/**
 * Evaluates global deduction assessment for a single user.
 * Example 1: Wallet = ₦500, Deduction = ₦100 => Recovered = ₦100, New Debt = ₦0, Net Balance After = ₦400
 * Example 2: Wallet = ₦50, Deduction = ₦100 => Recovered = ₦50, New Debt = ₦50, Net Balance After = -₦50
 */
export function calculateUserDeduction(
  currentBalance: number,
  currentDebt: number,
  deductionAmount: number
): {
  amountAssessed: number;
  amountRecovered: number;
  amountOutstanding: number;
  newBalance: number;
  newDebt: number;
  netBalanceAfter: number;
} {
  const balMinor = toMinorUnitsStrict(currentBalance, "Current Balance");
  const debtMinor = toMinorUnitsStrict(currentDebt, "Current Debt");
  const dedMinor = toMinorUnitsStrict(deductionAmount, "Deduction Amount");

  const recoverMinor = Math.min(balMinor, dedMinor);
  const newBalMinor = balMinor - recoverMinor;
  const addedDebtMinor = dedMinor - recoverMinor;
  const newDebtMinor = debtMinor + addedDebtMinor;
  const netAfterMinor = newBalMinor - newDebtMinor;

  return {
    amountAssessed: toMajorUnits(dedMinor),
    amountRecovered: toMajorUnits(recoverMinor),
    amountOutstanding: toMajorUnits(addedDebtMinor),
    newBalance: toMajorUnits(newBalMinor),
    newDebt: toMajorUnits(newDebtMinor),
    netBalanceAfter: toMajorUnits(netAfterMinor),
  };
}
