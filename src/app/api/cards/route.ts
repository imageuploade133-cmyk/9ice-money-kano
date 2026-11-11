import { NextResponse } from "next/server";
import { authenticateUserRequest, verifyUserKycApproved } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";
import { CardService } from "@/services/card-service";
import { hasAdminCredentials } from "@/lib/firebase-admin";
import { checkServerFeatureStatus } from "@/lib/feature-toggle-server";

export async function GET(req: Request) {
  let uid = "";
  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
  } catch (err: any) {
    return NextResponse.json({ error: "Unauthorized: Invalid or missing token." }, { status: 401 });
  }

  const isMock = uid === "mock-uid" || !hasAdminCredentials;

  if (isMock) {
    // Return simulated mock cards for local playtesting / sandbox
    const mockCards = [
      {
        id: "mock-card-usd",
        cardId: "flw-vc-usd-112233",
        userId: uid,
        currency: "USD",
        maskedPan: "415088******6354",
        expiry: "12/29",
        cardholder: "JULES VERNE",
        theme: "obsidian",
        isLocked: false,
        frozen: false,
        terminated: false,
        balance: 150.00,
        lastFour: "6354",
        brand: "visa",
        cardType: "VIRTUAL",
        fundingWallet: "USD",
        provider: "FLUTTERWAVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        billingAddress: {
          country: "US",
          state: "CA",
          city: "San Francisco",
          postalCode: "94105",
          address: "333 Fremont Street"
        }
      },
      {
        id: "mock-card-ngn",
        cardId: "flw-vc-ngn-445566",
        userId: uid,
        currency: "NGN",
        maskedPan: "506148******4829",
        expiry: "08/29",
        cardholder: "JULES VERNE",
        theme: "sunset",
        isLocked: false,
        frozen: false,
        terminated: false,
        balance: 25000.00,
        lastFour: "4829",
        brand: "mastercard",
        cardType: "VIRTUAL",
        fundingWallet: "NGN",
        provider: "FLUTTERWAVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        billingAddress: {
          country: "NG",
          state: "Lagos",
          city: "Ikeja",
          postalCode: "100001",
          address: "12 Allen Avenue"
        }
      }
    ];
    return NextResponse.json({ success: true, cards: mockCards });
  }

  try {
    // Read user cards subcollection
    const cardsSnap = await adminDb.collection("users").doc(uid).collection("cards").where("terminated", "==", false).get();
    const cards = cardsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ success: true, cards });
  } catch (error: any) {
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const featureStatus = await checkServerFeatureStatus("virtual_cards");
  if (!featureStatus.enabled) {
    return NextResponse.json({ error: featureStatus.message }, { status: 403 });
  }

  let uid = "";
  let idToken = "";
  let sessionId = "";
  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
    const authHeader = req.headers.get("Authorization") || "";
    idToken = authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : "";
    sessionId = req.headers.get("X-Session-ID") || req.headers.get("x-session-id") || "";
  } catch (err: any) {
    return NextResponse.json({ error: "Unauthorized: Invalid or missing token." }, { status: 401 });
  }

  // Enforce KYC verification
  const isApproved = await verifyUserKycApproved(uid);
  if (!isApproved) {
    return NextResponse.json({ error: "Forbidden: Account verification is required to perform financial transactions." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { currency, amount, billingAddress, cardholder } = body;

    if (!currency || !billingAddress || !cardholder) {
      return NextResponse.json({ error: "Invalid payload: currency, billingAddress, and cardholder are required." }, { status: 400 });
    }

    const trfAmount = Number(amount) || 0;
    if (trfAmount < 0) {
      return NextResponse.json({ error: "Amount must be zero or positive." }, { status: 400 });
    }

    const isMock = uid === "mock-uid";

    const card = await CardService.createCard({
      userId: uid,
      currency,
      amount: trfAmount,
      billingAddress,
      cardholder,
      idToken,
      sessionId,
      isMock,
    });

    return NextResponse.json({ success: true, card });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create virtual card." }, { status: 400 });
  }
}
