export interface BillingAddress {
  country: string;
  state: string;
  city: string;
  postalCode: string;
  address: string;
}

export interface CardItem {
  id: string; // Firestore document ID
  cardId: string; // Flutterwave remote Card ID
  userId: string;
  currency: "NGN" | "USD";
  maskedPan: string;
  expiry: string;
  cardholder: string;
  theme: "obsidian" | "platinum" | "sunset";
  isLocked: boolean;
  frozen: boolean;
  terminated: boolean;
  balance: number;
  lastFour: string;
  brand: string;
  cardType: "VIRTUAL" | "PHYSICAL";
  fundingWallet: "NGN" | "USD";
  provider: string;
  createdAt: string;
  updatedAt: string;
  billingAddress?: BillingAddress;
}

export interface CardTransaction {
  id: string;
  cardId: string;
  amount: number;
  currency: string;
  description: string;
  merchant: string;
  status: "SUCCESSFUL" | "FAILED" | "DECLINED" | "PENDING";
  type: "DEBIT" | "CREDIT";
  fee: number;
  createdAt: string;
}
