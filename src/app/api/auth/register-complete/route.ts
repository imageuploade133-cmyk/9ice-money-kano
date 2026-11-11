import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";
import { ReferralService } from "@/services/referral-service";
import { sendWelcomeEmail } from "@/lib/email-service";

export async function POST(req: Request) {
  let uid = "";

  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
  } catch (authErr: any) {
    console.error("[Register Complete Proxy Auth Error] Authentication failed:", authErr.message);
    return NextResponse.json({ error: "Unauthorized: Invalid or missing authorization token." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      firstName,
      lastName,
      phonePrefix,
      phoneNumber,
      email,
      referralCode,
    } = body;

    if (!firstName || !lastName || !email) {
      return NextResponse.json({ error: "Missing required profile fields: firstName, lastName, and email are required." }, { status: 400 });
    }

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const fullName = `${cleanFirstName} ${cleanLastName}`;
    const cleanEmail = email.trim().toLowerCase();

    // Construct phone number safely
    let fullPhone = "";
    if (phoneNumber) {
      const prefix = (phonePrefix || "").trim();
      const num = (phoneNumber || "").trim();
      fullPhone = `${prefix}${num}`;
    }

    console.log(`[Register Complete] Initializing user profile directly in Firestore for uid: ${uid}`);

    const userRef = adminDb.collection("users").doc(uid);
    const [userSnap, appConfigSnap] = await Promise.all([
      userRef.get(),
      adminDb.collection("config").doc("app").get(),
    ]);

    const appConfigData = appConfigSnap.exists ? appConfigSnap.data() : {};
    const defaultTier1MaxBalance = typeof appConfigData?.tier1MaxBalance === "number" ? appConfigData.tier1MaxBalance : 300000;
    const defaultTier1DailyTransfer = typeof appConfigData?.tier1DailyTransferLimit === "number" ? appConfigData.tier1DailyTransferLimit : 500000;
    const defaultTier1DailyDeposit = typeof appConfigData?.tier1DailyDepositLimit === "number" ? appConfigData.tier1DailyDepositLimit : 500000;
    const defaultTier1SingleTransfer = typeof appConfigData?.tier1SingleTransferLimit === "number" ? appConfigData.tier1SingleTransferLimit : 200000;

    // Standard initial fields for new user account (Custom limits default to 0 so system falls back to Global Defaults)
    const initialProfile = {
      uid,
      name: fullName,
      firstName: cleanFirstName,
      lastName: cleanLastName,
      email: cleanEmail,
      phoneNumber: fullPhone,
      emailVerified: true,
      phoneVerified: fullPhone ? true : false,
      tier: userSnap.exists && userSnap.data()?.tier ? userSnap.data()?.tier : "Tier 1",
      createdAt: userSnap.exists && userSnap.data()?.createdAt ? userSnap.data()?.createdAt : new Date().toISOString(),
      balance: userSnap.exists && typeof userSnap.data()?.balance === "number" ? userSnap.data()?.balance : 0.00,
      bonusBalance: userSnap.exists && typeof userSnap.data()?.bonusBalance === "number" ? userSnap.data()?.bonusBalance : 0.00,
      status: userSnap.exists && userSnap.data()?.status ? userSnap.data()?.status : "active",
      kycStatus: userSnap.exists && userSnap.data()?.kycStatus ? userSnap.data()?.kycStatus : "UNVERIFIED",
      role: userSnap.exists && userSnap.data()?.role ? userSnap.data()?.role : "USER",
      dailyTransferLimit: userSnap.exists && typeof userSnap.data()?.dailyTransferLimit === "number" ? userSnap.data()?.dailyTransferLimit : 0,
      dailyLimit: userSnap.exists && typeof userSnap.data()?.dailyLimit === "number" ? userSnap.data()?.dailyLimit : 0,
      dailyDepositLimit: userSnap.exists && typeof userSnap.data()?.dailyDepositLimit === "number" ? userSnap.data()?.dailyDepositLimit : 0,
      maxSingleTransferLimit: userSnap.exists && typeof userSnap.data()?.maxSingleTransferLimit === "number" ? userSnap.data()?.maxSingleTransferLimit : 0,
      maxAccountBalance: userSnap.exists && typeof userSnap.data()?.maxAccountBalance === "number" ? userSnap.data()?.maxAccountBalance : 0,
      isPinRequired: userSnap.exists && userSnap.data()?.isPinRequired !== undefined ? userSnap.data()?.isPinRequired : true,
      isFaceIdEnabled: userSnap.exists && userSnap.data()?.isFaceIdEnabled !== undefined ? userSnap.data()?.isFaceIdEnabled : false,
      updatedAt: new Date().toISOString(),
    };

    // Save user document securely
    await userRef.set(initialProfile, { merge: true });

    // Non-blocking Welcome Email dispatch
    sendWelcomeEmail(cleanEmail, fullName).catch((emailErr) => {
      console.warn("[Register Complete] Non-blocking welcome email exception:", emailErr);
    });

    // Handle referral registration if code was provided
    if (referralCode) {
      console.log(`[Register Complete] Processing referral for uid: ${uid} with code: ${referralCode}`);
      try {
        await ReferralService.registerReferral(uid, referralCode, fullName, cleanEmail);
      } catch (refErr: any) {
        console.error(`[Register Complete Referral Error]:`, refErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: "User registration finalized successfully directly in secure database."
    });

  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Register Complete] Error writing user registration data:", error);
    return NextResponse.json({ error: error.message || "An error occurred writing user registration data." }, { status: 500 });
  }
}
