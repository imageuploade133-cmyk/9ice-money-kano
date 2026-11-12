import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-permissions";
import {
  getWhatsappServerConfig,
  callWhatsappBackend,
  acquireWhatsappActionLock,
  releaseWhatsappActionLock,
  logWhatsappAdminAudit,
  formatQrCodePayload,
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

      // Call POST /instances/:id/start (or GET /instance/connect/:id)
      let backendRes = await callWhatsappBackend(`/instances/${config.instanceId}/start`, "POST", undefined, 10000);

      if (!backendRes.ok && backendRes.status === 404) {
        backendRes = await callWhatsappBackend(`/instance/connect/${config.instanceId}`, "GET", undefined, 10000);
      }

      await logWhatsappAdminAudit(admin.uid, admin.email || "", "CONNECT_WHATSAPP_DEVICE", {
        instanceId: config.instanceId,
        success: backendRes.ok,
      });

      if (!backendRes.ok) {
        return NextResponse.json(
          { error: backendRes.error || "Failed to initialize WhatsApp connection." },
          { status: backendRes.status || 500 }
        );
      }

      const qrData = backendRes.data?.qr || backendRes.data?.base64 || backendRes.data?.code;
      const qrCodeFormatted = formatQrCodePayload(qrData);

      return NextResponse.json({
        success: true,
        message: "WhatsApp device connection sequence initiated.",
        qrCode: qrCodeFormatted,
        timestamp: new Date().toISOString(),
      });
    } finally {
      releaseWhatsappActionLock();
    }
  } catch (err: any) {
    console.error("[WhatsApp Connect POST Error]:", err.message);
    return NextResponse.json({ error: "Failed to connect WhatsApp device.", details: err.message }, { status: 500 });
  }
}
