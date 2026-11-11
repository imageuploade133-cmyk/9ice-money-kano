import { NextResponse } from "next/server";
import { authenticateUserRequest, verifyUserKycApproved } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";
import { WalletService } from "@/services/wallet-service";
import { logPaymentEvent } from "@/lib/payment-logger";
import { NotificationService } from "@/services/notification-service";
import { calculateTransferMarkupFee, TransferTieredMarkup } from "@/lib/transfer-markup-util";
import { getGlobalMinTransferAmount } from "@/lib/global-limits-util";
import { resolveInternalUserByAccount } from "@/lib/user-resolver";
import bcrypt from "bcryptjs";
import { getGatewayUrl } from "@/lib/gateway-util";

interface BulkRecipient {
  amount: number;
  bankId?: string;
  bank_code?: string;
  bankCode?: string;
  accountBank?: string;
  account_bank?: string;
  accountNumber?: string;
  account_number?: string;
  recipientAccount?: string;
  narration?: string;
  reference?: string;
}

export async function POST(req: Request) {
  const startTime = Date.now();
  let uid = "";

  // 1. Authenticate user
  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
  } catch (authErr: unknown) {
    const error = authErr as Error;
    console.error("[Bulk Transfer Auth Error] Verification failed:", error.message);
    return NextResponse.json({ error: "Unauthorized: Invalid or missing token." }, { status: 401 });
  }

  // Enforce KYC verification
  const isApproved = await verifyUserKycApproved(uid);
  if (!isApproved) {
    return NextResponse.json({ error: "Forbidden: Account verification is required to perform financial transactions." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { title, recipients, bulk_data, pin } = body;

    const trfRecipients = (recipients || bulk_data) as BulkRecipient[] | undefined;

    const isBiometricReq = body.isBiometricAuthenticated === true || body.isBiometric === true;

    // Validations
    if (!trfRecipients || !Array.isArray(trfRecipients) || trfRecipients.length === 0) {
      return NextResponse.json({ error: "A list of transfer recipients is required." }, { status: 400 });
    }
    if (!isBiometricReq && !pin) {
      return NextResponse.json({ error: "Transaction PIN is required to authorize bulk transfers." }, { status: 400 });
    }

    const globalMinTransfer = await getGlobalMinTransferAmount();
    for (let i = 0; i < trfRecipients.length; i++) {
      const rec = trfRecipients[i];
      const recAmt = Number(rec.amount);
      if (isNaN(recAmt) || recAmt < globalMinTransfer) {
        return NextResponse.json({
          error: `Recipient #${i + 1} transfer amount (₦${isNaN(recAmt) ? "0" : recAmt.toLocaleString()}) is below the global minimum required transfer limit of ₦${globalMinTransfer.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
        }, { status: 400 });
      }
    }

    // Calculate total principal amount
    const totalAmt = trfRecipients.reduce((sum: number, rec: BulkRecipient) => sum + (Number(rec.amount) || 0), 0);

    if (isNaN(totalAmt) || totalAmt <= 0) {
      return NextResponse.json({ error: "Invalid total bulk transfer amount." }, { status: 400 });
    }

    const trfReference = `bulk-${Date.now()}-${uid.slice(-6)}`;
    const description = title || `Bulk outward transfer of ${trfRecipients.length} recipients`;

    const authHeader = req.headers.get("Authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : "";
    const sessionId = req.headers.get("X-Session-ID") || req.headers.get("x-session-id") || "";

    const isMock = uid === "mock-uid";

    // 2. Atomically verify PIN and debit user balance inside Firestore transaction
    const userRef = adminDb.collection("users").doc(uid);
    const walletRef = adminDb.collection("wallets").doc(`${uid}_NGN`);

    const transactionResult = await adminDb.runTransaction(async (transaction) => {
      // ALL READS: Execute all reads at the beginning of the transaction block
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error("USER_NOT_FOUND");
      }

      // Preload NGN wallet balance
      const walletDoc = await transaction.get(walletRef);
      const walletBalance = walletDoc.exists ? (Number(walletDoc.data()?.balance) || 0) : 0;

      const userData = userDoc.data() || {};

      // Server-side Account Freeze Check
      if (userData.isFrozen) {
        const freezeMsg = userData.freezeMessage || "Dear Customer please Contact Us or Visit Our Office for assistance";
        return {
          success: false,
          error: freezeMsg,
        };
      }

      const pinHash = userData.pinHash;
      const currentPlainPin = userData.pin;
      const lockedUntil = userData.lockedUntil;
      let pinAttempts = Number(userData.pinAttempts) || 0;

      // Lockout check
      if (lockedUntil) {
        const lockTime = new Date(lockedUntil).getTime();
        if (Date.now() < lockTime) {
          const minutesLeft = Math.ceil((lockTime - Date.now()) / (60 * 1000));
          return {
            success: false,
            error: `Too many incorrect PIN attempts. Locked. Please try again in ${minutesLeft} minutes.`,
          };
        }
      }

      let isPinMatch = false;
      const isUserBiometricEnabled = userData.isBiometricTransferEnabled === true || userData.isBiometricLoginEnabled === true || userData.isFaceIdEnabled === true;
      const isBiometricAuth = body.isBiometricAuthenticated === true || body.isBiometric === true;

      if (isBiometricAuth && isUserBiometricEnabled) {
        isPinMatch = true;
      } else if (isMock) {
        isPinMatch = (pin === "1234" || (Boolean(pin) && pin === currentPlainPin) || (pinHash && Boolean(pin) && bcrypt.compareSync(pin!, pinHash)));
      } else if (pin && pinHash) {
        isPinMatch = bcrypt.compareSync(pin, pinHash);
      } else if (pin && currentPlainPin) {
        isPinMatch = (pin === currentPlainPin);
      } else {
        return {
          success: false,
          error: "No transaction PIN has been set up on this account.",
        };
      }

      if (!isPinMatch) {
        pinAttempts += 1;
        let lockTimestamp = null;
        if (pinAttempts >= 5) {
          lockTimestamp = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        }
        transaction.update(userRef, {
          pinAttempts,
          lockedUntil: lockTimestamp,
        });

        const remaining = Math.max(0, 5 - pinAttempts);
        return {
          success: false,
          error: pinAttempts >= 5
            ? "Too many incorrect PIN attempts. Account locked for 15 minutes."
            : `Incorrect PIN. ${remaining} attempts remaining.`,
        };
      }

      // PIN matches, reset attempts (WRITES operation start here)
      transaction.update(userRef, { pinAttempts: 0, lockedUntil: null });

      // Apply Bulk Transfer Fee Profit Markup securely on server-side from global admin config
      let defaultBulkTransferProfitMargin = 0;
      let bulkTransferTieredMargins: TransferTieredMarkup[] = [];
      const marginRef = adminDb.collection("config").doc("vtu_profit_margins");
      const marginSnap = await transaction.get(marginRef);
      if (marginSnap.exists) {
        const marginData = marginSnap.data() || {};
        defaultBulkTransferProfitMargin = Number(marginData.bulkTransferProfitMargin) || 0;
        if (Array.isArray(marginData.bulkTransferTieredMargins)) {
          bulkTransferTieredMargins = marginData.bulkTransferTieredMargins;
        }
      }

      const gatewayUrl = getGatewayUrl();

      let finalTotalFees = 0;
      let finalTotalProviderFees = 0;
      let finalTotalMarkupFees = 0;

      const structuredBulkRecipients: any[] = [];

      for (let i = 0; i < trfRecipients.length; i++) {
        const rec = trfRecipients[i];
        const recAmt = Number(rec.amount) || 0;
        const bankCodeRaw = rec.bankId || rec.bank_code || rec.bankCode || rec.accountBank || rec.account_bank;
        const accountNumberRaw = rec.accountNumber || rec.account_number || rec.recipientAccount;
        const bankCode = (bankCodeRaw !== undefined && bankCodeRaw !== null) ? String(bankCodeRaw).trim() : "";
        const accountNumber = (accountNumberRaw !== undefined && accountNumberRaw !== null) ? String(accountNumberRaw).trim() : "";

        let recProviderFee = 0;
        try {
          const feeRes = await fetch(`${gatewayUrl}/api/flutterwave/transfer-fee?amount=${recAmt}&currency=NGN`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          });
          const feeData = await feeRes.json();
          if (feeRes.ok && feeData.success) {
            recProviderFee = Number(feeData.fee) || 0;
          }
        } catch (feeErr) {
          recProviderFee = 0;
        }

        const recMarkup = calculateTransferMarkupFee(recAmt, defaultBulkTransferProfitMargin, bulkTransferTieredMargins);
        const itemFee = recProviderFee + recMarkup;

        finalTotalProviderFees += recProviderFee;
        finalTotalMarkupFees += recMarkup;
        finalTotalFees += itemFee;

        structuredBulkRecipients.push({
          accountNumber,
          bankCode,
          amount: recAmt,
          narration: rec.narration ? String(rec.narration).trim() : `Bulk Item ${i + 1}`,
          reference: rec.reference ? String(rec.reference).trim() : `blk-${Date.now()}-${i}-${uid.slice(-4)}`,
          providerFee: recProviderFee,
          markupFee: recMarkup,
          itemFee,
        });
      }

      const finalTotalDeduction = totalAmt + finalTotalFees;

      // Check balance using preloaded wallet
      if (walletBalance < finalTotalDeduction) {
        return {
          success: false,
          error: `Insufficient wallet balance to complete this bulk transfer. Required: ₦${finalTotalDeduction.toLocaleString()}, Available: ₦${walletBalance.toLocaleString()}`,
        };
      }

      // Perform local debit atomically with preloaded context
      await WalletService.debitWallet(transaction, {
        userId: uid,
        amount: totalAmt,
        currency: "NGN",
        reference: trfReference,
        type: "TRANSFER",
        category: "TRANSFER",
        direction: "DEBIT",
        description,
        recipientName: `Bulk Transfer (${trfRecipients.length} Recipients)`,
        fee: finalTotalFees,
        markup: finalTotalMarkupFees,
        totalDebited: finalTotalDeduction,
        metadata: {
          isBulk: true,
          recipientCount: trfRecipients.length,
          totalAmount: totalAmt,
          totalProviderFees: finalTotalProviderFees,
          totalMarkupFees: finalTotalMarkupFees,
          totalFees: finalTotalFees,
          totalDeduction: finalTotalDeduction,
          bulkRecipients: structuredBulkRecipients,
        },
        preLoadedUser: {
          ref: userRef,
          data: userData,
          balance: Number(userData.balance) || 0,
        },
        preLoadedWallet: {
          ref: walletRef,
          data: walletDoc.exists ? walletDoc.data() || {} : {},
          balance: walletBalance,
        },
      });

      return {
        success: true,
      };
    });

    if (!transactionResult.success) {
      return NextResponse.json({ error: transactionResult.error }, { status: 400 });
    }

    // 3. Mock simulation bypass
    if (isMock) {
      logPaymentEvent({
        category: "Transfer",
        userId: uid,
        tx_ref: trfReference,
        amount: totalAmt,
        currency: "NGN",
        message: `Processed successful mock bulk transfer: ${description}`,
        processingTimeMs: Date.now() - startTime,
      });

      // Send Notification
      try {
        NotificationService.sendPushNotification(uid, {
          title: "💸 Bulk Transfer Sent",
          body: `Your bulk transfer of ₦${totalAmt.toLocaleString()} for ${trfRecipients.length} recipients is successful.`,
          type: "transaction",
          url: "/history",
        });
      } catch (notifErr: any) {
        console.error("[Notification Warning] Failed to dispatch mock bulk transfer notification:", notifErr.message);
      }

      return NextResponse.json({
        success: true,
        reference: trfReference,
        message: `Your bulk transfer of ${trfRecipients.length} recipients has been successfully processed!`,
      });
    }

    // 4. Map the client recipients into the bulk_data schema expected by the gateway
    const normalizedBulkData = trfRecipients.map((rec: BulkRecipient, index: number) => {
      const bankCodeRaw = rec.bankId || rec.bank_code || rec.bankCode || rec.accountBank || rec.account_bank;
      const accountNumberRaw = rec.accountNumber || rec.account_number || rec.recipientAccount;

      const bankCode = (bankCodeRaw !== undefined && bankCodeRaw !== null) ? String(bankCodeRaw).trim() : "";
      const accountNumber = (accountNumberRaw !== undefined && accountNumberRaw !== null) ? String(accountNumberRaw).trim() : "";
      const amount = Number(rec.amount);
      const narration = rec.narration ? String(rec.narration).trim() : `Bulk Transfer Item ${index + 1}`;
      const reference = rec.reference ? String(rec.reference).trim() : `blk-${Date.now()}-${index}-${uid.slice(-4)}`;

      return {
        bank_code: bankCode,
        account_number: accountNumber,
        amount,
        currency: "NGN",
        narration,
        reference,
      };
    });

    const gatewayUrl = getGatewayUrl();

    // 5. Call Google Cloud Payment Gateway S2S Bulk Transfer API
    try {
      console.log(`[Bulk Transfer API] Executing real bulk transfer via Payment Gateway: ${description}`);

      const gatewayRes = await fetch(`${gatewayUrl}/api/flutterwave/bulk-transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
          ...(sessionId ? { "X-Session-ID": sessionId } : {}),
        },
        body: JSON.stringify({
          title: title || "Bulk Settlement",
          bulk_data: normalizedBulkData,
        }),
      });

      const gatewayText = await gatewayRes.text().catch(() => "");
      let gatewayData: Record<string, any> = {};
      try {
        gatewayData = gatewayText ? JSON.parse(gatewayText) : {};
      } catch {
        if (gatewayText.includes("Cannot POST") || gatewayText.includes("<!DOCTYPE") || gatewayRes.status === 404) {
          throw new Error("Payment Gateway service is temporarily unreachable or returned an invalid response.");
        }
        throw new Error(gatewayText || "Payment Gateway returned non-JSON response.");
      }

      if (gatewayRes.ok && gatewayData.success) {
        logPaymentEvent({
          category: "Transfer",
          userId: uid,
          tx_ref: trfReference,
          amount: totalAmt,
          currency: "NGN",
          message: `Successfully processed real bulk transfer via Gateway: ${description}`,
          processingTimeMs: Date.now() - startTime,
        });

        // Verification delay: Re-read transaction status from Firestore to confirm 100% SUCCESS (not FAILED, PENDING, or REVERSED)
        await new Promise((resolve) => setTimeout(resolve, 1000));

        try {
          const txRefDoc = adminDb.collection("transactions").doc(`tx-${trfReference}`);

          let shouldNotifySender = false;

          await adminDb.runTransaction(async (claimTx) => {
            const snap = await claimTx.get(txRefDoc);
            if (!snap.exists) return;
            const data = snap.data() || {};
            const statusUpper = String(data.status || "").toUpperCase();

            if (statusUpper === "SUCCESS") {
              if (!data.senderNotified) {
                shouldNotifySender = true;
                claimTx.update(txRefDoc, {
                  senderNotified: true,
                  notifiedAt: new Date().toISOString(),
                });
              }
            }
          });

          // 1. Sender Notification (Dispatched only if atomically claimed)
          if (shouldNotifySender) {
            NotificationService.sendPushNotification(uid, {
              title: "💸 Bulk Transfer Queued",
              body: `Your bulk transfer of ₦${totalAmt.toLocaleString()} for ${trfRecipients.length} recipients has been successfully queued.`,
              type: "transaction",
              url: "/history",
            }).catch(() => {});
          }

          // 2. Recipient Notifications for any internal recipients
          try {
            const senderSnap = await adminDb.collection("users").doc(uid).get();
            const senderUserData = senderSnap.exists ? senderSnap.data() || {} : {};
            const senderName = senderUserData.name || senderUserData.displayName || senderUserData.fullName || "E-Global Pay User";

            for (const rec of trfRecipients) {
              const accountNumberRaw = rec.accountNumber || rec.account_number || rec.recipientAccount;
              const accountNumber = (accountNumberRaw !== undefined && accountNumberRaw !== null) ? String(accountNumberRaw).trim() : "";
              const recAmt = Number(rec.amount) || 0;

              if (accountNumber && recAmt > 0) {
                const recipientUser = await resolveInternalUserByAccount(accountNumber);
                if (recipientUser && recipientUser.uid !== uid) {
                  NotificationService.sendPushNotification(recipientUser.uid, {
                    title: "Money Received 💰",
                    body: `You received ₦${recAmt.toLocaleString()} from ${senderName}`,
                    type: "transaction",
                    url: "/history",
                    amount: recAmt,
                    currency: "NGN",
                    reference: trfReference,
                    recipientName: "Main Wallet",
                    bankName: "E-Global Pay",
                    channel: "Inward Transfer",
                  }).catch(() => {});
                  console.log(`[Bulk Transfer API] Dispatched recipient notification to userId=${recipientUser.uid} for recAmt=₦${recAmt}`);
                }
              }
            }
          } catch (bulkRecErr: any) {
            console.error("[Bulk Transfer API Recipient Notif Error]:", bulkRecErr.message);
          }

          console.log(`[Bulk Transfer API] Processed notifications (claimed sender=${shouldNotifySender}) for ref=${trfReference}`);
        } catch (notifErr: any) {
          console.error("[Notification Warning] Failed to process real bulk transfer notification:", notifErr.message);
        }

        return NextResponse.json({
          success: true,
          reference: trfReference,
          bulkTransferId: gatewayData.data?.id || gatewayData.bulkTransferId,
          message: `Your bulk transfer of ${trfRecipients.length} recipients has been successfully queued in the background!`,
        });
      } else {
        throw new Error(gatewayData.error || gatewayData.message || "Payment Gateway rejected the bulk transfer.");
      }

    } catch (apiErr: unknown) {
      const err = apiErr as Error;
      console.error("[Bulk Transfer API] Gateway bulk transfer failed. Rolling back local wallet debit:", err.message);

      // Rollback debit atomically inside transaction using the exact stored debit amount
      await adminDb.runTransaction(async (rollbackTx) => {
        const userDoc = await rollbackTx.get(userRef);
        const walletDoc = await rollbackTx.get(walletRef);
        if (userDoc.exists) {
          // Update the original transaction document to FAILED
          const origTxRef = adminDb.collection("transactions").doc(`tx-${trfReference}`);
          const origTxSnap = await rollbackTx.get(origTxRef);
          let exactRefundAmount = totalAmt;

          if (origTxSnap.exists) {
            const origData = origTxSnap.data() || {};
            exactRefundAmount = Number(origData.totalDebited) || (Number(origData.amount) + Number(origData.fee) + (Number(origData.vat) || 0));
          }

          rollbackTx.update(origTxRef, { status: "FAILED" });

          const uData = userDoc.data() || {};
          const wBalance = walletDoc.exists ? (Number(walletDoc.data()?.balance) || 0) : 0;

          await WalletService.creditWallet(rollbackTx, {
            userId: uid,
            amount: exactRefundAmount,
            currency: "NGN",
            reference: `REFUND-${trfReference}`,
            type: "REFUND",
            category: "REFUND",
            direction: "CREDIT",
            description: `Refund for failed bulk transfer: ${description}`,
            recipientName: `Bulk Transfer (${trfRecipients.length} Recipients)`,
            totalCredited: exactRefundAmount,
            preLoadedUser: {
              ref: userRef,
              data: uData,
              balance: Number(uData.balance) || 0,
            },
            preLoadedWallet: {
              ref: walletRef,
              data: walletDoc.exists ? walletDoc.data() || {} : {},
              balance: wBalance,
            },
          });
        }
      });

      return NextResponse.json({
        error: `Failed to complete outward bulk transfer: ${err.message}. Local wallet balance has been successfully refunded.`
      }, { status: 400 });
    }

  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Bulk Transfer API Exception]:", error.message, error.stack);
    return NextResponse.json({ error: "Unable to complete bulk transfer at this time. If your transaction amount exceeds your account Tier limit, please upgrade your Tier or contact Support for assistance." }, { status: 500 });
  }
}
