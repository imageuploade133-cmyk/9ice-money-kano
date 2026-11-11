import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { DEFAULT_ESTATE_SETTINGS } from "@/estate/types";

// GET /api/estate/settings - Public unauthenticated route for marketplace header & settings
export async function GET() {
  try {
    const docSnap = await adminDb.collection("config").doc("estate_settings").get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: true, settings: DEFAULT_ESTATE_SETTINGS });
    }

    const data = docSnap.data() || {};
    return NextResponse.json({
      success: true,
      settings: {
        ...DEFAULT_ESTATE_SETTINGS,
        ...data,
      },
    });
  } catch (err: any) {
    console.error("[GET /api/estate/settings Error]:", err.message);
    return NextResponse.json({ success: true, settings: DEFAULT_ESTATE_SETTINGS });
  }
}
