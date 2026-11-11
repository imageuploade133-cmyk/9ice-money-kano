import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { ensureEmailApiKeyOnGateway } from "@/lib/email-service";

function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 12) return key.slice(0, 4) + "*******";
  return key.slice(0, 10) + "...*******";
}

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "email_connect.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const { uid } = perm.auth;

    let emailApiUrl = process.env.EMAIL_API_URL || "https://whatsapp-b5os.onrender.com/api/email/send";
    let emailApiKey = process.env.EMAIL_API_KEY || process.env.WHATSAPP_API_KEY || "inst_33647102";
    let emailInstanceId = process.env.EMAIL_INSTANCE_ID || process.env.WHATSAPP_INSTANCE_ID || "inst_33647102";
    let emailAdminUsername = process.env.EMAIL_ADMIN_USERNAME || process.env.WHATSAPP_ADMIN_USERNAME || "";
    let senderName = "E-Global Pay";
    let senderEmail = "no-reply@eglobalpay.com";
    let status = "CONNECTED";
    let grantedScopes = ["email.send", "email.otp", "email.templates", "email.logs"];
    let dailyLimit = "2,000,000";
    let dailyUsed = 1;
    let lastActivity = new Date().toISOString();
    let apiKeysList: any[] = [];

    try {
      const docRef = adminDb.collection("config").doc("email_connect");
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const data = docSnap.data();
        if (data?.emailApiUrl) emailApiUrl = data.emailApiUrl;
        if (data?.emailApiKey) emailApiKey = data.emailApiKey;
        if (data?.emailInstanceId) emailInstanceId = data.emailInstanceId;
        if (data?.emailAdminUsername) emailAdminUsername = data.emailAdminUsername;
        if (data?.senderName) senderName = data.senderName;
        if (data?.senderEmail) senderEmail = data.senderEmail;
        if (data?.status) status = data.status;
        if (Array.isArray(data?.grantedScopes)) grantedScopes = data.grantedScopes;
        if (data?.dailyLimit) dailyLimit = data.dailyLimit;
        if (typeof data?.dailyUsed === "number") dailyUsed = data.dailyUsed;
        if (data?.lastActivity) lastActivity = data.lastActivity;
        if (Array.isArray(data?.apiKeys)) apiKeysList = data.apiKeys;
      }
    } catch (dbErr) {
      console.warn("[Email Connect GET] Firestore config/email_connect read failed:", dbErr);
    }

    // Default primary key entry if list is empty
    if (apiKeysList.length === 0) {
      apiKeysList = [
        {
          id: "key-primary-default",
          name: senderName || "Global Email Gateway Key",
          emailApiUrl,
          emailApiKeyMasked: maskApiKey(emailApiKey),
          emailInstanceId,
          senderName,
          senderEmail,
          status,
          grantedScopes,
          dailyLimit,
          dailyUsed,
          lastActivity,
          createdAt: new Date().toISOString(),
          isActive: status === "CONNECTED",
        },
      ];
    } else {
      apiKeysList = apiKeysList.map((k, idx) => ({
        ...k,
        id: k.id || `key-${idx + 1}`,
        emailApiKeyMasked: maskApiKey(k.emailApiKey || emailApiKey),
      }));
    }

    return NextResponse.json({
      success: true,
      config: {
        emailApiUrl,
        emailApiKeyMasked: maskApiKey(emailApiKey),
        hasApiKeyConfigured: Boolean(emailApiKey),
        emailInstanceId,
        emailAdminUsername,
        senderName,
        senderEmail,
        status,
        grantedScopes,
        dailyLimit,
        dailyUsed,
        lastActivity,
        apiKeys: apiKeysList,
      },
      isMock: uid === "mock-admin-uid",
    });
  } catch (err: any) {
    console.error("[Email Connect GET Error]:", err.message);
    return NextResponse.json({ error: "Unauthorized or backend error", details: err.message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "email_connect.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const { uid, email: adminEmail } = perm.auth;

    const body = await req.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: "Missing required parameter: action" }, { status: 400 });
    }

    // 0. CREATE NEW EMAIL API KEY
    if (action === "create_key") {
      const {
        keyName,
        emailApiUrl,
        emailApiKey,
        emailInstanceId,
        emailAdminUsername,
        emailAdminPassword,
        senderName,
        senderEmail,
        grantedScopes,
        dailyLimit,
      } = body;

      if (!emailApiKey || !String(emailApiKey).trim()) {
        return NextResponse.json({ error: "API Key is required to create a key entry." }, { status: 400 });
      }

      const newKeyId = `key-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const cleanKey = String(emailApiKey).trim();
      const cleanUrl = String(emailApiUrl || process.env.EMAIL_API_URL || "https://whatsapp-b5os.onrender.com/api/email/send").trim();
      const cleanInst = String(emailInstanceId || process.env.EMAIL_INSTANCE_ID || "inst_33647102").trim();

      const newKeyRecord = {
        id: newKeyId,
        name: keyName?.trim() || senderName?.trim() || "New Email API Key",
        emailApiUrl: cleanUrl,
        emailApiKey: cleanKey,
        emailApiKeyMasked: maskApiKey(cleanKey),
        emailInstanceId: cleanInst,
        emailAdminUsername: emailAdminUsername?.trim() || "",
        emailAdminPassword: emailAdminPassword?.trim() || "",
        senderName: senderName?.trim() || "E-Global Pay",
        senderEmail: senderEmail?.trim() || "no-reply@eglobalpay.com",
        status: "CONNECTED",
        grantedScopes: Array.isArray(grantedScopes) && grantedScopes.length > 0 ? grantedScopes : ["email.send", "email.otp", "email.templates", "email.logs"],
        dailyLimit: dailyLimit?.trim() || "2,000,000",
        dailyUsed: 0,
        lastActivity: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        isActive: true,
      };

      try {
        // Automatically ensure/provision the API key on the WhatsAPI HUB gateway database
        await ensureEmailApiKeyOnGateway({
          emailApiUrl: cleanUrl,
          emailApiKey: cleanKey,
          emailInstanceId: cleanInst,
          adminUsername: newKeyRecord.emailAdminUsername,
          adminPassword: newKeyRecord.emailAdminPassword,
          senderName: newKeyRecord.senderName,
        });

        const docRef = adminDb.collection("config").doc("email_connect");
        const docSnap = await docRef.get();
        let existingKeys: any[] = [];
        if (docSnap.exists && Array.isArray(docSnap.data()?.apiKeys)) {
          existingKeys = docSnap.data()!.apiKeys;
        }

        // Avoid duplicate exact keys
        const updatedKeys = [newKeyRecord, ...existingKeys.filter((k) => k.emailApiKey !== cleanKey)];

        await docRef.set(
          {
            emailApiUrl: cleanUrl,
            emailApiKey: cleanKey,
            emailInstanceId: cleanInst,
            senderName: newKeyRecord.senderName,
            senderEmail: newKeyRecord.senderEmail,
            status: "CONNECTED",
            apiKeys: updatedKeys,
            updatedAt: new Date().toISOString(),
            updatedBy: adminEmail || uid,
          },
          { merge: true }
        );

        await adminDb.collection("admin_audit_logs").add({
          action: "CREATE_EMAIL_API_KEY",
          performedBy: adminEmail || uid,
          details: { keyId: newKeyId, keyName: newKeyRecord.name, instanceId: cleanInst },
          timestamp: new Date().toISOString(),
        });

        return NextResponse.json({
          success: true,
          message: "New Email API Key created and connected successfully!",
          key: newKeyRecord,
          apiKeys: updatedKeys,
        });
      } catch (dbErr: any) {
        console.error("[Email Connect POST CreateKey] Exception:", dbErr.message);
        return NextResponse.json({ error: "Failed to create API key: " + dbErr.message }, { status: 500 });
      }
    }

    // DELETE EMAIL API KEY
    if (action === "delete_key") {
      const { keyId } = body;
      if (!keyId) {
        return NextResponse.json({ error: "Key ID is required for deletion." }, { status: 400 });
      }

      try {
        const docRef = adminDb.collection("config").doc("email_connect");
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const existingKeys = Array.isArray(docSnap.data()?.apiKeys) ? docSnap.data()!.apiKeys : [];
          const updatedKeys = existingKeys.filter((k: any) => k.id !== keyId);
          await docRef.set({ apiKeys: updatedKeys, updatedAt: new Date().toISOString() }, { merge: true });
        }

        return NextResponse.json({
          success: true,
          message: "Email API Key deleted successfully.",
        });
      } catch (dbErr: any) {
        return NextResponse.json({ error: "Failed to delete API key: " + dbErr.message }, { status: 500 });
      }
    }

    // TOGGLE INDIVIDUAL KEY STATUS
    if (action === "toggle_key_status") {
      const { keyId, newStatus } = body;
      if (!keyId) {
        return NextResponse.json({ error: "Key ID is required." }, { status: 400 });
      }

      try {
        const docRef = adminDb.collection("config").doc("email_connect");
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const existingKeys = Array.isArray(docSnap.data()?.apiKeys) ? docSnap.data()!.apiKeys : [];
          const updatedKeys = existingKeys.map((k: any) => {
            if (k.id === keyId) {
              const active = newStatus === "CONNECTED";
              return { ...k, status: active ? "CONNECTED" : "DISCONNECTED", isActive: active };
            }
            return k;
          });
          await docRef.set({ apiKeys: updatedKeys, updatedAt: new Date().toISOString() }, { merge: true });
        }

        return NextResponse.json({
          success: true,
          message: `Key status set to ${newStatus}`,
        });
      } catch (dbErr: any) {
        return NextResponse.json({ error: "Failed to update key status: " + dbErr.message }, { status: 500 });
      }
    }

    // 1. SAVE EMAIL CONNECT CONFIGURATION
    if (action === "save_config") {
      const {
        emailApiUrl,
        emailApiKey,
        emailInstanceId,
        emailAdminUsername,
        emailAdminPassword,
        senderName,
        senderEmail,
        grantedScopes,
        dailyLimit,
        status,
      } = body;

      const updateData: Record<string, any> = {
        emailApiUrl: String(emailApiUrl || "").trim(),
        emailInstanceId: String(emailInstanceId || "").trim(),
        senderName: String(senderName || "").trim(),
        senderEmail: String(senderEmail || "").trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: adminEmail || uid,
      };

      if (emailApiKey && String(emailApiKey).trim()) {
        updateData.emailApiKey = String(emailApiKey).trim();
      }

      if (emailAdminUsername && String(emailAdminUsername).trim()) {
        updateData.emailAdminUsername = String(emailAdminUsername).trim();
      }

      if (emailAdminPassword && String(emailAdminPassword).trim()) {
        updateData.emailAdminPassword = String(emailAdminPassword).trim();
      }

      if (Array.isArray(grantedScopes)) {
        updateData.grantedScopes = grantedScopes;
      }

      if (dailyLimit) {
        updateData.dailyLimit = String(dailyLimit).trim();
      }

      if (status) {
        updateData.status = status === "CONNECTED" ? "CONNECTED" : "DISCONNECTED";
      }

      try {
        await adminDb.collection("config").doc("email_connect").set(updateData, { merge: true });

        // Audit log entry
        await adminDb.collection("admin_audit_logs").add({
          action: "UPDATE_EMAIL_CONNECT_CONFIG",
          performedBy: adminEmail || uid,
          details: { emailApiUrl: updateData.emailApiUrl, emailInstanceId: updateData.emailInstanceId },
          timestamp: new Date().toISOString(),
        });

        return NextResponse.json({
          success: true,
          message: "Email Gateway API configuration saved successfully!",
        });
      } catch (dbErr: any) {
        console.error("[Email Connect POST SaveConfig] DB Write Exception:", dbErr.message);
        return NextResponse.json({ error: "Failed to save configuration: " + dbErr.message }, { status: 500 });
      }
    }

    // 2. TOGGLE STATUS (CONNECTED / DISCONNECTED)
    if (action === "toggle_status") {
      const { newStatus } = body;
      const targetStatus = newStatus === "CONNECTED" ? "CONNECTED" : "DISCONNECTED";

      await adminDb.collection("config").doc("email_connect").set(
        { status: targetStatus, updatedAt: new Date().toISOString() },
        { merge: true }
      );

      await adminDb.collection("admin_audit_logs").add({
        action: "TOGGLE_EMAIL_CONNECT_STATUS",
        performedBy: adminEmail || uid,
        details: { status: targetStatus },
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        status: targetStatus,
        message: `Email Gateway status set to ${targetStatus}`,
      });
    }

    // 3. TEST EMAIL GATEWAY CONNECTION DISPATCH
    if (action === "test_connection") {
      const { targetEmail, customSubject, customMessage } = body;

      if (!targetEmail || !targetEmail.trim()) {
        return NextResponse.json({ error: "Please provide a target recipient email address." }, { status: 400 });
      }

      const recipient = targetEmail.trim();
      const subject = customSubject?.trim() || "Email Gateway Connection Test - E-Global Pay";
      const messageBody = customMessage?.trim() || "This is a live test email sent from your E-Global Control Panel Email Gateway configuration tool.";

      // Read active configuration
      let targetApiUrl = process.env.EMAIL_API_URL || "https://whatsapp-b5os.onrender.com/api/email/send";
      let targetApiKey = process.env.EMAIL_API_KEY || process.env.WHATSAPP_API_KEY || "inst_33647102";
      let targetInstanceId = process.env.EMAIL_INSTANCE_ID || process.env.WHATSAPP_INSTANCE_ID || "inst_33647102";
      let targetAdminUsername = process.env.EMAIL_ADMIN_USERNAME || process.env.WHATSAPP_ADMIN_USERNAME || "";
      let targetAdminPassword = process.env.EMAIL_ADMIN_PASSWORD || process.env.WHATSAPP_ADMIN_PASSWORD || "";
      let targetSenderName = "E-Global Pay";
      let targetSenderEmail = "no-reply@eglobalpay.com";

      try {
        const docSnap = await adminDb.collection("config").doc("email_connect").get();
        if (docSnap.exists) {
          const data = docSnap.data();
          if (data?.emailApiUrl) targetApiUrl = data.emailApiUrl;
          if (data?.emailApiKey) targetApiKey = data.emailApiKey;
          if (data?.emailInstanceId) targetInstanceId = data.emailInstanceId;
          if (data?.emailAdminUsername) targetAdminUsername = data.emailAdminUsername;
          if (data?.emailAdminPassword) targetAdminPassword = data.emailAdminPassword;
          if (data?.senderName) targetSenderName = data.senderName;
          if (data?.senderEmail) targetSenderEmail = data.senderEmail;
        }
      } catch (err) {
        console.warn("[Email Connect Test] Config load warning:", err);
      }

      console.log(`[Email Connect Test] Dispatching test connection email to: ${recipient} via ${targetApiUrl}`);

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="display: inline-block; padding: 6px 16px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 20px; color: #15803d; font-size: 11px; font-weight: bold; text-transform: uppercase;">
              Email Gateway Test Verification
            </span>
          </div>
          <h2 style="color: #0f172a; font-size: 18px; font-weight: 800; text-align: center; margin-bottom: 8px;">
            ${targetSenderName} Connection Ping
          </h2>
          <p style="color: #475569; font-size: 13px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
            ${messageBody}
          </p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; p-16px; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 4px 0; font-size: 11px; color: #64748b; font-family: monospace;">
              <strong>Target Instance ID:</strong> ${targetInstanceId}
            </p>
            <p style="margin: 4px 0; font-size: 11px; color: #64748b; font-family: monospace;">
              <strong>API Endpoint:</strong> ${targetApiUrl}
            </p>
            <p style="margin: 4px 0; font-size: 11px; color: #64748b; font-family: monospace;">
              <strong>Dispatched At:</strong> ${new Date().toLocaleString()}
            </p>
          </div>
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
            Sent automatically by E-Global CPanel Email Connect Diagnostic System
          </p>
        </div>
      `;

      try {
        const buildHeaders = (key: string, sessionCookie?: string) => {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-API-Key": key,
            "x-api-key": key,
            "apikey": key,
            "Authorization": `Bearer ${key}`,
            "X-Instance-ID": targetInstanceId,
            "X-Email-ID": targetInstanceId,
            "X-Project-ID": targetInstanceId,
          };
          if (sessionCookie) {
            headers["Cookie"] = sessionCookie;
          }
          return headers;
        };

        const executeDispatch = async (keyToUse: string, cookieToUse?: string) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000);
          try {
            const res = await fetch(targetApiUrl, {
              method: "POST",
              headers: buildHeaders(keyToUse, cookieToUse),
              body: JSON.stringify({
                to: recipient,
                subject,
                html: htmlContent,
                text: messageBody,
                fromName: targetSenderName,
                fromEmail: targetSenderEmail,
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

        let apiRes = await executeDispatch(targetApiKey);

        let responseData: any = {};
        try {
          responseData = await apiRes.json();
        } catch {
          responseData = { rawText: await apiRes.text() };
        }

        // If 401 Unauthorized or API key error, attempt auto-provisioning key on WhatsAPI HUB gateway and retry
        const errTextStr = JSON.stringify(responseData);
        if (apiRes.status === 401 || apiRes.status === 403 || errTextStr.includes("Unauthorized") || errTextStr.includes("Invalid API Key")) {
          console.log("[Email Connect Test] Auth/Key error detected. Attempting to ensure/provision API key on WhatsAPI HUB gateway...");
          const createdOnGateway = await ensureEmailApiKeyOnGateway({
            emailApiUrl: targetApiUrl,
            emailApiKey: targetApiKey,
            emailInstanceId: targetInstanceId,
            adminUsername: targetAdminUsername,
            adminPassword: targetAdminPassword,
            senderName: targetSenderName,
          });

          if (createdOnGateway) {
            console.log("[Email Connect Test] API key provisioned on gateway. Retrying test dispatch...");
            apiRes = await executeDispatch(targetApiKey);
            try {
              responseData = await apiRes.json();
            } catch {
              responseData = { rawText: await apiRes.text() };
            }
          }

          // Fallback: Attempt session login if admin credentials are set
          if (!apiRes.ok && targetAdminUsername && targetAdminPassword) {
            console.log("[Email Connect Test] Attempting gateway admin session login fallback...");
            try {
              const urlObj = new URL(targetApiUrl);
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
                      username: targetAdminUsername,
                      email: targetAdminUsername,
                      password: targetAdminPassword,
                    }),
                  });

                  if (loginRes.ok) {
                    const setCookieHeader = loginRes.headers.get("set-cookie");
                    if (setCookieHeader) sessionCookie = setCookieHeader;

                    const loginData = await loginRes.json().catch(() => ({}));
                    acquiredToken = loginData.token || loginData.apiKey || loginData.key || loginData.accessToken || "";

                    console.log(`[Email Connect Test] Admin session login successful at ${ep}`);
                    break;
                  }
                } catch {}
              }

              if (acquiredToken || sessionCookie) {
                const retryKey = acquiredToken || targetApiKey;
                apiRes = await executeDispatch(retryKey, sessionCookie);
                try {
                  responseData = await apiRes.json();
                } catch {
                  responseData = { rawText: await apiRes.text() };
                }
              }
            } catch (loginErr: any) {
              console.warn("[Email Connect Test] Session login retry failed:", loginErr.message);
            }
          }
        }

        // Update last activity & increment count in Firestore + register/update tested key in apiKeys list
        try {
          const docRef = adminDb.collection("config").doc("email_connect");
          const docSnap = await docRef.get();
          let existingKeys: any[] = [];
          if (docSnap.exists && Array.isArray(docSnap.data()?.apiKeys)) {
            existingKeys = docSnap.data()!.apiKeys;
          }

          const existingKeyIndex = existingKeys.findIndex((k) => k.emailApiKey === targetApiKey);
          let updatedKeys = [...existingKeys];

          if (existingKeyIndex >= 0) {
            updatedKeys[existingKeyIndex] = {
              ...updatedKeys[existingKeyIndex],
              status: "CONNECTED",
              isActive: true,
              lastActivity: new Date().toISOString(),
              dailyUsed: (updatedKeys[existingKeyIndex].dailyUsed || 0) + 1,
            };
          } else {
            const newKeyRecord = {
              id: `key-${Date.now()}`,
              name: targetSenderName || "Connected Test Email Key",
              emailApiUrl: targetApiUrl,
              emailApiKey: targetApiKey,
              emailApiKeyMasked: maskApiKey(targetApiKey),
              emailInstanceId: targetInstanceId,
              emailAdminUsername: targetAdminUsername,
              emailAdminPassword: targetAdminPassword,
              senderName: targetSenderName,
              senderEmail: targetSenderEmail,
              status: "CONNECTED",
              grantedScopes: ["email.send", "email.otp", "email.templates", "email.logs"],
              dailyLimit: "2,000,000",
              dailyUsed: 1,
              lastActivity: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              isActive: true,
            };
            updatedKeys = [newKeyRecord, ...existingKeys];
          }

          await docRef.set(
            {
              lastActivity: new Date().toISOString(),
              dailyUsed: (body.dailyUsed || 0) + 1,
              status: "CONNECTED",
              apiKeys: updatedKeys,
            },
            { merge: true }
          );
        } catch (dbErr) {
          console.warn("[Email Connect Test] Status update warning:", dbErr);
        }

        await adminDb.collection("admin_audit_logs").add({
          action: "TEST_EMAIL_CONNECT_DISPATCH",
          performedBy: adminEmail || uid,
          details: { recipient, success: apiRes.ok, statusCode: apiRes.status },
          timestamp: new Date().toISOString(),
        });

        if (apiRes.ok) {
          return NextResponse.json({
            success: true,
            message: `Test email dispatched successfully to ${recipient}!`,
            recipient,
            details: responseData,
          });
        } else {
          return NextResponse.json({
            success: false,
            error: responseData.message || responseData.error || `Gateway returned HTTP ${apiRes.status}`,
            details: responseData,
          }, { status: 400 });
        }
      } catch (gateErr: any) {
        console.error("[Email Connect Test Dispatch Exception]:", gateErr.message);

        try {
          await adminDb.collection("config").doc("email_connect").set(
            { status: "DISCONNECTED", lastActivity: new Date().toISOString() },
            { merge: true }
          );
        } catch {}

        return NextResponse.json({
          success: false,
          error: `Email Gateway connection failed: ${gateErr.message}. Please verify endpoint URL and API Key.`,
          details: gateErr.message,
        }, { status: 502 });
      }
    }

    return NextResponse.json({ error: "Invalid action specified." }, { status: 400 });
  } catch (err: any) {
    console.error("[Email Connect POST Exception]:", err.message);
    return NextResponse.json({ error: "Operation failed", details: err.message }, { status: 500 });
  }
}
