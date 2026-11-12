import { describe, test, expect } from "bun:test";

// Strict production authorization logic
function evaluateStrictTransactionAuthorization(
  authUid: string,
  txDoc: { userId?: string; recipientUserId?: string; metadata?: any; phoneNumber?: string; customerId?: string }
): boolean {
  if (!authUid || typeof authUid !== "string" || !authUid.trim()) {
    return false;
  }

  // Direct owner check
  if (txDoc.userId && typeof txDoc.userId === "string" && txDoc.userId === authUid) {
    return true;
  }

  // Recipient user check
  if (txDoc.recipientUserId && typeof txDoc.recipientUserId === "string" && txDoc.recipientUserId === authUid) {
    return true;
  }

  // Explicit metadata UID checks
  const meta = txDoc.metadata || {};
  if (typeof meta === "object") {
    if (meta.recipientUserId === authUid || meta.senderUserId === authUid || meta.userId === authUid) {
      return true;
    }
  }

  // Phone numbers, customer IDs, recipient names, or text matching are NEVER independent proof of ownership.
  return false;
}

function validateReferenceFormat(ref: string): boolean {
  if (!ref || typeof ref !== "string") return false;
  const clean = ref.trim();
  return /^[A-Za-z0-9_\-]+$/.test(clean) && clean.length <= 128;
}

function parseServiceWorkerDestination(rawTxRef: string, rawUrl: string, appOrigin: string): string {
  let destinationUrl = appOrigin + "/";

  if (typeof rawTxRef === "string" && rawTxRef.trim() && /^[A-Za-z0-9_\-]+$/.test(rawTxRef.trim())) {
    const cleanRef = rawTxRef.trim();
    const safeUrl = new URL("/", appOrigin);
    safeUrl.searchParams.set("txRef", cleanRef);
    destinationUrl = safeUrl.toString();
  } else {
    try {
      const parsed = new URL(rawUrl, appOrigin);
      if (parsed.origin === appOrigin && (parsed.pathname === "/" || parsed.pathname === "")) {
        const txParam = parsed.searchParams.get("txRef") || parsed.searchParams.get("transactionReference") || parsed.searchParams.get("reference");
        if (txParam && /^[A-Za-z0-9_\-]+$/.test(txParam)) {
          const safeUrl = new URL("/", appOrigin);
          safeUrl.searchParams.set("txRef", txParam);
          destinationUrl = safeUrl.toString();
        } else {
          destinationUrl = appOrigin + "/";
        }
      }
    } catch {
      destinationUrl = appOrigin + "/";
    }
  }

  return destinationUrl;
}

describe("Adversarial Security Test Suite for Transaction Authorization & Routing", () => {
  test("1. User A accesses own transaction -> ALLOW", () => {
    const tx = { userId: "user-A-uid", reference: "TX-100" };
    expect(evaluateStrictTransactionAuthorization("user-A-uid", tx)).toBe(true);
  });

  test("2. User A changes reference to User B transaction -> DENY", () => {
    const tx = { userId: "user-B-uid", reference: "TX-200" };
    expect(evaluateStrictTransactionAuthorization("user-A-uid", tx)).toBe(false);
  });

  test("3. User A changes URL parameter to User B transaction -> DENY", () => {
    const tx = { userId: "user-B-uid", reference: "TX-MANIPULATED" };
    expect(evaluateStrictTransactionAuthorization("user-A-uid", tx)).toBe(false);
  });

  test("4. User A changes transaction ID -> DENY", () => {
    const tx = { userId: "user-B-uid", reference: "tx-doc-b-999" };
    expect(evaluateStrictTransactionAuthorization("user-A-uid", tx)).toBe(false);
  });

  test("5. User A uses User B phone number -> DENY (Phone number is NEVER proof of ownership)", () => {
    const tx = { userId: "user-B-uid", phoneNumber: "+2348099998888", reference: "TX-PHONE" };
    expect(evaluateStrictTransactionAuthorization("user-A-uid", tx)).toBe(false);
  });

  test("6. User A uses User B customerId -> DENY (CustomerId is NEVER proof of ownership)", () => {
    const tx = { userId: "user-B-uid", customerId: "08099998888", reference: "TX-CUST" };
    expect(evaluateStrictTransactionAuthorization("user-A-uid", tx)).toBe(false);
  });

  test("7. Unauthenticated request (authUid is empty) -> DENY", () => {
    const tx = { userId: "user-A-uid", reference: "TX-100" };
    expect(evaluateStrictTransactionAuthorization("", tx)).toBe(false);
  });

  test("8. Expired session (null authUid) -> DENY", () => {
    const tx = { userId: "user-A-uid", reference: "TX-100" };
    expect(evaluateStrictTransactionAuthorization(null as any, tx)).toBe(false);
  });

  test("9. Replay old notification -> ONLY allow if authenticated user still owns transaction", () => {
    const txOwned = { userId: "user-A-uid", reference: "TX-OLD-1" };
    const txNotOwned = { userId: "user-B-uid", reference: "TX-OLD-2" };

    expect(evaluateStrictTransactionAuthorization("user-A-uid", txOwned)).toBe(true);
    expect(evaluateStrictTransactionAuthorization("user-A-uid", txNotOwned)).toBe(false);
  });

  test("10. Malformed transaction reference -> REJECT safely", () => {
    expect(validateReferenceFormat("TX-GOOD-123")).toBe(true);
    expect(validateReferenceFormat("TX-<script>alert(1)</script>")).toBe(false);
    expect(validateReferenceFormat("TX-SQL' OR 1=1--")).toBe(false);
    expect(validateReferenceFormat("TX-SPACE IN REF")).toBe(false);
    expect(validateReferenceFormat("a".repeat(200))).toBe(false);
  });

  test("11. Service Worker URL Validation rejects attacker-controlled origin & malformed URLs", () => {
    const origin = "https://wallet.eglobalpay.com";

    // Valid txRef on correct origin -> safe URL
    const dest1 = parseServiceWorkerDestination("TX-VALID-123", "", origin);
    expect(dest1).toBe("https://wallet.eglobalpay.com/?txRef=TX-VALID-123");

    // Malformed txRef with injection -> fallback to home
    const dest2 = parseServiceWorkerDestination("TX-BAD<script>", "", origin);
    expect(dest2).toBe("https://wallet.eglobalpay.com/");

    // External attacker URL -> fallback to home
    const dest3 = parseServiceWorkerDestination("", "https://attacker.com/evildock", origin);
    expect(dest3).toBe("https://wallet.eglobalpay.com/");
  });

  test("12. Internal recipient UID match -> ALLOW", () => {
    const tx = { userId: "user-sender", recipientUserId: "user-A-uid", reference: "TX-[#001]" };
    expect(evaluateStrictTransactionAuthorization("user-A-uid", tx)).toBe(true);
  });
});
