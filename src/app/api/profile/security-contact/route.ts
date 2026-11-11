import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getGatewayUrl } from "@/lib/gateway-util";

const GATEWAY_URL = getGatewayUrl();
const GATEWAY_API_KEY = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY || "";

function maskPhone(phone: string): string {
  const clean = phone.replace(/\D/g, "");
  if (clean.length < 8) return "••••••••";
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
}

function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return "••••@••••.com";
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length <= 2 ? `${name[0]}*` : `${name[0]}***${name[name.length - 1]}`;
  return `${maskedName}@${domain}`;
}

const HMAC_SECRET = process.env.CPANEL_SESSION_SECRET || process.env.JWT_SECRET;

function hashOtp(otp: string): string {
  if (!HMAC_SECRET) {
    throw new Error("Configuration Error: CPANEL_SESSION_SECRET or JWT_SECRET is required.");
  }
  return crypto.createHmac("sha256", HMAC_SECRET).update(otp.trim()).digest("hex");
}

export async function POST(req: Request) {
  try {
    const authResult = await authenticateUserRequest(req);
    const uid = authResult.uid;

    if (!uid) {
      return NextResponse.json({ error: "Unauthorized: Invalid or missing token." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, pin, isBiometricAuthenticated, newContact, contactType, requestId, otpCode } = body;
    const now = Date.now();
    const nowIso = new Date().toISOString();

    const userRef = adminDb.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: "User account profile not found." }, { status: 404 });
    }

    const userData = userDoc.data() || {};

    const pinHash = userData.pinHash;
    const currentPlainPin = userData.pin;
    const lockedUntil = userData.lockedUntil;

    if (lockedUntil) {
      const lockTime = new Date(lockedUntil).getTime();
      if (now < lockTime) {
        const minutesLeft = Math.ceil((lockTime - now) / (60 * 1000));
        return NextResponse.json({ error: `Too many incorrect PIN attempts. Locked for ${minutesLeft} minutes.` }, { status: 403 });
      }
    }

    let isAuthorized = false;
    const isUserBiometricEnabled = userData.isBiometricTransferEnabled === true || userData.isBiometricLoginEnabled === true || userData.isFaceIdEnabled === true;

    if (isBiometricAuthenticated === true) {
      if (!isUserBiometricEnabled) {
        return NextResponse.json({ error: "Biometric authorization is not enabled on this account." }, { status: 403 });
      }
      isAuthorized = true;
    } else if (pin && typeof pin === "string") {
      if (process.env.NODE_ENV !== "production" && uid === "mock-uid") {
        isAuthorized = (pin === "1234" || pin === currentPlainPin || (pinHash && bcrypt.compareSync(pin, pinHash)));
      } else if (pinHash) {
        isAuthorized = bcrypt.compareSync(pin, pinHash);
      } else if (currentPlainPin) {
        isAuthorized = (pin === currentPlainPin);
      } else {
        return NextResponse.json({ error: "No transaction PIN has been set up on this account." }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "4-digit transaction PIN or biometric authorization is required." }, { status: 400 });
    }

    if (!isAuthorized) {
      const pinAttempts = (Number(userData.pinAttempts) || 0) + 1;
      let lockTimestamp = null;
      if (pinAttempts >= 5) {
        lockTimestamp = new Date(now + 15 * 60 * 1000).toISOString();
      }
      await userRef.update({
        pinAttempts,
        lockedUntil: lockTimestamp,
      });
      const remaining = Math.max(0, 5 - pinAttempts);
      return NextResponse.json({
        error: pinAttempts >= 5
          ? "Too many incorrect PIN attempts. Account locked for 15 minutes."
          : `Incorrect transaction PIN. ${remaining} attempts remaining.`,
      }, { status: 400 });
    }

    // Reset PIN attempts on match
    await userRef.update({ pinAttempts: 0, lockedUntil: null });

    // Enforce 24-hour security hold on contact updates to prevent factor-change chaining
    const lastContactChangeAt = userData.lastSecurityContactChangedAt ? new Date(userData.lastSecurityContactChangedAt).getTime() : 0;
    if (lastContactChangeAt && now - lastContactChangeAt < 24 * 60 * 60 * 1000) {
      const hoursRemaining = Math.ceil((24 * 60 * 60 * 1000 - (now - lastContactChangeAt)) / (60 * 60 * 1000));
      return NextResponse.json({
        error: `Security Hold Active: Security contact was modified recently. Further changes are locked for ${hoursRemaining} hour(s) to defend against recovery takeover.`
      }, { status: 403 });
    }

    // =========================================================================
    // STEP 1: REQUEST CONTACT CHANGE (STAGE 1: AUTHORIZE EXISTING TRUSTED FACTOR)
    // =========================================================================
    if (action === "request_change") {
      if (!newContact || !contactType) {
        return NextResponse.json({ error: "Missing newContact or contactType parameter." }, { status: 400 });
      }

      const typeLower = String(contactType).toLowerCase();
      if (typeLower !== "phone" && typeLower !== "email") {
        return NextResponse.json({ error: "contactType must be 'phone' or 'email'." }, { status: 400 });
      }

      const formattedNewContact = String(newContact).trim();

      // Existing trusted contact destination - require explicit verification flag (=== true)
      const existingPhone = (userData.phoneNumber || userData.phone || "").trim();
      const existingEmail = (userData.email || "").trim();

      const isPhoneVerified = userData.phoneVerified === true && !!existingPhone;
      const isEmailVerified = userData.emailVerified === true && !!existingEmail;

      const isTargetVerified = typeLower === "phone" ? isPhoneVerified : isEmailVerified;
      const existingTarget = typeLower === "phone" ? existingPhone : existingEmail;

      if (!isTargetVerified || !existingTarget) {
        return NextResponse.json({ error: `No current verified ${typeLower} found to authorize this security change.` }, { status: 400 });
      }

      // Prevent re-submitting current contact
      if (existingTarget.toLowerCase() === formattedNewContact.toLowerCase()) {
        return NextResponse.json({ error: `This ${typeLower} is already your current verified contact.` }, { status: 400 });
      }

      const reqId = `req_${uid}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
      const stage1Otp = crypto.randomInt(100000, 999999).toString();
      const stage1Hash = hashOtp(stage1Otp);
      const expiresAtMs = now + 10 * 60 * 1000; // 10 minutes

      const changeDoc = {
        reqId,
        uid,
        contactType: typeLower,
        newContact: formattedNewContact,
        stage: "AUTHORIZE_EXISTING",
        stage1Hash,
        existingTarget,
        attempts: 0,
        consumed: false,
        stage1Verified: false,
        stage2Verified: false,
        createdAtMs: now,
        expiresAtMs,
        createdAt: nowIso,
      };

      await adminDb.collection("security_contact_changes").doc(reqId).set(changeDoc);

      // Dispatch Stage 1 OTP to existing trusted contact
      let dispatched = false;
      if (typeLower === "phone") {
        try {
          const res = await fetch(`${GATEWAY_URL}/api/auth/send-otp`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": GATEWAY_API_KEY,
            },
            body: JSON.stringify({
              phoneNumber: existingTarget,
              type: "contact_change",
              customMessage: `E-Global Pay Security: Stage 1 Authorization code to update your recovery ${typeLower} is *${stage1Otp}*. Valid for 10 minutes. Do not share with anyone.`
            }),
          });
          dispatched = res.ok;
        } catch {
          dispatched = false;
        }
      } else {
        try {
          const escapeHtml = (str: string) => String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
          const safeTypeLower = escapeHtml(typeLower);
          const safeNewContact = escapeHtml(formattedNewContact);
          const safeRawOtp = escapeHtml(stage1Otp);

          const { sendEmail } = await import("@/lib/email-service");
          const result = await sendEmail({
            to: existingTarget,
            subject: "Security Alert: Stage 1 Contact Change Authorization",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #FC7A00; margin-bottom: 16px;">E-Global Pay Security Guard</h2>
                <p>Hello,</p>
                <p>A request was submitted to update your recovery ${safeTypeLower} to <b>${safeNewContact}</b>.</p>
                <p>Use the Stage 1 authorization code below sent to your existing contact to authorize sending a verification code to the new contact:</p>
                <div style="background-color: #f4f4f4; padding: 15px; font-size: 26px; font-weight: bold; text-align: center; letter-spacing: 6px; color: #333; margin: 20px 0; border-radius: 4px;">
                  ${safeRawOtp}
                </div>
                <p>If you did not request this change, please ignore this message and change your PIN immediately.</p>
              </div>
            `,
          });
          dispatched = result;
        } catch {
          dispatched = false;
        }
      }

      if (!dispatched) {
        await adminDb.collection("security_contact_changes").doc(reqId).delete();
        return NextResponse.json({ error: "Failed to deliver authorization code to your current verified contact." }, { status: 502 });
      }

      return NextResponse.json({
        success: true,
        stage: "AUTHORIZE_EXISTING",
        message: `Stage 1 authorization code sent to your current verified ${typeLower} (${typeLower === "phone" ? maskPhone(existingTarget) : maskEmail(existingTarget)}).`,
        requestId: reqId,
        maskedExistingContact: typeLower === "phone" ? maskPhone(existingTarget) : maskEmail(existingTarget),
      });
    }

    // =========================================================================
    // RESEND STAGE 2 OTP TO NEW UNVERIFIED CONTACT (FAIL-SAFE RETRY RECOVERY)
    // =========================================================================
    if (action === "resend_stage2") {
      if (!requestId) {
        return NextResponse.json({ error: "Missing required parameter: requestId." }, { status: 400 });
      }

      const changeRef = adminDb.collection("security_contact_changes").doc(requestId);

      let targetChannel: "phone" | "email" = "phone";
      let targetDestination = "";
      let newStage2RawOtp = "";

      const resendResult = await adminDb.runTransaction(async (transaction) => {
        const changeSnap = await transaction.get(changeRef);
        if (!changeSnap.exists) {
          throw new Error("CHANGE_INVALID: Security request record not found.");
        }

        const chData = changeSnap.data() || {};

        if (chData.uid !== uid) {
          throw new Error("CHANGE_INVALID: Authorization request mismatch.");
        }

        if (chData.consumed === true) {
          throw new Error("CHANGE_CONSUMED: This change request has already been completed.");
        }

        if (chData.stage !== "VERIFY_NEW_CONTACT" || chData.stage1Verified !== true) {
          throw new Error("CHANGE_INVALID_STAGE: Stage 1 authorization must be completed before resending code to the new contact.");
        }

        // 60-second rate limit cooldown check inside transaction
        const lastSentAtMs = chData.lastSentAtMs || 0;
        if (now - lastSentAtMs < 60000) {
          const remaining = Math.ceil((60000 - (now - lastSentAtMs)) / 1000);
          throw new Error(`CHANGE_COOLDOWN: Please wait ${remaining} second(s) before requesting a new code.`);
        }

        if (chData.attempts >= 3) {
          throw new Error("CHANGE_LOCKED: Too many failed attempts. Security contact change locked. Please generate a new request.");
        }

        targetChannel = chData.contactType;
        targetDestination = chData.newContact; // Destination is IMMUTABLE and read from server change document
        newStage2RawOtp = crypto.randomInt(100000, 999999).toString();
        const stage2Hash = hashOtp(newStage2RawOtp);
        const expiresAtMs = now + 10 * 60 * 1000; // 10 minutes

        transaction.update(changeRef, {
          stage2Hash,
          lastSentAtMs: now,
          expiresAtMs,
          attempts: 0, // Reset single-code attempts for fresh code
          updatedAt: nowIso,
        });

        return { targetChannel, targetDestination, newStage2RawOtp };
      });

      // Dispatch fresh Stage 2 OTP directly to NEW UNVERIFIED contact
      let dispatchedResend = false;
      if (resendResult.targetChannel === "phone") {
        try {
          const res = await fetch(`${GATEWAY_URL}/api/auth/send-otp`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": GATEWAY_API_KEY,
            },
            body: JSON.stringify({
              phoneNumber: resendResult.targetDestination,
              type: "contact_verification",
              customMessage: `E-Global Pay Security: Stage 2 Verification code to confirm your NEW recovery ${resendResult.targetChannel} is *${resendResult.newStage2RawOtp}*. Valid for 10 minutes.`
            }),
          });
          dispatchedResend = res.ok;
        } catch {
          dispatchedResend = false;
        }
      } else {
        try {
          const escapeHtml = (str: string) => String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
          const safeTypeLower = escapeHtml(resendResult.targetChannel);
          const safeRawOtp = escapeHtml(resendResult.newStage2RawOtp);

          const { sendEmail } = await import("@/lib/email-service");
          const result = await sendEmail({
            to: resendResult.targetDestination,
            subject: "Security Verification: Confirm New Recovery Contact (Resent Code)",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #FC7A00; margin-bottom: 16px;">E-Global Pay Security Guard</h2>
                <p>Hello,</p>
                <p>A new Stage 2 verification code was requested for this NEW ${safeTypeLower}:</p>
                <div style="background-color: #f4f4f4; padding: 15px; font-size: 26px; font-weight: bold; text-align: center; letter-spacing: 6px; color: #333; margin: 20px 0; border-radius: 4px;">
                  ${safeRawOtp}
                </div>
                <p>This code confirms that you have direct control of this destination.</p>
              </div>
            `,
          });
          dispatchedResend = result;
        } catch {
          dispatchedResend = false;
        }
      }

      if (!dispatchedResend) {
        return NextResponse.json({ error: `Failed to deliver verification code to your NEW ${resendResult.targetChannel}. Please try again later.` }, { status: 502 });
      }

      return NextResponse.json({
        success: true,
        message: `New Stage 2 verification code sent to your NEW ${resendResult.targetChannel} (${resendResult.targetChannel === "phone" ? maskPhone(resendResult.targetDestination) : maskEmail(resendResult.targetDestination)}).`,
        requestId,
        maskedNewContact: resendResult.targetChannel === "phone" ? maskPhone(resendResult.targetDestination) : maskEmail(resendResult.targetDestination),
      });
    }

    // =========================================================================
    // STEP 2: AUTHORIZE EXISTING TRUSTED FACTOR & DISPATCH STAGE 2 OTP TO NEW CONTACT
    // =========================================================================
    if (action === "authorize_existing") {
      if (!requestId || !otpCode) {
        return NextResponse.json({ error: "Missing requestId or otpCode." }, { status: 400 });
      }

      const changeRef = adminDb.collection("security_contact_changes").doc(requestId);

      let stage2Channel: "phone" | "email" = "phone";
      let stage2Destination = "";
      let stage2RawOtp = "";

      await adminDb.runTransaction(async (transaction) => {
        const changeSnap = await transaction.get(changeRef);
        if (!changeSnap.exists) {
          throw new Error("CHANGE_INVALID: Security request record not found.");
        }

        const chData = changeSnap.data() || {};

        if (chData.uid !== uid) {
          throw new Error("CHANGE_INVALID: Authorization request mismatch.");
        }

        if (chData.consumed === true) {
          throw new Error("CHANGE_CONSUMED: This change request code has already been used or completed.");
        }

        if (chData.stage !== "AUTHORIZE_EXISTING" || chData.stage1Verified === true) {
          throw new Error("CHANGE_INVALID_STAGE: Stage 1 has already been authorized.");
        }

        if (now > chData.expiresAtMs) {
          throw new Error("CHANGE_EXPIRED: Verification code has expired. Please initiate a new change request.");
        }

        if (chData.attempts >= 3) {
          throw new Error("CHANGE_LOCKED: Too many incorrect attempts. Request locked.");
        }

        const hashedSubmitted = hashOtp(String(otpCode));
        if (hashedSubmitted !== chData.stage1Hash) {
          const updatedAttempts = (chData.attempts || 0) + 1;
          transaction.update(changeRef, { attempts: updatedAttempts });
          const remaining = Math.max(0, 3 - updatedAttempts);
          throw new Error(`INCORRECT_OTP: Incorrect authorization code. ${remaining} attempt(s) remaining.`);
        }

        stage2Channel = chData.contactType;
        stage2Destination = chData.newContact;
        stage2RawOtp = crypto.randomInt(100000, 999999).toString();
        const stage2Hash = hashOtp(stage2RawOtp);

        // Advance to VERIFY_NEW_CONTACT stage
        transaction.update(changeRef, {
          stage: "VERIFY_NEW_CONTACT",
          stage1Verified: true,
          stage2Hash,
          attempts: 0, // Reset attempt counter for Stage 2
          updatedAt: nowIso,
        });
      });

      // Dispatch Stage 2 OTP directly to NEW UNVERIFIED contact
      let dispatchedStage2 = false;
      if (stage2Channel === "phone") {
        try {
          const res = await fetch(`${GATEWAY_URL}/api/auth/send-otp`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": GATEWAY_API_KEY,
            },
            body: JSON.stringify({
              phoneNumber: stage2Destination,
              type: "contact_verification",
              customMessage: `E-Global Pay Security: Stage 2 Verification code to confirm your NEW recovery ${stage2Channel} is *${stage2RawOtp}*. Valid for 10 minutes.`
            }),
          });
          dispatchedStage2 = res.ok;
        } catch {
          dispatchedStage2 = false;
        }
      } else {
        try {
          const escapeHtml = (str: string) => String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
          const safeTypeLower = escapeHtml(stage2Channel);
          const safeRawOtp = escapeHtml(stage2RawOtp);

          const { sendEmail } = await import("@/lib/email-service");
          const result = await sendEmail({
            to: stage2Destination,
            subject: "Security Verification: Confirm New Recovery Contact",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #FC7A00; margin-bottom: 16px;">E-Global Pay Security Guard</h2>
                <p>Hello,</p>
                <p>Use the Stage 2 verification code below sent directly to this NEW ${safeTypeLower} to complete registration of your new recovery contact:</p>
                <div style="background-color: #f4f4f4; padding: 15px; font-size: 26px; font-weight: bold; text-align: center; letter-spacing: 6px; color: #333; margin: 20px 0; border-radius: 4px;">
                  ${safeRawOtp}
                </div>
                <p>This code confirms that you have direct control of this destination.</p>
              </div>
            `,
          });
          dispatchedStage2 = result;
        } catch {
          dispatchedStage2 = false;
        }
      }

      if (!dispatchedStage2) {
        return NextResponse.json({ error: `Failed to deliver verification code to your NEW ${stage2Channel} destination. Please check the address/number and try again.` }, { status: 502 });
      }

      return NextResponse.json({
        success: true,
        stage: "VERIFY_NEW_CONTACT",
        message: `Stage 1 authorized! Verification code sent to your NEW ${stage2Channel} (${stage2Channel === "phone" ? maskPhone(stage2Destination) : maskEmail(stage2Destination)}). Please enter the code to complete update.`,
        requestId,
        maskedNewContact: stage2Channel === "phone" ? maskPhone(stage2Destination) : maskEmail(stage2Destination),
      });
    }

    // =========================================================================
    // STEP 3: VERIFY NEW UNVERIFIED DESTINATION OTP & ATOMICALLY PROMOTE NEW CONTACT
    // =========================================================================
    if (action === "verify_new_contact") {
      if (!requestId || !otpCode) {
        return NextResponse.json({ error: "Missing requestId or otpCode." }, { status: 400 });
      }

      const changeRef = adminDb.collection("security_contact_changes").doc(requestId);

      await adminDb.runTransaction(async (transaction) => {
        const changeSnap = await transaction.get(changeRef);
        if (!changeSnap.exists) {
          throw new Error("CHANGE_INVALID: Security request record not found.");
        }

        const chData = changeSnap.data() || {};

        if (chData.uid !== uid) {
          throw new Error("CHANGE_INVALID: Authorization request mismatch.");
        }

        if (chData.consumed === true) {
          throw new Error("CHANGE_CONSUMED: This change request has already been completed.");
        }

        if (chData.stage !== "VERIFY_NEW_CONTACT" || chData.stage1Verified !== true) {
          throw new Error("CHANGE_INVALID_STAGE: Stage 1 authorization must be completed before verifying the new contact.");
        }

        if (now > chData.expiresAtMs) {
          throw new Error("CHANGE_EXPIRED: Verification code has expired. Please initiate a new change request.");
        }

        if (chData.attempts >= 3) {
          throw new Error("CHANGE_LOCKED: Too many incorrect attempts. Request locked.");
        }

        const hashedSubmitted = hashOtp(String(otpCode));
        if (hashedSubmitted !== chData.stage2Hash) {
          const updatedAttempts = (chData.attempts || 0) + 1;
          transaction.update(changeRef, { attempts: updatedAttempts });
          const remaining = Math.max(0, 3 - updatedAttempts);
          throw new Error(`INCORRECT_OTP: Incorrect verification code. ${remaining} attempt(s) remaining.`);
        }

        // Atomically update user document ONLY NOW after verifying NEW destination!
        const updatePayload: Record<string, any> = {
          updatedAt: nowIso,
          lastSecurityContactChangedAt: nowIso,
        };

        if (chData.contactType === "phone") {
          updatePayload.phoneNumber = chData.newContact;
          updatePayload.phone = chData.newContact;
          updatePayload.phoneVerified = true;
        } else {
          updatePayload.email = chData.newContact;
          updatePayload.emailVerified = true;
        }

        transaction.update(userRef, updatePayload);

        transaction.update(changeRef, {
          stage: "COMPLETED",
          consumed: true,
          stage2Verified: true,
          consumedAt: nowIso,
        });

        // Record Audit Log
        const auditRef = adminDb.collection("security_audit_logs").doc();
        transaction.set(auditRef, {
          uid,
          action: "SECURITY_CONTACT_PROMOTED_2STEP_VERIFIED",
          contactType: chData.contactType,
          maskedContact: chData.contactType === "phone" ? maskPhone(chData.newContact) : maskEmail(chData.newContact),
          timestamp: nowIso,
        });
      });

      return NextResponse.json({
        success: true,
        message: "New recovery contact verified and promoted successfully!",
      });
    }

    return NextResponse.json({ error: "Invalid action parameter." }, { status: 400 });

  } catch (err: any) {
    console.error("[Security Contact API Exception]:", err.message);
    let userMsg = err.message || "Failed to process security contact update.";
    if (err.message && err.message.includes("INCORRECT_OTP")) {
      userMsg = err.message.replace("INCORRECT_OTP: ", "");
      return NextResponse.json({ error: userMsg }, { status: 400 });
    }
    if (err.message && err.message.includes("CHANGE_")) {
      userMsg = err.message.replace(/CHANGE_[A-Z]+:\s*/, "");
      return NextResponse.json({ error: userMsg }, { status: 400 });
    }
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
