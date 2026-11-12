import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

interface AutoInflowDeductionConfig {
  enabled: boolean;
  minThreshold: number; // Minimum deposit amount to trigger fee (e.g., 1000)
  chargeType: "FIXED" | "PERCENTAGE"; // Fixed amount or percentage
  feeAmount: number; // e.g. 50 (for NGN 50) or 1.5 (for 1.5%)
  maxFeeCap: number; // Maximum fee cap for percentage charges (0 = no cap)
  feeNarration: string; // e.g. "Stamp Duty Charge" or "Inflow Processing Fee"
  exemptVirtualAccounts?: boolean; // Whether to exempt virtual account deposits
  updatedAt?: string;
  updatedBy?: string;
}

const DEFAULT_INFLOW_DEDUCTION_CONFIG: AutoInflowDeductionConfig = {
  enabled: false,
  minThreshold: 1000,
  chargeType: "FIXED",
  feeAmount: 50,
  maxFeeCap: 1000,
  feeNarration: "Stamp Duty Charge",
  exemptVirtualAccounts: false,
};

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "wallets.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const docSnap = await adminDb.collection("config").doc("inflow_deductions").get();
    let configData = DEFAULT_INFLOW_DEDUCTION_CONFIG;

    if (docSnap.exists) {
      configData = { ...DEFAULT_INFLOW_DEDUCTION_CONFIG, ...docSnap.data() };
    } else {
      // Check config/app fallback
      const appSnap = await adminDb.collection("config").doc("app").get();
      if (appSnap.exists && appSnap.data()?.autoInflowDeduction) {
        configData = { ...DEFAULT_INFLOW_DEDUCTION_CONFIG, ...appSnap.data()?.autoInflowDeduction };
      }
    }

    return NextResponse.json({
      success: true,
      config: configData,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Inflow Deductions GET Error]:", error.message);
    return NextResponse.json({ error: "Failed to fetch inflow fee configuration", details: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "wallets.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const body = await req.json();
    const adminEmail = perm.auth?.email || "admin@system";
    const nowIso = new Date().toISOString();

    const enabled = !!body.enabled;
    const minThreshold = Math.max(0, Number(body.minThreshold ?? 1000));
    const chargeType = body.chargeType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED";
    const feeAmount = Math.max(0, Number(body.feeAmount ?? 50));
    const maxFeeCap = Math.max(0, Number(body.maxFeeCap ?? 0));
    const feeNarration = String(body.feeNarration || "Stamp Duty Charge").trim();
    const exemptVirtualAccounts = !!body.exemptVirtualAccounts;

    if (isNaN(minThreshold) || isNaN(feeAmount)) {
      return NextResponse.json({ error: "Invalid numeric values provided for threshold or fee amount." }, { status: 400 });
    }

    const updatedConfig: AutoInflowDeductionConfig = {
      enabled,
      minThreshold,
      chargeType,
      feeAmount,
      maxFeeCap,
      feeNarration,
      exemptVirtualAccounts,
      updatedAt: nowIso,
      updatedBy: adminEmail,
    };

    // Save to both config/inflow_deductions and config/app so it is cached with zero extra reads
    await adminDb.collection("config").doc("inflow_deductions").set(updatedConfig, { merge: true });
    await adminDb.collection("config").doc("app").set({ autoInflowDeduction: updatedConfig, updatedAt: nowIso }, { merge: true });

    return NextResponse.json({
      success: true,
      message: "Automatic Inflow Fee / Stamp Duty settings saved successfully!",
      config: updatedConfig,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[Admin Inflow Deductions POST Error]:", error.message);
    return NextResponse.json({ error: "Failed to update inflow fee configuration", details: error.message }, { status: 500 });
  }
}
