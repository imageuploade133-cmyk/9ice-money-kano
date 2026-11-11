import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyFirebaseIdToken } from "@/lib/auth-util";

// GET /api/estate/properties/[id] - Fetch single property details
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const docSnap = await adminDb.collection("estate_properties").doc(id).get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Property listing not found." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      property: { id: docSnap.id, ...docSnap.data() },
    });
  } catch (err: any) {
    console.error("[GET /api/estate/properties/[id] Error]:", err.message);
    return NextResponse.json({ error: "Failed to load property details." }, { status: 500 });
  }
}

// PUT /api/estate/properties/[id] - Seller update listing
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    const docRef = adminDb.collection("estate_properties").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Property listing not found." }, { status: 404 });
    }

    const existingData = docSnap.data() || {};
    if (existingData.sellerId !== uid) {
      return NextResponse.json(
        { error: "Forbidden. You do not own this property listing." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const nowIso = new Date().toISOString();

    // Re-review status if listing was previously PUBLISHED/APPROVED
    const newStatus =
      existingData.status === "PUBLISHED" || existingData.status === "APPROVED"
        ? "PENDING_REVIEW"
        : body.status || existingData.status;

    const updatedData = {
      ...existingData,
      title: body.title ? String(body.title).trim() : existingData.title,
      description: body.description ? String(body.description).trim() : existingData.description,
      purpose: body.purpose || existingData.purpose,
      propertyType: body.propertyType || existingData.propertyType,
      price: body.price !== undefined ? Number(body.price) : existingData.price,
      pricePeriod: body.pricePeriod || existingData.pricePeriod,
      location: body.location || existingData.location,
      bedrooms: body.bedrooms !== undefined ? Number(body.bedrooms) : existingData.bedrooms,
      bathrooms: body.bathrooms !== undefined ? Number(body.bathrooms) : existingData.bathrooms,
      toilets: body.toilets !== undefined ? Number(body.toilets) : existingData.toilets,
      propertySize: body.propertySize !== undefined ? body.propertySize : existingData.propertySize,
      furnished: body.furnished || existingData.furnished,
      amenities: Array.isArray(body.amenities) ? body.amenities : existingData.amenities,
      images: Array.isArray(body.images) ? body.images : existingData.images,
      videos: Array.isArray(body.videos) ? body.videos : existingData.videos,
      status: newStatus,
      updatedAt: nowIso,
    };

    await docRef.update(updatedData);

    return NextResponse.json({
      success: true,
      message: "Property listing updated successfully.",
      property: { id, ...updatedData },
    });
  } catch (err: any) {
    console.error("[PUT /api/estate/properties/[id] Error]:", err.message);
    return NextResponse.json({ error: "Failed to update property listing." }, { status: 500 });
  }
}

// DELETE /api/estate/properties/[id] - Seller delete / archive listing
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    const docRef = adminDb.collection("estate_properties").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Property listing not found." }, { status: 404 });
    }

    const existingData = docSnap.data() || {};
    if (existingData.sellerId !== uid) {
      return NextResponse.json(
        { error: "Forbidden. You do not own this property listing." },
        { status: 403 }
      );
    }

    await docRef.delete();

    return NextResponse.json({
      success: true,
      message: "Property listing deleted successfully.",
    });
  } catch (err: any) {
    console.error("[DELETE /api/estate/properties/[id] Error]:", err.message);
    return NextResponse.json({ error: "Failed to delete property listing." }, { status: 500 });
  }
}
