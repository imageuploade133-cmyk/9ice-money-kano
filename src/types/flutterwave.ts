export interface FLWVirtualAccountPayload {
  email: string;
  tx_ref: string;
  phonenumber: string;
  is_permanent: boolean;
  currency: string;
  firstname: string;
  lastname: string;
  narration: string;
  bvn?: string;
}

export interface FLWVirtualAccountResponse {
  status: string;
  message: string;
  data?: {
    order_ref: string;
    account_number: string;
    bank_name: string;
    bank_code?: string;
    account_status: string;
    created_at: string;
    expiry_date?: string;
    note?: string;
    amount?: number;
    currency: string;
  };
}

export interface UserWalletAccount {
  userId: string;
  accountNumber: string;
  bankName: string;
  accountName: string;
  currency: string;
  flwRef: string;
  txRef: string;
  isPermanent: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}
