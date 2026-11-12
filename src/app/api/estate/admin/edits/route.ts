import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

// GET /api/estate/admin/edits - List property edit logs and pending review items with search & cursor pagination
export async function GET(req: Request) {
  try {
    const authResult = await requireAdminPermission(req, "estate.view");
    if (!authResult.authorized) {
      return authResult.response!;
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "ALL";
    const searchQuery = searchParams.get("search") ? searchParams.get("search")!.trim().toLowerCase() : "";
    const limitNum = Math.min(50, Math.max(5, Number(searchParams.get("limit")) || 15));
    const startAfterDocId = searchParams.get("startAfter") || "";

    let editsRef: FirebaseFirestore.Query = adminDb.collection("estate_property_edits");

    if (status !== "ALL") {
      editsRef = editsRef.where("status", "==", status);
    }

    editsRef = editsRef.orderBy("createdAt", "desc");

    if (startAfterDocId) {
      const startAfterSnap = await adminDb.collection("estate_property_edits").doc(startAfterDocId).get();
      if (startAfterSnap.exists) {
        editsRef = editsRef.startAfter(startAfterSnap);
      }
    }

    // Fetch batch with +1 to check for hasNextPage
    const snap = await editsRef.limit(limitNum + 1).get();
    let edits: any[] = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      edits.push({
        id: docSnap.id,
        ...data,
      });
    });

    // Client-side text filter if search query provided
    if (searchQuery) {
      edits = edits.filter((edit) => {
        const title = (edit.propertyTitle || edit.newData?.title || "").toLowerCase();
        const seller = (edit.sellerName || "").toLowerCase();
        const propertyId = (edit.propertyId || "").toLowerCase();
        const editId = (edit.id || "").toLowerCase();
        return (
          title.includes(searchQuery) ||
          seller.includes(searchQuery) ||
          propertyId.includes(searchQuery) ||
          editId.includes(searchQuery)
        );
      });
    }

    const hasNextPage = edits.length > limitNum;
    if (hasNextPage) {
      edits = edits.slice(0, limitNum);
    }

    const lastDocId = edits.length > 0 ? edits[edits.length - 1].id : null;

    // Also fetch pending properties count for header metric and tab status counts
    const pendingPropsSnap = await adminDb
      .collection("estate_properties")
      .where("status", "==", "PENDING_REVIEW")
      .count()
      .get();

    const pendingPropertiesCount = pendingPropsSnap.data().count || 0;

    let statusCounts = {
      ALL: 0,
      PENDING_REVIEW: 0,
      APPROVED: 0,
      REJECTED: 0,
      FLAGGED: 0,
    };

    try {
      const [allSnap, pendingSnap, approvedSnap, rejectedSnap, flaggedSnap] = await Promise.all([
        adminDb.collection("estate_property_edits").count().get(),
        adminDb.collection("estate_property_edits").where("status", "==", "PENDING_REVIEW").count().get(),
        adminDb.collection("estate_property_edits").where("status", "==", "APPROVED").count().get(),
        adminDb.collection("estate_property_edits").where("status", "==", "REJECTED").count().get(),
        adminDb.collection("estate_property_edits").where("status", "==", "FLAGGED").count().get(),
      ]);

      statusCounts = {
        ALL: allSnap.data().count || 0,
        PENDING_REVIEW: pendingSnap.data().count || 0,
        APPROVED: approvedSnap.data().count || 0,
        REJECTED: rejectedSnap.data().count || 0,
        FLAGGED: flaggedSnap.data().count || 0,
      };
    } catch (countErr: any) {
      console.warn("[GET /api/estate/admin/edits] Status count aggregation warning:", countErr.message);
    }

    return NextResponse.json({
      success: true,
      edits,
      pagination: {
        hasNextPage,
        lastDocId,
        limit: limitNum,
      },
      metrics: {
        pendingPropertiesCount,
      },
      statusCounts,
    });
  } catch (err: any) {
    console.error("[GET /api/estate/admin/edits Error]:", err.message);
    return NextResponse.json({ error: "Failed to fetch property edit logs." }, { status: 500 });
  }
}

// POST /api/estate/admin/edits - Admin approve, reject/revert, or flag property edit
export async function POST(req: Request) {
  try {
    const authResult = await requireAdminPermission(req, "estate.manage");
    if (!authResult.authorized) {
      return authResult.response!;
    }

    const body = await req.json();
    const { editLogId, action, adminNote } = body;

    if (!editLogId || !action) {
      return NextResponse.json({ error: "Edit log ID and action are required." }, { status: 400 });
    }

    const editLogRef = adminDb.collection("estate_property_edits").doc(editLogId);
    const editSnap = await editLogRef.get();

    if (!editSnap.exists) {
      return NextResponse.json({ error: "Property edit record not found." }, { status: 404 });
    }

    const editData = editSnap.data() || {};
    const propertyId = editData.propertyId;
    const nowIso = new Date().toISOString();

    const propDocRef = adminDb.collection("estate_properties").doc(propertyId);

    if (action === "approve") {
      await editLogRef.update({
        status: "APPROVED",
        adminNote: adminNote ? String(adminNote).trim() : "Property update approved by administrator.",
        updatedAt: nowIso,
      });

      return NextResponse.json({
        success: true,
        message: "Property edit approved successfully.",
      });
    }

    if (action === "reject") {
      // Revert property back to previous snapshot data
      if (editData.previousData) {
        await propDocRef.set(
          {
            ...editData.previousData,
            updatedAt: nowIso,
          },
          { merge: true }
        );
      }

      await editLogRef.update({
        status: "REJECTED",
        adminNote: adminNote ? String(adminNote).trim() : "Property update rejected and reverted by administrator.",
        updatedAt: nowIso,
      });

      return NextResponse.json({
        success: true,
        message: "Property edit rejected and changes reverted successfully.",
      });
    }

    if (action === "flag") {
      // Flag property and move back to PENDING_REVIEW with admin note
      await propDocRef.update({
        status: "PENDING_REVIEW",
        rejectionReason: adminNote ? String(adminNote).trim() : "Listing update flagged. Please contact Support.",
        updatedAt: nowIso,
      });

      await editLogRef.update({
        status: "FLAGGED",
        adminNote: adminNote ? String(adminNote).trim() : "Listing edit flagged to contact Support.",
        updatedAt: nowIso,
      });

      return NextResponse.json({
        success: true,
        message: "Property edit flagged to contact Support successfully.",
      });
    }

    if (action === "delete") {
      await editLogRef.delete();

      return NextResponse.json({
        success: true,
        message: "Property edit audit record deleted successfully.",
      });
    }

    return NextResponse.json({ error: "Invalid action type." }, { status: 400 });
  } catch (err: any) {
    console.error("[POST /api/estate/admin/edits Error]:", err.message);
    return NextResponse.json({ error: "Failed to process property edit moderation." }, { status: 500 });
  }
}
