export interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  date: string;
  category: string;
}

export interface WalletState {
  balance: number;
  currency: string;
  userName: string;
  profileImage: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: "transaction" | "security" | "promo";
  read: boolean;
}
