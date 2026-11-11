import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { safeParseJson } from "@/lib/utils";
import { getGatewayUrl } from "@/lib/gateway-util";

export async function GET(req: Request) {
  try {
    await authenticateUserRequest(req);
    const idToken = req.headers.get("Authorization")?.split("Bearer ")[1] || "mock-token";

    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider") || "";
    const meterNo = searchParams.get("meterNo") || "";
    const meterType = searchParams.get("meterType") || "";

    const gatewayUrl = getGatewayUrl();
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${idToken}`,
    };
    if (apiKey) headers["x-api-key"] = apiKey;

    const gatewayRes = await fetch(`${gatewayUrl}/api/vtu/electricity/validate?provider=${provider}&meterNo=${meterNo}&meterType=${meterType}`, {
      method: "GET",
      headers,
    });

    if (!gatewayRes.ok) {
      const errText = await gatewayRes.text();
      return NextResponse.json({ error: "Failed to validate meter", details: errText }, { status: gatewayRes.status });
    }

    const data = await safeParseJson(gatewayRes);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Electricity Validate Route Error]:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
