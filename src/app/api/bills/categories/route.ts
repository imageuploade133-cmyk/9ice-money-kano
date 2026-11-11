import { NextResponse } from "next/server";
import { safeParseJson } from "@/lib/utils";

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";

const MOCK_CATEGORIES = [
  { id: 1, name: "Airtime", code: "AIRTIME" },
  { id: 2, name: "Mobile Data", code: "MOBILEDATA" },
  { id: 3, name: "Cable TV", code: "CABLE" },
  { id: 4, name: "Electricity / Utility", code: "UTILITY" },
  { id: 5, name: "Internet Subscriptions", code: "INTERNET" },
];

export async function GET() {
  try {
    const isSandbox = !FLW_SECRET_KEY || FLW_SECRET_KEY.startsWith("FLWSECK_TEST-");

    if (isSandbox) {
      return NextResponse.json({ success: true, data: MOCK_CATEGORIES });
    }

    const response = await fetch("https://api.flutterwave.com/v3/bill-categories", {
      headers: {
        "Authorization": `Bearer ${FLW_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ success: true, data: MOCK_CATEGORIES });
    }

    const resData = await safeParseJson(response);
    return NextResponse.json({ success: true, data: resData.data || MOCK_CATEGORIES });
  } catch {
    return NextResponse.json({ success: true, data: MOCK_CATEGORIES });
  }
}
