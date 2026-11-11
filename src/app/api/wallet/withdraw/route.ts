import { NextResponse } from "next/server";
import { authenticateUserRequest, verifyUserKycApproved } from "@/lib/auth-util";
import { WalletService } from "@/lib/wallet-service";
import { adminDb } from "@/lib/firebase-admin";
import { isRateLimited } from "@/lib/rate-limiter";
import { logPaymentEvent } from "@/lib/payment-logger";

export async function POST(req: Request) {
  const startTime = Date.now();
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";

  // Rate Limiting: 10 withdrawal requests per minute max to prevent drainage attempts
  if (isRateLimited(ip, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many withdrawal requests. Please try again later." }, { status: 429 });
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
    const { amount, currency, bankCode, accountNumber, userId } = body;

    // Enforce ownership
    const targetUserId = userId || uid;
    if (uid !== targetUserId) {
      return NextResponse.json({ error: "Forbidden: You do not own this wallet." }, { status: 403 });
    }

    const withdrawAmount = Number(amount);
    const withdrawCurrency = currency || "NGN";

    // Validations
    if (!amount || isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal amount." }, { status: 400 });
    }
    if (!bankCode || !accountNumber) {
      return NextResponse.json({ error: "Bank code and account number are required parameters." }, { status: 400 });
    }

    const ref_id = `wth-${uid}-${Date.now()}`;

    // Perform withdrawal inside a secure single Firestore Transaction using WalletService
    const result = await adminDb.runTransaction(async (transaction) => {
      try {
        const debitRes = await WalletService.debitWallet(transaction, {
          userId: targetUserId,
          amount: withdrawAmount,
          currency: withdrawCurrency,
          reference: ref_id,
          type: "WITHDRAWAL",
          description: `Withdrawal to Bank Acc: ${accountNumber} (${bankCode})`,
          recipientName: `Acc: ${accountNumber}`,
          fee: 0, // standard free withdrawal or custom fee
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

    // Log structured Withdrawal event
    logPaymentEvent({
      category: "Withdrawal",
      userId: targetUserId,
      tx_ref: ref_id,
      amount: withdrawAmount,
      currency: withdrawCurrency,
      message: `Successfully processed secure wallet withdrawal. New Balance: ₦${result.newBalance}`,
      processingTimeMs: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      message: "Withdrawal processed successfully!",
      newBalance: result.newBalance,
      reference: ref_id,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Withdrawal API Exception] Process crashed:", error.message, error.stack);
    return NextResponse.json({ error: "Internal Withdrawal Processing Error" }, { status: 500 });
  }
}
