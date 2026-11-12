export interface InitializePaymentPayload {
  amount: number;
  currency: string;
  email: string;
  name: string;
  userId: string;
  redirectUrl: string;
  phone?: string;
  bankId?: string;
}

export interface InitializePaymentResponse {
  success: boolean;
  paymentLink?: string;
  reference: string;
  error?: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  fundedAmount?: number;
  newBalance?: number;
  duplicate?: boolean;
  message?: string;
  error?: string;
}

export interface ResolveAccountPayload {
  bankId: string;
  accountNumber: string;
}

export interface ResolveAccountResponse {
  success: boolean;
  accountName?: string;
  error?: string;
}

export interface CreateTransferRecipientPayload {
  type: string;
  name: string;
  accountNumber: string;
  bankCode: string;
  currency: string;
}

export interface CreateTransferRecipientResponse {
  success: boolean;
  recipientCode: string;
  error?: string;
}

export interface TransferPayload {
  bankId: string;
  accountNumber: string;
  amount: number;
  narration: string;
  reference: string;
}

export interface TransferResponse {
  success: boolean;
  reference: string;
  error?: string;
}

export interface VirtualAccountPayload {
  userId: string;
  email: string;
  firstname: string;
  lastname: string;
  phone: string;
}

export interface VirtualAccountResponse {
  success: boolean;
  bankName: string;
  accountNumber: string;
  accountName: string;
  error?: string;
}

export interface BillPaymentPayload {
  biller_code: string;
  item_code: string;
  amount: number;
  customer_id: string;
  biller_name: string;
  biller_type: string;
  reference: string;
}

export interface BillPaymentResponse {
  success: boolean;
  reference: string;
  tx_ref: string;
  flw_ref?: string;
  amount: number;
  customer: string;
  biller_name: string;
  error?: string;
}

export interface PaymentGateway {
  name: string;

  initializePayment(payload: InitializePaymentPayload): Promise<InitializePaymentResponse>;

  verifyPayment(transactionId: string, txRef?: string): Promise<VerifyPaymentResponse>;

  resolveAccount(payload: ResolveAccountPayload): Promise<ResolveAccountResponse>;

  createTransferRecipient(payload: CreateTransferRecipientPayload): Promise<CreateTransferRecipientResponse>;

  transfer(payload: TransferPayload): Promise<TransferResponse>;

  createVirtualAccount(payload: VirtualAccountPayload): Promise<VirtualAccountResponse>;

  verifyWebhook(headers: Record<string, string>, body: string): Promise<boolean>;

  purchaseAirtime(payload: BillPaymentPayload): Promise<BillPaymentResponse>;

  purchaseData(payload: BillPaymentPayload): Promise<BillPaymentResponse>;

  payBills(payload: BillPaymentPayload): Promise<BillPaymentResponse>;

  refund(reference: string, amount: number): Promise<boolean>;
}
