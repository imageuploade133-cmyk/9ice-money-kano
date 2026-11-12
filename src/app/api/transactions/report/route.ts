import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { adminDb } from "@/lib/firebase-admin";
import { authenticateUserRequest } from "@/lib/auth-util";

export async function POST(req: Request) {
  try {
    let uid = "";
    try {
      const authUser = await authenticateUserRequest(req);
      uid = authUser.uid;
    } catch {
      return NextResponse.json(
        { error: "Unauthorized: Please sign in to submit transaction report." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { transaction, issueCategory, customNote, screenshotUrl, pin, isBiometricAuthenticated } = body;

    if (!transaction || !transaction.reference) {
      return NextResponse.json({ error: "Missing required transaction reference." }, { status: 400 });
    }

    if (!issueCategory || typeof issueCategory !== "string") {
      return NextResponse.json({ error: "Please select an issue category." }, { status: 400 });
    }

    if (!customNote || typeof customNote !== "string" || customNote.trim().length < 5) {
      return NextResponse.json({ error: "Additional details are required. Please describe the transaction issue (at least 5 characters)." }, { status: 400 });
    }

    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: "User profile not found." }, { status: 404 });
    }

    const userData = userSnap.data() || {};
    const nowIso = new Date().toISOString();

    // PIN & Biometric Verification Guard
    const isUserBiometricEnabled = userData.isBiometricTransferEnabled === true || userData.isBiometricLoginEnabled === true || userData.isFaceIdEnabled === true;
    const isBiometricAuth = isBiometricAuthenticated === true || body.isBiometric === true;

    if (isBiometricAuth && isUserBiometricEnabled) {
      // Biometric verified
    } else {
      const pinHash = userData.pinHash;
      const currentPlainPin = userData.pin;
      const lockedUntil = userData.lockedUntil;
      let pinAttempts = Number(userData.pinAttempts) || 0;

      if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
        const minutesLeft = Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / (60 * 1000));
        return NextResponse.json({ error: `Too many incorrect PIN attempts. Locked for ${minutesLeft} minute(s).` }, { status: 403 });
      }

      let isPinMatch = false;
      if (uid === "mock-uid") {
        isPinMatch = pin === "1234" || pin === currentPlainPin || (Boolean(pin) && Boolean(pinHash) && bcrypt.compareSync(pin, pinHash));
      } else if (pin && pinHash) {
        isPinMatch = bcrypt.compareSync(pin, pinHash);
      } else if (pin && currentPlainPin) {
        isPinMatch = pin === currentPlainPin;
      }

      if (!isPinMatch) {
        pinAttempts += 1;
        let lockTimestamp = null;
        if (pinAttempts >= 5) {
          lockTimestamp = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        }
        await userRef.update({
          pinAttempts,
          lockedUntil: lockTimestamp,
        });

        const remaining = Math.max(0, 5 - pinAttempts);
        return NextResponse.json({
          error: pinAttempts >= 5
            ? "Too many incorrect PIN attempts. Account locked for 15 minutes."
            : `Incorrect transaction PIN. ${remaining} attempt(s) remaining.`,
        }, { status: 400 });
      }
    }

    const issueId = `TRN-ISSUE-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const reportData = {
      issueId,
      uid,
      userName: userData.fullName || userData.name || userData.displayName || "E-Global User",
      userEmail: userData.email || "",
      userPhone: userData.phoneNumber || userData.phone || "",
      transactionReference: transaction.reference,
      transactionId: transaction.id || transaction.reference,
      amount: Number(transaction.amount) || 0,
      currency: transaction.currency || "NGN",
      transactionType: transaction.type || "PAYMENT",
      transactionDate: transaction.date || transaction.createdAt || nowIso,
      recipientName: transaction.recipientName || transaction.beneficiaryName || "N/A",
      issueCategory,
      customNote: String(customNote || "").trim().slice(0, 500),
      screenshotUrl: typeof screenshotUrl === "string" && screenshotUrl.trim() ? screenshotUrl.trim() : null,
      status: "PENDING", // "PENDING", "RESOLVED", "DISMISSED"
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await adminDb.collection("transaction_issues").doc(issueId).set(reportData);

    return NextResponse.json({
      success: true,
      issueId,
      message: "Your transaction issue report has been submitted successfully.",
    });
  } catch (err: any) {
    console.error("[TRN Issue Report API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to submit transaction issue report." },
      { status: 500 }
    );
  }
}
