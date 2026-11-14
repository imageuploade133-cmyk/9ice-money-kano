import crypto from "crypto";

/**
 * OTPs are low-entropy secrets. Always key their HMAC with a server-only
 * secret so a database-only disclosure does not make OTPs recoverable.
 */
export function getOtpHmacSecret(): string {
  const secret = (
    process.env.OTP_HMAC_SECRET ||
    process.env.CPANEL_SESSION_SECRET ||
    process.env.JWT_SECRET ||
    ""
  ).trim();

  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(
      "OTP security secret is missing or too short. Configure OTP_HMAC_SECRET (at least 32 characters) in the server environment."
    );
  }

  return secret;
}

/** Compare fixed-size hexadecimal digests without timing-sensitive string equality. */
export function constantTimeHexEqual(left: unknown, right: unknown): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;

  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
