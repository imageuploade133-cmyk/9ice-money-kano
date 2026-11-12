import { adminDb, hasAdminCredentials } from "@/lib/firebase-admin";
import { WalletService } from "@/services/wallet-service";
import { CardItem, CardTransaction, BillingAddress } from "@/types/cards";
import { logPaymentEvent } from "@/lib/payment-logger";
import { safeParseJson } from "@/lib/utils";
import { randomUUID } from "crypto";
import { getGatewayUrl } from "@/lib/gateway-util";

const GATEWAY_URL = getGatewayUrl();

export class CardService {
  /**
   * Safe create/issue card:
   * 1. If mock mode or sandbox simulation: bypass gateway call or simulate S2S call.
   * 2. Deduct setup fee from corresponding currency wallet inside a Firestore transaction.
   * 3. Make S2S card creation API call to VM Payment Gateway.
   * 4. Atomically record card document in users -> cards subcollection and refund if S2S fails.
   */
  static async createCard(params: {
    userId: string;
    currency: "NGN" | "USD";
    amount: number; // initial funding amount
    billingAddress: BillingAddress;
    cardholder: string;
    idToken: string;
    sessionId: string;
    isMock?: boolean;
  }): Promise<CardItem> {
    const { userId, currency, amount, billingAddress, cardholder, idToken, sessionId, isMock = false } = params;
    const startTime = Date.now();
    const cardId = `card-${randomUUID()}`;
    const txRef = `vc-init-${randomUUID()}`;

    // Define setup costs (USD card setup cost $2.00, NGN card zero setup)
    const setupCost = currency === "USD" ? 2.00 : 0.00;
    const totalDeduction = amount + setupCost;

    const userRef = adminDb.collection("users").doc(userId);
    const walletRef = adminDb.collection("wallets").doc(`${userId}_${currency}`);

    loggerInfo(`[CardService] Initiating Card Issuing for User ${userId}. Currency: ${currency}, InitFund: ${amount}, TotalDeduction: ${totalDeduction}`);

    const runMock = isMock || !hasAdminCredentials;

    if (!runMock) {
      // Validate wallet balance & debit atomically first
      await adminDb.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
          throw new Error("User profile not found.");
        }

        const walletDoc = await transaction.get(walletRef);
        const walletBalance = walletDoc.exists ? (Number(walletDoc.data()?.balance) || 0) : 0;

        if (walletBalance < totalDeduction) {
          throw new Error(`Insufficient wallet balance in ${currency} to fund card and pay setup fee. Required: ${currency === "NGN" ? "₦" : "$"}${totalDeduction.toLocaleString()}, Available: ${currency === "NGN" ? "₦" : "$"}${walletBalance.toLocaleString()}`);
        }

        // Execute Wallet Debit
        await WalletService.debitWallet(transaction, {
          userId,
          amount,
          currency,
          reference: txRef,
          type: "CARD_ISSUANCE",
          category: "CARD",
          description: `Virtual Card Issuing`,
          recipientName: `Virtual Card Issuing`,
          beneficiaryName: `Virtual Card Issuing`,
          fee: setupCost,
          totalDebited: totalDeduction,
          preLoadedUser: {
            ref: userRef,
            data: userDoc.data() || {},
            balance: Number(userDoc.data()?.balance) || 0,
          },
          preLoadedWallet: {
            ref: walletRef,
            data: walletDoc.exists ? walletDoc.data() || {} : {},
            balance: walletBalance,
          },
        });
      });
    }

    let flwCardId = cardId;
    let maskedPan = currency === "NGN" ? "506148******4829" : "415088******6354";
    let lastFour = currency === "NGN" ? "4829" : "6354";
    let expiry = "12/29";
    let brand = currency === "NGN" ? "mastercard" : "visa";

    if (runMock) {
      loggerInfo(`[CardService] Mock execution simulated for User ${userId}`);
    } else {
      // Execute S2S Call to VM Payment Gateway
      try {
        const payload = {
          currency,
          amount,
          billing_name: cardholder,
          billing_address: billingAddress.address,
          billing_city: billingAddress.city,
          billing_state: billingAddress.state,
          billing_postal_code: billingAddress.postalCode,
          billing_country: billingAddress.country,
          first_name: cardholder.split(" ")[0] || "E-Global",
          last_name: cardholder.split(" ")[1] || "Tech",
          email: `${userId}@etechglobal.org`,
          phone: "07000000000"
        };

        const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY || "";
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (gatewayApiKey) {
          headers["X-API-Key"] = gatewayApiKey;
        }
        if (idToken || gatewayApiKey) {
          headers["Authorization"] = `Bearer ${idToken || gatewayApiKey}`;
        if (sessionId) headers["X-Session-ID"] = sessionId;
        }

        const res = await fetch(`${GATEWAY_URL}/api/flutterwave/cards`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        const data = await safeParseJson(res);
        if (res.ok && data.status === "success" && data.data) {
          flwCardId = data.data.id;
          maskedPan = data.data.masked_pan || maskedPan;
          lastFour = maskedPan.slice(-4);
          expiry = data.data.expiration || expiry;
          brand = data.data.card_type || brand;
        } else {
          throw new Error(data.message || "Payment Gateway S2S rejected card issuance.");
        }
      } catch (err: any) {
        loggerError(`[CardService] Gateway Card Issuance failed. Performing automatic rollback refund. Details: ${err.message}`);

        // Atomically refund wallet
        await adminDb.runTransaction(async (rollbackTx) => {
          const userDoc = await rollbackTx.get(userRef);
          const walletDoc = await rollbackTx.get(walletRef);
          const currentBal = walletDoc.exists ? (Number(walletDoc.data()?.balance) || 0) : 0;

          // Update the original transaction document to FAILED
          const origTxRef = adminDb.collection("transactions").doc(`tx-${txRef}`);
          rollbackTx.update(origTxRef, { status: "FAILED" });

          await WalletService.creditWallet(rollbackTx, {
            userId,
            amount,
            currency,
            reference: `REFUND-${txRef}`,
            description: `Refund for Failed Virtual Card Issuing`,
            recipientName: `Virtual Card Issuing`,
            beneficiaryName: `Virtual Card Issuing`,
            fee: setupCost,
            totalCredited: totalDeduction,
            type: "REFUND",
            category: "CARD",
            direction: "CREDIT",
            metadata: {
              originalTransactionId: `tx-${txRef}`,
              originalTransactionType: "CARD_ISSUANCE",
              originalOperation: "Virtual Card Issuing",
              originalReference: txRef,
            },
            preLoadedUser: {
              ref: userRef,
              data: userDoc.exists ? userDoc.data() || {} : {},
              balance: userDoc.exists ? (Number(userDoc.data()?.balance) || 0) : 0,
            },
            preLoadedWallet: {
              ref: walletRef,
              data: walletDoc.exists ? walletDoc.data() || {} : {},
              balance: currentBal,
            },
          });
        });

        throw new Error(`Virtual Card creation rejected by Flutterwave: ${err.message}. Your wallet has been refunded.`);
      }
    }

    // Save Virtual Card to Firestore subcollection users -> cards
    const cardData: CardItem = {
      id: cardId,
      cardId: flwCardId,
      userId,
      currency,
      maskedPan,
      expiry,
      cardholder,
      theme: currency === "NGN" ? "sunset" : "obsidian",
      isLocked: false,
      frozen: false,
      terminated: false,
      balance: amount,
      lastFour,
      brand,
      cardType: "VIRTUAL",
      fundingWallet: currency,
      provider: "FLUTTERWAVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      billingAddress
    };

    if (!runMock) {
      await adminDb.collection("users").doc(userId).collection("cards").doc(cardId).set(cardData);

      // Record dynamic notification
      await adminDb.collection("notifications").add({
        userId,
        title: "Card Created",
        message: `Your E-Tech Virtual ${currency} Card (${lastFour}) has been successfully issued and funded with ${currency === "NGN" ? "₦" : "$"}${amount.toLocaleString()}`,
        read: false,
        createdAt: new Date().toISOString(),
      });

      logPaymentEvent({
        category: "Wallet Debited",
        userId,
        tx_ref: txRef,
        amount: totalDeduction,
        currency,
        message: `Successfully processed Card Issuance Setup & Funding`,
        processingTimeMs: Date.now() - startTime,
      });
    }

    return cardData;
  }

  /**
   * Fund active virtual card:
   * 1. Read card and user wallets from Firestore.
   * 2. Debit corresponding wallet atomically inside a transaction.
   * 3. Call S2S gateway to fund the virtual card.
   * 4. Perform atomic rollback if S2S call fails.
   */
  static async fundCard(params: {
    userId: string;
    cardId: string;
    amount: number;
    idToken: string;
    sessionId: string;
    isMock?: boolean;
  }): Promise<any> {
    const { userId, cardId, amount, idToken, sessionId, isMock = false } = params;
    const txRef = `vc-fund-${randomUUID()}`;

    const runMock = isMock || !hasAdminCredentials;

    let cardData: CardItem = {
      id: cardId,
      cardId: "mock-id",
      userId,
      currency: "USD",
      maskedPan: "415088******6354",
      expiry: "12/29",
      cardholder: "JULES VERNE",
      theme: "obsidian",
      isLocked: false,
      frozen: false,
      terminated: false,
      balance: 150.00,
      lastFour: "6354",
      brand: "visa",
      cardType: "VIRTUAL",
      fundingWallet: "USD",
      provider: "FLUTTERWAVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const cardRef = adminDb.collection("users").doc(userId).collection("cards").doc(cardId);
    const operationLockRef = cardRef.collection("operation_locks").doc("active");
    if (!runMock) {
      const cardSnap = await cardRef.get();
      if (!cardSnap.exists) {
        throw new Error("Virtual Card not found.");
      }
      cardData = cardSnap.data() as CardItem;
      if (cardData.terminated) {
        throw new Error("This virtual card has been terminated.");
      }
      if (cardData.frozen || cardData.isLocked) {
        throw new Error("Card is frozen. Please activate or unfreeze before funding.");
      }
    }

    const currency = cardData.currency;
    const userRef = adminDb.collection("users").doc(userId);
    const walletRef = adminDb.collection("wallets").doc(`${userId}_${currency}`);

    if (!runMock) {
      // Atomically reserve this card for one funding operation and debit the wallet.
      await adminDb.runTransaction(async (transaction) => {
        const lockDoc = await transaction.get(operationLockRef);
        const existingLock = lockDoc.exists ? lockDoc.data() || {} : {};
        if (lockDoc.exists && Number(existingLock.expiresAt || 0) > Date.now()) {
          throw new Error("Another card funding operation is already in progress. Please wait and try again.");
        }
        const userDoc = await transaction.get(userRef);
        const walletDoc = await transaction.get(walletRef);
        const walletBalance = walletDoc.exists ? (Number(walletDoc.data()?.balance) || 0) : 0;

        if (walletBalance < amount) {
          throw new Error(`Insufficient wallet balance to fund virtual card. Required: ${currency === "NGN" ? "₦" : "$"}${amount.toLocaleString()}, Available: ${currency === "NGN" ? "₦" : "$"}${walletBalance.toLocaleString()}`);
        }

        transaction.set(operationLockRef, {
          reference: txRef,
          operation: "FUND",
          expiresAt: Date.now() + 10 * 60 * 1000,
          createdAt: new Date().toISOString(),
        });

        await WalletService.debitWallet(transaction, {
          userId,
          amount,
          currency,
          reference: txRef,
          type: "CARD_FUND",
          category: "CARD",
          description: `Virtual Card Funding (${cardData.lastFour})`,
          recipientName: `Virtual Card Funding`,
          beneficiaryName: `Virtual Card Funding`,
          totalDebited: amount,
          preLoadedUser: {
            ref: userRef,
            data: userDoc.data() || {},
            balance: Number(userDoc.data()?.balance) || 0,
          },
          preLoadedWallet: {
            ref: walletRef,
            data: walletDoc.exists ? walletDoc.data() || {} : {},
            balance: walletBalance,
          },
        });
      });

      try {
        const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY || "";
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (gatewayApiKey) {
          headers["X-API-Key"] = gatewayApiKey;
        }
        if (idToken || gatewayApiKey) {
          headers["Authorization"] = `Bearer ${idToken || gatewayApiKey}`;
        }
        if (sessionId) headers["X-Session-ID"] = sessionId;

        const res = await fetch(`${GATEWAY_URL}/api/flutterwave/cards/${cardData.cardId}/fund`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            amount,
            debit_currency: currency,
          }),
        });

        const data = await safeParseJson(res);
        if (!res.ok || data.status !== "success") {
          throw new Error(data.message || "Failed to fund card on rails.");
        }
      } catch (err: any) {
        loggerError(`[CardService] Gateway funding failed. Rolling back debit. Error: ${err.message}`);

        await adminDb.runTransaction(async (rollbackTx) => {
          const userDoc = await rollbackTx.get(userRef);
          const walletDoc = await rollbackTx.get(walletRef);
          const currentBal = walletDoc.exists ? (Number(walletDoc.data()?.balance) || 0) : 0;

          rollbackTx.delete(operationLockRef);

          // Update the original transaction document to FAILED
          const origTxRef = adminDb.collection("transactions").doc(`tx-${txRef}`);
          rollbackTx.update(origTxRef, { status: "FAILED" });

          await WalletService.creditWallet(rollbackTx, {
            userId,
            amount,
            currency,
            reference: `REFUND-${txRef}`,
            description: `Refund for Failed Virtual Card Funding`,
            recipientName: `Virtual Card Funding`,
            beneficiaryName: `Virtual Card Funding`,
            type: "REFUND",
            category: "CARD",
            direction: "CREDIT",
            totalCredited: amount,
            metadata: {
              originalTransactionId: `tx-${txRef}`,
              originalTransactionType: "CARD_FUND",
              originalOperation: "Virtual Card Funding",
              originalReference: txRef,
            },
            preLoadedUser: {
              ref: userRef,
              data: userDoc.exists ? userDoc.data() || {} : {},
              balance: userDoc.exists ? (Number(userDoc.data()?.balance) || 0) : 0,
            },
            preLoadedWallet: {
              ref: walletRef,
              data: walletDoc.exists ? walletDoc.data() || {} : {},
              balance: currentBal,
            },
          });
        });

        throw new Error(`Funding rejected: ${err.message}. Your wallet has been refunded.`);
      }
    }

    const nextBalance = cardData.balance + amount;

    if (!runMock) {
      // Finalize balance atomically and release the card operation lease.
      await adminDb.runTransaction(async (transaction) => {
        const currentCardSnap = await transaction.get(cardRef);
        const lockSnap = await transaction.get(operationLockRef);
        const currentCard = currentCardSnap.data() as CardItem | undefined;
        const lock = lockSnap.data() || {};
        if (!currentCardSnap.exists || currentCard?.terminated) {
          throw new Error("Virtual Card is no longer available.");
        }
        if (!lockSnap.exists || lock.reference !== txRef) {
          throw new Error("Card funding operation lease was lost. Reconciliation is required before retrying.");
        }
        transaction.update(cardRef, {
          balance: Number(currentCard?.balance || 0) + amount,
          updatedAt: new Date().toISOString(),
        });
        transaction.delete(operationLockRef);
      });

      // Record local transaction
      await cardRef.collection("card_transactions").add({
        id: txRef,
        cardId: cardData.cardId,
        amount,
        currency,
        description: "Card Funding via Wallet Transfer",
        merchant: "Wallet Load",
        status: "SUCCESSFUL",
        type: "CREDIT",
        fee: 0,
        createdAt: new Date().toISOString(),
      });

      await adminDb.collection("notifications").add({
        userId,
        title: "Card Funded",
        message: `Your Virtual ${currency} Card (${cardData.lastFour}) has been funded with ${currency === "NGN" ? "₦" : "$"}${amount.toLocaleString()}`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    return { success: true, balance: nextBalance };
  }

  /**
   * Withdraw funds from virtual card back to corresponding wallet:
   * 1. Check card balance.
   * 2. Call S2S gateway to withdraw from Flutterwave Card.
   * 3. Atomically credit wallet inside a transaction.
   */
  static async withdrawFromCard(params: {
    userId: string;
    cardId: string;
    amount: number;
    idToken: string;
    sessionId: string;
    isMock?: boolean;
  }): Promise<any> {
    const { userId, cardId, amount, idToken, sessionId, isMock = false } = params;
    const txRef = `vc-withdraw-${randomUUID()}`;

    const runMock = isMock || !hasAdminCredentials;

    let cardData: CardItem = {
      id: cardId,
      cardId: "mock-id",
      userId,
      currency: "USD",
      maskedPan: "415088******6354",
      expiry: "12/29",
      cardholder: "JULES VERNE",
      theme: "obsidian",
      isLocked: false,
      frozen: false,
      terminated: false,
      balance: 150.00,
      lastFour: "6354",
      brand: "visa",
      cardType: "VIRTUAL",
      fundingWallet: "USD",
      provider: "FLUTTERWAVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const cardRef = adminDb.collection("users").doc(userId).collection("cards").doc(cardId);
    const operationLockRef = cardRef.collection("operation_locks").doc("active");
    if (!runMock) {
      const cardSnap = await cardRef.get();
      if (!cardSnap.exists) {
        throw new Error("Virtual Card not found.");
      }
      cardData = cardSnap.data() as CardItem;
      if (cardData.terminated) {
        throw new Error("This virtual card has been terminated.");
      }
      if (cardData.balance < amount) {
        throw new Error(`Insufficient card balance to withdraw. Required: ${cardData.currency === "NGN" ? "₦" : "$"}${amount.toLocaleString()}, Available: ${cardData.currency === "NGN" ? "₦" : "$"}${cardData.balance.toLocaleString()}`);
      }
    }

    const currency = cardData.currency;
    const userRef = adminDb.collection("users").doc(userId);
    const walletRef = adminDb.collection("wallets").doc(`${userId}_${currency}`);

    if (!runMock) {
      await adminDb.runTransaction(async (transaction) => {
        const lockDoc = await transaction.get(operationLockRef);
        const existingLock = lockDoc.exists ? lockDoc.data() || {} : {};
        if (lockDoc.exists && Number(existingLock.expiresAt || 0) > Date.now()) {
          throw new Error("Another card operation is already in progress. Please wait and try again.");
        }
        transaction.set(operationLockRef, {
          reference: txRef,
          operation: "WITHDRAW",
          expiresAt: Date.now() + 10 * 60 * 1000,
          createdAt: new Date().toISOString(),
        });
      });

      try {
        const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY || "";
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (gatewayApiKey) {
          headers["X-API-Key"] = gatewayApiKey;
        }
        if (idToken || gatewayApiKey) {
          headers["Authorization"] = `Bearer ${idToken || gatewayApiKey}`;
        }
        if (sessionId) headers["X-Session-ID"] = sessionId;

        const res = await fetch(`${GATEWAY_URL}/api/flutterwave/cards/${cardData.cardId}/withdraw`, {
          method: "POST",
          headers,
          body: JSON.stringify({ amount }),
        });

        const data = await safeParseJson(res);
        if (!res.ok || data.status !== "success") {
          throw new Error(data.message || "Failed to withdraw from card on rails.");
        }
      } catch (err: any) {
        throw new Error(`Card withdrawal failed on payment gateway rails: ${err.message}`);
      }

      // Perform atomic wallet credit + current card balance decrement + lease release.
      const nextBalance = cardData.balance - amount;
      await adminDb.runTransaction(async (transaction) => {
        const currentCardSnap = await transaction.get(cardRef);
        const lockSnap = await transaction.get(operationLockRef);
        const currentCard = currentCardSnap.data() as CardItem | undefined;
        const lock = lockSnap.data() || {};
        if (!currentCardSnap.exists || currentCard?.terminated) {
          throw new Error("Virtual Card is no longer available.");
        }
        if (!lockSnap.exists || lock.reference !== txRef) {
          throw new Error("Card withdrawal operation lease was lost. Reconciliation is required before retrying.");
        }
        const lockedCard = currentCard!;
        if (Number(lockedCard.balance || 0) < amount) {
          throw new Error("Insufficient current card balance to complete withdrawal.");
        }

        const userDoc = await transaction.get(userRef);
        const walletDoc = await transaction.get(walletRef);
        const walletBalance = walletDoc.exists ? (Number(walletDoc.data()?.balance) || 0) : 0;

        await WalletService.creditWallet(transaction, {
          userId,
          amount,
          currency,
          reference: txRef,
          description: `Withdrew from Virtual Card (${cardData.lastFour}): ${currency} ${amount}`,
          recipientName: `Wallet Balance`,
          type: "DEPOSIT",
          preLoadedUser: {
            ref: userRef,
            data: userDoc.exists ? userDoc.data() || {} : {},
            balance: userDoc.exists ? (Number(userDoc.data()?.balance) || 0) : 0,
          },
          preLoadedWallet: {
            ref: walletRef,
            data: walletDoc.exists ? walletDoc.data() || {} : {},
            balance: walletBalance,
          },
        });

        transaction.update(cardRef, {
          balance: Number(lockedCard.balance || 0) - amount,
          updatedAt: new Date().toISOString(),
        });
        transaction.delete(operationLockRef);
      });

      // Record local transaction
      await cardRef.collection("card_transactions").add({
        id: txRef,
        cardId: cardData.cardId,
        amount,
        currency,
        description: "Card Withdrawal to Wallet",
        merchant: "Wallet Settlement",
        status: "SUCCESSFUL",
        type: "DEBIT",
        fee: 0,
        createdAt: new Date().toISOString(),
      });

      await adminDb.collection("notifications").add({
        userId,
        title: "Card Withdrawal",
        message: `Successfully withdrew ${currency === "NGN" ? "₦" : "$"}${amount.toLocaleString()} from card (${cardData.lastFour}) to your wallet.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    const nextBalance = cardData.balance - amount;
    return { success: true, balance: nextBalance };
  }

  /**
   * Freeze/Unfreeze block status on virtual card:
   */
  static async toggleFreeze(params: {
    userId: string;
    cardId: string;
    isLocked: boolean; // next status
    idToken: string;
    sessionId: string;
    isMock?: boolean;
  }): Promise<any> {
    const { userId, cardId, isLocked, idToken, sessionId, isMock = false } = params;
    const runMock = isMock || !hasAdminCredentials;

    const cardRef = adminDb.collection("users").doc(userId).collection("cards").doc(cardId);
    let cardData: any = { lastFour: "6354" };

    if (!runMock) {
      const cardSnap = await cardRef.get();
      if (!cardSnap.exists) {
        throw new Error("Virtual Card not found.");
      }
      cardData = cardSnap.data() as CardItem;

      try {
        const action = isLocked ? "block" : "unblock";
        const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY || "";
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (gatewayApiKey) {
          headers["X-API-Key"] = gatewayApiKey;
        }
        if (idToken || gatewayApiKey) {
          headers["Authorization"] = `Bearer ${idToken || gatewayApiKey}`;
        }
        if (sessionId) headers["X-Session-ID"] = sessionId;

        const res = await fetch(`${GATEWAY_URL}/api/flutterwave/cards/${cardData.cardId}/status`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ status_action: action }),
        });

        const data = await safeParseJson(res);
        if (!res.ok || data.status !== "success") {
          throw new Error(data.message || "Failed to update freeze status on gateway rails.");
        }
      } catch (err: any) {
        throw new Error(`Failed to change card status: ${err.message}`);
      }

      await cardRef.update({
        isLocked,
        frozen: isLocked,
        updatedAt: new Date().toISOString(),
      });

      await adminDb.collection("notifications").add({
        userId,
        title: isLocked ? "Card Frozen" : "Card Activated",
        message: `Your Virtual Card (${cardData.lastFour}) has been ${isLocked ? "temporarily frozen" : "successfully activated"}.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    return { success: true, isLocked };
  }

  /**
   * Terminate/Close virtual card:
   */
  static async terminateCard(params: {
    userId: string;
    cardId: string;
    idToken: string;
    sessionId: string;
    isMock?: boolean;
  }): Promise<any> {
    const { userId, cardId, idToken, sessionId, isMock = false } = params;
    const runMock = isMock || !hasAdminCredentials;

    const cardRef = adminDb.collection("users").doc(userId).collection("cards").doc(cardId);
    const operationLockRef = cardRef.collection("operation_locks").doc("active");

    if (!runMock) {
      const cardSnap = await cardRef.get();
      if (!cardSnap.exists) {
        throw new Error("Virtual Card not found.");
      }
      const cardData = cardSnap.data() as CardItem;

      await adminDb.runTransaction(async (transaction) => {
        const lockDoc = await transaction.get(operationLockRef);
        const existingLock = lockDoc.exists ? lockDoc.data() || {} : {};
        if (lockDoc.exists && Number(existingLock.expiresAt || 0) > Date.now()) {
          throw new Error("Another card operation is already in progress. Please wait and try again.");
        }
        transaction.set(operationLockRef, {
          reference: `vc-term-${randomUUID()}`,
          operation: "TERMINATE",
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          createdAt: new Date().toISOString(),
        });
      });

      try {
        const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY || "";
        const headers: Record<string, string> = {};
        if (gatewayApiKey) {
          headers["X-API-Key"] = gatewayApiKey;
        }
        if (idToken || gatewayApiKey) {
          headers["Authorization"] = `Bearer ${idToken || gatewayApiKey}`;
        }
        if (sessionId) headers["X-Session-ID"] = sessionId;

        const res = await fetch(`${GATEWAY_URL}/api/flutterwave/cards/${cardData.cardId}/terminate`, {
          method: "PUT",
          headers,
        });

        const data = await safeParseJson(res);
        if (!res.ok || data.status !== "success" || !data.data) {
          throw new Error(data.message || "Failed to terminate card on gateway rails.");
        }
      } catch (err: any) {
        throw new Error(`Failed to terminate card on rails: ${err.message}`);
      }

      // Refund and terminate in one Firestore transaction using the operation lease.
      const refundAmount = cardData.balance;
      const currency = cardData.currency;
      const userRef = adminDb.collection("users").doc(userId);
      const walletRef = adminDb.collection("wallets").doc(`${userId}_${currency}`);

      await adminDb.runTransaction(async (transaction) => {
        const currentCardSnap = await transaction.get(cardRef);
        const lockSnap = await transaction.get(operationLockRef);
        const currentCard = currentCardSnap.data() as CardItem | undefined;
        const lock = lockSnap.data() || {};

        if (!currentCardSnap.exists) {
          throw new Error("Virtual Card not found.");
        }
        if (currentCard?.terminated) {
          throw new Error("Virtual Card is already terminated.");
        }
        if (!lockSnap.exists || !lock.reference || lock.operation !== "TERMINATE") {
          throw new Error("Card termination operation lease was lost. Reconciliation is required.");
        }

        const currentRefundAmount = Number(currentCard!.balance || 0);
        if (currentRefundAmount > 0) {
          const userDoc = await transaction.get(userRef);
          const walletDoc = await transaction.get(walletRef);
          const walletBalance = walletDoc.exists ? (Number(walletDoc.data()?.balance) || 0) : 0;

          await WalletService.creditWallet(transaction, {
            userId,
            amount: currentRefundAmount,
            currency,
            reference: `vc-term-refund-${lock.reference}`,
            description: `Virtual Card (${currentCard!.lastFour}) Termination Balance Refund`,
            recipientName: "Wallet Balance",
            type: "DEPOSIT",
            preLoadedUser: {
              ref: userRef,
              data: userDoc.exists ? userDoc.data() || {} : {},
              balance: userDoc.exists ? (Number(userDoc.data()?.balance) || 0) : 0,
            },
            preLoadedWallet: {
              ref: walletRef,
              data: walletDoc.exists ? walletDoc.data() || {} : {},
              balance: walletBalance,
            },
          });
        }

        transaction.update(cardRef, {
          terminated: true,
          balance: 0,
          updatedAt: new Date().toISOString(),
        });
        transaction.delete(operationLockRef);
      });

      await adminDb.collection("notifications").add({
        userId,
        title: "Card Terminated",
        message: `Your Virtual Card (${cardData.lastFour}) has been terminated. Outstanding balance of ${cardData.currency === "NGN" ? "₦" : "$"}${refundAmount.toLocaleString()} was successfully refunded to your wallet.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    return { success: true };
  }

  /**
   * Secure Retrieve Card Number, Expiry, CVV from Flutterwave
   * Protected with strict S2S secure requests.
   */
  static async getSecureDetails(params: {
    userId: string;
    cardId: string;
    idToken: string;
    sessionId: string;
    isMock?: boolean;
  }): Promise<any> {
    const { userId, cardId, idToken, sessionId, isMock = false } = params;
    const runMock = isMock || !hasAdminCredentials;

    if (runMock) {
      return {
        cardNumber: "4150 8829 1104 6354",
        expiry: "12/29",
        cvv: "394",
        cardholder: "JULES VERNE",
      };
    }

    const cardRef = adminDb.collection("users").doc(userId).collection("cards").doc(cardId);
    const cardSnap = await cardRef.get();
    if (!cardSnap.exists) {
      throw new Error("Virtual Card not found.");
    }
    const cardData = cardSnap.data() as CardItem;

    try {
      const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY || "";
      const headers: Record<string, string> = {};
      if (gatewayApiKey) {
        headers["X-API-Key"] = gatewayApiKey;
      }
      if (idToken || gatewayApiKey) {
        headers["Authorization"] = `Bearer ${idToken || gatewayApiKey}`;
      }
      if (sessionId) headers["X-Session-ID"] = sessionId;

      const res = await fetch(`${GATEWAY_URL}/api/flutterwave/cards/${cardData.cardId}`, {
        headers,
      });

      const data = await safeParseJson(res);
      if (!res.ok || data.status !== "success" || !data.data) {
        throw new Error(data.message || "Failed to retrieve secure card details.");
      }

      return {
        cardNumber: data.data.card_pan,
        expiry: data.data.expiration,
        cvv: data.data.cvv,
        cardholder: data.data.name_on_card || cardData.cardholder,
      };
    } catch (err: any) {
      throw new Error(`S2S details lookup failed: ${err.message}`);
    }
  }

  /**
   * Fetch virtual card transactions:
   */
  static async getCardTransactions(params: {
    userId: string;
    cardId: string;
    idToken: string;
    sessionId: string;
    isMock?: boolean;
  }): Promise<CardTransaction[]> {
    const { userId, cardId, idToken, sessionId, isMock = false } = params;
    const runMock = isMock || !hasAdminCredentials;

    if (runMock) {
      // Return beautiful mock transactions
      return [
        {
          id: "tx-1",
          cardId,
          amount: 15.00,
          currency: "USD",
          description: "Netflix Subscription",
          merchant: "Netflix",
          status: "SUCCESSFUL",
          type: "DEBIT",
          fee: 0,
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: "tx-2",
          cardId,
          amount: 9.00,
          currency: "USD",
          description: "Spotify Premium",
          merchant: "Spotify",
          status: "SUCCESSFUL",
          type: "DEBIT",
          fee: 0,
          createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: "tx-3",
          cardId,
          amount: 120.00,
          currency: "USD",
          description: "Google Cloud Settlement",
          merchant: "Google",
          status: "SUCCESSFUL",
          type: "DEBIT",
          fee: 0,
          createdAt: new Date(Date.now() - 172800000).toISOString(),
        },
        {
          id: "tx-4",
          cardId,
          amount: 50.00,
          currency: "USD",
          description: "Facebook Ads",
          merchant: "Facebook Ads",
          status: "SUCCESSFUL",
          type: "DEBIT",
          fee: 0,
          createdAt: new Date(Date.now() - 259200000).toISOString(),
        }
      ];
    }

    const cardRef = adminDb.collection("users").doc(userId).collection("cards").doc(cardId);
    const cardSnap = await cardRef.get();
    if (!cardSnap.exists) {
      throw new Error("Virtual Card not found.");
    }
    const cardData = cardSnap.data() as CardItem;

    try {
      // Try to read locally cached transactions first or combine with Flutterwave S2S
      const localSnap = await cardRef.collection("card_transactions").orderBy("createdAt", "desc").get();
      const localTxs = localSnap.docs.map(doc => doc.data() as CardTransaction);

      const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY || "";
      const headers: Record<string, string> = {};
      if (gatewayApiKey) {
        headers["X-API-Key"] = gatewayApiKey;
      }
      if (idToken || gatewayApiKey) {
        headers["Authorization"] = `Bearer ${idToken || gatewayApiKey}`;
      }
      if (sessionId) headers["X-Session-ID"] = sessionId;

      const res = await fetch(`${GATEWAY_URL}/api/flutterwave/cards/${cardData.cardId}/transactions`, {
        headers,
      });

      const data = await safeParseJson(res);
      if (res.ok && data.status === "success" && Array.isArray(data.data)) {
        const fetchedTxs: CardTransaction[] = data.data.map((flwTx: any) => ({
          id: flwTx.id?.toString() || flwTx.reference,
          cardId: cardData.cardId,
          amount: flwTx.amount,
          currency: flwTx.currency,
          description: flwTx.narration || "Card Purchase",
          merchant: flwTx.gateway_reference_details || "Online Merchant",
          status: flwTx.status?.toUpperCase() === "SUCCESSFUL" ? "SUCCESSFUL" : "FAILED",
          type: flwTx.indicator === "C" ? "CREDIT" : "DEBIT",
          fee: flwTx.fee || 0,
          createdAt: flwTx.created_at,
        }));

        // Merge and sort
        const map = new Map<string, CardTransaction>();
        [...localTxs, ...fetchedTxs].forEach(tx => map.set(tx.id, tx));
        return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }

      return localTxs;
    } catch (err) {
      loggerError(`[CardService] Error loading transactions: ${err}`);
      // Fallback to local
      const localSnap = await cardRef.collection("card_transactions").orderBy("createdAt", "desc").get();
      return localSnap.docs.map(doc => doc.data() as CardTransaction);
    }
  }
}

function loggerInfo(msg: string) {
  console.log(`[INFO] [CardService] ${msg}`);
}

function loggerError(msg: string) {
  console.error(`[ERROR] [CardService] ${msg}`);
}
