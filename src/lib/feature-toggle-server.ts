import { adminDb } from "@/lib/firebase-admin";
import { DEFAULT_DISABLED_NOTICE, FeatureToggleKey } from "./feature-toggle";

export async function checkServerFeatureStatus(
  key: FeatureToggleKey
): Promise<{ enabled: boolean; message: string }> {
  try {
    const [togglesSnap, appSnap] = await Promise.all([
      adminDb.collection("config").doc("feature_toggles").get(),
      adminDb.collection("config").doc("app").get(),
    ]);

    let toggles: Record<string, any> = {};

    if (togglesSnap.exists && togglesSnap.data()?.toggles) {
      toggles = togglesSnap.data()?.toggles || {};
    } else if (appSnap.exists && appSnap.data()?.featureToggles) {
      toggles = appSnap.data()?.featureToggles || {};
    }

    const item = toggles[key];
    if (!item) {
      return { enabled: true, message: DEFAULT_DISABLED_NOTICE };
    }

    const enabled = item.enabled !== false;
    const message = (item.disabledNotice || "").trim() || DEFAULT_DISABLED_NOTICE;

    return { enabled, message };
  } catch (err) {
    console.warn(`[checkServerFeatureStatus] Error checking ${key}:`, err);
    return { enabled: true, message: DEFAULT_DISABLED_NOTICE };
  }
}
