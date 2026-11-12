import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { PaymentService } from "@/lib/payment-service";
import { adminDb } from "@/lib/firebase-admin";
import { isRateLimited } from "@/lib/rate-limiter";
import { logPaymentEvent } from "@/lib/payment-logger";

export async function POST(req: Request) {
  const startTime = Date.now();
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";

  // Rate Limiting: 20 payment initializations per minute max
  if (isRateLimited(ip, 20, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  let uid = "";
  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized: Invalid or missing authorization token." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { amount, currency, email, name, phone, firstname, lastname, narration } = body;

    const payAmount = Number(amount);
    const payCurrency = currency || "NGN";

    // Validations
    if (!amount || isNaN(payAmount) || payAmount <= 0) {
      return NextResponse.json({ error: "Invalid payment amount." }, { status: 400 });
    }
    if (!email || !name) {
      return NextResponse.json({ error: "Name and email are required customer fields." }, { status: 400 });
    }

    const tx_ref = `flw-tx-${uid}-${Date.now()}`;

    // Create a server-managed pending payment record in Firestore first
    console.log(`[Bank Transfer Payment Init] Creating pending payment record: pending_payments/${tx_ref}`);
    await adminDb.collection("pending_payments").doc(tx_ref).set({
      userId: uid,
      amount: payAmount,
      currency: payCurrency,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    // Write pending ledger transaction document in transactions collection for activity history
    await adminDb.collection("transactions").doc(`tx-FUNDING-${tx_ref}`).set({
      userId: uid,
      amount: payAmount,
      currency: payCurrency,
      reference: tx_ref,
      transactionNumber: tx_ref,
      providerReference: tx_ref,
      type: "WALLET_FUNDING",
      category: "deposit",
      direction: "CREDIT",
      title: "Wallet Funding",
      description: "Bank Transfer",
      recipientName: "Self",
      creditedTo: "Available Balance",
      fundingMethod: "BANK_TRANSFER",
      status: "PENDING",
      fee: 0,
      totalCredited: 0,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      transactionDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }, { merge: true });

    const authHeader = req.headers.get("Authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : "";
    const sessionId = req.headers.get("X-Session-ID") || req.headers.get("x-session-id") || "";

    // Request the Virtual Account from VM Payment Gateway
    const transferDetails = await PaymentService.createBankTransferPayment({
      tx_ref,
      amount: payAmount,
      email,
      phone_number: phone || "08012345678",
      fullname: name,
      firstname,
      lastname,
      narration,
    }, idToken, sessionId);

    logPaymentEvent({
      category: "Payment Initialized",
      userId: uid,
      tx_ref,
      amount: payAmount,
      currency: payCurrency,
      message: `Bank Transfer virtual account created successfully for Wema. Account: ${transferDetails.accountNumber}`,
      processingTimeMs: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      ...transferDetails,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Bank Transfer Payment API Exception] Initiating failed:", error.message, error.stack);
    return NextResponse.json({ error: error.message || "Internal Server Error initiating Bank Transfer payment." }, { status: 500 });
  }
}
