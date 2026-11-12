import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { safeParseJson } from "@/lib/utils";
import { getGatewayUrl } from "@/lib/gateway-util";

const FALLBACK_CABLE_PACKAGES: Record<string, any[]> = {
  "dstv": [
    { item_code: "dstv_padi", name: "DStv Padi (₦2,950) - 30 Days", amount: 2950, package_code: "dstv-padi" },
    { item_code: "dstv_yanga", name: "DStv Yanga (₦4,200) - 30 Days", amount: 4200, package_code: "dstv-yanga" },
    { item_code: "dstv_confam", name: "DStv Confam (₦7,400) - 30 Days", amount: 7400, package_code: "dstv-confam" },
    { item_code: "dstv_compact", name: "DStv Compact (₦12,500) - 30 Days", amount: 12500, package_code: "dstv-compact" },
    { item_code: "dstv_compact_plus", name: "DStv Compact Plus (₦19,800) - 30 Days", amount: 19800, package_code: "dstv-compact-plus" },
    { item_code: "dstv_premium", name: "DStv Premium (₦29,500) - 30 Days", amount: 29500, package_code: "dstv-premium" }
  ],
  "gotv": [
    { item_code: "gotv_smallie", name: "GOtv Smallie (₦1,300) - 30 Days", amount: 1300, package_code: "gotv-smallie" },
    { item_code: "gotv_jinja", name: "GOtv Jinja (₦2,700) - 30 Days", amount: 2700, package_code: "gotv-jinja" },
    { item_code: "gotv_jolli", name: "GOtv Jolli (₦3,950) - 30 Days", amount: 3950, package_code: "gotv-jolli" },
    { item_code: "gotv_max", name: "GOtv Max (₦5,700) - 30 Days", amount: 5700, package_code: "gotv-max" },
    { item_code: "gotv_supa", name: "GOtv Supa (₦7,600) - 30 Days", amount: 7600, package_code: "gotv-supa" }
  ],
  "startimes": [
    { item_code: "nova", name: "StarTimes Nova (₦1,500) - 30 Days", amount: 1500, package_code: "nova" },
    { item_code: "basic", name: "StarTimes Basic (₦3,300) - 30 Days", amount: 3300, package_code: "basic" },
    { item_code: "smart", name: "StarTimes Smart (₦4,700) - 30 Days", amount: 4700, package_code: "smart" },
    { item_code: "super", name: "StarTimes Super (₦8,200) - 30 Days", amount: 8200, package_code: "super" }
  ]
};

export async function GET(req: Request) {
  let provider = "";
  try {
    await authenticateUserRequest(req);
    const { searchParams } = new URL(req.url);
    provider = (searchParams.get("provider") || "").toLowerCase().trim();

    const idToken = req.headers.get("Authorization")?.split("Bearer ")[1] || "mock-token";

    const gatewayUrl = getGatewayUrl();
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${idToken}`,
    };
    if (apiKey) headers["x-api-key"] = apiKey;

    const gatewayRes = await fetch(`${gatewayUrl}/api/vtu/cable/packages?provider=${provider}`, {
      method: "GET",
      headers,
    });

    if (!gatewayRes.ok) {
      const errText = await gatewayRes.text();
      console.warn(`[Cable Packages Gateway Fallback Activated]: ${gatewayRes.status} - ${errText}`);

      const packages = FALLBACK_CABLE_PACKAGES[provider] || Object.values(FALLBACK_CABLE_PACKAGES).flat();
      return NextResponse.json({
        success: true,
        data: packages
      });
    }

    const data = await safeParseJson(gatewayRes);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as Error;
    console.warn("[Cable Packages Route Exception Fallback Activated]:", error.message);

    const packages = FALLBACK_CABLE_PACKAGES[provider] || Object.values(FALLBACK_CABLE_PACKAGES).flat();
    return NextResponse.json({
      success: true,
      data: packages
    });
  }
}
