import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import {
  DEFAULT_CURRENCY_VISIBILITY,
  DEFAULT_FULL_EXCHANGE_RATES_CONFIG,
  FullExchangeRatesConfig,
  NON_NGN_CURRENCIES,
  parsePositiveNumber,
} from "@/lib/exchange-pricing";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "exchange_rates.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    let config: FullExchangeRatesConfig = { ...DEFAULT_FULL_EXCHANGE_RATES_CONFIG };

    try {
      const docSnap = await adminDb.collection("config").doc("exchange_rates").get();
      if (docSnap.exists) {
        const stored = docSnap.data();
        if (stored) {
          const loadedVisibility: Record<string, boolean> = { ...DEFAULT_CURRENCY_VISIBILITY };
          if (stored.currencyVisibility && typeof stored.currencyVisibility === "object") {
            for (const key of Object.keys(stored.currencyVisibility)) {
              loadedVisibility[key.toUpperCase()] = Boolean(stored.currencyVisibility[key]);
            }
          }
          loadedVisibility.NGN = true; // NGN is strictly non-hideable

          config = {
            ...DEFAULT_FULL_EXCHANGE_RATES_CONFIG,
            useFlutterwaveRate: stored.useFlutterwaveRate !== undefined ? Boolean(stored.useFlutterwaveRate) : true,
            useLiveWorldDollarRate: Boolean(stored.useLiveWorldDollarRate),
            manualDollarRate: parsePositiveNumber(stored.manualDollarRate, 1550),
            dollarCommissionFee: parsePositiveNumber(stored.dollarCommissionFee, 180),

            usdSellMarkup: parsePositiveNumber(stored.usdSellMarkup, 180),
            usdBuyMarkup: parsePositiveNumber(stored.usdBuyMarkup, 100),
            eurSellMarkup: parsePositiveNumber(stored.eurSellMarkup, 200),
            eurBuyMarkup: parsePositiveNumber(stored.eurBuyMarkup, 110),
            gbpSellMarkup: parsePositiveNumber(stored.gbpSellMarkup, 220),
            gbpBuyMarkup: parsePositiveNumber(stored.gbpBuyMarkup, 120),
            ghsSellMarkup: parsePositiveNumber(stored.ghsSellMarkup, 10),
            ghsBuyMarkup: parsePositiveNumber(stored.ghsBuyMarkup, 5),
            kesSellMarkup: parsePositiveNumber(stored.kesSellMarkup, 1),
            kesBuyMarkup: parsePositiveNumber(stored.kesBuyMarkup, 0.5),
            xofSellMarkup: parsePositiveNumber(stored.xofSellMarkup, 0.1),
            xofBuyMarkup: parsePositiveNumber(stored.xofBuyMarkup, 0.1),
            xafSellMarkup: parsePositiveNumber(stored.xafSellMarkup, 0.1),
            xafBuyMarkup: parsePositiveNumber(stored.xafBuyMarkup, 0.1),
            cadSellMarkup: parsePositiveNumber(stored.cadSellMarkup, 100),
            cadBuyMarkup: parsePositiveNumber(stored.cadBuyMarkup, 50),
            zarSellMarkup: parsePositiveNumber(stored.zarSellMarkup, 10),
            zarBuyMarkup: parsePositiveNumber(stored.zarBuyMarkup, 5),
            tzsSellMarkup: parsePositiveNumber(stored.tzsSellMarkup, 0.1),
            tzsBuyMarkup: parsePositiveNumber(stored.tzsBuyMarkup, 0.05),
            ugxSellMarkup: parsePositiveNumber(stored.ugxSellMarkup, 0.1),
            ugxBuyMarkup: parsePositiveNumber(stored.ugxBuyMarkup, 0.05),
            rwfSellMarkup: parsePositiveNumber(stored.rwfSellMarkup, 0.2),
            rwfBuyMarkup: parsePositiveNumber(stored.rwfBuyMarkup, 0.1),
            zmwSellMarkup: parsePositiveNumber(stored.zmwSellMarkup, 5),
            zmwBuyMarkup: parsePositiveNumber(stored.zmwBuyMarkup, 2.5),

            useFlutterwaveXofRate: stored.useFlutterwaveXofRate !== undefined ? Boolean(stored.useFlutterwaveXofRate) : true,
            useLiveWorldXofRate: Boolean(stored.useLiveWorldXofRate),
            manualXofRate: parsePositiveNumber(stored.manualXofRate, 2.5),
            xofCommissionFee: parsePositiveNumber(stored.xofCommissionFee, 0.1),
            xofToNgnRate: parsePositiveNumber(stored.xofToNgnRate, 2.5),

            currencyVisibility: loadedVisibility,

            swapFees: stored.swapFees ? { ...DEFAULT_FULL_EXCHANGE_RATES_CONFIG.swapFees, ...stored.swapFees } : DEFAULT_FULL_EXCHANGE_RATES_CONFIG.swapFees,
            swapRangeTiers: Array.isArray(stored.swapRangeTiers) ? stored.swapRangeTiers : [],
            updatedAt: stored.updatedAt,
            updatedBy: stored.updatedBy,
          };
        }
      }
    } catch (err: any) {
      console.warn("[Admin Exchange Rates GET] Firestore fetch warning:", err.message);
    }

    return NextResponse.json({ success: true, config });
  } catch (err: any) {
    console.error("[Admin Exchange Rates GET Exception]:", err.message);
    return NextResponse.json({ error: "Unauthorized or backend exception", details: err.message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "exchange_rates.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const adminEmail = perm.auth?.email || "admin";
    const body = await req.json();

    const currencyVisibility: Record<string, boolean> = { ...DEFAULT_CURRENCY_VISIBILITY };
    if (body.currencyVisibility && typeof body.currencyVisibility === "object") {
      for (const key of Object.keys(body.currencyVisibility)) {
        currencyVisibility[key.toUpperCase()] = Boolean(body.currencyVisibility[key]);
      }
    }
    currencyVisibility.NGN = true; // NGN cannot be hidden

    const updatedConfig: Partial<FullExchangeRatesConfig> = {
      useFlutterwaveRate: Boolean(body.useFlutterwaveRate),
      useLiveWorldDollarRate: Boolean(body.useLiveWorldDollarRate),
      manualDollarRate: parsePositiveNumber(body.manualDollarRate, 1550),
      dollarCommissionFee: parsePositiveNumber(body.dollarCommissionFee, 180),

      useFlutterwaveXofRate: Boolean(body.useFlutterwaveXofRate),
      useLiveWorldXofRate: Boolean(body.useLiveWorldXofRate),
      manualXofRate: parsePositiveNumber(body.manualXofRate, 2.5),
      xofCommissionFee: parsePositiveNumber(body.xofCommissionFee, 0.1),
      xofToNgnRate: parsePositiveNumber(body.xofToNgnRate, 2.5),

      currencyVisibility,

      updatedAt: new Date().toISOString(),
      updatedBy: adminEmail,
    };

    const adjustmentKeys = [
      "usdSellMarkup", "usdBuyMarkup",
      "eurSellMarkup", "eurBuyMarkup",
      "gbpSellMarkup", "gbpBuyMarkup",
      "ghsSellMarkup", "ghsBuyMarkup",
      "kesSellMarkup", "kesBuyMarkup",
      "xofSellMarkup", "xofBuyMarkup",
      "xafSellMarkup", "xafBuyMarkup",
      "cadSellMarkup", "cadBuyMarkup",
      "zarSellMarkup", "zarBuyMarkup",
      "tzsSellMarkup", "tzsBuyMarkup",
      "ugxSellMarkup", "ugxBuyMarkup",
      "rwfSellMarkup", "rwfBuyMarkup",
      "zmwSellMarkup", "zmwBuyMarkup",
    ] as const;

    for (const key of adjustmentKeys) {
      const val = Number(body[key]);
      if (isNaN(val) || !isFinite(val) || val < 0) {
        return NextResponse.json(
          { error: `Adjustment '${key}' must be a non-negative finite number.` },
          { status: 400 }
        );
      }
      (updatedConfig as any)[key] = val;
    }

    if (body.swapFees && typeof body.swapFees === "object") {
      updatedConfig.swapFees = {
        ngnToUsd: Math.max(0, Number(body.swapFees.ngnToUsd) || 0),
        usdToNgn: Math.max(0, Number(body.swapFees.usdToNgn) || 0),
        ngnToXof: Math.max(0, Number(body.swapFees.ngnToXof) || 0),
        xofToNgn: Math.max(0, Number(body.swapFees.xofToNgn) || 0),
        usdToXof: Math.max(0, Number(body.swapFees.usdToXof) || 0),
        xofToUsd: Math.max(0, Number(body.swapFees.xofToUsd) || 0),
      };
    }

    if (Array.isArray(body.swapRangeTiers)) {
      const tiers = [];
      for (const t of body.swapRangeTiers) {
        const minAmount = Math.max(0, Number(t.minAmount) || 0);
        const maxAmount = Math.max(0, Number(t.maxAmount) || 0);
        const markupFee = Math.max(0, Number(t.markupFee) || 0);

        if (maxAmount <= minAmount) {
          return NextResponse.json(
            { error: `Invalid custom range tier: Max amount (${maxAmount}) must be strictly greater than Min amount (${minAmount})` },
            { status: 400 }
          );
        }

        tiers.push({
          id: String(t.id || `tier-${Math.random().toString(36).substring(2, 9)}`),
          pair: String(t.pair || "ngnToUsd"),
          minAmount,
          maxAmount,
          markupFee,
        });
      }
      updatedConfig.swapRangeTiers = tiers;
    }

    await adminDb.collection("config").doc("exchange_rates").set(updatedConfig, { merge: true });

    await adminDb.collection("admin_audit_logs").add({
      action: "update_exchange_rates_config",
      adminEmail,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Exchange rates, provider toggles, currency visibility, and swap fees updated successfully!",
      config: updatedConfig,
    });
  } catch (err: any) {
    console.error("[Admin Exchange Rates POST Exception]:", err.message);
    return NextResponse.json({ error: "Failed to update exchange rate settings", details: err.message }, { status: 500 });
  }
}
