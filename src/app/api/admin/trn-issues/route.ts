import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "users.view");
    if (!perm.authorized) {
      return perm.response!;
    }

    const { searchParams } = new URL(req.url);
    const searchQuery = (searchParams.get("search") || searchParams.get("q") || "").trim().toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10", 10)));

    const snapshot = await adminDb.collection("transaction_issues").get();
    const reports: any[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const ref = (data.transactionReference || "").toLowerCase();
      const issueCat = (data.issueCategory || "").toLowerCase();
      const email = (data.userEmail || "").toLowerCase();
      const phone = (data.userPhone || "").toLowerCase();
      const name = (data.userName || "").toLowerCase();

      if (
        !searchQuery ||
        ref.includes(searchQuery) ||
        issueCat.includes(searchQuery) ||
        email.includes(searchQuery) ||
        phone.includes(searchQuery) ||
        name.includes(searchQuery) ||
        doc.id.toLowerCase().includes(searchQuery)
      ) {
        reports.push({
          issueId: doc.id,
          uid: data.uid || "",
          userName: data.userName || "User",
          userEmail: data.userEmail || "",
          userPhone: data.userPhone || "",
          transactionReference: data.transactionReference || "N/A",
          transactionId: data.transactionId || "",
          amount: Number(data.amount) || 0,
          currency: data.currency || "NGN",
          transactionType: data.transactionType || "PAYMENT",
          transactionDate: data.transactionDate || "",
          recipientName: data.recipientName || "N/A",
          issueCategory: data.issueCategory || "General Issue",
          customNote: data.customNote || "",
          status: data.status || "PENDING",
          createdAt: data.createdAt || new Date().toISOString(),
        });
      }
    });

    // Sort newest reports first
    reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalCount = reports.length;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedReports = reports.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      success: true,
      reports: paginatedReports,
      count: totalCount,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    });
  } catch (err: any) {
    console.error("[Admin TRN Issues GET Error]:", err.message);
    return NextResponse.json({ error: "Failed to load transaction reports", details: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "users.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const { issueId, action, adminNote } = body;

    if (!issueId) {
      return NextResponse.json({ error: "Missing required parameter: issueId" }, { status: 400 });
    }

    const issueRef = adminDb.collection("transaction_issues").doc(issueId);
    const issueSnap = await issueRef.get();

    if (!issueSnap.exists) {
      return NextResponse.json({ error: "Transaction report document not found." }, { status: 404 });
    }

    const nowIso = new Date().toISOString();

    if (action === "resolve") {
      await issueRef.set({
        status: "RESOLVED",
        resolvedAt: nowIso,
        resolvedBy: perm.auth?.uid || "admin",
        adminNote: String(adminNote || "Issue verified and resolved.").trim(),
        updatedAt: nowIso,
      }, { merge: true });

      return NextResponse.json({
        success: true,
        message: "Transaction report marked as RESOLVED.",
        issueId,
      });
    }

    if (action === "dismiss") {
      await issueRef.set({
        status: "DISMISSED",
        dismissedAt: nowIso,
        dismissedBy: perm.auth?.uid || "admin",
        adminNote: String(adminNote || "Report inspected and dismissed.").trim(),
        updatedAt: nowIso,
      }, { merge: true });

      return NextResponse.json({
        success: true,
        message: "Transaction report DISMISSED.",
        issueId,
      });
    }

    return NextResponse.json({ error: "Invalid action specified." }, { status: 400 });
  } catch (err: any) {
    console.error("[Admin TRN Issues POST Error]:", err.message);
    return NextResponse.json({ error: "Failed to update transaction report", details: err.message }, { status: 500 });
  }
}
