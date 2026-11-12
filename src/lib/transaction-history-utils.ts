import { Transaction } from "@/components/wallet/TransactionReceipt";
import { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

export const parseTransactionDoc = (
  docSnap: QueryDocumentSnapshot<DocumentData> | DocumentData
): Transaction => {
  const data = typeof docSnap.data === "function" ? docSnap.data() : docSnap;
  const id = docSnap.id || data.id || data.reference;
  return {
    ...data,
    id,
    reference: data.reference || id,
    type: data.type || "DEPOSIT",
    amount: Number(data.amount) || 0,
    currency: data.currency || "NGN",
    description: data.description || "",
    recipientName: data.recipientName || "",
    bankName: data.bankName || "",
    status: data.status || "PENDING",
    date: data.date || "",
    time: data.time || "",
    fee: Number(data.fee) || 0,
    vat: Number(data.vat) || 0,
    markup: Number(data.markup) || 0,
    totalDebited:
      data.totalDebited !== undefined && data.totalDebited !== null
        ? Number(data.totalDebited)
        : undefined,
    totalCredited:
      data.totalCredited !== undefined && data.totalCredited !== null
        ? Number(data.totalCredited)
        : undefined,
  };
};

export interface PendingDocChange {
  type: string;
  doc: {
    id: string;
    reference?: string;
    status?: string;
    ref?: any;
    data?: () => DocumentData;
  };
}

export const processPendingDocChanges = async (
  pendingDocs: Array<QueryDocumentSnapshot<DocumentData> | DocumentData>,
  docChanges: PendingDocChange[],
  getDocFn: (ref: any) => Promise<{ exists: () => boolean; data: () => DocumentData }>
) => {
  const updatedPendingMap = new Map<string, Transaction>();

  pendingDocs.forEach((docSnap) => {
    const tx = parseTransactionDoc(docSnap);
    updatedPendingMap.set(tx.id, tx);
    if (tx.reference) updatedPendingMap.set(tx.reference, tx);
  });

  const removedDocIds = new Set<string>();
  const removedTxMap = new Map<string, Transaction>();

  const pendingRemovals = docChanges.filter((change) => change.type === "removed");

  await Promise.all(
    pendingRemovals.map(async (change) => {
      const removedTx = parseTransactionDoc(change.doc);
      removedDocIds.add(removedTx.id);
      if (removedTx.reference) removedDocIds.add(removedTx.reference);

      const statusUpper = (removedTx.status || "").toUpperCase();
      const isStillPending = statusUpper === "PENDING" || statusUpper === "PROCESSING";

      if (!isStillPending) {
        removedTxMap.set(removedTx.id, removedTx);
        if (removedTx.reference) removedTxMap.set(removedTx.reference, removedTx);
      } else if (change.doc.ref) {
        try {
          const freshSnap = await getDocFn(change.doc.ref);
          if (freshSnap.exists()) {
            const freshTx = parseTransactionDoc(freshSnap);
            const freshStatusUpper = (freshTx.status || "").toUpperCase();
            if (freshStatusUpper !== "PENDING" && freshStatusUpper !== "PROCESSING") {
              removedTxMap.set(freshTx.id, freshTx);
              if (freshTx.reference) removedTxMap.set(freshTx.reference, freshTx);
            }
          }
        } catch (e) {
          console.warn("[Pending Listener removed getDoc Warning]:", e);
        }
      }
    })
  );

  return { updatedPendingMap, removedDocIds, removedTxMap };
};

export const applyPendingTransactionsUpdate = (
  prevHistory: Transaction[],
  updatedPendingMap: Map<string, Transaction>,
  removedDocIds: Set<string>,
  removedTxMap: Map<string, Transaction>
): { hasChange: boolean; updatedList: Transaction[] } => {
  if (prevHistory.length === 0) {
    return { hasChange: false, updatedList: prevHistory };
  }

  let hasChange = false;

  const updatedList = prevHistory.map((tx) => {
    const statusUpper = (tx.status || "").toUpperCase();
    const isTxPending = statusUpper === "PENDING" || statusUpper === "PROCESSING";

    if (isTxPending && (removedDocIds.has(tx.id) || (tx.reference && removedDocIds.has(tx.reference)))) {
      const transitionMatch = removedTxMap.get(tx.id) || (tx.reference ? removedTxMap.get(tx.reference) : undefined);
      if (transitionMatch) {
        const matchStatusUpper = (transitionMatch.status || "").toUpperCase();
        if (matchStatusUpper !== statusUpper || transitionMatch.totalCredited !== tx.totalCredited) {
          hasChange = true;
          return {
            ...tx,
            ...transitionMatch,
          };
        }
      }
    }

    if (isTxPending) {
      const match = updatedPendingMap.get(tx.id) || (tx.reference ? updatedPendingMap.get(tx.reference) : undefined);
      if (
        match &&
        (match.status !== tx.status ||
          match.totalCredited !== tx.totalCredited ||
          match.totalDebited !== tx.totalDebited ||
          match.amount !== tx.amount)
      ) {
        hasChange = true;
        return {
          ...tx,
          ...match,
        };
      }
    }

    return tx;
  });

  return { hasChange, updatedList };
};
