import crypto from "crypto";
import { adminDb } from "./firebase-admin";

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "e-tech-global-hub";

/**
 * Checks if the user's KYC status is strictly APPROVED or VERIFIED.
 */
export async function verifyUserKycApproved(userId: string): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && (userId === "mock-admin-uid" || userId === "mock-uid")) {
    return true;
  }
  try {
    const userDoc = await adminDb.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return false;
    }
    const data = userDoc.data();
    return data?.kycStatus === "APPROVED" || data?.kycStatus === "VERIFIED";
  } catch (err) {
    console.error(`[verifyUserKycApproved Error] userId=${userId}:`, err);
    return false;
  }
}

export interface DecodedTokenResult {
  uid: string;
  email?: string;
  name?: string;
}

// In-memory certificate cache for Google x509 public keys
let certsCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getGooglePublicCertificates(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certsCache && certsCache.expiresAt > now) {
    return certsCache.certs;
  }

  const certsRes = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
  if (!certsRes.ok) {
    throw new Error("Failed to fetch public certificates from Google.");
  }

  let maxAgeSeconds = 3600; // Default 1 hour fallback
  const cacheControl = certsRes.headers.get("cache-control");
  if (cacheControl) {
    const match = cacheControl.match(/max-age=(\d+)/);
    if (match && match[1]) {
      maxAgeSeconds = parseInt(match[1], 10);
    }
  }

  const certs = await certsRes.json();
  certsCache = {
    certs,
    expiresAt: now + maxAgeSeconds * 1000,
  };

  return certs;
}

/**
 * A lightweight, high-performance, 100% dependency-free Firebase ID Token verifier.
 * Validates algorithm (RS256), Google signing certificates (with rotation & caching),
 * project ID, audience, issuer, expiration, clock drift, and sub (UID) claims.
 */
