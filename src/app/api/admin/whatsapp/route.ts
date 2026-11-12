import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { formatQrCodePayload, callWhatsappBackend } from "@/lib/whatsapp-service";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "whatsapp.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const { uid } = perm.auth;

    // 1. Fetch dynamic WhatsApp API settings from Firestore config/whatsapp_api
    let whatsappApiUrl = process.env.WHATSAPP_API_URL || "";
    let whatsappApiKey = process.env.WHATSAPP_API_KEY || "";
    let whatsappInstanceId = process.env.WHATSAPP_INSTANCE_ID || "";
    let whatsappAdminUsername = process.env.WHATSAPP_ADMIN_USERNAME || "";
    let whatsappAdminPassword = process.env.WHATSAPP_ADMIN_PASSWORD || "";

    try {
      const apiDoc = await adminDb.collection("config").doc("whatsapp_api").get();
      if (apiDoc.exists) {
        const apiData = apiDoc.data();
        if (apiData?.whatsappApiUrl) whatsappApiUrl = apiData.whatsappApiUrl;
        if (apiData?.whatsappApiKey) whatsappApiKey = apiData.whatsappApiKey;
        if (apiData?.whatsappInstanceId) whatsappInstanceId = apiData.whatsappInstanceId;
        if (apiData?.whatsappAdminUsername) whatsappAdminUsername = apiData.whatsappAdminUsername;
        if (apiData?.whatsappAdminPassword) whatsappAdminPassword = apiData.whatsappAdminPassword;
      }
    } catch (dbErr) {
      console.warn("[WhatsApp GET] Firestore config/whatsapp_api read failed, falling back to process.env:", dbErr);
    }

    const hasLiveConfig = !!whatsappApiUrl && !!whatsappInstanceId;

    if (!hasLiveConfig || uid === "mock-admin-uid") {
      // Fallback: Read from local Firestore config state
      let currentStatus = "UNLINKED";
      let phoneNumber = null;
      let linkedAt = null;

      try {
        const docRef = adminDb.collection("config").doc("whatsapp");
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const data = docSnap.data();
          currentStatus = data?.status || "UNLINKED";
          phoneNumber = data?.phoneNumber || null;
          linkedAt = data?.linkedAt || null;
        }
      } catch (dbErr) {
        console.warn("[WhatsApp GET] Firestore config/whatsapp read failed:", dbErr);
      }

      return NextResponse.json({
        success: true,
        status: currentStatus,
        phoneNumber,
        linkedAt,
        sessionName: "E-Tech VIP Whatsapp Gateway (Simulation Mode)",
        isMock: true,
        qrCode: null,
        apiConfig: {
          whatsappApiUrl,
          whatsappInstanceId,
          hasApiKeyConfigured: Boolean(whatsappApiKey),
        }
      });
    }

    // 2. LIVE INTERROGATION OF WHATSAPP VM API GATEWAY
    console.log(`[WhatsApp API GET] Querying live VM gateway for instance: ${whatsappInstanceId}`);
    let isConnected = false;
    let phoneNumber: string | null = null;
    let liveQrCode: string | null = null;

    try {
      let backendRes = await callWhatsappBackend(`/instances/${whatsappInstanceId}`, "GET");

      if (!backendRes.ok) {
        backendRes = await callWhatsappBackend("/instances", "GET");
      }

      if (backendRes.ok && backendRes.data) {
        const rawData = backendRes.data;
        let targetInstance: any = null;

        if (Array.isArray(rawData)) {
          targetInstance = rawData.find((inst: any) => inst.id === whatsappInstanceId || inst.name === whatsappInstanceId) || rawData[0];
        } else if (rawData.instance) {
          targetInstance = rawData.instance;
        } else {
          targetInstance = rawData;
        }

        if (targetInstance) {
          const rawState = (
            targetInstance.state ||
            targetInstance.status ||
            targetInstance.connectionStatus ||
            ""
          ).toString().toLowerCase();

          isConnected = rawState === "open" || rawState === "connected" || rawState === "authenticated" || rawState === "ready" || !!targetInstance.owner;

          const rawOwner = targetInstance.owner || targetInstance.phoneNumber || targetInstance.jid || null;
          if (rawOwner) {
            const cleanNum = String(rawOwner).split("@")[0].replace(/\D/g, "");
            if (cleanNum) phoneNumber = `+${cleanNum}`;
          }

          if (targetInstance.qr || targetInstance.base64) {
            liveQrCode = formatQrCodePayload(targetInstance.qr || targetInstance.base64);
          }
        }
      }

      if (isConnected) {
        try {
          await adminDb.collection("config").doc("whatsapp").set({
            status: "LINKED",
            phoneNumber: phoneNumber || "+2348000000000",
            linkedAt: new Date().toISOString(),
            sessionName: `VM Instance: ${whatsappInstanceId}`
          }, { merge: true });
        } catch (dbErr) {
          console.warn("[WhatsApp GET] Firestore status sync warning:", dbErr);
        }

        return NextResponse.json({
          success: true,
          status: "LINKED",
          phoneNumber: phoneNumber || "Connected Sender",
          linkedAt: new Date().toISOString(),
          sessionName: `VM Instance: ${whatsappInstanceId}`,
          isMock: false,
          apiConfig: {
            whatsappApiUrl,
            whatsappInstanceId,
            hasApiKeyConfigured: Boolean(whatsappApiKey),
          }
        });
      }
    } catch (apiErr: any) {
      console.error("[WhatsApp GET] Error querying live connectionStatus:", apiErr.message);
    }

    // 3. FETCH LIVE QR CODE AUTOMATICALLY IF DISCONNECTED
    if (!liveQrCode) {
      try {
        const qrRes = await callWhatsappBackend(`/instances/${whatsappInstanceId}/qr`, "GET");
        if (qrRes.ok && qrRes.data) {
          const qrData = qrRes.data;
          const base64Code = qrData?.qr || qrData?.base64 || qrData?.code || qrData?.qrcode;
          if (base64Code) {
            liveQrCode = formatQrCodePayload(base64Code);
          }
        }
      } catch (qrErr: any) {
        console.error("[WhatsApp GET] Error fetching QR code from VM gateway:", qrErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      status: "UNLINKED",
      phoneNumber: null,
      linkedAt: null,
      sessionName: `VM Instance: ${whatsappInstanceId}`,
      isMock: false,
      qrCode: liveQrCode,
      apiConfig: {
        whatsappApiUrl,
        whatsappInstanceId,
        hasApiKeyConfigured: Boolean(whatsappApiKey),
      }
    });

  } catch (err: any) {
    console.error("[WhatsApp Admin API GET Exception]:", err.message);
    return NextResponse.json({ error: "Unauthorized or backend error", details: err.message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "whatsapp.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const { uid } = perm.auth;

    const body = await req.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: "Missing required parameter: action" }, { status: 400 });
    }

    // 1. SAVE NEW API CONFIGURATION IN FIRESTORE
    if (action === "save_api_config") {
      const {
        whatsappApiUrl,
        whatsappApiKey,
        whatsappInstanceId,
        whatsappAdminUsername,
        whatsappAdminPassword
      } = body;

      const updateData: Record<string, any> = {
        whatsappApiUrl: String(whatsappApiUrl || "").trim(),
        whatsappInstanceId: String(whatsappInstanceId || "").trim(),
        updatedAt: new Date().toISOString()
      };

      if (whatsappApiKey && String(whatsappApiKey).trim()) {
        updateData.whatsappApiKey = String(whatsappApiKey).trim();
      }
      if (whatsappAdminUsername && String(whatsappAdminUsername).trim()) {
        updateData.whatsappAdminUsername = String(whatsappAdminUsername).trim();
      }
      if (whatsappAdminPassword && String(whatsappAdminPassword).trim()) {
        updateData.whatsappAdminPassword = String(whatsappAdminPassword).trim();
      }

      try {
        await adminDb.collection("config").doc("whatsapp_api").set(updateData, { merge: true });

        return NextResponse.json({
          success: true,
          message: "WhatsApp API configurations successfully saved and updated!"
        });
      } catch (dbErr: any) {
        console.error("[WhatsApp POST SaveConfig] DB Write Exception:", dbErr.message);
        return NextResponse.json({ error: "Failed to write settings to Firestore: Permission denied or offline." }, { status: 400 });
      }
    }

    // Load active config dynamically
    let whatsappApiUrl = process.env.WHATSAPP_API_URL || "";
    let whatsappApiKey = process.env.WHATSAPP_API_KEY || "";
    let whatsappInstanceId = process.env.WHATSAPP_INSTANCE_ID || "";

    try {
      const apiDoc = await adminDb.collection("config").doc("whatsapp_api").get();
      if (apiDoc.exists) {
        const apiData = apiDoc.data();
        if (apiData?.whatsappApiUrl) whatsappApiUrl = apiData.whatsappApiUrl;
        if (apiData?.whatsappApiKey) whatsappApiKey = apiData.whatsappApiKey;
        if (apiData?.whatsappInstanceId) whatsappInstanceId = apiData.whatsappInstanceId;
      }
    } catch (dbErr) {
      console.warn("[WhatsApp POST] Firestore config/whatsapp_api fetch failed:", dbErr);
    }

    const hasLiveConfig = !!whatsappApiUrl && !!whatsappInstanceId;

    if (action === "link") {
      const { phoneNumber } = body;
      if (!phoneNumber) {
        return NextResponse.json({ error: "Phone number is required for pairing." }, { status: 400 });
      }

      const cleanNum = phoneNumber.trim().replace(/\D/g, "");
      if (cleanNum.length < 10) {
        return NextResponse.json({ error: "Invalid WhatsApp phone number format." }, { status: 400 });
      }

      if (hasLiveConfig && uid !== "mock-admin-uid") {
        try {
          const response = await fetch(`${whatsappApiUrl}/instance/connect/${whatsappInstanceId}`, {
            method: "GET",
            headers: {
              "apikey": whatsappApiKey,
              "Content-Type": "application/json"
            }
          });
          if (response.ok) {
            console.log("[WhatsApp API GET] Reconnect initialized successfully on live gateway.");
          }
        } catch (gateErr: any) {
          console.warn("[WhatsApp GET Bypass] Live reconnect error:", gateErr.message);
        }
      }

      const linkData = {
        status: "LINKED",
        phoneNumber: `+${cleanNum}`,
        linkedAt: new Date().toISOString(),
        sessionName: hasLiveConfig ? `VM Instance: ${whatsappInstanceId}` : "E-Tech Enterprise WhatsApp Sender (Mock)"
      };

      try {
        await adminDb.collection("config").doc("whatsapp").set(linkData, { merge: true });
      } catch (dbErr: any) {
        console.warn("[WhatsApp API POST Link] DB write failed:", dbErr.message);
      }

      return NextResponse.json({
        success: true,
        message: "WhatsApp session paired successfully!",
        ...linkData
      });

    } else if (action === "unlink") {
      if (hasLiveConfig && uid !== "mock-admin-uid") {
        try {
          await fetch(`${whatsappApiUrl}/instance/logout/${whatsappInstanceId}`, {
            method: "DELETE",
            headers: {
              "apikey": whatsappApiKey,
              "Content-Type": "application/json"
            }
          });
          console.log("[WhatsApp API] Dispatched logout command to VM Instance.");
        } catch (gateErr: any) {
          console.warn("[WhatsApp Gateway Logout Bypass] Remote gateway offline:", gateErr.message);
        }
      }

      const unlinkData = {
        status: "UNLINKED",
        phoneNumber: null,
        linkedAt: null,
        sessionName: hasLiveConfig ? `VM Instance: ${whatsappInstanceId}` : "E-Tech Enterprise WhatsApp Sender"
      };

      try {
        await adminDb.collection("config").doc("whatsapp").set(unlinkData, { merge: true });
      } catch (dbErr: any) {
        console.warn("[WhatsApp API POST Unlink] DB write failed:", dbErr.message);
      }

      return NextResponse.json({
        success: true,
        message: "WhatsApp session unlinked successfully.",
        ...unlinkData
      });

    } else {
      return NextResponse.json({ error: "Invalid action parameter." }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[WhatsApp Admin API POST Exception]:", err.message);
    return NextResponse.json({ error: "Operation failed", details: err.message }, { status: 500 });
  }
}
