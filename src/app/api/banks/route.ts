import { NextResponse } from "next/server";
import { BankService } from "@/services/bank-service";

import { PaymentGatewayManager } from "@/lib/payment/PaymentGatewayManager";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get("search") || undefined;

    // Trigger self-healing seeding checks on startup/fetch
    await PaymentGatewayManager.getGatewayConfigs();

    const banks = await BankService.getBanks(search);

    return NextResponse.json(banks);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[GET /api/banks Error] Failed to retrieve banks list:", error.message);
    return NextResponse.json(
      { error: "Failed to retrieve bank list. Please try again later." },
      { status: 500 }
    );
  }
}
