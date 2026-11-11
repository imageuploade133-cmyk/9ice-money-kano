import { NextResponse } from "next/server";
import { safeParseJson } from "@/lib/utils";
import { getGatewayUrl } from "@/lib/gateway-util";

const MOCK_BILLERS: Record<string, Array<{ name: string; biller_code: string; label_name: string }>> = {
  AIRTIME: [
    { name: "MTN Airtime", biller_code: "BIL099", label_name: "Mobile Phone Number" },
    { name: "GLO Airtime", biller_code: "BIL102", label_name: "Mobile Phone Number" },
    { name: "Airtel Airtime", biller_code: "BIL100", label_name: "Mobile Phone Number" },
    { name: "9mobile Airtime", biller_code: "BIL101", label_name: "Mobile Phone Number" },
  ],
  MOBILEDATA: [
    { name: "MTN Mobile Data", biller_code: "BIL104", label_name: "Mobile Phone Number" },
    { name: "GLO Mobile Data", biller_code: "BIL105", label_name: "Mobile Phone Number" },
    { name: "Airtel Mobile Data", biller_code: "BIL106", label_name: "Mobile Phone Number" },
    { name: "9mobile Mobile Data", biller_code: "BIL107", label_name: "Mobile Phone Number" },
  ],
  CABLE: [
    { name: "DSTV Subscription", biller_code: "BIL108", label_name: "Smartcard Number" },
    { name: "GOTV Subscription", biller_code: "BIL109", label_name: "Smartcard/IUC Number" },
    { name: "StarTimes Subscription", biller_code: "BIL110", label_name: "Smartcard Number" },
  ],
  UTILITY: [
    { name: "Ikeja Electric Prepaid", biller_code: "BIL111", label_name: "Meter Number" },
    { name: "Eko Electric Prepaid", biller_code: "BIL112", label_name: "Meter Number" },
    { name: "Abuja Electric Prepaid", biller_code: "BIL113", label_name: "Meter Number" },
    { name: "Kano Electric Prepaid", biller_code: "BIL114", label_name: "Meter Number" },
  ],
  INTERNET: [
    { name: "Smile Internet", biller_code: "BIL115", label_name: "Smile Account Number" },
    { name: "Spectranet Internet", biller_code: "BIL116", label_name: "Spectranet Account ID" },
  ],
  BETTING: [
    { name: "Bet9ja", biller_code: "BIL117", label_name: "Bet9ja User ID" },
    { name: "SportyBet", biller_code: "BIL118", label_name: "SportyBet Phone/User ID" },
    { name: "Nairabet", biller_code: "BIL119", label_name: "Nairabet Customer ID" },
  ],
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const category = (url.searchParams.get("category") || "AIRTIME").toUpperCase();
    const authHeader = req.headers.get("Authorization") || "";

    const fallback = MOCK_BILLERS[category] || MOCK_BILLERS.AIRTIME;

    // Call the payment gateway cached billers endpoint
    const response = await fetch(`${getGatewayUrl()}/api/flutterwave/bills/${category}/billers`, {
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
    const category = (url.searchParams.get("category") || "AIRTIME").toUpperCase();
    return NextResponse.json({ success: true, data: MOCK_BILLERS[category] || MOCK_BILLERS.AIRTIME });
  }
}
