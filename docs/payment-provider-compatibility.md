# Frontend Payment Provider Compatibility

## Non-breaking rule

The frontend should continue using the existing payment service contract and backend URL. Provider credentials must never be placed in browser code, public environment variables, client-side Firestore documents, or frontend configuration.

## Current compatibility findings

- The repository has a `PaymentGateway` interface and `PaymentGatewayManager`, which are useful extension points.
- The current manager's bill-payment selection still routes non-VTU bill payments directly to Flutterwave, while airtime/data are routed to Clubkonnect.
- Wallet funding methods in `PaymentService` call Flutterwave-specific endpoints and parse Flutterwave-specific USSD/bank-transfer response fields.
- Therefore, the frontend is not yet provider-neutral for wallet funding. Changing only an API key or base URL will not safely switch those flows.

## Target integration boundary

The frontend should call stable application endpoints (not provider endpoints) and consume normalized application responses:

- Initialize collection: return `success`, merchant `reference`, `status`, and a hosted `paymentUrl` or channel-specific instructions.
- Verify collection: return `reference`, `provider`, `status`, `amount`, `currency`, and whether the wallet has already been credited.
- Transfer, virtual account, bill, airtime and data operations must each be separately capability-gated.
- Provider selection should be resolved on the backend. The browser must not choose a provider by receiving or storing secret credentials.

## Migration safeguards

1. Keep existing Flutterwave-specific screens and parsing as the fallback until the normalized backend endpoints have passed regression tests.
2. Add new normalized response handling alongside the existing response handling; remove old parsing only in a separately tested migration.
3. Never display a payment as completed solely because the customer returned to the success URL.
4. Poll/verify using the backend and show pending states without issuing another payment.
5. Preserve the merchant reference across retries; do not create a new reference automatically after a timeout.
6. Expose a provider only when the backend reports that the relevant capability is ready.

See the backend repository's `docs/payment-provider-integration.md` for the provider contract and 9PSB onboarding checklist.
