import { NextResponse } from "next/server";
import { PaymentService } from "@/lib/payment-service";
import { isRateLimited } from "@/lib/rate-limiter";
import { authenticateUserRequest } from "@/lib/auth-util";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";

  // Rate Limiting: 60 status checks per minute max (allows fast polling from active checkout screens)
  if (isRateLimited(ip, 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  try {
    const authResult = await authenticateUserRequest(req);
    const uid = authResult.uid;

    if (!uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const txRef = searchParams.get("txRef");

    if (!txRef) {
      return NextResponse.json({ error: "Missing required query parameter 'txRef'." }, { status: 400 });
    }

    console.log(`[Polling Payment Status] txRef: ${txRef} by user ${uid}`);

    const authHeader = req.headers.get("Authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : "";
    const sessionId = req.headers.get("X-Session-ID") || req.headers.get("x-session-id") || "";

    // Call service layer to verify reference status on VM Payment Gateway
    const statusResult = await PaymentService.checkPaymentStatus(txRef, idToken, sessionId);

    return NextResponse.json({
      success: true,
      ...statusResult,
    });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message && error.message.includes("REVOKED_SESSION")) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[Payment Status API Exception] Checking failed:", error.message, error.stack);
    return NextResponse.json({ error: "Internal Server Error checking payment status." }, { status: 500 });
  }
}
