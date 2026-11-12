# Technical Audit Report & Production Architecture Plan: Investment Module
**Project:** E-Global Tech Kano
**Date:** July 2026
**Investigator:** Jules (Principal Software Engineer)

---

## Phase 1: Complete Audit of the Existing Investment System

This audit reviews how the current application handles investment/savings products, identifies gaps, security vulnerabilities, and outlines the production transition architecture.

### 1. Existing Codebase Audit

#### A. Frontend UI & Local Simulation Files
* **`src/app/investment/page.tsx`**: Contains the complete User Interface for the Investment / Savings Center.
  * *UI Components:* Rendering tabs for "Invest", "Calculator", and "My Portfolio", select drawers for vaults, inputs for amount, visual cards of lock durations, and tables displaying "My Active Savings".
  * *Mock/Simulated Logic:*
    * Hardcodes `INVESTMENT_OPTIONS` (Flexi Wealth Vault at 8.5%, Pro Yield Vault at 12.5%, and Elite Compounder at 18.0% APR).
    * Calculates potential returns and interest formulas **purely on the client side**.
    * If `mock === "true"`, writes active investments to `sessionStorage` under `"active_investments"`, bypassing the backend.
    * It collects active savings by checking `sessionStorage.getItem("active_investments")` instead of making a secure fetch to the database history.
* **`src/components/wallet/BalanceCard.tsx`**:
  * *Mock/Simulated Logic:* Aggregates the general "Savings" card balance by parsing the array in `sessionStorage.getItem("active_investments")`, rather than dynamically polling a dedicated total portfolio balance endpoint from the database.

#### B. Backend Code & API Routes
* **`src/app/api/wallet/investment/route.ts`**:
  * *Current Action:* Receives a POST payload containing `amount`, `optionId`, `optionName`, `apr`, `maturityDate`, and `userId`.
  * *Database Action:* Initiates a Firestore Transaction that debits the user's `balance` in the `users` collection via `WalletService.debitWallet` and writes a new document to the `investments` collection with status `"ACTIVE"`.
  * *Gaps & Vulnerabilities:*
    * **No Interest Engine:** There is no server-side task, logic, or engine to compute interest over time.
    * **No Expiration, Claim or Cancel:** Once created, there is no way for a user to safely claim matured funds, calculate actual interest on the server, or cancel the lock (with penalty deductions). Money locked in `investments` remains permanently deducted.
    * **No Setting / Rate Verification:** The `apr` and lock duration are accepted blindly from the client payload (`req.body.apr`), meaning a malicious client could intercept the request and pass `apr: 500.0` or custom dates to bypass business rules.
    * **Missing Support for Fixed Deposits:** There is no distinct treatment between high-yield, duration-locked Fixed Deposits and standard high-liquidity Savings plans.

---

## 2. Gaps & Production Vulnerabilities

1. **Client-Side Value Trust (High Security Risk):** The API accepts `apr` directly from the client request. A user can set a 1000% APR lock.
2. **Missing Endpoints:** No cancel or claim endpoints exist. Users have no way to unlock their money.
3. **Missing Firestore Collections:** The codebase lacks schemas for `interestRates`, `investmentSettings`, and dedicated `fixedDeposits` or `auditLogs` for investment state transitions.
4. **Hardcoded Configurations:** Durations, minimum/maximum thresholds, rates, and lock parameters are hardcoded inside the frontend file.
5. **Lack of Proper History & Audit Trail:** Investment transactions (like interest payments, claims, cancellations, and penalty applications) are not tracked in a structured, queryable collection.

---

## 3. Production Architecture and Data Flow

To make the system fully production-ready, we will implement a backend-driven architecture.

### Database Schema Definition

We will define and use the following Firestore collection structures:

#### A. `investmentSettings` (Document: `global`)
Stores general system bounds and configurations:
```json
{
  "minInvestment": 1000,
  "maxInvestment": 10000000,
  "penaltyRate": 0.10, // 10% penalty on early withdrawal of Fixed Deposits
  "savingsRate": 0.08, // 8% per annum for Savings
  "updatedAt": "2026-07-23T12:00:00Z"
}
```

#### B. `fixedDeposits` (Durations and APRs)
Documents: `30`, `60`, `90`, `180`, `365`
```json
{
  "durationDays": 90,
  "apr": 0.125, // 12.5%
  "minAmount": 5000,
  "maxAmount": 5000000,
  "status": "ACTIVE"
}
```

#### C. `investments` (Active user holdings)
This stores all active savings and fixed deposit records:
```json
{
  "id": "inv-123456",
  "userId": "user-abc",
  "type": "SAVINGS" | "FIXED_DEPOSIT",
  "amount": 10000.00,
  "currency": "NGN",
  "startDate": "2026-07-23T12:00:00Z",
  "maturityDate": "2026-10-21T12:00:00Z",
  "interestRate": 0.125,
  "interestType": "SIMPLE" | "COMPOUND",
  "accumulatedInterest": 0.00,
  "totalValue": 10000.00,
  "status": "ACTIVE" | "MATURED" | "CLAIMED" | "CANCELLED",
  "createdAt": "2026-07-23T12:00:00Z",
  "updatedAt": "2026-07-23T12:00:00Z"
}
```

#### D. `walletTransactions` (Existing ledger entries, extended)
#### E. `auditLogs` (Security & system actions)

### Backend API Design
We will replace the single endpoint with a complete routing structure under `/api/investments`:

1. `GET /api/investments/settings` -> Retrieves active products, rates, and configuration.
2. `POST /api/investments/savings` -> Creates a real savings account, verifies the wallet balance, deducts the wallet balance, and adds a savings holding atomically in a transaction.
3. `POST /api/investments/fixed-deposit` -> Locks capital in a fixed deposit product based on duration.
4. `GET /api/investments` -> Polls active and historical investments for the authenticated user.
5. `POST /api/investments/[id]/claim` -> Securely claims matured investments, calculates interest on the server, credits the user's wallet, and sets status to `"CLAIMED"`.
6. `POST /api/investments/[id]/cancel` -> Early-withdraws an investment, applies configured penalties, credits back the remaining balance, and sets status to `"CANCELLED"`.

### Interest Engine Formulas
The interest calculation is processed server-side:
* **Simple Interest:**
  $$\text{Interest} = P \times R \times \frac{t}{365}$$
  Where $P$ is the principal, $R$ is the annual rate, and $t$ is the elapsed days.
* **Compound Interest:**
  $$\text{Interest} = P \times \left( (1 + \frac{R}{n})^{n \times \frac{t}{365}} - 1 \right)$$
  Where $n$ is compounding frequency (e.g., daily compounding $n = 365$).

---

## 4. Implementation Steps Roadmap

1. **Setup & Seeds:** Seed Firestore collections (`investmentSettings` and `fixedDeposits`) with standard financial parameters.
2. **Engine Implementation:** Code the server-side interest calculator inside a unified service wrapper.
3. **Backend API Construction:** Build Next.js API Routes for settings retrieval, savings setup, fixed deposit locks, details fetch, maturity claiming, and early cancellation with penalties.
4. **Frontend Integration:**
   - Link `BalanceCard.tsx` portfolio summaries to real API calculations.
   - Refactor `src/app/investment/page.tsx` tabs to display dynamic rates, load list items, and communicate with the new endpoints.
