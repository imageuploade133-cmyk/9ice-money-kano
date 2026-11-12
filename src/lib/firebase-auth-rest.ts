import crypto from "crypto";

let accessTokenCache: { token: string; expiresAt: number } | null = null;

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Sanitizes and cleans PEM RSA Private Key format strings for native Node.js crypto.
 */
export function cleanPrivateKey(key: string): string {
  if (!key) return "";
  let k = key.trim();

  // Strip wrapping outer quotes (single or double)
  while ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }

  // Replace literal backslash-n with real newlines and escaped quotes
  k = k.replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();

  // Look for standard PEM header and footer
  const headerMatch = k.match(/-----BEGIN [A-Z\s]+-----/);
  const footerMatch = k.match(/-----END [A-Z\s]+-----/);

  if (headerMatch && footerMatch) {
    const header = headerMatch[0];
    const footer = footerMatch[0];
    const bodyStart = k.indexOf(header) + header.length;
    const bodyEnd = k.indexOf(footer);
    const rawBody = k.substring(bodyStart, bodyEnd);

    // Keep only valid Base64 characters in body
    const cleanBody = rawBody.replace(/[^A-Za-z0-9+/=]/g, "");
    const chunkedBody = cleanBody.match(/.{1,64}/g)?.join("\n") || cleanBody;
    return `${header}\n${chunkedBody}\n${footer}`;
  }

  // If missing header/footer, assume raw base64 RSA private key string
  const cleanBody = k.replace(/[^A-Za-z0-9+/=]/g, "");
  const chunkedBody = cleanBody.match(/.{1,64}/g)?.join("\n") || cleanBody;
  return `-----BEGIN PRIVATE KEY-----\n${chunkedBody}\n-----END PRIVATE KEY-----`;
}

/**
 * Mint a Google Identity Toolkit OAuth2 Access Token using Node.js native crypto RSA-SHA256.
 * Zero external libraries (100% immune to jwks-rsa/jose ESM/CommonJS bundle conflicts).
 */
export async function getGoogleOAuth2AccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (accessTokenCache && accessTokenCache.expiresAt > now + 60) {
    return accessTokenCache.token;
  }

  let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      clientEmail = clientEmail || parsed.client_email;
      rawPrivateKey = rawPrivateKey || parsed.private_key;
    } catch (err: any) {
      console.warn("[getGoogleOAuth2AccessToken] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", err.message);
    }
  }

  if (!clientEmail || !rawPrivateKey) {
    throw new Error("Missing FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY environment variables.");
  }

  const privateKey = cleanPrivateKey(rawPrivateKey);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform",
  };

  const unsignedToken = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  const signatureBase64 = signer.sign(privateKey, "base64");
  const signedJwt = `${unsignedToken}.${signatureBase64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });

  const data = await res.json();

  if (!res.ok || !data.access_token) {
    throw new Error(`Google OAuth2 Token Exchange Error: ${data.error_description || data.error || res.statusText}`);
  }

  accessTokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  };

  return data.access_token;
}

/**
 * Creates a new user in Firebase Authentication using Google's Identity Toolkit v1 REST API.
 */
export async function createFirebaseAuthUser(params: {
  email: string;
  password?: string;
  displayName?: string;
}): Promise<{ uid: string }> {
  const token = await getGoogleOAuth2AccessToken();
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "e-tech-global-hub";

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      email: params.email,
      password: params.password,
      displayName: params.displayName,
      emailVerified: true,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.localId) {
    throw new Error(data.error?.message || "Failed to create user in Firebase Authentication REST API.");
  }

  return { uid: data.localId };
}

/**
 * Sets Custom Claims on a user account using Google's Identity Toolkit v1 REST API.
 */
export async function setFirebaseAuthCustomClaims(uid: string, customClaims: Record<string, any>): Promise<void> {
  const token = await getGoogleOAuth2AccessToken();
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "e-tech-global-hub";

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:${uid}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      customAttributes: JSON.stringify(customClaims),
    }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error?.message || "Failed to set custom claims via Identity Toolkit REST API.");
  }
}

/**
 * Updates user account properties (such as password or display name) in Firebase Authentication using Google's Identity Toolkit v1 REST API.
 */
export async function updateFirebaseAuthUser(uid: string, params: { password?: string; displayName?: string; phoneNumber?: string }): Promise<void> {
  const token = await getGoogleOAuth2AccessToken();
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "e-tech-global-hub";

  const bodyPayload: any = {};
  if (params.password) bodyPayload.password = params.password;
  if (params.displayName) bodyPayload.displayName = params.displayName;
  if (params.phoneNumber) bodyPayload.phoneNumber = params.phoneNumber;

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:${uid}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error?.message || "Failed to update user in Firebase Authentication REST API.");
  }
}

/**
 * Convenience helper to update a user's password in Firebase Authentication.
 */
export async function updateFirebaseAuthPassword(uid: string, password: string): Promise<void> {
  return updateFirebaseAuthUser(uid, { password });
}

/**
 * Lookup Firebase Auth User by Email using Google's Identity Toolkit v1 REST API.
 */
export async function getFirebaseAuthUserByEmail(email: string): Promise<{ uid: string } | null> {
  const token = await getGoogleOAuth2AccessToken();
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "e-tech-global-hub";

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      email: [email],
    }),
  });

  const data = await res.json();
  if (res.ok && Array.isArray(data.users) && data.users.length > 0) {
    return { uid: data.users[0].localId };
  }

  return null;
}

/**
 * Lookup Firebase Auth User by UID using Google's Identity Toolkit v1 REST API.
 */
export async function getFirebaseAuthUserByUid(uid: string): Promise<{ uid: string; email?: string; displayName?: string; phoneNumber?: string } | null> {
  if (!uid) return null;
  try {
    const token = await getGoogleOAuth2AccessToken();
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "e-tech-global-hub";

    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        localId: [uid],
      }),
    });

    const data = await res.json();
    if (res.ok && Array.isArray(data.users) && data.users.length > 0) {
      const u = data.users[0];
      return {
        uid: u.localId,
        email: u.email,
        displayName: u.displayName,
        phoneNumber: u.phoneNumber,
      };
    }
  } catch (err: any) {
    console.warn(`[getFirebaseAuthUserByUid] Error looking up uid ${uid}:`, err.message);
  }

  return null;
}

/**
 * Verifies a user's password in Firebase Authentication using Google's Identity Toolkit signInWithPassword REST API.
 */
export async function verifyUserPasswordWithREST(email: string, password: string): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing FIREBASE_API_KEY environment variable.");
  }

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  const data = await res.json();
  if (res.ok && data.idToken) {
    return true;
  }
  return false;
}

/**
 * Deletes a user account in Firebase Authentication using Google's Identity Toolkit v1 REST API.
 */
export async function deleteFirebaseAuthUser(uid: string): Promise<void> {
  const token = await getGoogleOAuth2AccessToken();
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "e-tech-global-hub";

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      localId: uid,
    }),
  });

  if (!res.ok) {
    const data = await res.json();
    console.warn(`[deleteFirebaseAuthUser] Warning deleting user ${uid}:`, data.error?.message);
  }
}
