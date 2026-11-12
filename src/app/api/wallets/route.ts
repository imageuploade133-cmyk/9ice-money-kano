import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";
import { WalletService } from "@/services/wallet-service";
import { ReferralService } from "@/services/referral-service";

export async function GET(req: Request) {
  const reqId = `req-${Date.now()}-${Math.random().toString(36).slice(-4)}`;
  const startTime = Date.now();
  console.log(`[GET /api/wallets] [${reqId}] Received get-wallets request`);

  let uid = "";
  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
  } catch (err: any) {
    console.error(`[GET /api/wallets] [${reqId}] Auth failure: ${err.message}`);
    return NextResponse.json({ error: "Unauthorized: Invalid or missing authorization token." }, { status: 401 });
  }

  try {
    // --- AUTOMATIC SECURE REFERRAL CHECK ENGINE ---
    try {
      await ReferralService.checkAndProcessReferral(uid);
    } catch (refCheckErr: any) {
      console.error(`[Referral Check Engine Error] [${reqId}] Execution failed:`, refCheckErr.message);
    }

    // --- SELF-HEALING AUTO-REFUND ENGINE ---
    try {
      const failedTxQuery = await adminDb.collection("transactions")
        .where("userId", "==", uid)
        .where("status", "==", "FAILED")
        .get();

      const failedTxs = failedTxQuery.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);
      const debitTypes = ["TRANSFER", "WITHDRAWAL", "AIRTIME", "DATA", "BILLS", "INVESTMENT", "SWAP_DEBIT"];

      for (const tx of failedTxs) {
        if (!debitTypes.includes(tx.type)) continue;
        if (!tx.reference) continue;

        const refundRefId = `tx-REFUND-${tx.reference}`;

        // Process the refund atomically
        const txCurrency = tx.currency || "NGN";
        const origAmount = Number(tx.amount) || 0;
        const origFee = Number(tx.fee) || 0;
        const origMarkup = Number(tx.markup) || 0;
        const origVat = Number(tx.vat) || 0;
        const refundAmount = Number(tx.totalDebited) || (origAmount + origFee + origMarkup + origVat);

        console.log(`[Auto-Refund Engine] [${reqId}] Found unrefunded failed transaction [${tx.reference}] with total debited amount ₦${refundAmount}. Executing full refund...`);

        await adminDb.runTransaction(async (refundTransaction) => {
          const uRef = adminDb.collection("users").doc(uid);
          const wRef = adminDb.collection("wallets").doc(`${uid}_${txCurrency}`);
          const refundDocRef = adminDb.collection("transactions").doc(refundRefId);

          // The refund ledger is the single atomic idempotency/claim record shared
          // with gateway webhook and reconciliation refund paths.
          const [uSnap, wSnap, refundSnap] = await Promise.all([
            refundTransaction.get(uRef),
            refundTransaction.get(wRef),
            refundTransaction.get(refundDocRef)
          ]);

          if (refundSnap.exists) return;
          if (!uSnap.exists) return;

          const uData = uSnap.data() || {};
          const wBalance = wSnap.exists ? (Number(wSnap.data()?.balance) || 0) : 0;

          await WalletService.creditWallet(refundTransaction, {
            userId: uid,
            amount: origAmount > 0 ? origAmount : refundAmount,
            currency: txCurrency,
            reference: `REFUND-${tx.reference}`,
            docId: refundRefId,
            type: "REFUND",
            category: "REFUND",
            direction: "CREDIT",
            description: `Auto-Refund for failed ${tx.type.toLowerCase()}: ${tx.description || ""}`,
            recipientName: tx.recipientName || "System Refund",
            fee: origFee,
            markup: origMarkup,
            vat: origVat,
            totalCredited: refundAmount,
            beneficiaryName: tx.beneficiaryName || tx.recipientName,
            beneficiaryAccountNumber: tx.beneficiaryAccountNumber || tx.recipientAccountNumber,
            beneficiaryBankName: tx.beneficiaryBankName || tx.recipientBankName,
            beneficiaryBankCode: tx.beneficiaryBankCode || tx.recipientBankCode,
            preLoadedUser: {
              ref: uRef,
              data: uData,
              balance: Number(uData.balance) || 0
            },
            preLoadedWallet: {
              ref: wRef,
              data: wSnap.exists ? wSnap.data() || {} : {},
              balance: wBalance
            }
          });
        });

        console.log(`[Auto-Refund Engine] [${reqId}] Successfully processed refund for reference [${tx.reference}]`);
      }
    } catch (refundErr: any) {
      console.error(`[Auto-Refund Engine Error] [${reqId}] Execution failed:`, refundErr.message);
    }

    // 1. Get user profile as base
    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      console.warn(`[GET /api/wallets] [${reqId}] User profile not found for uid: ${uid}`);
      return NextResponse.json({ error: "User profile not found." }, { status: 404 });
    }

    const userData = userSnap.data() || {};
    const legacyBalance = typeof userData.balance === "number" ? userData.balance : 0.00;
    const legacyBonusBalance = typeof userData.bonusBalance === "number" ? userData.bonusBalance : 0.00;

    // Generate unique short account ID if not present
    let accountId = userData.accountId || "";
    if (!accountId) {
      const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      accountId = `ET-${code}`;
      await userRef.update({ accountId });
    }

    // 2. Fetch NGN, USD, and XOF wallets concurrently
    const ngnWalletRef = adminDb.collection("wallets").doc(`${uid}_NGN`);
    const usdWalletRef = adminDb.collection("wallets").doc(`${uid}_USD`);
    const xofWalletRef = adminDb.collection("wallets").doc(`${uid}_XOF`);

    const [ngnSnap, usdSnap, xofSnap] = await Promise.all([
      ngnWalletRef.get(),
      usdWalletRef.get(),
      xofWalletRef.get()
    ]);

    let ngnBalance = legacyBalance;
    let ngnBonusBalance = legacyBonusBalance;
    let ngnUpdatedAt = new Date().toISOString();
    let usdBalance = 0.00;
    let usdUpdatedAt = new Date().toISOString();
    let xofBalance = 0.00;
    let xofUpdatedAt = new Date().toISOString();

    // 3. Defensive initialization for NGN wallet
    if (!ngnSnap.exists) {
      console.log(`[GET /api/wallets] [${reqId}] Initializing missing NGN wallet document for uid: ${uid}`);
      await ngnWalletRef.set({
        userId: uid,
        currency: "NGN",
        balance: legacyBalance,
        bonusBalance: legacyBonusBalance,
        updatedAt: ngnUpdatedAt
      }, { merge: true });
    } else {
      const ngnData = ngnSnap.data() || {};
      ngnBalance = typeof ngnData.balance === "number" ? ngnData.balance : legacyBalance;
      ngnBonusBalance = typeof ngnData.bonusBalance === "number" ? ngnData.bonusBalance : legacyBonusBalance;
      ngnUpdatedAt = ngnData.updatedAt || ngnUpdatedAt;
    }

    // 4. Defensive initialization for USD wallet
    if (!usdSnap.exists) {
      console.log(`[GET /api/wallets] [${reqId}] Initializing missing USD wallet document for uid: ${uid}`);
      await usdWalletRef.set({
        userId: uid,
        currency: "USD",
        balance: 0.00,
        updatedAt: usdUpdatedAt
      }, { merge: true });
    } else {
      const usdData = usdSnap.data() || {};
      usdBalance = typeof usdData.balance === "number" ? usdData.balance : 0.00;
      usdUpdatedAt = usdData.updatedAt || usdUpdatedAt;
    }

    // 4.5. Defensive initialization for XOF wallet
    if (!xofSnap.exists) {
      console.log(`[GET /api/wallets] [${reqId}] Initializing missing XOF wallet document for uid: ${uid}`);
      await xofWalletRef.set({
        userId: uid,
        currency: "XOF",
        balance: 0.00,
        updatedAt: xofUpdatedAt
      }, { merge: true });
    } else {
      const xofData = xofSnap.data() || {};
      xofBalance = typeof xofData.balance === "number" ? xofData.balance : 0.00;
      xofUpdatedAt = xofData.updatedAt || xofUpdatedAt;
    }

    // 5. Keep legacy balance synchronized with NGN balance
    if (typeof userData.balance === "number" && typeof ngnBalance === "number" && userData.balance !== ngnBalance) {
      console.log(`[GET /api/wallets] [${reqId}] Balance mismatch detected: Profile legacy balance is ₦${userData.balance}, NGN Wallet balance is ₦${ngnBalance}`);

      // If profile balance was updated externally (e.g., via deposit webhook, manual top-up, or admin action),
      // we must update/credit the NGN wallet balance to match it, rather than rolling back the profile balance.
      console.log(`[GET /api/wallets] [${reqId}] Synchronizing NGN wallet balance to match profile balance: ₦${userData.balance}`);
      await ngnWalletRef.set({
        balance: userData.balance,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      ngnBalance = userData.balance;
    }

    if (typeof ngnBonusBalance === "number" && userData.bonusBalance !== ngnBonusBalance) {
      console.log(`[GET /api/wallets] [${reqId}] Synchronizing user profile bonusBalance to NGN wallet bonusBalance: ${ngnBonusBalance}`);
      await userRef.update({ bonusBalance: ngnBonusBalance });
    }

    console.log(`[GET /api/wallets] [${reqId}] Wallet balances retrieved in ${Date.now() - startTime}ms. NGN: ₦${ngnBalance}, USD: $${usdBalance}, XOF: CFA${xofBalance}, BONUS: ₦${ngnBonusBalance}`);

    return NextResponse.json({
      success: true,
      accountId,
      wallets: {
        NGN: {
          userId: uid,
          currency: "NGN",
          balance: ngnBalance,
          updatedAt: ngnUpdatedAt,
          bonusBalance: ngnBonusBalance
        },
        USD: {
          userId: uid,
          currency: "USD",
          balance: usdBalance,
          updatedAt: usdUpdatedAt
        },
        XOF: {
          userId: uid,
          currency: "XOF",
          balance: xofBalance,
          updatedAt: xofUpdatedAt
        },
        BONUS: {
          userId: uid,
          currency: "NGN",
          balance: ngnBonusBalance,
          updatedAt: new Date().toISOString()
        }
      }
    });

  } catch (error: any) {
    console.error(`[GET /api/wallets] [${reqId}] Unexpected exception:`, error);
    return NextResponse.json({
      error: "Internal server error retrieving wallet balances.",
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
