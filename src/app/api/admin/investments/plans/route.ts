import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { SavingsPlanData, DEFAULT_SAVINGS_PLANS } from "@/lib/savings-plans-types";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "investments.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const plansSnap = await adminDb.collection("config").doc("investment_plans").get();
    let plans: SavingsPlanData[] = DEFAULT_SAVINGS_PLANS;

    if (plansSnap.exists) {
      const data = plansSnap.data();
      if (Array.isArray(data?.plans) && data.plans.length > 0) {
        plans = data.plans;
      }
    }

    return NextResponse.json({
      success: true,
      plans,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Investment Plans GET Error]:", error.message);
    return NextResponse.json({ error: "Failed to load savings plans", details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "investments.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const { action, plan, plans } = body;

    const nowIso = new Date().toISOString();
    const configRef = adminDb.collection("config").doc("investment_plans");

    // Action 1: Replace entire plans array or save updated plans
    if (action === "save_all" && Array.isArray(plans)) {
      await configRef.set({
        plans,
        updatedAt: nowIso,
      }, { merge: true });

      return NextResponse.json({
        success: true,
        message: "All savings plans updated successfully!",
        plans,
      });
    }

    // Action 2: Add or update single plan
    if (action === "upsert" && plan && plan.name) {
      const currentSnap = await configRef.get();
      let existingPlans: SavingsPlanData[] = DEFAULT_SAVINGS_PLANS;
      if (currentSnap.exists && Array.isArray(currentSnap.data()?.plans)) {
        existingPlans = currentSnap.data()?.plans;
      }

      const planId = plan.id || `plan-${Date.now()}`;
      const newPlan: SavingsPlanData = {
        id: planId,
        name: String(plan.name).trim(),
        description: String(plan.description || "").trim(),
        type: plan.type === "FIXED_DEPOSIT" ? "FIXED_DEPOSIT" : "SAVINGS",
        logoUrl: plan.logoUrl || "https://i.ibb.co/WWjZrtC7/E-Tech.png",
        badgeTag: plan.badgeTag ? String(plan.badgeTag).toUpperCase().trim() : "",
        apr: Math.max(0, Number(plan.apr) || 10),
        interestType: plan.interestType === "COMPOUND" ? "COMPOUND" : "SIMPLE",
        allowMonths: plan.allowMonths !== false,
        monthOptions: Array.isArray(plan.monthOptions) && plan.monthOptions.length > 0 ? plan.monthOptions.map(Number) : [1, 3, 6, 9],
        allowYears: plan.allowYears !== false,
        yearOptions: Array.isArray(plan.yearOptions) && plan.yearOptions.length > 0 ? plan.yearOptions.map(Number) : [1, 2, 3],
        allowCustom: plan.allowCustom !== false,
        minCustomDays: Math.max(1, Number(plan.minCustomDays) || 7),
        maxCustomDays: Math.max(1, Number(plan.maxCustomDays) || 1095),
        defaultDurationDays: Math.max(1, Number(plan.defaultDurationDays) || 30),
        isAmountRequired: plan.isAmountRequired !== false,
        minInvestment: Math.max(0, Number(plan.minInvestment) || 1000),
        maxInvestment: Math.max(1000, Number(plan.maxInvestment) || 10000000),
        status: plan.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
        createdAt: plan.createdAt || nowIso,
        updatedAt: nowIso,
      };

      const existingIndex = existingPlans.findIndex((p) => p.id === planId);
      let updatedPlans: SavingsPlanData[];
      if (existingIndex >= 0) {
        updatedPlans = [...existingPlans];
        updatedPlans[existingIndex] = newPlan;
      } else {
        updatedPlans = [newPlan, ...existingPlans];
      }

      await configRef.set({
        plans: updatedPlans,
        updatedAt: nowIso,
      }, { merge: true });

      return NextResponse.json({
        success: true,
        message: `Savings plan "${newPlan.name}" saved successfully!`,
        plan: newPlan,
        plans: updatedPlans,
      });
    }

    // Action 3: Delete plan
    if (action === "delete" && body.planId) {
      const currentSnap = await configRef.get();
      let existingPlans: SavingsPlanData[] = DEFAULT_SAVINGS_PLANS;
      if (currentSnap.exists && Array.isArray(currentSnap.data()?.plans)) {
        existingPlans = currentSnap.data()?.plans;
      }

      const updatedPlans = existingPlans.filter((p) => p.id !== body.planId);
      await configRef.set({
        plans: updatedPlans,
        updatedAt: nowIso,
      }, { merge: true });

      return NextResponse.json({
        success: true,
        message: "Savings plan deleted successfully!",
        plans: updatedPlans,
      });
    }

    return NextResponse.json({ error: "Invalid action or parameters." }, { status: 400 });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Investment Plans POST Error]:", error.message);
    return NextResponse.json({ error: "Failed to update savings plans", details: error.message }, { status: 500 });
  }
}
