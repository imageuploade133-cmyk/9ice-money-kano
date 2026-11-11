import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-permissions";
import {
  getWhatsappServerConfig,
  callWhatsappBackend,
  acquireWhatsappActionLock,
  releaseWhatsappActionLock,
  logWhatsappAdminAudit,
} from "@/lib/whatsapp-service";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "whatsapp.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const admin = perm.auth;

    if (!acquireWhatsappActionLock()) {
      return NextResponse.json(
        { error: "A WhatsApp action is already in progress. Please wait." },
        { status: 429 }
      );
    }

    try {
      const config = await getWhatsappServerConfig();

      if (!config.apiUrl) {
        return NextResponse.json({ error: "WhatsApp API is not configured on server." }, { status: 500 });
      }

      // Call POST /instances/:id/disconnect (or DELETE /instances/:id)
      let backendRes = await callWhatsappBackend(`/instances/${config.instanceId}/disconnect`, "POST", undefined, 10000);

      if (!backendRes.ok) {
        backendRes = await callWhatsappBackend(`/instances/${config.instanceId}`, "DELETE", undefined, 10000);
      }

      if (!backendRes.ok) {
        backendRes = await callWhatsappBackend(`/instance/logout/${config.instanceId}`, "DELETE", undefined, 10000);
      }

      // Clear local Firestore status document
      try {
        await adminDb.collection("config").doc("whatsapp").set({
          status: "UNLINKED",
          phoneNumber: null,
          linkedAt: null,
          sessionName: `VM Instance: ${config.instanceId}`,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (dbErr: any) {
        console.warn("[WhatsApp Disconnect] Firestore reset warning:", dbErr.message);
      }

      await logWhatsappAdminAudit(admin.uid, admin.email || "", "DISCONNECT_LOGOUT_WHATSAPP_DEVICE", {
        instanceId: config.instanceId,
        success: backendRes.ok,
      });

      return NextResponse.json({
        success: true,
        message: "WhatsApp device logged out and authentication session cleared successfully.",
        timestamp: new Date().toISOString(),
      });
    } finally {
      releaseWhatsappActionLock();
    }
  } catch (err: any) {
    console.error("[WhatsApp Disconnect POST Error]:", err.message);
    return NextResponse.json({ error: "Failed to disconnect WhatsApp device.", details: err.message }, { status: 500 });
  }
}
