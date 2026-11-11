import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";
import crypto from "crypto";
import { sendEmail } from "@/lib/email-service";
import { getGatewayUrl } from "@/lib/gateway-util";

const GATEWAY_URL = getGatewayUrl();

export async function POST(req: Request) {
  try {
    let authUser = null;
    try {
      authUser = await authenticateUserRequest(req);
    } catch {
      // Optional auth check - if client passes Bearer token
    }

    const authHeader = req.headers.get("Authorization") || "";
    const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

    const body = await req.json().catch(() => ({}));
    const { channel = "whatsapp" } = body;

    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // =========================================================================
    // CHANNEL 1: EMAIL OTP (Handled directly in Next.js)
    // =========================================================================
    if (channel === "email") {
      if (!authUser || !authUser.uid) {
        return NextResponse.json({ error: "Authentication required to reset PIN via Email." }, { status: 401 });
      }

      const uid = authUser.uid;

      // Look up user document to get email address
      const userSnap = await adminDb.collection("users").doc(uid).get();
      if (!userSnap.exists) {
        return NextResponse.json({ error: "User profile not found." }, { status: 404 });
      }

      const userData = userSnap.data() || {};
      const userEmail = (userData.email || authUser.email || "").trim().toLowerCase();

      if (!userEmail || !userEmail.includes("@")) {
        return NextResponse.json({ error: "No valid email address found on account profile." }, { status: 400 });
      }

      // Check OTP request cooldown (60 seconds)
      const cooldownRef = adminDb.collection("otp_cooldowns").doc(`pin_reset_email_${uid}`);
      const cooldownSnap = await cooldownRef.get();
      if (cooldownSnap.exists) {
        const lastSentAt = cooldownSnap.data()?.lastSentAt || 0;
        if (now - lastSentAt < 60000) {
          const remaining = Math.ceil((60000 - (now - lastSentAt)) / 1000);
          return NextResponse.json(
            { error: `Please wait ${remaining} seconds before requesting another verification code.` },
            { status: 429 }
          );
        }
      }

      // Generate 6-digit numeric OTP and hash it
      const rawOtp = crypto.randomInt(100000, 999999).toString();
      const expiresAtMs = now + 10 * 60 * 1000; // 10 minutes expiry
      const expiresAtIso = new Date(expiresAtMs).toISOString();

      const HMAC_SECRET = process.env.CPANEL_SESSION_SECRET || process.env.JWT_SECRET || "pin_reset_otp_secret_key";
      const otpHash = crypto.createHmac("sha256", HMAC_SECRET).update(rawOtp.trim()).digest("hex");

      // Save OTP session in Firestore `otp_sessions/pin_reset_email_${uid}`
      const sessionDocRef = adminDb.collection("otp_sessions").doc(`pin_reset_email_${uid}`);
      await sessionDocRef.set({
        uid,
        email: userEmail,
        type: "pin_reset",
        channel: "email",
        otpHash,
        attempts: 0,
        verified: false,
        consumed: false,
        createdAtMs: now,
        expiresAtMs,
        expiresAt: expiresAtIso,
        createdAt: nowIso,
      });

      // Escape HTML
      const escapeHtml = (str: string) => String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
      const safeRawOtp = escapeHtml(rawOtp);
      const userName = userData.name || userData.fullName || "Valued Customer";

      const dispatched = await sendEmail({
        to: userEmail,
        subject: "E-Global Pay - Access PIN Reset Verification Code",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <span style="background-color: #FC7A00; color: #ffffff; padding: 6px 16px; font-size: 11px; font-weight: bold; text-transform: uppercase; border-radius: 20px; letter-spacing: 1px;">
                SECURITY PIN RESET
              </span>
            </div>
            <h2 style="color: #1a202c; font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 8px;">
              Reset Your Access PIN
            </h2>
            <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">Hello ${escapeHtml(userName)},</p>
            <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
              We received a request to reset the Access PIN for your E-Global Pay account. Use the 6-digit verification code below to authorize this request:
            </p>
            <div style="background-color: #f7fafc; border: 2px dashed #FC7A00; padding: 18px; font-size: 28px; font-weight: font-black; text-align: center; letter-spacing: 8px; color: #1a202c; margin: 24px 0; border-radius: 8px; font-family: monospace;">
              ${safeRawOtp}
            </div>
            <p style="color: #718096; font-size: 12px; line-height: 1.5;">
              This code expires in 10 minutes. If you did not request a PIN reset, please ignore this email or contact support immediately.
            </p>
            <hr style="border: none; border-top: 1px solid #edf2f7; margin: 20px 0;" />
            <p style="color: #a0aec0; font-size: 11px; text-align: center; margin: 0;">
              E-Global Pay Security Systems
            </p>
          </div>
        `,
      });

      if (!dispatched) {
        return NextResponse.json({ error: "Failed to dispatch email verification code. Please try again." }, { status: 502 });
      }

      // Record cooldown lock
      await cooldownRef.set({
        uid,
        email: userEmail,
        lastSentAt: now,
        updatedAt: nowIso,
      });

      return NextResponse.json({
        success: true,
        channel: "email",
        message: "A 6-digit OTP code has been sent to your registered email address.",
      });
    }

    // =========================================================================
    // CHANNEL 2: WHATSAPP OTP (Proxy to Payment Gateway VM)
    // =========================================================================
    let templateBranding: Record<string, any> = {};
    try {
      const docSnap = await adminDb.collection("config").doc("communication_branding").get();
      if (docSnap.exists) {
        templateBranding = docSnap.data() || {};
      }
    } catch {
      // Ignore fallback
    }

    const payload = {
      ...body,
      templateBranding,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": authHeader,
    };
    if (gatewayApiKey) headers["x-api-key"] = gatewayApiKey;

    let response = await fetch(`${GATEWAY_URL}/api/auth/pin-reset-otp`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let responseText = await response.text().catch(() => "");

    // Fallback: If gateway doesn't have /api/auth/pin-reset-otp (404), route to /api/auth/send-otp
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
        const fallbackRes = await fetch(`${GATEWAY_URL}/api/auth/send-otp`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            phoneNumber: cleanPhone,
            type: "pin_reset",
            ...payload
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
        result = { error: "WhatsApp OTP service is currently unavailable. Please use the Email OTP option instead." };
      } else {
        result = { error: responseText || "Server returned non-JSON response." };
      }
    }

    if (!response.ok) {
      let rawErr = String(result.error || result.message || "Failed to dispatch PIN reset OTP.");
      if (
        rawErr.includes("WhatsApp instance") ||
        rawErr.includes("not active or connected") ||
        rawErr.includes("WhatsApp Dispatch Failed") ||
        rawErr.includes("WHATSAPP_API") ||
        rawErr.includes("ECONNREFUSED") ||
        rawErr.includes("Cannot POST") ||
        rawErr.includes("<!DOCTYPE") ||
        rawErr.includes("html") ||
        response.status === 400 ||
        response.status === 404 ||
        response.status === 502 ||
        response.status === 503
      ) {
        rawErr = "WhatsApp OTP service is currently unavailable. Please use the Email OTP option instead.";
      }
      return NextResponse.json(
        { error: rawErr },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      channel: "whatsapp",
      message: result.message || "PIN reset OTP sent successfully.",
      ...(result.devOtpCode ? { devOtpCode: result.devOtpCode } : {}),
    });

  } catch (err: unknown) {
    const error = err as Error;
    console.error("[PIN Reset OTP Proxy] Error:", error);
    const isTimeout = error.name === "AbortError";
    const errorMessage = isTimeout
      ? "Server connection timed out. Please try again in a few seconds."
      : (error.message || "WhatsApp OTP is not available at this time. Please use Email OTP option instead.");

    return NextResponse.json({ error: errorMessage }, { status: isTimeout ? 504 : 500 });
  }
}
