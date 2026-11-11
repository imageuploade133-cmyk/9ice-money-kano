export interface FeatureToggleItem {
  enabled: boolean;
  disabledNotice?: string;
}

export interface FeatureToggles {
  bills: FeatureToggleItem;
  transfer: FeatureToggleItem;
  fund_wallet: FeatureToggleItem;
  investment: FeatureToggleItem;
  store: FeatureToggleItem;
  estate: FeatureToggleItem;
  referral: FeatureToggleItem;
  virtual_cards: FeatureToggleItem;
  currency_swap: FeatureToggleItem;
}

export type FeatureToggleKey = keyof FeatureToggles;

export const DEFAULT_DISABLED_NOTICE = "This operation is currently not available. Please try again later.";

export const DEFAULT_FEATURE_TOGGLES: FeatureToggles = {
  bills: { enabled: true, disabledNotice: DEFAULT_DISABLED_NOTICE },
  transfer: { enabled: true, disabledNotice: DEFAULT_DISABLED_NOTICE },
  fund_wallet: { enabled: true, disabledNotice: DEFAULT_DISABLED_NOTICE },
  investment: { enabled: true, disabledNotice: DEFAULT_DISABLED_NOTICE },
  store: { enabled: true, disabledNotice: DEFAULT_DISABLED_NOTICE },
  estate: { enabled: true, disabledNotice: DEFAULT_DISABLED_NOTICE },
  referral: { enabled: true, disabledNotice: DEFAULT_DISABLED_NOTICE },
  virtual_cards: { enabled: true, disabledNotice: DEFAULT_DISABLED_NOTICE },
  currency_swap: { enabled: true, disabledNotice: DEFAULT_DISABLED_NOTICE },
};

export const FEATURE_METADATA: Record<FeatureToggleKey, { name: string; icon: string; description: string }> = {
  bills: { name: "Bills & VTU", icon: "receipt_long", description: "Airtime, Data, Cable TV, Electricity & Utility Bill payments" },
  transfer: { name: "Bank Transfers", icon: "send_money", description: "Single and Bulk Outward Bank Transfers" },
  fund_wallet: { name: "Fund Wallet", icon: "add_card", description: "Card, USSD, and Bank Transfer Wallet Deposits" },
  investment: { name: "Investments & Fixed Deposits", icon: "savings", description: "Savings plans, yields and fixed deposits" },
  store: { name: "E-Commerce Store", icon: "shopping_bag", description: "Public product catalog, cart, checkout, and store orders" },
  estate: { name: "Real Estate Marketplace", icon: "home_work", description: "Property listings, seller inquiries, and marketplace browsing" },
  referral: { name: "Referrals & Rewards", icon: "groups", description: "Referral code sharing, commission claims, and referral rewards" },
  virtual_cards: { name: "Virtual USD/NGN Cards", icon: "credit_card", description: "Virtual Card issuing, funding, withdrawal, and management" },
  currency_swap: { name: "Currency Swap", icon: "currency_exchange", description: "Cross-currency FX conversions and multi-currency swaps" },
};

export function isFeatureEnabled(toggles?: FeatureToggles | null, key?: FeatureToggleKey): boolean {
  if (!key) return true;
  const activeToggles = toggles || DEFAULT_FEATURE_TOGGLES;
  const item = activeToggles[key];
  if (!item) return true;
  return item.enabled !== false;
}

export function getFeatureDisabledMessage(toggles?: FeatureToggles | null, key?: FeatureToggleKey): string {
  if (!key) return DEFAULT_DISABLED_NOTICE;
  const activeToggles = toggles || DEFAULT_FEATURE_TOGGLES;
  const item = activeToggles[key];
  return (item?.disabledNotice || "").trim() || DEFAULT_DISABLED_NOTICE;
}
