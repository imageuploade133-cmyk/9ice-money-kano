import { adminDb } from "@/lib/firebase-admin";
import { CommunicationBrandingConfig, DEFAULT_COMMUNICATION_BRANDING, renderTemplateVariables } from "@/lib/communication-defaults";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64 string
    contentType?: string;
  }>;
}

// 5-Minute In-Memory Server Cache for System Configs to minimize Firestore Reads
let cachedEmailConfig: { data: any; expiresAt: number } | null = null;
let cachedBrandingConfig: { data: any; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minutes

async function getCachedEmailGatewayConfig() {
  const now = Date.now();
  if (cachedEmailConfig && cachedEmailConfig.expiresAt > now) {
    return cachedEmailConfig.data;
  }

  let configData: any = null;
  try {
    const emailConnectDoc = await adminDb.collection("config").doc("email_connect").get();
    if (emailConnectDoc.exists) {
      configData = emailConnectDoc.data();
    } else {
      const whatsappApiDoc = await adminDb.collection("config").doc("whatsapp_api").get();
      if (whatsappApiDoc.exists) {
        configData = whatsappApiDoc.data();
      }
    }
  } catch (err: any) {
    console.warn("[getCachedEmailGatewayConfig] Firestore lookup warning:", err.message);
  }

  cachedEmailConfig = { data: configData, expiresAt: now + CACHE_TTL_MS };
  return configData;
}

async function getCachedBrandingConfig() {
  const now = Date.now();
  if (cachedBrandingConfig && cachedBrandingConfig.expiresAt > now) {
    return cachedBrandingConfig.data;
  }

  let brandingData: any = null;
  try {
    const docSnap = await adminDb.collection("config").doc("communication_branding").get();
    if (docSnap.exists) {
      brandingData = docSnap.data();
    }
  } catch (err: any) {
    console.warn("[getCachedBrandingConfig] Firestore lookup warning:", err.message);
  }

  cachedBrandingConfig = { data: brandingData, expiresAt: now + CACHE_TTL_MS };
  return brandingData;
}

/**
 * Ensures an Email API key and Instance ID are registered on the WhatsAPI HUB gateway database.
 * Uses customSecret and customId to re-create/provision pre-existing keys (e.g. after database resets).
 */
export async function ensureEmailApiKeyOnGateway(params: {
  emailApiUrl: string;
  emailApiKey: string;
  emailInstanceId: string;
  adminUsername?: string;
  adminPassword?: string;
  senderName?: string;
}): Promise<boolean> {
  const { emailApiUrl, emailApiKey, emailInstanceId, adminUsername, adminPassword, senderName } = params;

  if (!emailApiKey || !emailApiUrl) return false;

  try {
    const urlObj = new URL(emailApiUrl);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    const createApiKeyEndpoint = `${baseUrl}/api/email/apikeys`;

    const createBody = {
      name: senderName || "E-Global Pay Gateway Key",
      customSecret: emailApiKey,
      customId: emailInstanceId || emailApiKey,
      scopes: ["email.send", "email.otp", "email.templates", "email.logs"],
      daily_quota: 2000000,
    };

    const sendCreateReq = async (cookie?: string, token?: string) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (cookie) headers["Cookie"] = cookie;
      if (token) headers["Authorization"] = `Bearer ${token}`;

      return await fetch(createApiKeyEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(createBody),
      });
    };

    const res = await sendCreateReq();

    if (res.ok) {
      console.log(`[ensureEmailApiKeyOnGateway] Successfully registered API key ${emailApiKey} on gateway.`);
      return true;
    }

    // If 401 Unauthorized, attempt gateway admin session login first
    if ((res.status === 401 || res.status === 403) && adminUsername && adminPassword) {
      console.log("[ensureEmailApiKeyOnGateway] Auth required. Attempting gateway admin session login...");
      const loginEndpoints = [`${baseUrl}/api/auth/login`, `${baseUrl}/auth/login`, `${baseUrl}/api/login`, `${baseUrl}/login`];

      let sessionCookie = "";
      let acquiredToken = "";

      for (const ep of loginEndpoints) {
        try {
          const loginRes = await fetch(ep, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: adminUsername,
              email: adminUsername,
              password: adminPassword,
            }),
          });

          if (loginRes.ok) {
            const setCookieHeader = loginRes.headers.get("set-cookie");
            if (setCookieHeader) sessionCookie = setCookieHeader;

            const loginData = await loginRes.json().catch(() => ({}));
            acquiredToken = loginData.token || loginData.apiKey || loginData.key || loginData.accessToken || "";
            break;
          }
        } catch {}
      }

      if (acquiredToken || sessionCookie) {
        const retryRes = await sendCreateReq(sessionCookie, acquiredToken);
        if (retryRes.ok) {
          console.log(`[ensureEmailApiKeyOnGateway] Registered API key ${emailApiKey} via admin session.`);
          return true;
        }
      }
    }

    return false;
  } catch (err: any) {
    console.warn("[ensureEmailApiKeyOnGateway] Exception registering API key on gateway:", err.message);
    return false;
  }
}

