import { NextResponse } from "next/server";
import { InvestmentService } from "@/services/investment-service";

export async function GET() {
  try {
    const settings = await InvestmentService.getSettings();
    return NextResponse.json({ success: true, settings });
  } catch (err: unknown) {
    console.warn("[Settings API Warning] Falling back to default settings:", (err as Error).message);
    return NextResponse.json({
      success: true,
      settings: {
        minInvestment: 1000,
        maxInvestment: 10000000,
        penaltyRate: 0.10,
        penaltyPolicyText: "Early liquidation of locked savings before the target unlock date incurs a 10% penalty on principal. The remaining 90% balance will be instantly refunded to your wallet.",
        savingsRate: 0.08,
        updatedAt: new Date().toISOString(),
      },
    });
  }
}
