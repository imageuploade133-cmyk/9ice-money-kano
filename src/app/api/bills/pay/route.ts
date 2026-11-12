import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";
import { WalletService } from "@/services/wallet-service";
import { logPaymentEvent } from "@/lib/payment-logger";
import { PaymentGatewayManager } from "@/lib/payment/PaymentGatewayManager";
import { NotificationService } from "@/services/notification-service";
import bcrypt from "bcryptjs";
import { MOCK_ITEMS } from "../items/config";
import { getGatewayUrl } from "@/lib/gateway-util";

function sanitizeBillErrorMessage(rawMessage: string, billType: string = "bill"): string {
  const msg = String(rawMessage || "").toLowerCase();
  const typeLower = (billType || "bill").toLowerCase();

  if (
    msg.includes("insufficient_balance") ||
    msg.includes("insufficient balance") ||
    msg.includes("clubkonnect") ||
    msg.includes("flutterwave") ||
    msg.includes("rejected request") ||
    msg.includes("provider") ||
    msg.includes("gateway")
  ) {
    if (typeLower.includes("airtime")) {
      return "Airtime purchase network issue. Please try again later.";
    }
    if (typeLower.includes("data")) {
      return "Data purchase network issue. Please try again later.";
    }
    if (typeLower.includes("cable")) {
      return "Cable TV subscription network issue. Please try again later.";
    }
    if (typeLower.includes("electricity") || typeLower.includes("utility")) {
      return "Electricity payment network issue. Please try again later.";
    }
    if (typeLower.includes("waec")) {
      return "WAEC PIN purchase network issue. Please try again later.";
    }
    return "Bill payment network issue. Please try again later.";
  }

  return rawMessage || "Bill payment network issue. Please try again later.";
}

