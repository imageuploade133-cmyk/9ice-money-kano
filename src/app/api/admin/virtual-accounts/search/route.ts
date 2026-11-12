import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { mintFirebaseIdToken } from "@/lib/admin-auth";
import { getGatewayUrl } from "@/lib/gateway-util";

const GATEWAY_URL = getGatewayUrl();
const GATEWAY_KEY = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY || "";

async function gatewayFetch(url: string, init: RequestInit, uid: string) {
  const token = await mintFirebaseIdToken(uid);
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": GATEWAY_KEY,
      "Authorization": `Bearer ${token}`,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
}

export async function GET(req: Request) {
  const perm = await requireAdminPermission(req, "virtual_accounts.view");
  if (!perm.authorized || !perm.auth) return perm.response!;
  try {
    const q = new URL(req.url).searchParams.get("q") || "";
    const response = await gatewayFetch(
      `${GATEWAY_URL}/api/admin/virtual-accounts/search?q=${encodeURIComponent(q)}`,
      { method: "GET" },
      perm.auth.uid
    );
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to search virtual accounts." }, { status: 502 });
  }
}
