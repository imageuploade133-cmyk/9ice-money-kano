import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";

export async function GET(req: Request) {
  try {
    const authResult = await authenticateUserRequest(req);
    if (!authResult.uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Return the high-fidelity standard WAEC products directly
    // This provides a low-latency, robust local list of WAEC result checker and registration PINs
    return NextResponse.json({
      success: true,
      data: [
        { item_code: "waec_result_checker", name: "WAEC Result Checker PIN", amount: 3800, product_code: "waec_checker" },
        { item_code: "waec_registration", name: "WAEC Registration PIN", amount: 18500, product_code: "waec_reg" }
      ]
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[WAEC Products Route Error]:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
