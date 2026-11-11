import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

// GET /api/estate/admin/sellers - CPanel fetch sellers
export async function GET(req: Request) {
  try {
    const authCheck = await requireAdminPermission(req, "estate.view");
    if (!authCheck.authorized) return authCheck.response!;

    const snap = await adminDb.collection("estate_sellers").limit(100).get();
    const sellers: any[] = [];

    snap.forEach((docSnap) => {
      sellers.push({ uid: docSnap.id, ...docSnap.data() });
    });

    return NextResponse.json({ success: true, sellers });
  } catch (err: any) {
    console.error("[GET /api/estate/admin/sellers Error]:", err.message);
    return NextResponse.json({ error: "Failed to fetch seller directory." }, { status: 500 });
  }
}

// POST /api/estate/admin/sellers - Verify / Reject / Ban / Restrict seller agent
export async function POST(req: Request) {
  try {
    const authCheck = await requireAdminPermission(req, "estate.manage");
    if (!authCheck.authorized) return authCheck.response!;

    const body = await req.json();
    const { action, sellerUid, banReason, restrictionHours } = body;

    if (!sellerUid || !action) {
      return NextResponse.json({ error: "Seller UID and action are required." }, { status: 400 });
    }

    const docRef = adminDb.collection("estate_sellers").doc(sellerUid);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Seller profile not found." }, { status: 404 });
    }

    const nowIso = new Date().toISOString();

    const { customUntilIso } = body;

    if (action === "verify") {
      await docRef.update({
        isVerified: true,
        verificationStatus: "VERIFIED",
        updatedAt: nowIso,
      });
      return NextResponse.json({ success: true, message: "Seller agent verified successfully." });
    } else if (action === "reject") {
      await docRef.update({
        isVerified: false,
        verificationStatus: "REJECTED",
        updatedAt: nowIso,
      });
      return NextResponse.json({ success: true, message: "Seller agent verification rejected." });
    } else if (action === "ban") {
      await docRef.update({
        bannedFromPublishing: true,
        banReason: banReason ? String(banReason).trim() : "Violation of marketplace publishing guidelines.",
        updatedAt: nowIso,
      });
      return NextResponse.json({ success: true, message: "Seller agent banned from publishing properties." });
    } else if (action === "unban") {
      await docRef.update({
        bannedFromPublishing: false,
        banReason: "",
        updatedAt: nowIso,
      });
      return NextResponse.json({ success: true, message: "Seller agent unbanned successfully." });
    } else if (action === "restrict") {
      let restrictedUntilDate: string;
      if (customUntilIso && !isNaN(new Date(customUntilIso).getTime())) {
        restrictedUntilDate = new Date(customUntilIso).toISOString();
      } else {
        const hours = Number(restrictionHours) || 24;
        restrictedUntilDate = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      }

      await docRef.update({
        publishingRestricted: true,
        restrictedUntil: restrictedUntilDate,
        updatedAt: nowIso,
      });
      return NextResponse.json({
        success: true,
        message: `Seller agent publishing restricted until ${new Date(restrictedUntilDate).toLocaleString()}.`,
      });
    } else if (action === "unrestrict") {
      await docRef.update({
        publishingRestricted: false,
        restrictedUntil: null,
        updatedAt: nowIso,
      });
      return NextResponse.json({ success: true, message: "Seller agent publishing restriction removed." });
    }

    return NextResponse.json({ error: "Invalid admin seller action." }, { status: 400 });
  } catch (err: any) {
    console.error("[POST /api/estate/admin/sellers Error]:", err.message);
    return NextResponse.json({ error: "Failed to update seller status." }, { status: 500 });
  }
}
