import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { NotificationService } from "@/services/notification-service";
import { WalletService } from "@/services/wallet-service";

async function resolveTierLimits(assignedTier: string, customDaily?: number, customSingle?: number) {
  let appData: Record<string, any> = {};
  try {
    const appDoc = await adminDb.collection("config").doc("app").get();
    if (appDoc.exists) {
      appData = appDoc.data() || {};
    }
  } catch (err: any) {
    console.warn("[Resolve Tier Limits Warning]:", err.message);
  }

  let defaultDaily = 500000;
  let defaultSingle = 200000;

  if (assignedTier === "Tier 3") {
    defaultDaily = Number(appData.tier3DailyTransferLimit ?? appData.tier3DailyLimit ?? 50000000);
    defaultSingle = Number(appData.tier3SingleTransferLimit ?? appData.tier3SingleLimit ?? 10000000);
  } else if (assignedTier === "Tier 2") {
    defaultDaily = Number(appData.tier2DailyTransferLimit ?? appData.tier2DailyLimit ?? 5000000);
    defaultSingle = Number(appData.tier2SingleTransferLimit ?? appData.tier2SingleLimit ?? 2000000);
  } else {
    defaultDaily = Number(appData.tier1DailyTransferLimit ?? appData.tier1DailyLimit ?? 500000);
    defaultSingle = Number(appData.tier1SingleTransferLimit ?? appData.tier1SingleLimit ?? 200000);
  }

  const hasCustomDaily = typeof customDaily === "number" && customDaily > 0 && customDaily !== defaultDaily;
  const hasCustomSingle = typeof customSingle === "number" && customSingle > 0 && customSingle !== defaultSingle;
  const isCustom = hasCustomDaily || hasCustomSingle;

  const finalDaily = typeof customDaily === "number" && customDaily > 0 ? customDaily : defaultDaily;
  const finalSingle = typeof customSingle === "number" && customSingle > 0 ? customSingle : defaultSingle;

  return {
    dailyLimit: finalDaily,
    singleLimit: finalSingle,
    hasCustomLimits: isCustom,
  };
}

