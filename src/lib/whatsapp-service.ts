import { adminDb } from "@/lib/firebase-admin";

export interface WhatsappConfig {
  apiUrl: string;
  apiKey: string;
  instanceId: string;
  adminUsername?: string;
  adminPassword?: string;
}

// In-memory lock to prevent duplicate concurrent actions
let isActionInFlight = false;
let lastActionTime = 0;
let vmSessionCookie = "";

// 5-Minute In-Memory Server Cache for WhatsApp Config to minimize Firestore Reads
let cachedWhatsappConfig: { data: WhatsappConfig; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minutes

/**
 * Ensures an active session cookie with the WhatsApp API VM.
 */
async function ensureVmSessionCookie(config: WhatsappConfig): Promise<string> {
  if (vmSessionCookie) return vmSessionCookie;
  if (!config.adminUsername || !config.adminPassword) return "";

  try {
    const loginUrl = `${config.apiUrl}/api/login`;
    const res = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: config.adminUsername,
        password: config.adminPassword,
      }),
      cache: "no-store",
    });

    if (res.ok) {
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) {
        vmSessionCookie = setCookie.split(";")[0];
        return vmSessionCookie;
      }
    }
  } catch (err: any) {
    console.warn("[ensureVmSessionCookie] VM Login failed:", err.message);
  }
  return "";
}

/**
 * Resolves server-side WhatsApp environment configuration.
 * Uses 5-minute in-memory cache to prevent repetitive Firestore reads on every message/OTP dispatch.
 */
export async function getWhatsappServerConfig(): Promise<WhatsappConfig> {
  const now = Date.now();
  if (cachedWhatsappConfig && cachedWhatsappConfig.expiresAt > now) {
    return cachedWhatsappConfig.data;
  }

  let apiUrl = (process.env.WHATSAPP_API_URL || "https://whatsapp-b5os.onrender.com").replace(/\/+$/, "");
  let apiKey = process.env.WHATSAPP_API_KEY || "";
  let instanceId = process.env.WHATSAPP_INSTANCE_ID || "default";
  let adminUsername = process.env.WHATSAPP_ADMIN_USERNAME || "admin";
  let adminPassword = process.env.WHATSAPP_ADMIN_PASSWORD || "";

  try {
    const docSnap = await adminDb.collection("config").doc("whatsapp_api").get();
    if (docSnap.exists) {
      const data = docSnap.data() || {};
      if (data.whatsappApiUrl) apiUrl = data.whatsappApiUrl.replace(/\/+$/, "");
      if (data.whatsappApiKey) apiKey = data.whatsappApiKey;
      if (data.whatsappInstanceId) instanceId = data.whatsappInstanceId;
      if (data.whatsappAdminUsername) adminUsername = data.whatsappAdminUsername;
      if (data.whatsappAdminPassword) adminPassword = data.whatsappAdminPassword;
    }
  } catch (err: any) {
    console.warn("[getWhatsappServerConfig] Firestore config lookup warning:", err.message);
  }

  const resolvedConfig: WhatsappConfig = { apiUrl, apiKey, instanceId, adminUsername, adminPassword };
  cachedWhatsappConfig = { data: resolvedConfig, expiresAt: now + CACHE_TTL_MS };
  return resolvedConfig;
}

/**
 * Write to CPanel admin audit logs for security tracking.
 */
