import { NextResponse } from "next/server";
import { mintFirebaseIdToken } from "@/lib/admin-auth";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { adminDb } from "@/lib/firebase-admin";
import { WalletService } from "@/services/wallet-service";
import { getGatewayUrl } from "@/lib/gateway-util";

const GATEWAY_URL = getGatewayUrl();

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
            narration: "Held deposit released automatically upon KYC approval",
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
              releasedOnKycApproval: true,
            },
          });

          transaction.update(doc.ref, {
            status: "SUCCESS",
            totalCredited: amountNum,
            description: `Release of Held Deposit (Ref: ${reference})`,
            narration: "Held deposit released automatically upon KYC approval",
            completedAt: new Date().toISOString(),
            "metadata.wasHeldReleased": true,
            "metadata.releasedAt": new Date().toISOString(),
            "metadata.releasedBy": adminEmail,
          });
        });

        const { NotificationService } = await import("@/services/notification-service");
        NotificationService.sendPushNotification(userId, {
          title: "Held Deposit Released 💰",
          body: `Your held deposit of ₦${amountNum.toLocaleString("en-NG")} has been released and credited to your wallet balance following your KYC verification!`,
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
  } catch (err: any) {
    console.warn("[KYC Auto-Release Held Deposits Warning]:", err.message);
  }
}

async function resolveTierLimits(assignedTier: string, customDaily?: number, customSingle?: number, customMaxBalance?: number) {
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
  let defaultMaxBalance = 300000;

  if (assignedTier === "Tier 3") {
    defaultDaily = Number(appData.tier3DailyTransferLimit ?? appData.tier3DailyLimit ?? 50000000);
    defaultSingle = Number(appData.tier3SingleTransferLimit ?? appData.tier3SingleLimit ?? 10000000);
    defaultMaxBalance = Number(appData.tier3MaxBalance ?? 50000000);
  } else if (assignedTier === "Tier 2") {
    defaultDaily = Number(appData.tier2DailyTransferLimit ?? appData.tier2DailyLimit ?? 5000000);
    defaultSingle = Number(appData.tier2SingleTransferLimit ?? appData.tier2SingleLimit ?? 2000000);
    defaultMaxBalance = Number(appData.tier2MaxBalance ?? 5000000);
  } else {
    defaultDaily = Number(appData.tier1DailyTransferLimit ?? appData.tier1DailyLimit ?? 500000);
    defaultSingle = Number(appData.tier1SingleTransferLimit ?? appData.tier1SingleLimit ?? 200000);
    defaultMaxBalance = Number(appData.tier1MaxBalance ?? 300000);
  }

  const hasCustomDaily = typeof customDaily === "number" && customDaily > 0 && customDaily !== defaultDaily;
  const hasCustomSingle = typeof customSingle === "number" && customSingle > 0 && customSingle !== defaultSingle;
  const hasCustomMaxBalance = typeof customMaxBalance === "number" && customMaxBalance > 0 && customMaxBalance !== defaultMaxBalance;
  const isCustom = hasCustomDaily || hasCustomSingle || hasCustomMaxBalance;

  const finalDaily = typeof customDaily === "number" && customDaily > 0 ? customDaily : defaultDaily;
  const finalSingle = typeof customSingle === "number" && customSingle > 0 ? customSingle : defaultSingle;
  const finalMaxBalance = typeof customMaxBalance === "number" && customMaxBalance > 0 ? customMaxBalance : defaultMaxBalance;

  return {
    dailyLimit: finalDaily,
    singleLimit: finalSingle,
    maxBalance: finalMaxBalance,
    hasCustomLimits: isCustom,
  };
}

