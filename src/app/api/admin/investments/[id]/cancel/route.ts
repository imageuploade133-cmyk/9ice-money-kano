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

    const { record, refundAmount, penaltyDeducted } = await InvestmentService.adminCancelInvestment(adminId, id);

    return NextResponse.json({
      success: true,
      message: `Investment cancelled successfully! Refunded ₦${refundAmount.toLocaleString()} to user wallet (Penalty: ₦${penaltyDeducted.toLocaleString()}).`,
      investment: record,
      refundAmount,
      penaltyDeducted,
    });
  } catch (err: unknown) {
    console.error("[Admin Cancel Investment API Error]:", (err as Error).message);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to cancel investment." },
      { status: 400 }
    );
  }
}
