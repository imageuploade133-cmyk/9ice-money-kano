import { NextResponse } from "next/server";
import crypto from "crypto";
import { adminDb } from "@/lib/firebase-admin";
import { authenticateUserRequest } from "@/lib/auth-util";
import { sendEmail } from "@/lib/email-service";
import { getGatewayUrl } from "@/lib/gateway-util";
import { getOtpHmacSecret, constantTimeHexEqual } from "@/lib/otp-security";

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "u***r@gmail.com";
  const [userPart, domain] = email.split("@");
  if (userPart.length <= 2) return `${userPart[0]}***@${domain}`;
  return `${userPart[0]}***${userPart[userPart.length - 1]}@${domain}`;
}

function maskPhone(phone: string): string {
  if (!phone) return "23480***00";
  const clean = phone.replace(/\D/g, "");
  if (clean.length < 8) return phone;
  return `${clean.slice(0, 5)}***${clean.slice(-2)}`;
}

export async function POST(req: Request) {
  try {
    const authUser = await authenticateUserRequest(req);
    if (!authUser || !authUser.uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: "Database uninitialized" }, { status: 500 });
    }

    const body = await req.json() || {};
    const { action = "send", channel = "email", otp } = body;
    const uid = authUser.uid;

    const userSnap = await adminDb.collection("users").doc(uid).get();
    const userData = userSnap.data() || {};
    const userEmail = authUser.email || userData.email || "";
    const userPhone = userData.phoneNumber || userData.phone || "";

    if (action === "send") {
      // Generate 6-digit OTP code
      const rawOtp = crypto.randomInt(100000, 1000000).toString();
      const otpHash = crypto.createHmac("sha256", getOtpHmacSecret()).update(rawOtp).digest("hex");
      const nowMs = Date.now();
      const expiresAtMs = nowMs + 5 * 60 * 1000; // 5 minutes TTL

      // Save OTP session in Firestore
      await adminDb.collection("login_2fa_otps").doc(uid).set({
        uid,
        otpHash,
        attempts: 0,
        createdAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
        channel,
      });

      if (channel === "whatsapp") {
        // WhatsApp dispatch via gateway URL
        const gatewayUrl = getGatewayUrl();
        const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || "";

        try {
          const waRes = await fetch(`${gatewayUrl}/api/send/otp`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": gatewayApiKey,
            },
            body: JSON.stringify({
              phone: userPhone,
              otp: rawOtp,
              purpose: "2FA Login Authentication",
            }),
          });

          if (!waRes.ok) {
            console.warn("[Login 2FA OTP] WhatsApp dispatch failed; falling back to Email.");
            throw new Error("WhatsApp dispatch unavailable.");
          }
        } catch {
          // If WhatsApp fails, send via Email
          if (userEmail) {
            await sendEmail({
              to: userEmail,
              subject: "🔐 Your 2FA Login Verification Code",
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eee; rounded: 16px;">
                  <h2 style="color: #FC7A00; text-align: center;">9iceMoney</h2>
                  <h3 style="text-align: center; color: #111;">2FA Login Security Verification</h3>
                  <p style="color: #555; font-size: 14px;">Your 6-digit 2FA login verification code is:</p>
                  <div style="background: #FFF8EC; border: 1px font-mono solid #FFE8CC; border-radius: 12px; padding: 16px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #FC7A00; margin: 20px 0;">
                    ${rawOtp}
                  </div>
                  <p style="color: #888; font-size: 12px; text-align: center;">This code expires in 5 minutes. Never share your OTP code with anyone.</p>
                </div>
              `,
            });
          }
        }
      } else {
        // Send via Email
        if (!userEmail) {
          return NextResponse.json({ error: "No email address found for user account." }, { status: 400 });
        }

        await sendEmail({
          to: userEmail,
          subject: "🔐 Your 2FA Login Verification Code",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 16px;">
              <h2 style="color: #FC7A00; text-align: center;">E-Global Pay</h2>
              <h3 style="text-align: center; color: #111;">2FA Login Security Verification</h3>
              <p style="color: #555; font-size: 14px;">Your 6-digit 2FA login verification code is:</p>
              <div style="background: #FFF8EC; border: 1px solid #FFE8CC; border-radius: 12px; padding: 16px; text-align: center; font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #FC7A00; margin: 20px 0;">
                ${rawOtp}
              </div>
              <p style="color: #888; font-size: 12px; text-align: center;">This code expires in 5 minutes. Never share your OTP code with anyone.</p>
            </div>
          `,
        });
      }

      return NextResponse.json({
        success: true,
        message: `2FA OTP code sent via ${channel === "whatsapp" ? "WhatsApp" : "Email"}.`,
        maskedEmail: maskEmail(userEmail),
        maskedPhone: maskPhone(userPhone),
      });

    } else if (action === "verify") {
      const submittedOtp = (otp || body.otpCode || body.otp_code || "").toString().trim();
      if (!submittedOtp || submittedOtp.length !== 6) {
        return NextResponse.json({ error: "Please enter the 6-digit OTP code." }, { status: 400 });
      }

      const otpRef = adminDb.collection("login_2fa_otps").doc(uid);
      const userRef = adminDb.collection("users").doc(uid);
      const verification = await adminDb.runTransaction(async (transaction) => {
        const otpSnap = await transaction.get(otpRef);
        if (!otpSnap.exists) {
          return { success: false as const, status: 400, error: "2FA OTP session expired or invalid. Please request a new code." };
        }

        const otpData = otpSnap.data() || {};
        const expiresAtMs = new Date(otpData.expiresAt || 0).getTime();
        if (!Number.isFinite(expiresAtMs) || nowMs > expiresAtMs) {
          transaction.delete(otpRef);
          return { success: false as const, status: 400, error: "2FA OTP code has expired. Please request a new code." };
        }

        const attempts = Number(otpData.attempts) || 0;
        if (attempts >= 5) {
          transaction.delete(otpRef);
          return { success: false as const, status: 429, error: "Too many failed attempts. Please request a new OTP code." };
        }

        const submittedHash = crypto.createHmac("sha256", getOtpHmacSecret()).update(submittedOtp).digest("hex");
        if (!constantTimeHexEqual(submittedHash, otpData.otpHash)) {
          const nextAttempts = attempts + 1;
          transaction.update(otpRef, { attempts: nextAttempts });
          return {
            success: false as const,
            status: nextAttempts >= 5 ? 429 : 400,
            error: nextAttempts >= 5
              ? "Too many failed attempts. Please request a new OTP code."
              : "Invalid 2FA OTP code. Please check and try again.",
          };
        }

        // Consume the OTP and record verification in one atomic operation.
        transaction.delete(otpRef);
        transaction.set(userRef, { last2faVerifiedAt: new Date(nowMs).toISOString() }, { merge: true });
        return { success: true as const };
      });

      if (!verification.success) {
        return NextResponse.json({ error: verification.error }, { status: verification.status });
      }

      return NextResponse.json({
        success: true,
        message: "2FA OTP verification successful!",
      });

    } else {
      return NextResponse.json({ error: `Invalid action '${action}'.` }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[Login 2FA OTP] Exception:", err.message);
    return NextResponse.json({ error: err.message || "Failed to process 2FA OTP request" }, { status: 500 });
  }
}
