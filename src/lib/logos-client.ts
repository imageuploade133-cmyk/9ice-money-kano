"use client";

import { useState, useEffect } from "react";

export interface BankLogoItem {
  id?: string;
  code?: string;
  name: string;
  logoUrl?: string | null;
  logoBackupUrl?: string | null;
}

// In-memory cache across component mounts
let cachedBillLogos: Record<string, string> | null = null;
let cachedBankList: BankLogoItem[] | null = null;
let cachedStoreLogo: string | null = null;
let isFetching = false;
const listeners: Set<() => void> = new Set();

const notifyListeners = () => {
  listeners.forEach((listener) => listener());
};

export const fetchLogosConfig = async (forceRefresh = false): Promise<{
  billLogos: Record<string, string>;
  banks: BankLogoItem[];
  storeLogoUrl: string | null;
}> => {
  if (!forceRefresh && cachedBillLogos && cachedBankList && cachedStoreLogo !== null) {
    return { billLogos: cachedBillLogos, banks: cachedBankList, storeLogoUrl: cachedStoreLogo };
  }

  if (isFetching) {
    return { billLogos: cachedBillLogos || {}, banks: cachedBankList || [], storeLogoUrl: cachedStoreLogo };
  }

  isFetching = true;

  try {
    const [billsRes, banksRes, storeRes] = await Promise.allSettled([
      fetch("/api/bills/logos"),
      fetch("/api/banks"),
      fetch("/api/store"),
    ]);

    if (billsRes.status === "fulfilled" && billsRes.value.ok) {
      const billsData = await billsRes.value.json();
      if (billsData.success && billsData.logos) {
        cachedBillLogos = billsData.logos;
      }
    }

    if (banksRes.status === "fulfilled" && banksRes.value.ok) {
      const banksData = await banksRes.value.json();
      const rawList = Array.isArray(banksData)
        ? banksData
        : Array.isArray(banksData.banks)
        ? banksData.banks
        : Array.isArray(banksData.data)
        ? banksData.data
        : Array.isArray(banksData.data?.banks)
        ? banksData.data.banks
        : [];

      cachedBankList = rawList.map((item: any) => ({
        id: String(item.id || item.code || ""),
        code: item.code ? String(item.code) : undefined,
        name: String(item.name || ""),
        logoUrl: item.logoUrl || null,
        logoBackupUrl: item.logoBackupUrl || null,
      }));
    }

    if (storeRes.status === "fulfilled" && storeRes.value.ok) {
      const storeData = await storeRes.value.json();
      if (storeData.settings && storeData.settings.storeLogoUrl) {
        cachedStoreLogo = storeData.settings.storeLogoUrl;
      }
    }
  } catch (err) {
    console.warn("[logos-client] Error loading administrator logos:", err);
  } finally {
    if (!cachedBillLogos) cachedBillLogos = {};
    if (!cachedBankList) cachedBankList = [];
    isFetching = false;
    notifyListeners();
  }

  return { billLogos: cachedBillLogos, banks: cachedBankList, storeLogoUrl: cachedStoreLogo };
};

/**
 * Matches network or bill provider text against administrator-uploaded bill logos.
 */
