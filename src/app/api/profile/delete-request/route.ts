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
        { error: "Unauthorized: Please sign in to send account deletion requests." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "request"; // "request" or "cancel"
    const { pin, isBiometricAuthenticated } = body;

    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: "User profile not found." }, { status: 404 });
    }

    const userData = userSnap.data() || {};
    const nowIso = new Date().toISOString();

    if (action === "cancel") {
      await userRef.update({
        deleteRequested: false,
        deleteRequestedAt: null,
        deleteReason: null,
        updatedAt: nowIso,
      });

      return NextResponse.json({
        success: true,
        message: "Account deletion request has been successfully canceled.",
      });
    }

    // Require reason for deletion
    const reason = String(body.reason || "").trim().slice(0, 500);
    if (!reason) {
      return NextResponse.json({ error: "Reason for deletion is required." }, { status: 400 });
    }

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

    await userRef.update({
      deleteRequested: true,
      deleteRequestedAt: nowIso,
      deleteReason: reason,
      updatedAt: nowIso,
    });

    // Also record in deletion requests collection for fast admin lookup
    await adminDb.collection("account_deletion_requests").doc(uid).set({
      uid,
      email: userData.email || "",
      phoneNumber: userData.phoneNumber || userData.phone || "",
      name: userData.fullName || userData.name || "E-Global User",
      requestedAt: nowIso,
      reason,
      status: "PENDING",
    }, { merge: true });

    return NextResponse.json({
      success: true,
      message: "Dear customer your request have been subited action will be taking ASAP Thanks",
    });
  } catch (err: any) {
    console.error("[Delete Request API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process account deletion request." },
      { status: 500 }
    );
  }
}
