/**
 * Provider-neutral payment contracts for the 9iceMoney frontend.
 *
 * These types are additive and intentionally do not replace the existing
 * PaymentGateway interface or route calls yet. Existing Flutterwave flows
 * remain unchanged until each operation has a verified backend equivalent.
 */

export type PaymentProviderId = "flutterwave" | "paystack" | "ninepsb" | "clubkonnect";

export type NormalizedPaymentStatus =
  | "initialized"
  | "pending"
  | "successful"
  | "failed"
  | "cancelled"
  | "expired"
  | "reversed";

export interface PaymentProviderCapabilities {
  walletFunding: boolean;
  bankTransferPayout: boolean;
  accountResolution: boolean;
  virtualAccounts: boolean;
  billPayments: boolean;
  airtime: boolean;
  data: boolean;
  refunds: boolean;
}

export interface NormalizedPaymentRequest {
  amount: number;
  currency: string;
  email: string;
  reference: string;
  callbackUrl?: string;
  customerId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface NormalizedPaymentInitialization {
  success: boolean;
  provider: PaymentProviderId;
  reference: string;
  status: "initialized" | "failed";
  checkoutUrl?: string;
  providerReference?: string;
  message?: string;
}

export interface NormalizedPaymentVerification {
  success: boolean;
  provider: PaymentProviderId;
  reference: string;
  providerReference?: string;
  status: NormalizedPaymentStatus;
  amount?: number;
  currency?: string;
  message?: string;
}

/**
 * Public capability metadata only. Provider secret keys, webhook secrets,
 * and private credentials must remain on the gateway server.
 */
export interface PublicPaymentProviderConfig {
  id: PaymentProviderId;
  enabled: boolean;
  priority: number;
  supportedCountries: string[];
  supportedCurrencies: string[];
  capabilities: PaymentProviderCapabilities;
}
