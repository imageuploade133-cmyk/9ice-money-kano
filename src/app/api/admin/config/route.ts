import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { NotificationService } from "@/services/notification-service";

/**
 * Server-side config sanitization helper.
 * Strictly strips sensitive secret keys (e.g. imgbbApiKey) from any config object
 * before returning it to browser clients.
 */
function sanitizeConfigDoc<T extends Record<string, any>>(config: T): T {
  if (!config || typeof config !== "object") return config;
  const { imgbbApiKey, secretKey, apiKey, ...sanitized } = config;
  return sanitized as T;
}

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "branding.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    // 1. Get base visual configurations from config/app
    let baseConfig: any = {};
    try {
      const docSnap = await adminDb.collection("config").doc("app").get();
      if (docSnap.exists) {
        baseConfig = docSnap.data() || {};
      }
    } catch (err: any) {
      console.warn("[Admin Config GET API] Base config read failed, using empty:", err.message);
    }

    // 2. Perform low-cost structured aggregations on Firestore collections
    let totalUsers = 0;
    let globalNgnBalance = 0;
    let globalUsdBalance = 0;
    let globalXofBalance = 0;
    let totalFixedDeposit = 0;
    let todayDeposit = 0;
    let todayTransfer = 0;
    let todayPayout = 0;
    let todayNetFlow = 0;
    let totalAirtimePurchase = 0;
    let totalBonus = 0;

    // A. Count total users using cost-efficient count() aggregation query
    try {
      const usersCountSnap = await adminDb.collection("users").count().get();
      totalUsers = usersCountSnap.data().count || 0;
    } catch (err: any) {
      console.warn("[Admin Config GET API] users count aggregation failed:", err.message);
    }

    // B. Calculate global NGN, USD, XOF pool balances and Bonus balances from wallets
    try {
      const walletsSnap = await adminDb.collection("wallets").get();
      walletsSnap.forEach((doc) => {
        const data = doc.data() || {};
        const currency = String(data.currency || "").toUpperCase();
        const bal = Number(data.balance) || 0;
        const bonus = Number(data.bonusBalance) || 0;

        if (currency === "NGN" || doc.id.endsWith("_NGN")) {
          globalNgnBalance += bal;
        } else if (currency === "USD" || doc.id.endsWith("_USD")) {
          globalUsdBalance += bal;
        } else if (currency === "XOF" || doc.id.endsWith("_XOF")) {
          globalXofBalance += bal;
        }

        totalBonus += bonus;
      });
    } catch (err: any) {
      console.warn("[Admin Config GET API] Wallets sum failed:", err.message);
    }

    // C. Sum active fixed deposits
    try {
      const activeInvestmentsSnap = await adminDb.collection("investments")
        .where("status", "==", "ACTIVE")
        .get();
      activeInvestmentsSnap.forEach((doc) => {
        const data = doc.data();
        if (data.type === "fixed_deposit" || data.planType === "fixed_deposit") {
          totalFixedDeposit += Number(data.amount) || 0;
        }
      });
    } catch (err: any) {
      console.warn("[Admin Config GET API] active fixed deposits sum failed:", err.message);
    }

    // D. Sum today's transactions (deposits, transfers, payouts, net flow)
    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const todayTxSnap = await adminDb.collection("transactions")
        .where("createdAt", ">=", startOfToday.toISOString())
        .get();

      const payoutTypes = ["TRANSFER", "WITHDRAWAL", "CASHOUT", "AIRTIME", "DATA", "BILLS", "UTILITY", "CABLE", "ELECTRICITY", "STORE_PURCHASE", "CARD_FUND"];
      const depositTypes = ["DEPOSIT", "VIRTUAL_ACCOUNT_DEPOSIT", "WALLET_FUNDING"];

      todayTxSnap.forEach((doc) => {
        const data = doc.data() || {};
        const debitedAmt = Number(data.totalDebited) || Number(data.amount) || 0;
        const creditedAmt = Number(data.totalCredited) || Number(data.amount) || 0;

        if (data.status === "SUCCESS") {
          if (depositTypes.includes(data.type) || (data.direction === "CREDIT" && data.type !== "REFUND")) {
            todayDeposit += creditedAmt;
          } else if (payoutTypes.includes(data.type) || data.direction === "DEBIT") {
            todayPayout += debitedAmt;
            if (data.type === "TRANSFER") {
              todayTransfer += debitedAmt;
            }
          }
        }
      });
      todayNetFlow = todayDeposit - todayPayout;
    } catch (err: any) {
      console.warn("[Admin Config GET API] today's transactions sum failed:", err.message);
    }

    // E. Sum total successful airtime purchases
    try {
      const airtimeTxSnap = await adminDb.collection("transactions")
        .where("type", "==", "AIRTIME")
        .where("status", "==", "SUCCESS")
        .get();
      airtimeTxSnap.forEach((doc) => {
        totalAirtimePurchase += Number(doc.data().amount) || 0;
      });
    } catch (err: any) {
      console.warn("[Admin Config GET API] airtime purchases sum failed:", err.message);
    }

    // H. Low-Cost Aggregations for Transfer Profit and Data Profit (Uses count() aggregation: 1 read per 1,000 txs)
    let totalTransferProfit = 0;
    let totalDataProfit = 0;
    try {
      let dataProfitMargin = 0;
      let transferProfitMargin = 0;

      const marginSnap = await adminDb.collection("config").doc("vtu_profit_margins").get();
      if (marginSnap.exists) {
        const marginData = marginSnap.data();
        dataProfitMargin = Number(marginData?.dataProfitMargin) || 0;
        transferProfitMargin = Number(marginData?.transferProfitMargin) || 0;
      }

      // Calculate transfer profit based on count() aggregation query (1 read per 1,000 txs)
      const transferCountSnap = await adminDb.collection("transactions")
        .where("type", "==", "TRANSFER")
        .where("status", "==", "SUCCESS")
        .count()
        .get();
      const transferCount = transferCountSnap.data().count || 0;
      totalTransferProfit = transferCount * transferProfitMargin;

      // Calculate data profit based on count() aggregation query (1 read per 1,000 txs)
      const dataCountSnap = await adminDb.collection("transactions")
        .where("type", "==", "DATA")
        .where("status", "==", "SUCCESS")
        .count()
        .get();
      const dataCount = dataCountSnap.data().count || 0;
      totalDataProfit = dataCount * dataProfitMargin;
    } catch (err: any) {
      console.warn("[Admin Config GET API] profit aggregation failed:", err.message);
    }

    let hasCustomImgbbApiKey = false;
    try {
      const secretsSnap = await adminDb.collection("config").doc("app_secrets").get();
      if (secretsSnap.exists && secretsSnap.data()?.imgbbApiKey) {
        hasCustomImgbbApiKey = Boolean(
          typeof secretsSnap.data()?.imgbbApiKey === "string" &&
          secretsSnap.data()?.imgbbApiKey.trim().length > 0
        );
      } else {
        hasCustomImgbbApiKey = Boolean(
          baseConfig.imgbbApiKey &&
          typeof baseConfig.imgbbApiKey === "string" &&
          baseConfig.imgbbApiKey.trim().length > 0
        );
      }
    } catch {
      hasCustomImgbbApiKey = Boolean(
        baseConfig.imgbbApiKey &&
        typeof baseConfig.imgbbApiKey === "string" &&
        baseConfig.imgbbApiKey.trim().length > 0
      );
    }

    // 3. Compile and merge aggregated values into config object
    const mergedConfig = {
      ...baseConfig,
      hasCustomImgbbApiKey,
      totalUsers,
      globalNgnBalance,
      globalUsdBalance,
      globalXofBalance,
      totalFixedDeposit,
      todayDeposit,
      todayTransfer,
      todayPayout,
      todayNetFlow,
      totalAirtimePurchase,
      totalBonus,
      totalTransferProfit,
      totalDataProfit,
    };

    // REQUIREMENT 3 & 4: Ensure raw imgbbApiKey is NEVER returned to browser clients
    const safeConfig = sanitizeConfigDoc(mergedConfig);

    return NextResponse.json({ success: true, config: safeConfig });
  } catch (err: any) {
    console.error("[Admin Config GET API] Exception:", err.message);
    return NextResponse.json({ error: "Unauthorized or server exception", details: err.message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "branding.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const updates = await req.json() || {};

    // Check if custom ImgBB API key is being updated or explicitly cleared
    let customImgbbApiKeyUpdate: string | undefined = undefined;
    let shouldClearImgbbApiKey = false;

    if ("imgbbApiKey" in updates) {
      const val = updates.imgbbApiKey;
      if (val === "" || val === null || updates.clearImgbbApiKey === true) {
        shouldClearImgbbApiKey = true;
      } else if (typeof val === "string" && val.trim().length > 0 && val.trim() !== "••••••••") {
        customImgbbApiKeyUpdate = val.trim();
      }
    } else if (updates.clearImgbbApiKey === true) {
      shouldClearImgbbApiKey = true;
    }

    // Sanitize non-sensitive updates for client response / config save
    const sanitizedUpdates = (updates && typeof updates === "object")
      ? sanitizeConfigDoc(updates)
      : updates;

    delete (sanitizedUpdates as any).clearImgbbApiKey;

    // Fetch previous app version before committing updates
    let oldAppVersion = "";
    try {
      const prevDocSnap = await adminDb.collection("config").doc("app").get();
      if (prevDocSnap.exists) {
        oldAppVersion = (prevDocSnap.data()?.appVersion || "").trim();
      }
    } catch {
      // Ignore read failure
    }

    // Secure Firestore write with await
    await adminDb.collection("config").doc("app").set(sanitizedUpdates, { merge: true });

    // Check if appVersion was updated to a new version, and broadcast push notifications to users if enabled
    const newAppVersion = typeof sanitizedUpdates?.appVersion === "string" ? sanitizedUpdates.appVersion.trim() : "";
    const isPushNotificationEnabled = sanitizedUpdates?.appVersionPushNotificationEnabled !== false;

    if (newAppVersion && newAppVersion !== oldAppVersion && isPushNotificationEnabled) {
      await NotificationService.broadcastAppUpdateNotification(newAppVersion).catch((err) => {
        console.error("[Admin Config POST] Broadcast update notification error:", err?.message || err);
      });
    }

    // Handle ImgBB API Key updates securely in admin-isolated config/app_secrets
    if (customImgbbApiKeyUpdate) {
      await adminDb.collection("config").doc("app_secrets").set({ imgbbApiKey: customImgbbApiKeyUpdate, updatedAt: new Date().toISOString() }, { merge: true });
      await adminDb.collection("config").doc("app").set({ hasCustomImgbbApiKey: true, imgbbApiKey: "" }, { merge: true });
    } else if (shouldClearImgbbApiKey) {
      await adminDb.collection("config").doc("app_secrets").set({ imgbbApiKey: "", updatedAt: new Date().toISOString() }, { merge: true });
      await adminDb.collection("config").doc("app").set({ hasCustomImgbbApiKey: false, imgbbApiKey: "" }, { merge: true });
    }

    // Fetch the updated document to return authoritative server data
    const updatedDoc = await adminDb.collection("config").doc("app").get();
    const updatedData = updatedDoc.data() || {};

    let hasCustomImgbbApiKey = false;
    try {
      const secretsSnap = await adminDb.collection("config").doc("app_secrets").get();
      if (secretsSnap.exists && secretsSnap.data()?.imgbbApiKey) {
        hasCustomImgbbApiKey = Boolean(
          typeof secretsSnap.data()?.imgbbApiKey === "string" &&
          secretsSnap.data()?.imgbbApiKey.trim().length > 0
        );
      } else {
        hasCustomImgbbApiKey = Boolean(updatedData.hasCustomImgbbApiKey);
      }
    } catch {
      hasCustomImgbbApiKey = Boolean(updatedData.hasCustomImgbbApiKey);
    }

    const safeUpdatedConfig = {
      ...sanitizeConfigDoc(updatedData),
      hasCustomImgbbApiKey,
    };

    return NextResponse.json({
      success: true,
      message: "Branding and app configuration updated successfully!",
      config: safeUpdatedConfig,
    });
  } catch (err: any) {
    console.error("[Admin Config POST API] Error:", err.message);
    return NextResponse.json({ error: "Operation failed", details: err.message }, { status: 500 });
  }
}
