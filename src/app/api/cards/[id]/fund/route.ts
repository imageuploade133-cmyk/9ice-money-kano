import { NextResponse } from "next/server";
import { authenticateUserRequest, verifyUserKycApproved } from "@/lib/auth-util";
import { CardService } from "@/services/card-service";
import { checkServerFeatureStatus } from "@/lib/feature-toggle-server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const featureStatus = await checkServerFeatureStatus("virtual_cards");
  if (!featureStatus.enabled) {
    return NextResponse.json({ error: featureStatus.message }, { status: 403 });
  }
  let uid = "";
  let idToken = "";
  let sessionId = "";
  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
    const authHeader = req.headers.get("Authorization") || "";
    idToken = authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : "";
    sessionId = req.headers.get("X-Session-ID") || req.headers.get("x-session-id") || "";
  } catch (err: any) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Enforce KYC verification
  const isApproved = await verifyUserKycApproved(uid);
  if (!isApproved) {
    return NextResponse.json({ error: "Forbidden: Account verification is required to perform financial transactions." }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { amount } = body;
    const fundAmount = Number(amount);

    if (isNaN(fundAmount) || fundAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount to fund." }, { status: 400 });
    }

    const result = await CardService.fundCard({
      userId: uid,
      cardId: id,
      amount: fundAmount,
      idToken,
      sessionId,
      isMock: uid === "mock-uid",
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
