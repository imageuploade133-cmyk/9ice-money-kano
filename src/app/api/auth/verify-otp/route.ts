import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import crypto from "crypto";
import { getGatewayUrl } from "@/lib/gateway-util";

const GATEWAY_URL = getGatewayUrl();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { channel = "whatsapp", phonePrefix, phoneNumber, email, otpCode } = body;

    if (!otpCode || String(otpCode).trim().length !== 6) {
      return NextResponse.json({ error: "A valid 6-digit OTP code is required." }, { status: 400 });
    }

    const submittedOtp = String(otpCode).trim();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // =========================================================================
    // CHANNEL 1: EMAIL OTP VERIFICATION
    // =========================================================================
    if (channel === "email") {
      if (!email || !email.includes("@")) {
        return NextResponse.json({ error: "Valid email address is required for Email verification." }, { status: 400 });
      }

      const cleanEmail = email.trim().toLowerCase();
      const otpDocRef = adminDb.collection("signup_email_otps").doc(cleanEmail);

      const isVerified = await adminDb.runTransaction(async (transaction) => {
        const otpSnap = await transaction.get(otpDocRef);
        if (!otpSnap.exists) {
          throw new Error("Verification code not found or expired. Please request a new code.");
        }

        const otpData = otpSnap.data() || {};

        if (otpData.consumed === true) {
          throw new Error("This verification code has already been used. Please request a new code.");
        }

        if (now > otpData.expiresAtMs) {
          throw new Error("Verification code has expired. Please request a new code.");
        }

        if (otpData.attempts >= 3) {
          throw new Error("Too many failed attempts. Please request a new verification code.");
        }

        const HMAC_SECRET = process.env.CPANEL_SESSION_SECRET || process.env.JWT_SECRET || "signup_otp_secret_key";
        const hashedSubmitted = crypto.createHmac("sha256", HMAC_SECRET).update(submittedOtp).digest("hex");

        const isValid = otpData.otpHash ? (otpData.otpHash === hashedSubmitted) : (otpData.otpCode === submittedOtp);

        if (!isValid) {
          const updatedAttempts = (otpData.attempts || 0) + 1;
          transaction.update(otpDocRef, { attempts: updatedAttempts });
          const remaining = Math.max(0, 3 - updatedAttempts);
          throw new Error(`Incorrect verification code. You have ${remaining} attempt(s) remaining.`);
        }

        // Mark consumed
        transaction.update(otpDocRef, {
          consumed: true,
          consumedAt: nowIso,
          verified: true,
        });

        return true;
      });

      return NextResponse.json({
        success: true,
        channel: "email",
        message: "Email address verified successfully!",
      });
    }

    // =========================================================================
    // CHANNEL 2: WHATSAPP OTP VERIFICATION
    // =========================================================================
    if (!phonePrefix || !phoneNumber) {
      return NextResponse.json({ error: "Phone prefix and phone number are required for WhatsApp verification." }, { status: 400 });
    }

    const cleanPrefix = phonePrefix.trim().replace(/\D/g, "");
    const cleanNum = phoneNumber.trim().replace(/\D/g, "");
    const fullPhoneNumber = `${cleanPrefix}${cleanNum}`;

    const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (gatewayApiKey) headers["x-api-key"] = gatewayApiKey;

    const response = await fetch(`${GATEWAY_URL}/api/auth/verify-otp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phoneNumber: fullPhoneNumber,
        otp: submittedOtp,
        type: "signup"
      }),
    });

    const responseText = await response.text();
    let result: any = {};
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error("[WhatsApp OTP Verify Proxy] Received non-JSON response from gateway:", responseText);
      if (responseText.includes("Cannot POST") || responseText.includes("<!DOCTYPE") || response.status === 404) {
        return NextResponse.json({
          error: "WhatsApp OTP verification service is currently unavailable."
        }, { status: 502 });
      }
      return NextResponse.json({
        error: `Database Gateway unreachable or returned an invalid response (HTTP ${response.status}).`
      }, { status: 502 });
    }

    if (!response.ok) {
      let rawErr = String(result.message || result.error || "Failed to verify WhatsApp OTP.");
      if (rawErr.includes("Cannot POST") || rawErr.includes("<!DOCTYPE")) {
        rawErr = "WhatsApp OTP verification service is currently unavailable.";
      }
      return NextResponse.json({ error: rawErr }, { status: response.status });
    }

    return NextResponse.json({
      success: true,
      channel: "whatsapp",
      message: result.message || "WhatsApp number verified successfully."
    });

  } catch (err: unknown) {
    const error = err as Error;
    console.error("[OTP Verify Proxy Exception]:", error);
    return NextResponse.json({ error: error.message || "Failed to verify OTP code." }, { status: 400 });
  }
}
