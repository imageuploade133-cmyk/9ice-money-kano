import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { CardService } from "@/services/card-service";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;

  try {
    const body = await req.json();
    const { isLocked } = body;

    const result = await CardService.toggleFreeze({
      userId: uid,
      cardId: id,
      isLocked: !!isLocked,
      idToken,
      sessionId,
      isMock: uid === "mock-uid",
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
