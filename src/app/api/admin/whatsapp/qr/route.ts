import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getWhatsappServerConfig, callWhatsappBackend, formatQrCodePayload } from "@/lib/whatsapp-service";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "whatsapp.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const admin = perm.auth;

    const config = await getWhatsappServerConfig();

    if (!config.apiUrl) {
      return NextResponse.json({ error: "WhatsApp API is not configured on server." }, { status: 500 });
    }

    // Call WhatsApp API to retrieve QR code or connect payload
    const backendRes = await callWhatsappBackend(`/instances/${config.instanceId}`, "GET", undefined, 6000);

    // Check if status endpoint returned a QR code
    let qrData = backendRes.data?.instance?.qr || backendRes.data?.instance?.base64 || backendRes.data?.qr || backendRes.data?.base64;

    // If QR code is not present in GET /instances/:id, trigger POST /instances/:id/start or GET /instance/connect/:id
    if (!qrData) {
      const connectRes = await callWhatsappBackend(`/instance/connect/${config.instanceId}`, "GET", undefined, 8000);
      qrData = connectRes.data?.base64 || connectRes.data?.code || connectRes.data?.qr || connectRes.data?.qrcode;
    }

    if (!qrData) {
      const startRes = await callWhatsappBackend(`/instances/${config.instanceId}/start`, "POST", undefined, 8000);
      qrData = startRes.data?.qr || startRes.data?.base64 || startRes.data?.code;
    }

    if (!qrData) {
      return NextResponse.json({
        success: false,
        error: "QR code is not currently available from the WhatsApp API.",
        qrCode: null,
      });
    }

    const qrCodeFormatted = formatQrCodePayload(qrData);

    return NextResponse.json({
      success: true,
      qrCode: qrCodeFormatted,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[WhatsApp QR GET Error]:", err.message);
    return NextResponse.json({ error: "Failed to fetch QR code from backend.", details: err.message }, { status: 500 });
  }
}
