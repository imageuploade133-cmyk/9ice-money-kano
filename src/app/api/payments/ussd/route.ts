import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";
import { safeParseJson } from "@/lib/utils";
import { isRateLimited } from "@/lib/rate-limiter";
import { logPaymentEvent } from "@/lib/payment-logger";
import { resolveUssdCode } from "@/lib/ussd-resolver";
import { getGatewayUrl } from "@/lib/gateway-util";

export async function POST(req: Request) {
  const startTime = Date.now();
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";

  // Rate Limiting: 20 payment initializations per minute max
  if (isRateLimited(ip, 20, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  // Verify that the Authorization header is being decoded correctly.
  const authHeader = req.headers.get("Authorization") || "";
  console.log("[USSD Payment API] Authentication header received:", authHeader ? `${authHeader.substring(0, 30)}...` : "None");

  let uid = "";
  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult?.uid || "";
    console.log("[USSD Payment API] Successfully decoded Authorization header. Extracted UID:", uid);
  } catch (authErr: unknown) {
    const err = authErr as Error;
    console.error("[USSD Auth Error] Decoding Authorization header failed:", err.message || err);
    return NextResponse.json({ error: "Unauthorized: Invalid or missing authorization token." }, { status: 401 });
  }

  // Verify that Firebase Authentication is correctly extracting the user id.
  // The API must reject requests if uid is undefined instead of calling Firestore.
  if (!uid || typeof uid !== "string" || uid.trim() === "") {
    console.error("[USSD Auth Error] Authenticated user id is missing, undefined, or empty.");
    return NextResponse.json({
      success: false,
      message: "Authenticated user id missing."
    }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Step 5: Log everything - Before validation
    console.log("Incoming USSD body", body);

    const {
      amount,
      currency,
      bankCode,
      bank_code,
      bankId,
      bankName,
      bank_name,
      email,
      name,
      fullname,
      phone,
      phone_number,
      tx_ref,
      txRef,
      userId
    } = body;

    const payAmount = Number(amount);
    const payCurrency = currency || "NGN";

    // Validations (standard basic request checks, not restricting any bank)
    if (!amount || isNaN(payAmount) || payAmount <= 0) {
      return NextResponse.json({ error: "Invalid payment amount." }, { status: 400 });
    }

    const finalBankCode = bank_code || bankCode || bankId;
    if (!finalBankCode) {
      return NextResponse.json({ error: "Selected bank is required." }, { status: 400 });
    }

    const finalTxRef = tx_ref || txRef || `flw-tx-${uid}-${Date.now()}`;

    // Ensure every Firestore document path uses a valid uid. Never call doc(undefined) or doc("")
    if (!finalTxRef || typeof finalTxRef !== "string" || finalTxRef.trim() === "") {
      console.error("[USSD Payment API Error] Generated tx_ref is empty or invalid:", finalTxRef);
      return NextResponse.json({ error: "Invalid transaction reference." }, { status: 400 });
    }

    // Step 6 / Tasks: Add verbose logging before Firestore access
    console.log("UID:", uid);
    console.log("Document path:", `pending_payments/${finalTxRef}`);
    console.log("Request Body:", JSON.stringify(body));

    // Create a server-managed pending payment record in Firestore first
    console.log(`[USSD Payment Init] Creating pending payment record: pending_payments/${finalTxRef}`);
    await adminDb.collection("pending_payments").doc(finalTxRef).set({
      userId: userId || uid,
      amount: payAmount,
      currency: payCurrency,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    // Write pending ledger transaction document in transactions collection for activity history
    await adminDb.collection("transactions").doc(`tx-FUNDING-${finalTxRef}`).set({
      userId: userId || uid,
      amount: payAmount,
      currency: payCurrency,
      reference: finalTxRef,
      transactionNumber: finalTxRef,
      providerReference: finalTxRef,
      type: "WALLET_FUNDING",
      category: "deposit",
      direction: "CREDIT",
      title: "Wallet Funding",
      description: "USSD Payment",
      recipientName: "Self",
      creditedTo: "Available Balance",
      fundingMethod: "USSD",
      status: "PENDING",
      fee: 0,
      totalCredited: 0,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      transactionDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }, { merge: true });

    const gatewayAuthHeader = req.headers.get("Authorization") || "";
    const idToken = gatewayAuthHeader.startsWith("Bearer ") ? gatewayAuthHeader.split("Bearer ")[1] : "";

    // The gateway validates Firebase JWT sessions server-side. The client already
    // supplies X-Session-ID to this Next.js route; preserve it when this route
    // makes the server-to-server gateway call. Without forwarding it, the gateway
    // correctly rejects a valid new-device-verified login with REVOKED_SESSION.
    const sessionId =
      req.headers.get("X-Session-ID") ||
      req.headers.get("x-session-id") ||
      "";

    // Step 4: Forward ALL fields exactly as received. Do not discard fields.
    const gatewayPayload = {
      tx_ref: finalTxRef,
      amount: payAmount.toString(),
      currency: payCurrency,
      email: email || "captain@example.com",
      phone_number: phone_number || phone || "08012345678",
      fullname: fullname || name || "Customer",
      type: "ussd",
      country: "NG",
      account_bank: finalBankCode,
      ...body // Forward all fields exactly as received
    };

    // Step 5: Log everything - Before forwarding
    console.log("Sending to Payment Gateway", gatewayPayload);

    // Proxy request directly to Payment Gateway URL
    const response = await fetch(`${getGatewayUrl()}/api/flutterwave/charges?type=ussd`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json",
        ...(sessionId ? { "X-Session-ID": sessionId } : {}),
      },
      body: JSON.stringify(gatewayPayload),
    });

    const resData = await safeParseJson(response);

    // Step 5: Log everything - After forwarding
    console.log("Gateway response", resData);

    if (!response.ok || resData.status === "error" || resData.status === "failed") {
      const errMsg = resData.message || resData.error || `HTTP Error ${response.status}`;
      return NextResponse.json({
        success: false,
        error: errMsg,
        ...resData
      }, { status: response.ok ? 200 : response.status });
    }

    const flwData = resData.data || resData || {};
    const auth = resData.meta?.authorization ||
                 resData.data?.meta?.authorization ||
                 resData.data?.authorization ||
                 {};

    const rawNote = auth.note ||
                    auth.validate_instructions ||
                    auth.instruction ||
                    flwData.payment_code ||
                    flwData.payment_instruction ||
                    resData.payment_code ||
                    resData.payment_instruction;

    const targetBankName = bankName || bank_name || flwData.account_bank;
    const authNote = resolveUssdCode(finalBankCode, targetBankName, payAmount, rawNote);

    logPaymentEvent({
      category: "Payment Initialized",
      userId: uid,
      tx_ref: finalTxRef,
      amount: payAmount,
      currency: payCurrency,
      message: `USSD Charge initiated successfully for bank ${flwData.account_bank || "Selected Bank"}. Code: ${authNote}`,
      processingTimeMs: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      status: "pending",
      flwId: flwData.id || "flw-test-id",
      txRef: finalTxRef,
      ussdCode: authNote,
      bankName: flwData.account_bank || "Selected Bank",
      ...resData
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[USSD Payment API Exception] Initiating failed:", error.message, error.stack);
    return NextResponse.json({ error: error.message || "Internal Server Error initiating USSD payment." }, { status: 500 });
  }
}