export async function POST(req: Request) {
  const startTime = Date.now();
  let uid = "";

  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
  } catch (authErr: unknown) {
    const error = authErr as Error;
    console.error("[Bills Pay Auth Error] Verification failed:", error.message);
    return NextResponse.json({ error: "Unauthorized: Invalid or missing token." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      biller_code,
      item_code,
      amount,
      customer_id,
      biller_name,
      biller_type, // "airtime", "data", "cable", "utility", "internet", "waec", "electricity"
      pin,
      walletType, // "MAIN" | "BONUS"
    } = body;

    const isBiometricReq = body.isBiometricAuthenticated === true || body.isBiometric === true;

    // Validations
    if (!biller_code || !item_code || !customer_id || (!isBiometricReq && !pin)) {
      return NextResponse.json(
        { error: "Biller code, item code, customer identifier and your transaction PIN are required." },
        { status: 400 }
      );
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json({ error: "Invalid bill amount. Must be greater than zero." }, { status: 400 });
    }

    // 1. Fetch Global Commission Markups from Firestore config/vtu_profit_margins
    let appliedMarkupFee = 0;
    try {
      const marginSnap = await adminDb.collection("config").doc("vtu_profit_margins").get();
      if (marginSnap.exists) {
        const margins = marginSnap.data() || {};
        const bType = (biller_type || "").toLowerCase();
        if (bType === "airtime") {
          appliedMarkupFee = Number(margins.airtimeProfitMargin) || 0;
        } else if (bType === "data") {
          appliedMarkupFee = Number(margins.dataProfitMargin) || 0;
        } else if (bType === "cable") {
          appliedMarkupFee = Number(margins.cableProfitMargin) || 0;
        } else if (bType === "waec") {
          appliedMarkupFee = Number(margins.waecProfitMargin) || 0;
        } else if (bType === "electricity" || bType === "utility") {
          appliedMarkupFee = Number(margins.electricityProfitMargin) || 0;
        }
      }
    } catch (marginErr: any) {
      console.warn("[Bills Pay] Failed to fetch vtu_profit_margins, proceeding without markup:", marginErr.message);
    }

    // Total charge = base bill amount + admin global commission markup fee
    const totalChargeAmount = numAmount + appliedMarkupFee;

    // Dynamic Selected Biller and Item Validation before payment
    const isMock = uid === "mock-uid";
    if (!isMock) {
      try {
        const authHeader = req.headers.get("Authorization") || "";
        const sessionId = req.headers.get("X-Session-ID") || req.headers.get("x-session-id") || "";
        const apiCategory = biller_type?.toUpperCase() === "DATA" ? "MOBILEDATA" : biller_type?.toUpperCase() || "AIRTIME";

        // Validate Biller Provider Exists
        const billersResponse = await fetch(`${getGatewayUrl()}/api/flutterwave/proxy`, {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            ...(sessionId ? { "X-Session-ID": sessionId } : {}),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            method: "get",
            endpoint: `/billers?category=${apiCategory}&country=NG`,
          }),
        });

        if (billersResponse.ok) {
          const resData = await billersResponse.json();
          const billerList = (resData.data || []) as Array<{ biller_code: string }>;
          const exists = billerList.some((b) => b.biller_code === biller_code);
          if (!exists) {
            return NextResponse.json(
              { error: "The selected billing provider does not exist on Flutterwave active directory." },
              { status: 400 }
            );
          }
        }

        // Validate Biller Package Item Exists
        const itemsResponse = await fetch(`${getGatewayUrl()}/api/flutterwave/proxy`, {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            method: "get",
            endpoint: `/bill-items?biller_code=${biller_code}&country=NG`,
          }),
        });

        if (itemsResponse.ok) {
          const itemsData = await itemsResponse.json();
          const itemList = (itemsData.data || []) as Array<{ item_code: string }>;
          if (itemList.length > 0) {
            const itemExists = itemList.some((i) => i.item_code === item_code);
            if (!itemExists && apiCategory !== "AIRTIME") {
              return NextResponse.json(
                { error: "The selected billing package plan does not exist or is inactive." },
                { status: 400 }
              );
            }
          }
        }
      } catch (err) {
        console.warn("[Biller Validation Fail] Skipping verification due to gateway down time:", err);
      }
    }

    // Find the item name for bonus checks if needed
    let matchedItemName = "";
    let matchedPlan = null;
    for (const billerCode in MOCK_ITEMS) {
      const plans = MOCK_ITEMS[billerCode];
      const plan = plans.find(p => p.item_code === item_code);
      if (plan) {
        matchedPlan = plan;
        matchedItemName = plan.name;
        break;
      }
    }

    // Backend Custom Data Amount floor validation
    if (biller_type?.toUpperCase() === "DATA") {
      if (matchedPlan && matchedPlan.amount > 0 && numAmount < matchedPlan.amount) {
        return NextResponse.json(
          { error: `Custom data payment amount (₦${numAmount}) cannot be less than the standard plan price of ₦${matchedPlan.amount}.` },
          { status: 400 }
        );
      }
    }

    // Secure Bonus Wallet rules check (must not be hardcoded, runs server-side to prevent tampering)
    if (walletType === "BONUS") {
      const { ReferralService } = await import("@/services/referral-service");
      const checkBonus = await ReferralService.validateBonusPurchase(
        uid,
        biller_type || "utility",
        totalChargeAmount,
        item_code,
        matchedItemName
      );

      if (!checkBonus.allowed) {
        return NextResponse.json({ error: checkBonus.reason }, { status: 400 });
      }
    }

    // Verify user transaction PIN and debit wallet inside single atomic Firestore transaction
    const userRef = adminDb.collection("users").doc(uid);
    const walletRef = adminDb.collection("wallets").doc(`${uid}_NGN`);
    const reference = `BILL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const transactionType = biller_type?.toUpperCase() === "AIRTIME" ? "AIRTIME" :
                            biller_type?.toUpperCase() === "DATA" ? "DATA" : "BILLS";

    const description = `${biller_name || "Bill Payment"} (${item_code}) to ${customer_id}${appliedMarkupFee > 0 ? ` (Includes ₦${appliedMarkupFee} service markup)` : ""}`;

    // Atomically verify PIN and debit wallet
    const transactionResult = await adminDb.runTransaction(async (transaction) => {
      // 1. ALL READS: Execute all transaction.get() reads first to lock target documents
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error("USER_NOT_FOUND");
      }

      // Preload NGN wallet balance
      const walletDoc = await transaction.get(walletRef);
      const wData = walletDoc.exists ? walletDoc.data() || {} : {};

      const isBonus = walletType === "BONUS";
      const walletBalance = isBonus
        ? (wData.bonusBalance !== undefined ? Number(wData.bonusBalance) : 0.00)
        : (wData.balance !== undefined ? Number(wData.balance) : 0);

      const userData = userDoc.data() || {};
      const pinHash = userData.pinHash;
      const currentPlainPin = userData.pin;
      const lockedUntil = userData.lockedUntil;
      let pinAttempts = Number(userData.pinAttempts) || 0;

      const preLoadedUser = {
        ref: userRef,
        data: userData,
        balance: Number(userData.balance) || 0,
      };

      const preLoadedWallet = {
        ref: walletRef,
        data: wData,
        balance: walletBalance,
      };

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

      // PIN is correct, reset pinAttempts and check balance (WRITES start here)
      transaction.update(userRef, { pinAttempts: 0, lockedUntil: null });

      // Check wallet balance using totalChargeAmount (numAmount + appliedMarkupFee)
      if (walletBalance < totalChargeAmount) {
        return {
          success: false,
          error: `Insufficient ${isBonus ? "bonus reward" : "wallet"} funds to pay this bill. Required: ₦${totalChargeAmount.toLocaleString()} (Bill: ₦${numAmount.toLocaleString()}${appliedMarkupFee > 0 ? ` + Markup Fee: ₦${appliedMarkupFee}` : ""}), Available: ₦${walletBalance.toLocaleString()}`,
        };
      }

      // 2. ALL WRITES: Execute all updates sequentially
      await WalletService.debitWallet(transaction, {
        userId: uid,
        amount: numAmount,
        currency: "NGN",
        reference,
        type: transactionType,
        category: biller_type?.toUpperCase() || "BILLS",
        direction: "DEBIT",
        description,
        recipientName: customer_id,
        fee: appliedMarkupFee,
        markup: appliedMarkupFee,
        totalDebited: totalChargeAmount,
        walletType: walletType || "MAIN",

        billerCode: biller_code,
        billerName: biller_name,
        billerType: biller_type,
        customerId: customer_id,
        itemCode: item_code,
        itemName: matchedItemName || undefined,
        planName: matchedItemName || undefined,

        network: (biller_type?.toUpperCase() === "AIRTIME" || biller_type?.toUpperCase() === "DATA") ? (biller_name || biller_code) : undefined,
        phoneNumber: (biller_type?.toUpperCase() === "AIRTIME" || biller_type?.toUpperCase() === "DATA") ? customer_id : undefined,
        meterNumber: (biller_type?.toUpperCase() === "ELECTRICITY" || biller_type?.toUpperCase() === "UTILITY") ? customer_id : undefined,
        smartcardNumber: (biller_type?.toUpperCase() === "CABLE") ? customer_id : undefined,

        provider: "Flutterwave",
        preLoadedUser,
        preLoadedWallet,
      });

      return {
        success: true,
        reference,
      };
    });

    if (!transactionResult.success) {
      return NextResponse.json({ error: transactionResult.error }, { status: 400 });
    }

    // Call dynamic PaymentGatewayManager to select prioritized provider
    const featureName = biller_type?.toUpperCase() === "AIRTIME" ? "airtime" :
                        biller_type?.toUpperCase() === "DATA" ? "data" : "bills";

    const gateway = await PaymentGatewayManager.selectGateway({
      country: "NG",
      currency: "NGN",
      feature: featureName,
    });

    const authHeader = req.headers.get("Authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : "";

    const isSandbox = uid === "mock-uid";

    const getNotificationPayload = () => {
      const desc = (description || "").toLowerCase();
      const bType = (biller_type || "").toLowerCase();
      const bName = (biller_name || "").toLowerCase();

      if (desc.includes("airtime") || bType.includes("airtime")) {
        return {
          title: "📱 Airtime Purchase Success",
          body: `Your airtime purchase of ₦${numAmount.toLocaleString()} to ${customer_id} is successful.`,
          type: "transaction" as const,
        };
      }
      if (desc.includes("data") || bType.includes("data") || bName.includes("data")) {
        return {
          title: "📶 Data Purchase Success",
          body: `Your data purchase of ₦${numAmount.toLocaleString()} to ${customer_id} is successful.`,
          type: "transaction" as const,
        };
      }
      if (desc.includes("electricity") || bType.includes("electricity") || bName.includes("electricity") || bType.includes("utility")) {
        return {
          title: "💡 Electricity Bill Payment",
          body: `Your electricity bill payment of ₦${numAmount.toLocaleString()} for meter ${customer_id} is successful.`,
          type: "transaction" as const,
        };
      }
      if (desc.includes("cable") || bType.includes("cable") || bName.includes("cable") || bName.includes("dstv") || bName.includes("gotv") || bName.includes("startimes")) {
        return {
          title: "📺 Cable TV Payment",
          body: `Your Cable TV subscription payment of ₦${numAmount.toLocaleString()} for account ${customer_id} is successful.`,
          type: "transaction" as const,
        };
      }
      return {
        title: "🧾 Payment Successful",
        body: `Your payment of ₦${numAmount.toLocaleString()} for ${biller_name || "utilities"} is successful.`,
        type: "transaction" as const,
      };
    };

    if (isSandbox) {
      logPaymentEvent({
        category: "Wallet Debited",
        userId: uid,
        message: `Successfully processed mock bill payment: ${description} (Ref: ${reference})`,
        processingTimeMs: Date.now() - startTime,
      });

      // Send Notification
      try {
        const payload = getNotificationPayload();
        NotificationService.sendPushNotification(uid, {
          ...payload,
          url: "/history",
          amount: totalChargeAmount,
          currency: "NGN",
          reference: reference,
          recipientName: customer_id || "Biller Operator",
          bankName: biller_name || (biller_code ? biller_code.toUpperCase() : "Utility Bill Payment"),
          channel: "Bill Payment",
        });
      } catch (notifErr: any) {
        console.error("[Notification Warning] Failed to dispatch mock bill payment notification:", notifErr.message);
      }

      return NextResponse.json({
        success: true,
        message: "Bill payment successfully processed!",
        data: {
          reference,
          tx_ref: reference,
          flw_ref: `MOCK-FLW-${Date.now()}`,
          amount: numAmount,
          customer: customer_id,
          biller_name,
        },
      });
    }

    try {
      console.log(`[PaymentGatewayManager] Processing bill payment via prioritized provider: [${gateway.name}]`);
      const paymentRes = await gateway.payBills({
        biller_code,
        item_code,
        amount: numAmount, // Base bill amount sent to provider
        customer_id,
        biller_name,
        biller_type: biller_type || "utility",
        reference,
      }, idToken);

      if (paymentRes.success) {
        logPaymentEvent({
          category: "Wallet Debited",
          userId: uid,
          message: `Successfully processed bill payment [${gateway.name}]: ${description} (Ref: ${reference})`,
          processingTimeMs: Date.now() - startTime,
        });

        // Send Notification
        try {
          const payload = getNotificationPayload();
          NotificationService.sendPushNotification(uid, {
            ...payload,
            url: "/history",
            amount: totalChargeAmount,
            currency: "NGN",
            reference: reference,
            recipientName: customer_id || "Biller Operator",
            bankName: biller_name || (biller_code ? biller_code.toUpperCase() : "Utility Bill Payment"),
            channel: "Bill Payment",
          });
        } catch (notifErr: any) {
          console.error("[Notification Warning] Failed to dispatch real bill payment notification:", notifErr.message);
        }

        // Update provider token / reference if returned
        const resObj = paymentRes as Record<string, any>;
        const provRef = resObj.tx_ref || resObj.flw_ref || resObj.reference;
        const token = resObj.token || resObj.recharge_token || resObj.data?.token;

        if (provRef || token) {
          try {
            const updatePayload: Record<string, any> = {};
            if (provRef) updatePayload.providerReference = String(provRef);
            if (token) updatePayload.token = String(token);

            await adminDb.collection("transactions").doc(`tx-${reference}`).update(updatePayload);
          } catch (updateErr: any) {
            console.warn("[Bills Pay] Failed to update transaction provider metadata:", updateErr.message);
          }
        }

        return NextResponse.json({
          success: true,
          message: "Bill payment successfully processed!",
          data: paymentRes,
        });
      } else {
        throw new Error(paymentRes.error || "Failed to complete payment with gateway.");
      }

    } catch (apiErr: unknown) {
      const err = apiErr as Error;
      console.error(`[Bills Pay Error] Execution failed on provider [${gateway.name}]:`, err.message);

      // Rollback totalChargeAmount (base bill + markup) atomically
      await adminDb.runTransaction(async (transaction) => {
        // 1. ALL READS: Execute all transaction.get() reads first
        const userDoc = await transaction.get(userRef);
        const walletRef = adminDb.collection("wallets").doc(`${uid}_NGN`);
        const walletDoc = await transaction.get(walletRef);

        if (userDoc.exists) {
          const preLoadedUser = {
            ref: userRef,
            data: userDoc.data() || {},
            balance: Number(userDoc.data()?.balance) || 0,
          };
          const preLoadedWallet = {
            ref: walletRef,
            data: walletDoc.exists ? walletDoc.data() || {} : {},
            balance: walletDoc.exists ? Number(walletDoc.data()?.balance) || 0 : 0,
          };

          // 2. ALL WRITES: Execute all updates sequentially
          const origTxRef = adminDb.collection("transactions").doc(`tx-${reference}`);
          transaction.update(origTxRef, { status: "FAILED" });

          await WalletService.creditWallet(transaction, {
            userId: uid,
            amount: totalChargeAmount,
            currency: "NGN",
            reference: `REFUND-${reference}`,
            description: `Refund for failed bill payment: ${description}`,
            recipientName: customer_id,
            walletType: walletType || "MAIN",
            type: "REFUND",
            category: (biller_type || "BILLS").toUpperCase(),
            preLoadedUser,
            preLoadedWallet,
            metadata: {
              billerCode: item_code || biller_code || "",
              billerName: biller_name || biller_code || "",
              billerType: biller_type || "",
              customerId: customer_id || "",
              phoneNumber: customer_id || "",
              network: biller_name || biller_code || "",
              originalReference: reference,
            },
          });
        }
      });

      // Reversal notification is best-effort and never affects the refund response.
      try {
        await NotificationService.sendReversalNotification({
          userId: uid,
          reference: `REFUND-${reference}`,
          originalReference: reference,
          amount: totalChargeAmount,
          currency: "NGN",
          transactionLabel: `${(biller_type || "bill").toString()} payment`,
          recipientName: customer_id,
        });
      } catch (notificationError: any) {
        console.warn("[Bills Reversal Notification] Dispatch failed:", notificationError?.message || notificationError);
      }

      const sanitizedError = sanitizeBillErrorMessage(err.message, biller_type || "bill");
      return NextResponse.json({
        error: `${sanitizedError} Wallet funds have been successfully refunded.`
      }, { status: 400 });
    }

  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Bills Pay Main Exception]:", error.message, error.stack);
    return NextResponse.json({ error: sanitizeBillErrorMessage(error.message, "bill") }, { status: 500 });
  }
}
