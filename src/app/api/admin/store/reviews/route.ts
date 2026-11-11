import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

// GET: Fetch paginated reviews for admin management (10 items per page by default) and unviewed/unreplied notification count
export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "store.view");
    if (!perm.authorized) {
      return perm.response!;
    }

    const { searchParams } = new URL(req.url);
    const countOnly = searchParams.get("countOnly") === "true";
    const productId = searchParams.get("productId");
    const limitParam = parseInt(searchParams.get("limit") || "10", 10);
    const pageLimit = isNaN(limitParam) ? 10 : Math.min(Math.max(limitParam, 1), 50);
    const startAfterId = searchParams.get("startAfterId");

    // Fast count check for unreplied / unviewed reviews for badge notification in slide menu
    const unrepliedSnap = await adminDb.collection("store_reviews").get();
    let unrepliedCount = 0;
    let unviewedCount = 0;

    unrepliedSnap.docs.forEach((doc: any) => {
      const data = doc.data();
      const hasReply = Boolean(data.adminReply && data.adminReply.message);
      const isViewed = Boolean(data.isViewed);

      if (!hasReply) unrepliedCount++;
      if (!isViewed && !hasReply) unviewedCount++;
    });

    if (countOnly) {
      return NextResponse.json({
        success: true,
        unrepliedCount,
        unviewedCount,
        totalReviews: unrepliedSnap.size,
      });
    }

    let query: any = adminDb.collection("store_reviews");
    if (productId) {
      query = query.where("productId", "==", productId);
    }

    let allDocs = unrepliedSnap.docs;
    if (productId) {
      allDocs = allDocs.filter((d: any) => d.data().productId === productId);
    }

    // Sort descending by createdAt
    const sorted = allDocs
      .map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    // Paginate in memory / cursor slice for safe execution
    let startIndex = 0;
    if (startAfterId) {
      const foundIdx = sorted.findIndex((item: any) => item.id === startAfterId);
      if (foundIdx !== -1) {
        startIndex = foundIdx + 1;
      }
    }

    const paginatedReviews = sorted.slice(startIndex, startIndex + pageLimit);
    const hasMore = startIndex + pageLimit < sorted.length;
    const lastDoc = paginatedReviews[paginatedReviews.length - 1];

    return NextResponse.json({
      success: true,
      reviews: paginatedReviews,
      hasMore,
      nextCursor: lastDoc ? lastDoc.id : null,
      totalCount: sorted.length,
      unrepliedCount,
      unviewedCount,
    });
  } catch (err: any) {
    console.error("[Admin Store Reviews GET Error]:", err.message);
    return NextResponse.json({ error: "Operation failed", details: err.message }, { status: 500 });
  }
}

// POST: Admin Actions (Reply, Hide/Show, Delete, Mark Viewed)
export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "store.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const { uid } = perm.auth;

    const body = await req.json();
    const { action, reviewId, reviewIds, reply, isHidden } = body;

    if (action === "mark_viewed") {
      if (Array.isArray(reviewIds) && reviewIds.length > 0) {
        const batch = adminDb.batch();
        reviewIds.forEach((id: string) => {
          const ref = adminDb.collection("store_reviews").doc(id);
          batch.set(ref, { isViewed: true }, { merge: true });
        });
        await batch.commit();
        return NextResponse.json({ success: true, message: "Reviews marked as viewed." });
      }

      if (reviewId) {
        await adminDb.collection("store_reviews").doc(reviewId).set({ isViewed: true }, { merge: true });
        return NextResponse.json({ success: true, message: "Review marked as viewed." });
      }

      return NextResponse.json({ error: "No reviewId or reviewIds provided to mark viewed." }, { status: 400 });
    }

    if (!reviewId) {
      return NextResponse.json({ error: "Review ID is required." }, { status: 400 });
    }

    const ref = adminDb.collection("store_reviews").doc(reviewId);

    if (action === "reply") {
      await ref.set(
        {
          isViewed: true,
          adminReply: {
            message: (reply || "").trim(),
            repliedAt: new Date().toISOString(),
            repliedBy: uid,
          },
        },
        { merge: true }
      );
      return NextResponse.json({ success: true, message: "Review reply saved." });
    }

    if (action === "toggle_hide") {
      await ref.set({ isHidden: Boolean(isHidden) }, { merge: true });
      return NextResponse.json({
        success: true,
        message: isHidden ? "Review hidden from public store." : "Review visible on public store.",
      });
    }

    if (action === "delete") {
      await ref.delete();
      return NextResponse.json({ success: true, message: "Review deleted successfully." });
    }

    return NextResponse.json({ error: "Invalid action requested." }, { status: 400 });
  } catch (err: any) {
    console.error("[Admin Store Reviews POST Error]:", err.message);
    return NextResponse.json({ error: "Operation failed", details: err.message }, { status: 500 });
  }
}
