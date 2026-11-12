import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { ReferralService } from "@/services/referral-service";

export async function GET(req: Request) {
  let uid = "";
  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
  } catch (err: any) {
    return NextResponse.json({ error: "Unauthorized: Invalid or missing authorization token." }, { status: 401 });
  }

  try {
    // Force a background check on any pending referrals before loading the list, to make sure everything is completely up to date
    try {
      await ReferralService.checkAndProcessReferral(uid);
    } catch (checkErr: any) {
      console.error("[GET /api/referrals] Background referral check failed:", checkErr.message);
    }

    const referrals = await ReferralService.getReferralsList(uid);

    return NextResponse.json({
      success: true,
      referrals,
    });
  } catch (error: any) {
    console.error("[GET /api/referrals] Unexpected exception:", error);
    return NextResponse.json({
      error: "Internal server error retrieving referrals list.",
      message: error.message,
    }, { status: 500 });
  }
}
