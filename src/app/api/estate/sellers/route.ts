import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyFirebaseIdToken } from "@/lib/auth-util";

// GET /api/estate/sellers - Get seller profile by query sellerId or current authenticated user
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const querySellerId = searchParams.get("sellerId");

    // If querySellerId is supplied, allow reading public seller agent profile
    if (querySellerId) {
      const docSnap = await adminDb.collection("estate_sellers").doc(querySellerId).get();
      if (!docSnap.exists) {
        return NextResponse.json({ success: true, seller: null });
      }
      return NextResponse.json({
        success: true,
        seller: { uid: docSnap.id, ...docSnap.data() },
      });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized access token required." }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid session token." }, { status: 401 });
    }

    const uid = decoded.uid;
    const docSnap = await adminDb.collection("estate_sellers").doc(uid).get();

    if (!docSnap.exists) {
      return NextResponse.json({ success: true, seller: null });
    }

    return NextResponse.json({
      success: true,
      seller: { uid: docSnap.id, ...docSnap.data() },
    });
  } catch (err: any) {
    console.error("[GET /api/estate/sellers Error]:", err.message);
    return NextResponse.json({ error: "Failed to fetch seller profile." }, { status: 500 });
  }
}

// POST /api/estate/sellers - Register or update seller/agent profile
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized access token required." }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid session token." }, { status: 401 });
    }

    const uid = decoded.uid;
    const body = await req.json();

    const { displayName, agencyName, phone, email, address, avatarUrl, idDocumentUrl, autoResponseText, mutedFields } = body;

    if (!displayName || !phone || !email) {
      return NextResponse.json(
        { error: "Display name, phone number, and email address are required." },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection("estate_sellers").doc(uid);
    const existingSnap = await docRef.get();
    const existingData = existingSnap.data() || {};

    const nowIso = new Date().toISOString();
    const sellerPayload = {
      uid,
      displayName: String(displayName).trim(),
      agencyName: agencyName ? String(agencyName).trim() : "",
      phone: String(phone).trim(),
      email: String(email).trim().toLowerCase(),
      address: address ? String(address).trim() : "",
      avatarUrl: avatarUrl || existingData.avatarUrl || "",
      idDocumentUrl: idDocumentUrl || existingData.idDocumentUrl || "",
      autoResponseText: autoResponseText !== undefined ? String(autoResponseText).trim() : (existingData.autoResponseText || ""),
      mutedFields: Array.isArray(mutedFields) ? mutedFields : (existingData.mutedFields || []),
      isVerified: existingData.isVerified || false,
      verificationStatus: existingData.verificationStatus || "PENDING",
      createdAt: existingData.createdAt || nowIso,
      updatedAt: nowIso,
    };

    await docRef.set(sellerPayload, { merge: true });

    // Propagate updated avatarUrl and seller details to existing seller properties
    if (sellerPayload.avatarUrl || sellerPayload.agencyName || sellerPayload.phone) {
      try {
        const propsSnap = await adminDb.collection("estate_properties").where("sellerId", "==", uid).get();
        const batch = adminDb.batch();
        propsSnap.forEach((propDoc) => {
          batch.update(propDoc.ref, {
            sellerAvatarUrl: sellerPayload.avatarUrl || "",
            sellerName: sellerPayload.agencyName || sellerPayload.displayName,
            sellerPhone: sellerPayload.phone,
            updatedAt: nowIso,
          });
        });
        if (!propsSnap.empty) {
          await batch.commit();
        }
      } catch (err: any) {
        console.warn("[Propagate Seller Avatar Error]:", err.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Seller/Agent profile saved successfully.",
      seller: sellerPayload,
    });
  } catch (err: any) {
    console.error("[POST /api/estate/sellers Error]:", err.message);
    return NextResponse.json({ error: "Failed to save seller profile." }, { status: 500 });
  }
}
