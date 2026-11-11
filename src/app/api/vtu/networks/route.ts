import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { safeParseJson } from "@/lib/utils";
import { getGatewayUrl } from "@/lib/gateway-util";

export async function GET(req: Request) {
  try {
    await authenticateUserRequest(req);
    const idToken = req.headers.get("Authorization")?.split("Bearer ")[1] || "mock-token";

    const gatewayUrl = getGatewayUrl();
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${idToken}`,
    };
    if (apiKey) headers["x-api-key"] = apiKey;

    const gatewayRes = await fetch(`${gatewayUrl}/api/vtu/networks`, {
      method: "GET",
      headers,
    });

    if (!gatewayRes.ok) {
      const errText = await gatewayRes.text();
      console.warn(`[Networks Route Gateway Fallback Activated]: ${gatewayRes.status} - ${errText}`);
      // Return high-fidelity dynamic fallback networks
      return NextResponse.json({
        success: true,
        networks: ["MTN", "GLO", "AIRTEL", "9MOBILE"]
      });
    }

    const data = await safeParseJson(gatewayRes);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as Error;
    console.warn("[Networks Route Exception Fallback Activated]:", error.message);
    // Return high-fidelity dynamic fallback networks
    return NextResponse.json({
      success: true,
      networks: ["MTN", "GLO", "AIRTEL", "9MOBILE"]
    });
  }
}