async function parseResponseJson(response: Response, defaultMessage: string) {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await response.json();
    }
    const text = await response.text();
    console.error(`[Admin KYC API] Non-JSON response received:`, text.slice(0, 500));
    return { message: `${defaultMessage} (Gateway returned status ${response.status})` };
  } catch (err: any) {
    console.error(`[Admin KYC API] Error parsing response:`, err.message);
    return { message: `${defaultMessage} (Failed to parse response)` };
  }
}

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "kyc.view");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const { uid } = perm.auth;

    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab") || "pending"; // pending, verified_today, unverified
    const limitVal = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const lastDocId = searchParams.get("lastDocId") || "";

    if (uid === "mock-admin-uid") {
      const mockPending = [
        {
          uid: "mock-kyc-user-1",
          name: "JULES VERNE",
          email: "jules@example.com",
          phoneNumber: "+2348011223344",
          kycType: "bvn",
          kycNumber: "22233344455",
          kycStatus: tab === "pending" ? "PENDING" : (tab === "verified_today" ? "VERIFIED" : "UNVERIFIED"),
          submittedAt: new Date().toISOString(),
          capturedSelfie: "https://i.ibb.co/WWjZrtC7/E-Tech.png",
          livenessChallenge: "Smile & Blink",
          kycVerifiedAt: new Date().toISOString()
        }
      ];
      return NextResponse.json({ success: true, pendingUsers: mockPending, hasMore: false, totalCount: 1 });
    }

    let queryRef: FirebaseFirestore.Query = adminDb.collection("users");

    if (tab === "pending") {
      queryRef = queryRef.where("kycStatus", "in", [
        "PENDING", "PENDING_REVIEW", "VERIFYING", "IDENTITY_VERIFIED",
        "VERIFICATION_FAILED", "PROCESSING", "PROVISIONING", "PROVISIONING_FAILED"
      ]);
    } else if (tab === "verified_today") {
      queryRef = queryRef.where("kycStatus", "==", "VERIFIED");
    } else {
      queryRef = queryRef.where("kycStatus", "in", ["UNVERIFIED", "REJECTED"]);
    }

    // Sort by a field that is always populated to make pagination predictable
    queryRef = queryRef.orderBy("email", "asc");

    // Total Count using fast count aggregation
    let totalCount = 0;
    try {
      const countSnap = await queryRef.count().get();
      totalCount = countSnap.data().count || 0;
    } catch (countErr: any) {
      console.warn("[Admin KYC count] failed:", countErr.message);
    }

    // Apply pagination bounds
    let executionQuery = queryRef.limit(limitVal + 1); // fetch 1 extra to check hasMore

    if (lastDocId) {
      const lastDocSnap = await adminDb.collection("users").doc(lastDocId).get();
      if (lastDocSnap.exists) {
        executionQuery = executionQuery.startAfter(lastDocSnap);
      }
    }

    const snap = await executionQuery.get();

    let docs = snap.docs;
    const hasMore = docs.length > limitVal;
    if (hasMore) {
      docs = docs.slice(0, limitVal);
    }

    const pendingUsers = docs.map(doc => {
      const data = doc.data();
      return {
        uid: doc.id,
        name: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim() || "System User",
        email: data.email || "",
        phoneNumber: data.phoneNumber || data.phone || "",
        kycType: data.kycType || (data.bvn ? "bvn" : "nin"),
        kycNumber: data.kycNumber || data.bvn || data.nin || "",
        kycStatus: data.kycStatus || "UNVERIFIED",
        submittedAt: data.kycSubmittedAt || data.createdAt || new Date().toISOString(),
        capturedSelfie: data.capturedSelfie || data.kycCapturedSelfie || null,
        livenessChallenge: data.livenessChallenge || null,
        kycVerifiedAt: data.kycVerifiedAt || null,
        photoURL: data.photoURL || data.avatarUrl || data.profileImage || data.photoUrl || null,
        idCardUrl: data.idCardUrl || data.idDocumentUrl || data.kycIdCardUrl || data.documentUrl || null,
        utilityBillUrl: data.utilityBillUrl || data.proofOfAddressUrl || data.kycUtilityBillUrl || null,
        proofOfAddressUrl: data.proofOfAddressUrl || data.utilityBillUrl || null,
        virtualAccountNumber: data.virtualAccountNumber || data.accountNumber || "",
        virtualAccountBankName: data.virtualAccountBankName || data.bankName || "",
        balance: Number(data.balance) || 0
      };
    });

    return NextResponse.json({
      success: true,
      pendingUsers,
      hasMore,
      totalCount,
      lastDocId: docs.length > 0 ? docs[docs.length - 1].id : ""
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin KYC GET API] Error:", error.message);
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "kyc.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const { uid } = perm.auth;

    const requestBody = await req.json();
    const { action, targetUid, reason, provider } = requestBody;

    if (!targetUid) {
      return NextResponse.json({ error: "Missing target user identifier." }, { status: 400 });
    }

    if (uid === "mock-admin-uid") {
      return NextResponse.json({
        success: true,
        message: `Mock User KYC state marked as ${action === "approve" ? "APPROVED" : "REJECTED"} successfully!`
      });
    }

    // INTERCEPT VERIFY ACTION:
    // "Check Identity" is a visual check done by human admins which transitions state locally in the UI to let them click approve.
    // The payment-gateway does not have a separate verify endpoint, so we return success immediately.
    if (action === "verify") {
      try {
        const { NotificationService } = await import("@/services/notification-service");
        await NotificationService.sendPushNotification(targetUid, {
          title: "Identity Checked! 🔍",
          body: "Your identity details have been verified by system administration.",
          type: "security"
        });
      } catch (notifErr: any) {
        console.warn(`[Admin KYC Verify Push Warning]:`, notifErr.message);
      }

      return NextResponse.json({
        success: true,
        message: "User identity verification completed successfully."
      });
    }

    if (action === "update_user_kyc_info") {
      const { name, email, phoneNumber, kycType, kycNumber } = requestBody;
      const userRef = adminDb.collection("users").doc(targetUid);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        return NextResponse.json({ error: "Target user profile not found." }, { status: 404 });
      }

      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (phoneNumber) updateData.phoneNumber = phoneNumber;
      if (kycType) updateData.kycType = kycType;
      if (kycNumber) {
        updateData.kycNumber = kycNumber;
        if (kycType === "bvn") updateData.bvn = kycNumber;
        if (kycType === "nin") updateData.nin = kycNumber;
      }

      await userRef.update(updateData);

      // Upsert in kyc_submissions if exists or needed
      const subRef = adminDb.collection("kyc_submissions").doc(targetUid);
      const subDoc = await subRef.get();
      if (subDoc.exists) {
        await subRef.update({
          ...(kycType && { documentType: kycType }),
          ...(kycNumber && { documentNumber: kycNumber }),
          updatedAt: new Date().toISOString(),
        });
      }

      return NextResponse.json({
        success: true,
        message: "Customer KYC information updated successfully."
      });
    }

    if (action === "move_to_pending") {
      const nowIso = new Date().toISOString();
      const userRef = adminDb.collection("users").doc(targetUid);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        return NextResponse.json({ error: "Target user profile not found." }, { status: 404 });
      }

      const userData = userDoc.data() || {};
      await userRef.update({
        kycStatus: "PENDING",
        kycSubmittedAt: nowIso,
      });

      const submissionRef = adminDb.collection("kyc_submissions").doc(targetUid);
      await submissionRef.set(
        {
          userId: targetUid,
          documentType: userData.kycType || "bvn",
          documentNumber: userData.bvn || userData.nin || userData.kycNumber || "22222222222",
          status: "PENDING",
          submittedAt: nowIso,
        },
        { merge: true }
      );

      return NextResponse.json({
        success: true,
        message: `User ${userData.name || "profile"} moved to Pending verification queue successfully.`
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    let idToken = authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : "";

    if (!idToken && uid) {
      idToken = await mintFirebaseIdToken(uid);
    }

    const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

    if (action === "approve") {
      if (!provider || (provider !== "flutterwave" && provider !== "squad")) {
        return NextResponse.json({ error: "A valid provider ('flutterwave' or 'squad') must be explicitly selected." }, { status: 400 });
      }

      const assignedTier = requestBody.tier || "Tier 2";
      const customDaily = requestBody.dailyLimit !== undefined && requestBody.dailyLimit !== null && requestBody.dailyLimit !== "" ? Number(requestBody.dailyLimit) : undefined;
      const customSingle = requestBody.singleLimit !== undefined && requestBody.singleLimit !== null && requestBody.singleLimit !== "" ? Number(requestBody.singleLimit) : undefined;
      const customMaxBalance = requestBody.maxBalance !== undefined && requestBody.maxBalance !== null && requestBody.maxBalance !== "" ? Number(requestBody.maxBalance) : undefined;

      const limits = await resolveTierLimits(assignedTier, customDaily, customSingle, customMaxBalance);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`
      };
      if (gatewayApiKey) headers["x-api-key"] = gatewayApiKey;

      const response = await fetch(`${GATEWAY_URL}/api/admin/kyc/${targetUid}/approve`, {
        method: "POST",
        headers,
        body: JSON.stringify({ provider })
      });

      const result = await parseResponseJson(response, "Failed to approve KYC in gateway.");
      if (!response.ok) {
        return NextResponse.json({ error: result.message || "Failed to approve KYC in gateway." }, { status: response.status });
      }

      // Update user and wallet documents in Firestore globally with approved Tier level and limits
      const adminEmail = perm.auth?.email || "admin@system";
      const customBalance = requestBody.balance !== undefined && requestBody.balance !== null && requestBody.balance !== "" ? Number(requestBody.balance) : undefined;

      const userUpdatePayload: Record<string, any> = {
        tier: assignedTier,
        dailyLimit: limits.dailyLimit,
        dailyTransferLimit: limits.dailyLimit,
        singleLimit: limits.singleLimit,
        maxSingleTransferLimit: limits.singleLimit,
        maxBalance: limits.maxBalance,
        maxAccountBalance: limits.maxBalance,
        hasCustomLimits: limits.hasCustomLimits,
        kycStatus: "VERIFIED",
        kycVerifiedAt: new Date().toISOString(),
        kycVerifiedBy: adminEmail,
        updatedAt: new Date().toISOString(),
      };

      if (typeof customBalance === "number" && !isNaN(customBalance) && customBalance >= 0) {
        userUpdatePayload.balance = customBalance;
      }

      await adminDb.collection("users").doc(targetUid).set(userUpdatePayload, { merge: true });

      const walletUpdatePayload: Record<string, any> = {
        tier: assignedTier,
        dailyLimit: limits.dailyLimit,
        dailyTransferLimit: limits.dailyLimit,
        singleLimit: limits.singleLimit,
        maxSingleTransferLimit: limits.singleLimit,
        maxBalance: limits.maxBalance,
        maxAccountBalance: limits.maxBalance,
        hasCustomLimits: limits.hasCustomLimits,
        updatedAt: new Date().toISOString(),
      };

      if (typeof customBalance === "number" && !isNaN(customBalance) && customBalance >= 0) {
        walletUpdatePayload.balance = customBalance;
      }

      await adminDb.collection("wallets").doc(`${targetUid}_NGN`).set(walletUpdatePayload, { merge: true });

      // Auto-release any pending held deposits for this user now that KYC is approved
      await autoReleaseUserHeldDeposits(targetUid, adminEmail);

      try {
        const { NotificationService } = await import("@/services/notification-service");
        await NotificationService.sendPushNotification(targetUid, {
          title: "KYC Verified! 🎉",
          body: `Congratulations! Your identity verification has been approved for ${assignedTier}. Your daily transfer limit is ₦${limits.dailyLimit.toLocaleString("en-NG")}.`,
          type: "security"
        });
      } catch (notifErr: any) {
        console.warn(`[Admin KYC Push Notification Warning]:`, notifErr.message);
      }

      return NextResponse.json({
        success: true,
        message: `User KYC successfully approved and static virtual account provisioned via ${provider}!`
      });

    } else if (action === "reject") {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`
      };
      if (gatewayApiKey) headers["x-api-key"] = gatewayApiKey;

      const response = await fetch(`${GATEWAY_URL}/api/admin/kyc/${targetUid}/reject`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reason })
      });

      const result = await parseResponseJson(response, "Failed to reject KYC in gateway.");
      if (!response.ok) {
        return NextResponse.json({ error: result.message || "Failed to reject KYC in gateway." }, { status: response.status });
      }

      return NextResponse.json({
        success: true,
        message: "User KYC rejected and notification dispatched successfully."
      });

    } else if (action === "retry") {
      if (!provider || (provider !== "flutterwave" && provider !== "squad")) {
        return NextResponse.json({ error: "A valid provider ('flutterwave' or 'squad') must be explicitly selected for retry." }, { status: 400 });
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`
      };
      if (gatewayApiKey) headers["x-api-key"] = gatewayApiKey;

      const response = await fetch(`${GATEWAY_URL}/api/admin/kyc/${targetUid}/retry-provisioning`, {
        method: "POST",
        headers,
        body: JSON.stringify({ provider })
      });

      const result = await parseResponseJson(response, "Failed to retry virtual account provisioning.");
      if (!response.ok) {
        return NextResponse.json({ error: result.message || "Failed to retry virtual account provisioning." }, { status: response.status });
      }

      return NextResponse.json({
        success: true,
        message: `Virtual account successfully provisioned on retry via ${provider}!`
      });

    } else if (action === "reset_kyc") {
      if (uid === "mock-admin-uid") {
        return NextResponse.json({
          success: true,
          message: "Mock User KYC status has been successfully reset to UNVERIFIED."
        });
      }

      const userRef = adminDb.collection("users").doc(targetUid);
      await userRef.update({
        kycStatus: "UNVERIFIED",
        kycHashedId: null,
        kycVerifiedAt: null,
        kycRejectedAt: null,
        kycRejectionReason: "Administrative Reset",
        bvn: null,
        nin: null
      });

      try {
        const subQuery = await adminDb.collection("kyc_submissions")
          .where("userId", "==", targetUid)
          .get();
        const batch = adminDb.batch();
        subQuery.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      } catch (subErr: any) {
        console.error(`[Admin KYC reset_kyc] Error deleting submissions:`, subErr.message);
      }

      return NextResponse.json({
        success: true,
        message: "User KYC status has been successfully reset to UNVERIFIED, requesting new submission."
      });

    } else if (action === "delete_unverified") {
      if (uid === "mock-admin-uid") {
        return NextResponse.json({
          success: true,
          message: "Mock Unverified User successfully deleted from system records."
        });
      }

      const targetUserDoc = await adminDb.collection("users").doc(targetUid).get();
      if (!targetUserDoc.exists) {
        return NextResponse.json({ error: "User profile not found in system records." }, { status: 404 });
      }

      const targetData = targetUserDoc.data() || {};
      if (targetData.kycStatus === "VERIFIED") {
        return NextResponse.json({ error: "Access denied: Verified users cannot be deleted from the KYC Verification queue." }, { status: 403 });
      }

      if (targetData.role === "admin" || targetData.role === "SUPER_ADMIN") {
        return NextResponse.json({ error: "Access denied: Administrative accounts cannot be deleted." }, { status: 403 });
      }

      const { deleteFirebaseAuthUser } = await import("@/lib/firebase-auth-rest");
      try {
        await deleteFirebaseAuthUser(targetUid);
      } catch (authErr: any) {
        console.warn(`[Admin KYC delete_unverified] User not found or error in Firebase Auth:`, authErr.message);
      }

      await adminDb.collection("users").doc(targetUid).delete();

      try {
        const batch = adminDb.batch();

        // Delete wallet docs by query
        const walletsQuery = await adminDb.collection("wallets")
          .where("userId", "==", targetUid)
          .get();
        walletsQuery.forEach(doc => {
          batch.delete(doc.ref);
        });

        // Delete explicit multi-currency wallet doc IDs
        batch.delete(adminDb.collection("wallets").doc(`${targetUid}_NGN`));
        batch.delete(adminDb.collection("wallets").doc(`${targetUid}_USD`));
        batch.delete(adminDb.collection("wallets").doc(`${targetUid}_XOF`));

        // Delete kyc_submissions
        const subQuery = await adminDb.collection("kyc_submissions")
          .where("userId", "==", targetUid)
          .get();
        subQuery.forEach(doc => {
          batch.delete(doc.ref);
        });
        batch.delete(adminDb.collection("kyc_submissions").doc(targetUid));

        await batch.commit();
      } catch (colErr: any) {
        console.warn(`[Admin KYC delete_unverified] Error deleting sub-collections:`, colErr.message);
      }

      return NextResponse.json({
        success: true,
        message: "User profile and associated data permanently purged from the server."
      });

    } else {
      return NextResponse.json({ error: "Invalid KYC action request." }, { status: 400 });
    }

  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin KYC POST API] Error:", error.message);
    return NextResponse.json({ error: "Operation failed", details: error.message }, { status: 500 });
  }
}
