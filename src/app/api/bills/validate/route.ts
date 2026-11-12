import { NextResponse } from "next/server";
import { safeParseJson } from "@/lib/utils";

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { item_code, customer_id, biller_code } = body;

    if (!item_code || !customer_id || !biller_code) {
      return NextResponse.json({ error: "Item code, biller code and customer identifier are required." }, { status: 400 });
    }

    const isSandbox = !FLW_SECRET_KEY || FLW_SECRET_KEY.startsWith("FLWSECK_TEST-");

    if (isSandbox) {
      // Simulate standard 500ms delay and return high fidelity mock name
      await new Promise((res) => setTimeout(res, 500));
      return NextResponse.json({
        success: true,
        data: {
          name: "CAPTAIN MOCK CUSTOMER",
          email: "captain@example.com",
          customer: customer_id,
        },
      });
    }

    const response = await fetch("https://api.flutterwave.com/v3/bills/validate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FLW_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        item_code,
        customer_id,
        biller_code,
      }),
    });

    const resData = await safeParseJson(response);

    if (!response.ok || resData.status !== "success") {
      return NextResponse.json({ error: resData.message || "Customer validation failed. Please check details and try again." }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: resData.data });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Bills Validate Error] Exception caught:", error.message);
    return NextResponse.json({ error: "Unable to validate customer info at this time." }, { status: 500 });
  }
}
