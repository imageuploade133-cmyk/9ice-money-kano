# Wallet Refund & Reconciliation Audit Report
**Project:** E-Global Tech Kano & VM Payment Gateway
**Date:** July 2026
**Principal Software Engineer:** Jules

---

## Executive Summary
This audit investigates why wallet refunds performed by the VM Payment Gateway on failed or reversed transfers are not reflected in the Next.js frontend application, despite VM logs confirming successful database mutations, ledger updates, and transaction commits.

The root cause is a schema discrepancy:
- The **Next.js Frontend** uses a multi-currency wallet system storing balances in specialized sub-collections: `/wallets/${userId}_NGN` and `/wallets/${userId}_USD`.
- To preserve backwards compatibility, a legacy `balance` field is kept in the user profile: `/users/${userId}`.
- The **VM Payment Gateway**'s reconciliation, webhook, and billing services (Airtime, Mobile Data, etc.) were written before the multi-currency schema was introduced, so they updated **only** the legacy `/users/${userId}` document's `balance` field.
- When the frontend loads, the legacy balance is briefly read, but the frontend also frequently polls the serverless `/api/wallets` endpoint. This endpoint reads both `/users/${userId}` and `/wallets/${userId}_NGN`. If they are different, `/api/wallets` **overwrites/reverts** the legacy `/users/${userId}` balance back to the stale NGN wallet balance, completely erasing the refund!

---

## Verification checklist

### 1. Same Firebase Project
- **Frontend Config:** `/src/lib/firebase-admin.ts` defaults to project `e-tech-global-hub`.
- **Payment Gateway Config:** `/payment-gateway/src/config/firebase.ts` defaults to project `e-tech-global-hub`.
Both are verified to use the exact same Firestore instance.

### 2. Collection & Document Path Synchronization
- **Frontend Path:** Uses `/users/${userId}` for profiles, `/wallets/${userId}_NGN` for NGN balances, and `/transactions` for ledger logs.
- **Payment Gateway Path (Original):** Used `/users/${userId}` for profiles and `/transactions` for ledger logs.
- **Path Reconciliation:** We must update the Payment Gateway to write to both `/users/${userId}` and `/wallets/${userId}_NGN`.

### 3. Duplicate Wallet Collections
No duplicate collections exist. The frontend reads from the server-side API `/api/wallets` which queries the standard `/wallets` collection.

### 4. Firestore Security Rules
All client balance requests are proxied via serverless Next.js API routes (`/api/wallets/*`). These endpoints utilize the Firebase Admin SDK, bypassing security rules. Thus, security rules do not block balance reads.

---

## Failure Propagation Trace (Failed Transfer End-to-End)

Below is the step-by-step trace of how a failed transfer propagates through the system and where the balance update is lost:

1. **Debit (Next.js App):**
   - User initiates a transfer (e.g., ₦100 + ₦10 fee = ₦110) in `BalanceCard.tsx`.
   - Client calls Next.js API `/api/flutterwave/transfer`.
   - Next.js executes a transaction that debits `/wallets/${userId}_NGN` by ₦110 and synchronizes `/users/${userId}`'s legacy balance by subtracting ₦110.
   - A `PENDING` transfer document is written to `/transfers`.

2. **Flutterwave Response:**
   - Next.js proxies the transfer request to the Payment Gateway.
   - Gateway submits the payload to Flutterwave, which returns status `"NEW"` or `"PENDING"` (Transfer Queued).

3. **Reconciliation:**
   - The Gateway's background reconciliation scanner in `reconciliationService.ts` queries Flutterwave by reference.
   - Flutterwave returns terminal status `"FAILED"` (e.g., due to insufficient provider balance).

4. **Refund Mutation (The Bug Location):**
   - The Gateway's reconciliation service marks the transfer as `FAILED` and starts a transaction to refund the customer.
   - It updates the legacy `balance` field inside `/users/${userId}` to credit back ₦110.
   - **Critical Bug:** It does NOT update the NGN wallet sub-collection `/wallets/${userId}_NGN`.

5. **Client-side Overwrite:**
   - Frontend `AuthContext.tsx` has a real-time listener on `/users/${userId}` which detects the legacy balance update and updates client-side React state.
   - Almost concurrently, the periodic polling inside `BalanceCard.tsx` calls GET `/api/wallets`.
   - The serverless `/api/wallets` route fetches `/users/${userId}` (showing refunded balance) and `/wallets/${userId}_NGN` (showing old stale balance).
   - In Step 5 of the API handler, the backend detects the discrepancy:
     ```typescript
     if (userData.balance !== ngnBalance) {
       await userRef.update({ balance: ngnBalance });
     }
     ```
     It **overwrites** the legacy user profile balance in Firestore back to the stale, un-refunded wallet balance, returning the stale balance to the client.
   - The UI re-renders with the stale, un-refunded balance. The refund is permanently lost.

---

## Permanent Fix Architecture
We are permanently repairing this across all Gateway balance-modifying endpoints:
1. **Reconciliation Service (`reconciliationService.ts`):** Updates `/wallets/${userId}_NGN` and `/users/${userId}` atomically.
2. **Transfer Webhook (`flutterwaveController.ts`):** Updates `/wallets/${userId}_NGN` and `/users/${userId}` atomically.
3. **Clubkonnect Services (`clubkonnect.controller.ts`):** Updates `/wallets/${userId}_NGN` and `/users/${userId}` atomically for all VTU, Data debits, auto-refunds, and callback webhooks.
4. **Immediate UI Refresh (`BalanceCard.tsx`):** Triggers `fetchWalletBalances` immediately on transfer completion, removing the 10-second delay.
5. **High-Fidelity Logs:** Logs precise paths, previous/new balances, and transaction references for both legacy and sub-collections.
