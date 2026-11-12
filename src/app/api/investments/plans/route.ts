import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { DEFAULT_SAVINGS_PLANS, SavingsPlanData } from "@/lib/savings-plans-types";

export async function GET() {
  try {
    const plansSnap = await adminDb.collection("config").doc("investment_plans").get();
    let plans: SavingsPlanData[] = DEFAULT_SAVINGS_PLANS;

    if (plansSnap.exists) {
      const data = plansSnap.data();
      if (Array.isArray(data?.plans) && data.plans.length > 0) {
        plans = data.plans;
      }
    }

    // Filter only ACTIVE plans for public users
    const activePlans = plans.filter((p) => p.status !== "INACTIVE");

    return NextResponse.json({
      success: true,
      plans: activePlans,
    });
  } catch (err: unknown) {
    console.warn("[Public Savings Plans API Warning] Database read fallback to default active plans.");
    const activeDefaults = DEFAULT_SAVINGS_PLANS.filter((p) => p.status !== "INACTIVE");
    return NextResponse.json({
      success: true,
      plans: activeDefaults,
    });
  }
}
