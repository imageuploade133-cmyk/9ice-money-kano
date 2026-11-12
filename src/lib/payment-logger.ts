export interface PaymentLogPayload {
  category:
    | "Payment Initialization"
    | "Payment Initialized"
    | "Webhook Received"
    | "Redirect Verification"
    | "Duplicate Transaction"
    | "Wallet Credited"
    | "Wallet Debited"
    | "Transfer"
    | "Withdrawal"
    | "Duplicate"
    | "Pending Payment Deleted"
    | "Pending Deleted"
    | "Investment Created"
    | "PIN Verification"
    | "Verification Failed"
    | "Webhook Signature Failure"
    | "Cancelled Payment"
    | "Errors"
    | "Internal Error";
  transactionId?: string;
  tx_ref?: string;
  userId?: string;
  amount?: number;
  currency?: string;
  processingTimeMs?: number;
  requestId?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export function logPaymentEvent(payload: PaymentLogPayload) {
  const logObj = {
    timestamp: new Date().toISOString(),
    ...payload,
  };

  // Format as structured JSON log for log aggregation systems like Datadog, AWS CloudWatch, or Vercel Axiom
  console.log(`[STRUCTURED_PAYMENT_LOG] ${JSON.stringify(logObj)}`);
}
