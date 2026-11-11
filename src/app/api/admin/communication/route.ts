import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import {
  CommunicationBrandingConfig,
  DEFAULT_COMMUNICATION_BRANDING,
  renderTemplateVariables,
} from "@/lib/communication-defaults";
import { sendEmail } from "@/lib/email-service";
import { callWhatsappBackend } from "@/lib/whatsapp-service";

function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function sanitizeText(str?: string | null): string {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/onerror=/gi, "")
    .replace(/onload=/gi, "");
}

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "communication.branding.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    let config = { ...DEFAULT_COMMUNICATION_BRANDING };
    try {
      const docSnap = await adminDb.collection("config").doc("communication_branding").get();
      if (docSnap.exists) {
        const stored = docSnap.data() as Partial<CommunicationBrandingConfig>;
        config = {
          sender: { ...DEFAULT_COMMUNICATION_BRANDING.sender, ...(stored.sender || {}) },
          emailOtp: { ...DEFAULT_COMMUNICATION_BRANDING.emailOtp, ...(stored.emailOtp || {}) },
          whatsappOtp: { ...DEFAULT_COMMUNICATION_BRANDING.whatsappOtp, ...(stored.whatsappOtp || {}) },
          welcomeEmail: { ...DEFAULT_COMMUNICATION_BRANDING.welcomeEmail, ...(stored.welcomeEmail || {}) },
          updatedAt: stored.updatedAt,
          updatedBy: stored.updatedBy,
        };
      }
    } catch (err: any) {
      console.warn("[Admin Communication GET] Config fetch error, returning defaults:", err.message);
    }

    return NextResponse.json({ success: true, config });
  } catch (err: any) {
    console.error("[Admin Communication GET Exception]:", err.message);
    return NextResponse.json({ error: "Unauthorized or server exception", details: err.message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "communication.branding.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const adminEmail = perm.auth?.email || "admin";
    const body = await req.json();
    const action = body.action || "update_config";

    if (action === "reset_defaults") {
      const resetConfig: CommunicationBrandingConfig = {
        ...DEFAULT_COMMUNICATION_BRANDING,
        updatedAt: new Date().toISOString(),
        updatedBy: adminEmail,
      };

      await adminDb.collection("config").doc("communication_branding").set(resetConfig);

      await adminDb.collection("admin_audit_logs").add({
        action: "reset_communication_branding_defaults",
        adminEmail,
        createdAt: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        message: "Communication and template branding settings reset to defaults!",
        config: resetConfig,
      });
    }

    if (action === "send_test_email" || action === "send_test") {
      const { recipientEmail, recipientPhone, templateType, channel = "email" } = body;

      let config = { ...DEFAULT_COMMUNICATION_BRANDING };
      const docSnap = await adminDb.collection("config").doc("communication_branding").get();
      if (docSnap.exists) {
        const stored = docSnap.data() as Partial<CommunicationBrandingConfig>;
        config = {
          sender: { ...DEFAULT_COMMUNICATION_BRANDING.sender, ...(stored.sender || {}) },
          emailOtp: { ...DEFAULT_COMMUNICATION_BRANDING.emailOtp, ...(stored.emailOtp || {}) },
          whatsappOtp: { ...DEFAULT_COMMUNICATION_BRANDING.whatsappOtp, ...(stored.whatsappOtp || {}) },
          welcomeEmail: { ...DEFAULT_COMMUNICATION_BRANDING.welcomeEmail, ...(stored.welcomeEmail || {}) },
        };
      }

      const brandName = config.sender.senderName || config.whatsappOtp.brandName || "E-Global Pay";

      // WHATSAPP TEST DISPATCH
      if (channel === "whatsapp" || templateType === "whatsapp_otp" || templateType === "whatsapp_text") {
        const targetPhone = (recipientPhone || recipientEmail || "").replace(/\D/g, "");
        if (!targetPhone || targetPhone.length < 8) {
          return NextResponse.json({ error: "Please enter a valid recipient phone number for WhatsApp test dispatch." }, { status: 400 });
        }

        const fullNum = targetPhone.length === 10 || targetPhone.startsWith("0")
          ? `234${targetPhone.startsWith("0") ? targetPhone.slice(1) : targetPhone}`
          : targetPhone;

        const isBoldOtp = config.whatsappOtp.boldOtp !== false;
        const formattedOtp = isBoldOtp ? "*987654*" : "987654";

        const waText = renderTemplateVariables(config.whatsappOtp.messageTemplate, {
          name: "Valued Administrator",
          brandName,
          otp: formattedOtp,
          expiryMinutes: 10,
        });

        let waRes: any;
        const bannerUrl = (config.whatsappOtp.bannerUrl || "").trim();

        if (bannerUrl) {
          // Attempt sending media with banner image via WhatsApp gateway
          waRes = await callWhatsappBackend("/send/media", "POST", {
            number: fullNum,
            mediaUrl: bannerUrl,
            image: bannerUrl,
            url: bannerUrl,
            caption: waText,
            message: waText,
          });

          if (!waRes.ok) {
            // Fallback to text message with banner link
            waRes = await callWhatsappBackend("/send/text", "POST", {
              number: fullNum,
              message: `${waText}\n\n${bannerUrl}`,
            });
          }
        } else {
          waRes = await callWhatsappBackend("/send/text", "POST", {
            number: fullNum,
            message: waText,
          });
        }

        if (!waRes.ok) {
          return NextResponse.json(
            { error: waRes.error || "Failed to dispatch test WhatsApp message. Ensure WhatsAPI Hub gateway is connected." },
            { status: waRes.status || 502 }
          );
        }

        await adminDb.collection("admin_audit_logs").add({
          action: "send_test_communication_whatsapp",
          recipientPhone: fullNum,
          templateType: templateType || "whatsapp_otp",
          adminEmail,
          createdAt: new Date().toISOString(),
        });

        return NextResponse.json({
          success: true,
          message: `Test WhatsApp message successfully dispatched to +${fullNum}!`,
        });
      }

      // EMAIL TEST DISPATCH
      if (!isValidEmail(recipientEmail)) {
        return NextResponse.json({ error: "Please enter a valid recipient email address." }, { status: 400 });
      }

      const replyTo = config.sender.replyToEmail || config.sender.senderEmail;
      let subject = "Test Email";
      let htmlBody = "";

      if (templateType === "welcome") {
        const tpl = config.welcomeEmail;
        subject = `[TEST] ${renderTemplateVariables(tpl.subject, { brandName, name: "Valued Customer", email: recipientEmail })}`;

        const logoHtml = tpl.logoUrl || config.sender.logoUrl
          ? `<img src="${tpl.logoUrl || config.sender.logoUrl}" alt="${brandName}" style="max-height: 48px; width: auto; margin-bottom: 16px;" />`
          : `<h2 style="color: ${tpl.primaryColor || "#FC7A00"}; margin: 0 0 16px 0;">${brandName}</h2>`;

        const bannerHtml = tpl.bannerUrl
          ? `<div style="margin-bottom: 20px; text-align: center;"><img src="${tpl.bannerUrl}" alt="Banner" style="max-width: 100%; border-radius: 12px;" /></div>`
          : "";

        htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center;">${logoHtml}</div>
            ${bannerHtml}
            <h1 style="color: #1a202c; font-size: 20px; font-weight: 800; text-align: center; margin-bottom: 12px;">${sanitizeText(renderTemplateVariables(tpl.heading, { brandName }))}</h1>
            <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">${sanitizeText(renderTemplateVariables(tpl.greeting, { name: "Valued Customer" }))}</p>
            <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">${sanitizeText(renderTemplateVariables(tpl.welcomeMessage, { brandName, email: recipientEmail }))}</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${tpl.ctaButtonUrl || "#"}" style="background-color: ${tpl.primaryColor || "#FC7A00"}; color: #ffffff; padding: 12px 28px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 10px; display: inline-block;">${sanitizeText(tpl.ctaButtonText || "Access Wallet")}</a>
            </div>
            <hr style="border: none; border-top: 1px solid #edf2f7; margin: 24px 0;" />
            <p style="color: #a0aec0; font-size: 11px; text-align: center; margin: 0;">${sanitizeText(tpl.footer || config.sender.footerText)}</p>
          </div>
        `;
      } else {
        const tpl = config.emailOtp;
        subject = `[TEST] ${renderTemplateVariables(tpl.subject, { brandName, name: "Valued Customer" })}`;

        const logoHtml = config.sender.logoUrl
          ? `<img src="${config.sender.logoUrl}" alt="${brandName}" style="max-height: 48px; width: auto; margin-bottom: 16px;" />`
          : `<h2 style="color: #FC7A00; margin: 0 0 16px 0;">${brandName}</h2>`;

        const bannerHtml = tpl.bannerUrl
          ? `<div style="margin-bottom: 20px; text-align: center;"><img src="${tpl.bannerUrl}" alt="Banner" style="max-width: 100%; border-radius: 12px;" /></div>`
          : "";

        htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center;">${logoHtml}</div>
            ${bannerHtml}
            <h1 style="color: #1a202c; font-size: 18px; font-weight: 800; text-align: center; margin-bottom: 12px;">${sanitizeText(renderTemplateVariables(tpl.heading, { brandName }))}</h1>
            <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">${sanitizeText(renderTemplateVariables(tpl.greeting, { name: "Valued Customer" }))}</p>
            <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">${sanitizeText(renderTemplateVariables(tpl.mainMessage, { brandName }))}</p>
            <div style="background-color: #fffaf0; border: 2px dashed #FC7A00; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
              <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #FC7A00;">123456</span>
              <p style="font-size: 11px; color: #718096; margin-top: 8px; margin-bottom: 0;">${sanitizeText(renderTemplateVariables(tpl.expiryText, { expiryMinutes: 10 }))}</p>
            </div>
            <p style="color: #e53e3e; font-size: 12px; font-weight: bold; text-align: center;">${sanitizeText(tpl.securityWarning)}</p>
            <hr style="border: none; border-top: 1px solid #edf2f7; margin: 24px 0;" />
            <p style="color: #a0aec0; font-size: 11px; text-align: center; margin: 0;">${sanitizeText(tpl.footer || config.sender.footerText)}</p>
          </div>
        `;
      }

      let emailSent = false;
      let emailErrDetails = "";
      try {
        emailSent = await sendEmail({
          to: recipientEmail,
          subject,
          html: htmlBody,
          replyTo,
        });
      } catch (e: any) {
        emailErrDetails = e.message || "Email gateway connection error";
      }

      if (!emailSent) {
        return NextResponse.json({
          error: "Failed to dispatch test email via Email API Gateway. Please verify API Key & URL in 'Email Connect' page.",
          details: emailErrDetails || "Remote Email Gateway unreachable or rejected credentials.",
        }, { status: 502 });
      }

      await adminDb.collection("admin_audit_logs").add({
        action: "send_test_communication_email",
        recipientEmail,
        templateType,
        adminEmail,
        createdAt: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        message: `Test ${templateType.toUpperCase()} email successfully dispatched to ${recipientEmail}!`,
      });
    }

    const { sender, emailOtp, whatsappOtp, welcomeEmail } = body;

    if (sender?.senderEmail && !isValidEmail(sender.senderEmail)) {
      return NextResponse.json({ error: "Sender email address is invalid." }, { status: 400 });
    }

    if (sender?.replyToEmail && !isValidEmail(sender.replyToEmail)) {
      return NextResponse.json({ error: "Reply-To email address is invalid." }, { status: 400 });
    }

    const updatedConfig: CommunicationBrandingConfig = {
      sender: {
        senderName: sanitizeText(sender?.senderName || DEFAULT_COMMUNICATION_BRANDING.sender.senderName),
        senderEmail: (sender?.senderEmail || DEFAULT_COMMUNICATION_BRANDING.sender.senderEmail).trim(),
        replyToEmail: (sender?.replyToEmail || DEFAULT_COMMUNICATION_BRANDING.sender.replyToEmail).trim(),
        companyName: sanitizeText(sender?.companyName || DEFAULT_COMMUNICATION_BRANDING.sender.companyName),
        logoUrl: (sender?.logoUrl || "").trim(),
        footerText: sanitizeText(sender?.footerText || DEFAULT_COMMUNICATION_BRANDING.sender.footerText),
      },
      emailOtp: {
        subject: sanitizeText(emailOtp?.subject || DEFAULT_COMMUNICATION_BRANDING.emailOtp.subject),
        heading: sanitizeText(emailOtp?.heading || DEFAULT_COMMUNICATION_BRANDING.emailOtp.heading),
        greeting: sanitizeText(emailOtp?.greeting || DEFAULT_COMMUNICATION_BRANDING.emailOtp.greeting),
        mainMessage: sanitizeText(emailOtp?.mainMessage || DEFAULT_COMMUNICATION_BRANDING.emailOtp.mainMessage),
        cardStyle: emailOtp?.cardStyle || "modern",
        expiryText: sanitizeText(emailOtp?.expiryText || DEFAULT_COMMUNICATION_BRANDING.emailOtp.expiryText),
        securityWarning: sanitizeText(emailOtp?.securityWarning || DEFAULT_COMMUNICATION_BRANDING.emailOtp.securityWarning),
        footer: sanitizeText(emailOtp?.footer || DEFAULT_COMMUNICATION_BRANDING.emailOtp.footer),
        bannerUrl: (emailOtp?.bannerUrl || "").trim(),
      },
      whatsappOtp: {
        messageTemplate: sanitizeText(whatsappOtp?.messageTemplate || DEFAULT_COMMUNICATION_BRANDING.whatsappOtp.messageTemplate),
        brandName: sanitizeText(whatsappOtp?.brandName || DEFAULT_COMMUNICATION_BRANDING.whatsappOtp.brandName),
        greeting: sanitizeText(whatsappOtp?.greeting || DEFAULT_COMMUNICATION_BRANDING.whatsappOtp.greeting),
        mainMessage: sanitizeText(whatsappOtp?.mainMessage || DEFAULT_COMMUNICATION_BRANDING.whatsappOtp.mainMessage),
        expiryMessage: sanitizeText(whatsappOtp?.expiryMessage || DEFAULT_COMMUNICATION_BRANDING.whatsappOtp.expiryMessage),
        securityWarning: sanitizeText(whatsappOtp?.securityWarning || DEFAULT_COMMUNICATION_BRANDING.whatsappOtp.securityWarning),
        boldOtp: whatsappOtp?.boldOtp !== undefined ? Boolean(whatsappOtp.boldOtp) : true,
        bannerUrl: (whatsappOtp?.bannerUrl || "").trim(),
      },
      welcomeEmail: {
        subject: sanitizeText(welcomeEmail?.subject || DEFAULT_COMMUNICATION_BRANDING.welcomeEmail.subject),
        logoUrl: (welcomeEmail?.logoUrl || "").trim(),
        bannerUrl: (welcomeEmail?.bannerUrl || "").trim(),
        heading: sanitizeText(welcomeEmail?.heading || DEFAULT_COMMUNICATION_BRANDING.welcomeEmail.heading),
        greeting: sanitizeText(welcomeEmail?.greeting || DEFAULT_COMMUNICATION_BRANDING.welcomeEmail.greeting),
        welcomeMessage: sanitizeText(welcomeEmail?.welcomeMessage || DEFAULT_COMMUNICATION_BRANDING.welcomeEmail.welcomeMessage),
        ctaButtonText: sanitizeText(welcomeEmail?.ctaButtonText || DEFAULT_COMMUNICATION_BRANDING.welcomeEmail.ctaButtonText),
        ctaButtonUrl: (welcomeEmail?.ctaButtonUrl || DEFAULT_COMMUNICATION_BRANDING.welcomeEmail.ctaButtonUrl).trim(),
        footer: sanitizeText(welcomeEmail?.footer || DEFAULT_COMMUNICATION_BRANDING.welcomeEmail.footer),
        primaryColor: (welcomeEmail?.primaryColor || DEFAULT_COMMUNICATION_BRANDING.welcomeEmail.primaryColor).trim(),
      },
      updatedAt: new Date().toISOString(),
      updatedBy: adminEmail,
    };

    await adminDb.collection("config").doc("communication_branding").set(updatedConfig, { merge: true });

    await adminDb.collection("admin_audit_logs").add({
      action: "update_communication_branding",
      adminEmail,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Communication and branding templates saved successfully!",
      config: updatedConfig,
    });
  } catch (err: any) {
    console.error("[Admin Communication POST Error]:", err.message);
    return NextResponse.json({ error: "Failed to update communication branding settings", details: err.message }, { status: 500 });
  }
}
