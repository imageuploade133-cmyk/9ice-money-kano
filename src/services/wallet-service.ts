import { adminDb } from "@/lib/firebase-admin";
import { FieldValue, Transaction } from "firebase-admin/firestore";

export interface TransactionRecord {
  id?: string;
  userId: string;
  amount: number;
  currency: string;
  reference: string;
  flwId?: string | null;
  type: "DEPOSIT" | "WITHDRAWAL" | "TRANSFER" | "INVESTMENT" | "AIRTIME" | "DATA" | "BILLS" | "SWAP_DEBIT" | "SWAP_CREDIT" | "CASHOUT" | "CARD_FUND" | "STORE_PURCHASE" | "REFUND" | "VIRTUAL_ACCOUNT_DEPOSIT" | "GLOBAL_DEDUCTION" | "DEBT_RECOVERY" | string;
  category?: string;
  direction?: "CREDIT" | "DEBIT";
  description: string;
  narration?: string;
  recipientName?: string;
  status: "SUCCESS" | "FAILED" | "PENDING" | "REFUND" | string;
  date: string;
  time: string;
  fee: number;
  vat?: number;
  markup?: number;
  totalDebited?: number;
  totalCredited?: number;
  provider?: string;
  providerReference?: string;
  providerTransactionId?: string;
  sessionId?: string;
  createdAt: string;
  completedAt?: string;
  walletType?: "MAIN" | "BONUS";

  // Bank transfer
  beneficiaryName?: string;
  beneficiaryAccountNumber?: string;
  beneficiaryBankName?: string;
  beneficiaryBankCode?: string;

  // Deposit
  fundingMethod?: string;
  virtualAccountNumber?: string;
  virtualAccountBankName?: string;
  senderName?: string;
  senderAccountNumber?: string;
  senderBankName?: string;

  // Airtime / Data
  network?: string;
  phoneNumber?: string;
  itemCode?: string;
  itemName?: string;
  planName?: string;

  // Bills
  billerCode?: string;
  billerName?: string;
  billerType?: string;
  customerId?: string;
  customerName?: string;

  // Electricity
  meterNumber?: string;
  meterType?: string;
  token?: string;

  // Cable
  smartcardNumber?: string;
  packageName?: string;

  // Swap
  sourceCurrency?: string;
  sourceAmount?: number;
  destinationCurrency?: string;
  destinationAmount?: number;
  exchangeRate?: number;

  // Metadata
  metadata?: Record<string, unknown>;
}

let globalLimitsCache: Record<string, any> | null = null;
let globalLimitsCacheTime = 0;

async function getCachedTierLimits(): Promise<Record<string, any>> {
  const now = Date.now();
  if (globalLimitsCache && now - globalLimitsCacheTime < 60000) {
    return globalLimitsCache;
  }
  try {
    const docSnap = await adminDb.collection("config").doc("app").get();
    if (docSnap.exists) {
      globalLimitsCache = docSnap.data() || {};
      globalLimitsCacheTime = now;
      return globalLimitsCache;
    }
  } catch (err) {
    console.warn("[WalletService] Failed to load config/app for limits, using defaults:", err);
  }
  return {};
}

export class WalletService {
  /**
   * Validates a transaction amount.
   * Ensures it is a positive number, not NaN, and doesn't have more than 2 decimal places.
   */
  static validateAmount(amount: number): void {
    if (typeof amount !== "number" || isNaN(amount)) {
      throw new Error("Amount must be a valid number.");
    }
    if (amount <= 0) {
      throw new Error("Amount must be greater than zero.");
    }
    const amountStr = amount.toString();
    if (amountStr.includes(".")) {
      const decimals = amountStr.split(".")[1];
      if (decimals.length > 2) {
        throw new Error("Amount cannot have more than 2 decimal places.");
      }
    }
  }

  /**
   * Validates a currency code.
   */
  static validateCurrency(currency: string): void {
    const uc = (currency || "").toUpperCase();
    const allowed = ["NGN", "USD", "EUR", "GBP", "GHS", "KES", "XOF", "XAF", "CAD", "ZAR", "TZS", "UGX", "RWF", "ZMW"];
    if (!allowed.includes(uc)) {
      throw new Error(`Unsupported currency: ${currency}. Supported currencies include: ${allowed.join(", ")}.`);
    }
  }

