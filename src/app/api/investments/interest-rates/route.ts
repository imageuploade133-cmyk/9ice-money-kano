import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { InvestmentService } from "@/services/investment-service";

export async function GET(req: Request) {
  try {
    const authResult = await authenticateUserRequest(req);
    if (!authResult.uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rates = await InvestmentService.getInterestRates();
    return NextResponse.json({ success: true, rates });
  } catch (err: unknown) {
    console.error("[Interest Rates API Error]", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message || "Failed to load interest rates." }, { status: 500 });
  }
}
