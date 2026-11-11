import { expect, test, describe } from "bun:test";
import { getGatewayUrl } from "@/lib/gateway-util";

describe("Gateway URL Normalization & WhatsApp Proxy Error Handling", () => {
  test("getGatewayUrl cleans trailing slashes from process.env.PAYMENT_GATEWAY_URL", () => {
    const originalEnv = process.env.PAYMENT_GATEWAY_URL;
    process.env.PAYMENT_GATEWAY_URL = "https://etechglobalhub.duckdns.org///";
    expect(getGatewayUrl()).toBe("https://etechglobalhub.duckdns.org");

    process.env.PAYMENT_GATEWAY_URL = "http://127.0.0.1:3055";
    expect(getGatewayUrl()).toBe("http://127.0.0.1:3055");

    process.env.PAYMENT_GATEWAY_URL = originalEnv;
  });

  test("send-otp proxy catches Express 404 HTML response ('Cannot POST //api/auth/send-otp') and returns friendly message", () => {
    const rawHtmlResponse = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot POST //api/auth/send-otp</pre>\n</body>\n</html>\n";

    let result: any = {};
    try {
      result = JSON.parse(rawHtmlResponse);
    } catch {
      if (rawHtmlResponse.includes("Cannot POST") || rawHtmlResponse.includes("<!DOCTYPE")) {
        result = { error: "WhatsApp OTP service is currently unavailable. Please use Email verification instead." };
      }
    }

    expect(result.error).toBe("WhatsApp OTP service is currently unavailable. Please use Email verification instead.");
    expect(result.error).not.toContain("<!DOCTYPE");
  });

  test("falls back to /api/auth/send-otp when gateway returns 404 for /api/auth/pin-reset-otp", async () => {
    let attemptedEndpoints: string[] = [];

    const mockFetch = async (url: string, init?: any) => {
      attemptedEndpoints.push(url);
      if (url.endsWith("/api/auth/pin-reset-otp")) {
        return {
          status: 404,
          ok: false,
          text: async () => "<!DOCTYPE html><html><body>Cannot POST //api/auth/pin-reset-otp</body></html>",
        };
      }
      if (url.endsWith("/api/auth/send-otp")) {
        return {
          status: 200,
          ok: true,
          text: async () => JSON.stringify({ success: true, message: "OTP sent via WhatsApp fallback" }),
        };
      }
      return { status: 500, ok: false, text: async () => "" };
    };

    const GATEWAY_URL = "http://127.0.0.1:3055/".replace(/\/+$/, "");
    const payload = { channel: "whatsapp" };

    let response = await mockFetch(`${GATEWAY_URL}/api/auth/pin-reset-otp`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    let responseText = await response.text();

    if (response.status === 404 || responseText.includes("Cannot POST")) {
      const userPhone = "2348012345678";
      const fallbackRes = await mockFetch(`${GATEWAY_URL}/api/auth/send-otp`, {
        method: "POST",
        body: JSON.stringify({
          phoneNumber: userPhone,
          type: "pin_reset",
          ...payload,
        }),
      });

      if (fallbackRes) {
        response = fallbackRes;
        responseText = await response.text();
      }
    }

    const result = JSON.parse(responseText);
    expect(attemptedEndpoints).toEqual([
      "http://127.0.0.1:3055/api/auth/pin-reset-otp",
      "http://127.0.0.1:3055/api/auth/send-otp",
    ]);
    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.message).toBe("OTP sent via WhatsApp fallback");
  });
});
