import { adminDb } from "@/lib/firebase-admin";
import { WalletService } from "./wallet-service";
import { NotificationService } from "./notification-service";

export interface InvestmentSettings {
  minInvestment: number;
  maxInvestment: number;
  penaltyRate: number; // e.g. 0.10 for 10% early withdrawal penalty on principal
  penaltyPolicyText?: string; // Custom policy disclosure text set by admin
  savingsRate: number; // e.g. 0.08 for 8%
  allowBonusInvestment?: boolean; // Admin toggle to enable/disable bonus wallet usage for investments
  updatedAt: string;
}

export interface InterestRateProduct {
  id: string;
  name: string;
  type: "SAVINGS" | "FIXED_DEPOSIT";
  apr: number; // e.g. 0.085 for 8.5%
  durationDays: number; // e.g. 30, 60, 90, 180, 365
  interestType: "SIMPLE" | "COMPOUND";
  status: "ACTIVE" | "INACTIVE";
}

export interface InvestmentRecord {
  id: string;
  investmentReference?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  walletType?: "MAIN" | "BONUS";
  balanceBeforeInvestment?: number;
  balanceAfterInvestment?: number;
  bonusBalanceBeforeInvestment?: number;
  bonusBalanceAfterInvestment?: number;
  type: "SAVINGS" | "FIXED_DEPOSIT";
  amount: number;
  currency: string;
  startDate: string;
  maturityDate: string;
  durationDays: number;
  interestRate: number;
  interestType: "SIMPLE" | "COMPOUND";
  earlyWithdrawalPenaltyRateSnapshot: number;
  accumulatedInterest: number;
  totalValue: number;
  status: "ACTIVE" | "MATURED" | "CLAIM_REQUESTED" | "CLAIMED" | "CANCELLED";
  optionId: string;
  optionName: string;
  idempotencyKey?: string;
  productVersion?: number;
  contractVersion?: string;
  claimRequestedAt?: string;
  claimApprovedAt?: string;
  claimApprovedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export class InvestmentService {
  /**
   * Generates a stable, non-sequential, customer-facing reference (e.g. INV-7K4M92X8).
   */
  static generateInvestmentReference(): string {
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // exclude easily confused chars (0,1,O,I)
    let randomPart = "";
    for (let i = 0; i < 8; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `INV-${randomPart}`;
  }

  /**
   * Safe backward-compatible helper for legacy investment records without an investmentReference.
   */
  static resolvePublicReference(record: Partial<InvestmentRecord>): string {
    if (record.investmentReference && record.investmentReference.trim()) {
      return record.investmentReference;
    }
    const cleanId = record.id || "";
    if (cleanId.startsWith("inv-") || cleanId.length > 20) {
      // Derive a short deterministic prefix/suffix hash string for display
      const cleanHash = cleanId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      const shortCode = cleanHash.slice(-8) || "88888888";
      return `INV-${shortCode}`;
    }
    return `INV-${cleanId.toUpperCase()}`;
  }

  /**
   * Safe and self-healing DB seeder for settings and rates.
   */
  static async seedDatabaseIfNeeded(): Promise<void> {
    const settingsRef = adminDb.collection("investmentSettings").doc("global");
    const doc = await settingsRef.get();

    if (!doc.exists) {
      console.log("[InvestmentService] Seeding investment settings and rates...");

      const defaultSettings: InvestmentSettings = {
        minInvestment: 1000,
        maxInvestment: 10000000,
        penaltyRate: 0.10, // 10% penalty on early withdrawal of principal
        penaltyPolicyText: "Early liquidation of locked savings before the target unlock date incurs a 10% penalty on principal. The remaining 90% balance will be instantly refunded to your wallet.",
        savingsRate: 0.08,
        allowBonusInvestment: true,
        updatedAt: new Date().toISOString(),
      };
      await settingsRef.set(defaultSettings);

      const defaultProducts: InterestRateProduct[] = [
        {
          id: "vault-flex",
          name: "Flexi Wealth Vault",
          type: "SAVINGS",
          apr: 0.085, // 8.5%
          durationDays: 30,
          interestType: "SIMPLE",
          status: "ACTIVE",
        },
        {
          id: "vault-pro",
          name: "Pro Yield Vault",
          type: "FIXED_DEPOSIT",
          apr: 0.125, // 12.5%
          durationDays: 90,
          interestType: "SIMPLE",
          status: "ACTIVE",
        },
        {
          id: "vault-elite",
          name: "Elite Compounder",
          type: "FIXED_DEPOSIT",
          apr: 0.18, // 18.0%
          durationDays: 365,
          interestType: "COMPOUND",
          status: "ACTIVE",
        },
      ];

      for (const prod of defaultProducts) {
        await adminDb.collection("interestRates").doc(prod.id).set(prod);
      }
      console.log("[InvestmentService] Seeding completed successfully!");
    }
  }

  /**
   * Retrieves global investment configurations.
   */
  static async getSettings(): Promise<InvestmentSettings> {
    await this.seedDatabaseIfNeeded();
    const doc = await adminDb.collection("investmentSettings").doc("global").get();
    const data = doc.data() || {};
    return {
      minInvestment: Number(data.minInvestment) || 1000,
      maxInvestment: Number(data.maxInvestment) || 10000000,
      penaltyRate: data.penaltyRate !== undefined ? Number(data.penaltyRate) : 0.10,
      penaltyPolicyText: data.penaltyPolicyText || "Early liquidation of locked savings before the target unlock date incurs a 10% penalty on principal. The remaining 90% balance will be instantly refunded to your wallet.",
      savingsRate: Number(data.savingsRate) || 0.08,
      allowBonusInvestment: data.allowBonusInvestment !== undefined ? Boolean(data.allowBonusInvestment) : true,
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
  }

  /**
   * Updates global investment settings (Admin authorization checked in route layer).
   */
  static async updateSettings(params: Partial<InvestmentSettings>): Promise<InvestmentSettings> {
    await this.seedDatabaseIfNeeded();
    const settingsRef = adminDb.collection("investmentSettings").doc("global");
    const current = await this.getSettings();

    const updated: InvestmentSettings = {
      ...current,
      ...params,
      penaltyRate: params.penaltyRate !== undefined ? Math.max(0, Math.min(1, Number(params.penaltyRate))) : current.penaltyRate,
      updatedAt: new Date().toISOString(),
    };

    await settingsRef.set(updated, { merge: true });
    return updated;
  }

  /**
   * Retrieves all active investment interest rate products.
   */
  static async getInterestRates(): Promise<InterestRateProduct[]> {
    await this.seedDatabaseIfNeeded();
    const snapshot = await adminDb.collection("interestRates").where("status", "==", "ACTIVE").get();
    const products: InterestRateProduct[] = [];
    snapshot.forEach((doc) => {
      products.push(doc.data() as InterestRateProduct);
    });
    return products;
  }

  /**
   * Calculates dynamic server-side interest accrued for a given amount, duration and rate.
   * Caps interest accumulation at maturity duration.
   */
  static calculateInterest(
    amount: number,
    apr: number,
    elapsedDays: number,
    interestType: "SIMPLE" | "COMPOUND",
    maxDurationDays?: number
  ): number {
    if (elapsedDays <= 0 || isNaN(amount) || amount <= 0 || isNaN(apr) || apr <= 0) return 0;

    const effectiveDays = maxDurationDays ? Math.min(elapsedDays, maxDurationDays) : elapsedDays;
    if (effectiveDays <= 0) return 0;

    if (interestType === "SIMPLE") {
      // Simple Interest: P * R * (t / 365)
      const interest = amount * apr * (effectiveDays / 365);
      return Number(interest.toFixed(2));
    } else {
      // Daily Compounding Interest: P * ((1 + R/365)^t - 1)
      const interest = amount * (Math.pow(1 + apr / 365, effectiveDays) - 1);
      return Number(interest.toFixed(2));
    }
  }

  /**
   * Atomic lock creation of Savings / Fixed Deposits inside a transaction.
   * Snapshots contractual terms and enforces idempotency.
   */
  static async createInvestment(
    userId: string,
    params: {
      amount: number;
      currency?: string;
      productId: string;
      type: "SAVINGS" | "FIXED_DEPOSIT";
      walletType?: "MAIN" | "BONUS";
      durationDays?: number;
      idempotencyKey?: string;
    }
  ): Promise<InvestmentRecord> {
    const { amount, productId, type, walletType = "MAIN", idempotencyKey } = params;
    const currency = (params.currency || "NGN").toUpperCase();

    // Input Validation
    if (!amount || typeof amount !== "number" || isNaN(amount) || !isFinite(amount) || amount <= 0) {
      throw new Error("Invalid investment amount. Amount must be a positive number.");
    }

    if (currency !== "NGN") {
      throw new Error("Unsupported investment currency. Only NGN investments are accepted.");
    }

    await this.seedDatabaseIfNeeded();

    // 1. Load authoritative settings and product configuration from Firestore
    const settings = await this.getSettings();

    // Resolve product from config/investment_plans array or interestRates collection
    let resolvedProduct: {
      id: string;
      name: string;
      apr: number;
      interestType: "SIMPLE" | "COMPOUND";
      defaultDurationDays: number;
      minInvestment?: number;
      maxInvestment?: number;
      isAmountRequired?: boolean;
      status?: string;
    } | null = null;

    const plansSnap = await adminDb.collection("config").doc("investment_plans").get();
    if (plansSnap.exists) {
      const plansData = plansSnap.data();
      if (Array.isArray(plansData?.plans)) {
        const found = plansData.plans.find((p: any) => p.id === productId);
        if (found) {
          resolvedProduct = {
            id: found.id,
            name: found.name,
            apr: Number(found.apr) / 100, // convert percentage (e.g. 12.5) to decimal (0.125)
            interestType: found.interestType || "SIMPLE",
            defaultDurationDays: Number(found.defaultDurationDays) || 30,
            minInvestment: Number(found.minInvestment) || settings.minInvestment,
            maxInvestment: Number(found.maxInvestment) || settings.maxInvestment,
            status: found.status || "ACTIVE",
          };
        }
      }
    }

    if (!resolvedProduct) {
      const productDoc = await adminDb.collection("interestRates").doc(productId).get();
      if (productDoc.exists) {
        const prodData = productDoc.data() as InterestRateProduct;
        resolvedProduct = {
          id: prodData.id,
          name: prodData.name,
          apr: Number(prodData.apr),
          interestType: prodData.interestType || "SIMPLE",
          defaultDurationDays: Number(prodData.durationDays) || 30,
          status: prodData.status || "ACTIVE",
        };
      }
    }

    if (!resolvedProduct || resolvedProduct.status === "INACTIVE") {
      throw new Error(`The selected investment product model is either inactive or not found: ${productId}`);
    }

    // Validate global & product limits
    const minLimit = Math.max(settings.minInvestment, resolvedProduct.minInvestment || 0);
    const maxLimit = Math.min(settings.maxInvestment, resolvedProduct.maxInvestment || Infinity);

    if (amount < minLimit) {
      throw new Error(`Investment amount is too low. Minimum required: ₦${minLimit.toLocaleString()}`);
    }
    if (amount > maxLimit) {
      throw new Error(`Investment amount exceeds the limit. Maximum allowed: ₦${maxLimit.toLocaleString()}`);
    }

    // Determine contractual duration
    const finalDurationDays = params.durationDays && Number(params.durationDays) > 0
      ? Math.max(1, Math.min(1095, Math.floor(Number(params.durationDays))))
      : resolvedProduct.defaultDurationDays;

    // Security check: Check if user is blocked from placing investments
    const userDocRef = adminDb.collection("users").doc(userId);
    const userDocSnap = await userDocRef.get();
    if (userDocSnap.exists) {
      const uData = userDocSnap.data() || {};
      if (uData.isInvestmentBlocked === true) {
        throw new Error("Your account is currently restricted from creating new investments. Please contact support.");
      }
    }

    // Secure requirement: Server-side check for admin policy ON/OFF and funding requirement
    if (walletType === "BONUS") {
      if (settings.allowBonusInvestment === false) {
        throw new Error("Bonus wallet investment is currently Unavailable at this time");
      }
      const { ReferralService } = await import("./referral-service");
      const hasCompleted = await ReferralService.hasCompletedRequirement(userId);
      if (!hasCompleted) {
        throw new Error("You are not allowed to invest using your Bonus wallet because you have not completed the requirement. To unlock investment using bonus funds, please fund your account with a minimum of ₦3,000 NGN (either current balance or cumulative deposits).");
      }
    }

    // Generate deterministic refId if idempotencyKey is provided to prevent double-investment
    const cleanIdempotencyKey = idempotencyKey ? idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) : "";
    const refId = cleanIdempotencyKey
      ? `inv-${userId}-${cleanIdempotencyKey}`
      : `inv-${userId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const startDate = new Date();
    const maturityDate = new Date(startDate.getTime() + finalDurationDays * 24 * 60 * 60 * 1000);

    // Fetch user profile info before transaction to persist contract contact details
    let userInfo: { name?: string; email?: string; phone?: string } = {};
    try {
      const userDoc = await adminDb.collection("users").doc(userId).get();
      if (userDoc.exists) {
        const uData = userDoc.data() || {};
        userInfo = {
          name: uData.name || uData.displayName || `${uData.firstName || ""} ${uData.lastName || ""}`.trim(),
          email: uData.email || uData.emailAddress,
          phone: uData.phoneNumber || uData.phone,
        };
      }
      if (!userInfo.email) {
        const { getFirebaseAuthUserByUid } = await import("@/lib/firebase-auth-rest");
        const fbUser = await getFirebaseAuthUserByUid(userId);
        if (fbUser) {
          userInfo.email = userInfo.email || fbUser.email;
          userInfo.phone = userInfo.phone || fbUser.phoneNumber;
          userInfo.name = userInfo.name || fbUser.displayName;
        }
      }
    } catch (e) {
      console.warn(`[InvestmentService] Non-blocking user info lookup error for uid ${userId}:`, e);
    }

    // 2. Perform Atomic Write via Firestore Transaction
    const record = await adminDb.runTransaction(async (transaction) => {
      const investRef = adminDb.collection("investments").doc(refId);
      const existingDoc = await transaction.get(investRef);

      // Idempotency Check: if request was already processed with matching parameters, return existing contract
      if (existingDoc.exists) {
        const existingData = existingDoc.data() as InvestmentRecord;
        if (
          existingData.amount !== amount ||
          existingData.optionId !== resolvedProduct!.id ||
          existingData.currency !== currency
        ) {
          throw new Error("Idempotency Key Conflict: Cannot reuse the same Idempotency-Key with different investment parameters.");
        }
        console.log(`[InvestmentService] Idempotent request verified for key ${refId}, returning original investment contract.`);
        return existingData;
      }

      // Verify wallet balance and debit wallet atomically
      const { previousBalance, newBalance } = await WalletService.debitWallet(transaction, {
        userId,
        amount,
        currency,
        reference: refId,
        type: "INVESTMENT",
        description: `Created Locked ${type === "SAVINGS" ? "Savings" : "Fixed Deposit"}: ${resolvedProduct!.name} (${finalDurationDays} Days)`,
        recipientName: resolvedProduct!.name,
        fee: 0,
        walletType,
      });

      const publicRef = this.generateInvestmentReference();

      const investRecord: InvestmentRecord = {
        id: refId,
        investmentReference: publicRef,
        userId,
        userName: userInfo.name || undefined,
        userEmail: userInfo.email || undefined,
        userPhone: userInfo.phone || undefined,
        walletType,
        balanceBeforeInvestment: walletType === "MAIN" ? previousBalance : undefined,
        balanceAfterInvestment: walletType === "MAIN" ? newBalance : undefined,
        bonusBalanceBeforeInvestment: walletType === "BONUS" ? previousBalance : undefined,
        bonusBalanceAfterInvestment: walletType === "BONUS" ? newBalance : undefined,
        type,
        amount,
        currency,
        startDate: startDate.toISOString(),
        maturityDate: maturityDate.toISOString(),
        durationDays: finalDurationDays,
        interestRate: resolvedProduct!.apr,
        interestType: resolvedProduct!.interestType,
        earlyWithdrawalPenaltyRateSnapshot: settings.penaltyRate,
        accumulatedInterest: 0,
        totalValue: amount,
        status: "ACTIVE",
        optionId: resolvedProduct!.id,
        optionName: resolvedProduct!.name,
        idempotencyKey: cleanIdempotencyKey || undefined,
        productVersion: 1,
        contractVersion: "1.0",
        createdAt: startDate.toISOString(),
        updatedAt: startDate.toISOString(),
      };

      // Firestore rejects undefined field values. Optional investment fields
      // must be omitted rather than written as undefined (especially when MAIN
      // wallet investments do not have bonus-wallet balance snapshots).
      const firestoreInvestRecord = Object.fromEntries(
        Object.entries(investRecord).filter(([, value]) => value !== undefined)
      ) as InvestmentRecord;

      transaction.set(investRef, firestoreInvestRecord);

      // Write specialized Investment transaction log
      const logRef = adminDb.collection("investmentTransactions").doc(`tx-invest-${refId}`);
      transaction.set(logRef, {
        id: `tx-invest-${refId}`,
        userId,
        investmentId: refId,
        amount,
        type: "DEPOSIT",
        status: "SUCCESS",
        description: `Locked capital of ₦${amount.toLocaleString()} into ${resolvedProduct!.name}`,
        createdAt: startDate.toISOString(),
      });

      // Write audit log document
      const auditRef = adminDb.collection("auditLogs").doc(`audit-invest-${refId}`);
      transaction.set(auditRef, {
        id: `audit-invest-${refId}`,
        userId,
        action: "INVESTMENT_CREATED",
        metadata: {
          productId,
          amount,
          type,
          refId,
          durationDays: finalDurationDays,
          penaltyRateSnapshot: settings.penaltyRate,
        },
        version: "1.0",
        createdAt: startDate.toISOString(),
      });

      return investRecord;
    });

    return record;
  }

  /**
   * Request payout for a matured investment. Transitions status to CLAIM_REQUESTED for admin approval.
   */
  static async requestInvestmentClaim(userId: string, investmentId: string): Promise<{ record: InvestmentRecord; estimatedPayout: number }> {
    const investRef = adminDb.collection("investments").doc(investmentId);

    const result = await adminDb.runTransaction(async (transaction) => {
      const doc = await transaction.get(investRef);
      if (!doc.exists) {
        throw new Error("The specified investment was not found.");
      }

      const record = doc.data() as InvestmentRecord;
      if (record.userId !== userId) {
        throw new Error("Forbidden: You do not own this investment lock.");
      }
      if (record.status === "CLAIMED") {
        throw new Error("This investment has already been claimed.");
      }
      if (record.status === "CLAIM_REQUESTED") {
        throw new Error("A payout request has already been submitted for administrator approval.");
      }
      if (record.status === "CANCELLED") {
        throw new Error("This investment has already been cancelled.");
      }

      const now = new Date();
      const isMatured = now >= new Date(record.maturityDate);
      if (!isMatured) {
        throw new Error("This investment is still locked and has not reached its maturity date.");
      }

      // Calculate accrued interest server-side
      const elapsedMs = now.getTime() - new Date(record.startDate).getTime();
      const elapsedDays = Math.max(1, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));

      const earnedInterest = this.calculateInterest(
        record.amount,
        record.interestRate,
        elapsedDays,
        record.interestType,
        record.durationDays
      );

      const payoutAmount = Number((record.amount + earnedInterest).toFixed(2));

      // Update investment status to CLAIM_REQUESTED
      const updatedRecord: Partial<InvestmentRecord> = {
        status: "CLAIM_REQUESTED",
        accumulatedInterest: earnedInterest,
        totalValue: payoutAmount,
        claimRequestedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      transaction.update(investRef, updatedRecord);

      // Save claim request log
      const logRef = adminDb.collection("investmentTransactions").doc(`tx-claim-req-${investmentId}`);
      transaction.set(logRef, {
        id: `tx-claim-req-${investmentId}`,
        userId,
        investmentId,
        amount: payoutAmount,
        type: "CLAIM_REQUEST",
        status: "PENDING",
        description: `Requested payout approval for ${record.optionName}. Total Expected: ₦${payoutAmount.toLocaleString()}`,
        createdAt: now.toISOString(),
      });

      return {
        record: { ...record, ...updatedRecord } as InvestmentRecord,
        estimatedPayout: payoutAmount,
      };
    });

    return result;
  }

  /**
   * Admin approves a pending payout claim and credits the user's wallet atomically inside a transaction.
   */
  static async approveInvestmentClaim(adminId: string, investmentId: string): Promise<{ record: InvestmentRecord; creditedAmount: number }> {
    const investRef = adminDb.collection("investments").doc(investmentId);

    const result = await adminDb.runTransaction(async (transaction) => {
      const doc = await transaction.get(investRef);
      if (!doc.exists) {
        throw new Error("The specified investment record was not found.");
      }

      const record = doc.data() as InvestmentRecord;
      if (record.status === "CLAIMED") {
        throw new Error("This investment payout has already been approved and credited.");
      }
      if (record.status === "CANCELLED") {
        throw new Error("This investment was cancelled and cannot be claimed.");
      }
      if (record.status !== "CLAIM_REQUESTED") {
        const isMatured = new Date() >= new Date(record.maturityDate);
        if (!isMatured) {
          throw new Error("Cannot approve payout for an investment that is not matured.");
        }
      }

      const now = new Date();
      const elapsedMs = now.getTime() - new Date(record.startDate).getTime();
      const elapsedDays = Math.max(1, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));

      const earnedInterest = this.calculateInterest(
        record.amount,
        record.interestRate,
        elapsedDays,
        record.interestType,
        record.durationDays
      );

      const payoutAmount = Number((record.amount + earnedInterest).toFixed(2));

      // Credit user's wallet atomically
      await WalletService.creditWallet(transaction, {
        userId: record.userId,
        amount: payoutAmount,
        currency: record.currency || "NGN",
        reference: `claim-approved-${investmentId}`,
        description: `Matured Investment Payout Approved: ${record.optionName} (Principal: ₦${record.amount}, Interest: ₦${earnedInterest})`,
        recipientName: "Self",
        fee: 0,
      });

      const updatedRecord: Partial<InvestmentRecord> = {
        status: "CLAIMED",
        accumulatedInterest: earnedInterest,
        totalValue: payoutAmount,
        claimApprovedAt: now.toISOString(),
        claimApprovedBy: adminId,
        updatedAt: now.toISOString(),
      };

      transaction.update(investRef, updatedRecord);

      // Log claim approval in investment transactions
      const logRef = adminDb.collection("investmentTransactions").doc(`tx-claim-appr-${investmentId}`);
      transaction.set(logRef, {
        id: `tx-claim-appr-${investmentId}`,
        userId: record.userId,
        investmentId,
        amount: payoutAmount,
        type: "CLAIM_APPROVED",
        status: "SUCCESS",
        description: `Administrator approved matured payout for ${record.optionName}. Credited ₦${payoutAmount.toLocaleString()}`,
        createdAt: now.toISOString(),
      });

      // Write audit log
      const auditRef = adminDb.collection("auditLogs").doc(`audit-approve-claim-${investmentId}`);
      transaction.set(auditRef, {
        id: `audit-approve-claim-${investmentId}`,
        userId: record.userId,
        adminId,
        action: "INVESTMENT_CLAIM_APPROVED",
        metadata: {
          investmentId,
          earnedInterest,
          payoutAmount,
        },
        version: "1.0",
        createdAt: now.toISOString(),
      });

      return {
        record: { ...record, ...updatedRecord } as InvestmentRecord,
        creditedAmount: payoutAmount,
      };
    });

    return result;
  }

  /**
   * Admin cancels an active investment on behalf of a user with full audit trail and atomic refund.
   */
  static async adminCancelInvestment(adminId: string, investmentId: string): Promise<{ record: InvestmentRecord; refundAmount: number; penaltyDeducted: number }> {
    const investRef = adminDb.collection("investments").doc(investmentId);
    const globalSettings = await this.getSettings();

    const result = await adminDb.runTransaction(async (transaction) => {
      const doc = await transaction.get(investRef);
      if (!doc.exists) {
        throw new Error("The specified investment record was not found.");
      }

      const record = doc.data() as InvestmentRecord;
      if (record.status !== "ACTIVE" && record.status !== "CLAIM_REQUESTED") {
        throw new Error(`Cannot cancel investment with status '${record.status}'. Only ACTIVE or CLAIM_REQUESTED investments can be cancelled.`);
      }

      const now = new Date();
      const elapsedMs = now.getTime() - new Date(record.startDate).getTime();
      const elapsedDays = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));

      const earnedInterest = this.calculateInterest(
        record.amount,
        record.interestRate,
        elapsedDays,
        record.interestType,
        record.durationDays
      );

      const penaltyRateToApply = record.earlyWithdrawalPenaltyRateSnapshot !== undefined
        ? Number(record.earlyWithdrawalPenaltyRateSnapshot)
        : globalSettings.penaltyRate;

      const penaltyDeducted = Number((record.amount * penaltyRateToApply).toFixed(2));
      const grossAmount = record.amount + earnedInterest;
      const refundAmount = Math.max(0, Number((grossAmount - penaltyDeducted).toFixed(2)));

      // Credit user's wallet with remaining net refund
      await WalletService.creditWallet(transaction, {
        userId: record.userId,
        amount: refundAmount,
        currency: record.currency || "NGN",
        reference: `admin-cancel-${investmentId}`,
        description: `Administrator Cancelled ${record.optionName} (Refund: ₦${refundAmount}, Penalty: ₦${penaltyDeducted})`,
        recipientName: "Self",
        fee: 0,
        walletType: record.walletType || "MAIN",
      });

      const updatedRecord: Partial<InvestmentRecord> = {
        status: "CANCELLED",
        accumulatedInterest: earnedInterest,
        totalValue: refundAmount,
        updatedAt: now.toISOString(),
      };

      transaction.update(investRef, updatedRecord);

      // Save transaction log in investments subledger
      const logRef = adminDb.collection("investmentTransactions").doc(`tx-admin-cancel-${investmentId}`);
      transaction.set(logRef, {
        id: `tx-admin-cancel-${investmentId}`,
        userId: record.userId,
        adminId,
        investmentId,
        amount: refundAmount,
        type: "ADMIN_CANCEL_INVESTMENT",
        status: "SUCCESS",
        description: `Administrator ${adminId} cancelled investment. Penalty ₦${penaltyDeducted.toLocaleString()} applied. Refunded ₦${refundAmount.toLocaleString()}`,
        createdAt: now.toISOString(),
      });

      // Write audit log
      const auditRef = adminDb.collection("auditLogs").doc(`audit-admin-cancel-${investmentId}`);
      transaction.set(auditRef, {
        id: `audit-admin-cancel-${investmentId}`,
        userId: record.userId,
        adminId,
        action: "ADMIN_INVESTMENT_CANCELLED",
        metadata: {
          investmentId,
          earnedInterest,
          penaltyDeducted,
          refundAmount,
          penaltyRateApplied: penaltyRateToApply,
        },
        version: "1.0",
        createdAt: now.toISOString(),
      });

      return {
        record: { ...record, ...updatedRecord } as InvestmentRecord,
        refundAmount,
        penaltyDeducted,
      };
    });

    try {
      await NotificationService.sendReversalNotification({
        userId: result.record.userId,
        reference: `admin-cancel-${investmentId}`,
        originalReference: investmentId,
        amount: result.refundAmount,
        currency: result.record.currency || "NGN",
        transactionLabel: "investment",
        recipientName: result.record.optionName,
      });
    } catch (notificationError: any) {
      console.warn("[Investment Reversal Notification] Admin cancellation notification failed:", notificationError?.message || notificationError);
    }

    return result;
  }

  /**
   * Admin blocks or unblocks a user from placing new investments.
   */
  static async setUserInvestmentBlock(adminId: string, userId: string, blocked: boolean): Promise<void> {
    if (!userId) throw new Error("User ID is required.");
    const userRef = adminDb.collection("users").doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new Error(`User document not found for ID: ${userId}`);
    }

    const now = new Date().toISOString();
    await userRef.update({
      isInvestmentBlocked: blocked,
      investmentBlockedAt: blocked ? now : null,
      investmentBlockedBy: blocked ? adminId : null,
      updatedAt: now,
    });

    await adminDb.collection("auditLogs").doc(`audit-block-invest-${userId}-${Date.now()}`).set({
      id: `audit-block-invest-${userId}-${Date.now()}`,
      userId,
      adminId,
      action: blocked ? "USER_INVESTMENT_BLOCKED" : "USER_INVESTMENT_UNBLOCKED",
      metadata: { userId, blocked },
      createdAt: now,
    });
  }

  /**
   * Cancel an active savings lock early with contractual penalty snapshot.
   */
  static async cancelInvestment(userId: string, investmentId: string): Promise<{ record: InvestmentRecord; refundAmount: number; penaltyDeducted: number }> {
    const investRef = adminDb.collection("investments").doc(investmentId);
    const globalSettings = await this.getSettings();

    const result = await adminDb.runTransaction(async (transaction) => {
      const doc = await transaction.get(investRef);
      if (!doc.exists) {
        throw new Error("The specified investment was not found.");
      }

      const record = doc.data() as InvestmentRecord;
      if (record.userId !== userId) {
        throw new Error("Forbidden: You do not own this investment lock.");
      }
      if (record.status !== "ACTIVE") {
        throw new Error(`Cannot cancel an investment with status '${record.status}'. Only ACTIVE investments can be liquidated early.`);
      }

      const now = new Date();

      // Calculate accrued interest up to cancellation time (capped at durationDays)
      const elapsedMs = now.getTime() - new Date(record.startDate).getTime();
      const elapsedDays = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));

      const earnedInterest = this.calculateInterest(
        record.amount,
        record.interestRate,
        elapsedDays,
        record.interestType,
        record.durationDays
      );

      // Use snapshotted contractual penalty rate (falling back to global settings for legacy documents)
      const penaltyRateToApply = record.earlyWithdrawalPenaltyRateSnapshot !== undefined
        ? Number(record.earlyWithdrawalPenaltyRateSnapshot)
        : globalSettings.penaltyRate;

      const penaltyDeducted = Number((record.amount * penaltyRateToApply).toFixed(2));
      const grossAmount = record.amount + earnedInterest;
      const refundAmount = Math.max(0, Number((grossAmount - penaltyDeducted).toFixed(2)));

      // Credit user's wallet with the remaining refund amount
      await WalletService.creditWallet(transaction, {
        userId,
        amount: refundAmount,
        currency: record.currency || "NGN",
        reference: `cancel-${investmentId}`,
        description: `Early Liquidation for ${record.optionName} (Refund: ₦${refundAmount}, Penalty: ₦${penaltyDeducted})`,
        recipientName: "Self",
        fee: 0,
      });

      // Update investment record state
      const updatedRecord: Partial<InvestmentRecord> = {
        status: "CANCELLED",
        accumulatedInterest: earnedInterest,
        totalValue: refundAmount,
        updatedAt: now.toISOString(),
      };

      transaction.update(investRef, updatedRecord);

      // Save transaction log in investments subledger
      const logRef = adminDb.collection("investmentTransactions").doc(`tx-cancel-${investmentId}`);
      transaction.set(logRef, {
        id: `tx-cancel-${investmentId}`,
        userId,
        investmentId,
        amount: refundAmount,
        type: "LIQUIDATE_EARLY",
        status: "SUCCESS",
        description: `Liquidated early. Penalty of ₦${penaltyDeducted.toLocaleString()} applied. Refunded: ₦${refundAmount.toLocaleString()}`,
        createdAt: now.toISOString(),
      });

      // Write audit log document
      const auditRef = adminDb.collection("auditLogs").doc(`audit-cancel-${investmentId}`);
      transaction.set(auditRef, {
        id: `audit-cancel-${investmentId}`,
        userId,
        action: "INVESTMENT_CANCELLED",
        metadata: {
          investmentId,
          earnedInterest,
          penaltyDeducted,
          refundAmount,
          penaltyRateApplied: penaltyRateToApply,
        },
        version: "1.0",
        createdAt: now.toISOString(),
      });

      return {
        record: { ...record, ...updatedRecord } as InvestmentRecord,
        refundAmount,
        penaltyDeducted,
      };
    });

    try {
      await NotificationService.sendReversalNotification({
        userId,
        reference: `cancel-${investmentId}`,
        originalReference: investmentId,
        amount: result.refundAmount,
        currency: result.record.currency || "NGN",
        transactionLabel: "investment",
        recipientName: result.record.optionName,
      });
    } catch (notificationError: any) {
      console.warn("[Investment Reversal Notification] User cancellation notification failed:", notificationError?.message || notificationError);
    }

    return result;
  }
}
