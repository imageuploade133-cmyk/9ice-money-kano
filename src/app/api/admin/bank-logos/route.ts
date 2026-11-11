import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { BankService } from "@/services/bank-service";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get("search") || searchParams.get("q") || "";

    const banks = await BankService.getBanks(searchQuery);

    return NextResponse.json({
      success: true,
      banks,
      count: banks.length
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Bank Logos GET Error]:", error.message);
    return NextResponse.json({ success: true, banks: [], count: 0 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "bank_logos.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const { bankId, logoUrl, isTop } = body;

    if (!bankId) {
      return NextResponse.json({ error: "Missing required parameter: bankId" }, { status: 400 });
    }

    const updatePayload: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (typeof logoUrl === "string") {
      updatePayload.logoUrl = logoUrl.trim() || null;
    }

    if (typeof isTop === "boolean") {
      updatePayload.isTop = isTop;
    }

    // Update in Firestore
    const bankRef = adminDb.collection("banks").doc(bankId);
    await bankRef.set(updatePayload, { merge: true });

    // Clear memory cache so all clients immediately receive updated bank details
    BankService.clearCache();

    return NextResponse.json({
      success: true,
      message: "Bank settings updated successfully!",
      bankId,
      ...updatePayload
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Bank Logos POST Error]:", error.message);
    return NextResponse.json({ error: "Failed to update bank logo", details: error.message }, { status: 500 });
  }
}
