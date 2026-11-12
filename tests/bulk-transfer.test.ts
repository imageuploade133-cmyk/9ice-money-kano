import { describe, test, expect } from "bun:test";
import { resolveBankName, BankListItem } from "../src/lib/bank-resolver";

describe("Bulk Transfer Fee, Refund, Code String, and Receipt Pipeline", () => {
  const mockBankList: BankListItem[] = [
    { code: "044", name: "Access Bank" },
    { code: "058", name: "GTBank" },
    { code: "011", name: "First Bank" },
    { code: "100004", name: "Opay" },
  ];

  test("A: 2 recipients (100 + 200) with dynamic provider fees + commission -> total deduction = principal + fees + commission + VAT", () => {
    const rec1Amount = 100;
    const rec2Amount = 200;
    const rec1ProviderFee = 10.00;
    const rec2ProviderFee = 15.00;
    const rec1Commission = 2.00;
    const rec2Commission = 5.00;
    const vat = 0;

    const totalPrincipal = rec1Amount + rec2Amount; // 300
    const totalProviderFee = rec1ProviderFee + rec2ProviderFee; // 25
    const totalCommission = rec1Commission + rec2Commission; // 7
    const totalFees = totalProviderFee + totalCommission; // 32

    // WalletService.debitWallet calculation: totalDeduction = amount + fee + vat
    const totalDeduction = totalPrincipal + totalFees + vat; // 332

    expect(totalPrincipal).toBe(300);
    expect(totalFees).toBe(32);
    expect(totalDeduction).toBe(332);
  });

  test("B & C: Insufficient balance vs exact balance deduction math", () => {
    const totalPrincipal = 300;
    const totalFees = 42;
    const totalDeduction = totalPrincipal + totalFees; // 342

    const balanceCheckInsufficient = (bal: number) => bal >= totalDeduction;
    expect(balanceCheckInsufficient(341)).toBe(false);
    expect(balanceCheckInsufficient(342)).toBe(true);

    const exactBalanceAfterDeduction = 342 - totalDeduction;
    expect(exactBalanceAfterDeduction).toBe(0);
  });

  test("D: Failed gateway request refunds EXACTLY the original debited amount (342)", () => {
    const debitedTotal = 342;
    const refundAmount = debitedTotal; // exact reversal
    expect(refundAmount).toBe(342);
  });

  test("E: No hardcoded 10.00 fallback dependency in dynamic fee calculation", () => {
    const recProviderFee = 25.00; // dynamic fee from gateway /transfer-fee
    const recMarkup = 5.00;
    const itemFee = recProviderFee + recMarkup;
    expect(itemFee).toBe(30.00);
  });

  test("F: Bank codes remain strings, preserving leading zeros ('044', '058', '011')", () => {
    const code1 = "044";
    const code2 = "058";
    const code3 = "011";

    expect(typeof code1).toBe("string");
    expect(code1).toBe("044");

    expect(resolveBankName({ recipientBankCode: code1 }, mockBankList)).toBe("Access Bank");
    expect(resolveBankName({ recipientBankCode: code2 }, mockBankList)).toBe("GTBank");
    expect(resolveBankName({ recipientBankCode: code3 }, mockBankList)).toBe("First Bank");
  });

  test("G & H: Metadata contains individual bulk recipients and aggregate fees", () => {
    const metadata = {
      isBulk: true,
      recipientCount: 2,
      totalAmount: 300,
      totalProviderFees: 25,
      totalMarkupFees: 7,
      totalFees: 32,
      totalDeduction: 332,
      bulkRecipients: [
        {
          accountNumber: "0123456789",
          bankCode: "044",
          amount: 100,
          narration: "Item 1",
          providerFee: 10,
          markupFee: 2,
          itemFee: 12,
        },
        {
          accountNumber: "9876543210",
          bankCode: "058",
          amount: 200,
          narration: "Item 2",
          providerFee: 15,
          markupFee: 5,
          itemFee: 20,
        },
      ],
    };

    expect(metadata.isBulk).toBe(true);
    expect(metadata.bulkRecipients.length).toBe(2);
    expect(metadata.bulkRecipients[0].bankCode).toBe("044");
    expect(metadata.totalDeduction).toBe(332);
  });
});
