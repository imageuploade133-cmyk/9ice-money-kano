import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "wallet.deductions.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "15")));
    const searchQuery = (searchParams.get("search") || "").trim().toLowerCase();

    // Query deduction actions from admin_audit_logs
    const auditLogsSnap = await adminDb
      .collection("admin_audit_logs")
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();

    const logs: any[] = [];
    auditLogsSnap.forEach((doc) => {
      const data = doc.data() || {};
      const action = data.action || "";
      if (
        action === "global_wallet_deduction_executed" ||
        action === "global_wallet_deduction_deleted" ||
        action.startsWith("global_wallet_deduction") ||
        action.includes("deduction")
      ) {
        logs.push({ id: doc.id, ...data });
      }
    });

    // Enrich logs with admin user details (role and display name)
    const adminUids = Array.from(new Set(logs.map((l) => l.adminUid).filter(Boolean)));
    const adminProfilesMap = new Map<string, any>();

    if (adminUids.length > 0) {
      const adminDocs = await adminDb.getAll(...adminUids.map((uid) => adminDb.collection("admin_users").doc(uid)));
      adminDocs.forEach((d) => {
        if (d.exists) {
          adminProfilesMap.set(d.id, d.data());
        }
      });
    }

    const enrichedLogs = logs.map((log) => {
      const profile = adminProfilesMap.get(log.adminUid) || {};
      return {
        id: log.id,
        action: log.action,
        adminEmail: log.adminEmail || profile.email || "Administrator",
        adminUid: log.adminUid || "",
        adminName: profile.displayName || profile.name || log.adminEmail?.split("@")[0] || "Admin",
        adminRole: profile.role || "super_admin",
        deductionId: log.deductionId || "",
        details: log.details || {},
        timestamp: log.timestamp || log.createdAt || new Date().toISOString(),
      };
    });

    // Search filter
    let filteredLogs = enrichedLogs;
    if (searchQuery) {
      filteredLogs = enrichedLogs.filter(
        (l) =>
          l.adminName.toLowerCase().includes(searchQuery) ||
          l.adminEmail.toLowerCase().includes(searchQuery) ||
          l.adminRole.toLowerCase().includes(searchQuery) ||
          l.action.toLowerCase().includes(searchQuery) ||
          l.deductionId.toLowerCase().includes(searchQuery) ||
          JSON.stringify(l.details).toLowerCase().includes(searchQuery)
      );
    }

    const totalRecords = filteredLogs.length;
    const totalPages = Math.ceil(totalRecords / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedLogs = filteredLogs.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      success: true,
      logs: paginatedLogs,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err: any) {
    console.error("[Admin Deduction Audit Logs GET Error]:", err.message);
    return NextResponse.json({ error: err.message || "Failed to fetch deduction audit logs" }, { status: 500 });
  }
}
