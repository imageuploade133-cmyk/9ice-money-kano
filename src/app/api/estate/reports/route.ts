import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { authenticateUserRequest } from "@/lib/auth-util";

// POST /api/estate/reports - Submit property violation/fraud report
export async function POST(req: Request) {
  try {
    let userId = "anonymous_user";
    try {
      const authCheck = await authenticateUserRequest(req);
      userId = authCheck.uid || "anonymous_user";
    } catch {
      // Allow report submission if unauthenticated
    }

    const body = await req.json();
    const { propertyId, propertyTitle, sellerId, reason, details, evidenceUrl, reporterPhone } = body;

    if (!propertyId || !reason || !details) {
      return NextResponse.json(
        { error: "Property ID, reason, and additional details are required." },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const reportRef = adminDb.collection("estate_reports").doc();

    const reportData = {
      id: reportRef.id,
      propertyId: String(propertyId),
      propertyTitle: propertyTitle ? String(propertyTitle) : "Property Listing",
      sellerId: sellerId ? String(sellerId) : "unknown_seller",
      reporterUserId: userId,
      reporterPhone: reporterPhone ? String(reporterPhone).trim() : "",
      reason: String(reason).trim(),
      details: String(details).trim(),
      evidenceUrl: evidenceUrl ? String(evidenceUrl).trim() : "",
      status: "PENDING_REVIEW",
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await reportRef.set(reportData);

    return NextResponse.json({
      success: true,
      message: "Listing report submitted for administrative investigation.",
      reportId: reportRef.id,
    });
  } catch (err: any) {
    console.error("[POST /api/estate/reports Error]:", err.message);
    return NextResponse.json(
      { error: "Failed to submit property report.", details: err.message },
      { status: 500 }
    );
  }
}
