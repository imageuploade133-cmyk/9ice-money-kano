import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "users.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const { searchParams } = new URL(req.url);
    const searchQuery = (searchParams.get("search") || searchParams.get("q") || "").trim().toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10", 10)));

    // Fetch all deletion requests or users who requested deletion
    const usersSnap = await adminDb.collection("users").get();
    const requests: any[] = [];

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const isDeleteReq = Boolean(data.deleteRequested);

      if (!isDeleteReq) continue;

      const email = (data.email || "").toLowerCase();
      const phone = (data.phoneNumber || data.phone || "").toLowerCase();
      const name = (data.fullName || data.name || data.displayName || `${data.firstName || ""} ${data.lastName || ""}`).toLowerCase();

      if (
        !searchQuery ||
        email.includes(searchQuery) ||
        phone.includes(searchQuery) ||
        name.includes(searchQuery) ||
        doc.id.toLowerCase().includes(searchQuery)
      ) {
        // Fetch wallet balances
        let ngnBalance = Number(data.balance) || 0;
        try {
          const ngnWalletDoc = await adminDb.collection("wallets").doc(`${doc.id}_NGN`).get();
          if (ngnWalletDoc.exists) {
            ngnBalance = Number(ngnWalletDoc.data()?.balance) || ngnBalance;
          }
        } catch {
          // Fallback to profile balance
        }

        requests.push({
          uid: doc.id,
          name: data.fullName || data.name || data.displayName || `${data.firstName || ""} ${data.lastName || ""}`.trim() || "User",
          email: data.email || "",
          phoneNumber: data.phoneNumber || data.phone || "",
          balance: ngnBalance,
          kycStatus: data.kycStatus || "TIER_0",
          kycLevel: data.kycLevel || 0,
          isBanned: Boolean(data.isBanned || data.status === "BANNED" || data.status === "banned"),
          isFrozen: Boolean(data.isFrozen),
          deleteRequestedAt: data.deleteRequestedAt || data.updatedAt || new Date().toISOString(),
          deleteReason: data.deleteReason || "User requested account deletion.",
          virtualAccountNumber: data.virtualAccountNumber || "N/A",
          createdAt: data.createdAt || "",
        });
      }
    }

    // Sort newest deletion requests first
    requests.sort((a, b) => new Date(b.deleteRequestedAt).getTime() - new Date(a.deleteRequestedAt).getTime());

    const totalCount = requests.length;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedRequests = requests.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      success: true,
      requests: paginatedRequests,
      count: totalCount,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    });
  } catch (err: any) {
    console.error("[Admin Delete Account GET Error]:", err.message);
    return NextResponse.json({ error: "Failed to load deletion requests", details: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "users.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const { targetUid, action, banReason } = body;

    if (!targetUid) {
      return NextResponse.json({ error: "Missing required parameter: targetUid" }, { status: 400 });
    }

    const userRef = adminDb.collection("users").doc(targetUid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: "Target user profile not found." }, { status: 404 });
    }

    const nowIso = new Date().toISOString();

    if (action === "ban") {
      await userRef.set({
        isBanned: true,
        status: "BANNED",
        bannedAt: nowIso,
        banReason: String(banReason || "Account banned by CPanel Administrator.").trim(),
        updatedAt: nowIso,
      }, { merge: true });

      // Record in security audit log
      await adminDb.collection("security_audit_logs").add({
        action: "ACCOUNT_BANNED",
        targetUid,
        adminUid: perm.auth?.uid || "admin",
        timestamp: nowIso,
      });

      return NextResponse.json({
        success: true,
        message: "User account has been permanently banned. User will be blocked from logging in.",
        targetUid,
        isBanned: true,
      });
    }

    if (action === "unban") {
      await userRef.set({
        isBanned: false,
        status: "ACTIVE",
        unbannedAt: nowIso,
        updatedAt: nowIso,
      }, { merge: true });

      await adminDb.collection("security_audit_logs").add({
        action: "ACCOUNT_UNBANNED",
        targetUid,
        adminUid: perm.auth?.uid || "admin",
        timestamp: nowIso,
      });

      return NextResponse.json({
        success: true,
        message: "User account has been unbanned and restored to ACTIVE.",
        targetUid,
        isBanned: false,
      });
    }

    if (action === "dismiss_request") {
      await userRef.set({
        deleteRequested: false,
        deleteRequestedAt: null,
        deleteReason: null,
        updatedAt: nowIso,
      }, { merge: true });

      return NextResponse.json({
        success: true,
        message: "Account deletion request dismissed.",
        targetUid,
      });
    }

    return NextResponse.json({ error: "Invalid action specified." }, { status: 400 });
  } catch (err: any) {
    console.error("[Admin Delete Account POST Error]:", err.message);
    return NextResponse.json({ error: "Failed to perform admin action", details: err.message }, { status: 500 });
  }
}
