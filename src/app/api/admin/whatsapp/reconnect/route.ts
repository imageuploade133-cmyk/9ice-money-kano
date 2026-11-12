import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-permissions";
import {
  getWhatsappServerConfig,
  callWhatsappBackend,
  acquireWhatsappActionLock,
  releaseWhatsappActionLock,
  logWhatsappAdminAudit,
} from "@/lib/whatsapp-service";

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "whatsapp.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const admin = perm.auth;

    if (!acquireWhatsappActionLock()) {
      return NextResponse.json(
        { error: "A WhatsApp connection action is already in progress. Please wait." },
        { status: 429 }
      );
    }

    try {
      const config = await getWhatsappServerConfig();

      if (!config.apiUrl) {
        return NextResponse.json({ error: "WhatsApp API is not configured on server." }, { status: 500 });
      }

      // Call POST /instances/:id/start
      let backendRes = await callWhatsappBackend(`/instances/${config.instanceId}/start`, "POST", undefined, 10000);

      if (!backendRes.ok && backendRes.status === 404) {
        backendRes = await callWhatsappBackend(`/instance/connect/${config.instanceId}`, "GET", undefined, 10000);
      }

      await logWhatsappAdminAudit(admin.uid, admin.email || "", "RECONNECT_WHATSAPP_DEVICE", {
        instanceId: config.instanceId,
        success: backendRes.ok,
      });

      if (!backendRes.ok) {
        return NextResponse.json(
          { error: backendRes.error || "Failed to restart WhatsApp connection." },
          { status: backendRes.status || 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "WhatsApp device reconnection initiated successfully.",
        timestamp: new Date().toISOString(),
      });
    } finally {
      releaseWhatsappActionLock();
    }
  } catch (err: any) {
    console.error("[WhatsApp Reconnect POST Error]:", err.message);
    return NextResponse.json({ error: "Failed to reconnect WhatsApp device.", details: err.message }, { status: 500 });
  }
}
