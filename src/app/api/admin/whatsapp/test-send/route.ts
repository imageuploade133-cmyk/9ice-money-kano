import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { callWhatsappBackend, getWhatsappServerConfig, logWhatsappAdminAudit } from "@/lib/whatsapp-service";

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "whatsapp.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const admin = perm.auth;

    const body = await req.json();
    const { phoneNumber, message, type } = body;

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    }

    const cleanNum = phoneNumber.trim().replace(/\D/g, "");
    if (cleanNum.length < 10) {
      return NextResponse.json({ error: "Please enter a valid phone number (at least 10 digits)." }, { status: 400 });
    }

    // Format full recipient phone number with country code if missing
    const fullNum = cleanNum.length === 10 || cleanNum.startsWith("0")
      ? `234${cleanNum.startsWith("0") ? cleanNum.slice(1) : cleanNum}`
      : cleanNum;

    let textToSend = "";
    if (type === "test_otp") {
      const sampleOtp = Math.floor(100000 + Math.random() * 900000).toString();
      textToSend = `[E-Tech Security] Your test verification OTP code is ${sampleOtp}. Valid for 5 minutes. Do not share this code with anyone.`;
    } else {
      if (!message || !message.trim()) {
        return NextResponse.json({ error: "Message content is required for custom WhatsApp messages." }, { status: 400 });
      }
      textToSend = message.trim();
    }

    const config = await getWhatsappServerConfig();

    if (!config.apiUrl || !config.apiKey || !config.instanceId) {
      return NextResponse.json({
        error: "WhatsApp API credentials (WHATSAPP_API_URL, WHATSAPP_API_KEY, WHATSAPP_INSTANCE_ID) are missing or incomplete."
      }, { status: 500 });
    }

    const payload = {
      number: fullNum,
      message: textToSend,
    };

    // Strictly send to POST /send/text using WhatsAPI contract (callWhatsappBackend automatically prepends /api)
    const backendRes = await callWhatsappBackend("/send/text", "POST", payload, 10000);

    await logWhatsappAdminAudit(admin.uid, admin.email || "", "TEST_WHATSAPP_DISPATCH", {
      phoneNumber: fullNum,
      type: type || "custom",
      success: backendRes.ok,
      status: backendRes.status,
    });

    if (backendRes.ok) {
      return NextResponse.json({
        success: true,
        message: `WhatsApp message dispatched successfully to +${fullNum}!`,
        sentText: textToSend,
        recipient: `+${fullNum}`,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      error: backendRes.error || "WhatsApp API server returned an error.",
      details: backendRes.data || { note: "Failed to dispatch message to POST /api/send/text." },
    }, { status: backendRes.status && backendRes.status >= 400 && backendRes.status < 500 ? backendRes.status : 502 });

  } catch (err: any) {
    console.error("[WhatsApp Test Send POST Exception]:", err.message);
    return NextResponse.json({ error: "Failed to dispatch test WhatsApp message.", details: err.message }, { status: 500 });
  }
}
