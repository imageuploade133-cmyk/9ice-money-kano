import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { NotificationService } from "@/services/notification-service";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "branding.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    if (!adminDb) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 500 });
    }

    // Fetch history of sent push notifications
    const logsSnap = await adminDb.collection("admin_push_notifications").orderBy("createdAt", "desc").limit(50).get();
    const logs = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Count metrics
    const totalSent = logs.reduce((acc, curr: any) => acc + (Number(curr.sentCount) || 0), 0);
    let activeTokens = 0;
    try {
      const tokensSnap = await adminDb.collection("fcm_tokens").count().get();
      activeTokens = tokensSnap.data().count || 0;
    } catch {
      // Fallback if count query fails
    }

    return NextResponse.json({
      success: true,
      logs,
      metrics: {
        totalBroadcasts: logs.length,
        totalSent,
        activeTokens,
      },
    });
  } catch (err: any) {
    console.error("[Admin Push Notifications GET] Error:", err.message);
    return NextResponse.json({ error: "Failed to fetch push logs", details: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "branding.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json() || {};
    const { action = "send", id, target = "all", targetUserId, title, message, type = "promo", imageUrl, url } = body;

    if (!adminDb) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 500 });
    }

    // 1. Action: DELETE notification log
    if (action === "delete") {
      if (!id) {
        return NextResponse.json({ error: "Notification record ID is required for deletion." }, { status: 400 });
      }

      await adminDb.collection("admin_push_notifications").doc(id).delete();

      return NextResponse.json({
        success: true,
        message: "Notification record deleted successfully.",
      });
    }

    // 2. Action: UPDATE notification log
    if (action === "update") {
      if (!id) {
        return NextResponse.json({ error: "Notification record ID is required for editing." }, { status: 400 });
      }

      if (!title || !title.trim()) {
        return NextResponse.json({ error: "Notification title is required." }, { status: 400 });
      }

      if (!message || !message.trim()) {
        return NextResponse.json({ error: "Notification message body is required." }, { status: 400 });
      }

      const updateData: any = {
        title: title.trim(),
        message: message.trim(),
        type,
        imageUrl: imageUrl ? imageUrl.trim() : "",
        url: url ? url.trim() : "",
        updatedAt: new Date().toISOString(),
        updatedBy: perm.auth?.email || "admin@system",
      };

      if (target) updateData.target = target;
      if (targetUserId) updateData.targetUserId = targetUserId;

      await adminDb.collection("admin_push_notifications").doc(id).update(updateData);

      return NextResponse.json({
        success: true,
        message: "Notification updated successfully.",
      });
    }

    // 3. Default Action: SEND / BROADCAST push notification
    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Notification title is required." }, { status: 400 });
    }

    if (!message || !message.trim()) {
      return NextResponse.json({ error: "Notification message body is required." }, { status: 400 });
    }

    if (target === "user" && !targetUserId) {
      return NextResponse.json({ error: "Target user ID is required for single user push notifications." }, { status: 400 });
    }

    const adminEmail = perm.auth?.email || "admin@system";

    const result = await NotificationService.sendAdminBroadcastNotification({
      target,
      targetUserId,
      title: title.trim(),
      body: message.trim(),
      type,
      imageUrl: imageUrl ? imageUrl.trim() : "",
      url: url ? url.trim() : "",
      adminEmail,
    });

    return NextResponse.json({
      success: true,
      message: `Push notification broadcasted successfully! Sent to ${result.sentCount} out of ${result.targetCount} active device(s).`,
      result,
    });
  } catch (err: any) {
    console.error("[Admin Push Notifications POST] Error:", err.message);
    return NextResponse.json({ error: "Push notification dispatch failed", details: err.message }, { status: 500 });
  }
}
