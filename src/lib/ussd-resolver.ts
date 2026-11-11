/**
 * Centralized Nigerian Bank USSD Dial Code Resolver Utility
 * Maps bank codes and bank names to real Nigerian USSD dial prefixes.
 */

export interface BankUssdMapping {
  prefix: string;
  names: string[];
}

const BANK_USSD_MAP: Record<string, BankUssdMapping> = {
  // GTBank
  "058": { prefix: "*737*1*2*", names: ["gtbank", "gtb", "guaranty trust"] },
  "58": { prefix: "*737*1*2*", names: ["gtbank", "gtb", "guaranty trust"] },

  // Access Bank
  "044": { prefix: "*901*1*2*", names: ["access", "access bank"] },
  "44": { prefix: "*901*1*2*", names: ["access", "access bank"] },

  // Zenith Bank
  "057": { prefix: "*966*2*", names: ["zenith", "zenith bank"] },
  "57": { prefix: "*966*2*", names: ["zenith", "zenith bank"] },

  // First Bank of Nigeria
  "011": { prefix: "*894*1*1*", names: ["first bank", "firstbank", "fbn"] },
  "11": { prefix: "*894*1*1*", names: ["first bank", "firstbank", "fbn"] },

  // UBA
  "033": { prefix: "*919*3*2*", names: ["uba", "united bank for africa"] },
  "33": { prefix: "*919*3*2*", names: ["uba", "united bank for africa"] },

  // Wema Bank / ALAT
  "035": { prefix: "*945*1*", names: ["wema", "alat"] },
  "35": { prefix: "*945*1*", names: ["wema", "alat"] },

  // FCMB
  "214": { prefix: "*329*2*", names: ["fcmb", "first city monument"] },

  // Fidelity Bank
  "070": { prefix: "*770*2*", names: ["fidelity", "fidelity bank"] },
  "70": { prefix: "*770*2*", names: ["fidelity", "fidelity bank"] },

  // Stanbic IBTC
  "221": { prefix: "*909*1*2*", names: ["stanbic", "stanbic ibtc"] },

  // Sterling Bank
  "232": { prefix: "*822*2*", names: ["sterling", "sterling bank"] },

  // Union Bank
  "032": { prefix: "*826*2*", names: ["union", "union bank"] },
  "32": { prefix: "*826*2*", names: ["union", "union bank"] },

  // Ecobank
  "050": { prefix: "*326*2*", names: ["ecobank", "eco bank"] },
  "50": { prefix: "*326*2*", names: ["ecobank", "eco bank"] },

  // Polaris Bank
  "076": { prefix: "*833*2*", names: ["polaris", "polaris bank", "skye"] },
  "76": { prefix: "*833*2*", names: ["polaris", "polaris bank", "skye"] },

  // Keystone Bank
  "082": { prefix: "*7111*2*", names: ["keystone", "keystone bank"] },
  "82": { prefix: "*7111*2*", names: ["keystone", "keystone bank"] },

  // Heritage Bank
  "030": { prefix: "*745*2*", names: ["heritage", "heritage bank"] },
  "30": { prefix: "*745*2*", names: ["heritage", "heritage bank"] },

  // Unity Bank
  "215": { prefix: "*7799*2*", names: ["unity", "unity bank"] },

  // Jaiz Bank
  "301": { prefix: "*773*2*", names: ["jaiz", "jaiz bank"] },

  // Taj Bank
  "302": { prefix: "*898*2*", names: ["taj", "taj bank"] },

  // Globus Bank
  "103": { prefix: "*989*2*", names: ["globus", "globus bank"] },

  // Moniepoint
  "50515": { prefix: "*5573*1*", names: ["moniepoint", "monie point"] },

  // OPay
  "999992": { prefix: "*955*2*", names: ["opay", "paycom"] },
  "50457": { prefix: "*955*2*", names: ["opay", "paycom"] },

  // Kuda Bank
  "50211": { prefix: "*5573*1*", names: ["kuda", "kuda bank"] },

  // VFD Microfinance / VBank
  "566": { prefix: "*5037*1*", names: ["vfd", "vbank"] },

  // PalmPay
  "999991": { prefix: "*861*1*", names: ["palmpay", "palm pay"] },
  "100033": { prefix: "*861*1*", names: ["palmpay", "palm pay"] },

  // Providus Bank
  "101": { prefix: "*540*1*", names: ["providus", "providus bank"] },

  // Titan Trust Bank
  "102": { prefix: "*922*1*", names: ["titan", "titan trust"] },

  // PremiumTrust Bank
  "105": { prefix: "*349*1*", names: ["premiumtrust", "premium trust"] },

  // Parallex Bank
  "526": { prefix: "*322*1*", names: ["parallex", "parallex bank"] },

  // SunTrust Bank
  "100": { prefix: "*5230*1*", names: ["suntrust", "sun trust"] },

  // Rubies Bank
  "125": { prefix: "*7797*1*", names: ["rubies", "rubies bank"] },
};

/**
 * Extracts a clean USSD code (e.g. "*737*50*000*123#") from any gateway instruction string.
 */
export function extractCleanUssdCode(rawText: string): string | null {
  if (!rawText || typeof rawText !== "string") return null;
  const match = rawText.match(/\*[\d\*]+#/);
  return match ? match[0] : null;
}

/**
 * Resolves the real USSD dial code prefix for a given bank code or bank name.
 */
export function getUssdPrefixForBank(bankCode?: string, bankName?: string): string {
  const cleanCode = (bankCode || "").trim();
  const paddedCode = cleanCode.length === 1 || cleanCode.length === 2 ? cleanCode.padStart(3, "0") : cleanCode;

  if (cleanCode && BANK_USSD_MAP[cleanCode]) {
    return BANK_USSD_MAP[cleanCode].prefix;
  }

  if (paddedCode && BANK_USSD_MAP[paddedCode]) {
    return BANK_USSD_MAP[paddedCode].prefix;
  }

  if (bankName) {
    const lowerName = bankName.toLowerCase().trim();
    for (const entry of Object.values(BANK_USSD_MAP)) {
      if (entry.names.some((n) => lowerName.includes(n))) {
        return entry.prefix;
      }
    }
  }

  // Generic fallback if unknown bank
  return "*955*2*";
}

/**
 * Resolves or constructs the final USSD dial code for checkout.
 */
export function resolveUssdCode(
  bankCode: string | undefined,
  bankName: string | undefined,
  amount: number,
  gatewayNote?: string | null
): string {
  if (gatewayNote) {
    const cleanMatch = extractCleanUssdCode(gatewayNote);
    if (cleanMatch) {
      return cleanMatch;
    }
  }

  const prefix = getUssdPrefixForBank(bankCode, bankName);
  const payAmount = Math.max(1, Math.round(Number(amount) || 0));
  return `${prefix}${payAmount}#`;
}
