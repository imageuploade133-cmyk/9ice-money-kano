import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { WalletService } from "@/services/wallet-service";
import { NotificationService } from "@/services/notification-service";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "wallets.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const { searchParams } = new URL(req.url);
    const searchQuery = (searchParams.get("query") || searchParams.get("search") || searchParams.get("q") || "").trim().toLowerCase();
    const statusFilter = (searchParams.get("status") || "ALL").toUpperCase().trim();

    const txSnap = await adminDb.collection("transactions")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const allRecords: any[] = [];
    let totalHeldCount = 0;
    let totalHeldAmount = 0;
    let releasedCount = 0;
    let releasedAmount = 0;
    let canceledCount = 0;

    txSnap.forEach((doc) => {
      const data = doc.data() || {};
      const status = String(data.status || "").toUpperCase();
      const isHeld = status === "HELD_LIMIT_EXCEEDED" || status === "HELD" || Boolean(data.metadata?.isHeldDeposit);

      if (isHeld) {
        totalHeldCount += 1;
        totalHeldAmount += Number(data.metadata?.heldAmount ?? data.amount ?? 0);
      } else if (data.metadata?.wasHeldReleased || (data.metadata?.isHeldDeposit && status === "SUCCESS")) {
        releasedCount += 1;
        releasedAmount += Number(data.totalCredited ?? data.amount ?? 0);
      } else if (data.metadata?.isHeldDeposit && (status === "CANCELED" || status === "REJECTED")) {
        canceledCount += 1;
      }

      if (
        isHeld ||
        data.metadata?.isHeldDeposit ||
        data.metadata?.wasHeldReleased ||
        statusFilter === "ALL"
      ) {
        // Apply status filter if not ALL
        let matchesStatus = true;
        if (statusFilter === "HELD") {
          matchesStatus = isHeld;
        } else if (statusFilter === "RELEASED") {
          matchesStatus = Boolean(data.metadata?.wasHeldReleased || (data.metadata?.isHeldDeposit && status === "SUCCESS"));
        } else if (statusFilter === "CANCELED") {
          matchesStatus = Boolean(data.metadata?.isHeldDeposit && (status === "CANCELED" || status === "REJECTED"));
        }

        if (matchesStatus) {
          const meta = (data.metadata || {}) as Record<string, any>;
          const senderBankName =
            data.senderBankName ||
            meta.senderBankName ||
            meta.sender_bank_name ||
            meta.originatorBankName ||
            meta.originator_bank_name ||
            meta.bankName ||
            meta.bank_name ||
            undefined;

          const senderAccountNumber =
            data.senderAccountNumber ||
            meta.senderAccountNumber ||
            meta.sender_account_number ||
            meta.originatorAccountNumber ||
            meta.originator_account_number ||
            meta.sender_account ||
            undefined;

          const senderName =
            data.senderName ||
            meta.senderName ||
            meta.sender_name ||
            meta.originatorName ||
            meta.originator_name ||
            meta.customer_name ||
            data.recipientName ||
            undefined;

          const virtualAccountBankName =
            data.virtualAccountBankName ||
            meta.virtualAccountBankName ||
            meta.virtual_account_bank_name ||
            meta.receivingBankName ||
            meta.receiving_bank_name ||
            data.bank_name ||
            meta.bank_name ||
            undefined;

          const virtualAccountNumber =
            data.virtualAccountNumber ||
            meta.virtualAccountNumber ||
            meta.virtual_account_number ||
            meta.receivingAccountNumber ||
            meta.receiving_account_number ||
            data.account_number ||
            meta.account_number ||
            undefined;

          const ref = data.reference || doc.id;
          const userEmail = String(data.userEmail || data.email || "").toLowerCase();
          const userName = String(senderName || data.recipientName || data.name || "").toLowerCase();
          const userId = String(data.userId || "").toLowerCase();

          const matchesSearch =
            !searchQuery ||
            ref.toLowerCase().includes(searchQuery) ||
            userEmail.includes(searchQuery) ||
            userName.includes(searchQuery) ||
            userId.includes(searchQuery) ||
            String(senderAccountNumber || "").includes(searchQuery) ||
            String(virtualAccountNumber || "").includes(searchQuery);

          if (matchesSearch) {
            allRecords.push({
              id: doc.id,
              ...data,
              ...(senderBankName ? { senderBankName } : {}),
              ...(senderAccountNumber ? { senderAccountNumber } : {}),
              ...(senderName ? { senderName } : {}),
              ...(virtualAccountBankName ? { virtualAccountBankName } : {}),
              ...(virtualAccountNumber ? { virtualAccountNumber } : {}),
            });
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      records: allRecords,
      metrics: {
        totalHeldCount,
        totalHeldAmount,
        releasedCount,
        releasedAmount,
        canceledCount,
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Held Deposits GET Error]:", error.message);
    return NextResponse.json({ error: "Failed to fetch held deposits", details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "wallets.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json() || {};
    const { action, id, transactionId, reference, reason } = body;
    const targetDocId = id || transactionId || (reference ? `tx-${reference}` : null);

    if (!targetDocId) {
      return NextResponse.json({ error: "Transaction ID or reference is required." }, { status: 400 });
    }

    const txRef = adminDb.collection("transactions").doc(targetDocId);

    if (action === "approve" || action === "release") {
      let releasedUserId = "";
      let releasedAmount = 0;
      let releasedRef = "";

      await adminDb.runTransaction(async (transaction) => {
        const txDoc = await transaction.get(txRef);
        if (!txDoc.exists) {
          throw new Error("Target transaction record not found.");
        }

        const txData = txDoc.data() || {};
        const status = String(txData.status || "").toUpperCase();

        if (status === "SUCCESS") {
          throw new Error("This held deposit has already been released and credited.");
        }

        releasedUserId = txData.userId;
        releasedRef = txData.reference || txDoc.id;
        const amountNum = Number(txData.metadata?.heldAmount ?? txData.amount ?? 0);
        releasedAmount = amountNum;

        if (!releasedUserId || amountNum <= 0) {
          throw new Error("Invalid held transaction metadata or amount.");
        }

        // 1. Credit the user's NGN wallet using WalletService
        await WalletService.creditWallet(transaction, {
          userId: releasedUserId,
          amount: amountNum,
          currency: txData.currency || "NGN",
          reference: `RELEASE-${releasedRef}`,
          docId: targetDocId,
          description: `Release of Held Deposit (Ref: ${releasedRef})`,
          recipientName: txData.recipientName || "Wallet Credit",
          type: "DEPOSIT",
          category: "DEPOSIT",
          direction: "CREDIT",
          narration: "Released held deposit by administration",
          totalCredited: amountNum,
          fundingMethod: txData.fundingMethod || "Virtual Account",
          senderName: txData.senderName,
          senderAccountNumber: txData.senderAccountNumber,
          senderBankName: txData.senderBankName,
          virtualAccountNumber: txData.virtualAccountNumber,
          virtualAccountBankName: txData.virtualAccountBankName,
          metadata: {
            ...txData.metadata,
            wasHeldReleased: true,
            releasedBy: perm.auth?.email || "Admin",
            releasedAt: new Date().toISOString(),
            originalStatus: "HELD_LIMIT_EXCEEDED",
          },
        });

        // 2. Update the original transaction document status to SUCCESS
        transaction.update(txRef, {
          status: "SUCCESS",
          totalCredited: amountNum,
          description: `Release of Held Deposit (Ref: ${releasedRef})`,
          narration: "Held deposit approved and credited by administration",
          completedAt: new Date().toISOString(),
          "metadata.wasHeldReleased": true,
          "metadata.releasedAt": new Date().toISOString(),
          "metadata.releasedBy": perm.auth?.email || "Admin",
        });

        // 3. Clear user's depositLimitExceeded flag if held deposits are cleared
        const userRef = adminDb.collection("users").doc(releasedUserId);
        const userDoc = await transaction.get(userRef);
        if (userDoc.exists) {
          const uData = userDoc.data() || {};
          const currentCount = Math.max(0, (Number(uData.heldDepositCount) || 1) - 1);
          transaction.update(userRef, {
            heldDepositCount: currentCount,
            depositLimitExceeded: currentCount > 0,
            updatedAt: new Date().toISOString(),
          });
        }
      });

      // Dispatch FCM Push Notification after transaction commits
      if (releasedUserId && releasedAmount > 0) {
        NotificationService.sendPushNotification(releasedUserId, {
          title: "Held Deposit Released 💰",
          body: `Your held deposit of ₦${releasedAmount.toLocaleString("en-NG")} has been released and credited to your available wallet balance!`,
          type: "transaction",
          reference: releasedRef,
          amount: releasedAmount,
          url: "/history",
        }).catch((notifErr) => console.warn("[Held Deposit Release] FCM Push warn:", notifErr));
      }

      return NextResponse.json({
        success: true,
        message: `Held deposit of ₦${releasedAmount.toLocaleString()} successfully approved and credited!`,
      });
    }

    if (action === "cancel" || action === "reject") {
      const cancelReason = reason ? String(reason).trim() : "Canceled by administration";

      await txRef.set({
        status: "CANCELED",
        "metadata.canceledReason": cancelReason,
        "metadata.canceledAt": new Date().toISOString(),
        "metadata.canceledBy": perm.auth?.email || "Admin",
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return NextResponse.json({
        success: true,
        message: "Held deposit request canceled.",
      });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Held Deposits POST Error]:", error.message);
    return NextResponse.json({ error: error.message || "Failed to process held deposit", details: error.message }, { status: 500 });
  }
}
