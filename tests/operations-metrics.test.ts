import { describe, expect, test } from "bun:test";
import { AppConfig } from "../src/lib/ConfigContext";

describe("Platform Operations & Metrics Architecture Suite", () => {
  test("1. AppConfig default values for pool balances and payouts are initialized safely", () => {
    const defaultConfig: Partial<AppConfig> = {
      globalNgnBalance: 0,
      globalUsdBalance: 0,
      globalXofBalance: 0,
      todayDeposit: 0,
      todayTransfer: 0,
      todayPayout: 0,
      todayNetFlow: 0,
    };

    expect(defaultConfig.globalNgnBalance).toBe(0);
    expect(defaultConfig.globalUsdBalance).toBe(0);
    expect(defaultConfig.globalXofBalance).toBe(0);
    expect(defaultConfig.todayDeposit).toBe(0);
    expect(defaultConfig.todayTransfer).toBe(0);
    expect(defaultConfig.todayPayout).toBe(0);
    expect(defaultConfig.todayNetFlow).toBe(0);
  });

  test("2. Aggregates multi-currency wallet pool balances accurately across NGN, USD, and XOF", () => {
    const mockWallets = [
      { currency: "NGN", balance: 500000, bonusBalance: 12000 },
      { currency: "NGN", balance: 1500000, bonusBalance: 5000 },
      { currency: "USD", balance: 1200 },
      { currency: "USD", balance: 3500 },
      { currency: "XOF", balance: 450000 },
      { currency: "XOF", balance: 750000 },
    ];

    let poolNgn = 0;
    let poolUsd = 0;
    let poolXof = 0;
    let totalBonus = 0;

    mockWallets.forEach((w) => {
      const bal = Number(w.balance) || 0;
      const bonus = Number((w as any).bonusBalance) || 0;
      if (w.currency === "NGN") poolNgn += bal;
      if (w.currency === "USD") poolUsd += bal;
      if (w.currency === "XOF") poolXof += bal;
      totalBonus += bonus;
    });

    expect(poolNgn).toBe(2000000);
    expect(poolUsd).toBe(4700);
    expect(poolXof).toBe(1200000);
    expect(totalBonus).toBe(17000);
  });

  test("3. Calculates today's deposits, payouts, and net liquidity flow accurately", () => {
    const mockTodayTransactions = [
      { type: "DEPOSIT", status: "SUCCESS", amount: 100000, direction: "CREDIT" },
      { type: "VIRTUAL_ACCOUNT_DEPOSIT", status: "SUCCESS", amount: 250000, direction: "CREDIT" },
      { type: "TRANSFER", status: "SUCCESS", totalDebited: 150000, direction: "DEBIT" },
      { type: "WITHDRAWAL", status: "SUCCESS", totalDebited: 50000, direction: "DEBIT" },
      { type: "AIRTIME", status: "SUCCESS", totalDebited: 10000, direction: "DEBIT" },
      { type: "TRANSFER", status: "FAILED", totalDebited: 80000, direction: "DEBIT" }, // should be excluded
    ];

    const depositTypes = ["DEPOSIT", "VIRTUAL_ACCOUNT_DEPOSIT", "WALLET_FUNDING"];
    const payoutTypes = ["TRANSFER", "WITHDRAWAL", "CASHOUT", "AIRTIME", "DATA", "BILLS"];

    let todayDeposit = 0;
    let todayPayout = 0;
    let todayTransfer = 0;

    mockTodayTransactions.forEach((tx) => {
      if (tx.status !== "SUCCESS") return;
      const debitedAmt = Number(tx.totalDebited || tx.amount) || 0;
      const creditedAmt = Number(tx.amount) || 0;

      if (depositTypes.includes(tx.type)) {
        todayDeposit += creditedAmt;
      } else if (payoutTypes.includes(tx.type)) {
        todayPayout += debitedAmt;
        if (tx.type === "TRANSFER") {
          todayTransfer += debitedAmt;
        }
      }
    });

    const todayNetFlow = todayDeposit - todayPayout;

    expect(todayDeposit).toBe(350000);
    expect(todayPayout).toBe(210000);
    expect(todayTransfer).toBe(150000);
    expect(todayNetFlow).toBe(140000);
  });

  test("4. Formatting currency values handles edge cases safely without crashing", () => {
    const formatNgn = (val?: number) => `₦${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    const formatUsd = (val?: number) => `$${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    const formatXof = (val?: number) => `CFA ${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    expect(formatNgn(2500000)).toBe("₦2,500,000.00");
    expect(formatNgn(undefined)).toBe("₦0.00");
    expect(formatUsd(1250.5)).toBe("$1,250.50");
    expect(formatXof(750000)).toBe("CFA 750,000.00");
  });
});
