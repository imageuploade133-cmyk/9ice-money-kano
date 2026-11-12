import { NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";

export async function GET(req: Request) {
  try {
    await verifyAdminAuth(req);
  } catch {
    return NextResponse.json(
      { error: "Unauthorized access." },
      { status: 401 }
    );
  }

  const publicKey = process.env.FLW_PUBLIC_KEY;
  const secretKey = process.env.FLW_SECRET_KEY;
  const webhookSecret = process.env.FLW_WEBHOOK_SECRET;

  const isConfigured = Boolean(publicKey && secretKey && webhookSecret);

  return NextResponse.json(
    {
      configured: isConfigured,
      hasPublicKey: Boolean(publicKey),
      hasSecretKey: Boolean(secretKey),
      hasWebhookSecret: Boolean(webhookSecret),
    },
    { status: isConfigured ? 200 : 400 }
  );
}
