import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

interface GlobalTierLimitsConfig {
  tier1MaxBalance: number;
  tier1DailyDepositLimit: number;
  tier1DailyTransferLimit: number;
  tier1SingleTransferLimit: number;

  tier2MaxBalance: number;
  tier2DailyDepositLimit: number;
  tier2DailyTransferLimit: number;
  tier2SingleTransferLimit: number;

  tier3MaxBalance: number;
  tier3DailyDepositLimit: number;
  tier3DailyTransferLimit: number;
  tier3SingleTransferLimit: number;

  dailyResetWindowHours: number;
}

const DEFAULT_TIER_LIMITS: GlobalTierLimitsConfig = {
  tier1MaxBalance: 300000,
  tier1DailyDepositLimit: 500000,
  tier1DailyTransferLimit: 500000,
  tier1SingleTransferLimit: 200000,

  tier2MaxBalance: 5000000,
  tier2DailyDepositLimit: 5000000,
  tier2DailyTransferLimit: 5000000,
  tier2SingleTransferLimit: 2000000,

  tier3MaxBalance: 50000000,
  tier3DailyDepositLimit: 50000000,
  tier3DailyTransferLimit: 50000000,
  tier3SingleTransferLimit: 10000000,

  dailyResetWindowHours: 24,
};

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "limits.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const appDoc = await adminDb.collection("config").doc("app").get();
    const appData = appDoc.exists ? appDoc.data() : {};

    const limitsConfig: GlobalTierLimitsConfig = {
      tier1MaxBalance: typeof appData?.tier1MaxBalance === "number" ? appData.tier1MaxBalance : DEFAULT_TIER_LIMITS.tier1MaxBalance,
      tier1DailyDepositLimit: typeof appData?.tier1DailyDepositLimit === "number" ? appData.tier1DailyDepositLimit : DEFAULT_TIER_LIMITS.tier1DailyDepositLimit,
      tier1DailyTransferLimit: typeof appData?.tier1DailyTransferLimit === "number" ? appData.tier1DailyTransferLimit : DEFAULT_TIER_LIMITS.tier1DailyTransferLimit,
      tier1SingleTransferLimit: typeof appData?.tier1SingleTransferLimit === "number" ? appData.tier1SingleTransferLimit : DEFAULT_TIER_LIMITS.tier1SingleTransferLimit,

      tier2MaxBalance: typeof appData?.tier2MaxBalance === "number" ? appData.tier2MaxBalance : DEFAULT_TIER_LIMITS.tier2MaxBalance,
      tier2DailyDepositLimit: typeof appData?.tier2DailyDepositLimit === "number" ? appData.tier2DailyDepositLimit : (typeof appData?.tier2DailyLimit === "number" ? appData.tier2DailyLimit : DEFAULT_TIER_LIMITS.tier2DailyDepositLimit),
      tier2DailyTransferLimit: typeof appData?.tier2DailyTransferLimit === "number" ? appData.tier2DailyTransferLimit : (typeof appData?.tier2DailyLimit === "number" ? appData.tier2DailyLimit : DEFAULT_TIER_LIMITS.tier2DailyTransferLimit),
      tier2SingleTransferLimit: typeof appData?.tier2SingleTransferLimit === "number" ? appData.tier2SingleTransferLimit : DEFAULT_TIER_LIMITS.tier2SingleTransferLimit,

      tier3MaxBalance: typeof appData?.tier3MaxBalance === "number" ? appData.tier3MaxBalance : DEFAULT_TIER_LIMITS.tier3MaxBalance,
      tier3DailyDepositLimit: typeof appData?.tier3DailyDepositLimit === "number" ? appData.tier3DailyDepositLimit : (typeof appData?.tier3DailyLimit === "number" ? appData.tier3DailyLimit : DEFAULT_TIER_LIMITS.tier3DailyDepositLimit),
      tier3DailyTransferLimit: typeof appData?.tier3DailyTransferLimit === "number" ? appData.tier3DailyTransferLimit : (typeof appData?.tier3DailyLimit === "number" ? appData.tier3DailyLimit : DEFAULT_TIER_LIMITS.tier3DailyTransferLimit),
      tier3SingleTransferLimit: typeof appData?.tier3SingleTransferLimit === "number" ? appData.tier3SingleTransferLimit : DEFAULT_TIER_LIMITS.tier3SingleTransferLimit,

      dailyResetWindowHours: typeof appData?.dailyResetWindowHours === "number" && appData.dailyResetWindowHours > 0 ? appData.dailyResetWindowHours : DEFAULT_TIER_LIMITS.dailyResetWindowHours,
    };

    return NextResponse.json({
      success: true,
      limits: limitsConfig,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Set Limits GET Error]:", error.message);
    return NextResponse.json({ error: "Failed to fetch global tier limits", details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "limits.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json() || {};
    const nowIso = new Date().toISOString();

    const updatePayload: Partial<GlobalTierLimitsConfig> & { updatedAt: string } = {
      updatedAt: nowIso,
    };

    if (body.tier1MaxBalance !== undefined) updatePayload.tier1MaxBalance = Math.max(0, Number(body.tier1MaxBalance));
    if (body.tier1DailyDepositLimit !== undefined) updatePayload.tier1DailyDepositLimit = Math.max(0, Number(body.tier1DailyDepositLimit));
    if (body.tier1DailyTransferLimit !== undefined) updatePayload.tier1DailyTransferLimit = Math.max(0, Number(body.tier1DailyTransferLimit));
    if (body.tier1SingleTransferLimit !== undefined) updatePayload.tier1SingleTransferLimit = Math.max(0, Number(body.tier1SingleTransferLimit));

    if (body.tier2MaxBalance !== undefined) updatePayload.tier2MaxBalance = Math.max(0, Number(body.tier2MaxBalance));
    if (body.tier2DailyDepositLimit !== undefined) {
      updatePayload.tier2DailyDepositLimit = Math.max(0, Number(body.tier2DailyDepositLimit));
      (updatePayload as any).tier2DailyLimit = updatePayload.tier2DailyDepositLimit;
    }
    if (body.tier2DailyTransferLimit !== undefined) {
      updatePayload.tier2DailyTransferLimit = Math.max(0, Number(body.tier2DailyTransferLimit));
      (updatePayload as any).tier2DailyLimit = updatePayload.tier2DailyTransferLimit;
    }
    if (body.tier2SingleTransferLimit !== undefined) updatePayload.tier2SingleTransferLimit = Math.max(0, Number(body.tier2SingleTransferLimit));

    if (body.tier3MaxBalance !== undefined) updatePayload.tier3MaxBalance = Math.max(0, Number(body.tier3MaxBalance));
    if (body.tier3DailyDepositLimit !== undefined) {
      updatePayload.tier3DailyDepositLimit = Math.max(0, Number(body.tier3DailyDepositLimit));
      (updatePayload as any).tier3DailyLimit = updatePayload.tier3DailyDepositLimit;
    }
    if (body.tier3DailyTransferLimit !== undefined) {
      updatePayload.tier3DailyTransferLimit = Math.max(0, Number(body.tier3DailyTransferLimit));
      (updatePayload as any).tier3DailyLimit = updatePayload.tier3DailyTransferLimit;
    }
    if (body.tier3SingleTransferLimit !== undefined) updatePayload.tier3SingleTransferLimit = Math.max(0, Number(body.tier3SingleTransferLimit));

    if (body.dailyResetWindowHours !== undefined) {
      const resetHours = Number(body.dailyResetWindowHours);
      if (!isNaN(resetHours) && resetHours > 0) {
        updatePayload.dailyResetWindowHours = resetHours;
      }
    }

    const appRef = adminDb.collection("config").doc("app");
    const limitsRef = adminDb.collection("config").doc("limits");

    await appRef.set(updatePayload, { merge: true });
    await limitsRef.set(updatePayload, { merge: true });

    return NextResponse.json({
      success: true,
      message: "Global Default Tier Limits updated successfully!",
      limits: updatePayload,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Set Limits POST Error]:", error.message);
    return NextResponse.json({ error: "Failed to update global tier limits", details: error.message }, { status: 500 });
  }
}
