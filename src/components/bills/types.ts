export interface Biller {
  id: number;
  name: string;
  biller_code: string;
  logo: string;
}

export interface BillItem {
  id: number;
  biller_code: string;
  name: string;
  item_code: string;
  amount: number;
  is_fixed_amount: boolean;
}

export interface BillsReceipt {
  reference?: string;
  tx_ref?: string;
  amount?: number;
  pins?: Array<{ pin: string; serial?: string }>;
}

export type WalletType = "MAIN" | "BONUS";

export const BILLS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 Minutes Cache Expiration TTL

export function getBillsCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`vtu_cache_${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.timestamp || !parsed.data) return null;
    if (Date.now() - parsed.timestamp > BILLS_CACHE_TTL_MS) {
      sessionStorage.removeItem(`vtu_cache_${key}`);
      return null;
    }
    return parsed.data as T;
  } catch {
    return null;
  }
}

export function setBillsCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      `vtu_cache_${key}`,
      JSON.stringify({ timestamp: Date.now(), data })
    );
  } catch {
    // Ignore storage quota errors
  }
}

// Helper functions for Data Plan Parsing and Categorization
export function parseDataPlan(name: string) {
  const sizeMatch = name.match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i);
  const durationMatch = name.match(/\(([^)]+)\)/);

  const gbSize = sizeMatch ? sizeMatch[1] : "";
  const duration = durationMatch ? durationMatch[1] : "30 Days";

  let cleanedName = name;
  if (sizeMatch && gbSize) {
    cleanedName = name.replace(sizeMatch[0], "").replace(/\([^)]+\)/, "").trim();
  }
  cleanedName = cleanedName.replace(/^(MTN|GLO|Airtel|9mobile|Smile|Spectranet)\s+(Mobile\s+)?(Data\s+)?(Plan\s+)?/i, "");

  return {
    size: gbSize || "Data Plan",
    duration,
    displayName: cleanedName || "Standard Plan"
  };
}

export function getDataPlanCategory(plan: BillItem): string {
  const nameLower = plan.name.toLowerCase();

  if (nameLower.includes("weekend") || nameLower.includes("sat & sun") || nameLower.includes("[sun]")) {
    return "WEEKEND";
  }
  if (nameLower.includes("1 gb") || nameLower.includes("1gb") || nameLower.includes("1000 mb") || nameLower.includes("1000mb")) {
    return "1GB";
  }
  if (nameLower.includes("1 day") || nameLower.includes("2 day") || nameLower.includes("daily") || nameLower.includes("awoof") || nameLower.includes("awooof")) {
    return "DAILY";
  }
  if (nameLower.includes("7 days") || nameLower.includes("14 days") || nameLower.includes("weekly")) {
    return "WEEKLY";
  }
  return "MONTHLY";
}
