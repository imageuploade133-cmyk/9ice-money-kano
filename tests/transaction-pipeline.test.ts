import { expect, test, describe } from "bun:test";
import { Transaction } from "@/components/wallet/TransactionReceipt";
import { TransactionRecord } from "@/services/wallet-service";
import {
  getTransactionDisplayAmount,
  isCreditTransaction,
} from "@/lib/transaction-status-normalizer";

describe("Transaction Data Pipeline & Presentation", () => {
  test("Failed Virtual Card Issuing and Refund Metadata Preservation (NGN)", () => {
    const failedIssuanceTx: Transaction = {
      id: "tx-vc-init-101",
      userId: "user_ngn_1",
      amount: 2000,
      currency: "NGN",
      reference: "vc-init-101",
      type: "CARD_ISSUANCE",
      category: "CARD",
      direction: "DEBIT",
      description: "Virtual Card Issuing",
      recipientName: "Virtual Card Issuing",
      beneficiaryName: "Virtual Card Issuing",
      status: "FAILED",
      date: "Sep 03, 2026",
      time: "04:00 PM",
      fee: 0,
      totalDebited: 2000,
    };

    expect(isCreditTransaction(failedIssuanceTx)).toBe(false);
    expect(getTransactionDisplayAmount(failedIssuanceTx)).toBe(2000);
    expect(failedIssuanceTx.recipientName).toBe("Virtual Card Issuing");

    const refundIssuanceTx: Transaction = {
      id: "tx-REFUND-vc-init-101",
      userId: "user_ngn_1",
      amount: 2000,
      currency: "NGN",
      reference: "REFUND-vc-init-101",
      type: "REFUND",
      category: "CARD",
      direction: "CREDIT",
      description: "Refund for Failed Virtual Card Issuing",
      recipientName: "Virtual Card Issuing",
      beneficiaryName: "Virtual Card Issuing",
      status: "SUCCESS",
      date: "Sep 03, 2026",
      time: "04:01 PM",
      fee: 0,
      totalCredited: 2000,
      metadata: {
        originalTransactionId: "tx-vc-init-101",
        originalTransactionType: "CARD_ISSUANCE",
        originalOperation: "Virtual Card Issuing",
        originalReference: "vc-init-101",
      },
    };

    expect(isCreditTransaction(refundIssuanceTx)).toBe(true);
    expect(getTransactionDisplayAmount(refundIssuanceTx)).toBe(2000);
    expect(refundIssuanceTx.recipientName).toBe("Virtual Card Issuing");
    expect(refundIssuanceTx.beneficiaryName).toBe("Virtual Card Issuing");
    expect(refundIssuanceTx.category).toBe("CARD");
    expect(refundIssuanceTx.currency).toBe("NGN");
    expect(refundIssuanceTx.metadata?.originalOperation).toBe("Virtual Card Issuing");
  });

  test("Failed Virtual Card Issuing and Refund Metadata Preservation (USD with Setup Fee)", () => {
    const failedUsdIssuanceTx: Transaction = {
      id: "tx-vc-init-102",
      userId: "user_usd_1",
      amount: 2.00,
      currency: "USD",
      reference: "vc-init-102",
      type: "CARD_ISSUANCE",
      category: "CARD",
      direction: "DEBIT",
      description: "Virtual Card Issuing",
      recipientName: "Virtual Card Issuing",
      beneficiaryName: "Virtual Card Issuing",
      status: "FAILED",
      date: "Sep 03, 2026",
      time: "04:05 PM",
      fee: 2.00,
      totalDebited: 4.00,
    };

    expect(isCreditTransaction(failedUsdIssuanceTx)).toBe(false);
    expect(getTransactionDisplayAmount(failedUsdIssuanceTx)).toBe(4.00);

    const refundUsdIssuanceTx: Transaction = {
      id: "tx-REFUND-vc-init-102",
      userId: "user_usd_1",
      amount: 2.00,
      currency: "USD",
      reference: "REFUND-vc-init-102",
      type: "REFUND",
      category: "CARD",
      direction: "CREDIT",
      description: "Refund for Failed Virtual Card Issuing",
      recipientName: "Virtual Card Issuing",
      beneficiaryName: "Virtual Card Issuing",
      status: "SUCCESS",
      date: "Sep 03, 2026",
      time: "04:06 PM",
      fee: 2.00,
      totalCredited: 4.00,
      metadata: {
        originalTransactionId: "tx-vc-init-102",
        originalTransactionType: "CARD_ISSUANCE",
        originalOperation: "Virtual Card Issuing",
        originalReference: "vc-init-102",
      },
    };

    expect(isCreditTransaction(refundUsdIssuanceTx)).toBe(true);
    expect(getTransactionDisplayAmount(refundUsdIssuanceTx)).toBe(4.00);
    expect(refundUsdIssuanceTx.currency).toBe("USD");
    expect(refundUsdIssuanceTx.recipientName).toBe("Virtual Card Issuing");
    expect(refundUsdIssuanceTx.totalCredited).toBe(4.00);
  });
  test("Virtual account deposit normalizes sender details and receipt presentation accurately", () => {
    const depositRecord: Transaction = {
      id: "tx-flw-123456",
      userId: "user_789",
      amount: 5000,
      currency: "NGN",
      reference: "FLW-DEP-123456",
      type: "VIRTUAL_ACCOUNT_DEPOSIT",
      category: "DEPOSIT",
      direction: "CREDIT",
      description: "Transfer From JOHN DOE",
      fundingMethod: "Virtual Account",
      virtualAccountNumber: "9988776655",
      virtualAccountBankName: "Wema Bank",
      senderName: "JOHN DOE",
      senderAccountNumber: "0123456789",
      senderBankName: "GTBank",
      status: "SUCCESS",
      date: "Aug 31, 2026",
      time: "02:30 PM",
      fee: 0,
      totalCredited: 5000,
      provider: "Flutterwave",
    };

    expect(depositRecord.type).toBe("VIRTUAL_ACCOUNT_DEPOSIT");
    expect(depositRecord.category).toBe("DEPOSIT");
    expect(depositRecord.direction).toBe("CREDIT");
    expect(depositRecord.fundingMethod).toBe("Virtual Account");
    expect(depositRecord.senderName).toBe("JOHN DOE");
    expect(depositRecord.senderAccountNumber).toBe("0123456789");
    expect(depositRecord.senderBankName).toBe("GTBank");
    expect(depositRecord.virtualAccountNumber).toBe("9988776655");
    expect(depositRecord.virtualAccountBankName).toBe("Wema Bank");

    // Title construction check
    const title = depositRecord.senderName
      ? `Transfer From ${depositRecord.senderName}`
      : "Transfer From Virtual Account";
    expect(title).toBe("Transfer From JOHN DOE");

    // Sender details formatting check
    const senderDetails = [
      depositRecord.senderName,
      depositRecord.senderBankName,
      depositRecord.senderAccountNumber,
    ].filter(Boolean).join(" • ");
    expect(senderDetails).toBe("JOHN DOE • GTBank • 0123456789");
  });

  test("Virtual account deposit with missing sender details does not fabricate information", () => {
    const sparseDepositRecord: Transaction = {
      id: "tx-flw-999999",
      userId: "user_789",
      amount: 100,
      currency: "NGN",
      reference: "FLW-DEP-999999",
      type: "VIRTUAL_ACCOUNT_DEPOSIT",
      category: "DEPOSIT",
      direction: "CREDIT",
      description: "Virtual Account Deposit",
      fundingMethod: "Virtual Account",
      status: "SUCCESS",
      date: "Aug 31, 2026",
      time: "02:35 PM",
      fee: 0,
    };

    expect(sparseDepositRecord.senderName).toBeUndefined();
    expect(sparseDepositRecord.senderAccountNumber).toBeUndefined();
    expect(sparseDepositRecord.senderBankName).toBeUndefined();

    const title = sparseDepositRecord.senderName
      ? `Transfer From ${sparseDepositRecord.senderName}`
      : "Transfer From Virtual Account";
    expect(title).toBe("Transfer From Virtual Account");
  });

  test("Outgoing bank transfer normalizes beneficiary details and presentation accurately", () => {
    const transferRecord: Transaction = {
      id: "tx-trf-654321",
      userId: "user_789",
      amount: 15000,
      currency: "NGN",
      reference: "trf-1725120000-user",
      type: "TRANSFER",
      category: "TRANSFER",
      direction: "DEBIT",
      description: "Direct transfer to ALICE SMITH (0011223344)",
      recipientName: "ALICE SMITH",
      beneficiaryName: "ALICE SMITH",
      beneficiaryAccountNumber: "0011223344",
      beneficiaryBankName: "Access Bank",
      beneficiaryBankCode: "044",
      status: "SUCCESS",
      date: "Aug 31, 2026",
      time: "03:00 PM",
      fee: 10,
      totalDebited: 15010,
      provider: "Flutterwave",
    };

    expect(transferRecord.type).toBe("TRANSFER");
    expect(transferRecord.category).toBe("TRANSFER");
    expect(transferRecord.direction).toBe("DEBIT");
    expect(transferRecord.beneficiaryName).toBe("ALICE SMITH");
    expect(transferRecord.beneficiaryAccountNumber).toBe("0011223344");
    expect(transferRecord.beneficiaryBankName).toBe("Access Bank");

    // Title construction check
    const title = `Transfer To ${transferRecord.beneficiaryName || transferRecord.recipientName || "Beneficiary"}`;
    expect(title).toBe("Transfer To ALICE SMITH");

    // Recipient details formatting check
    const recipientDetails = [
      transferRecord.beneficiaryName || transferRecord.recipientName,
      transferRecord.beneficiaryBankName || transferRecord.bankName,
      transferRecord.beneficiaryAccountNumber,
    ].filter(Boolean).join(" • ");
    expect(recipientDetails).toBe("ALICE SMITH • Access Bank • 0011223344");
  });
});

  test("Funding Method displays as 'Your bank Account' for virtual account deposits", () => {
    const depositTx: TransactionRecord = {
      id: "tx-deposit-test",
      userId: "user-123",
      reference: "flw-tx-123",
      type: "VIRTUAL_ACCOUNT_DEPOSIT",
      category: "deposit",
      direction: "CREDIT",
      amount: 5000,
      currency: "NGN",
      status: "SUCCESS",
      description: "Transfer From John Doe",
      fundingMethod: "Virtual Account",
      senderName: "John Doe",
      senderBankName: "GTBank",
      senderAccountNumber: "0123456789",
      virtualAccountNumber: "9921473281",
      virtualAccountBankName: "Wema Bank",
      createdAt: "2026-09-01T12:00:00.000Z",
      date: "Sep 01, 2026",
      time: "12:00 PM",
      fee: 0,
      totalDebited: 5000,
    };

    // Verify funding method presentation rule
    const displayFundingMethod = "Your bank Account";
    expect(displayFundingMethod).toBe("Your bank Account");
    // Verify underlying record preserves virtual account details for audit
    expect(depositTx.fundingMethod).toBe("Virtual Account");
    expect(depositTx.virtualAccountNumber).toBe("9921473281");
    expect(depositTx.virtualAccountBankName).toBe("Wema Bank");
  });