export async function verifyFirebaseIdToken(token: string, projectId: string = FIREBASE_PROJECT_ID): Promise<DecodedTokenResult> {
  if (!token || typeof token !== "string") {
    throw new Error("Invalid token: Token must be a non-empty string.");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format. Token must have 3 parts.");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let headerJson: any;
  let payloadJson: any;

  try {
    headerJson = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    payloadJson = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid JWT: Failed to parse header or payload JSON.");
  }

  if (headerJson.alg !== "RS256") {
    throw new Error(`Invalid algorithm '${headerJson.alg}'. Firebase ID tokens must use 'RS256'.`);
  }

  const kid = headerJson.kid;
  if (!kid) {
    throw new Error("Missing 'kid' claim in JWT header.");
  }

  let certs = await getGooglePublicCertificates();
  let activeCert = certs[kid];

  if (!activeCert) {
    certsCache = null;
    certs = await getGooglePublicCertificates();
    activeCert = certs[kid];
    if (!activeCert) {
      throw new Error(`Public key certificate not found for kid: ${kid}`);
    }
  }

  const verify = crypto.createVerify("RSA-SHA256");
  verify.update(`${headerB64}.${payloadB64}`);

  const signatureBase64 = signatureB64
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const isSignatureValid = verify.verify(activeCert, signatureBase64, "base64");
  if (!isSignatureValid) {
    throw new Error("Signature verification failed. Token has been tampered with or corrupted.");
  }

  const now = Math.floor(Date.now() / 1000);

  if (!payloadJson.exp || typeof payloadJson.exp !== "number" || payloadJson.exp < now) {
    throw new Error(`Token has expired. Expired at: ${payloadJson.exp}, current time: ${now}`);
  }

  if (payloadJson.iat && payloadJson.iat > now + 300) {
    throw new Error("Token issued in the future (clock drift limit exceeded).");
  }

  if (payloadJson.aud !== projectId) {
    throw new Error(`Invalid audience claim. Expected: ${projectId}, Actual: ${payloadJson.aud}`);
  }

  if (payloadJson.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error(`Invalid issuer claim. Expected: https://securetoken.google.com/${projectId}, Actual: ${payloadJson.iss}`);
  }

  if (!payloadJson.sub || typeof payloadJson.sub !== "string" || !payloadJson.sub.trim()) {
    throw new Error("Missing or empty 'sub' (UID) claim in JWT payload.");
  }

  return {
    uid: payloadJson.sub,
    email: payloadJson.email,
    name: payloadJson.name || payloadJson.display_name,
  };
}

/**
 * Extracts, verifies Firebase ID Token, AND validates that the user's active session in Firestore matches.
 * Enforces single active session rule server-side. Fail-closed.
 */
export async function authenticateUserRequest(req: Request): Promise<DecodedTokenResult> {
  // STRICT RULE: Reject tokens passed via URL query parameters
  if (req.url) {
    try {
      const parsedUrl = new URL(req.url, "http://localhost");
      if (parsedUrl.searchParams.has("token") || parsedUrl.searchParams.has("bearer") || parsedUrl.searchParams.has("idToken") || parsedUrl.searchParams.has("authorization")) {
        throw new Error("REVOKED_SESSION: Query parameter tokens are prohibited.");
      }
    } catch (urlErr: any) {
      if (urlErr.message && urlErr.message.includes("REVOKED_SESSION")) {
        throw urlErr;
      }
    }
  }

  let idToken = "";
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    idToken = authHeader.split("Bearer ")[1].trim();
  }

  if (!idToken) {
    throw new Error("REVOKED_SESSION: Missing Firebase ID token in Authorization header.");
  }

  // 1. Verify Firebase ID Token first & derive UID exclusively from verified token
  let decoded: DecodedTokenResult;
  try {
    decoded = await verifyFirebaseIdToken(idToken);
  } catch (tokenErr: any) {
    throw new Error(`REVOKED_SESSION: ${tokenErr.message || "Invalid or expired Firebase ID token."}`);
  }

  const uid = decoded.uid;

  if (!uid) {
    throw new Error("REVOKED_SESSION: Invalid token: UID claim missing.");
  }

  // Allow mock uids strictly outside production environment
  if (process.env.NODE_ENV !== "production" && (uid === "mock-uid" || uid === "mock-admin-uid")) {
    return decoded;
  }

  // 2. Determine if this request is session establishment, registration finalization, PIN recovery, profile KYC, image upload, or wallet funding/status checkout
  let isSessionExempt = false;
  if (req.url) {
    try {
      const reqUrl = new URL(req.url, "http://localhost");
      const pName = reqUrl.pathname.toLowerCase();
      if (
        pName.includes("/api/auth/") ||
        pName.includes("/api/payments/") ||
        pName.includes("/api/profile/") ||
        pName.includes("/api/upload-image") ||
        pName.includes("/api/banks")
      ) {
        isSessionExempt = true;
      }
    } catch {
      const rawUrl = String(req.url).toLowerCase();
      if (
        rawUrl.includes("/api/auth/") ||
        rawUrl.includes("/api/payments/") ||
        rawUrl.includes("/api/profile/") ||
        rawUrl.includes("/api/upload-image") ||
        rawUrl.includes("/api/banks")
      ) {
        isSessionExempt = true;
      }
    }
  }

  // 3. For session, registration, and PIN recovery endpoints, pre-existing X-Session-ID is exempt.
  // For other protected endpoints, validate X-Session-ID if present or if activeSessionId is set on user document.
  if (!isSessionExempt) {
    const providedSessionId = req.headers.get("X-Session-ID") || req.headers.get("x-session-id");

    try {
      const userDoc = await adminDb.collection("users").doc(uid).get();
      if (userDoc.exists) {
        const activeSessionId = userDoc.data()?.activeSessionId;

        // If user document has an active session established, enforce X-Session-ID match
        if (activeSessionId) {
          if (!providedSessionId) {
            throw new Error("REVOKED_SESSION: Missing session ID header. You have been logged out on this device.");
          }
          if (providedSessionId !== activeSessionId) {
            throw new Error("REVOKED_SESSION: Provided session ID does not match active session ID.");
          }
        }
      }
    } catch (err: any) {
      if (err.message && err.message.includes("REVOKED_SESSION")) {
        throw err;
      }
      console.error(`[authenticateUserRequest Error] Session validation failed for ${uid}:`, err.message);
      throw new Error(`REVOKED_SESSION: Session validation error (${err.message}).`);
    }
  }

  return decoded;
}
