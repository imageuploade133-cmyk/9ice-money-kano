import { adminDb } from "@/lib/firebase-admin";
import { safeParseJson } from "@/lib/utils";
import { getGatewayUrl } from "@/lib/gateway-util";

const getBanksApiUrl = () => `${getGatewayUrl()}/api/flutterwave/banks`;

export interface BankDoc {
  id: string;
  name: string;
  code: string;
  country: string;
  type: string;
  is_active: boolean;
  createdAt: string;
  updatedAt: string;
  logoUrl?: string | null;
  isTop?: boolean;
}

// In-memory cache for fast subsequent lookups
let cachedBanksList: BankDoc[] | null = null;

export class BankService {
  /**
   * Clears the in-memory cache of banks.
   */
  static clearCache() {
    cachedBanksList = null;
    console.log("[BankService] In-memory banks cache cleared.");
  }

  /**
   * Retrieves all banks from memory cache if available, or Firestore if not.
   * Sorts banks alphabetically by name.
   * If Firestore is completely empty, it automatically triggers startup sync.
   */
  static async getBanks(searchQuery?: string): Promise<BankDoc[]> {
    if (cachedBanksList && cachedBanksList.length > 0) {
      console.log(`[BankService] Serving ${cachedBanksList.length} banks from in-memory cache.`);
      return this.filterAndSort(cachedBanksList, searchQuery);
    }

    console.log("[BankService] Cache miss. Fetching banks from Firestore...");
    const banksSnap = await adminDb.collection("banks").get();

    if (banksSnap.empty) {
      console.log("[BankService] Firestore 'banks' collection is empty. Performing startup sync...");
      await this.syncBanks();
      // Re-fetch after sync
      const freshSnap = await adminDb.collection("banks").get();
      const banks: BankDoc[] = [];
      freshSnap.forEach((doc) => {
        banks.push(doc.data() as BankDoc);
      });
      cachedBanksList = banks;
      return this.filterAndSort(banks, searchQuery);
    }

    const banks: BankDoc[] = [];
    banksSnap.forEach((doc) => {
      banks.push(doc.data() as BankDoc);
    });

    cachedBanksList = banks;
    console.log(`[BankService] Loaded ${banks.length} banks from Firestore and cached in memory.`);
    return this.filterAndSort(banks, searchQuery);
  }

  /**
   * Retrieves a single bank from memory cache or Firestore by its ID.
   * If the cache is empty, uses getBanks() to automatically trigger a self-healing sync.
   * Supports robust fallback searches by both ID and Code.
   */
  static async getBankById(bankId: string): Promise<BankDoc | null> {
    if (!bankId) return null;

    // Ensure banks cache is fully initialized/synced before looking up
    const banks = await this.getBanks();

    // Look up by exact ID or by Code
    const match = banks.find((b) => b.id === bankId || b.code === bankId);
    if (match) return match;

    // Fallback to direct Firestore lookup as last resort
    const bankDoc = await adminDb.collection("banks").doc(bankId).get();
    if (bankDoc.exists) {
      const data = bankDoc.data() as BankDoc;
      return data;
    }

    return null;
  }

  /**
   * Fetches latest bank codes from Flutterwave and syncs them to Firestore 'banks' collection.
   * Uses batched writes for performance and robustness.
   */
  static async syncBanks(idToken?: string): Promise<{ success: boolean; count: number }> {
    console.log("[BankService] Initiating banks sync with VM Payment Gateway...");

    // Call VM Payment Gateway API with 15s timeout & retries
    let response;
    const retries = 2;
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        response = await fetch(getBanksApiUrl(), {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${idToken || ""}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.ok) break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === retries + 1) {
          console.error(`[BankService Sync Error] API fetch failed after ${attempt} attempts:`, msg);
          throw err;
        }
        await new Promise((res) => setTimeout(res, attempt * 1000));
      }
    }

    if (!response || !response.ok) {
      const errText = response ? await response.text() : "No response";
      console.error(`[BankService Sync Error] Flutterwave returned non-OK status: ${response?.status}. ${errText}`);
      throw new Error(`Flutterwave API bank sync failed: ${errText}`);
    }

    const resData = await safeParseJson(response);
    if (resData.status !== "success" || !Array.isArray(resData.data)) {
      console.error("[BankService Sync Error] Unexpected payload structure:", resData);
      throw new Error("Failed to sync banks: Unexpected Flutterwave API response payload.");
    }

    const rawBanks = resData.data;
    console.log(`[BankService] Retrieved ${rawBanks.length} banks from Flutterwave. Saving to Firestore...`);

    const nowStr = new Date().toISOString();
    const batchSize = 200;
    let batch = adminDb.batch();
    let currentCount = 0;
    let totalSaved = 0;

    for (const bank of rawBanks) {
      if (!bank.code) continue; // Skip banks with invalid codes

      const bankId = bank.id?.toString() || bank.code;
      const bankRef = adminDb.collection("banks").doc(bankId);

      const bankData: Record<string, any> = {
        id: bankId,
        name: bank.name || "Unknown Bank",
        code: bank.code.trim(),
        country: bank.country || "NG",
        type: bank.type || "NG",
        is_active: bank.is_active !== undefined ? !!bank.is_active : true,
        createdAt: bank.createdAt || nowStr,
        updatedAt: nowStr,
      };

      if (bank.logoUrl) {
        bankData.logoUrl = bank.logoUrl;
      }

      batch.set(bankRef, bankData, { merge: true });
      currentCount++;
      totalSaved++;

      if (currentCount >= batchSize) {
        await batch.commit();
        console.log(`[BankService] Committed batch of ${currentCount} banks.`);
        batch = adminDb.batch();
        currentCount = 0;
      }
    }

    if (currentCount > 0) {
      await batch.commit();
      console.log(`[BankService] Committed final batch of ${currentCount} banks.`);
    }

    console.log(`[BankService] Successfully synced and saved ${totalSaved} banks to Firestore.`);

    // Automatically refresh/clear the memory cache to reflect synced data
    this.clearCache();

    return { success: true, count: totalSaved };
  }

  /**
   * Internal helper to filter and alphabetically sort the bank list.
   */
  private static filterAndSort(banks: BankDoc[], searchQuery?: string): BankDoc[] {
    let list = [...banks];

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      // Remove leading zeros for flexible bank code matching (e.g. "058" matching "58" or "058")
      const strippedQ = q.replace(/^0+/, "");

      list = list.filter((b) => {
        const nameMatch = b.name.toLowerCase().includes(q);
        const codeMatch = b.code.toLowerCase().includes(q) || (strippedQ.length > 0 && b.code.toLowerCase().includes(strippedQ));
        const idMatch = b.id.toLowerCase().includes(q);
        return nameMatch || codeMatch || idMatch;
      });
    }

    // Sort: Pinned/Top banks first (alphabetically among themselves), then remaining banks alphabetically by name
    return list.sort((a, b) => {
      const aTop = !!a.isTop;
      const bTop = !!b.isTop;
      if (aTop && !bTop) return -1;
      if (!aTop && bTop) return 1;
      return a.name.localeCompare(b.name);
    });
  }
}
