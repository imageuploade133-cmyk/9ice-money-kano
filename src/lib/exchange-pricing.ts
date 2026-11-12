/**
 * Centralized Pricing Engine for Multi-Currency Wallet Swaps & Exchange Rates
 */

export const SUPPORTED_CURRENCIES = [
  "NGN",
  "USD",
  "EUR",
  "GBP",
  "GHS",
  "KES",
  "XOF",
  "XAF",
  "CAD",
  "ZAR",
  "TZS",
  "UGX",
  "RWF",
  "ZMW",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const NON_NGN_CURRENCIES: SupportedCurrency[] = [
  "USD",
  "EUR",
  "GBP",
  "GHS",
  "KES",
  "XOF",
  "XAF",
  "CAD",
  "ZAR",
  "TZS",
  "UGX",
  "RWF",
  "ZMW",
];

export interface CurrencyAdjustments {
  buyAdjustment: number; // Stored as positive number (added when customer buys foreign currency: NGN -> XXX)
  sellAdjustment: number; // Stored as positive number (subtracted when customer sells foreign currency: XXX -> NGN)
}

export interface FullExchangeRatesConfig {
  useFlutterwaveRate: boolean;
  useLiveWorldDollarRate: boolean;
  manualDollarRate: number;
  dollarCommissionFee: number;

  usdSellMarkup: number;
  usdBuyMarkup: number;
  eurSellMarkup: number;
  eurBuyMarkup: number;
  gbpSellMarkup: number;
  gbpBuyMarkup: number;
  ghsSellMarkup: number;
  ghsBuyMarkup: number;
  kesSellMarkup: number;
  kesBuyMarkup: number;
  xofSellMarkup: number;
  xofBuyMarkup: number;
  xafSellMarkup: number;
  xafBuyMarkup: number;
  cadSellMarkup: number;
  cadBuyMarkup: number;
  zarSellMarkup: number;
  zarBuyMarkup: number;
  tzsSellMarkup: number;
  tzsBuyMarkup: number;
  ugxSellMarkup: number;
  ugxBuyMarkup: number;
  rwfSellMarkup: number;
  rwfBuyMarkup: number;
  zmwSellMarkup: number;
  zmwBuyMarkup: number;

  useFlutterwaveXofRate: boolean;
  useLiveWorldXofRate: boolean;
  manualXofRate: number;
  xofCommissionFee: number;
  xofToNgnRate: number;

  // Currency visibility map: string -> boolean (true = visible, false = hidden)
  currencyVisibility: Record<string, boolean>;

  swapFees: Record<string, number>;
  swapRangeTiers: Array<{
    id: string;
    pair: string;
    minAmount: number;
    maxAmount: number;
    markupFee: number;
  }>;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_CURRENCY_VISIBILITY: Record<string, boolean> = {
  NGN: true,
  USD: true,
  EUR: true,
  GBP: true,
  GHS: true,
  KES: true,
  XOF: true,
  XAF: true,
  CAD: true,
  ZAR: true,
  TZS: true,
  UGX: true,
  RWF: true,
  ZMW: true,
};

export const DEFAULT_FULL_EXCHANGE_RATES_CONFIG: FullExchangeRatesConfig = {
  useFlutterwaveRate: true,
  useLiveWorldDollarRate: false,
  manualDollarRate: 1550,
  dollarCommissionFee: 180,

  usdSellMarkup: 180,
  usdBuyMarkup: 100,
  eurSellMarkup: 200,
  eurBuyMarkup: 110,
  gbpSellMarkup: 220,
  gbpBuyMarkup: 120,
  ghsSellMarkup: 10,
  ghsBuyMarkup: 5,
  kesSellMarkup: 1,
  kesBuyMarkup: 0.5,
  xofSellMarkup: 0.1,
  xofBuyMarkup: 0.1,
  xafSellMarkup: 0.1,
  xafBuyMarkup: 0.1,
  cadSellMarkup: 100,
  cadBuyMarkup: 50,
  zarSellMarkup: 10,
  zarBuyMarkup: 5,
  tzsSellMarkup: 0.1,
  tzsBuyMarkup: 0.05,
  ugxSellMarkup: 0.1,
  ugxBuyMarkup: 0.05,
  rwfSellMarkup: 0.2,
  rwfBuyMarkup: 0.1,
  zmwSellMarkup: 5,
  zmwBuyMarkup: 2.5,

  useFlutterwaveXofRate: true,
  useLiveWorldXofRate: false,
  manualXofRate: 2.5,
  xofCommissionFee: 0.1,
  xofToNgnRate: 2.5,

  currencyVisibility: { ...DEFAULT_CURRENCY_VISIBILITY },

  swapFees: {
    ngnToUsd: 50,
    usdToNgn: 1.5,
    ngnToXof: 30,
    xofToNgn: 10,
    usdToXof: 2.0,
    xofToUsd: 15,
  },
  swapRangeTiers: [],
};

export function parsePositiveNumber(val: any, fallback: number): number {
  if (val === undefined || val === null || val === "") return fallback;
  const num = Number(val);
  return isNaN(num) || !isFinite(num) ? fallback : Math.max(0, num);
}

/**
 * Checks if a given currency is customer-visible according to config.
 * NGN is the base currency and is ALWAYS visible.
 */
export function isCurrencyVisible(
  config: Partial<FullExchangeRatesConfig>,
  currency: string
): boolean {
  const code = currency.toUpperCase();
  if (code === "NGN") return true;

  if (config.currencyVisibility && typeof config.currencyVisibility[code] === "boolean") {
    return config.currencyVisibility[code];
  }

  return true; // Default legacy currencies to visible
}

/**
 * Extracts the buy (sellMarkup) and sell (buyMarkup) adjustments for a given non-NGN currency.
 * Always guarantees positive numbers (Math.max(0, ...)).
 */
export function getCurrencyAdjustments(
  config: Partial<FullExchangeRatesConfig>,
  currency: string
): CurrencyAdjustments {
  const code = currency.toUpperCase();

  switch (code) {
    case "USD":
      return {
        buyAdjustment: parsePositiveNumber(config.usdSellMarkup, 180),
        sellAdjustment: parsePositiveNumber(config.usdBuyMarkup, 100),
      };
    case "EUR":
      return {
        buyAdjustment: parsePositiveNumber(config.eurSellMarkup, 200),
        sellAdjustment: parsePositiveNumber(config.eurBuyMarkup, 110),
      };
    case "GBP":
      return {
        buyAdjustment: parsePositiveNumber(config.gbpSellMarkup, 220),
        sellAdjustment: parsePositiveNumber(config.gbpBuyMarkup, 120),
      };
    case "GHS":
      return {
        buyAdjustment: parsePositiveNumber(config.ghsSellMarkup, 10),
        sellAdjustment: parsePositiveNumber(config.ghsBuyMarkup, 5),
      };
    case "KES":
      return {
        buyAdjustment: parsePositiveNumber(config.kesSellMarkup, 1),
        sellAdjustment: parsePositiveNumber(config.kesBuyMarkup, 0.5),
      };
    case "XOF":
      return {
        buyAdjustment: parsePositiveNumber(config.xofSellMarkup, 0.1),
        sellAdjustment: parsePositiveNumber(config.xofBuyMarkup, 0.1),
      };
    case "XAF":
      return {
        buyAdjustment: parsePositiveNumber(config.xafSellMarkup, 0.1),
        sellAdjustment: parsePositiveNumber(config.xafBuyMarkup, 0.1),
      };
    case "CAD":
      return {
        buyAdjustment: parsePositiveNumber(config.cadSellMarkup, 100),
        sellAdjustment: parsePositiveNumber(config.cadBuyMarkup, 50),
      };
    case "ZAR":
      return {
        buyAdjustment: parsePositiveNumber(config.zarSellMarkup, 10),
        sellAdjustment: parsePositiveNumber(config.zarBuyMarkup, 5),
      };
    case "TZS":
      return {
        buyAdjustment: parsePositiveNumber(config.tzsSellMarkup, 0.1),
        sellAdjustment: parsePositiveNumber(config.tzsBuyMarkup, 0.05),
      };
    case "UGX":
      return {
        buyAdjustment: parsePositiveNumber(config.ugxSellMarkup, 0.1),
        sellAdjustment: parsePositiveNumber(config.ugxBuyMarkup, 0.05),
      };
    case "RWF":
      return {
        buyAdjustment: parsePositiveNumber(config.rwfSellMarkup, 0.2),
        sellAdjustment: parsePositiveNumber(config.rwfBuyMarkup, 0.1),
      };
    case "ZMW":
      return {
        buyAdjustment: parsePositiveNumber(config.zmwSellMarkup, 5),
        sellAdjustment: parsePositiveNumber(config.zmwBuyMarkup, 2.5),
      };
    default:
      return { buyAdjustment: 0, sellAdjustment: 0 };
  }
}

/**
 * Calculates the customer directional rate given the source, destination, provider base rate, and config.
 */
export function calculateDirectionalCustomerRate({
  sourceCurrency,
  destinationCurrency,
  baseRate,
  config,
}: {
  sourceCurrency: string;
  destinationCurrency: string;
  baseRate: number;
  config: Partial<FullExchangeRatesConfig>;
}): {
  effectiveRateInNgn: number;
  unitExchangeRate: number;
  direction: "BUY" | "SELL" | "CROSS";
} {
  const from = sourceCurrency.toUpperCase();
  const to = destinationCurrency.toUpperCase();

  if (from === "NGN" && to !== "NGN") {
    const adj = getCurrencyAdjustments(config, to);
    const effectiveRateInNgn = baseRate + adj.buyAdjustment;
    const unitExchangeRate = effectiveRateInNgn > 0 ? 1 / effectiveRateInNgn : 0;
    return { effectiveRateInNgn, unitExchangeRate, direction: "BUY" };
  }

  if (from !== "NGN" && to === "NGN") {
    const adj = getCurrencyAdjustments(config, from);
    const effectiveRateInNgn = Math.max(0.0001, baseRate - adj.sellAdjustment);
    const unitExchangeRate = effectiveRateInNgn;
    return { effectiveRateInNgn, unitExchangeRate, direction: "SELL" };
  }

  return { effectiveRateInNgn: baseRate, unitExchangeRate: baseRate, direction: "CROSS" };
}
