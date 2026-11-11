import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";
import crypto from "crypto";
import { getGatewayUrl } from "@/lib/gateway-util";

const GATEWAY_URL = getGatewayUrl();

export async function POST(req: Request) {
  try {
    let authUser = null;
    try {
      authUser = await authenticateUserRequest(req);
    } catch {
      // Optional auth token parse
    }

    const authHeader = req.headers.get("Authorization") || "";
    const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

    const body = await req.json().catch(() => ({}));
    const { otpCode, channel = "whatsapp" } = body;

    const now = Date.now();

    // =========================================================================
    // CHANNEL 1: EMAIL OTP VERIFICATION (Handled directly in Next.js)
    // =========================================================================
    if (channel === "email") {
      if (!authUser || !authUser.uid) {
        return NextResponse.json({ error: "Authentication required to verify OTP." }, { status: 401 });
      }

      if (!otpCode || String(otpCode).trim().length !== 6) {
        return NextResponse.json({ error: "Please enter a valid 6-digit OTP code." }, { status: 400 });
      }

      const uid = authUser.uid;
      const docRef = adminDb.collection("otp_sessions").doc(`pin_reset_email_${uid}`);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return NextResponse.json({ error: "No active Email OTP session found. Please request a new code." }, { status: 400 });
      }

      const data = docSnap.data() || {};

      if (data.consumed) {
        return NextResponse.json({ error: "This OTP code has already been consumed. Please request a new code." }, { status: 400 });
      }

      if (data.expiresAtMs && now > data.expiresAtMs) {
        return NextResponse.json({ error: "OTP code has expired. Please request a new code." }, { status: 400 });
      }

      let attempts = Number(data.attempts) || 0;
      if (attempts >= 5) {
        return NextResponse.json({ error: "Maximum OTP attempts exceeded. Please request a new code." }, { status: 429 });
      }

      // Verify HMAC-SHA256 OTP Hash
      const HMAC_SECRET = process.env.CPANEL_SESSION_SECRET || process.env.JWT_SECRET || "pin_reset_otp_secret_key";
      const submittedHash = crypto.createHmac("sha256", HMAC_SECRET).update(String(otpCode).trim()).digest("hex");

      if (submittedHash !== data.otpHash) {
        attempts += 1;
        await docRef.update({ attempts });
        return NextResponse.json({ error: `Incorrect OTP code. ${Math.max(0, 5 - attempts)} attempts remaining.` }, { status: 400 });
      }

      // Mark OTP session as verified in Firestore
      await docRef.update({
        verified: true,
        verifiedAtMs: now,
        verifiedAt: new Date(now).toISOString(),
      });

      return NextResponse.json({
        success: true,
        message: "Email OTP verified successfully. Proceed to reset PIN."
      });
    }

    // =========================================================================
    // CHANNEL 2: WHATSAPP OTP VERIFICATION (Proxy to Payment Gateway VM)
    // =========================================================================
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": authHeader,
    };
    if (gatewayApiKey) headers["x-api-key"] = gatewayApiKey;

    let response = await fetch(`${GATEWAY_URL}/api/auth/pin-verify-otp`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    let responseText = await response.text().catch(() => "");

    // Fallback: If gateway doesn't have /api/auth/pin-verify-otp (404), route to /api/auth/verify-otp
    if (response.status === 404 || responseText.includes("Cannot POST")) {
      let userPhone = (body.phoneNumber || body.phone || "").trim();
      if (!userPhone && authUser?.uid) {
        try {
          const uSnap = await adminDb.collection("users").doc(authUser.uid).get();
          if (uSnap.exists) {
            const uData = uSnap.data() || {};
            userPhone = (uData.phoneNumber || uData.phone || authUser.email || "").trim();
          }
        } catch {
          // Ignore lookup fail
        }
      }

      if (userPhone) {
        const cleanPhone = userPhone.replace(/[^\d+]/g, "");
        const fallbackRes = await fetch(`${GATEWAY_URL}/api/auth/verify-otp`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            phoneNumber: cleanPhone,
            otpCode,
            type: "pin_reset",
            ...body
          }),
          signal: controller.signal,
        });

        if (fallbackRes) {
          response = fallbackRes;
          responseText = await response.text().catch(() => "");
        }
      }
    }

    clearTimeout(timeoutId);

    let result: Record<string, any> = {};

    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      if (responseText.includes("504") || responseText.includes("Gateway Time-out")) {
        result = { error: "Gateway timed out while connecting to server. Please try again in a few seconds." };
      } else if (responseText.includes("Cannot POST") || responseText.includes("<!DOCTYPE")) {
        result = { error: "WhatsApp OTP verification service is currently unavailable." };
      } else {
        result = { error: responseText || "Server returned non-JSON response." };
      }
    }

    if (!response.ok) {
      let rawErr = String(result.error || result.message || "Failed to verify OTP.");
      if (
        rawErr.includes("Cannot POST") ||
        rawErr.includes("<!DOCTYPE") ||
        rawErr.includes("html") ||
        response.status === 404 ||
        response.status === 502 ||
        response.status === 503
      ) {
        rawErr = "WhatsApp OTP verification service is currently unavailable.";
      }
      return NextResponse.json(
        { error: rawErr },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message || "OTP verified successfully. Proceed to reset PIN."
    });

  } catch (err: unknown) {
    const error = err as Error;
    console.error("[PIN Reset Verify OTP Proxy] Error:", error);
    const isTimeout = error.name === "AbortError";
    const errorMessage = isTimeout
      ? "Server connection timed out. Please try again in a few seconds."
      : (error.message || "Failed to verify OTP.");

    return NextResponse.json({ error: errorMessage }, { status: isTimeout ? 504 : 500 });
  }
}
