import { NextResponse } from "next/server";
import { authenticateUserRequest, verifyUserKycApproved } from "@/lib/auth-util";
import { safeParseJson } from "@/lib/utils";
import { getGatewayUrl } from "@/lib/gateway-util";

function sanitizeBillErrorMessage(rawMessage: string, defaultType: string = "cable TV"): string {
  const msg = String(rawMessage || "").toLowerCase();

  if (
    msg.includes("insufficient_balance") ||
    msg.includes("insufficient balance") ||
    msg.includes("clubkonnect") ||
    msg.includes("flutterwave") ||
    msg.includes("rejected request") ||
    msg.includes("provider") ||
    msg.includes("gateway")
  ) {
    return `${defaultType.charAt(0).toUpperCase() + defaultType.slice(1)} subscription network issue. Please try again later.`;
  }

  return rawMessage || `${defaultType.charAt(0).toUpperCase() + defaultType.slice(1)} subscription network issue. Please try again later.`;
}

export async function POST(req: Request) {
  try {
    const authResult = await authenticateUserRequest(req);
    const uid = authResult.uid;

    const isApproved = await verifyUserKycApproved(uid);
    if (!isApproved) {
      return NextResponse.json({ error: "Forbidden: Account verification is required to perform financial transactions." }, { status: 403 });
    }

    const idToken = req.headers.get("Authorization")?.split("Bearer ")[1] || "";
    const sessionId = req.headers.get("X-Session-ID") || req.headers.get("x-session-id") || "";

    const body = await req.json();

    const gatewayUrl = getGatewayUrl();
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`,
    };
    if (apiKey) headers["x-api-key"] = apiKey;
    if (sessionId) headers["X-Session-ID"] = sessionId;

    const gatewayRes = await fetch(`${gatewayUrl}/api/vtu/cable`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!gatewayRes.ok) {
      const errText = await gatewayRes.text();
      try {
        const errJson = JSON.parse(errText);
        const rawErr = errJson.message || errJson.error || errJson.details || "Cable TV payment failed";
        return NextResponse.json({ ...errJson, message: sanitizeBillErrorMessage(rawErr, "cable TV"), error: sanitizeBillErrorMessage(rawErr, "cable TV") }, { status: gatewayRes.status });
      } catch {
        return NextResponse.json({ error: sanitizeBillErrorMessage(errText, "cable TV") }, { status: gatewayRes.status });
      }
    }

    const data = await safeParseJson(gatewayRes);
    if (data && data.success === false) {
      const rawMsg = data.message || data.error || "Cable TV payment failed";
      data.message = sanitizeBillErrorMessage(rawMsg, "cable TV");
      data.error = sanitizeBillErrorMessage(rawMsg, "cable TV");
    }
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Cable Purchase Route Error]:", error.message);
    return NextResponse.json({ error: sanitizeBillErrorMessage(error.message, "cable TV") }, { status: 500 });
  }
}
