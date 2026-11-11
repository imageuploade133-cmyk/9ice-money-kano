import { describe, test, expect } from "bun:test";

interface DummyTransaction {
  reference: string;
  type?: string;
  category?: string;
  status?: string;
  description?: string;
  recipientName?: string;
  beneficiaryName?: string;
  phoneNumber?: string;
  customerId?: string;
  network?: string;
  billerName?: string;
  billerType?: string;
  amount: number;
  totalCredited?: number;
  totalDebited?: number;
  beneficiaryBankName?: string;
  recipientBankName?: string;
}

function evaluateRefundType(tx: DummyTransaction) {
  const cat = (tx.category || "").toUpperCase();
  const txType = (tx.type || "").toUpperCase();
  const desc = (tx.description || "").toLowerCase();
  const refUpper = (tx.reference || "").toUpperCase();
  const bType = (tx.billerType || "").toLowerCase();

  const isPhoneRecipient = (rec?: string) => {
    if (!rec) return false;
    const clean = rec.replace(/\s+/g, "");
    return /^(\+?234|0)[789][01]\d{8}$/.test(clean);
  };

  const isHasBankDetails = Boolean(
    tx.beneficiaryBankName ||
    tx.recipientBankName
  );

  const isRefund = txType === "REFUND" || cat === "REFUND" || tx.status === "REFUND" || desc.includes("refund") || desc.includes("reversal");

  const isCardRefund = isRefund && (
    cat === "CARD" || txType.includes("CARD") || desc.includes("virtual card")
  );

  const isBillRefund = isRefund && !isCardRefund && (
    cat === "BILLS" || cat === "AIRTIME" || cat === "DATA" || cat === "CABLE" || cat === "ELECTRICITY" || cat === "WAEC" || cat === "VTU" ||
    txType === "BILL_REFUND" ||
    refUpper.includes("BILL") ||
    refUpper.includes("VTU") ||
    refUpper.includes("AIRTIME") ||
    refUpper.includes("DATA") ||
    refUpper.includes("CABLE") ||
    refUpper.includes("ELEC") ||
    refUpper.includes("WAEC") ||
    Boolean(tx.network) ||
    Boolean(tx.phoneNumber) ||
    desc.includes("airtime") ||
    desc.includes("data") ||
    desc.includes("recharge") ||
    desc.includes("electricity") ||
    desc.includes("cable") ||
    desc.includes("vtu") ||
    (!isHasBankDetails && isPhoneRecipient(tx.recipientName)) ||
    (!isHasBankDetails && isPhoneRecipient(tx.customerId))
  );

  const isDataRefund = isBillRefund && (
    refUpper.includes("DATA") || bType === "data" || cat === "DATA" || desc.includes("data")
  );

  const isAirtimeRefund = isBillRefund && !isDataRefund && (
    refUpper.includes("AIR") || refUpper.includes("VTU-AIR") || bType === "airtime" || cat === "AIRTIME" || desc.includes("airtime") || desc.includes("recharge") || (!isHasBankDetails && isPhoneRecipient(tx.recipientName)) || Boolean(tx.network)
  );

  const isBankTransferRefund = isRefund && !isCardRefund && !isBillRefund && isHasBankDetails;

  return {
    isRefund,
    isCardRefund,
    isBillRefund,
    isDataRefund,
    isAirtimeRefund,
    isBankTransferRefund,
  };
}

describe("VTU & Bill Refund Receipt Classification Suite", () => {
  test("Exact Screenshot Bug Scenario: Airtime refund with phone recipient 07043164360 and VTU-AIR reference", () => {
    const tx: DummyTransaction = {
      reference: "REFUND-VTU-AIR-1789494081",
      type: "REFUND",
      category: "REFUND",
      status: "SUCCESS",
      description: "Refund for failed bill payment: Airtime Recharge 200 NGN",
      recipientName: "07043164360",
      amount: 200,
      totalCredited: 200,
      network: "MTN",
    };

    const res = evaluateRefundType(tx);
    expect(res.isRefund).toBe(true);
    expect(res.isCardRefund).toBe(false);
    expect(res.isBillRefund).toBe(true);
    expect(res.isAirtimeRefund).toBe(true);
    expect(res.isDataRefund).toBe(false);
    expect(res.isBankTransferRefund).toBe(false);
  });

  test("Data refund with phone recipient 08123456789 and VTU-DATA reference", () => {
    const tx: DummyTransaction = {
      reference: "REFUND-VTU-DATA-9876543210",
      type: "REFUND",
      category: "DATA",
      status: "SUCCESS",
      description: "Refund for failed bill payment: MTN 1GB Data",
      recipientName: "08123456789",
      amount: 300,
      totalCredited: 300,
      network: "MTN",
    };

    const res = evaluateRefundType(tx);
    expect(res.isBillRefund).toBe(true);
    expect(res.isDataRefund).toBe(true);
    expect(res.isAirtimeRefund).toBe(false);
    expect(res.isBankTransferRefund).toBe(false);
  });

  test("Bank transfer reversal with bank details is NOT classified as bill refund", () => {
    const tx: DummyTransaction = {
      reference: "REFUND-TRF-001234",
      type: "REFUND",
      category: "REFUND",
      status: "SUCCESS",
      description: "Reversal for failed bank transfer",
      recipientName: "John Doe",
      amount: 5000,
      totalCredited: 5016,
      recipientBankName: "First Bank of Nigeria",
    };

    const res = evaluateRefundType(tx);
    expect(res.isBillRefund).toBe(false);
    expect(res.isBankTransferRefund).toBe(true);
  });
});
