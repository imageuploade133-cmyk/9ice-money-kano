import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

export const DEFAULT_TRN_FEE_CONFIG = {
  enableTransferFee: true, // ON/OFF toggle for transfer fees globally
  freeTransfersQuota: 0, // Number of free transfers allowed per user before charging
  freeTransferResetPeriod: "NEVER", // "DAILY" | "WEEKLY" | "MONTHLY" | "NEVER"
  showFreeTransfersIndicator: true, // ON/OFF toggle to indicate remaining free transfers to user in UI
  flatFee: 10.00, // Default base fee when transfer fee is enabled
  waiveMarkupOnFree: true, // Waive admin commission markup on free transfers
};

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "wallets.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const docSnap = await adminDb.collection("config").doc("trn_fee_config").get();
    const data = docSnap.exists ? docSnap.data() || {} : {};

    const config = {
      ...DEFAULT_TRN_FEE_CONFIG,
      ...data,
    };

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (err: any) {
    console.error("[Admin TRN Fee GET Error]:", err.message);
    return NextResponse.json({ error: "Failed to fetch TRN fee configuration." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "wallets.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json().catch(() => ({}));
    const {
      enableTransferFee,
      freeTransfersQuota,
      freeTransferResetPeriod,
      showFreeTransfersIndicator,
      flatFee,
      waiveMarkupOnFree,
    } = body;

    const newConfig = {
      enableTransferFee: Boolean(enableTransferFee),
      freeTransfersQuota: Math.max(0, parseInt(String(freeTransfersQuota), 10) || 0),
      freeTransferResetPeriod: ["DAILY", "WEEKLY", "MONTHLY", "NEVER"].includes(freeTransferResetPeriod)
        ? freeTransferResetPeriod
        : "NEVER",
      showFreeTransfersIndicator: Boolean(showFreeTransfersIndicator),
      flatFee: Math.max(0, parseFloat(String(flatFee)) || 0),
      waiveMarkupOnFree: waiveMarkupOnFree !== false,
      updatedAt: new Date().toISOString(),
      updatedBy: perm.user?.email || "Admin",
    };

    await adminDb.collection("config").doc("trn_fee_config").set(newConfig, { merge: true });

    return NextResponse.json({
      success: true,
      message: "Transfer Fee configuration updated successfully!",
      config: newConfig,
    });
  } catch (err: any) {
    console.error("[Admin TRN Fee POST Error]:", err.message);
    return NextResponse.json({ error: "Failed to update TRN fee configuration." }, { status: 500 });
  }
}
