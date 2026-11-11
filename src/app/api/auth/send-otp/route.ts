import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import crypto from "crypto";
import { sendEmail } from "@/lib/email-service";
import { getGatewayUrl } from "@/lib/gateway-util";

const GATEWAY_URL = getGatewayUrl();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { channel = "whatsapp", phonePrefix, phoneNumber, email } = body;

    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // =========================================================================
    // CHANNEL 1: EMAIL OTP
    // =========================================================================
    if (channel === "email") {
      if (!email || !email.includes("@")) {
        return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
      }

      const cleanEmail = email.trim().toLowerCase();

      // Cooldown check for email
      const cooldownRef = adminDb.collection("otp_cooldowns").doc(`signup_email_${cleanEmail}`);
      const cooldownSnap = await cooldownRef.get();
      if (cooldownSnap.exists) {
        const lastSent = cooldownSnap.data()?.lastSentAt || 0;
        if (now - lastSent < 60000) {
          const remaining = Math.ceil((60000 - (now - lastSent)) / 1000);
          return NextResponse.json(
            { error: `Please wait ${remaining} seconds before requesting another email verification code.` },
            { status: 429 }
          );
        }
      }

      // Generate 6-digit OTP code and hash it
      const rawOtp = crypto.randomInt(100000, 999999).toString();
      const expiresAtMs = now + 5 * 60 * 1000; // 5 minutes

      const HMAC_SECRET = process.env.CPANEL_SESSION_SECRET || process.env.JWT_SECRET || "signup_otp_secret_key";
      const otpHash = crypto.createHmac("sha256", HMAC_SECRET).update(rawOtp.trim()).digest("hex");

      // Store in Firestore signup_email_otps with hashed OTP
      const otpDocRef = adminDb.collection("signup_email_otps").doc(cleanEmail);
      await otpDocRef.set({
        email: cleanEmail,
        otpHash,
        attempts: 0,
        consumed: false,
        createdAtMs: now,
        expiresAtMs,
        createdAt: nowIso,
      });

      // Send HTML Email
      const escapeHtml = (str: string) => String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
      const safeRawOtp = escapeHtml(rawOtp);

      const dispatched = await sendEmail({
        to: cleanEmail,
        subject: "Welcome to E-Global Pay - Email Verification Code",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #FC7A00; margin-bottom: 16px;">E-Global Pay Account Registration</h2>
            <p>Hello,</p>
            <p>Thank you for choosing E-Global Pay! Use the 6-digit verification code below to verify your email address and complete your account registration:</p>
            <div style="background-color: #f4f4f4; padding: 15px; font-size: 26px; font-weight: bold; text-align: center; letter-spacing: 6px; color: #333; margin: 20px 0; border-radius: 4px;">
              ${safeRawOtp}
            </div>
            <p>This code expires in 5 minutes. Do not share this code with anyone.</p>
          </div>
        `,
      });

      if (!dispatched) {
        return NextResponse.json({ error: "Failed to dispatch email verification code. Please check your email address or try again." }, { status: 502 });
      }

      // Update cooldown
      await cooldownRef.set({
        email: cleanEmail,
        lastSentAt: now,
        updatedAt: nowIso,
      });

      return NextResponse.json({
        success: true,
        channel: "email",
        message: "Verification code sent to your email address successfully!",
      });
    }

    // =========================================================================
    // CHANNEL 2: WHATSAPP OTP
    // =========================================================================
    if (!phonePrefix || !phoneNumber) {
      return NextResponse.json({ error: "Phone prefix and phone number are required for WhatsApp verification." }, { status: 400 });
    }

    const cleanPrefix = phonePrefix.trim().replace(/\D/g, "");
    const cleanNum = phoneNumber.trim().replace(/\D/g, "");
    const fullPhoneNumber = `${cleanPrefix}${cleanNum}`;

    // Server-side cooldown check (60s rate limit lock against duplicate OTP spam)
    const cooldownRef = adminDb.collection("otp_cooldowns").doc(`signup_${fullPhoneNumber}`);
    const cooldownSnap = await cooldownRef.get();
    if (cooldownSnap.exists) {
      const cooldownData = cooldownSnap.data() || {};
      const lastSent = cooldownData.lastSentAt || 0;
      if (now - lastSent < 60000) {
        const remaining = Math.ceil((60000 - (now - lastSent)) / 1000);
        return NextResponse.json(
          { error: `Please wait ${remaining} seconds before requesting another OTP code.` },
          { status: 429 }
        );
      }
    }

    const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (gatewayApiKey) headers["x-api-key"] = gatewayApiKey;

    const response = await fetch(`${GATEWAY_URL}/api/auth/send-otp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phoneNumber: fullPhoneNumber,
        type: "signup"
      }),
    });

    const responseText = await response.text();
    let result: any = {};
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error("[WhatsApp OTP Send Proxy] Received non-JSON response from gateway:", responseText);
      if (responseText.includes("Cannot POST") || responseText.includes("<!DOCTYPE") || response.status === 404) {
        return NextResponse.json({
          error: "WhatsApp OTP service is currently unavailable. Please use Email verification instead."
        }, { status: 502 });
      }
      return NextResponse.json({
        error: `Database Gateway unreachable or returned an invalid response (HTTP ${response.status}).`
      }, { status: 502 });
    }

    if (!response.ok) {
      let rawErr = String(result.message || result.error || "Failed to send WhatsApp OTP.");
      if (
        rawErr.includes("WhatsApp instance") ||
        rawErr.includes("not active or connected") ||
        rawErr.includes("WhatsApp Dispatch Failed") ||
        rawErr.includes("WHATSAPP_API") ||
        rawErr.includes("Cannot POST") ||
        rawErr.includes("<!DOCTYPE")
      ) {
        rawErr = "WhatsApp OTP is not available at this time. Please use Email verification instead.";
      }
      return NextResponse.json({ error: rawErr }, { status: response.status });
    }

    // Set server-side OTP request cooldown lock
    await cooldownRef.set({
      fullPhoneNumber,
      lastSentAt: now,
      updatedAt: nowIso,
    });

    return NextResponse.json({
      success: true,
      channel: "whatsapp",
      message: result.message || "OTP sent successfully to WhatsApp.",
    });

  } catch (err: unknown) {
    const error = err as Error;
    console.error("[OTP Send Proxy Error]:", error);
    return NextResponse.json({ error: error.message || "Failed to send OTP code." }, { status: 500 });
  }
}
