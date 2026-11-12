import { adminDb, adminApp } from "@/lib/firebase-admin";
import { verifyFirebaseIdToken } from "@/lib/auth-util";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { getAuth } from "firebase-admin/auth";

const JWT_SECRET = process.env.CPANEL_SESSION_SECRET;

if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  console.warn("[Admin Auth Security Warning]: CPANEL_SESSION_SECRET environment variable is missing in production!");
}

const EFFECTIVE_JWT_SECRET = JWT_SECRET || "cpanel_secure_session_secret_987654321_etech_global";

export async function verifyAdminAuth(req: Request): Promise<{ uid: string; isAdmin: boolean; email?: string; role?: string; permissions?: string[] }> {
  try {
    // 1. Check CPanel session cookie
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("cpanel_session")?.value;

    let uid = "";

    if (sessionToken) {
      try {
        const decoded = jwt.verify(sessionToken, EFFECTIVE_JWT_SECRET) as { uid: string; email: string; role: string };
        if (decoded && decoded.uid) {
          uid = decoded.uid;
        }
      } catch (cookieErr: any) {
        console.warn("[verifyAdminAuth] Cookie session verification failed:", cookieErr.message);
      }
    }

    // 2. Fall back to Authorization Bearer header (Firebase ID Token)
    if (!uid) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split("Bearer ")[1];
        const decoded = await verifyFirebaseIdToken(token);
        uid = decoded.uid;
      }
    }

    if (!uid) {
      throw new Error("Missing or invalid Authorization header/cookie session.");
    }

    // Look up administrator document in dedicated admin_users collection using Firebase UID as identity
    const adminDocSnap = await adminDb.collection("admin_users").doc(uid).get();

    if (!adminDocSnap.exists) {
      throw new Error("Forbidden: Account is not configured in admin_users.");
    }

    const adminData = adminDocSnap.data() || {};

    if (adminData.status !== "active") {
      throw new Error("Forbidden: Administrator account is disabled or suspended.");
    }

    return {
      uid,
      isAdmin: true,
      email: adminData.email || "",
      role: adminData.role || "admin",
      permissions: Array.isArray(adminData.permissions) ? adminData.permissions : []
    };
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[verifyAdminAuth Error] Access denied:", error.message);
    throw error;
  }
}

/**
 * Programmatically generates a short-lived Firebase ID Token for a user ID
 * to securely authorize server-to-server calls to the payment-gateway VM on the fly.
 *
 * IMPORTANT: This must return a Firebase Authentication ID token, not a
 * Google OAuth2 access token and not a Firebase custom token.
 */
export async function mintFirebaseIdToken(uid: string): Promise<string> {
  if (!uid) {
    throw new Error("Cannot mint Firebase ID token without a user UID.");
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Firebase API key for Firebase ID token exchange.");
  }

  // Create a Firebase custom token for the authenticated administrator.
  const customToken = await getAuth(adminApp).createCustomToken(uid);

  // Exchange the custom token for a real Firebase Authentication ID token.
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true,
      }),
    }
  );

  const data = await res.json();

  if (!res.ok || typeof data.idToken !== "string" || !data.idToken) {
    const message = data?.error?.message || res.statusText || "Firebase custom-token exchange failed.";
    throw new Error(`Firebase ID token exchange failed: ${message}`);
  }

  return data.idToken;
}
