import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

// Server-side in-memory cache with 2-minute TTL to reduce Firestore reads
interface CacheEntry {
  data: any;
  timestamp: number;
}
const estateAdminCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

// GET /api/estate/admin/properties - CPanel Admin manage property directory with cursor pagination & search
export async function GET(req: Request) {
  try {
    const authCheck = await requireAdminPermission(req, "estate.view");
    if (!authCheck.authorized) return authCheck.response!;

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") || "ALL";
    const limitParam = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const startAfterId = searchParams.get("startAfter") || "";
    const searchQuery = (searchParams.get("search") || "").trim().toLowerCase();
    const noCacheParam = searchParams.get("nocache") === "true";

    const inquiriesFlag = searchParams.get("inquiries") === "true";
    const reportsFlag = searchParams.get("reports") === "true";

    if (inquiriesFlag) {
      const snap = await adminDb.collection("estate_inquiries").orderBy("createdAt", "desc").limit(100).get();
      const inquiries: any[] = [];
      snap.forEach((docSnap) => {
        inquiries.push({ id: docSnap.id, ...docSnap.data() });
      });
      return NextResponse.json({ success: true, inquiries });
    }

    if (reportsFlag) {
      const snap = await adminDb.collection("estate_reports").orderBy("createdAt", "desc").limit(100).get();
      const reports: any[] = [];
      snap.forEach((docSnap) => {
        reports.push({ id: docSnap.id, ...docSnap.data() });
      });
      return NextResponse.json({ success: true, reports });
    }

    const cacheKey = `estate_admin_props_${statusParam}_${limitParam}_${startAfterId}_${searchQuery}`;
    const now = Date.now();
    const cached = estateAdminCache.get(cacheKey);

    if (!noCacheParam && cached && now - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    // Fast global count metrics using Firestore .count() aggregations for minimal reads
    const propertiesCol = adminDb.collection("estate_properties");
    const [
      totalSnap,
      pendingSnap,
      approvedSnap,
      rejectedSnap,
      draftSnap,
    ] = await Promise.all([
      propertiesCol.count().get(),
      propertiesCol.where("status", "==", "PENDING_REVIEW").count().get(),
      propertiesCol.where("status", "in", ["APPROVED", "PUBLISHED"]).count().get(),
      propertiesCol.where("status", "==", "REJECTED").count().get(),
      propertiesCol.where("status", "==", "DRAFT").count().get(),
    ]);

    const metrics = {
      totalCount: totalSnap.data().count,
      pendingCount: pendingSnap.data().count,
      approvedCount: approvedSnap.data().count,
      rejectedCount: rejectedSnap.data().count,
      draftCount: draftSnap.data().count,
    };

    // Build index-backed pagination query
    let query: FirebaseFirestore.Query = propertiesCol;

    if (statusParam === "APPROVED") {
      query = query.where("status", "in", ["APPROVED", "PUBLISHED"]);
    } else if (statusParam === "ALL") {
      // Exclude DRAFT items from admin directory so drafts remain strictly private to the seller
      query = query.where("status", "in", ["PENDING_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "RENTED", "SOLD", "ARCHIVED"]);
    } else {
      query = query.where("status", "==", statusParam);
    }

    query = query.orderBy("createdAt", "desc");

    if (startAfterId) {
      const startAfterDoc = await propertiesCol.doc(startAfterId).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }

    // Fetch +1 record to evaluate hasNextPage
    const snap = await query.limit(limitParam + 1).get();
    const rawDocs: any[] = [];

    snap.forEach((docSnap) => {
      rawDocs.push({ id: docSnap.id, ...docSnap.data() });
    });

    const hasNextPage = rawDocs.length > limitParam;
    if (hasNextPage) {
      rawDocs.pop();
    }

    const lastDocId = rawDocs.length > 0 ? rawDocs[rawDocs.length - 1].id : null;

    // Filter search in-memory if search parameter is provided
    let properties = rawDocs;
    if (searchQuery) {
      properties = rawDocs.filter((p) => {
        const title = (p.title || "").toLowerCase();
        const address = (p.location?.address || "").toLowerCase();
        const type = (p.propertyType || "").toLowerCase();
        const sellerName = (p.sellerName || "").toLowerCase();
        const sellerPhone = (p.sellerPhone || "").toLowerCase();
        const id = (p.id || "").toLowerCase();

        return (
          title.includes(searchQuery) ||
          address.includes(searchQuery) ||
          type.includes(searchQuery) ||
          sellerName.includes(searchQuery) ||
          sellerPhone.includes(searchQuery) ||
          id.includes(searchQuery)
        );
      });
    }

    const responsePayload = {
      success: true,
      properties,
      metrics,
      pagination: {
        hasNextPage,
        lastDocId,
        limit: limitParam,
      },
    };

    estateAdminCache.set(cacheKey, { data: responsePayload, timestamp: now });

    return NextResponse.json(responsePayload);
  } catch (err: any) {
    console.error("[GET /api/estate/admin/properties Error]:", err.message);
    return NextResponse.json({ error: "Failed to fetch administrative properties.", details: err.message }, { status: 500 });
  }
}

// POST /api/estate/admin/properties - Approve / Unapprove / Reject / Feature property
export async function POST(req: Request) {
  try {
    const authCheck = await requireAdminPermission(req, "estate.manage");
    if (!authCheck.authorized) return authCheck.response!;

    const body = await req.json();
    const { action, propertyId, rejectionReason } = body;

    if (!propertyId || !action) {
      return NextResponse.json({ error: "Property ID and action are required." }, { status: 400 });
    }

    const docRef = adminDb.collection("estate_properties").doc(propertyId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Property listing not found." }, { status: 404 });
    }

    const nowIso = new Date().toISOString();

    // Clear server query cache on mutation
    estateAdminCache.clear();

    if (action === "approve") {
      await docRef.update({
        status: "APPROVED",
        publishedAt: nowIso,
        updatedAt: nowIso,
      });
      return NextResponse.json({ success: true, message: "Property listing approved and published." });
    } else if (action === "unapprove" || action === "unpublish") {
      await docRef.update({
        status: "PENDING_REVIEW",
        publishedAt: null,
        updatedAt: nowIso,
      });
      return NextResponse.json({ success: true, message: "Property listing unapproved and returned to review queue." });
    } else if (action === "reject") {
      await docRef.update({
        status: "REJECTED",
        rejectionReason: rejectionReason ? String(rejectionReason).trim() : "Does not meet listing guidelines.",
        updatedAt: nowIso,
      });
      return NextResponse.json({ success: true, message: "Property listing rejected." });
    } else if (action === "toggle_featured") {
      const currentFeatured = !!docSnap.data()?.featured;
      await docRef.update({
        featured: !currentFeatured,
        updatedAt: nowIso,
      });
      return NextResponse.json({
        success: true,
        message: !currentFeatured ? "Property featured on marketplace home." : "Property unfeatured.",
      });
    } else if (action === "delete") {
      await docRef.delete();
      return NextResponse.json({ success: true, message: "Property listing deleted permanently." });
    }

    return NextResponse.json({ error: "Invalid admin property action." }, { status: 400 });
  } catch (err: any) {
    console.error("[POST /api/estate/admin/properties Error]:", err.message);
    return NextResponse.json({ error: "Failed to perform admin property action." }, { status: 500 });
  }
}
