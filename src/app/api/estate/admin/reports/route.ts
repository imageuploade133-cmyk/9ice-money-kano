import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

// GET /api/estate/admin/reports - Fetch all flagged property reports
export async function GET(req: Request) {
  try {
    const authResult = await requireAdminPermission(req, "estate.view");
    if (!authResult.authorized) {
      return authResult.response!;
    }

    const snap = await adminDb.collection("estate_reports").orderBy("createdAt", "desc").limit(100).get();
    const reports: any[] = [];

    snap.forEach((docSnap) => {
      reports.push({ id: docSnap.id, ...docSnap.data() });
    });

    return NextResponse.json({ success: true, reports });
  } catch (err: any) {
    console.error("[GET /api/estate/admin/reports Error]:", err.message);
    return NextResponse.json({ error: "Failed to fetch property reports." }, { status: 500 });
  }
}

// POST /api/estate/admin/reports - Update report status or action
export async function POST(req: Request) {
  try {
    const authResult = await requireAdminPermission(req, "estate.manage");
    if (!authResult.authorized) {
      return authResult.response!;
    }

    const body = await req.json();
    const { reportId, status, adminNote } = body;

    if (!reportId || !status) {
      return NextResponse.json({ error: "Report ID and target status are required." }, { status: 400 });
    }

    const reportRef = adminDb.collection("estate_reports").doc(reportId);
    const reportSnap = await reportRef.get();

    if (!reportSnap.exists) {
      return NextResponse.json({ error: "Report document not found." }, { status: 404 });
    }

    const nowIso = new Date().toISOString();

    await reportRef.update({
      status: String(status).toUpperCase(),
      adminNote: adminNote ? String(adminNote).trim() : "",
      updatedAt: nowIso,
    });

    return NextResponse.json({
      success: true,
      message: `Report status updated to ${status}.`,
    });
  } catch (err: any) {
    console.error("[POST /api/estate/admin/reports Error]:", err.message);
    return NextResponse.json({ error: "Failed to update property report." }, { status: 500 });
  }
}
