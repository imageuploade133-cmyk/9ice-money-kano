import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

// 30-second server-side in-memory cache to guarantee ultra-low Firestore reads
interface SidebarCountsCache {
  counts: Record<string, number>;
  timestamp: number;
}

let sidebarCountsCache: SidebarCountsCache | null = null;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

export async function GET(req: Request) {
  try {
    const authCheck = await requireAdminPermission(req, "metrics.view");
    if (!authCheck.authorized) {
      return authCheck.response!;
    }

    const { searchParams } = new URL(req.url);
    const noCache = searchParams.get("nocache") === "true";

    const now = Date.now();
    if (!noCache && sidebarCountsCache && now - sidebarCountsCache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        counts: sidebarCountsCache.counts,
        cached: true,
      });
    }

    // Execute low-cost count aggregations concurrently
    const [
      kycRes,
      limitRequestsRes,
      heldDepositsRes,
      estatePropertiesRes,
      estateEditsRes,
      estateSellersRes,
      estateInquiriesRes,
      estateReportsRes,
      storeOrdersRes,
      storeReviewsRes,
      deleteRequestsRes,
      trnIssuesRes,
    ] = await Promise.allSettled([
      // 1. KYC Submissions Pending
      adminDb.collection("kyc_submissions").where("status", "in", ["PENDING", "PENDING_REVIEW"]).count().get(),
      // 2. Limit Requests Pending
      adminDb.collection("tier_upgrade_requests").where("status", "==", "PENDING").count().get(),
      // 3. Blocked & Held Deposits
      adminDb.collection("transactions").where("status", "==", "HELD_LIMIT_EXCEEDED").count().get(),
      // 4. Property Listings Pending Approval
      adminDb.collection("estate_properties").where("status", "in", ["PENDING", "PENDING_REVIEW"]).count().get(),
      // 5. Property Edits Pending
      adminDb.collection("estate_property_edits").where("status", "in", ["PENDING", "PENDING_REVIEW"]).count().get(),
      // 6. Sellers & Agents Unverified
      adminDb.collection("estate_sellers").where("isVerified", "==", false).count().get(),
      // 7. Customer Inquiries Pending
      adminDb.collection("estate_inquiries").where("status", "==", "PENDING").count().get(),
      // 8. Flagged Reports Pending
      adminDb.collection("estate_reports").where("status", "==", "PENDING").count().get(),
      // 9. Store Orders Dispatch Pending
      adminDb.collection("store_orders").where("status", "==", "PENDING").count().get(),
      // 10. Store Reviews Unreplied / Unviewed
      adminDb.collection("store_reviews").where("isViewed", "==", false).count().get(),
      // 11. Account Deletion Requests Pending
      adminDb.collection("users").where("deleteRequested", "==", true).count().get(),
      // 12. Transaction Issues Pending
      adminDb.collection("transaction_issues").where("status", "==", "PENDING").count().get(),
    ]);

    // Fallback handlers for count queries
    let kycCount = kycRes.status === "fulfilled" ? kycRes.value.data().count : 0;
    if (kycCount === 0) {
      try {
        const altKyc = await adminDb.collection("users").where("kycStatus", "in", ["PENDING", "PENDING_REVIEW"]).count().get();
        kycCount = altKyc.data().count;
      } catch {
        // Ignore fallback error
      }
    }

    let estatePropsCount = estatePropertiesRes.status === "fulfilled" ? estatePropertiesRes.value.data().count : 0;
    if (estatePropsCount === 0) {
      try {
        const altProps = await adminDb.collection("estate_properties").where("isApproved", "==", false).count().get();
        estatePropsCount = altProps.data().count;
      } catch {
        // Ignore fallback error
      }
    }

    const counts: Record<string, number> = {
      kyc: kycCount,
      limit_requests: limitRequestsRes.status === "fulfilled" ? limitRequestsRes.value.data().count : 0,
      held_deposits: heldDepositsRes.status === "fulfilled" ? heldDepositsRes.value.data().count : 0,
      estate_properties: estatePropsCount,
      estate_edits: estateEditsRes.status === "fulfilled" ? estateEditsRes.value.data().count : 0,
      estate_sellers: estateSellersRes.status === "fulfilled" ? estateSellersRes.value.data().count : 0,
      estate_inquiries: estateInquiriesRes.status === "fulfilled" ? estateInquiriesRes.value.data().count : 0,
      estate_reports: estateReportsRes.status === "fulfilled" ? estateReportsRes.value.data().count : 0,
      store_orders: storeOrdersRes.status === "fulfilled" ? storeOrdersRes.value.data().count : 0,
      store_reviews: storeReviewsRes.status === "fulfilled" ? storeReviewsRes.value.data().count : 0,
      delete_account: deleteRequestsRes.status === "fulfilled" ? deleteRequestsRes.value.data().count : 0,
      trn_issues: trnIssuesRes.status === "fulfilled" ? trnIssuesRes.value.data().count : 0,
    };

    sidebarCountsCache = {
      counts,
      timestamp: now,
    };

    return NextResponse.json({
      success: true,
      counts,
      cached: false,
    });
  } catch (err: any) {
    console.error("[Sidebar Counts API Error]:", err.message);
    return NextResponse.json({ error: "Failed to fetch sidebar counts", details: err.message }, { status: 500 });
  }
}
