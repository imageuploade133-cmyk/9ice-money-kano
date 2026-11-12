import { describe, it, expect } from "bun:test";
import {
  getTransactionLedgerStatus,
  isCreditTransaction,
  getTransactionDisplayAmount,
} from "@/lib/transaction-status-normalizer";
import {
  processPendingDocChanges,
  applyPendingTransactionsUpdate,
} from "@/lib/transaction-history-utils";

describe("Transaction History Real-Time Status Updates & Cache Consistency", () => {
  it("1. PENDING -> SUCCESS status transition maps correctly to Credited ledger status", () => {
    const pendingTx = {
      id: "tx-deposit-100",
      reference: "trf-fund-100",
      type: "WALLET_FUNDING",
      amount: 15000,
      currency: "NGN",
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };

    const initialLedgerStatus = getTransactionLedgerStatus(pendingTx);
    expect(initialLedgerStatus.code).toBe("PENDING");
    expect(initialLedgerStatus.label).toBe("Pending");

    const updatedSuccessTx = {
      ...pendingTx,
      status: "SUCCESS",
      totalCredited: 15000,
    };

    const updatedLedgerStatus = getTransactionLedgerStatus(updatedSuccessTx);
    expect(updatedLedgerStatus.code).toBe("CREDITED");
    expect(updatedLedgerStatus.label).toBe("Credited");
    expect(isCreditTransaction(updatedSuccessTx)).toBe(true);
    expect(getTransactionDisplayAmount(updatedSuccessTx)).toBe(15000);
  });

  it("2. PENDING -> FAILED status transition maps correctly to Failed ledger status", () => {
    const pendingTx = {
      id: "tx-deposit-200",
      reference: "trf-fund-200",
      type: "WALLET_FUNDING",
      amount: 25000,
      currency: "NGN",
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };

    expect(getTransactionLedgerStatus(pendingTx).code).toBe("PENDING");

    const updatedFailedTx = {
      ...pendingTx,
      status: "FAILED",
    };

    const failedLedgerStatus = getTransactionLedgerStatus(updatedFailedTx);
    expect(failedLedgerStatus.code).toBe("FAILED");
    expect(failedLedgerStatus.label).toBe("Failed");
    expect(isCreditTransaction(updatedFailedTx)).toBe(false);
  });

  it("3. Deduplication map merges snapshot updates into history array without duplicate entries", () => {
    const existingHistory = [
      { id: "tx-1", reference: "ref-1", status: "PENDING", createdAt: "2026-10-12T10:00:00Z" },
      { id: "tx-2", reference: "ref-2", status: "SUCCESS", createdAt: "2026-10-12T09:00:00Z" },
    ];

    const snapshotUpdate = [
      { id: "tx-1", reference: "ref-1", status: "SUCCESS", createdAt: "2026-10-12T10:00:00Z" },
    ];

    const txMap = new Map<string, any>();
    snapshotUpdate.forEach((tx) => txMap.set(tx.id, tx));
    existingHistory.forEach((tx) => {
      if (!txMap.has(tx.id)) {
        txMap.set(tx.id, tx);
      }
    });

    const mergedList = Array.from(txMap.values());
    expect(mergedList.length).toBe(2);
    expect(mergedList.find((t) => t.id === "tx-1")?.status).toBe("SUCCESS");
  });

  it("4. Target pending listener updates older pagination page items (index > 15) on PENDING -> SUCCESS", async () => {
    const page1And2History: any[] = Array.from({ length: 20 }, (_, i) => ({
      id: `tx-page-${i + 1}`,
      reference: `ref-page-${i + 1}`,
      type: "DEPOSIT",
      amount: 20000,
      currency: "NGN",
      status: i === 18 ? "PENDING" : "SUCCESS",
      createdAt: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
    }));

    const docChanges = [
      {
        type: "removed",
        doc: {
          id: "tx-page-19",
          reference: "ref-page-19",
          type: "DEPOSIT",
          amount: 20000,
          currency: "NGN",
          status: "SUCCESS",
          totalCredited: 20000,
          createdAt: new Date(Date.now() - 19 * 3600000).toISOString(),
        },
      },
    ];

    const { updatedPendingMap, removedDocIds, removedTxMap } =
      await processPendingDocChanges([], docChanges, async () => ({
        exists: () => false,
        data: () => ({}),
      }));

    const { hasChange, updatedList } = applyPendingTransactionsUpdate(
      page1And2History,
      updatedPendingMap,
      removedDocIds,
      removedTxMap
    );

    expect(hasChange).toBe(true);
    expect(updatedList.length).toBe(20);
    expect(updatedList[18].id).toBe("tx-page-19");
    expect(updatedList[18].status).toBe("SUCCESS");
    expect(getTransactionLedgerStatus(updatedList[18]).code).toBe("CREDITED");
  });

  it("4b. Target pending listener updates older pagination page items on PENDING -> FAILED transition", async () => {
    const page1And2History: any[] = Array.from({ length: 20 }, (_, i) => ({
      id: `tx-page-${i + 1}`,
      reference: `ref-page-${i + 1}`,
      type: "DEPOSIT",
      amount: 15000,
      currency: "NGN",
      status: i === 18 ? "PENDING" : "SUCCESS",
      createdAt: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
    }));

    const docChanges = [
      {
        type: "removed",
        doc: {
          id: "tx-page-19",
          reference: "ref-page-19",
          type: "DEPOSIT",
          amount: 15000,
          currency: "NGN",
          status: "FAILED",
          createdAt: new Date(Date.now() - 19 * 3600000).toISOString(),
        },
      },
    ];

    const { updatedPendingMap, removedDocIds, removedTxMap } =
      await processPendingDocChanges([], docChanges, async () => ({
        exists: () => false,
        data: () => ({}),
      }));

    const { hasChange, updatedList } = applyPendingTransactionsUpdate(
      page1And2History,
      updatedPendingMap,
      removedDocIds,
      removedTxMap
    );

    expect(hasChange).toBe(true);
    expect(updatedList.length).toBe(20);
    expect(updatedList[18].id).toBe("tx-page-19");
    expect(updatedList[18].status).toBe("FAILED");
    expect(getTransactionLedgerStatus(updatedList[18]).code).toBe("FAILED");
  });

  it("4c. Realistic Firestore scenario: removed snapshot contains old PENDING status, getDoc fetches latest SUCCESS/FAILED", async () => {
    const page1And2History: any[] = Array.from({ length: 20 }, (_, i) => ({
      id: `tx-page-${i + 1}`,
      reference: `ref-page-${i + 1}`,
      type: "DEPOSIT",
      amount: 50000,
      currency: "NGN",
      status: i === 18 ? "PENDING" : "SUCCESS",
      createdAt: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
    }));

    let selectedTx: any = { ...page1And2History[18] };

    const docChanges = [
      {
        type: "removed",
        doc: {
          id: "tx-page-19",
          reference: "ref-page-19",
          type: "DEPOSIT",
          amount: 50000,
          currency: "NGN",
          status: "PENDING",
          createdAt: new Date(Date.now() - 19 * 3600000).toISOString(),
          ref: "transactions/tx-page-19",
        },
      },
    ];

    const mockGetDocResolver = async (ref: string) => {
      if (ref === "transactions/tx-page-19") {
        return {
          exists: () => true,
          data: () => ({
            id: "tx-page-19",
            reference: "ref-page-19",
            type: "DEPOSIT",
            amount: 50000,
            currency: "NGN",
            status: "SUCCESS",
            totalCredited: 50000,
            createdAt: new Date(Date.now() - 19 * 3600000).toISOString(),
          }),
        };
      }
      return { exists: () => false, data: () => ({}) };
    };

    const { updatedPendingMap, removedDocIds, removedTxMap } =
      await processPendingDocChanges([], docChanges, mockGetDocResolver);

    const { hasChange, updatedList } = applyPendingTransactionsUpdate(
      page1And2History,
      updatedPendingMap,
      removedDocIds,
      removedTxMap
    );

    if (hasChange) {
      const matchInUpdated = updatedList.find(
        (t) => t.id === selectedTx.id || t.reference === selectedTx.reference
      );
      if (matchInUpdated) selectedTx = matchInUpdated;
    }

    const newMonthlyCreditTotal = updatedList.reduce((acc, tx) => {
      const isSuccess = (tx.status || "").toUpperCase() === "SUCCESS";
      return isSuccess && isCreditTransaction(tx) ? acc + getTransactionDisplayAmount(tx) : acc;
    }, 0);

    expect(hasChange).toBe(true);
    expect(updatedList.length).toBe(20);
    expect(updatedList[18].status).toBe("SUCCESS");
    expect(selectedTx.status).toBe("SUCCESS");
    expect(getTransactionLedgerStatus(selectedTx).code).toBe("CREDITED");
    expect(newMonthlyCreditTotal).toBe(20 * 50000);
  });

  it("4d. Safely ignores deleted documents and documents that remain pending without corrupting status or triggering unnecessary monthly total updates", async () => {
    const history: any[] = [
      { id: "tx-deleted", reference: "ref-deleted", status: "PENDING", amount: 10000, type: "DEPOSIT" },
      { id: "tx-still-pending", reference: "ref-still-pending", status: "PENDING", amount: 20000, type: "DEPOSIT" },
    ];

    const docChanges = [
      {
        type: "removed",
        doc: { id: "tx-deleted", reference: "ref-deleted", status: "PENDING", ref: "transactions/tx-deleted" },
      },
      {
        type: "removed",
        doc: { id: "tx-still-pending", reference: "ref-still-pending", status: "PENDING", ref: "transactions/tx-still-pending" },
      },
    ];

    const mockGetDocResolver = async (ref: string) => {
      if (ref === "transactions/tx-still-pending") {
        return {
          exists: () => true,
          data: () => ({ id: "tx-still-pending", reference: "ref-still-pending", status: "PENDING", amount: 20000, type: "DEPOSIT" }),
        };
      }
      return { exists: () => false, data: () => ({}) };
    };

    const { updatedPendingMap, removedDocIds, removedTxMap } =
      await processPendingDocChanges([], docChanges, mockGetDocResolver);

    const { hasChange, updatedList } = applyPendingTransactionsUpdate(
      history,
      updatedPendingMap,
      removedDocIds,
      removedTxMap
    );

    expect(hasChange).toBe(false);
    expect(updatedList[0].status).toBe("PENDING");
    expect(updatedList[1].status).toBe("PENDING");
    expect(updatedList.length).toBe(2);
  });

  it("5. Monthly wallet credit total recalculates correctly when a pending deposit transitions to SUCCESS", () => {
    const now = new Date();
    const startOfMonthIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const transactions = [
      { id: "tx-1", type: "WALLET_FUNDING", amount: 10000, status: "SUCCESS", createdAt: startOfMonthIso },
      { id: "tx-2", type: "WALLET_FUNDING", amount: 5000, status: "PENDING", createdAt: startOfMonthIso },
    ];

    const calculateMonthlyTotal = (txList: typeof transactions) => {
      let sum = 0;
      txList.forEach((tx) => {
        const isSuccess = (tx.status || "").toUpperCase() === "SUCCESS";
        if (isSuccess && isCreditTransaction(tx)) {
          sum += getTransactionDisplayAmount(tx);
        }
      });
      return sum;
    };

    expect(calculateMonthlyTotal(transactions)).toBe(10000);

    transactions[1].status = "SUCCESS";
    expect(calculateMonthlyTotal(transactions)).toBe(15000);
  });

  it("6. Session cache serialization format preserves updated transactions", () => {
    const list = [
      { id: "tx-3", reference: "ref-3", status: "SUCCESS", amount: 50000, totalCredited: 50000 },
    ];

    const cachePayload = JSON.stringify({
      data: list,
      hasMore: false,
      timestamp: Date.now(),
    });

    const deserialized = JSON.parse(cachePayload);
    expect(deserialized.data.length).toBe(1);
    expect(deserialized.data[0].status).toBe("SUCCESS");
    expect(deserialized.data[0].amount).toBe(50000);
  });
});
