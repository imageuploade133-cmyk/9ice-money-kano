import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const docSnap = await adminDb.collection("config").doc("emergency_broadcast").get();
    if (!docSnap.exists) {
      return NextResponse.json({
        success: true,
        broadcast: {
          active: false,
          title: "",
          message: "",
          urgency: "info",
          badge: "NOTICE",
          modalBgColor: "#FFFFFF",
          modalTextColor: "#111827",
          externalUrl: "",
          externalUrlLabel: "Learn More / Open Link",
          videoUrl: "",
          attachments: [],
          images: [],
          updatedAt: new Date().toISOString(),
        },
      });
    }

    const broadcast = docSnap.data() || {};
    return NextResponse.json({
      success: true,
      broadcast,
    });
  } catch (err: any) {
    console.error("[Emergency GET API Error]:", err.message);
    return NextResponse.json({
      success: true,
      broadcast: {
        active: false,
        title: "",
        message: "",
        urgency: "info",
        badge: "NOTICE",
          modalBgColor: "#FFFFFF",
          modalTextColor: "#111827",
          externalUrl: "",
          externalUrlLabel: "Learn More / Open Link",
          videoUrl: "",
          attachments: [],
          images: [],
        updatedAt: new Date().toISOString(),
      },
    });
  }
}
