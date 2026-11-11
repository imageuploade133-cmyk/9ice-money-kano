import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";
import { WalletService } from "@/services/wallet-service";
import { NotificationService } from "@/services/notification-service";
import { getGatewayUrl } from "@/lib/gateway-util";

const GATEWAY_URL = getGatewayUrl();

export async function POST(req: Request) {
  try {
    const authenticatedUser = await authenticateUserRequest(req);
    if (!authenticatedUser || !authenticatedUser.uid) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid or missing authentication token." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const transactionId = body.transactionId || body.transaction_id;
    const txRef = body.txRef || body.tx_ref;

    if (!transactionId && !txRef) {
      return NextResponse.json(
        { success: false, error: "Validation Error: transactionId or txRef is required." },
        { status: 400 }
      );
    }

    // Fast-path Firestore check: If the webhook has already credited the transaction in Firestore, return immediately!
    try {
      const candidateDocs: any[] = [];

      if (txRef) {
        const docId = txRef.startsWith("tx-FUNDING-") ? txRef : `tx-FUNDING-${txRef}`;
        const txDoc = await adminDb.collection("transactions").doc(docId).get();
        if (txDoc.exists) {
          candidateDocs.push(txDoc);
        }
      }

      if (candidateDocs.length === 0 && txRef) {
        const qSnap = await adminDb.collection("transactions")
          .where("reference", "==", String(txRef))
          .limit(1)
          .get();
        if (!qSnap.empty) {
          candidateDocs.push(qSnap.docs[0]);
        }
      }

      if (candidateDocs.length === 0 && transactionId) {
        const qSnap = await adminDb.collection("transactions")
          .where("flwId", "==", String(transactionId))
          .limit(1)
          .get();
        if (!qSnap.empty) {
          candidateDocs.push(qSnap.docs[0]);
        }
      }

      for (const docSnap of candidateDocs) {
        const txData = docSnap.data();
        if (txData?.userId) {
          if (txData.userId !== authenticatedUser.uid) {
            return NextResponse.json(
              { success: false, error: "Forbidden: You do not own this transaction." },
              { status: 403 }
            );
          }

          // Ownership is verified! Check if transaction is already credited/SUCCESS
          if (txData.status === "SUCCESS" || txData.credited === true) {
            const userDoc = await adminDb.collection("users").doc(authenticatedUser.uid).get();
            const currentBal = Number(userDoc.data()?.balance) || 0;
            const confirmedAmount = Number(txData.totalCredited || txData.amount || 0);

            console.log(`[Verify Route Fast-Path] Transaction ${docSnap.id} is already SUCCESS in Firestore. Returning immediate SUCCESS.`);
            return NextResponse.json({
              success: true,
              status: "SUCCESS",
              credited: true,
              alreadyCredited: true,
              fundedAmount: confirmedAmount,
              totalCredited: confirmedAmount,
              amount: confirmedAmount,
              newBalance: currentBal,
              message: "Payment verified and wallet credited successfully."
            });
          }
        }
      }
    } catch (err: any) {
      console.error(`[Verify Route Ownership Check Error]: ${err.message}`);
      return NextResponse.json(
        { success: false, error: "Failed to verify transaction ownership." },
        { status: 500 }
      );
    }

    const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;
    if (!gatewayApiKey) {
      console.error("[Verify Route Error]: PAYMENT_GATEWAY_API_KEY is not configured on host server.");
      return NextResponse.json(
        { success: false, error: "Server Configuration Error: Payment Gateway API key missing." },
        { status: 500 }
      );
    }

    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/flutterwave/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": gatewayApiKey,
        "Authorization": `Bearer ${gatewayApiKey}`
      },
      body: JSON.stringify({
        transaction_id: transactionId,
        tx_ref: txRef
      })
    });

    const data = await gatewayResponse.json().catch(() => ({
      success: false,
      error: "Invalid JSON response from gateway."
    }));

    const isVerifiedSuccess =
      gatewayResponse.ok &&
      (data.success === true ||
        data.status === "SUCCESS" ||
        data.status === "SUCCESSFUL" ||
        data.status === "successful" ||
        data.data?.status === "successful");

    if (isVerifiedSuccess) {
      const resolvedTxRef = txRef || data.txRef || data.tx_ref || data.data?.tx_ref || `flw-tx-${authenticatedUser.uid}-${Date.now()}`;
      const resolvedFlwId = String(transactionId || data.flwId || data.id || data.data?.id || "");
      const resolvedAmount = Number(
        data.totalCredited ?? data.fundedAmount ?? data.amount ?? data.data?.amount ?? 0
      );

      if (!resolvedFlwId) {
        console.warn(`[Verify Route] Unique provider transaction ID missing for txRef ${resolvedTxRef}. Requiring manual reconciliation.`);
        return NextResponse.json({
          ...data,
          success: false,
          credited: false,
          reconciliationRequired: true,
          error: "Unique provider transaction ID missing. Manual reconciliation required."
        }, { status: 422 });
      }

      if (resolvedAmount > 0) {
        try {
          const creditOutcome = await adminDb.runTransaction(async (transaction) => {
            // Canonical docId strictly uses unique provider transaction ID (flwId) to prevent permanent account tx_ref collision
            const docId = `tx-FUNDING-flw-${resolvedFlwId}`;

            const txDocRef = adminDb.collection("transactions").doc(docId);
            const txDoc = await transaction.get(txDocRef);

            if (txDoc.exists) {
              const txData = txDoc.data() || {};
              if (txData.status === "SUCCESS" || txData.credited === true) {
                const userRef = adminDb.collection("users").doc(authenticatedUser.uid);
                const userDoc = await transaction.get(userRef);
                const currentBal = Number(userDoc.data()?.balance) || 0;
                return {
                  alreadyCredited: true,
                  newBalance: currentBal,
                  amount: Number(txData.totalCredited || txData.amount || resolvedAmount)
                };
              }
            }

            // Perform atomic credit
            const creditRes = await WalletService.creditWallet(transaction, {
              userId: authenticatedUser.uid,
              amount: resolvedAmount,
              currency: "NGN",
              reference: resolvedTxRef,
              flwId: resolvedFlwId,
              docId,
              description: "Wallet Funding via Payment Gateway",
              recipientName: "Self",
              type: "WALLET_FUNDING",
              category: "DEPOSIT",
              direction: "CREDIT",
              fundingMethod: "PAYMENT_GATEWAY",
              completedAt: new Date().toISOString(),
              metadata: {
                flwVerified: true,
                verifiedVia: "api_flutterwave_verify",
                flwData: data.data || data,
              }
            });

            // Update pending_payments record if present
            const pendingRef = adminDb.collection("pending_payments").doc(resolvedTxRef);
            transaction.set(pendingRef, {
              status: "SUCCESS",
              completedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }, { merge: true });

            return {
              alreadyCredited: false,
              newBalance: creditRes.newBalance,
              amount: resolvedAmount
            };
          });

          // Send FCM notification if newly credited
          if (!creditOutcome.alreadyCredited) {
            NotificationService.sendPushNotification(authenticatedUser.uid, {
              title: "Wallet Funded Successfully",
              body: `Your wallet has been credited with ₦${resolvedAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}.`,
              type: "transaction",
              reference: resolvedTxRef,
              amount: resolvedAmount,
              url: "/history",
            }).catch((notifErr) => console.warn("[Verify Route Notification Warning]:", notifErr.message));
          }

          return NextResponse.json({
            ...data,
            success: true,
            status: "SUCCESS",
            credited: true,
            alreadyCredited: creditOutcome.alreadyCredited,
            fundedAmount: creditOutcome.amount,
            totalCredited: creditOutcome.amount,
            amount: creditOutcome.amount,
            newBalance: creditOutcome.newBalance,
            message: "Payment verified and wallet credited successfully."
          });
        } catch (creditError: any) {
          console.error(`[Verify Route Credit Error]: ${creditError.message}`);
          // Return response with error detail if wallet credit transaction failed
          return NextResponse.json({
            ...data,
            success: false,
            error: `Payment verified but wallet crediting failed: ${creditError.message}`
          }, { status: 500 });
        }
      }
    }

    return NextResponse.json(data, { status: gatewayResponse.status });
  } catch (error: any) {
    console.error("[Verify Route Exception]:", error);
    const status = error.message?.includes("Missing Firebase ID token") || error.message?.includes("Token has expired") || error.message?.includes("Invalid token") ? 401 : 500;
    return NextResponse.json(
      { success: false, error: error.message || "Internal verification proxy failure." },
      { status }
    );
  }
}
