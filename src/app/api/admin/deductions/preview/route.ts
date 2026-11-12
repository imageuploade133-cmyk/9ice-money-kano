import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { toMinorUnitsStrict, toMajorUnits, calculateNetBalance, isActiveUser } from "@/lib/monetary-util";

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "wallet.deductions.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }

    const body = await req.json();
    const { name, description, amount } = body;

    const parsedAmount = toMajorUnits(toMinorUnitsStrict(amount, "Deduction Amount"));
    if (parsedAmount <= 0) {
      return NextResponse.json({ error: "Deduction amount must be a positive number greater than 0." }, { status: 400 });
    }

    if (parsedAmount > 100000) {
      return NextResponse.json({ error: "Maximum single global deduction amount cannot exceed ₦100,000." }, { status: 400 });
    }

    // Legacy migration compatibility query: Query active users safely using status == "active"
    // Also include legacy users where status is undefined or missing without loading full users collection
    const [activeQuerySnap, noStatusQuerySnap] = await Promise.all([
      adminDb.collection("users").where("status", "==", "active").get(),
      adminDb.collection("users").where("status", "==", null).get(),
    ]);

    // Merge doc arrays maintaining map uniqueness
    const userMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    activeQuerySnap.docs.forEach((d) => userMap.set(d.id, d));
    noStatusQuerySnap.docs.forEach((d) => userMap.set(d.id, d));

    const candidateDocs = Array.from(userMap.values());
    const totalUsers = candidateDocs.length;

    // Batch query authoritative wallet documents (wallets/{userId}_NGN) in chunks of 100 to align balance source with execute
    const walletDocRefs = candidateDocs.map((doc) => adminDb.collection("wallets").doc(`${doc.id}_NGN`));
    const walletSnapsMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();

    for (let i = 0; i < walletDocRefs.length; i += 100) {
      const chunkRefs = walletDocRefs.slice(i, i + 100);
      if (chunkRefs.length > 0) {
        const snaps = await adminDb.getAll(...chunkRefs);
        snaps.forEach((s) => walletSnapsMap.set(s.id, s));
      }
    }

    let eligibleUsersCount = 0;
    let sufficientFundsCount = 0;
    let expectedIndebtedCount = 0;
    let totalImmediateRecoveryMinor = 0;
    let totalNewOutstandingDebtMinor = 0;

    const dedMinor = toMinorUnitsStrict(parsedAmount, "Deduction Amount");

    candidateDocs.forEach((doc) => {
      const uData = doc.data() || {};
      if (!isActiveUser(uData)) return;

      eligibleUsersCount++;

      const walletSnap = walletSnapsMap.get(`${doc.id}_NGN`);
      if (!walletSnap || !walletSnap.exists) {
        throw new Error(`[Data Integrity Error] Missing authoritative wallet document (wallets/${doc.id}_NGN) for active user ${doc.id}. Failing closed.`);
      }

      const rawBal = walletSnap.data()?.balance;
      const debtVal = uData.outstandingDebt;

      // FAIL-CLOSED DATA INTEGRITY VALIDATION: Reject malformed, negative, NaN, or non-numeric balances or debt
      const balMinor = toMinorUnitsStrict(rawBal, `Wallet Balance for user ${doc.id}`);

      let debtMinor = 0;
      if (debtVal !== undefined && debtVal !== null && debtVal !== "") {
        debtMinor = toMinorUnitsStrict(debtVal, `Outstanding Debt for user ${doc.id}`);
      }

      const walletBal = toMajorUnits(balMinor);

      const recoverMinor = Math.min(balMinor, dedMinor);
      const newDebtCreatedMinor = dedMinor - recoverMinor;

      totalImmediateRecoveryMinor += recoverMinor;
      totalNewOutstandingDebtMinor += newDebtCreatedMinor;

      // SUFFICIENT FUNDS CALCULATION: Matches execute algorithm exactly.
      // Wallet balance >= deduction amount means full recovery without creating new debt for this charge.
      if (walletBal >= parsedAmount) {
        sufficientFundsCount++;
      } else {
        expectedIndebtedCount++;
      }
    });

    const totalAssessedAmount = toMajorUnits(eligibleUsersCount * dedMinor);
    const totalImmediateRecovery = toMajorUnits(totalImmediateRecoveryMinor);
    const totalNewOutstandingDebt = toMajorUnits(totalNewOutstandingDebtMinor);

    return NextResponse.json({
      success: true,
      preview: {
        name: (name || "Maintenance Fee").trim(),
        description: (description || "").trim(),
        amount: parsedAmount,
        currency: "NGN",
        target: "All Active Users",
        totalUsers,
        eligibleUsersCount,
        sufficientFundsCount,
        indebtedCount: expectedIndebtedCount,
        totalAssessedAmount,
        totalImmediateRecovery,
        totalNewOutstandingDebt,
      },
    });
  } catch (err: any) {
    console.error("[Admin Deductions Preview Error]:", err.message);
    return NextResponse.json({ error: err.message || "Failed to generate deduction preview" }, { status: 500 });
  }
}
