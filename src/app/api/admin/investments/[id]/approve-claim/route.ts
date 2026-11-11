import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { InvestmentService } from "@/services/investment-service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const perm = await requireAdminPermission(req, "investments.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const { id } = await params;
    const adminId = perm.auth?.uid || "admin";

    const { record, creditedAmount } = await InvestmentService.approveInvestmentClaim(adminId, id);

    return NextResponse.json({
      success: true,
      message: `Investment payout approved! ₦${creditedAmount.toLocaleString()} credited to user wallet.`,
      investment: record,
      creditedAmount,
    });
  } catch (err: unknown) {
    console.error("[Approve Claim API Error]", (err as Error).message);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to approve investment payout." },
      { status: 400 }
    );
  }
}
