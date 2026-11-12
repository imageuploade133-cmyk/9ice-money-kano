import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { InvestmentService } from "@/services/investment-service";

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "investments.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const { userId, blocked } = body;

    if (!userId) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    const adminId = perm.auth?.uid || "admin";
    const isBlocked = Boolean(blocked);

    await InvestmentService.setUserInvestmentBlock(adminId, userId, isBlocked);

    return NextResponse.json({
      success: true,
      message: `User investment access has been successfully ${isBlocked ? "BLOCKED" : "UNBLOCKED"}.`,
      blocked: isBlocked,
    });
  } catch (err: unknown) {
    console.error("[Admin Block User Investment API Error]:", (err as Error).message);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to update user investment block status." },
      { status: 400 }
    );
  }
}
