import { NextResponse } from "next/server";
import { authenticateUserRequest, verifyUserKycApproved } from "@/lib/auth-util";
import { WalletService } from "@/lib/wallet-service";
import { adminDb } from "@/lib/firebase-admin";
import { isRateLimited } from "@/lib/rate-limiter";
import { logPaymentEvent } from "@/lib/payment-logger";
import { NotificationService } from "@/services/notification-service";

export async function POST(req: Request) {
  const startTime = Date.now();
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";

  // Rate Limiting: 20 bill-payment requests per minute max
  if (isRateLimited(ip, 20, 60 * 1000)) {
    return NextResponse.json({ error: "Too many utility requests. Please try again later." }, { status: 429 });
  }

  let uid = "";
  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized: Invalid or missing authorization token." }, { status: 401 });
  }

  // Enforce KYC verification
  const isApproved = await verifyUserKycApproved(uid);
  if (!isApproved) {
    return NextResponse.json({ error: "Forbidden: Account verification is required to perform financial transactions." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { amount, currency, type, recipient, userId } = body;

    const targetUserId = userId || uid;
    if (uid !== targetUserId) {
      return NextResponse.json({ error: "Forbidden: You do not own this wallet." }, { status: 403 });
    }

    const payAmount = Number(amount);
    const payCurrency = currency || "NGN";

    // Validations
    if (!amount || isNaN(payAmount) || payAmount <= 0) {
      return NextResponse.json({ error: "Invalid bill payment amount." }, { status: 400 });
    }
    if (!type || !["AIRTIME", "DATA", "BILLS"].includes(type)) {
      return NextResponse.json({ error: "Invalid payment type. Must be AIRTIME, DATA, or BILLS." }, { status: 400 });
    }
    if (!recipient) {
      return NextResponse.json({ error: "Recipient info is required." }, { status: 400 });
    }

    const ref_id = `bil-${uid}-${Date.now()}`;

    // Perform atomic transaction to deduct wallet balance and log the transaction record in general ledger
    const result = await adminDb.runTransaction(async (transaction) => {
      try {
        const debitRes = await WalletService.debitWallet(transaction, {
          userId: targetUserId,
          amount: payAmount,
          currency: payCurrency,
          reference: ref_id,
          type: type as "AIRTIME" | "DATA" | "BILLS",
          description: `${type} purchase for ${recipient}`,
          recipientName: recipient,
          fee: 0,
        });

        return {
          success: true,
          newBalance: debitRes.newBalance,
        };
      } catch (err: unknown) {
        const error = err as Error;
        return {
          success: false,
          error: error.message,
        };
      }
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Log structured Wallet Debited event
    logPaymentEvent({
      category: "Wallet Debited",
      userId: targetUserId,
      tx_ref: ref_id,
      amount: payAmount,
      currency: payCurrency,
      message: `Successfully processed secure utility ${type} purchase for ${recipient}. New Balance: ₦${result.newBalance}`,
      processingTimeMs: Date.now() - startTime,
    });

    // Best-effort push notification. Never block or fail the financial response.
    NotificationService.sendPushNotification(targetUserId, {
      title: `✅ ${String(type).replace(/_/g, " ")} Payment Successful`,
      body: `Your ${String(type).toLowerCase()} payment of ₦${payAmount.toLocaleString()} to ${recipient} was completed successfully.`,
      type: "transaction",
      url: "/history",
      amount: payAmount,
      currency: payCurrency,
      reference: ref_id,
      recipientName: recipient,
      channel: "Bill Payment",
    }).catch((notificationError) => {
      console.warn("[Bill API Notification] Push dispatch failed:", notificationError?.message || notificationError);
    });

    return NextResponse.json({
      success: true,
      message: `${type} purchase completed successfully!`,
      newBalance: result.newBalance,
      reference: ref_id,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Bill API Exception] Process crashed:", error.message, error.stack);
    return NextResponse.json({ error: "Internal Bill Processing Error" }, { status: 500 });
  }
}
