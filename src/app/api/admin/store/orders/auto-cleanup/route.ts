import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

export async function POST(req: Request) {
  try {
    // Verify admin permission or cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = process.env.CRON_SECRET || "e_tech_cron_secret_2025";

    if (cronSecret !== expectedSecret) {
      const perm = await requireAdminPermission(req, "store.manage");
      if (!perm.authorized) {
        return perm.response!;
      }
    }

    const twentyFourHoursAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const staleOrdersSnap = await adminDb
      .collection("store_orders")
      .where("createdAt", "<", twentyFourHoursAgoIso)
      .get();

    let deletedCount = 0;
    if (!staleOrdersSnap.empty) {
      const batch = adminDb.batch();

      staleOrdersSnap.forEach((doc) => {
        const data = doc.data();
        const st = String(data.status || "").toLowerCase();
        const paySt = String(data.paymentStatus || "").toLowerCase();

        if (
          st === "pending payment" ||
          st === "payment failed" ||
          st === "canceled" ||
          st === "cancelled" ||
          paySt === "pending_payment" ||
          paySt === "failed"
        ) {
          batch.delete(doc.ref);
          deletedCount++;
        }
      });

      if (deletedCount > 0) {
        await batch.commit();
      }
    }

    return NextResponse.json({
      success: true,
      message: `Automated cleanup completed successfully. Auto-deleted ${deletedCount} stale/abandoned order records (>24 hours old).`,
      deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[Store Orders Auto-Cleanup Exception]:", err.message);
    return NextResponse.json({ error: "Failed to run automated order cleanup", details: err.message }, { status: 500 });
  }
}
