/**
 * Helper to fetch live FX conversion rates exclusively via payment-gateway VM server-to-server endpoint.
 * Endpoint on VM: GET /api/flutterwave/rates?sourceCurrency={from}&destinationCurrency={to}&amount={amount}
 * The Flutterwave Secret Key remains strictly on the payment-gateway VM.
 */

const rateCache: Map<string, { rate: number; expiresAt: number }> = new Map();
import { getGatewayUrl } from "@/lib/gateway-util";

const RATE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function fetchFlutterwaveTransferRate(
  fromCurrency: string,
  toCurrency: string,
  amount: number = 1
): Promise<number | null> {
  let from = fromCurrency.toUpperCase().trim();
  let to = toCurrency.toUpperCase().trim();

  if (from === "FCFA") from = "XOF";
  if (to === "FCFA") to = "XOF";

  if (from === to) return 1;

  const cacheKey = `${from}_${to}_${amount}`;
  const now = Date.now();
  const cached = rateCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.rate;
  }

  const gatewayUrl = getGatewayUrl();
  const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

  if (!apiKey) {
    console.warn("[fetchFlutterwaveTransferRate] PAYMENT_GATEWAY_API_KEY is not defined in environment variables.");
    return null;
  }

  try {
    const url = `${gatewayUrl}/api/flutterwave/rates?sourceCurrency=${from}&destinationCurrency=${to}&amount=${amount}`;
    const vmRes = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "Authorization": `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (vmRes.ok) {
      const vmData = await vmRes.json();
      if (vmData?.success && typeof vmData.rate === "number" && vmData.rate > 0) {
        const rate = vmData.rate;
        rateCache.set(cacheKey, { rate, expiresAt: now + RATE_CACHE_TTL_MS });
        console.log(`[fetchFlutterwaveTransferRate] VM S2S rate fetched (${from} -> ${to}): ${rate}`);
        return rate;
      }
    } else {
      console.warn(`[fetchFlutterwaveTransferRate] VM S2S error response status=${vmRes.status} (${from} -> ${to})`);
    }
  } catch (vmErr: any) {
    console.warn(`[fetchFlutterwaveTransferRate] VM S2S request exception (${from} -> ${to}):`, vmErr.message);
  }

  return null;
}
