import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { WalletService } from "@/services/wallet-service";
import { NotificationService } from "@/services/notification-service";
import { getGatewayUrl } from "@/lib/gateway-util";

const GATEWAY_URL = getGatewayUrl();

export async function POST(req: Request) {
  const reqId = `wh-proxy-${Date.now()}-${Math.random().toString(36).slice(-4)}`;
  console.log(`[Webhook Proxy] [${reqId}] Received incoming Flutterwave webhook`);

  try {
    const signature = req.headers.get("verif-hash") || "";
    const contentType = req.headers.get("content-type") || "application/json";

    // Read raw body to preserve original formatting and signature integrity
    const rawBody = await req.text();
    console.log(`[Webhook Proxy] [${reqId}] Signature: "${signature}" | Body Length: ${rawBody.length}`);

    // Signature Verification: Validate verif-hash if FLW_WEBHOOK_SECRET is set
    const expectedSecret = process.env.FLW_WEBHOOK_SECRET || process.env.FLUTTERWAVE_WEBHOOK_SECRET;
    if (expectedSecret && signature !== expectedSecret) {
      console.warn(`[Webhook Proxy] [${reqId}] Rejecting webhook due to invalid signature.`);
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid webhook signature." },
        { status: 401 }
      );
    }

    // Trim trailing slash to prevent double-slash (//) routing issues on certain Nginx configurations
    const cleanGatewayUrl = GATEWAY_URL.endsWith("/") ? GATEWAY_URL.slice(0, -1) : GATEWAY_URL;

    // Forward immediately S2S to payment-gateway backend
    const response = await fetch(`${cleanGatewayUrl}/api/flutterwave/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "verif-hash": signature,
      },
      body: rawBody,
    });

    const responseText = await response.text();
    console.log(`[Webhook Proxy] [${reqId}] Backend responded with status: ${response.status}`);

    // Process fallback atomic wallet crediting in Next.js Firestore for charge.completed events
    try {
      const payload = JSON.parse(rawBody);
      const isChargeCompleted =
        payload.event === "charge.completed" ||
        payload.status === "successful" ||
        payload.data?.status === "successful";

      if (isChargeCompleted && payload.data) {
        const txRef = payload.data.tx_ref || payload.tx_ref || "";
        const flwId = String(payload.data.id || payload.id || "");
        const amount = Number(payload.data.amount || payload.amount || 0);
        const customerEmail = payload.data.customer?.email || payload.customer?.email || "";

        if (!flwId) {
          console.warn(`[Webhook Proxy] [${reqId}] Missing unique provider transaction ID for txRef ${txRef}. Requiring manual reconciliation.`);
          return;
        }

        if (amount > 0) {
          // Canonical docId strictly uses unique provider transaction ID (flwId)
          const docId = `tx-FUNDING-flw-${flwId}`;

          await adminDb.runTransaction(async (transaction) => {
            const txRefDoc = adminDb.collection("transactions").doc(docId);
            const txSnap = await transaction.get(txRefDoc);

            let isAlreadyCredited = false;
            let existingUserId = "";

            if (txSnap.exists) {
              const txData = txSnap.data() || {};
              existingUserId = txData.userId || "";
              if (txData.status === "SUCCESS" || txData.credited === true) {
                isAlreadyCredited = true;
              }
            }

            if (!isAlreadyCredited) {
              // Resolve target user ID
              let targetUid = existingUserId;

              if (!targetUid && txRef) {
                const pendingSnap = await transaction.get(adminDb.collection("pending_payments").doc(txRef));
                if (pendingSnap.exists) {
                  targetUid = pendingSnap.data()?.userId || "";
                }
              }

              if (!targetUid && txRef.startsWith("flw-tx-")) {
                const parts = txRef.split("-");
                if (parts.length >= 3) {
                  targetUid = parts.slice(2, parts.length - 1).join("-") || parts[2];
                }
              }

              if (!targetUid && customerEmail) {
                const userQuery = await adminDb.collection("users").where("email", "==", customerEmail.toLowerCase().trim()).limit(1).get();
                if (!userQuery.empty) {
                  targetUid = userQuery.docs[0].id;
                }
              }

              if (targetUid) {
                console.log(`[Webhook Fallback Credit] [${reqId}] Crediting user ${targetUid} with ₦${amount} for ref ${txRef}`);

                await WalletService.creditWallet(transaction, {
                  userId: targetUid,
                  amount,
                  currency: "NGN",
                  reference: txRef || `flw-${flwId}`,
                  flwId,
                  docId,
                  description: "Wallet Funding via Flutterwave Webhook",
                  recipientName: "Self",
                  type: "WALLET_FUNDING",
                  category: "DEPOSIT",
                  direction: "CREDIT",
                  fundingMethod: "FLUTTERWAVE_WEBHOOK",
                  completedAt: new Date().toISOString(),
                  metadata: {
                    webhookProcessed: true,
                    webhookReqId: reqId,
                    flwPayload: payload.data,
                  }
                });

                if (txRef) {
                  const pendingRef = adminDb.collection("pending_payments").doc(txRef);
                  transaction.set(pendingRef, {
                    status: "SUCCESS",
                    completedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                  }, { merge: true });
                }

                // Dispatch notification
                NotificationService.sendPushNotification(targetUid, {
                  title: "Wallet Funded Successfully",
                  body: `Your wallet has been credited with ₦${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}.`,
                  type: "transaction",
                  reference: txRef || `flw-${flwId}`,
                  amount: amount,
                  url: "/history",
                }).catch((nErr) => console.warn(`[Webhook Notification Error] [${reqId}]:`, nErr.message));
              }
            }
          });
        }
      }
    } catch (parseOrCreditErr: any) {
      console.warn(`[Webhook Fallback Credit Warning] [${reqId}]:`, parseOrCreditErr.message);
    }

    // Return exact status and response back to Flutterwave
    return new NextResponse(responseText, {
      status: response.status || 200,
      headers: {
        "Content-Type": "application/json",
      },
    });

  } catch (err: any) {
    console.error(`[Webhook Proxy Exception] [${reqId}] Failed to forward webhook:`, err.message);
    return NextResponse.json({
      success: false,
      message: "Webhook forwarding failed.",
      error: err.message,
    }, { status: 500 });
  }
}
