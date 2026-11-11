import { NextResponse } from "next/server";
import { safeParseJson } from "@/lib/utils";

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const reference = searchParams.get("reference");

    if (!reference) {
      return NextResponse.json({ error: "Bill payment reference is required." }, { status: 400 });
    }

    const isSandbox = !FLW_SECRET_KEY || FLW_SECRET_KEY.startsWith("FLWSECK_TEST-");

    if (isSandbox) {
      return NextResponse.json({
        success: true,
        data: {
          reference,
          status: "SUCCESSFUL",
          amount: 1000,
          currency: "NGN",
          fee: 0,
          customer: "MOCK-CUSTOMER",
          date: new Date().toISOString(),
        }
      });
    }

    const response = await fetch(`https://api.flutterwave.com/v3/bills/${reference}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${FLW_SECRET_KEY}`,
      },
    });

    const resData = await safeParseJson(response);

    if (!response.ok || resData.status !== "success") {
      return NextResponse.json({ error: resData.message || "Failed to retrieve bill payment status." }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: resData.data });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Bills Status Error] Exception:", error.message);
    return NextResponse.json({ error: "Unable to retrieve bill status." }, { status: 500 });
  }
}