export async function logWhatsappAdminAudit(adminUid: string, adminEmail: string, action: string, details?: any) {
  try {
    await adminDb.collection("admin_audit_logs").add({
      adminUid,
      adminEmail: adminEmail || "admin",
      action,
      details: details || {},
      category: "whatsapp",
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn("[logWhatsappAdminAudit] Failed to record audit log:", err.message);
  }
}

/**
 * Executes a server-side fetch call to the WhatsApp API backend.
 * Secrets (apiKey, basic auth) are attached in server headers and NEVER returned.
 */
export async function callWhatsappBackend(
  endpointPath: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  body?: any,
  timeoutMs: number = 10000
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const config = await getWhatsappServerConfig();

  if (!config.apiUrl) {
    return { ok: false, status: 500, error: "WHATSAPP_API_URL is not configured on server." };
  }

  const cleanPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  const pathWithApi = cleanPath.startsWith("/api/") ? cleanPath : `/api${cleanPath}`;
  const pathWithoutApi = cleanPath.startsWith("/api/") ? cleanPath.replace(/^\/api/, "") : cleanPath;

  const targetUrl = `${config.apiUrl}${pathWithApi}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiKey) {
    headers["X-API-Key"] = config.apiKey;
  }

  if (config.instanceId) {
    headers["X-Instance-ID"] = config.instanceId;
  }

  const sessionCookie = await ensureVmSessionCookie(config);
  if (sessionCookie) {
    headers["Cookie"] = sessionCookie;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(targetUrl, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    let resData: any = null;
    const text = await response.text();
    if (text) {
      try {
        resData = JSON.parse(text);
      } catch {
        resData = { textResponse: text };
      }
    }

    // If 404 "Instance not found", auto-create instance on VM and retry
    if (response.status === 404 && resData?.error?.includes("not found")) {
      console.log(`[callWhatsappBackend] Instance '${config.instanceId}' not found on VM. Auto-creating instance...`);
      try {
        const createRes = await fetch(`${config.apiUrl}/api/instances`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: config.instanceId,
            id: config.instanceId,
            apiKey: config.apiKey,
          }),
          cache: "no-store",
        });

        if (createRes.ok || createRes.status === 200 || createRes.status === 201) {
          console.log(`[callWhatsappBackend] Instance '${config.instanceId}' auto-created. Retrying action...`);
          const retryRes = await fetch(targetUrl, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            cache: "no-store",
          });
          const retryText = await retryRes.text();
          let retryData: any = null;
          if (retryText) {
            try { retryData = JSON.parse(retryText); } catch { retryData = { textResponse: retryText }; }
          }
          if (retryRes.ok) {
            return { ok: true, status: retryRes.status, data: retryData };
          }
        }
      } catch (createErr: any) {
        console.warn("[callWhatsappBackend] Auto-create instance attempt failed:", createErr.message);
      }
    }

    if (response.status === 404 && typeof resData?.textResponse === "string" && resData.textResponse.includes("Cannot")) {
      // Endpoint with /api prefix was 404. Attempt non-api fallback endpoint URL
      const fallbackUrl = `${config.apiUrl}${pathWithoutApi}`;
      try {
        const fallbackRes = await fetch(fallbackUrl, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          cache: "no-store",
        });
        let fallbackData: any = null;
        const fbText = await fallbackRes.text();
        if (fbText) {
          try { fallbackData = JSON.parse(fbText); } catch { fallbackData = { textResponse: fbText }; }
        }
        if (fallbackRes.ok) {
          return { ok: true, status: fallbackRes.status, data: fallbackData };
        }
      } catch {
        // Ignore fallback fetch error
      }
    }

    if (!response.ok) {
      const errMsg = resData?.message || resData?.error || `WhatsApp API returned HTTP ${response.status}`;
      return { ok: false, status: response.status, data: resData, error: errMsg };
    }

    return { ok: true, status: response.status, data: resData };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { ok: false, status: 504, error: "WhatsApp API connection timed out." };
    }
    return { ok: false, status: 502, error: err.message || "Failed to communicate with WhatsApp API server." };
  }
}

/**
 * Acquire concurrency lock for connect/reconnect/disconnect actions to prevent duplicate requests.
 */
export function acquireWhatsappActionLock(): boolean {
  const now = Date.now();
  // Clear stale lock if older than 15 seconds
  if (isActionInFlight && now - lastActionTime > 15000) {
    isActionInFlight = false;
  }

  if (isActionInFlight) {
    return false;
  }

  isActionInFlight = true;
  lastActionTime = now;
  return true;
}

export function releaseWhatsappActionLock() {
  isActionInFlight = false;
}

/**
 * Formats a raw QR data payload into a valid image URL for <img src="...">.
 * Handles base64 data URIs, raw base64 images, and raw WhatsApp pairing strings (e.g. "1@...", "2@...").
 */
export function formatQrCodePayload(qrData: string | null | undefined): string | null {
  if (!qrData) return null;
  const str = String(qrData).trim();
  if (!str) return null;

  // 1. If already a data URI (e.g. data:image/png;base64,...)
  if (str.startsWith("data:image/")) {
    return str;
  }

  // 2. If raw base64 image string (starts with common image base64 headers)
  // iVBORw0KGgo = PNG, /9j/ = JPG, R0lGOD = GIF, PHN2Zw = SVG
  if (/^(iVBORw0KGgo|\/9j\/|R0lGOD|PHN2Zw)/.test(str)) {
    return `data:image/png;base64,${str}`;
  }

  // 3. Otherwise, qrData is a raw WhatsApp connection string (e.g. "1@...", "2@...")
  // Generate a QR code image encoding the exact raw string using api.qrserver.com
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(str)}`;
}
