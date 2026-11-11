export interface CommunicationSenderSettings {
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  companyName: string;
  logoUrl?: string;
  footerText?: string;
}

export interface EmailOtpTemplateSettings {
  subject: string;
  heading: string;
  greeting: string;
  mainMessage: string;
  cardStyle: "modern" | "compact" | "boxed";
  expiryText: string;
  securityWarning: string;
  footer: string;
  bannerUrl?: string;
}

export interface WhatsappOtpTemplateSettings {
  messageTemplate: string;
  brandName: string;
  greeting: string;
  mainMessage: string;
  expiryMessage: string;
  securityWarning: string;
  boldOtp?: boolean;
  bannerUrl?: string;
}

export interface WelcomeEmailTemplateSettings {
  subject: string;
  logoUrl?: string;
  bannerUrl?: string;
  heading: string;
  greeting: string;
  welcomeMessage: string;
  ctaButtonText: string;
  ctaButtonUrl: string;
  footer: string;
  primaryColor: string;
}

export interface CommunicationBrandingConfig {
  sender: CommunicationSenderSettings;
  emailOtp: EmailOtpTemplateSettings;
  whatsappOtp: WhatsappOtpTemplateSettings;
  welcomeEmail: WelcomeEmailTemplateSettings;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_COMMUNICATION_BRANDING: CommunicationBrandingConfig = {
  sender: {
    senderName: "E-Global Pay",
    senderEmail: "notifications@emakemrnd.com.ng",
    replyToEmail: "support@emakemrnd.com.ng",
    companyName: "E-Global Pay Tech Hub",
    logoUrl: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
    footerText: "© E-Global Pay Tech Hub. All rights reserved. Secure Financial System.",
  },
  emailOtp: {
    subject: "Your {{brandName}} Security Verification Code",
    heading: "Security Verification Code",
    greeting: "Hello {{name}},",
    mainMessage: "You requested an Access PIN reset or identity verification code. Please use the high-security verification PIN below to proceed:",
    cardStyle: "modern",
    expiryText: "This verification code expires in {{expiryMinutes}} minutes. Do not share it.",
    securityWarning: "If you did not initiate this request, please contact support immediately to secure your account.",
    footer: "E-Global Pay Automated Security Dispatch",
    bannerUrl: "",
  },
  whatsappOtp: {
    messageTemplate: "Hello {{name}},\n\nYour {{brandName}} verification code is *{{otp}}*.\n\nThis code expires in {{expiryMinutes}} minutes.\n\nDo NOT share this code with anyone for security.",
    brandName: "E-Global Pay",
    greeting: "Hello {{name}},",
    mainMessage: "Your verification code is *{{otp}}*.",
    expiryMessage: "This code expires in {{expiryMinutes}} minutes.",
    securityWarning: "Do NOT share this code with anyone for security reasons.",
    boldOtp: true,
    bannerUrl: "",
  },
  welcomeEmail: {
    subject: "Welcome to {{brandName}} - Your Account is Active!",
    logoUrl: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
    bannerUrl: "",
    heading: "Welcome to E-Global Pay!",
    greeting: "Hello {{name}},",
    welcomeMessage: "Thank you for joining E-Global Pay. Your secure multi-currency digital wallet and financial suite is ready for seamless transactions, bill payments, and investments.",
    ctaButtonText: "Access Wallet Dashboard",
    ctaButtonUrl: "https://e-tech-global-hub.vercel.app/auth/login",
    footer: "Need assistance? Our support team is available 24/7.",
    primaryColor: "#FC7A00",
  },
};

/**
 * Safely replaces template placeholder variables without evaluating HTML or code.
 */
export function renderTemplateVariables(
  templateStr: string,
  variables: Record<string, string | number>
): string {
  if (!templateStr) return "";
  let result = templateStr;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    result = result.replace(regex, String(value ?? ""));
  }
  return result;
}
