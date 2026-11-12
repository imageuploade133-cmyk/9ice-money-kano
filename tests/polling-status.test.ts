import { describe, it, expect } from "bun:test";
import { PaymentService } from "@/lib/payment-service";

describe("Payment Status Polling & Amount Contract Tests", () => {
  it("A. PaymentService.checkPaymentStatus returns canonical fundedAmount and totalCredited on SUCCESS", async () => {
    // Mock global fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          success: true,
          status: "SUCCESSFUL",
          fundedAmount: 100,
          totalCredited: 100,
          newBalance: 5100,
          message: "Payment verified successfully",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await PaymentService.checkPaymentStatus("flw-tx-test-123", "test-token");
      expect(res.status).toBe("SUCCESS");
      expect(res.fundedAmount).toBe(100);
      expect(res.totalCredited).toBe(100);
      expect(res.credited).toBe(true);
      expect(res.newBalance).toBe(5100);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("B. PaymentService.checkPaymentStatus returns FAILED status with 0 credited amount", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: false,
          status: "FAILED",
          error: "Payment failed or declined by issuing bank",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await PaymentService.checkPaymentStatus("flw-tx-test-failed", "test-token");
      expect(res.status).toBe("FAILED");
      expect(res.fundedAmount).toBe(0);
      expect(res.totalCredited).toBe(0);
      expect(res.credited).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("C. PaymentService.checkPaymentStatus returns EXPIRED status with 0 credited amount", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: false,
          status: "EXPIRED",
          error: "Funding expired after 11 minutes",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await PaymentService.checkPaymentStatus("flw-tx-test-expired", "test-token");
      expect(res.status).toBe("EXPIRED");
      expect(res.fundedAmount).toBe(0);
      expect(res.totalCredited).toBe(0);
      expect(res.credited).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("D. PaymentService.checkPaymentStatus returns CANCELED status with 0 credited amount", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          success: false,
          status: "CANCELED",
          error: "Payment canceled by user",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const res = await PaymentService.checkPaymentStatus("flw-tx-test-canceled", "test-token");
      expect(res.status).toBe("CANCELED");
      expect(res.fundedAmount).toBe(0);
      expect(res.totalCredited).toBe(0);
      expect(res.credited).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("E. Transferred Amount (102) vs Credited Amount (100) hierarchy", () => {
    const addAmount = "102";
    const transferAmount = 102;
    const backendConfirmedTotalCredited = 100;

    const displayedTransferredAmount = transferAmount ? transferAmount : parseFloat(addAmount);
    const displayedCreditedAmount = backendConfirmedTotalCredited ?? parseFloat(addAmount) ?? 0;

    expect(displayedTransferredAmount).toBe(102);
    expect(displayedCreditedAmount).toBe(100);
  });
});
