import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await authenticateUserRequest(req);
    const userId = authResult.uid;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const doc = await adminDb.collection("investments").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Investment lock not found." }, { status: 404 });
    }

    const record = doc.data();
    if (record?.userId !== userId) {
      return NextResponse.json({ error: "Forbidden: You do not own this investment lock." }, { status: 403 });
    }

    return NextResponse.json({ success: true, investment: record });
  } catch (err: unknown) {
    console.error("[Get Single Investment API Error]", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message || "Failed to load investment details." }, { status: 500 });
  }
}
