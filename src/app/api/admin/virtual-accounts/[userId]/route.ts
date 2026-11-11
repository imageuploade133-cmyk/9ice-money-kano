import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { mintFirebaseIdToken } from "@/lib/admin-auth";
import { getGatewayUrl } from "@/lib/gateway-util";

const GATEWAY_URL = getGatewayUrl();
const GATEWAY_KEY = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY || "";

async function callGateway(req: Request, uid: string, path: string, method: string, body?: unknown) {
  const token = await mintFirebaseIdToken(uid);
  return fetch(`${GATEWAY_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": GATEWAY_KEY,
      "Authorization": `Bearer ${token}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const perm = await requireAdminPermission(req, "virtual_accounts.view");
  if (!perm.authorized || !perm.auth) return perm.response!;
  const { userId } = await params;
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(userId)) {
    return NextResponse.json({ success: false, message: "Invalid user identifier." }, { status: 400 });
  }
  try {
    const response = await callGateway(req, perm.auth.uid, `/api/admin/virtual-accounts/${encodeURIComponent(userId)}`, "GET");
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load virtual account details." }, { status: 502 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const perm = await requireAdminPermission(req, "virtual_accounts.manage");
  if (!perm.authorized || !perm.auth) return perm.response!;
  const { userId } = await params;
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(userId)) {
    return NextResponse.json({ success: false, message: "Invalid user identifier." }, { status: 400 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  if (body.confirmation !== "GENERATE") {
    return NextResponse.json({ success: false, message: "Confirmation text must be GENERATE." }, { status: 400 });
  }

  try {
    const response = await callGateway(req, perm.auth.uid, `/api/admin/virtual-accounts/${encodeURIComponent(userId)}/replace`, "POST", { confirmation: "GENERATE" });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to replace virtual account." }, { status: 502 });
  }
}
