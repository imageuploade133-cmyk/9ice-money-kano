// Simple, highly performant IP-based Sliding Window In-Memory Rate Limiter.
// Avoids third-party dependencies to prevent ESM require conflicts on Vercel.

interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitCache = new Map<string, RateLimitRecord>();

/**
 * Checks if a specific client IP address is rate-limited.
 *
 * @param ip - The client IP address.
 * @param limit - Maximum requests allowed in the window.
 * @param windowMs - Time window size in milliseconds.
 * @returns boolean - True if the IP is rate-limited, false otherwise.
 */
export function isRateLimited(ip: string, limit = 60, windowMs = 60 * 1000): boolean {
  const now = Date.now();
  const record = rateLimitCache.get(ip) || { timestamps: [] };

  // Filter out timestamps outside the sliding window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    return true;
  }

  // Record this request
  record.timestamps.push(now);
  rateLimitCache.set(ip, record);
  return false;
}