/**
 * Server-side Email Service calling the WhatsAPI Email API Gateway.
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  let emailApiUrl = process.env.EMAIL_API_URL || "https://whatsapp-b5os.onrender.com/api/email/send";
  let apiKey = process.env.EMAIL_API_KEY || process.env.WHATSAPP_API_KEY || "inst_33647102";
  let instanceId = process.env.EMAIL_INSTANCE_ID || process.env.WHATSAPP_INSTANCE_ID || "inst_33647102";
  let adminUsername = process.env.EMAIL_ADMIN_USERNAME || process.env.WHATSAPP_ADMIN_USERNAME || "";
  let adminPassword = process.env.EMAIL_ADMIN_PASSWORD || process.env.WHATSAPP_ADMIN_PASSWORD || "";
  let senderName = "E-Global Pay";
  let senderEmail = "no-reply@eglobalpay.com";

  // Fetch dynamic Email Gateway credentials using 5-minute in-memory cache
  const data = await getCachedEmailGatewayConfig();
  if (data) {
    if (data.emailApiUrl) emailApiUrl = data.emailApiUrl;
    if (data.whatsappApiUrl && !data.emailApiUrl) {
      emailApiUrl = data.whatsappApiUrl.includes("/api/email")
        ? data.whatsappApiUrl
        : `${data.whatsappApiUrl.replace(/\/$/, "")}/api/email/send`;
    }
    if (data.emailApiKey) apiKey = data.emailApiKey;
    else if (data.whatsappApiKey) apiKey = data.whatsappApiKey;

    if (data.emailInstanceId) instanceId = data.emailInstanceId;
    else if (data.whatsappInstanceId) instanceId = data.whatsappInstanceId;

    if (data.emailAdminUsername) adminUsername = data.emailAdminUsername;
    else if (data.whatsappAdminUsername) adminUsername = data.whatsappAdminUsername;

    if (data.emailAdminPassword) adminPassword = data.emailAdminPassword;
    else if (data.whatsappAdminPassword) adminPassword = data.whatsappAdminPassword;

    if (data.senderName) senderName = data.senderName;
    if (data.senderEmail) senderEmail = data.senderEmail;
  }

  const buildHeaders = (keyToUse: string, cookieToUse?: string) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": keyToUse,
      "x-api-key": keyToUse,
      "apikey": keyToUse,
      "Authorization": `Bearer ${keyToUse}`,
      "X-Instance-ID": instanceId,
      "X-Email-ID": instanceId,
      "X-Project-ID": instanceId,
    };
    if (cookieToUse) {
      headers["Cookie"] = cookieToUse;
    }
    return headers;
  };

  const dispatch = async (keyToUse: string, cookieToUse?: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(emailApiUrl, {
        method: "POST",
        headers: buildHeaders(keyToUse, cookieToUse),
        body: JSON.stringify({
          to: params.to,
          subject: params.subject,
          html: params.html,
          text: params.text || "",
          replyTo: params.replyTo || "",
          fromName: senderName,
          fromEmail: senderEmail,
          attachments: (params.attachments || []).map((att) => ({
            filename: att.filename,
            name: att.filename,
            content: att.content,
            encoding: "base64",
            type: att.contentType || "application/pdf",
            contentType: att.contentType || "application/pdf",
          })),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res;
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  };

  try {
    const res = await dispatch(apiKey);

    if (res.ok) {
      return true;
    }

    const errText = await res.text();

    // If 401 / Unauthorized or key not found occurs, attempt auto-creation on gateway and retry
    if (res.status === 401 || res.status === 403 || errText.includes("Unauthorized") || errText.includes("Invalid API Key")) {
      console.log("[sendEmail] Auth failure detected. Attempting to ensure/provision Email API key on gateway...");
      const createdOnGateway = await ensureEmailApiKeyOnGateway({
        emailApiUrl,
        emailApiKey: apiKey,
        emailInstanceId: instanceId,
        adminUsername,
        adminPassword,
        senderName,
      });

      if (createdOnGateway) {
        console.log("[sendEmail] API key auto-provisioned on gateway. Retrying email dispatch...");
        const retryRes = await dispatch(apiKey);
        if (retryRes.ok) return true;
      }

      // Fallback: Retry with admin session authentication if credentials are available
      if (adminUsername && adminPassword) {
        console.log("[sendEmail] Attempting gateway admin session login fallback...");
        try {
          const urlObj = new URL(emailApiUrl);
          const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
          const loginEndpoints = [`${baseUrl}/api/auth/login`, `${baseUrl}/auth/login`, `${baseUrl}/api/login`, `${baseUrl}/login`];

          let sessionCookie = "";
          let acquiredToken = "";

          for (const ep of loginEndpoints) {
            try {
              const loginRes = await fetch(ep, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  username: adminUsername,
                  email: adminUsername,
                  password: adminPassword,
                }),
              });

              if (loginRes.ok) {
                const setCookieHeader = loginRes.headers.get("set-cookie");
                if (setCookieHeader) sessionCookie = setCookieHeader;

                const loginData = await loginRes.json().catch(() => ({}));
                acquiredToken = loginData.token || loginData.apiKey || loginData.key || loginData.accessToken || "";
                console.log(`[sendEmail] Gateway admin login succeeded at ${ep}`);
                break;
              }
            } catch {}
          }

          if (acquiredToken || sessionCookie) {
            const retryRes = await dispatch(acquiredToken || apiKey, sessionCookie);
            if (retryRes.ok) return true;
          }
        } catch (loginErr: any) {
          console.warn("[sendEmail] Session retry exception:", loginErr.message);
        }
      }
    }

    console.warn(`[sendEmail] Dispatch failed with status ${res.status}:`, errText);
    return false;
  } catch (err: any) {
    console.error("[sendEmail] Exception dispatching email:", err.message);
    return false;
  }
}

/**
 * Sends welcome email to newly registered user using customized communication branding template.
 */
