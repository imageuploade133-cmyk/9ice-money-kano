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
      return NextResponse.json({
        success: false,
        apiHealth: "offline",
        apiError: "WHATSAPP_API_URL is not configured on server.",
        deviceStatus: "ERROR",
        lastChecked: new Date().toISOString(),
      }, { status: 200 });
    }

    // Call WhatsApp API GET /instances/:id
    let backendRes = await callWhatsappBackend(`/instances/${config.instanceId}`, "GET", undefined, 7000);

    // If /instances/:id is not found, attempt /instance/connectionStatus/:id
    if (!backendRes.ok && backendRes.status === 404) {
      backendRes = await callWhatsappBackend(`/instance/connectionStatus/${config.instanceId}`, "GET", undefined, 7000);
    }

    const lastChecked = new Date().toISOString();

    if (!backendRes.ok) {
      return NextResponse.json({
        success: true,
        apiHealth: "offline",
        apiError: backendRes.error || "WhatsApp API server returned an error.",
        deviceStatus: "ERROR",
        instanceName: config.instanceId,
        lastChecked,
      });
    }

    const rawData = backendRes.data || {};
    const instanceObj = rawData.instance || rawData;

    // Resolve state: open / connected / connecting / qr / close / disconnected
    const rawState = (
      instanceObj.state ||
      instanceObj.status ||
      instanceObj.connectionStatus ||
      rawData.state ||
      rawData.status ||
      "disconnected"
    ).toString().toLowerCase();

    let deviceStatus: "CONNECTED" | "CONNECTING" | "WAITING_FOR_QR" | "DISCONNECTED" | "ERROR" = "DISCONNECTED";

    if (rawState === "open" || rawState === "connected" || rawState === "authenticated") {
      deviceStatus = "CONNECTED";
    } else if (rawState === "connecting" || rawState === "pairing") {
      deviceStatus = "CONNECTING";
    } else if (rawState === "qr" || rawState === "waiting_for_qr" || rawState === "qrcode" || rawData.qr || instanceObj.qr) {
      deviceStatus = "WAITING_FOR_QR";
    } else if (rawState === "close" || rawState === "closed" || rawState === "disconnected") {
      deviceStatus = "DISCONNECTED";
    }

    // Extract device info
    const rawOwner = instanceObj.owner || instanceObj.phoneNumber || instanceObj.jid || rawData.owner || null;
    let phoneNumber: string | null = null;
    if (rawOwner) {
      const cleanNum = String(rawOwner).split("@")[0].replace(/\D/g, "");
      if (cleanNum) phoneNumber = `+${cleanNum}`;
    }

    const accountName = instanceObj.profileName || instanceObj.pushName || instanceObj.name || instanceObj.accountName || rawData.pushName || null;
    const instanceName = instanceObj.instanceName || instanceObj.instanceId || config.instanceId;

    // Check if QR code is attached in status response
    let qrCode: string | null = null;
    const rawQr = instanceObj.qr || instanceObj.qrcode || instanceObj.base64 || rawData.qr || rawData.base64;
    if (rawQr && deviceStatus === "WAITING_FOR_QR") {
      qrCode = formatQrCodePayload(rawQr);
    }

    return NextResponse.json({
      success: true,
      apiHealth: "online",
      apiError: null,
      deviceStatus,
      deviceInfo: {
        phoneNumber,
        accountName,
        instanceName,
        connectionStatus: deviceStatus,
        lastStatusUpdate: lastChecked,
      },
      qrCode,
      lastChecked,
    });
  } catch (err: any) {
    console.error("[WhatsApp Status GET Error]:", err.message);
    return NextResponse.json({
      success: false,
      apiHealth: "offline",
      apiError: "Unauthorized or server error.",
      deviceStatus: "ERROR",
      lastChecked: new Date().toISOString(),
    }, { status: 401 });
  }
}
