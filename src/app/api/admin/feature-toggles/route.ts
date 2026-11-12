import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { DEFAULT_FEATURE_TOGGLES, FeatureToggles } from "@/lib/feature-toggle";
import { requireAdminPermission } from "@/lib/admin-permissions";

export async function GET(req: Request) {
  try {
    const docSnap = await adminDb.collection("config").doc("feature_toggles").get();
    let toggles: FeatureToggles = { ...DEFAULT_FEATURE_TOGGLES };

    if (docSnap.exists) {
      const data = docSnap.data();
      if (data?.toggles) {
        toggles = {
          ...DEFAULT_FEATURE_TOGGLES,
          ...data.toggles,
        };
      }
    }

    return NextResponse.json({ success: true, toggles });
  } catch (err: any) {
    console.error("[Feature Toggles GET Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch feature toggles" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "feature_toggle.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const updatedToggles: Partial<FeatureToggles> = body.toggles || {};

    // Load existing or default toggles
    const docRef = adminDb.collection("config").doc("feature_toggles");
    const docSnap = await docRef.get();
    const currentToggles = docSnap.exists && docSnap.data()?.toggles
      ? docSnap.data()?.toggles
      : DEFAULT_FEATURE_TOGGLES;

    const mergedToggles: FeatureToggles = {
      ...DEFAULT_FEATURE_TOGGLES,
      ...currentToggles,
      ...updatedToggles,
    };

    // Save to Firestore config/feature_toggles
    await docRef.set(
      {
        toggles: mergedToggles,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Also update config/app for backward compatibility with AppConfig context
    await adminDb.collection("config").doc("app").set(
      {
        featureToggles: mergedToggles,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Log admin audit log
    try {
      await adminDb.collection("admin_audit_logs").add({
        action: "feature_toggles_update",
        details: "Updated CPanel service feature toggles and disabled notice parameters",
        updatedAt: new Date().toISOString(),
      });
    } catch (auditErr) {
      console.warn("Failed to log feature toggle audit:", auditErr);
    }

    return NextResponse.json({
      success: true,
      message: "Feature toggles saved successfully",
      toggles: mergedToggles,
    });
  } catch (err: any) {
    console.error("[Feature Toggles POST Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to save feature toggles" },
      { status: 500 }
    );
  }
}
