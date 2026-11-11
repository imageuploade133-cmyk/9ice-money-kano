import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { cleanPrivateKey } from "./firebase-auth-rest";

let adminApp: App;

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? cleanPrivateKey(process.env.FIREBASE_PRIVATE_KEY) : "";

function getCredentials() {
  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson);
      if (parsed.private_key) {
        parsed.private_key = cleanPrivateKey(parsed.private_key);
      }
      return cert(parsed);
    } catch (e) {
      console.error("[Firebase Admin Init] Error parsing FIREBASE_SERVICE_ACCOUNT_KEY JSON string:", e);
    }
  }

  if (projectId && clientEmail && privateKey) {
    return cert({
      projectId,
      clientEmail,
      privateKey,
    });
  }

  // Fallback to application default credentials in environments like Google Cloud/Firebase Hosting
  return undefined;
}

const apps = getApps();

if (apps.length > 0) {
  adminApp = apps[0];
} else {
  const credential = getCredentials();
  const fallbackProjectId = projectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "e-tech-global-hub";

  if (credential) {
    adminApp = initializeApp({
      credential,
      projectId: fallbackProjectId,
    });
    console.log(`[Firebase Admin] Initialized with explicit service account credentials. ProjectId: ${fallbackProjectId}`);
  } else {
    // Initialize explicitly with the public projectId as fallback to avoid ADC resolution crash on Vercel
    adminApp = initializeApp({
      projectId: fallbackProjectId,
    });
    console.log(`[Firebase Admin] Initialized with explicit fallback projectId: ${fallbackProjectId}`);
  }
}

const adminDb = getFirestore(adminApp);
const hasAdminCredentials = !!serviceAccountJson || (!!projectId && !!clientEmail && !!privateKey);

export { adminApp, adminDb, hasAdminCredentials };
