import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { mintFirebaseIdToken } from "@/lib/admin-auth";
import { getGatewayUrl } from "@/lib/gateway-util";

const GATEWAY_URL = getGatewayUrl();

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "vtu.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const { uid } = perm.auth;

    // Try to get token from header, otherwise programmatically mint a fresh one
    const authHeader = req.headers.get("Authorization") || "";
    let idToken = authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : "";

    if (!idToken && uid) {
      idToken = await mintFirebaseIdToken(uid);
    }

    const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`,
    };
    if (gatewayApiKey) headers["x-api-key"] = gatewayApiKey;

    const response = await fetch(`${GATEWAY_URL}/api/admin/reconciliation`, {
      method: "POST",
      headers,
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: result.message || "Reconciliation tool failed" }, { status: response.status });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Reconciliation Exception] Tool execution crashed:", error.message);
    return NextResponse.json({ error: "Reconciliation tool failed", details: error.message }, { status: 500 });
  }
}
