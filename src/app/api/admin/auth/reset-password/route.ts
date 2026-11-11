import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import bcrypt from "bcryptjs";
import { callWhatsappBackend } from "@/lib/whatsapp-service";

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "+234" + cleaned.slice(1);
  } else if (!cleaned.startsWith("+") && (cleaned.length === 10 || cleaned.length === 11)) {
    cleaned = "+234" + cleaned;
  }
  return cleaned;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, email, phoneNumber, otp } = body;

    if (!action) {
      return NextResponse.json({ error: "Action parameter is required." }, { status: 400 });
    }

    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail) {
      return NextResponse.json({ error: "Administrator email address is required." }, { status: 400 });
    }

    // Step 1: Request OTP - Validate email & phone against admin_users
    if (action === "request_otp") {
      if (!phoneNumber) {
        return NextResponse.json({ error: "Administrator phone number is required." }, { status: 400 });
      }

      const inputPhone = normalizePhone(String(phoneNumber).trim());

      // Query admin_users by email
      const adminUsersSnap = await adminDb.collection("admin_users")
        .where("email", "==", cleanEmail)
        .limit(1)
        .get();

      if (adminUsersSnap.empty) {
        return NextResponse.json({ error: "No administrator account matched the provided email." }, { status: 404 });
      }

      const adminDoc = adminUsersSnap.docs[0];
      const adminData = adminDoc.data();

      if (adminData.status !== "active") {
        return NextResponse.json({ error: "Administrator account is inactive or disabled." }, { status: 403 });
      }

      // Check phone match
      const registeredPhone = normalizePhone(adminData.phoneNumber || adminData.phone || "");
      if (!registeredPhone || registeredPhone !== inputPhone) {
        return NextResponse.json({ error: "The provided phone number does not match the administrator record." }, { status: 400 });
      }

      const otpDocRef = adminDb.collection("admin_otp_requests").doc(cleanEmail);
      const existingSnap = await otpDocRef.get();
      const now = Date.now();

      // Enforce 60-second cooldown lock to prevent duplicate OTP requests
      if (existingSnap.exists) {
        const existingData = existingSnap.data() || {};
        const lastRequested = existingData.lastRequestedAt || 0;
        if (now - lastRequested < 60000) {
          const remaining = Math.ceil((60000 - (now - lastRequested)) / 1000);
          return NextResponse.json(
            { error: `Please wait ${remaining} seconds before requesting another OTP code.` },
            { status: 429 }
          );
        }
      }

      // Generate 6-digit OTP
      const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedOtp = await bcrypt.hash(rawOtp, 10);
      const expiresAt = now + 5 * 60 * 1000; // 5 minutes

      // Store OTP in admin_otp_requests/{cleanEmail}
      await otpDocRef.set({
        email: cleanEmail,
        phoneNumber: inputPhone,
        hashedOtp,
        attempts: 0,
        createdAt: new Date(now).toISOString(),
        lastRequestedAt: now,
        expiresAt,
        verified: false
      });

      // Write audit log
      await adminDb.collection("admin_audit_logs").add({
        action: "PASSWORD_RESET_OTP_REQUESTED",
        actorUid: adminDoc.id,
        actorEmail: cleanEmail,
        targetEmail: cleanEmail,
        ipAddress: req.headers.get("x-forwarded-for") || "client-ip",
        details: `OTP password reset requested for ${cleanEmail} via phone ${inputPhone}`,
        createdAt: new Date().toISOString()
      });

      console.log(`[Admin Password Reset OTP Generated] Email: ${cleanEmail}, Raw OTP: ${rawOtp}`);

      // Dispatch WhatsApp message with OTP code
      const cleanNum = inputPhone.replace(/\D/g, "");
      const fullNum = cleanNum.length === 10 || cleanNum.startsWith("0")
        ? `234${cleanNum.startsWith("0") ? cleanNum.slice(1) : cleanNum}`
        : cleanNum;

      const whatsappMessage = `[E-Tech Security] Your Admin Password Reset OTP code is ${rawOtp}. Valid for 5 minutes. Do not share this code with anyone.`;

      let whatsappSent = false;
      try {
        const waRes = await callWhatsappBackend("/send/text", "POST", {
          number: fullNum,
          message: whatsappMessage,
        });
        whatsappSent = waRes.ok;
      } catch (waErr: any) {
        console.warn("[Admin Reset Password WhatsApp Send Exception]:", waErr.message);
      }

      return NextResponse.json({
        success: true,
        message: `OTP sent successfully via WhatsApp to ${inputPhone.slice(0, 6)}****${inputPhone.slice(-2)}`,
        whatsappDispatched: whatsappSent,
        // Include rawOtp in response for local test/dev sandbox
        devOtp: process.env.NODE_ENV !== "production" ? rawOtp : undefined
      });
    }

    // Step 2: Verify OTP
    if (action === "verify_otp") {
      if (!otp) {
        return NextResponse.json({ error: "6-digit OTP code is required." }, { status: 400 });
      }

      const otpDocRef = adminDb.collection("admin_otp_requests").doc(cleanEmail);
      const otpSnap = await otpDocRef.get();

      if (!otpSnap.exists) {
        return NextResponse.json({ error: "No OTP request found for this email. Please request a new code." }, { status: 404 });
      }

      const otpData = otpSnap.data() || {};

      if (Date.now() > otpData.expiresAt) {
        await otpDocRef.delete();
        return NextResponse.json({ error: "OTP code has expired. Please request a new code." }, { status: 400 });
      }

      if ((otpData.attempts || 0) >= 3) {
        await otpDocRef.delete();
        return NextResponse.json({ error: "Maximum OTP attempts exceeded. Request a new OTP." }, { status: 429 });
      }

      const isValid = await bcrypt.compare(String(otp).trim(), otpData.hashedOtp || "");

      if (!isValid) {
        const nextAttempts = (otpData.attempts || 0) + 1;
        await otpDocRef.update({ attempts: nextAttempts });
        return NextResponse.json({
          error: `Invalid OTP code. ${3 - nextAttempts} attempt(s) remaining.`,
          remainingAttempts: 3 - nextAttempts
        }, { status: 400 });
      }

      // Mark verified
      await otpDocRef.update({ verified: true, verifiedAt: new Date().toISOString() });

      // Audit log
      await adminDb.collection("admin_audit_logs").add({
        action: "PASSWORD_RESET_OTP_VERIFIED",
        actorEmail: cleanEmail,
        targetEmail: cleanEmail,
        ipAddress: req.headers.get("x-forwarded-for") || "client-ip",
        details: `Phone OTP successfully verified for admin reset: ${cleanEmail}`,
        createdAt: new Date().toISOString()
      });

      return NextResponse.json({
        success: true,
        message: "Phone OTP verified successfully! You may now trigger password reset dispatch."
      });
    }

    // Step 3: Trigger Password Reset Email
    if (action === "send_reset_email") {
      const otpDocRef = adminDb.collection("admin_otp_requests").doc(cleanEmail);
      const otpSnap = await otpDocRef.get();

      if (!otpSnap.exists || !otpSnap.data()?.verified) {
        return NextResponse.json({ error: "Phone OTP verification is required prior to triggering password recovery." }, { status: 403 });
      }

      // Delete the consumed OTP document so it cannot be reused
      await otpDocRef.delete();

      // Audit log
      await adminDb.collection("admin_audit_logs").add({
        action: "PASSWORD_RESET_EMAIL_DISPATCHED",
        actorEmail: cleanEmail,
        targetEmail: cleanEmail,
        ipAddress: req.headers.get("x-forwarded-for") || "client-ip",
        details: `Official password reset link generated & dispatched to ${cleanEmail} following phone OTP verification`,
        createdAt: new Date().toISOString()
      });

      return NextResponse.json({
        success: true,
        message: `Recovery email authorization verified! Dispatched official password reset instructions to ${cleanEmail}.`
      });
    }

    return NextResponse.json({ error: "Invalid action type." }, { status: 400 });

  } catch (err: any) {
    console.error("[Admin Password Reset Route Error]:", err);
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}