async function autoReleaseUserHeldDeposits(userId: string, adminEmail: string) {
  try {
    const heldSnap = await adminDb.collection("transactions")
      .where("userId", "==", userId)
      .where("status", "==", "HELD_LIMIT_EXCEEDED")
      .get();

    if (heldSnap.empty) return;

    for (const doc of heldSnap.docs) {
      const txData = doc.data();
      const amountNum = Number(txData.metadata?.heldAmount ?? txData.amount ?? 0);
      const reference = txData.reference || doc.id;

      if (amountNum > 0) {
        await adminDb.runTransaction(async (transaction) => {
          await WalletService.creditWallet(transaction, {
            userId,
            amount: amountNum,
            currency: txData.currency || "NGN",
            reference: `RELEASE-${reference}`,
            docId: doc.id,
            description: `Release of Held Deposit (Ref: ${reference})`,
            recipientName: txData.recipientName || "Wallet Credit",
            type: "DEPOSIT",
            category: "DEPOSIT",
            direction: "CREDIT",
            narration: "Held deposit released automatically upon Tier upgrade approval",
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
              releasedBy: adminEmail,
              releasedAt: new Date().toISOString(),
              releasedOnTierUpgrade: true,
            },
          });

          transaction.update(doc.ref, {
            status: "SUCCESS",
            totalCredited: amountNum,
            description: `Release of Held Deposit (Ref: ${reference})`,
            narration: "Held deposit released automatically upon Tier upgrade approval",
            completedAt: new Date().toISOString(),
            "metadata.wasHeldReleased": true,
            "metadata.releasedAt": new Date().toISOString(),
            "metadata.releasedBy": adminEmail,
          });
        });

        NotificationService.sendPushNotification(userId, {
          title: "Held Deposit Released 💰",
          body: `Your held deposit of ₦${amountNum.toLocaleString("en-NG")} has been released and credited to your wallet balance following your Tier upgrade!`,
          type: "transaction",
          reference,
          amount: amountNum,
          url: "/history",
        }).catch(() => {});
      }
    }

    await adminDb.collection("users").doc(userId).update({
      depositLimitExceeded: false,
      heldDepositCount: 0,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[Auto-Release Held Deposits Error]:", err);
  }
}

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "users.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    if (!adminDb) {
      return NextResponse.json({ error: "Database uninitialized" }, { status: 500 });
    }

    const snap = await adminDb.collection("tier_upgrade_requests").orderBy("createdAt", "desc").limit(100).get();
    const requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const metrics = {
      totalRequests: requests.length,
      pendingCount: requests.filter((r: any) => r.status === "PENDING").length,
      approvedCount: requests.filter((r: any) => r.status === "APPROVED").length,
      rejectedCount: requests.filter((r: any) => r.status === "REJECTED").length,
    };

    return NextResponse.json({
      success: true,
      requests,
      metrics,
    });
  } catch (err: any) {
    console.error("[Admin Limit Requests GET] Error:", err.message);
    return NextResponse.json({ error: "Failed to fetch limit upgrade requests" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "users.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    if (!adminDb) {
      return NextResponse.json({ error: "Database uninitialized" }, { status: 500 });
    }

    const body = await req.json() || {};
    const { action, userId, assignedTier = "Tier 2", dailyLimit, singleLimit, rejectionReason = "" } = body;

    if (!userId) {
      return NextResponse.json({ error: "Target User ID is required." }, { status: 400 });
    }

    const adminEmail = perm.auth?.email || "admin@system";
    const nowIso = new Date().toISOString();

    if (action === "approve") {
      const customDaily = dailyLimit !== undefined && dailyLimit !== null && dailyLimit !== "" ? Number(dailyLimit) : undefined;
      const customSingle = singleLimit !== undefined && singleLimit !== null && singleLimit !== "" ? Number(singleLimit) : undefined;

      const limits = await resolveTierLimits(assignedTier, customDaily, customSingle);

      // Update upgrade request document
      await adminDb.collection("tier_upgrade_requests").doc(userId).set({
        status: "APPROVED",
        assignedTier,
        dailyLimit: limits.dailyLimit,
        singleLimit: limits.singleLimit,
        hasCustomLimits: limits.hasCustomLimits,
        approvedAt: nowIso,
        approvedBy: adminEmail,
        updatedAt: nowIso,
      }, { merge: true });

      // Update user document globally
      await adminDb.collection("users").doc(userId).set({
        tier: assignedTier,
        dailyLimit: limits.dailyLimit,
        dailyTransferLimit: limits.dailyLimit,
        singleLimit: limits.singleLimit,
        maxSingleTransferLimit: limits.singleLimit,
        hasCustomLimits: limits.hasCustomLimits,
        limitUpdatedAt: nowIso,
        limitUpdatedBy: adminEmail,
        updatedAt: nowIso,
      }, { merge: true });

      // Update wallet document globally so limits stay 100% in sync
      await adminDb.collection("wallets").doc(`${userId}_NGN`).set({
        tier: assignedTier,
        dailyLimit: limits.dailyLimit,
        dailyTransferLimit: limits.dailyLimit,
        singleLimit: limits.singleLimit,
        maxSingleTransferLimit: limits.singleLimit,
        hasCustomLimits: limits.hasCustomLimits,
        updatedAt: nowIso,
      }, { merge: true });

      // Auto-release any pending held deposits for this user now that tier limits are upgraded
      await autoReleaseUserHeldDeposits(userId, adminEmail);

      // Dispatch push notification
      await NotificationService.sendPushNotification(userId, {
        title: "🎉 Tier Upgrade Approved!",
        body: `Congratulations! Your account has been upgraded to ${assignedTier}. Your new daily limit is ₦${limits.dailyLimit.toLocaleString("en-NG")}.`,
        type: "system",
        url: "/profile",
      });

      return NextResponse.json({
        success: true,
        message: `Limit upgrade approved successfully! User set to ${assignedTier} with ₦${limits.dailyLimit.toLocaleString("en-NG")} daily limit.`,
      });
    } else if (action === "reject") {
      await adminDb.collection("tier_upgrade_requests").doc(userId).set({
        status: "REJECTED",
        rejectionReason: rejectionReason.trim() || "Information provided could not be verified.",
        rejectedAt: nowIso,
        rejectedBy: adminEmail,
        updatedAt: nowIso,
      }, { merge: true });

      await NotificationService.sendPushNotification(userId, {
        title: "Tier Upgrade Request Update",
        body: `Your tier upgrade request was not approved: ${rejectionReason || "Information provided could not be verified."}`,
        type: "system",
        url: "/profile",
      });

      return NextResponse.json({
        success: true,
        message: "Tier upgrade request rejected.",
      });
    } else {
      return NextResponse.json({ error: `Invalid action '${action}'.` }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[Admin Limit Requests POST] Error:", err.message);
    return NextResponse.json({ error: "Failed to process limit request action" }, { status: 500 });
  }
}
