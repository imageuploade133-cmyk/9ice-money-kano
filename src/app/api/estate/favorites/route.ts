import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyFirebaseIdToken } from "@/lib/auth-util";

// GET /api/estate/favorites - Get user's saved favorite properties
export async function GET(req: Request) {
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
    const favSnap = await adminDb
      .collection("estate_favorites")
      .where("userId", "==", uid)
      .get();

    const favoritePropertyIds: string[] = [];
    favSnap.forEach((doc) => {
      const data = doc.data();
      if (data.propertyId) {
        favoritePropertyIds.push(data.propertyId);
      }
    });

    if (favoritePropertyIds.length === 0) {
      return NextResponse.json({
        success: true,
        favoriteIds: [],
        properties: [],
      });
    }

    // Batch fetch property documents (up to 30)
    const propertyRefs = favoritePropertyIds.slice(0, 30).map((id) =>
      adminDb.collection("estate_properties").doc(id)
    );
    const propSnaps = await adminDb.getAll(...propertyRefs);

    const properties: any[] = [];
    propSnaps.forEach((snap) => {
      if (snap.exists) {
        properties.push({ id: snap.id, ...snap.data() });
      }
    });

    return NextResponse.json({
      success: true,
      favoriteIds: favoritePropertyIds,
      properties,
    });
  } catch (err: any) {
    console.error("[GET /api/estate/favorites Error]:", err.message);
    return NextResponse.json({ error: "Failed to fetch saved favorites." }, { status: 500 });
  }
}

// POST /api/estate/favorites - Toggle save property
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
    const { propertyId } = body;

    if (!propertyId) {
      return NextResponse.json({ error: "Property ID is required." }, { status: 400 });
    }

    const favRef = adminDb.collection("estate_favorites").doc(`${uid}_${propertyId}`);
    const favSnap = await favRef.get();

    if (favSnap.exists) {
      await favRef.delete();
      return NextResponse.json({
        success: true,
        saved: false,
        message: "Property removed from saved favorites.",
      });
    } else {
      await favRef.set({
        id: favRef.id,
        userId: uid,
        propertyId,
        savedAt: new Date().toISOString(),
      });
      return NextResponse.json({
        success: true,
        saved: true,
        message: "Property saved to favorites.",
      });
    }
  } catch (err: any) {
    console.error("[POST /api/estate/favorites Error]:", err.message);
    return NextResponse.json({ error: "Failed to toggle saved favorite." }, { status: 500 });
  }
}

// PUT /api/estate/favorites - Report listing
export async function PUT(req: Request) {
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
    const { propertyId, propertyTitle, reason, details } = body;

    if (!propertyId || !reason) {
      return NextResponse.json({ error: "Property ID and report reason are required." }, { status: 400 });
    }

    const reportRef = adminDb.collection("estate_reports").doc();
    const reportData = {
      id: reportRef.id,
      propertyId,
      propertyTitle: propertyTitle || "Reported Property",
      reporterUserId: uid,
      reason: String(reason).trim(),
      details: details ? String(details).trim() : "",
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };

    await reportRef.set(reportData);

    return NextResponse.json({
      success: true,
      message: "Property report submitted for admin investigation.",
      report: reportData,
    });
  } catch (err: any) {
    console.error("[PUT /api/estate/favorites Error]:", err.message);
    return NextResponse.json({ error: "Failed to submit property report." }, { status: 500 });
  }
}
