import { adminDb } from "./firebase-admin";

export const DEFAULT_GLOBAL_MIN_TRANSFER = 100; // 100 NGN default

/**
 * Reads the authoritative global minimum transfer amount configured by CPanel Administrators from Firestore.
 * Fallback to DEFAULT_GLOBAL_MIN_TRANSFER (100 NGN) if config document does not exist or database is offline.
 */
export async function getGlobalMinTransferAmount(): Promise<number> {
  try {
    const limitsDoc = await adminDb.collection("config").doc("limits").get();
    if (limitsDoc.exists) {
      const data = limitsDoc.data();
      const val = Number(data?.globalMinTransferAmount ?? data?.minTransferAmount);
      if (!isNaN(val) && val >= 0) {
        return val;
      }
    }

    // Fallback check in config/app
    const appDoc = await adminDb.collection("config").doc("app").get();
    if (appDoc.exists) {
      const data = appDoc.data();
      const val = Number(data?.globalMinTransferAmount ?? data?.minTransferAmount);
      if (!isNaN(val) && val >= 0) {
        return val;
      }
    }
  } catch (err: any) {
    console.warn("[Global Limits Util Warning] Failed to read globalMinTransferAmount from Firestore:", err.message);
  }

  return DEFAULT_GLOBAL_MIN_TRANSFER;
}
