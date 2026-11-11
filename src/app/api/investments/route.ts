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
      .collection("investments")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();

    const { InvestmentService } = await import("@/services/investment-service");

    const list: unknown[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const publicRef = InvestmentService.resolvePublicReference(data);
      list.push({
        ...data,
        investmentReference: publicRef,
      });
    });

    return NextResponse.json({ success: true, investments: list });
  } catch (err: unknown) {
    console.error("[Get Investments API Error]", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message || "Failed to load investments." }, { status: 500 });
  }
}
