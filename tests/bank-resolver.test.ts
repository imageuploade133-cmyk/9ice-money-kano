import { describe, test, expect } from "bun:test";
import { resolveBankName, BankListItem } from "../src/lib/bank-resolver";

const mockBankList: BankListItem[] = [
  { code: "100004", name: "Opay" },
  { code: "044", name: "Access Bank" },
  { code: "058", name: "GTBank" },
  { code: "011", name: "First Bank" },
];

describe("resolveBankName Utility", () => {
  test("TEST 1: Stored bank name has priority over bank code lookup", () => {
    const tx = {
      recipientBankName: "Opay",
      recipientBankCode: "100004",
    };
    expect(resolveBankName(tx, mockBankList)).toBe("Opay");
  });

  test("TEST 2: Code lookup when recipientBankName is undefined", () => {
    const tx = {
      recipientBankName: undefined,
      recipientBankCode: "100004",
    };
    expect(resolveBankName(tx, mockBankList)).toBe("Opay");
  });

  test("TEST 3: Code lookup for '044' resolves to Access Bank from bank list", () => {
    const tx = {
      recipientBankName: undefined,
      recipientBankCode: "044",
    };
    expect(resolveBankName(tx, mockBankList)).toBe("Access Bank");
  });

  test("TEST 4: Empty string stored name falls back to code lookup", () => {
    const tx = {
      recipientBankName: "",
      recipientBankCode: "100004",
    };
    expect(resolveBankName(tx, mockBankList)).toBe("Opay");
  });

  test("TEST 5: Whitespace-only stored name falls back to code lookup", () => {
    const tx = {
      recipientBankName: "   ",
      recipientBankCode: "100004",
    };
    expect(resolveBankName(tx, mockBankList)).toBe("Opay");
  });

  test("TEST 6: Unknown bank code falls back to 'Bank'", () => {
    const tx = {
      recipientBankName: undefined,
      recipientBankCode: "999999",
    };
    expect(resolveBankName(tx, mockBankList)).toBe("Bank");
  });

  test("TEST 7: Undefined fields fall back to 'Bank'", () => {
    const tx = {
      recipientBankName: undefined,
      recipientBankCode: undefined,
    };
    expect(resolveBankName(tx, mockBankList)).toBe("Bank");
  });

  test("TEST 8: Leading zero protection (preserves string '044' vs numeric 44)", () => {
    const tx = {
      recipientBankCode: "044",
    };
    const bankListWithLeadingZeroes: BankListItem[] = [
      { code: "44", name: "Numeric 44 Bank" },
      { code: "044", name: "Access Bank" },
    ];
    expect(resolveBankName(tx, bankListWithLeadingZeroes)).toBe("Access Bank");
  });

  test("TEST 9: Beneficiary bank code lookup", () => {
    const tx = {
      beneficiaryBankCode: "100004",
    };
    expect(resolveBankName(tx, mockBankList)).toBe("Opay");
  });

  test("TEST 10: Sender bank code lookup", () => {
    const tx = {
      senderBankCode: "044",
    };
    expect(resolveBankName(tx, mockBankList)).toBe("Access Bank");
  });

  test("Handles null transaction object safely without throwing", () => {
    expect(resolveBankName(null, mockBankList)).toBe("Bank");
    expect(resolveBankName(undefined, mockBankList)).toBe("Bank");
  });
});
