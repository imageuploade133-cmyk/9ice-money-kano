import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { InvestmentService } from "@/services/investment-service";
import { isRateLimited } from "@/lib/rate-limiter";
import { adminDb } from "@/lib/firebase-admin";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";

  // Rate Limiting
  if (isRateLimited(ip, 15, 60 * 1000)) {
    return NextResponse.json({ error: "Too many investment actions. Please try again later." }, { status: 429 });
  }

  try {
    const authResult = await authenticateUserRequest(req);
    const userId = authResult.uid;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idempotencyHeader = req.headers.get("x-idempotency-key") || req.headers.get("idempotency-key") || "";
    const body = await req.json().catch(() => ({}));
    const { amount, currency, productId, walletType, durationDays, idempotencyKey, pin } = body;

    const investAmount = Number(amount);
    if (!amount || isNaN(investAmount) || !isFinite(investAmount) || investAmount <= 0) {
      return NextResponse.json({ error: "Invalid investment amount. Amount must be a positive number." }, { status: 400 });
    }

    if (!productId || typeof productId !== "string") {
      return NextResponse.json({ error: "Product specification (productId) is required." }, { status: 400 });
    }

    const isBiometricReq = body.isBiometricAuthenticated === true || body.isBiometric === true;

    // PIN Verification
    if (!isBiometricReq && (!pin || typeof pin !== "string" || pin.length !== 4 || isNaN(Number(pin)))) {
      return NextResponse.json({ error: "4-digit transaction PIN is required to authorize investment." }, { status: 400 });
    }

    const userDoc = await adminDb.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User profile not found." }, { status: 404 });
    }

    const userData = userDoc.data() || {};
    if (userData.isFrozen) {
      return NextResponse.json({ error: userData.freezeMessage || "Account is frozen. Please contact support." }, { status: 403 });
    }

    const lockedUntil = userData.lockedUntil;
    if (lockedUntil) {
      const lockTime = new Date(lockedUntil).getTime();
      if (Date.now() < lockTime) {
        const minutesLeft = Math.ceil((lockTime - Date.now()) / (60 * 1000));
        return NextResponse.json({ error: `Too many incorrect PIN attempts. Locked for ${minutesLeft} minutes.` }, { status: 403 });
      }
    }

    const pinHash = userData.pinHash;
    const currentPlainPin = userData.pin;

    const isMock = userId === "mock-uid";
    let isPinMatch = false;
    const isUserBiometricEnabled = userData.isBiometricTransferEnabled === true || userData.isBiometricLoginEnabled === true || userData.isFaceIdEnabled === true;
    const isBiometricAuth = body.isBiometricAuthenticated === true || body.isBiometric === true;

    if (isBiometricAuth && isUserBiometricEnabled) {
      isPinMatch = true;
    } else if (isMock) {
      isPinMatch = (pin === "1234" || (Boolean(pin) && pin === currentPlainPin) || (pinHash && Boolean(pin) && bcrypt.compareSync(pin!, pinHash)));
    } else if (pin && pinHash) {
      isPinMatch = bcrypt.compareSync(pin, pinHash);
    } else if (pin && currentPlainPin) {
      isPinMatch = (pin === currentPlainPin);
    } else {
      return NextResponse.json({ error: "No transaction PIN has been set up on this account." }, { status: 400 });
    }

    if (!isPinMatch) {
      const pinAttempts = (Number(userData.pinAttempts) || 0) + 1;
      let lockTimestamp = null;
      if (pinAttempts >= 5) {
        lockTimestamp = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      await adminDb.collection("users").doc(userId).update({
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

    // Reset attempts
    await adminDb.collection("users").doc(userId).update({
      pinAttempts: 0,
      lockedUntil: null,
    });

    const record = await InvestmentService.createInvestment(userId, {
      amount: investAmount,
      currency: currency || "NGN",
      productId,
      type: "SAVINGS",
      walletType: walletType || "MAIN",
      durationDays: durationDays ? Number(durationDays) : undefined,
      idempotencyKey: idempotencyKey || idempotencyHeader || undefined,
    });

    return NextResponse.json({
      success: true,
      message: "Savings account successfully created and funded!",
      investment: record,
    });
  } catch (err: unknown) {
    console.error("[Savings Create API Error]", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message || "Failed to create savings holding." }, { status: 400 });
  }
}
