import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { DEFAULT_ESTATE_SETTINGS, EstateSettingsData } from "@/estate/types";

// GET /api/estate/admin/settings - Read administrative marketplace settings
export async function GET(req: Request) {
  try {
    const authResult = await requireAdminPermission(req, "estate.view");
    if (!authResult.authorized) {
      return authResult.response!;
    }

    const docSnap = await adminDb.collection("config").doc("estate_settings").get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: true, settings: DEFAULT_ESTATE_SETTINGS });
    }

    const data = docSnap.data() || {};
    return NextResponse.json({
      success: true,
      settings: {
        ...DEFAULT_ESTATE_SETTINGS,
        ...data,
      },
    });
  } catch (err: any) {
    console.error("[GET /api/estate/admin/settings Error]:", err.message);
    return NextResponse.json(
      { error: "Failed to fetch property marketplace settings." },
      { status: 500 }
    );
  }
}

// POST /api/estate/admin/settings - Save administrative marketplace settings
export async function POST(req: Request) {
  try {
    const authResult = await requireAdminPermission(req, "estate.manage");
    if (!authResult.authorized) {
      return authResult.response!;
    }

    const body = await req.json();
    const nowIso = new Date().toISOString();

    const updatedSettings: EstateSettingsData = {
      estateLogoUrl: body.estateLogoUrl ? String(body.estateLogoUrl).trim() : "",
      estateTitle: body.estateTitle ? String(body.estateTitle).trim() : DEFAULT_ESTATE_SETTINGS.estateTitle,
      estateSubtitle: body.estateSubtitle ? String(body.estateSubtitle).trim() : DEFAULT_ESTATE_SETTINGS.estateSubtitle,
      estateTitleColor: body.estateTitleColor ? String(body.estateTitleColor).trim() : DEFAULT_ESTATE_SETTINGS.estateTitleColor,
      estateSubtitleColor: body.estateSubtitleColor ? String(body.estateSubtitleColor).trim() : DEFAULT_ESTATE_SETTINGS.estateSubtitleColor,
      autoApproveListings: Boolean(body.autoApproveListings),
      requireAgentKYC: Boolean(body.requireAgentKYC),
      maxActiveListingsPerAgent: Math.max(1, Number(body.maxActiveListingsPerAgent) || 20),
      platformCommissionPercent: Math.max(0, Number(body.platformCommissionPercent) || 0),
      maxTitleLength: Math.max(10, Math.min(200, Number(body.maxTitleLength) || 100)),
      hidePropertyIcons: Boolean(body.hidePropertyIcons),
      enableVoiceNotes: Boolean(body.enableVoiceNotes !== false),
      enableAutoResponses: Boolean(body.enableAutoResponses !== false),
      enableChat: Boolean(body.enableChat !== false),
      enableCalls: Boolean(body.enableCalls !== false),
      enableShare: Boolean(body.enableShare !== false),
      enableReport: Boolean(body.enableReport !== false),
      enableCardBorder: Boolean(body.enableCardBorder !== false),
      cardBorderStyle: body.cardBorderStyle === "solid" ? "solid" : body.cardBorderStyle === "none" ? "none" : "gradient",
      cardBorderColor: body.cardBorderColor ? String(body.cardBorderColor).trim() : DEFAULT_ESTATE_SETTINGS.cardBorderColor,
      chatSecurityNoticeUser: String(
        body.chatSecurityNoticeUser || DEFAULT_ESTATE_SETTINGS.chatSecurityNoticeUser
      ).trim(),
      chatSecurityNoticeAgent: String(
        body.chatSecurityNoticeAgent || DEFAULT_ESTATE_SETTINGS.chatSecurityNoticeAgent
      ).trim(),
      updatedAt: nowIso,
    };

    await adminDb.collection("config").doc("estate_settings").set(updatedSettings, { merge: true });

    return NextResponse.json({
      success: true,
      message: "Property marketplace settings saved successfully.",
      settings: updatedSettings,
    });
  } catch (err: any) {
    console.error("[POST /api/estate/admin/settings Error]:", err.message);
    return NextResponse.json(
      { error: "Failed to update property marketplace settings." },
      { status: 500 }
    );
  }
}
