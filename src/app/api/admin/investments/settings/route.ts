import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { InvestmentService } from "@/services/investment-service";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "investments.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const settings = await InvestmentService.getSettings();
    return NextResponse.json({ success: true, settings });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Investment Settings GET Error]:", error.message);
    return NextResponse.json({ error: "Failed to load investment settings", details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "investments.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const { penaltyRate, penaltyPolicyText, minInvestment, maxInvestment, allowBonusInvestment } = body;

    const updated = await InvestmentService.updateSettings({
      penaltyRate: penaltyRate !== undefined ? Number(penaltyRate) : undefined,
      penaltyPolicyText: penaltyPolicyText !== undefined ? String(penaltyPolicyText).trim() : undefined,
      minInvestment: minInvestment !== undefined ? Number(minInvestment) : undefined,
      maxInvestment: maxInvestment !== undefined ? Number(maxInvestment) : undefined,
      allowBonusInvestment: allowBonusInvestment !== undefined ? Boolean(allowBonusInvestment) : undefined,
    });

    return NextResponse.json({
      success: true,
      message: "Investment settings and policy updated successfully!",
      settings: updated,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Investment Settings POST Error]:", error.message);
    return NextResponse.json({ error: "Failed to update investment settings", details: error.message }, { status: 500 });
  }
}
