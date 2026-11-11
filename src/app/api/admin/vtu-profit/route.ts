import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "vtu.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    // Default system fallback profit margins
    let dataProfitMargin = 0;
    let airtimeProfitMargin = 0;
    let cableProfitMargin = 0;
    let waecProfitMargin = 0;
    let electricityProfitMargin = 0;
    let transferProfitMargin = 0;
    let bulkTransferProfitMargin = 0;
    let transferTieredMargins: any[] = [];
    let bulkTransferTieredMargins: any[] = [];

    // Load from Firestore global admin configuration document or use default margins
    try {
      const docRef = adminDb.collection("config").doc("vtu_profit_margins");
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const data = docSnap.data();
        dataProfitMargin = Number(data?.dataProfitMargin) || 0;
        airtimeProfitMargin = Number(data?.airtimeProfitMargin) || 0;
        cableProfitMargin = Number(data?.cableProfitMargin) || 0;
        waecProfitMargin = Number(data?.waecProfitMargin) || 0;
        electricityProfitMargin = Number(data?.electricityProfitMargin) || 0;
        transferProfitMargin = Number(data?.transferProfitMargin) || 0;
        bulkTransferProfitMargin = Number(data?.bulkTransferProfitMargin) || 0;
        if (Array.isArray(data?.transferTieredMargins)) {
          transferTieredMargins = data.transferTieredMargins;
        }
        if (Array.isArray(data?.bulkTransferTieredMargins)) {
          bulkTransferTieredMargins = data.bulkTransferTieredMargins;
        }
      }
    } catch (dbErr: any) {
      console.warn("[Admin VTU Profit GET] Failed to fetch margin settings, returning defaults:", dbErr.message);
    }

    return NextResponse.json({
      success: true,
      dataProfitMargin,
      airtimeProfitMargin,
      cableProfitMargin,
      waecProfitMargin,
      electricityProfitMargin,
      transferProfitMargin,
      bulkTransferProfitMargin,
      transferTieredMargins,
      bulkTransferTieredMargins,
    });
  } catch (err: any) {
    console.error("[Admin VTU Profit GET Exception]:", err.message);
    return NextResponse.json({ error: "Unauthorized or backend error", details: err.message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "vtu.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const {
      dataProfitMargin,
      airtimeProfitMargin,
      cableProfitMargin,
      waecProfitMargin,
      electricityProfitMargin,
      transferProfitMargin,
      bulkTransferProfitMargin,
      transferTieredMargins,
      bulkTransferTieredMargins,
    } = body;

    const updates: Record<string, any> = {};

    if (dataProfitMargin !== undefined) updates.dataProfitMargin = Math.max(0, Number(dataProfitMargin) || 0);
    if (airtimeProfitMargin !== undefined) updates.airtimeProfitMargin = Math.max(0, Number(airtimeProfitMargin) || 0);
    if (cableProfitMargin !== undefined) updates.cableProfitMargin = Math.max(0, Number(cableProfitMargin) || 0);
    if (waecProfitMargin !== undefined) updates.waecProfitMargin = Math.max(0, Number(waecProfitMargin) || 0);
    if (electricityProfitMargin !== undefined) updates.electricityProfitMargin = Math.max(0, Number(electricityProfitMargin) || 0);
    if (transferProfitMargin !== undefined) updates.transferProfitMargin = Math.max(0, Number(transferProfitMargin) || 0);
    if (bulkTransferProfitMargin !== undefined) updates.bulkTransferProfitMargin = Math.max(0, Number(bulkTransferProfitMargin) || 0);

    if (Array.isArray(transferTieredMargins)) {
      const sanitizedSingle = transferTieredMargins.map((t: any) => ({
        id: String(t.id || `tier_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
        minAmount: Math.max(0, Number(t.minAmount) || 0),
        maxAmount: Math.max(0, Number(t.maxAmount) || 0),
        fee: Math.max(0, Number(t.fee) || 0),
      }));

      for (const [idx, t] of sanitizedSingle.entries()) {
        if (t.maxAmount <= t.minAmount) {
          return NextResponse.json({
            error: `Invalid Single Transfer Tier #${idx + 1}: Max Amount (₦${t.maxAmount}) must be strictly greater than Min Amount (₦${t.minAmount}).`
          }, { status: 400 });
        }
      }

      updates.transferTieredMargins = sanitizedSingle;
    }

    if (Array.isArray(bulkTransferTieredMargins)) {
      const sanitizedBulk = bulkTransferTieredMargins.map((t: any) => ({
        id: String(t.id || `tier_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
        minAmount: Math.max(0, Number(t.minAmount) || 0),
        maxAmount: Math.max(0, Number(t.maxAmount) || 0),
        fee: Math.max(0, Number(t.fee) || 0),
      }));

      for (const [idx, t] of sanitizedBulk.entries()) {
        if (t.maxAmount <= t.minAmount) {
          return NextResponse.json({
            error: `Invalid Bulk Transfer Tier #${idx + 1}: Max Amount (₦${t.maxAmount}) must be strictly greater than Min Amount (₦${t.minAmount}).`
          }, { status: 400 });
        }
      }

      updates.bulkTransferTieredMargins = sanitizedBulk;
    }

    updates.updatedAt = new Date().toISOString();

    try {
      await adminDb.collection("config").doc("vtu_profit_margins").set(updates, { merge: true });
    } catch (dbErr: any) {
      console.error("[Admin VTU Profit POST] DB write failed:", dbErr.message);
      return NextResponse.json({ error: "Failed to write margins to Firestore." }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Global admin markup margins successfully saved and applied!",
      updated: updates
    });
  } catch (err: any) {
    console.error("[Admin VTU Profit POST Exception]:", err.message);
    return NextResponse.json({ error: "Operation failed", details: err.message }, { status: 500 });
  }
}
