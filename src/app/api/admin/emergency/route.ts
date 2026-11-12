import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "branding.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const docSnap = await adminDb.collection("config").doc("emergency_broadcast").get();
    const data = docSnap.exists ? docSnap.data() || {} : {};

    return NextResponse.json({
      success: true,
      broadcast: {
        active: Boolean(data.active),
        title: data.title || "",
        message: data.message || "",
        urgency: data.urgency || "warning",
        badge: data.badge || "EMERGENCY BROADCAST",
        icon: data.icon || "campaign",
        modalBgColor: data.modalBgColor || "#FFFFFF",
        modalTextColor: data.modalTextColor || "#111827",
        externalUrl: data.externalUrl || "",
        externalUrlLabel: data.externalUrlLabel || "Learn More / Open Link",
        videoUrl: data.videoUrl || "",
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        images: Array.isArray(data.images) ? data.images : [],
        updatedAt: data.updatedAt || new Date().toISOString(),
        updatedBy: data.updatedBy || "System Admin",
      },
    });
  } catch (err: any) {
    console.error("[Admin Emergency GET Error]:", err.message);
    return NextResponse.json({ error: err.message || "Failed to fetch broadcast settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "branding.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const {
      active,
      title,
      message,
      urgency,
      badge,
      icon,
      modalBgColor,
      modalTextColor,
      externalUrl,
      externalUrlLabel,
      videoUrl,
      attachments,
      images,
    } = body;

    const updatedAt = new Date().toISOString();
    const updatedBy = perm.auth?.email || "System Admin";

    const broadcastData = {
      active: Boolean(active),
      title: (title || "").trim(),
      message: (message || "").trim(),
      urgency: urgency || "warning",
      badge: (badge || "EMERGENCY BROADCAST").trim().toUpperCase(),
      icon: icon || "campaign",
      modalBgColor: modalBgColor || "#FFFFFF",
      modalTextColor: modalTextColor || "#111827",
      externalUrl: (externalUrl || "").trim(),
      externalUrlLabel: (externalUrlLabel || "Learn More / Open Link").trim(),
      videoUrl: (videoUrl || "").trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
      images: Array.isArray(images) ? images : [],
      updatedAt,
      updatedBy,
    };

    await adminDb.collection("config").doc("emergency_broadcast").set(broadcastData, { merge: true });

    // Also write audit log
    try {
      await adminDb.collection("admin_audit_logs").add({
        action: "emergency_broadcast_update",
        adminEmail: updatedBy,
        details: broadcastData,
        timestamp: updatedAt,
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: active
        ? "Emergency broadcast published live across user wallet dashboards!"
        : "Emergency broadcast disabled.",
      broadcast: broadcastData,
    });
  } catch (err: any) {
    console.error("[Admin Emergency POST Error]:", err.message);
    return NextResponse.json({ error: err.message || "Failed to save emergency broadcast" }, { status: 500 });
  }
}