export const matchBillerLogo = (text: string, billLogos?: Record<string, string> | null): string | null => {
  const logos = billLogos || cachedBillLogos;
  if (!text || !logos) return null;

  const t = text.toLowerCase().trim();

  // Primary network billers
  if (t.includes("mtn")) return logos["mtn"] || null;
  if (t.includes("airtel")) return logos["airtel"] || null;
  if (t.includes("glo")) return logos["glo"] || null;
  if (t.includes("9mobile") || t.includes("etisalat") || t.includes("9mob")) return logos["9mobile"] || null;

  // Electricitydiscos
  if (t.includes("kedco")) return logos["kedco"] || null;
  if (t.includes("ikedc")) return logos["ikedc"] || null;
  if (t.includes("ekedc")) return logos["ekedc"] || null;
  if (t.includes("aedc")) return logos["aedc"] || null;
  if (t.includes("phed")) return logos["phed"] || null;
  if (t.includes("jed")) return logos["jed"] || null;
  if (t.includes("eedc")) return logos["eedc"] || null;
  if (t.includes("ibedc")) return logos["ibedc"] || null;
  if (t.includes("kaedco")) return logos["kaedco"] || null;

  // Cable TV
  if (t.includes("dstv")) return logos["dstv"] || null;
  if (t.includes("gotv")) return logos["gotv"] || null;
  if (t.includes("startimes")) return logos["startimes"] || null;

  // Exam, Swaps, Store, Investment & Deposits
  if (t.includes("waec")) return logos["waec"] || null;
  if (t.includes("swap") || t.includes("exchange")) return logos["swap"] || null;
  if (t.includes("store")) return logos["store"] || null;
  if (t.includes("investment") || t.includes("fixed deposit")) return logos["investment"] || null;
  if (t.includes("deposit") || t.includes("funding") || t.includes("cashout") || t.includes("card_fund")) return logos["deposit"] || null;

  // General lookup across all administrator defined bill keys
  for (const [code, url] of Object.entries(logos)) {
    if (code !== "updatedAt" && url && t.includes(code.toLowerCase())) {
      return url;
    }
  }

  return null;
};

/**
 * Matches bank text against administrator-uploaded bank logos and local static fallbacks.
 */
export const matchBankLogo = (text: string, bankList?: BankLogoItem[] | null): string | null => {
  if (!text) return null;
  const t = text.toLowerCase().trim();
  const banks = bankList || cachedBankList || [];

  // Match bank by name or code from administrator database
  for (const bank of banks) {
    const bankNameLower = bank.name.toLowerCase();
    const bankCode = bank.code ? bank.code.toLowerCase() : "";

    if (
      (bankNameLower && t.includes(bankNameLower)) ||
      (bankCode && t.includes(bankCode))
    ) {
      if (bank.logoUrl) return bank.logoUrl;
      if (bank.logoBackupUrl) return bank.logoBackupUrl;
      if (bank.code) {
        const paddedCode = bank.code.padStart(3, "0");
        return `/bank-logos/${paddedCode}.png`;
      }
    }
  }

  // Known bank keyword static fallbacks
  if (t.includes("providus")) return "/bank-logos/101.png";
  if (t.includes("wema")) return "/bank-logos/035.png";
  if (t.includes("fcmb")) return "/bank-logos/214.png";
  if (t.includes("opay") || t.includes("owealth")) return "/bank-logos/999992.png";
  if (t.includes("access")) return "/bank-logos/044.png";
  if (t.includes("first bank") || t.includes("firstbank")) return "/bank-logos/011.png";

  return null;
};

/**
 * React hook to access administrator-uploaded bill, bank, and store logos with automatic background fetching.
 */
export const useLogos = () => {
  const [billLogos, setBillLogos] = useState<Record<string, string>>(cachedBillLogos || {});
  const [banks, setBanks] = useState<BankLogoItem[]>(cachedBankList || []);
  const [storeLogoUrl, setStoreLogoUrl] = useState<string | null>(cachedStoreLogo);

  useEffect(() => {
    const updateState = () => {
      if (cachedBillLogos) setBillLogos({ ...cachedBillLogos });
      if (cachedBankList) setBanks([...cachedBankList]);
      if (cachedStoreLogo !== null) setStoreLogoUrl(cachedStoreLogo);
    };

    listeners.add(updateState);

    if (!cachedBillLogos || !cachedBankList || cachedStoreLogo === null) {
      fetchLogosConfig();
    } else {
      updateState();
    }

    return () => {
      listeners.delete(updateState);
    };
  }, []);

  return {
    billLogos,
    banks,
    storeLogoUrl,
    getBillerLogo: (text: string) => matchBillerLogo(text, billLogos),
    getBankLogo: (text: string) => matchBankLogo(text, banks),
    getStoreLogo: () => storeLogoUrl,
  };
};
