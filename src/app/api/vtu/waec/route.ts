import { NextResponse } from "next/server";
import { authenticateUserRequest, verifyUserKycApproved } from "@/lib/auth-util";
import { getGatewayUrl } from "@/lib/gateway-util";

function sanitizeBillErrorMessage(rawMessage: string, defaultType: string = "WAEC PIN"): string {
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
    return `${defaultType} purchase network issue. Please try again later.`;
  }

  return rawMessage || `${defaultType} purchase network issue. Please try again later.`;
}

export async function POST(req: Request) {
  try {
    const authResult = await authenticateUserRequest(req);
    const uid = authResult.uid;

    const isApproved = await verifyUserKycApproved(uid);
    if (!isApproved) {
      return NextResponse.json({ error: "Forbidden: Account verification is required to perform financial transactions." }, { status: 403 });
    }

    // Mock-playtesting offline bypass
    if (uid === "mock-uid" || uid === "mock-admin-uid") {
      return NextResponse.json({
        success: true,
        message: "WAEC Pin Purchase Successful (Mock Mode)",
        pins: [
          { pin: "554488223311", serial: "WR20269988" }
        ],
        reference: "mock-waec-ref-998877",
      });
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

    const gatewayRes = await fetch(`${gatewayUrl}/api/vtu/waec`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!gatewayRes.ok) {
      const errText = await gatewayRes.text();
      try {
        const errJson = JSON.parse(errText);
        const rawErr = errJson.message || errJson.error || errJson.details || "WAEC PIN purchase failed";
        return NextResponse.json({ ...errJson, message: sanitizeBillErrorMessage(rawErr, "WAEC PIN"), error: sanitizeBillErrorMessage(rawErr, "WAEC PIN") }, { status: gatewayRes.status });
      } catch {
        return NextResponse.json({ error: sanitizeBillErrorMessage(errText, "WAEC PIN") }, { status: gatewayRes.status });
      }
    }

    const data = await gatewayRes.json();
    if (data && data.success === false) {
      const rawMsg = data.message || data.error || "WAEC PIN purchase failed";
      data.message = sanitizeBillErrorMessage(rawMsg, "WAEC PIN");
      data.error = sanitizeBillErrorMessage(rawMsg, "WAEC PIN");
    }
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[WAEC Purchase Route Error]:", error.message);
    return NextResponse.json({ error: sanitizeBillErrorMessage(error.message, "WAEC PIN") }, { status: 500 });
  }
}
