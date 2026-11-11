import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { verifyUserPasswordWithREST } from "@/lib/firebase-auth-rest";

export async function DELETE(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "wallet.deductions.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }

    const adminEmail = perm.auth.email || "";
    const adminUid = perm.auth.uid;

    const body = await req.json();
    const { deductionId, adminPassword } = body;

    if (!deductionId) {
      return NextResponse.json({ error: "deductionId parameter is required." }, { status: 400 });
    }

    if (!adminPassword || typeof adminPassword !== "string" || adminPassword.trim() === "") {
      return NextResponse.json({ error: "Admin password authorization is required to delete deduction master history." }, { status: 400 });
    }

    if (!adminEmail) {
      return NextResponse.json({ error: "Admin account email required for password verification." }, { status: 400 });
    }

    // Authenticate administrator password via Firebase REST API
    let isValidPassword = false;
    try {
      isValidPassword = await verifyUserPasswordWithREST(adminEmail, adminPassword);
    } catch (authErr: any) {
      console.warn("[Deduction Delete Auth Error]:", authErr.message);
    }

    if (!isValidPassword) {
      return NextResponse.json({ error: "Invalid administrator password. Deletion authorization failed." }, { status: 401 });
    }

    // Verify master record exists
    const deductionRef = adminDb.collection("global_deductions").doc(deductionId);
    const deductionSnap = await deductionRef.get();

    if (!deductionSnap.exists) {
      return NextResponse.json({ error: "Deduction record not found." }, { status: 404 });
    }

    const deductionData = deductionSnap.data() || {};

    // Delete associated user_deductions records in batch
    const userDeductionsSnap = await adminDb
      .collection("user_deductions")
      .where("deductionId", "==", deductionId)
      .get();

    const batch = adminDb.batch();
    userDeductionsSnap.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete master record
    batch.delete(deductionRef);
    await batch.commit();

    // Log immutable deletion audit record
    try {
      await adminDb.collection("admin_audit_logs").add({
        action: "global_wallet_deduction_deleted",
        adminEmail,
        adminUid,
        deductionId,
        details: {
          name: deductionData.name || "",
          amount: deductionData.amount || 0,
          status: deductionData.status || "",
          deletedAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (auditErr: any) {
      console.error("[Audit Logging Error] Failed to write deduction deletion log:", auditErr.message);
    }

    return NextResponse.json({
      success: true,
      message: `Global deduction master record "${deductionData.name || deductionId}" deleted successfully.`,
    });
  } catch (err: any) {
    console.error("[Admin Deductions DELETE Error]:", err.message);
    return NextResponse.json({ error: err.message || "Failed to delete global deduction" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "wallet.deductions.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const { searchParams } = new URL(req.url);
    const deductionId = searchParams.get("deductionId");

    // If specific deduction ID requested, return paginated per-user audit records with cursor indexing
    if (deductionId) {
      const userPage = Math.max(1, parseInt(searchParams.get("page") || "1"));
      const userLimit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));

      // Fetch user records using indexed queries
      const countSnap = await adminDb
        .collection("user_deductions")
        .where("deductionId", "==", deductionId)
        .get();

      const totalUserRecords = countSnap.size;
      const totalUserPages = Math.ceil(totalUserRecords / userLimit) || 1;

      let query = adminDb
        .collection("user_deductions")
        .where("deductionId", "==", deductionId)
        .orderBy("createdAt", "desc")
        .limit(userLimit);

      // Support index pagination with offset/limit
      if (userPage > 1) {
        query = query.offset((userPage - 1) * userLimit);
      }

      const userDeductionsSnap = await query.get();

      const userRecords: any[] = [];
      userDeductionsSnap.forEach((doc) => {
        userRecords.push({ id: doc.id, ...doc.data() });
      });

      return NextResponse.json({
        success: true,
        userRecords,
        pagination: {
          page: userPage,
          limit: userLimit,
          totalRecords: totalUserRecords,
          totalPages: totalUserPages,
          hasNextPage: userPage < totalUserPages,
          hasPrevPage: userPage > 1,
        }
      });
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const searchQuery = (searchParams.get("search") || "").trim().toLowerCase();

    // Fetch all global deduction records for server-side search/filtering
    const deductionsSnap = await adminDb
      .collection("global_deductions")
      .orderBy("createdAt", "desc")
      .get();

    let deductions: any[] = [];
    deductionsSnap.forEach((doc) => {
      deductions.push({ id: doc.id, ...doc.data() });
    });

    // Calculate overall master metrics across all records
    const totalDeductionsExecuted = deductions.length;
    const totalAssessedAmount = deductions.reduce((sum, d) => sum + (Number(d.totalAssessedAmount) || 0), 0);
    const totalRecoveredAmount = deductions.reduce((sum, d) => sum + (Number(d.totalRecoveredAmount) || 0), 0);
    const totalOutstandingAmount = deductions.reduce((sum, d) => sum + (Number(d.totalOutstandingAmount) || 0), 0);

    // Apply client/server search filter
    if (searchQuery) {
      deductions = deductions.filter(
        (d) =>
          (d.name && d.name.toLowerCase().includes(searchQuery)) ||
          (d.description && d.description.toLowerCase().includes(searchQuery)) ||
          (d.deductionId && d.deductionId.toLowerCase().includes(searchQuery)) ||
          (d.createdBy && d.createdBy.toLowerCase().includes(searchQuery)) ||
          (d.status && d.status.toLowerCase().includes(searchQuery))
      );
    }

    const totalRecords = deductions.length;
    const totalPages = Math.ceil(totalRecords / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedDeductions = deductions.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      success: true,
      deductions: paginatedDeductions,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      summary: {
        totalDeductionsExecuted,
        totalAssessedAmount,
        totalRecoveredAmount,
        totalOutstandingAmount,
      },
    });
  } catch (err: any) {
    console.error("[Admin Deductions GET Error]:", err.message);
    return NextResponse.json({ error: err.message || "Failed to fetch deductions history" }, { status: 500 });
  }
}
