import { NextResponse } from "next/server";
import { authenticateUserRequest } from "@/lib/auth-util";
import { safeParseJson } from "@/lib/utils";
import { adminDb } from "@/lib/firebase-admin";
import { getGatewayUrl } from "@/lib/gateway-util";

export async function GET(req: Request) {
  let network = "";
  let uid = "";

  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
  } catch (e) {
    // If unauthenticated, still allow fallback loading without crash
  }

  try {
    const idToken = req.headers.get("Authorization")?.split("Bearer ")[1] || "mock-token";

    const { searchParams } = new URL(req.url);
    network = searchParams.get("network") || "";

    const gatewayUrl = getGatewayUrl();
    const apiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

    // Retrieve admin global custom profit margin setting from Firestore to apply markup dynamically
    let profitMargin = 0;
    if (adminDb) {
      try {
        const marginSnap = await adminDb.collection("config").doc("vtu_profit_margins").get();
        if (marginSnap.exists) {
          profitMargin = Number(marginSnap.data()?.dataProfitMargin) || 0;
        }
      } catch (dbErr) {
        console.warn("[Plans Profit Margin] Failed to read config profitMargin:", dbErr);
      }
    }

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${idToken}`,
    };
    if (apiKey) headers["x-api-key"] = apiKey;

    const gatewayRes = await fetch(`${gatewayUrl}/api/vtu/data/plans?network=${network}`, {
      method: "GET",
      headers,
    });

    if (!gatewayRes.ok) {
      const errText = await gatewayRes.text();
      console.warn(`[Data Plans Gateway Fallback Activated]: ${gatewayRes.status} - ${errText}`);

      // Fallback: Read directly from Firestore plans cache persistently (fully dynamic fallback)
      let dbPlans: any[] = [];
      if (adminDb) {
        try {
          const cacheSnap = await adminDb.collection("config").doc("vtu_data_plans_cache").get();
          if (cacheSnap.exists) {
            const cacheData = cacheSnap.data();
            if (cacheData && cacheData.plans) {
              const normNetwork = network.trim().toUpperCase();
              dbPlans = cacheData.plans[normNetwork] || Object.values(cacheData.plans).flat();
            }
          }
        } catch (dbErr) {
          console.warn("[Plans DB Fallback Error] Failed to read vtu_data_plans_cache:", dbErr);
        }
      }

      // Apply Profit Margin dynamically on DB plans
      const plans = dbPlans.map(p => {
        const amt = Number(p.amount || p.price || 0) + profitMargin;
        return {
          ...p,
          amount: amt,
          price: amt
        };
      });

      return NextResponse.json({
        success: true,
        data: plans
      });
    }

    const resData = await safeParseJson(gatewayRes);

    // Apply Profit Margin dynamically on RETRIEVED API PLANS
    if (resData && Array.isArray(resData.data)) {
      resData.data = resData.data.map((p: any) => {
        const amt = Number(p.amount || p.price || 0) + profitMargin;
        return {
          ...p,
          amount: amt,
          price: amt
        };
      });
    }

    return NextResponse.json(resData);
  } catch (err: unknown) {
    const error = err as Error;
    console.warn("[Data Plans Route Exception Fallback Activated]:", error.message);

    // Retrieve admin global custom profit margin setting from Firestore for exception path
    let profitMargin = 0;
    if (adminDb) {
      try {
        const marginSnap = await adminDb.collection("config").doc("vtu_profit_margins").get();
        if (marginSnap.exists) {
          profitMargin = Number(marginSnap.data()?.dataProfitMargin) || 0;
        }
      } catch (dbErr) {}
    }

    // Fallback: Read directly from Firestore plans cache persistently (fully dynamic fallback)
    let dbPlans: any[] = [];
    if (adminDb) {
      try {
        const cacheSnap = await adminDb.collection("config").doc("vtu_data_plans_cache").get();
        if (cacheSnap.exists) {
          const cacheData = cacheSnap.data();
          if (cacheData && cacheData.plans) {
            const normNetwork = network.trim().toUpperCase();
            dbPlans = cacheData.plans[normNetwork] || Object.values(cacheData.plans).flat();
          }
        }
      } catch (dbErr) {}
    }

    const plans = dbPlans.map(p => {
      const amt = Number(p.amount || p.price || 0) + profitMargin;
      return {
        ...p,
        amount: amt,
        price: amt
      };
    });

    return NextResponse.json({
      success: true,
      data: plans
    });
  }
}
