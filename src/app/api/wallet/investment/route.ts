import { NextResponse } from "next/server";
import { authenticateUserRequest, verifyUserKycApproved } from "@/lib/auth-util";
import { InvestmentService } from "@/services/investment-service";
import { isRateLimited } from "@/lib/rate-limiter";
import { logPaymentEvent } from "@/lib/payment-logger";

export async function POST(req: Request) {
  const startTime = Date.now();
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";

  // Rate Limiting: 10 requests per minute max
  if (isRateLimited(ip, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many investment actions. Please try again later." }, { status: 429 });
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
    const { amount, currency, optionId, optionName, userId } = body;

    const targetUserId = userId || uid;
    if (uid !== targetUserId) {
      return NextResponse.json({ error: "Forbidden: You do not own this wallet." }, { status: 403 });
    }

    const investAmount = Number(amount);
    const investCurrency = currency || "NGN";

    // Inputs Validation
    if (!amount || isNaN(investAmount) || investAmount <= 0) {
      return NextResponse.json({ error: "Invalid investment amount." }, { status: 400 });
    }
    if (!optionId) {
      return NextResponse.json({ error: "Missing required savings plan option ID." }, { status: 400 });
    }

    // Call the unified production InvestmentService
    const record = await InvestmentService.createInvestment(targetUserId, {
      amount: investAmount,
      currency: investCurrency,
      productId: optionId,
      type: "SAVINGS",
    });

    // Log structured Investment Created event
    logPaymentEvent({
      category: "Investment Created",
      userId: targetUserId,
      tx_ref: record.id,
      amount: investAmount,
      currency: investCurrency,
      message: `Successfully created locked savings via legacy endpoint for plan ${optionName}. Ref: ${record.id}`,
      processingTimeMs: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      message: "Locked savings plan successfully active!",
      investment: record,
      reference: record.id,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Investment Legacy API Exception] Process crashed:", error.message);
    return NextResponse.json({ error: error.message || "Internal Investment Processing Error" }, { status: 400 });
  }
}
