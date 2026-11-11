import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getGlobalMinTransferAmount, DEFAULT_GLOBAL_MIN_TRANSFER } from "@/lib/global-limits-util";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "limits.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const { searchParams } = new URL(req.url);
    const searchQuery = (searchParams.get("search") || searchParams.get("q") || "").trim().toLowerCase();

    // Fetch active global minimum transfer limit & app config doc
    const globalMinTransferAmount = await getGlobalMinTransferAmount();
    const appDoc = await adminDb.collection("config").doc("app").get();
    const appData = appDoc.exists ? appDoc.data() : {};

    const tier2DailyLimit = appData?.tier2DailyLimit ?? 5000000;
    const tier2SingleLimit = appData?.tier2SingleLimit ?? 2000000;
    const tier3DailyLimit = appData?.tier3DailyLimit ?? 50000000;
    const tier3SingleLimit = appData?.tier3SingleLimit ?? 10000000;
    const tierUpgradeSelectionTitle = appData?.tierUpgradeSelectionTitle || "SELECT TARGET UPGRADE TIER";
    const acceptableGovernmentIds = Array.isArray(appData?.acceptableGovernmentIds) && appData.acceptableGovernmentIds.length > 0
      ? appData.acceptableGovernmentIds
      : ["National ID Card (NIN)", "International Passport", "Driver's License", "Voter's Card"];

    if (!searchQuery) {
      return NextResponse.json({
        success: true,
        globalMinTransferAmount,
        tier2DailyLimit,
        tier2SingleLimit,
        tier3DailyLimit,
        tier3SingleLimit,
        tierUpgradeSelectionTitle,
        acceptableGovernmentIds,
        users: []
      });
    }

    const usersSnap = await adminDb.collection("users").get();
    const results: any[] = [];

    usersSnap.forEach((doc) => {
      const data = doc.data();
      const email = (data.email || "").toLowerCase();
      const phone = (data.phoneNumber || data.phone || "").toLowerCase();
      const name = (data.name || data.displayName || `${data.firstName || ""} ${data.lastName || ""}`).toLowerCase();
      const bvn = (data.bvn || data.nin || "").toLowerCase();

      if (
        email.includes(searchQuery) ||
        phone.includes(searchQuery) ||
        name.includes(searchQuery) ||
        bvn.includes(searchQuery)
      ) {
        results.push({
          uid: doc.id,
          name: data.name || data.displayName || `${data.firstName || ""} ${data.lastName || ""}`.trim() || "User",
          email: data.email || "",
          phoneNumber: data.phoneNumber || data.phone || "",
          dailyTransferLimit: data.dailyTransferLimit !== undefined ? Number(data.dailyTransferLimit) : 500000,
          maxSingleTransferLimit: data.maxSingleTransferLimit !== undefined ? Number(data.maxSingleTransferLimit) : 200000,
          dailyDepositLimit: data.dailyDepositLimit !== undefined ? Number(data.dailyDepositLimit) : 1000000,
          unlimitedTransfers: !!data.unlimitedTransfers,
          unlimitedDeposits: !!data.unlimitedDeposits,
          updatedAt: data.updatedAt || "",
        });
      }
    });

    return NextResponse.json({
      success: true,
      globalMinTransferAmount,
      users: results,
      count: results.length,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Limits GET Error]:", error.message);
    return NextResponse.json({ error: "Failed to search user limits", details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "limits.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();

    // Dedicated action for updating global minimum transfer amount & tier upgrade defaults
    if (body.action === "update_global_min_transfer" || (body.globalMinTransferAmount !== undefined && !body.targetUid && !body.uid)) {
      const newMin = Math.max(0, Number(body.globalMinTransferAmount ?? body.amount ?? DEFAULT_GLOBAL_MIN_TRANSFER));
      if (isNaN(newMin)) {
        return NextResponse.json({ error: "Invalid global minimum transfer amount. Must be a valid number." }, { status: 400 });
      }

      const nowIso = new Date().toISOString();
      const limitsRef = adminDb.collection("config").doc("limits");
      const appRef = adminDb.collection("config").doc("app");

      const updateConfig: Record<string, any> = {
        globalMinTransferAmount: newMin,
        minTransferAmount: newMin,
        updatedAt: nowIso,
      };

      if (body.tier2DailyLimit !== undefined) updateConfig.tier2DailyLimit = Number(body.tier2DailyLimit);
      if (body.tier2SingleLimit !== undefined) updateConfig.tier2SingleLimit = Number(body.tier2SingleLimit);
      if (body.tier3DailyLimit !== undefined) updateConfig.tier3DailyLimit = Number(body.tier3DailyLimit);
      if (body.tier3SingleLimit !== undefined) updateConfig.tier3SingleLimit = Number(body.tier3SingleLimit);
      if (body.tierUpgradeSelectionTitle !== undefined) updateConfig.tierUpgradeSelectionTitle = String(body.tierUpgradeSelectionTitle).trim();
      if (Array.isArray(body.acceptableGovernmentIds)) {
        updateConfig.acceptableGovernmentIds = body.acceptableGovernmentIds.map((item: any) => String(item).trim()).filter(Boolean);
      }

      await limitsRef.set(updateConfig, { merge: true });
      await appRef.set(updateConfig, { merge: true });

      return NextResponse.json({
        success: true,
        message: `Global limits & Tier Upgrade settings updated successfully!`,
        globalMinTransferAmount: newMin,
        ...updateConfig,
      });
    }

    const {
      targetUid,
      uid,
      dailyTransferLimit,
      maxSingleTransferLimit,
      dailyDepositLimit,
      unlimitedTransfers,
      unlimitedDeposits,
    } = body;

    const userUid = targetUid || uid;

    if (!userUid) {
      return NextResponse.json({ error: "Missing required parameter: userUid" }, { status: 400 });
    }

    const userRef = adminDb.collection("users").doc(userUid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: "Target user profile not found." }, { status: 404 });
    }

    const updatePayload: Record<string, any> = {
      hasCustomLimits: true,
      updatedAt: new Date().toISOString(),
    };

    if (dailyTransferLimit !== undefined) updatePayload.dailyTransferLimit = Number(dailyTransferLimit);
    if (maxSingleTransferLimit !== undefined) updatePayload.maxSingleTransferLimit = Number(maxSingleTransferLimit);
    if (dailyDepositLimit !== undefined) updatePayload.dailyDepositLimit = Number(dailyDepositLimit);
    if (unlimitedTransfers !== undefined) updatePayload.unlimitedTransfers = !!unlimitedTransfers;
    if (unlimitedDeposits !== undefined) updatePayload.unlimitedDeposits = !!unlimitedDeposits;

    await userRef.set(updatePayload, { merge: true });

    return NextResponse.json({
      success: true,
      message: "User account limits updated successfully!",
      userUid,
      ...updatePayload,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Limits POST Error]:", error.message);
    return NextResponse.json({ error: "Failed to update limits", details: error.message }, { status: 500 });
  }
}