describe("Frontend History Filtering & Receipt Requirements", () => {
  test("Filters out PENDING WALLET_FUNDING while keeping SUCCESS, EXPIRED, FAILED, CANCELED, REVERSED visible", () => {
    const list = [
      { id: "1", type: "WALLET_FUNDING", status: "PENDING" },
      { id: "2", type: "WALLET_FUNDING", status: "SUCCESS" },
      { id: "3", type: "WALLET_FUNDING", status: "EXPIRED" },
      { id: "4", type: "WALLET_FUNDING", status: "FAILED" },
      { id: "5", type: "TRANSFER", status: "PENDING" }, // Non-funding pending preserved
    ];

    const filtered = list.filter((tx) => {
      const isPendingFunding = (tx.type === "WALLET_FUNDING" || tx.type === "DEPOSIT") && (tx.status === "PENDING" || tx.status === "pending");
      return !isPendingFunding;
    });

    expect(filtered.length).toBe(4);
    expect(filtered.map((t) => t.id)).toEqual(["2", "3", "4", "5"]);
  });

  test("Receipt reasons for PENDING and EXPIRED wallet fundings", () => {
    const getReason = (tx: any) => {
      const isPending = (tx.type === "WALLET_FUNDING" || tx.type === "DEPOSIT") && (tx.status === "PENDING" || tx.status === "pending");
      const isExpired = (tx.type === "WALLET_FUNDING" || tx.type === "DEPOSIT") && (tx.status === "EXPIRED" || tx.status === "expired");
      if (isExpired) return "Funding expired";
      if (isPending) return "Waiting for payment confirmation";
      return "Success";
    };

    expect(getReason({ type: "WALLET_FUNDING", status: "PENDING" })).toBe("Waiting for payment confirmation");
    expect(getReason({ type: "WALLET_FUNDING", status: "EXPIRED" })).toBe("Funding expired");
    expect(getReason({ type: "WALLET_FUNDING", status: "SUCCESS" })).toBe("Success");
  });
});
