/**
 * Safely resolves and cleans the PAYMENT_GATEWAY_URL environment variable.
 * Automatically removes trailing slashes to prevent double slash routing errors
 * (e.g. `https://gateway.com//api/auth/send-otp` -> `https://gateway.com/api/auth/send-otp`).
 */
export function getGatewayUrl(): string {
  const rawUrl = process.env.PAYMENT_GATEWAY_URL || "http://127.0.0.1:3055";
  return rawUrl.trim().replace(/\/+$/, "");
}
