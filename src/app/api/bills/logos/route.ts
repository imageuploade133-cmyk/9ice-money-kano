import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const docSnap = await adminDb.collection("config").doc("bill_logos").get();
    const logos = docSnap.exists ? docSnap.data() || {} : {};

    return NextResponse.json({
      success: true,
      logos,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.warn("[Public Bill Logos GET Warning]:", error.message);
    return NextResponse.json({ success: true, logos: {} });
  }
}
