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

export async function POST(req: Request) {
  const startTime = Date.now();
  let uid = "";
  let requestBody: Record<string, unknown> | null = null;
  let transferProfitMargin = 0;
  const gatewayUrl = getGatewayUrl();

  console.log("STEP 1 - Request received");

  // 1. Authenticate user
  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
    console.log(`STEP 1.5 - User authenticated successfully. UID: ${uid}`);
  } catch (authErr: unknown) {
    const error = authErr as Error;
    console.error("[Transfer Auth Error] Verification failed:", error.message, error.stack);
    return NextResponse.json({
      error: "Unauthorized: Invalid or missing token.",
      details: error.message,
      stack: error.stack
    }, { status: 401 });
  }

  // Enforce KYC verification
  const isApproved = await verifyUserKycApproved(uid);
  if (!isApproved) {
    return NextResponse.json({ error: "Forbidden: Account verification is required to perform financial transactions." }, { status: 403 });
  }

  try {
    try {
      requestBody = await req.json();
      console.log("STEP 2 - Request body parsed", JSON.stringify(requestBody));
    } catch (parseErr: unknown) {
      const error = parseErr as Error;
      console.error("[Transfer Parse Error] Failed to parse request body:", error.message);
      return NextResponse.json({
        error: "Invalid request payload. Must be valid JSON.",
        details: error.message,
        stack: error.stack
      }, { status: 400 });
    }

    const body = requestBody || {};
    const amount = body.amount;
    const account_number = body.account_number;
    const accountNumber = body.accountNumber;
    const account_bank = body.account_bank;
    const accountBank = body.accountBank;
    const bankCode = body.bankCode;
    const account_name = body.account_name;
    const accountName = body.accountName;
    const currency = body.currency as string | undefined;
    const narration = body.narration as string | undefined;
    const reference = body.reference as string | undefined;
    const pin = body.pin as string | undefined;

    const bank_name = body.bank_name;
    const bankName = body.bankName;

    const trfAmount = Number(amount);
    const trfAccount = (account_number !== undefined && account_number !== null) ? String(account_number).trim() : ((accountNumber !== undefined && accountNumber !== null) ? String(accountNumber).trim() : "");
    const trfBank = (bankCode !== undefined && bankCode !== null) ? String(bankCode).trim() : ((accountBank !== undefined && accountBank !== null) ? String(accountBank).trim() : ((account_bank !== undefined && account_bank !== null) ? String(account_bank).trim() : ""));
    const trfBankName = (bank_name !== undefined && bank_name !== null) ? String(bank_name).trim() : ((bankName !== undefined && bankName !== null) ? String(bankName).trim() : "Bank Transfer");
    const trfName = (account_name !== undefined && account_name !== null) ? String(account_name).trim() : ((accountName !== undefined && accountName !== null) ? String(accountName).trim() : "Beneficiary");
    const trfCurrency = currency ? String(currency).trim() : "NGN";
    const trfReference = reference ? String(reference).trim() : `trf-${Date.now()}-${uid.slice(-6)}`;

    const isBiometricReq = body.isBiometricAuthenticated === true || body.isBiometric === true;

    // Validations
    const globalMinTransfer = await getGlobalMinTransferAmount();
    if (!trfAmount || isNaN(trfAmount) || trfAmount < globalMinTransfer) {
      return NextResponse.json({
        error: `Invalid transfer amount. The global minimum required transfer limit is ₦${globalMinTransfer.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
      }, { status: 400 });
    }
    if (!trfAccount || !trfBank || (!isBiometricReq && !pin)) {
      return NextResponse.json({ error: "Account number, bank, and transaction PIN are required." }, { status: 400 });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : "";
    const sessionId = req.headers.get("X-Session-ID") || req.headers.get("x-session-id") || "";

    const isMock = uid === "mock-uid";

    // 2. Fetch global TRN fee configuration (ON/OFF switch and free transfers quota)
    let enableTransferFee = true;
    let freeTransfersQuota = 0;
    let freeTransferResetPeriod = "NEVER";

    const trnFeeRef = adminDb.collection("config").doc("trn_fee_config");
    const trnFeeSnap = await trnFeeRef.get();
    if (trnFeeSnap.exists) {
      const feeData = trnFeeSnap.data() || {};
      enableTransferFee = feeData.enableTransferFee !== false;
      freeTransfersQuota = Math.max(0, Number(feeData.freeTransfersQuota) || 0);
      freeTransferResetPeriod = feeData.freeTransferResetPeriod || "NEVER";
    }

    let isFreeTransfer = !enableTransferFee;

    // Fetch base provider transfer fee dynamically if fees enabled
    let providerFee = enableTransferFee ? 10.00 : 0.00;
    if (enableTransferFee && !isMock) {
      try {
        const feeRes = await fetch(`${gatewayUrl}/api/flutterwave/transfer-fee?amount=${trfAmount}&currency=${trfCurrency}`, {
          headers: {
            "Authorization": `Bearer ${idToken}`,
            "X-Session-ID": sessionId,
            "Content-Type": "application/json",
          },
        });
        const feeData = await feeRes.json();
        if (feeRes.ok && feeData.success) {
          if (feeData.isFreeTransfer) {
            isFreeTransfer = true;
            providerFee = 0;
          } else {
            providerFee = Number(feeData.providerFee ?? feeData.fee) || 10.00;
          }
        }
      } catch (err: unknown) {
        const error = err as Error;
        console.warn("[Transfer API] Failed to fetch dynamic provider fee. Using fallback 10 NGN:", error.message);
      }
    }
    console.log(`STEP 3 - Base provider fee fetched: ${providerFee}, isFreeTransfer: ${isFreeTransfer}`);

    const userNarration = narration && narration.trim() ? narration.trim() : null;
    const description = userNarration || `Transfer To ${trfName}`;

    // 3. Atomically verify PIN and debit user balance inside Firestore transaction
    console.log("STEP 4 - Starting Firestore transaction");
    const userRef = adminDb.collection("users").doc(uid);
    const walletRef = adminDb.collection("wallets").doc(`${uid}_${trfCurrency}`);

    const transactionResult = await adminDb.runTransaction(async (transaction) => {
      console.log("STEP 5 - ALL READS: Loading user, wallet, and margin documents first");
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error("USER_NOT_FOUND");
      }

      // Fetch the specific wallet document
      const walletDoc = await transaction.get(walletRef);
      const walletBalance = walletDoc.exists ? (Number(walletDoc.data()?.balance) || 0) : 0;

      // Fetch margins document (All reads must be done before any writes!)
      let defaultTransferProfitMargin = 0;
      let transferTieredMargins: TransferTieredMarkup[] = [];
      const marginRef = adminDb.collection("config").doc("vtu_profit_margins");
      const marginSnap = await transaction.get(marginRef);
      if (marginSnap.exists) {
        const marginData = marginSnap.data() || {};
        defaultTransferProfitMargin = Number(marginData.transferProfitMargin) || 0;
        if (Array.isArray(marginData.transferTieredMargins)) {
          transferTieredMargins = marginData.transferTieredMargins;
        }
      }
      transferProfitMargin = calculateTransferMarkupFee(trfAmount, defaultTransferProfitMargin, transferTieredMargins);

      const userData = userDoc.data() || {};

      // Server-side Account Freeze Check (Blocks hacker bypasses)
      if (userData.isFrozen) {
        const freezeMsg = userData.freezeMessage || "Dear Customer please Contact Us or Visit Our Office for assistance";
        return {
          success: false,
          error: freezeMsg,
        };
      }

      // Server-side Account Transfer Limits Validation
      if (trfAmount < globalMinTransfer) {
        return {
          success: false,
          error: `Transfer amount (₦${trfAmount.toLocaleString()}) is below the global minimum required transfer limit of ₦${globalMinTransfer.toLocaleString()}.`,
        };
      }

      const hasCustom = userData.hasCustomLimits === true;
      const userTier = String(userData.tier || (userData.kycStatus === "VERIFIED" ? "Tier 2" : "Tier 1"));

      if (!userData.unlimitedTransfers) {
        let singleTransferCap = 0;
        if (hasCustom && typeof userData.maxSingleTransferLimit === "number" && Number(userData.maxSingleTransferLimit) > 0) {
          singleTransferCap = Number(userData.maxSingleTransferLimit);
        } else if (userTier === "Tier 3") {
          singleTransferCap = typeof marginSnap.data()?.tier3SingleTransferLimit === "number" ? marginSnap.data()?.tier3SingleTransferLimit : 10000000;
        } else if (userTier === "Tier 2") {
          singleTransferCap = typeof marginSnap.data()?.tier2SingleTransferLimit === "number" ? marginSnap.data()?.tier2SingleTransferLimit : 2000000;
        } else {
          singleTransferCap = typeof marginSnap.data()?.tier1SingleTransferLimit === "number" ? marginSnap.data()?.tier1SingleTransferLimit : 200000;
        }

        if (singleTransferCap > 0 && trfAmount > singleTransferCap) {
          return {
            success: false,
            error: `Transfer amount of ₦${trfAmount.toLocaleString()} exceeds your single transaction limit of ₦${singleTransferCap.toLocaleString()} for ${userTier}. Please upgrade your account tier or contact Support for assistance.`,
          };
        }
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

      console.log(`STEP 6 - PIN verified: ${isPinMatch}`);
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

      // PIN matches, reset attempts (WRITE operation starts here)
      transaction.update(userRef, { pinAttempts: 0, lockedUntil: null });

      // Check user free transfer quota
      let userUsedFreeCount = Number(userData.usedFreeTransfers) || 0;
      let userLastReset = userData.lastFreeTransferResetDate ? new Date(userData.lastFreeTransferResetDate) : null;
      const now = new Date();

      if (enableTransferFee && freeTransfersQuota > 0) {
        let shouldReset = false;
        if (userLastReset) {
          if (freeTransferResetPeriod === "DAILY") {
            shouldReset = userLastReset.toDateString() !== now.toDateString();
          } else if (freeTransferResetPeriod === "WEEKLY") {
            const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
            shouldReset = now.getTime() - userLastReset.getTime() >= oneWeekMs;
          } else if (freeTransferResetPeriod === "MONTHLY") {
            shouldReset = userLastReset.getMonth() !== now.getMonth() || userLastReset.getFullYear() !== now.getFullYear();
          }
        }

        if (shouldReset) {
          userUsedFreeCount = 0;
        }

        if (userUsedFreeCount < freeTransfersQuota) {
          isFreeTransfer = true;
        }
      }

      const effectiveFee = isFreeTransfer ? 0 : providerFee;
      const effectiveMarkup = isFreeTransfer ? 0 : transferProfitMargin;
      const combinedFee = effectiveFee + effectiveMarkup;
      const finalTotalDeduction = trfAmount + combinedFee;

      // Check balance using the pre-loaded specific wallet balance
      console.log(`STEP 7 - Balance checked. Available wallet: ${walletBalance}, Required: ${finalTotalDeduction}, Fee: ${combinedFee}`);
      if (walletBalance < finalTotalDeduction) {
        return {
          success: false,
          error: `Insufficient wallet balance to complete this transfer. Required: ₦${finalTotalDeduction.toLocaleString()}, Available: ₦${walletBalance.toLocaleString()}`,
        };
      }

      // If user used a free transfer quota, increment counter and update timestamp
      if (enableTransferFee && freeTransfersQuota > 0 && isFreeTransfer && userUsedFreeCount < freeTransfersQuota) {
        transaction.update(userRef, {
          usedFreeTransfers: userUsedFreeCount + 1,
          lastFreeTransferResetDate: now.toISOString(),
        });
      }

      // Perform local debit atomically
      console.log("STEP 8 - Calling WalletService.debitWallet() with preloaded parameters");
      const debitResult = await WalletService.debitWallet(transaction, {
        userId: uid,
        amount: trfAmount,
        currency: trfCurrency,
        reference: trfReference,
        type: "TRANSFER",
        category: "TRANSFER",
        direction: "DEBIT",
        description,
        narration: userNarration || undefined,
        recipientName: trfName,
        fee: combinedFee,
        vat: 0,
        markup: effectiveMarkup,
        totalDebited: finalTotalDeduction,
        beneficiaryName: trfName,
        beneficiaryAccountNumber: trfAccount,
        beneficiaryBankName: trfBankName,
        beneficiaryBankCode: trfBank,
        provider: "Flutterwave",
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
      console.log("STEP 9 - Wallet debited");

      return {
        success: true,
        walletBalance: debitResult.newBalance,
      };
    });

    console.log("STEP 10 - Transaction completed");

    if (!transactionResult.success) {
      return NextResponse.json({ error: transactionResult.error }, { status: 400 });
    }

    // 4. Mock simulation bypass
    if (isMock) {
      logPaymentEvent({
        category: "Transfer",
        userId: uid,
        tx_ref: trfReference,
        amount: trfAmount,
        currency: trfCurrency,
        message: `Processed successful mock transfer: ${description}`,
        processingTimeMs: Date.now() - startTime,
      });

      // Send Sender Notification
      try {
        NotificationService.sendPushNotification(uid, {
          title: "💸 Bank Transfer Sent",
          body: `Your transfer of ₦${trfAmount.toLocaleString()} to ${trfName} is successful.`,
          type: "transaction",
          url: "/history",
          amount: trfAmount,
          currency: trfCurrency || "NGN",
          reference: trfReference,
          recipientName: trfName,
          bankName: trfBankName || "Bank Transfer",
          channel: "Outward Transfer",
        });
      } catch (notifErr: any) {
        console.error("[Notification Warning] Failed to dispatch mock transfer notification:", notifErr.message);
      }

      // Send Recipient Notification if internal
      try {
        const recipientUser = await resolveInternalUserByAccount(trfAccount);
        if (recipientUser && recipientUser.uid !== uid) {
          const userSnap = await adminDb.collection("users").doc(uid).get();
          const senderUserData = userSnap.exists ? userSnap.data() || {} : {};
          const senderName = senderUserData.name || senderUserData.displayName || senderUserData.fullName || "E-Global Pay User";

          NotificationService.sendPushNotification(recipientUser.uid, {
            title: "Money Received 💰",
            body: `You received ₦${trfAmount.toLocaleString()} from ${senderName}`,
            type: "transaction",
            url: "/history",
            amount: trfAmount,
            currency: trfCurrency || "NGN",
            reference: trfReference,
            recipientName: "Main Wallet",
            bankName: trfBankName || "E-Global Pay",
            channel: "Inward Transfer",
          });
          console.log(`[Transfer API] Dispatched mock recipient notification to userId=${recipientUser.uid}`);
        }
      } catch (recNotifErr: any) {
        console.error("[Notification Warning] Failed to dispatch mock recipient notification:", recNotifErr.message);
      }

      return NextResponse.json({
        success: true,
        reference: trfReference,
        message: `Your mock bank transfer has been initiated successfully! ₦${trfAmount.toLocaleString()} is being settled to ${trfName}.`,
      });
    }

    // 5. Call Google Cloud Payment Gateway S2S Transfer API
    try {
      console.log("STEP 11 - Calling Payment Gateway");
      console.log(`[Transfer API] Executing real transfer via Payment Gateway: amount=${trfAmount} to ${trfName}`);

      const gatewayPayload = {
        amount: trfAmount,
        account_number: trfAccount,
        account_bank: trfBank,
        account_name: trfName,
        bank_name: trfBankName,
        currency: trfCurrency,
        narration: description,
        reference: trfReference,
        userId: uid,
        fee: providerFee,
        markup: transferProfitMargin,
        combinedFee: providerFee + transferProfitMargin,
        totalDebited: trfAmount + providerFee + transferProfitMargin,
      };

      const gatewayRes = await fetch(`${gatewayUrl}/api/flutterwave/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
          "X-Session-ID": sessionId,
        },
        body: JSON.stringify(gatewayPayload),
      });

      console.log("STEP 12 - Payment Gateway responded");
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
          amount: trfAmount,
          currency: trfCurrency,
          message: `Successfully processed real transfer via Gateway: ${description}`,
          processingTimeMs: Date.now() - startTime,
        });

        // Update transaction record with provider reference and re-affirm customer fee & markup
        const provRef = gatewayData.provider_reference || gatewayData.data?.id || gatewayData.data?.reference;
        const effectiveFee = isFreeTransfer ? 0 : providerFee;
        const effectiveMarkup = isFreeTransfer ? 0 : transferProfitMargin;
        const combinedFee = effectiveFee + effectiveMarkup;
        const finalTotalDeduction = trfAmount + combinedFee;

        try {
          const updatePayload: Record<string, any> = {
            fee: combinedFee,
            transferFee: combinedFee,
            markup: effectiveMarkup,
            totalDebited: finalTotalDeduction,
            status: "SUCCESS"
          };
          if (provRef) {
            updatePayload.providerReference = String(provRef);
          }
          if (gatewayData.data?.id) {
            updatePayload.providerTransactionId = String(gatewayData.data.id);
          }
          await adminDb.collection("transactions").doc(`tx-${trfReference}`).update(updatePayload);
        } catch (updateErr: any) {
          console.warn("[Transfer API] Failed to update transaction providerReference:", updateErr.message);
        }

        // Verification delay: Re-read transaction status from Firestore to confirm 100% SUCCESS (not FAILED, PENDING, or REVERSED)
        await new Promise((resolve) => setTimeout(resolve, 1000));

        try {
          const txRefDoc = adminDb.collection("transactions").doc(`tx-${trfReference}`);

          // Atomic Claim Transaction to prevent concurrent notification races
          let shouldNotifySender = false;
          let shouldNotifyRecipient = false;

          await adminDb.runTransaction(async (claimTx) => {
            const snap = await claimTx.get(txRefDoc);
            if (!snap.exists) return;
            const data = snap.data() || {};
            const statusUpper = String(data.status || "").toUpperCase();

            if (statusUpper === "SUCCESS") {
              if (!data.senderNotified) {
                shouldNotifySender = true;
              }
              if (!data.recipientNotified) {
                shouldNotifyRecipient = true;
              }

              if (shouldNotifySender || shouldNotifyRecipient) {
                claimTx.update(txRefDoc, {
                  senderNotified: true,
                  recipientNotified: true,
                  notifiedAt: new Date().toISOString(),
                });
              }
            }
          });

          // 1. Sender Notification (Dispatched only if atomically claimed)
          if (shouldNotifySender) {
            NotificationService.sendPushNotification(uid, {
              title: "💸 Bank Transfer Sent",
              body: `Your transfer of ₦${trfAmount.toLocaleString()} to ${trfName} is successful.`,
              type: "transaction",
              url: "/history",
              amount: trfAmount,
              currency: trfCurrency || "NGN",
              reference: trfReference,
              recipientName: trfName,
              bankName: trfBankName || "Bank Transfer",
              channel: "Outward Transfer",
            }).catch(() => {});
          }

          // 2. Recipient Notification (Dispatched only if atomically claimed)
          if (shouldNotifyRecipient) {
            try {
              const recipientUser = await resolveInternalUserByAccount(trfAccount);
              if (recipientUser && recipientUser.uid !== uid) {
                const senderSnap = await adminDb.collection("users").doc(uid).get();
                const senderUserData = senderSnap.exists ? senderSnap.data() || {} : {};
                const senderName = senderUserData.name || senderUserData.displayName || senderUserData.fullName || "E-Global Pay User";

                NotificationService.sendPushNotification(recipientUser.uid, {
                  title: "Money Received 💰",
                  body: `You received ₦${trfAmount.toLocaleString()} from ${senderName}`,
                  type: "transaction",
                  url: "/history",
                  amount: trfAmount,
                  currency: trfCurrency || "NGN",
                  reference: trfReference,
                  recipientName: "Main Wallet",
                  bankName: trfBankName || "E-Global Pay",
                  channel: "Inward Transfer",
                }).catch(() => {});
                console.log(`[Transfer API] Dispatched recipient notification to userId=${recipientUser.uid} for ref=${trfReference}`);
              }
            } catch (recErr: any) {
              console.error("[Transfer API Recipient Notif Error]:", recErr.message);
            }
          }

          console.log(`[Transfer API] Processed notifications (claimed sender=${shouldNotifySender}, recipient=${shouldNotifyRecipient}) for ref=${trfReference}`);
        } catch (notifErr: any) {
          console.error("[Notification Warning] Failed to process real transfer notification:", notifErr.message);
        }

        return NextResponse.json({
          success: true,
          reference: trfReference,
          provider_reference: gatewayData.provider_reference || gatewayData.data?.id,
          message: gatewayData.message || `Transfer initiated successfully!`,
        });
      } else {
        throw new Error(gatewayData.error || gatewayData.message || "Payment Gateway rejected the transfer.");
      }

    } catch (apiErr: unknown) {
      const err = apiErr as Error;
      console.error("[Transfer API] Gateway transfer failed. Rolling back local wallet debit. Detail:", {
        message: err.message,
        stack: err.stack,
        requestBody,
        uid,
        gatewayUrl,
      });

      // Rollback debit atomically inside transaction
      let refundAmountForNotification = trfAmount;
      await adminDb.runTransaction(async (rollbackTx) => {
        const userDoc = await rollbackTx.get(userRef);
        const walletDoc = await rollbackTx.get(walletRef);
        if (userDoc.exists) {
          // Update the original transaction document to FAILED and read exact debited amount
          const origTxRef = adminDb.collection("transactions").doc(`tx-${trfReference}`);
          const origTxSnap = await rollbackTx.get(origTxRef);
          let exactRefundAmount = trfAmount;

          if (origTxSnap.exists) {
            const origData = origTxSnap.data() || {};
            exactRefundAmount = Number(origData.totalDebited) || (Number(origData.amount) + Number(origData.fee) + (Number(origData.vat) || 0));
          } else {
            let defaultTransferProfitMargin = 0;
            let transferTieredMargins: TransferTieredMarkup[] = [];
            const marginRef = adminDb.collection("config").doc("vtu_profit_margins");
            const marginSnap = await rollbackTx.get(marginRef);
            if (marginSnap.exists) {
              const marginData = marginSnap.data() || {};
              defaultTransferProfitMargin = Number(marginData.transferProfitMargin) || 0;
              if (Array.isArray(marginData.transferTieredMargins)) {
                transferTieredMargins = marginData.transferTieredMargins;
              }
            }
            const transferProfitMargin = calculateTransferMarkupFee(trfAmount, defaultTransferProfitMargin, transferTieredMargins);
            exactRefundAmount = trfAmount + providerFee + transferProfitMargin;
          }

          rollbackTx.update(origTxRef, { status: "FAILED" });

          const uData = userDoc.data() || {};
          const wBalance = walletDoc.exists ? (Number(walletDoc.data()?.balance) || 0) : 0;

          // Preserve transfer breakdown in refund record
          const origData = origTxSnap.exists ? origTxSnap.data() || {} : {};
          const origAmount = Number(origData.amount) || trfAmount;
          const origFee = Number(origData.fee) || (providerFee + transferProfitMargin);
          const origMarkup = Number(origData.markup) || transferProfitMargin;

          refundAmountForNotification = exactRefundAmount;

          // If the transfer was free (origFee === 0), restore the user's usedFreeTransfers quota count
          const isWasFreeTransfer = origData.fee === 0 || origData.isFreeTransfer === true || isFreeTransfer;
          if (isWasFreeTransfer) {
            const currentUsedFree = Number(uData.usedFreeTransfers) || 0;
            if (currentUsedFree > 0) {
              rollbackTx.update(userRef, {
                usedFreeTransfers: currentUsedFree - 1
              });
              console.log(`[Transfer Rollback] Restored free transfer quota for user ${uid}. Decremented usedFreeTransfers from ${currentUsedFree} to ${currentUsedFree - 1}`);
            }
          }

          await WalletService.creditWallet(rollbackTx, {
            userId: uid,
            amount: origAmount,
            currency: trfCurrency,
            reference: `REFUND-${trfReference}`,
            type: "REFUND",
            category: "REFUND",
            direction: "CREDIT",
            description: `Refund for failed transfer: ${description}`,
            recipientName: trfName,
            fee: origFee,
            markup: origMarkup,
            totalCredited: exactRefundAmount,
            beneficiaryName: trfName,
            beneficiaryAccountNumber: trfAccount,
            beneficiaryBankName: trfBankName,
            beneficiaryBankCode: trfBank,
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

      // Reversal notification is best-effort and never affects the refund response.
      try {
        await NotificationService.sendReversalNotification({
          userId: uid,
          reference: `REFUND-${trfReference}`,
          originalReference: trfReference,
          amount: refundAmountForNotification,
          currency: trfCurrency,
          transactionLabel: "bank transfer",
          recipientName: trfName,
        });
      } catch (notificationError: any) {
        console.warn("[Transfer Reversal Notification] Dispatch failed:", notificationError?.message || notificationError);
      }

      return NextResponse.json({
        error: `Failed to complete outward bank transfer: ${err.message}. Local wallet balance has been successfully refunded.`,
        details: err.message,
        stack: err.stack,
        requestBody,
        uid,
        gatewayUrl,
      }, { status: 400 });
    }

  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Transfer API Exception] CRITICAL FAILURE:", {
      message: error.message,
      stack: error.stack,
      requestBody,
      uid,
      gatewayUrl,
    });
    return NextResponse.json({
      error: "Unable to complete transfer at this time. If your transaction amount exceeds your account Tier limit, please upgrade your Tier or contact Support for assistance.",
      details: error.message,
      stack: error.stack,
      requestBody,
      uid,
      gatewayUrl,
    }, { status: 500 });
  }
}