  /**
   * Validates target user document and extracts current balance.
   */
  static async getUserProfile(transaction: Transaction, userId: string) {
    if (!userId || typeof userId !== "string") {
      throw new Error("Invalid or empty User ID.");
    }
    const userDocRef = adminDb.collection("users").doc(userId);
    const userDoc = await transaction.get(userDocRef);

    if (!userDoc.exists) {
      throw new Error(`User profile not found for ID: ${userId}`);
    }

    const data = userDoc.data() || {};
    return {
      ref: userDocRef,
      data,
      balance: Number(data.balance) || 0,
    };
  }

  /**
   * Safely credits a user's wallet and records the ledger transaction inside a Firestore Transaction.
   */
  static async creditWallet(
    transaction: Transaction,
    params: {
      userId: string;
      amount: number;
      currency: string;
      reference: string;
      flwId?: string;
      docId?: string;
      description: string;
      recipientName: string;
      fee?: number;
      type?: TransactionRecord["type"];
      walletType?: "MAIN" | "BONUS";
      category?: string;
      direction?: "CREDIT" | "DEBIT";
      narration?: string;
      vat?: number;
      markup?: number;
      totalDebited?: number;
      totalCredited?: number;
      provider?: string;
      providerReference?: string;
      providerTransactionId?: string;
      sessionId?: string;
      completedAt?: string;
      beneficiaryName?: string;
      beneficiaryAccountNumber?: string;
      beneficiaryBankName?: string;
      beneficiaryBankCode?: string;
      fundingMethod?: string;
      virtualAccountNumber?: string;
      virtualAccountBankName?: string;
      senderName?: string;
      senderAccountNumber?: string;
      senderBankName?: string;
      network?: string;
      phoneNumber?: string;
      itemCode?: string;
      itemName?: string;
      planName?: string;
      billerCode?: string;
      billerName?: string;
      billerType?: string;
      customerId?: string;
      customerName?: string;
      meterNumber?: string;
      meterType?: string;
      token?: string;
      smartcardNumber?: string;
      packageName?: string;
      sourceCurrency?: string;
      sourceAmount?: number;
      destinationCurrency?: string;
      destinationAmount?: number;
      exchangeRate?: number;
      metadata?: Record<string, unknown>;
      preLoadedUser?: {
        ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
        data: FirebaseFirestore.DocumentData;
        balance: number;
      };
      preLoadedWallet?: {
        ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
        data: FirebaseFirestore.DocumentData;
        balance: number;
      };
    }
  ): Promise<{ previousBalance: number; newBalance: number }> {
    const { userId, amount, currency, reference, flwId, docId, description, recipientName, fee = 0, type = "DEPOSIT", walletType = "MAIN", preLoadedUser, preLoadedWallet } = params;

    const ucCurrency = (currency || "NGN").toUpperCase();

    // Strict validation
    this.validateAmount(amount);
    this.validateCurrency(ucCurrency);

    const isBonus = walletType === "BONUS";

    // 1. ALL READS: Must be executed before any writes
    const walletRef = adminDb.collection("wallets").doc(`${userId}_${ucCurrency}`);
    let currentBalance = 0;
    if (preLoadedWallet) {
      currentBalance = isBonus
        ? (preLoadedWallet.data?.bonusBalance !== undefined ? Number(preLoadedWallet.data.bonusBalance) : 0.00)
        : preLoadedWallet.balance;
    } else {
      const walletDoc = await transaction.get(walletRef);
      const wData = walletDoc.data() || {};
      currentBalance = walletDoc.exists
        ? (isBonus ? (wData.bonusBalance !== undefined ? Number(wData.bonusBalance) : 0.00) : (Number(wData.balance) || 0))
        : (isBonus ? 0.00 : 0);
    }

    // Load user profile before executing any writes if currency is NGN
    let user = null;
    if (ucCurrency === "NGN") {
      user = preLoadedUser || (await this.getUserProfile(transaction, userId));
    }

    // AUTOMATIC INFLOW FEE / STAMP DUTY LOGIC (FOR NGN MAIN WALLET DEPOSITS)
    let autoInflowFee = 0;
    let autoInflowNarration = "";
    const isDepositType = type === "DEPOSIT" || type === "VIRTUAL_ACCOUNT_DEPOSIT" || type === "WALLET_FUNDING";

    if (ucCurrency === "NGN" && !isBonus && isDepositType) {
      const appConfig = await getCachedTierLimits();
      const autoInflowConfig = appConfig.autoInflowDeduction;
      if (autoInflowConfig?.enabled) {
        const minThreshold = Number(autoInflowConfig.minThreshold) || 1000;
        if (amount >= minThreshold) {
          if (autoInflowConfig.chargeType === "PERCENTAGE") {
            let pFee = (amount * Number(autoInflowConfig.feeAmount || 0)) / 100;
            const maxCap = Number(autoInflowConfig.maxFeeCap) || 0;
            if (maxCap > 0 && pFee > maxCap) pFee = maxCap;
            autoInflowFee = Math.round(pFee * 100) / 100;
          } else {
            autoInflowFee = Number(autoInflowConfig.feeAmount) || 0;
          }
          autoInflowNarration = autoInflowConfig.feeNarration || "Stamp Duty Charge";
        }
      }
    }

    // AUTOMATIC DEBT RECOVERY LOGIC (FOR NGN MAIN WALLET DEPOSITS/CREDITS)
    let debtRecovered = 0;
    let netBalanceIncrement = 0;

    const feeNum = Number(fee) || 0;
    const vatNum = Number(params.vat) || 0;
    const grossCreditAmount = params.totalCredited !== undefined && params.totalCredited !== null && Number(params.totalCredited) > 0
      ? Number(params.totalCredited)
      : (amount + feeNum + vatNum);

    // Apply auto inflow fee deduction to net credit amount
    const creditAmount = Math.max(0, grossCreditAmount - autoInflowFee);

    if (ucCurrency === "NGN" && !isBonus && user) {
      const currentDebt = Math.max(0, Number(user.data.outstandingDebt) || 0);
      if (currentDebt > 0 && creditAmount > 0) {
        debtRecovered = Math.min(creditAmount, currentDebt);
        netBalanceIncrement = creditAmount - debtRecovered;
      } else {
        netBalanceIncrement = creditAmount;
      }
    } else {
      netBalanceIncrement = creditAmount;
    }

    const newBalance = currentBalance + netBalanceIncrement;

    // TIER LIMIT & BALANCE CAP ENFORCEMENT (FOR NGN MAIN WALLET CREDITS)
    const userUpdates: Record<string, any> = {};

    if (ucCurrency === "NGN" && !isBonus && user) {
      const appConfig = await getCachedTierLimits();
      const userTier = String(user.data.tier || (user.data.kycStatus === "VERIFIED" ? "Tier 2" : "Tier 1"));

      const hasCustom = user.data.hasCustomLimits === true;

      // 1. Max Account Balance Cap
      let maxBalanceCap = 0;
      if (hasCustom && typeof user.data.maxAccountBalance === "number" && Number(user.data.maxAccountBalance) > 0) {
        maxBalanceCap = Number(user.data.maxAccountBalance);
      } else if (userTier === "Tier 3") {
        maxBalanceCap = typeof appConfig.tier3MaxBalance === "number" ? appConfig.tier3MaxBalance : 50000000;
      } else if (userTier === "Tier 2") {
        maxBalanceCap = typeof appConfig.tier2MaxBalance === "number" ? appConfig.tier2MaxBalance : 5000000;
      } else {
        maxBalanceCap = typeof appConfig.tier1MaxBalance === "number" ? appConfig.tier1MaxBalance : 300000;
      }

      const isDepositType = type === "DEPOSIT" || type === "VIRTUAL_ACCOUNT_DEPOSIT" || type === "WALLET_FUNDING";
      const isAdminBypass = params.metadata?.isAdminDeposit === true || params.metadata?.wasHeldReleased === true;
      let isLimitExceeded = false;
      let limitExceededReason = "";

      if (!isAdminBypass && maxBalanceCap > 0 && newBalance > maxBalanceCap) {
        isLimitExceeded = true;
        limitExceededReason = `Account balance limit exceeded for ${userTier}. Maximum allowed balance is ₦${maxBalanceCap.toLocaleString()}.`;
      }

      // 2. Daily Deposit / Inflow Cap
      if (!isAdminBypass && !isLimitExceeded && isDepositType && !user.data.unlimitedDeposits) {
        let dailyDepositCap = 0;
        if (hasCustom && typeof user.data.dailyDepositLimit === "number" && Number(user.data.dailyDepositLimit) > 0) {
          dailyDepositCap = Number(user.data.dailyDepositLimit);
        } else if (userTier === "Tier 3") {
          dailyDepositCap = typeof appConfig.tier3DailyDepositLimit === "number" ? appConfig.tier3DailyDepositLimit : (typeof appConfig.tier3DailyLimit === "number" ? appConfig.tier3DailyLimit : 50000000);
        } else if (userTier === "Tier 2") {
          dailyDepositCap = typeof appConfig.tier2DailyDepositLimit === "number" ? appConfig.tier2DailyDepositLimit : (typeof appConfig.tier2DailyLimit === "number" ? appConfig.tier2DailyLimit : 5000000);
        } else {
          dailyDepositCap = typeof appConfig.tier1DailyDepositLimit === "number" ? appConfig.tier1DailyDepositLimit : 500000;
        }

        if (dailyDepositCap > 0) {
          const resetWindowHours = typeof appConfig.dailyResetWindowHours === "number" && appConfig.dailyResetWindowHours > 0 ? appConfig.dailyResetWindowHours : 24;
          const cutoffTime = Date.now() - resetWindowHours * 3600 * 1000;
          const lastDepositTime = user.data.lastDepositDate ? new Date(user.data.lastDepositDate).getTime() : 0;
          const currentDepositTotal = (lastDepositTime >= cutoffTime) ? (Number(user.data.todayDepositTotal) || 0) : 0;

          if (currentDepositTotal + creditAmount > dailyDepositCap) {
            isLimitExceeded = true;
            limitExceededReason = `Daily deposit limit of ₦${dailyDepositCap.toLocaleString()} exceeded for ${userTier}. Cumulative deposit in ${resetWindowHours}-hour window: ₦${currentDepositTotal.toLocaleString()}.`;
          } else {
            userUpdates.todayDepositTotal = currentDepositTotal + creditAmount;
            userUpdates.lastDepositDate = new Date().toISOString();
          }
        }
      }

      // IF DEPOSIT LIMIT OR BALANCE CAP EXCEEDED: Safely hold funds without crediting spendable balance
      if (isLimitExceeded) {
        // Record HELD transaction in general ledger so user and admin see transaction history
        const ledgerDocId = docId || `tx-${reference}`;
        const ledgerRef = adminDb.collection("transactions").doc(ledgerDocId);
        const heldRecord: TransactionRecord = {
          userId,
          amount,
          currency: ucCurrency,
          reference,
          flwId: flwId || null,
          type,
          category: params.category || "DEPOSIT",
          direction: "CREDIT",
          description: description || "Deposit Held Safely",
          narration: params.narration || limitExceededReason,
          recipientName,
          status: "HELD_LIMIT_EXCEEDED",
          date: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
          time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          fee,
          vat: params.vat,
          markup: params.markup,
          totalDebited: params.totalDebited,
          totalCredited: 0,
          provider: params.provider,
          providerReference: params.providerReference || flwId || undefined,
          providerTransactionId: params.providerTransactionId,
          sessionId: params.sessionId,
          createdAt: new Date().toISOString(),
          walletType,
          senderName: params.senderName,
          senderAccountNumber: params.senderAccountNumber,
          senderBankName: params.senderBankName,
          virtualAccountNumber: params.virtualAccountNumber,
          virtualAccountBankName: params.virtualAccountBankName,
          metadata: {
            ...params.metadata,
            isHeldDeposit: true,
            heldAmount: creditAmount,
            heldReason: limitExceededReason,
            heldAt: new Date().toISOString(),
          },
        };

        Object.keys(heldRecord).forEach(
          (key) => (heldRecord as any)[key] === undefined && delete (heldRecord as any)[key]
        );

        transaction.set(ledgerRef, heldRecord);

        // Update user state to mark depositLimitExceeded = true
        transaction.update(user.ref, {
          depositLimitExceeded: true,
          heldDepositCount: FieldValue.increment(1),
          updatedAt: new Date().toISOString(),
        });

        return {
          previousBalance: currentBalance,
          newBalance: currentBalance,
        };
      }
    }

    // 2. ALL WRITES: Execute all updates, sets, and creations sequentially at the end
    // Update specific wallet balance atomically
    if (isBonus) {
      transaction.set(walletRef, {
        userId,
        currency: ucCurrency,
        bonusBalance: FieldValue.increment(creditAmount),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      if (ucCurrency === "NGN" && user) {
        transaction.update(user.ref, {
          bonusBalance: FieldValue.increment(creditAmount),
        });
      }
    } else {
      transaction.set(walletRef, {
        userId,
        currency: ucCurrency,
        balance: FieldValue.increment(netBalanceIncrement),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      if (ucCurrency === "NGN" && user) {
        userUpdates.balance = FieldValue.increment(netBalanceIncrement);
        if (debtRecovered > 0) {
          userUpdates.outstandingDebt = FieldValue.increment(-debtRecovered);
        }
        transaction.update(user.ref, userUpdates);
      }
    }

    // Record debt recovery ledger transaction if debt was recovered
    if (debtRecovered > 0) {
      const debtTxRef = `recovery-${reference}`;
      const debtTxDocRef = adminDb.collection("transactions").doc(`tx-${debtTxRef}`);
      transaction.set(debtTxDocRef, {
        userId,
        amount: debtRecovered,
        currency: ucCurrency,
        reference: debtTxRef,
        type: "DEBT_RECOVERY",
        category: "DEDUCTION",
        direction: "DEBIT",
        description: `Automatic Recovery for Outstanding Debt (₦${debtRecovered.toLocaleString()})`,
        recipientName: "System Recovery",
        status: "SUCCESS",
        date: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
        time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        fee: 0,
        totalDebited: debtRecovered,
        totalCredited: 0,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        metadata: {
          fundingReference: reference,
          recoveredAmount: debtRecovered,
          originalAmount: creditAmount,
        },
      });
    }

    // Record transaction in general ledger
    const ledgerDocId = docId || `tx-${reference}`;
    const ledgerRef = adminDb.collection("transactions").doc(ledgerDocId);
    const combinedFee = fee + autoInflowFee;
    const ledgerRecord: TransactionRecord = {
      userId,
      amount, // Preserve principal transfer amount (e.g. 5000)
      currency: ucCurrency,
      reference,
      flwId: flwId || null,
      type,
      category: params.category,
      direction: params.direction || "CREDIT",
      description,
      narration: autoInflowFee > 0 ? `${params.narration || description} (Includes ${autoInflowNarration}: ₦${autoInflowFee})` : params.narration,
      recipientName,
      status: "SUCCESS",
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      fee: combinedFee,
      vat: params.vat,
      markup: params.markup,
      totalDebited: params.totalDebited,
      totalCredited: creditAmount, // Record full credited total after auto inflow fee
      provider: params.provider,
      providerReference: params.providerReference || flwId || undefined,
      providerTransactionId: params.providerTransactionId,
      sessionId: params.sessionId,
      createdAt: new Date().toISOString(),
      completedAt: params.completedAt || new Date().toISOString(),
      walletType,

      beneficiaryName: params.beneficiaryName,
      beneficiaryAccountNumber: params.beneficiaryAccountNumber,
      beneficiaryBankName: params.beneficiaryBankName,
      beneficiaryBankCode: params.beneficiaryBankCode,

      fundingMethod: params.fundingMethod,
      virtualAccountNumber: params.virtualAccountNumber,
      virtualAccountBankName: params.virtualAccountBankName,
      senderName: params.senderName,
      senderAccountNumber: params.senderAccountNumber,
      senderBankName: params.senderBankName,

      network: params.network,
      phoneNumber: params.phoneNumber,
      itemCode: params.itemCode,
      itemName: params.itemName,
      planName: params.planName,

      billerCode: params.billerCode,
      billerName: params.billerName,
      billerType: params.billerType,
      customerId: params.customerId,
      customerName: params.customerName,

      meterNumber: params.meterNumber,
      meterType: params.meterType,
      token: params.token,

      smartcardNumber: params.smartcardNumber,
      packageName: params.packageName,

      sourceCurrency: params.sourceCurrency,
      sourceAmount: params.sourceAmount,
      destinationCurrency: params.destinationCurrency,
      destinationAmount: params.destinationAmount,
      exchangeRate: params.exchangeRate,

      metadata: {
        ...params.metadata,
        ...(autoInflowFee > 0 ? {
          autoInflowFee,
          autoInflowNarration,
          grossAmount: grossCreditAmount,
          netAmount: creditAmount,
        } : {}),
      },
    };

    // Filter out undefined keys before writing to Firestore
    Object.keys(ledgerRecord).forEach(
      (key) => (ledgerRecord as any)[key] === undefined && delete (ledgerRecord as any)[key]
    );

    transaction.set(ledgerRef, ledgerRecord);

    // Trigger async referral check for deposit credits
    if (isDepositType && ucCurrency === "NGN") {
      import("./referral-service").then(({ ReferralService }) => {
        ReferralService.checkAndProcessReferral(userId).catch((err) => {
          console.error("[WalletService] Async checkAndProcessReferral error:", err);
        });
      });
    }

    return {
      previousBalance: currentBalance,
      newBalance,
    };
  }

  /**
   * Safely debits a user's wallet and records the ledger transaction inside a Firestore Transaction.
   */
  static async debitWallet(
    transaction: Transaction,
    params: {
      userId: string;
      amount: number;
      currency: string;
      reference: string;
      docId?: string;
      type: TransactionRecord["type"];
      description: string;
      recipientName: string;
      fee?: number;
      isPending?: boolean; // If true, sets status to PENDING instead of SUCCESS
      walletType?: "MAIN" | "BONUS";
      category?: string;
      direction?: "CREDIT" | "DEBIT";
      narration?: string;
      vat?: number;
      markup?: number;
      totalDebited?: number;
      totalCredited?: number;
      provider?: string;
      providerReference?: string;
      providerTransactionId?: string;
      sessionId?: string;
      completedAt?: string;
      beneficiaryName?: string;
      beneficiaryAccountNumber?: string;
      beneficiaryBankName?: string;
      beneficiaryBankCode?: string;
      fundingMethod?: string;
      virtualAccountNumber?: string;
      virtualAccountBankName?: string;
      senderName?: string;
      senderAccountNumber?: string;
      senderBankName?: string;
      network?: string;
      phoneNumber?: string;
      itemCode?: string;
      itemName?: string;
      planName?: string;
      billerCode?: string;
      billerName?: string;
      billerType?: string;
      customerId?: string;
      customerName?: string;
      meterNumber?: string;
      meterType?: string;
      token?: string;
      smartcardNumber?: string;
      packageName?: string;
      sourceCurrency?: string;
      sourceAmount?: number;
      destinationCurrency?: string;
      destinationAmount?: number;
      exchangeRate?: number;
      metadata?: Record<string, unknown>;
      preLoadedUser?: {
        ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
        data: FirebaseFirestore.DocumentData;
        balance: number;
      };
      preLoadedWallet?: {
        ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
        data: FirebaseFirestore.DocumentData;
        balance: number;
      };
    }
  ): Promise<{ previousBalance: number; newBalance: number }> {
    const { userId, amount, currency, reference, docId, type, description, recipientName, fee = 0, isPending = false, walletType = "MAIN", preLoadedUser, preLoadedWallet } = params;

    const ucCurrency = (currency || "NGN").toUpperCase();

    // Strict validation
    this.validateAmount(amount);
    this.validateCurrency(ucCurrency);

    const isBonus = walletType === "BONUS";

    // 1. ALL READS: Must be executed before any writes
    const walletRef = adminDb.collection("wallets").doc(`${userId}_${ucCurrency}`);
    let currentBalance = 0;
    if (preLoadedWallet) {
      currentBalance = isBonus
        ? (preLoadedWallet.data?.bonusBalance !== undefined ? Number(preLoadedWallet.data.bonusBalance) : 0.00)
        : preLoadedWallet.balance;
    } else {
      const walletDoc = await transaction.get(walletRef);
      const wData = walletDoc.data() || {};
      currentBalance = walletDoc.exists
        ? (isBonus ? (wData.bonusBalance !== undefined ? Number(wData.bonusBalance) : 0.00) : (Number(wData.balance) || 0))
        : (isBonus ? 0.00 : 0);
    }

    // Load user profile before executing any writes if currency is NGN
    let user = null;
    if (ucCurrency === "NGN") {
      user = preLoadedUser || (await this.getUserProfile(transaction, userId));
    }

    // 2. ALL WRITES: Execute all updates, sets, and creations sequentially at the end
    const feeNum = Number(fee) || 0;
    const vatNum = Number(params.vat) || 0;
    const totalDeduction = amount + feeNum + vatNum;

    // Enforce outstanding debt check for NGN main wallet debits so indebted users cannot spend or transfer funds
    const outstandingDebt = (ucCurrency === "NGN" && !isBonus && user)
      ? Math.max(0, Number(user.data.outstandingDebt) || 0)
      : 0;

    const spendableBalance = Math.max(0, currentBalance - outstandingDebt);

    if (spendableBalance < totalDeduction) {
      throw new Error(
        outstandingDebt > 0
          ? `Insufficient spendable balance due to an outstanding debt obligation of ₦${outstandingDebt.toLocaleString()}. Spendable Balance: ₦${spendableBalance.toLocaleString()}, Required: ₦${totalDeduction.toLocaleString()}`
          : `Insufficient ${isBonus ? "bonus reward" : "wallet"} funds to complete this ${type.toLowerCase()}. Required: ${ucCurrency === "NGN" ? "₦" : "$"}${totalDeduction}, Available: ${ucCurrency === "NGN" ? "₦" : "$"}${currentBalance}`
      );
    }

    const userUpdates: Record<string, any> = {};

    // TIER LIMIT ENFORCEMENT (FOR NGN MAIN WALLET DEBITS / TRANSFERS)
    if (ucCurrency === "NGN" && !isBonus && user) {
      const isTransferType = type === "TRANSFER" || type === "CASHOUT" || type === "WITHDRAWAL";
      if (isTransferType && !user.data.unlimitedTransfers) {
        const appConfig = await getCachedTierLimits();
        const userTier = String(user.data.tier || (user.data.kycStatus === "VERIFIED" ? "Tier 2" : "Tier 1"));

        const hasCustom = user.data.hasCustomLimits === true;

        // 1. Single Transfer Cap
        let singleTransferCap = 0;
        if (hasCustom && typeof user.data.maxSingleTransferLimit === "number" && Number(user.data.maxSingleTransferLimit) > 0) {
          singleTransferCap = Number(user.data.maxSingleTransferLimit);
        } else if (userTier === "Tier 3") {
          singleTransferCap = typeof appConfig.tier3SingleTransferLimit === "number" ? appConfig.tier3SingleTransferLimit : (typeof appConfig.tier3SingleLimit === "number" ? appConfig.tier3SingleLimit : 10000000);
        } else if (userTier === "Tier 2") {
          singleTransferCap = typeof appConfig.tier2SingleTransferLimit === "number" ? appConfig.tier2SingleTransferLimit : (typeof appConfig.tier2SingleLimit === "number" ? appConfig.tier2SingleLimit : 2000000);
        } else {
          singleTransferCap = typeof appConfig.tier1SingleTransferLimit === "number" ? appConfig.tier1SingleTransferLimit : 200000;
        }

        if (singleTransferCap > 0 && amount > singleTransferCap) {
          throw new Error(`Single transfer amount of ₦${amount.toLocaleString()} exceeds your single transaction limit of ₦${singleTransferCap.toLocaleString()} for ${userTier}. Please upgrade your account tier or contact Support for assistance.`);
        }

        // 2. Daily Transfer Cap
        let dailyTransferCap = 0;
        if (hasCustom) {
          const customDaily = Number(user.data.dailyTransferLimit ?? user.data.dailyLimit);
          if (typeof customDaily === "number" && customDaily > 0) {
            dailyTransferCap = customDaily;
          }
        }

        if (!dailyTransferCap || dailyTransferCap <= 0) {
          if (userTier === "Tier 3") {
            dailyTransferCap = typeof appConfig.tier3DailyTransferLimit === "number" ? appConfig.tier3DailyTransferLimit : (typeof appConfig.tier3DailyLimit === "number" ? appConfig.tier3DailyLimit : 50000000);
          } else if (userTier === "Tier 2") {
            dailyTransferCap = typeof appConfig.tier2DailyTransferLimit === "number" ? appConfig.tier2DailyTransferLimit : (typeof appConfig.tier2DailyLimit === "number" ? appConfig.tier2DailyLimit : 5000000);
          } else {
            dailyTransferCap = typeof appConfig.tier1DailyTransferLimit === "number" ? appConfig.tier1DailyTransferLimit : 500000;
          }
        }

        if (dailyTransferCap > 0) {
          const resetWindowHours = typeof appConfig.dailyResetWindowHours === "number" && appConfig.dailyResetWindowHours > 0 ? appConfig.dailyResetWindowHours : 24;
          const cutoffTime = Date.now() - resetWindowHours * 3600 * 1000;
          const lastTransferTime = user.data.lastTransferDate ? new Date(user.data.lastTransferDate).getTime() : 0;
          const currentTransferTotal = (lastTransferTime >= cutoffTime) ? (Number(user.data.todayTransferTotal) || 0) : 0;

          if (currentTransferTotal + totalDeduction > dailyTransferCap) {
            throw new Error(`Daily transfer limit of ₦${dailyTransferCap.toLocaleString()} exceeded for ${userTier}. Cumulative transfer in ${resetWindowHours}-hour window: ₦${currentTransferTotal.toLocaleString()}. Please upgrade your account tier or contact Support for assistance.`);
          }

          userUpdates.todayTransferTotal = currentTransferTotal + totalDeduction;
          userUpdates.lastTransferDate = new Date().toISOString();
        }
      }
    }

    const newBalance = currentBalance - totalDeduction;

    // Update specific wallet balance atomically
    if (isBonus) {
      transaction.set(walletRef, {
        userId,
        currency: ucCurrency,
        bonusBalance: FieldValue.increment(-totalDeduction),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      if (ucCurrency === "NGN" && user) {
        transaction.update(user.ref, {
          bonusBalance: FieldValue.increment(-totalDeduction),
        });
      }
    } else {
      transaction.set(walletRef, {
        userId,
        currency: ucCurrency,
        balance: FieldValue.increment(-totalDeduction),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      if (ucCurrency === "NGN" && user) {
        userUpdates.balance = FieldValue.increment(-totalDeduction);
        transaction.update(user.ref, userUpdates);
      }
    }

    // Record transaction in general ledger
    const ledgerDocId = docId || `tx-${reference}`;
    const ledgerRef = adminDb.collection("transactions").doc(ledgerDocId);
    const ledgerRecord: TransactionRecord = {
      userId,
      amount,
      currency: ucCurrency,
      reference,
      type,
      category: params.category,
      direction: params.direction || "DEBIT",
      description,
      narration: params.narration,
      recipientName,
      status: isPending ? "PENDING" : "SUCCESS",
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      fee,
      vat: params.vat,
      markup: params.markup,
      totalDebited: params.totalDebited ?? totalDeduction,
      totalCredited: params.totalCredited,
      provider: params.provider,
      providerReference: params.providerReference,
      providerTransactionId: params.providerTransactionId,
      sessionId: params.sessionId,
      createdAt: new Date().toISOString(),
      completedAt: isPending ? undefined : (params.completedAt || new Date().toISOString()),
      walletType,

      beneficiaryName: params.beneficiaryName,
      beneficiaryAccountNumber: params.beneficiaryAccountNumber,
      beneficiaryBankName: params.beneficiaryBankName,
      beneficiaryBankCode: params.beneficiaryBankCode,

      fundingMethod: params.fundingMethod,
      virtualAccountNumber: params.virtualAccountNumber,
      virtualAccountBankName: params.virtualAccountBankName,
      senderName: params.senderName,
      senderAccountNumber: params.senderAccountNumber,
      senderBankName: params.senderBankName,

      network: params.network,
      phoneNumber: params.phoneNumber,
      itemCode: params.itemCode,
      itemName: params.itemName,
      planName: params.planName,

      billerCode: params.billerCode,
      billerName: params.billerName,
      billerType: params.billerType,
      customerId: params.customerId,
      customerName: params.customerName,

      meterNumber: params.meterNumber,
      meterType: params.meterType,
      token: params.token,

      smartcardNumber: params.smartcardNumber,
      packageName: params.packageName,

      sourceCurrency: params.sourceCurrency,
      sourceAmount: params.sourceAmount,
      destinationCurrency: params.destinationCurrency,
      destinationAmount: params.destinationAmount,
      exchangeRate: params.exchangeRate,

      metadata: params.metadata,
    };

    // Filter out undefined keys before writing to Firestore
    Object.keys(ledgerRecord).forEach(
      (key) => (ledgerRecord as any)[key] === undefined && delete (ledgerRecord as any)[key]
    );

    transaction.set(ledgerRef, ledgerRecord);

    return {
      previousBalance: currentBalance,
      newBalance,
    };
  }
}
