import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getGatewayUrl } from "@/lib/gateway-util";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("orderId");
    const transactionId = url.searchParams.get("transaction_id") || url.searchParams.get("tx_id");
    const status = url.searchParams.get("status");

    if (!orderId) {
      return NextResponse.redirect(new URL("/store?error=Missing order ID", req.url));
    }

    const orderRef = adminDb.collection("store_orders").doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return NextResponse.redirect(new URL("/store?error=Order not found", req.url));
    }

    const orderData = orderSnap.data();

    // If order is already paid, redirect safely
    if (orderData?.paymentStatus === "PAID" && orderData?.status !== "Pending Payment") {
      return NextResponse.redirect(new URL(`/store?orderSuccess=${orderId}`, req.url));
    }

    const gatewayUrl = getGatewayUrl();
    const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;
    const txRef = url.searchParams.get("tx_ref") || orderData?.txRef || `TX-STORE-${orderId}`;

    let isVerified = false;
    let flwTxRef = "";

    // 1. Primary Verification: Query backend VM S2S verify route using secure VM .env configuration
    if (transactionId || txRef) {
      try {
        const verifyHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (gatewayApiKey) {
          verifyHeaders["X-API-Key"] = gatewayApiKey;
          verifyHeaders["Authorization"] = `Bearer ${gatewayApiKey}`;
        }

        const vmVerifyRes = await fetch(`${gatewayUrl}/api/flutterwave/verify`, {
          method: "POST",
          headers: verifyHeaders,
          body: JSON.stringify({
            transaction_id: transactionId,
            tx_ref: txRef,
          }),
        });

        const vmData = await vmVerifyRes.json().catch(() => ({}));
        if (
          vmVerifyRes.ok &&
          (vmData.status === "SUCCESS" || vmData.status === "success" || vmData.credited === true || vmData.data?.status === "successful")
        ) {
          isVerified = true;
          flwTxRef = vmData.txRef || vmData.data?.tx_ref || transactionId || txRef;
        }
      } catch (err: any) {
        console.warn("[Store Order Verify] VM verify route call exception:", err.message);
      }
    }

    // 2. Secondary Verification: Query backend VM proxy S2S route (/api/flutterwave/proxy)
    if (!isVerified && transactionId) {
      try {
        const proxyHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (gatewayApiKey) {
          proxyHeaders["X-API-Key"] = gatewayApiKey;
          proxyHeaders["Authorization"] = `Bearer ${gatewayApiKey}`;
        }

        const vmProxyRes = await fetch(`${gatewayUrl}/api/flutterwave/proxy`, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify({
            method: "GET",
            endpoint: `/transactions/${transactionId}/verify`,
          }),
        });

        const proxyData = await vmProxyRes.json().catch(() => ({}));
        if (
          vmProxyRes.ok &&
          proxyData.status === "success" &&
          proxyData.data?.status === "successful" &&
          Number(proxyData.data?.amount) >= Number(orderData?.totalAmount || 0)
        ) {
          isVerified = true;
          flwTxRef = proxyData.data?.tx_ref || transactionId;
        }
      } catch (err: any) {
        console.warn("[Store Order Verify] VM proxy verify exception:", err.message);
      }
    }

    // 3. Fallback Verification: Check local env / Firestore config if direct key exists locally
    if (!isVerified && transactionId) {
      let flutterwaveSecretKey = process.env.FLW_SECRET_KEY || process.env.FLUTTERWAVE_SECRET_KEY || "";
      if (!flutterwaveSecretKey) {
        try {
          const configDoc = await adminDb.collection("config").doc("app_config").get();
          if (configDoc.exists) {
            const cfg = configDoc.data() || {};
            flutterwaveSecretKey = cfg.flutterwaveSecretKey || cfg.flwSecretKey || cfg.flw_secret_key || cfg.flutterwave_secret_key || "";
          }
          if (!flutterwaveSecretKey) {
            const appDoc = await adminDb.collection("config").doc("app").get();
            if (appDoc.exists) {
              const cfg = appDoc.data() || {};
              flutterwaveSecretKey = cfg.flutterwaveSecretKey || cfg.flwSecretKey || cfg.flw_secret_key || cfg.flutterwave_secret_key || "";
            }
          }
        } catch (err: any) {
          console.warn("[Store Order Verify] Local config lookup warning:", err.message);
        }
      }

      if (flutterwaveSecretKey) {
        try {
          const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
            headers: {
              Authorization: `Bearer ${flutterwaveSecretKey}`,
            },
          });
          const verifyData = await verifyRes.json();

          if (
            verifyRes.ok &&
            verifyData.status === "success" &&
            verifyData.data?.status === "successful" &&
            Number(verifyData.data?.amount) >= Number(orderData?.totalAmount || 0)
          ) {
            isVerified = true;
            flwTxRef = verifyData.data?.tx_ref || transactionId;
          }
        } catch (err: any) {
          console.error("[Store Order Verify] Flutterwave transaction verification exception:", err.message);
        }
      }
    }

    const now = new Date().toISOString();

    if (isVerified) {
      // Payment Verified: Mark order as PAID and status as Pending (Fulfillment Pending)
      const txId = `TX-CARD-STORE-${orderId}`;

      await orderRef.update({
        status: "Pending", // Pending Fulfillment by Admin in CPanel
        paymentStatus: "PAID",
        paymentVerificationRef: flwTxRef || `FLW-VERIFIED-${Date.now()}`,
        transactionId: txId,
        updatedAt: now,
      });

      // Record in transactions ledger collection for user history transparency
      try {
        const txDocRef = adminDb.collection("transactions").doc(txId);
        const txSnap = await txDocRef.get();
        if (!txSnap.exists) {
          await txDocRef.set({
            id: txId,
            userId: orderData?.userId || "",
            type: "STORE_PURCHASE",
            category: "DEBIT",
            direction: "DEBIT",
            title: "Store Order",
            description: `Store Order ${orderId} (${Array.isArray(orderData?.items) ? orderData.items.length : 1} items)`,
            amount: Number(orderData?.totalAmount) || 0,
            totalDebited: Number(orderData?.totalAmount) || 0,
            fee: 0,
            vat: 0,
            currency: "NGN",
            status: "SUCCESS",
            reference: orderId,
            orderId: orderId,
            transactionId: txId,
            paymentStatus: "PAID",
            orderStatus: "Pending",
            items: orderData?.items || [],
            recipientName: "E-Tech Store",
            narration: `Store Order ${orderId}`,
            createdAt: now,
            updatedAt: now,
          });
        }
      } catch (err: any) {
        console.warn("[Store Order Verify] Transaction write warning:", err.message);
      }

      return NextResponse.redirect(new URL(`/store?orderSuccess=${orderId}`, req.url));
    } else {
      // Payment Failed or Cancelled: If stock was previously reserved, restore stock atomically
      if (orderData?.stockDeducted === true && orderData?.stockRestored !== true && Array.isArray(orderData?.items)) {
        try {
          const storeDataRef = adminDb.collection("config").doc("store_data");
          await adminDb.runTransaction(async (transaction) => {
            const storeSnap = await transaction.get(storeDataRef);
            if (storeSnap.exists) {
              const currentItems: any[] = Array.isArray(storeSnap.data()?.items)
                ? [...(storeSnap.data()?.items)]
                : [];
              let stockModified = false;

              for (const oItem of orderData.items) {
                const idx = currentItems.findIndex((i: any) => i.id === oItem.id);
                if (idx > -1) {
                  const targetItem = currentItems[idx];
                  if (!targetItem.unlimitedStock && typeof targetItem.stockQuantity === "number") {
                    const restoredQty = targetItem.stockQuantity + (Number(oItem.quantity) || 1);
                    currentItems[idx] = {
                      ...targetItem,
                      stockQuantity: restoredQty,
                      inStock: restoredQty > 0,
                    };
                    stockModified = true;
                  }
                }
              }

              if (stockModified) {
                transaction.update(storeDataRef, { items: currentItems, updatedAt: now });
              }
            }
          });
        } catch (restErr: any) {
          console.warn("[Store Order Verify] Stock restoration on failed payment warning:", restErr.message);
        }
      }

      await orderRef.update({
        status: "Payment Failed",
        paymentStatus: "FAILED",
        stockRestored: true,
        updatedAt: now,
      });

      return NextResponse.redirect(new URL(`/store?orderError=Payment was not completed or failed.`, req.url));
    }
  } catch (err: any) {
    console.error("[Store Order Verify GET Exception]:", err.message);
    return NextResponse.redirect(new URL("/store?error=Verification failed", req.url));
  }
}
