import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: Request) {
  try {
    const authResult = await authenticateUserRequest(req);
    const userId = authResult.uid;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const snapshot = await adminDb
      .collection("investmentTransactions")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();

    const history: unknown[] = [];
    snapshot.forEach((doc) => {
      history.push(doc.data());
    });

    return NextResponse.json({ success: true, history });
  } catch (err: unknown) {
    console.error("[Get Investments History API Error]", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message || "Failed to load investment history." }, { status: 500 });
  }
}