export async function sendWelcomeEmail(toEmail: string, userName?: string): Promise<boolean> {
  try {
    let config = { ...DEFAULT_COMMUNICATION_BRANDING };
    const stored = await getCachedBrandingConfig();
    if (stored) {
      config = {
        sender: { ...DEFAULT_COMMUNICATION_BRANDING.sender, ...(stored.sender || {}) },
        emailOtp: { ...DEFAULT_COMMUNICATION_BRANDING.emailOtp, ...(stored.emailOtp || {}) },
        whatsappOtp: { ...DEFAULT_COMMUNICATION_BRANDING.whatsappOtp, ...(stored.whatsappOtp || {}) },
        welcomeEmail: { ...DEFAULT_COMMUNICATION_BRANDING.welcomeEmail, ...(stored.welcomeEmail || {}) },
      };
    }

    const tpl = config.welcomeEmail;
    const brandName = config.sender.senderName || "E-Global Pay";
    const name = userName || "Valued Customer";
    const replyTo = config.sender.replyToEmail || config.sender.senderEmail;

    const subject = renderTemplateVariables(tpl.subject, { brandName, name, email: toEmail });

    const logoHtml = tpl.logoUrl || config.sender.logoUrl
      ? `<img src="${tpl.logoUrl || config.sender.logoUrl}" alt="${brandName}" style="max-height: 48px; width: auto; margin-bottom: 16px;" />`
      : `<h2 style="color: ${tpl.primaryColor || "#FC7A00"}; margin: 0 0 16px 0;">${brandName}</h2>`;

    const bannerHtml = tpl.bannerUrl
      ? `<div style="margin-bottom: 20px; text-align: center;"><img src="${tpl.bannerUrl}" alt="Banner" style="max-width: 100%; border-radius: 12px;" /></div>`
      : "";

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
        <div style="text-align: center;">${logoHtml}</div>
        ${bannerHtml}
        <h1 style="color: #1a202c; font-size: 20px; font-weight: 800; text-align: center; margin-bottom: 12px;">${renderTemplateVariables(tpl.heading, { brandName, name })}</h1>
        <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">${renderTemplateVariables(tpl.greeting, { name })}</p>
        <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">${renderTemplateVariables(tpl.welcomeMessage, { brandName, name, email: toEmail })}</p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${tpl.ctaButtonUrl || "#"}" style="background-color: ${tpl.primaryColor || "#FC7A00"}; color: #ffffff; padding: 12px 28px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 10px; display: inline-block;">${tpl.ctaButtonText || "Access Wallet Dashboard"}</a>
        </div>
        <hr style="border: none; border-top: 1px solid #edf2f7; margin: 24px 0;" />
        <p style="color: #a0aec0; font-size: 11px; text-align: center; margin: 0;">${tpl.footer || config.sender.footerText}</p>
      </div>
    `;

    return await sendEmail({
      to: toEmail,
      subject,
      html: htmlBody,
      replyTo,
    });
  } catch (err: any) {
    console.error("[sendWelcomeEmail] Failed to send welcome email:", err.message);
    return false;
  }
}
