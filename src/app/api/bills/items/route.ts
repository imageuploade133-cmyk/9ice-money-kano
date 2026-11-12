import { NextResponse } from "next/server";
import { MOCK_ITEMS } from "./config";
import { safeParseJson } from "@/lib/utils";
import { getGatewayUrl } from "@/lib/gateway-util";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const biller_code = url.searchParams.get("biller_code") || "";
    const authHeader = req.headers.get("Authorization") || "";

    const fallback = MOCK_ITEMS[biller_code] || [{ name: "Custom Package", item_code: "ITEM_CUSTOM", amount: 0 }];

    // Call the payment gateway cached biller items endpoint
    const response = await fetch(`${getGatewayUrl()}/api/flutterwave/billers/${biller_code}/items`, {
      method: "GET",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ success: true, data: fallback });
    }

    const resData = await safeParseJson(response);
    return NextResponse.json({ success: true, data: resData.data || fallback });
  } catch {
    const url = new URL(req.url);
    const biller_code = url.searchParams.get("biller_code") || "";
    return NextResponse.json({ success: true, data: MOCK_ITEMS[biller_code] || [{ name: "Custom Package", item_code: "ITEM_CUSTOM", amount: 0 }] });
  }
}
