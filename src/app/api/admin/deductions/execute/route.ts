import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { FieldValue } from "firebase-admin/firestore";
import { toMinorUnits, toMajorUnits, calculateUserDeduction, isActiveUser, toMinorUnitsStrict } from "@/lib/monetary-util";

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "wallet.deductions.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }

    const adminEmail = perm.auth.email || "System Administrator";
    const adminUid = perm.auth.uid;

    const body = await req.json();
    const { name, description, amount, deductionId: clientDeductionId } = body;

    const parsedAmount = toMajorUnits(toMinorUnitsStrict(amount, "Deduction Amount"));
    if (parsedAmount <= 0) {
      return NextResponse.json({ error: "Deduction amount must be a positive number greater than 0." }, { status: 400 });
    }

    if (parsedAmount > 100000) {
      return NextResponse.json({ error: "Maximum single global deduction amount cannot exceed ₦100,000." }, { status: 400 });
    }

    // Deterministic immutable deduction ID & unique worker token for safe lock recovery
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const deductionId = clientDeductionId || `DED-${todayStr}-${Date.now().toString().slice(-4)}`;
    const workerToken = `wrk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const deductionRef = adminDb.collection("global_deductions").doc(deductionId);

    // Atomic Lock, Immutability & Processing Token Lease
    const lockResult = await adminDb.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(deductionRef);
      const nowIso = new Date().toISOString();

      if (docSnap.exists) {
        const d = docSnap.data() || {};

        // 1. Immutability Check: Amount, currency, and target cannot be altered once created
        if (d.amount !== undefined && toMinorUnits(d.amount) !== toMinorUnits(parsedAmount)) {
          throw new Error(`Cannot modify amount of existing deduction ${deductionId}. Original amount: ₦${d.amount}`);
        }

        if (d.status === "COMPLETED") {
          return { status: "ALREADY_COMPLETED", data: d };
        }

        // 2. Concurrency Lock: If PROCESSING and lease is active (< 2 minutes), reject parallel execution
        if (d.status === "PROCESSING" && d.updatedAt) {
          const ageMs = Date.now() - new Date(d.updatedAt).getTime();
          if (ageMs < 2 * 60 * 1000) {
            return { status: "ALREADY_PROCESSING", data: d };
          }
        }
      }

      const initialData = {
        deductionId,
        name: (name || "Maintenance Fee").trim(),
        description: (description || "").trim(),
        amount: parsedAmount,
        currency: "NGN",
        target: "All Active Users",
        status: "PROCESSING",
        processingToken: workerToken,
        createdBy: adminEmail,
        createdByUid: adminUid,
        createdAt: docSnap.exists ? docSnap.data()?.createdAt : nowIso,
        updatedAt: nowIso,
      };

      transaction.set(deductionRef, initialData, { merge: true });
      return { status: "PROCEED", data: initialData };
    });

    if (lockResult.status === "ALREADY_COMPLETED") {
      return NextResponse.json({
        success: true,
        message: "This global deduction has already been executed to completion.",
        deduction: { id: deductionRef.id, ...lockResult.data },
      });
    }

    if (lockResult.status === "ALREADY_PROCESSING") {
      return NextResponse.json({
        error: "This global deduction is currently being processed by another active request.",
      }, { status: 409 });
    }

    // Legacy migration compatibility query: Query active users safely using status == "active"
    // Also include legacy users where status is undefined or missing without loading full users collection
    const [activeQuerySnap, noStatusQuerySnap] = await Promise.all([
      adminDb.collection("users").where("status", "==", "active").get(),
      adminDb.collection("users").where("status", "==", null).get(),
    ]);

    const userMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    activeQuerySnap.docs.forEach((d) => userMap.set(d.id, d));
    noStatusQuerySnap.docs.forEach((d) => userMap.set(d.id, d));

    const activeUserDocs = Array.from(userMap.values()).filter((doc) => isActiveUser(doc.data() || {}));

    const totalEligibleCount = activeUserDocs.length;
    let failedUsersCount = 0;
    const nowIso = new Date().toISOString();

    // Process users in batch chunks of 25 users
    for (let i = 0; i < activeUserDocs.length; i += 25) {
      const chunk = activeUserDocs.slice(i, i + 25);

      // Periodically renew worker lock lease during long operations atomically inside a transaction
      const renewResult = await adminDb.runTransaction(async (transaction) => {
        const masterSnap = await transaction.get(deductionRef);
        if (masterSnap.exists) {
          const masterData = masterSnap.data() || {};
          if (masterData.status === "PROCESSING" && masterData.processingToken === workerToken) {
            transaction.set(deductionRef, { updatedAt: new Date().toISOString() }, { merge: true });
            return true;
          }
        }
        return false;
      });

      if (!renewResult) {
        console.warn(`[Global Deduction Worker Lease Lost]: Worker ${workerToken} lost lease ownership during chunk iteration.`);
        break;
      }

      await Promise.all(
        chunk.map(async (uDoc) => {
          const userId = uDoc.id;
          const userDeductionDocId = `ded_${deductionId}_${userId}`;
          const userDeductionRef = adminDb.collection("user_deductions").doc(userDeductionDocId);

          try {
            await adminDb.runTransaction(async (transaction) => {
              // WORKER LEASE ENFORCEMENT: Verify this worker still owns master lock
              const masterSnap = await transaction.get(deductionRef);
              if (masterSnap.exists) {
                const masterData = masterSnap.data() || {};
                if (masterData.processingToken && masterData.processingToken !== workerToken) {
                  throw new Error(`Worker lost lock lease for deduction ${deductionId}. Active worker token: ${masterData.processingToken}`);
                }
              }

              // 1. Idempotency Check: Read user_deductions record first inside transaction
              const userDedSnap = await transaction.get(userDeductionRef);
              if (userDedSnap.exists && userDedSnap.data()?.status === "APPLIED") {
                // Already processed for this user - do nothing inside transaction
                return;
              }

              // Read user profile and wallet
              const userRef = adminDb.collection("users").doc(userId);
              const walletRef = adminDb.collection("wallets").doc(`${userId}_NGN`);

              const [userSnap, walletSnap] = await Promise.all([
                transaction.get(userRef),
                transaction.get(walletRef),
              ]);

              if (!userSnap.exists) return;
              const uData = userSnap.data() || {};

              // Re-check active user status inside per-user transaction
              if (!isActiveUser(uData)) return;

              const rawBal = walletSnap.exists ? Number(walletSnap.data()?.balance) : 0;
              const debtVal = uData.outstandingDebt;

              // DATA INTEGRITY FAIL-CLOSED: Reject invalid, NaN, or infinite balances
              if (isNaN(rawBal) || !isFinite(rawBal) || rawBal < 0) {
                throw new Error(`Invalid wallet balance (${rawBal}) detected for user ${userId}. Failing closed.`);
              }

              let currentDebt = 0;
              if (debtVal !== undefined && debtVal !== null && debtVal !== "") {
                const parsedDebt = typeof debtVal === "number" ? debtVal : Number(debtVal);
                if (isNaN(parsedDebt) || !isFinite(parsedDebt) || parsedDebt < 0) {
                  throw new Error(`Invalid/corrupted outstanding debt (${debtVal}) detected for user ${userId}. Failing closed.`);
                }
                currentDebt = parsedDebt;
              }

              const currentWalletBalance = rawBal;

              // Integer minor units calculation
              const calc = calculateUserDeduction(currentWalletBalance, currentDebt, parsedAmount);

              // Write updates to wallet
              transaction.set(walletRef, {
                userId,
                currency: "NGN",
                balance: calc.newBalance,
                updatedAt: nowIso,
              }, { merge: true });

              // Write updates to user document
              const userUpdates: Record<string, any> = {
                balance: calc.newBalance,
              };
              if (calc.amountOutstanding > 0) {
                userUpdates.outstandingDebt = FieldValue.increment(calc.amountOutstanding);
              }
              transaction.update(userRef, userUpdates);

              // Create per-user audit record in user_deductions collection
              transaction.set(userDeductionRef, {
                deductionId,
                deductionName: name,
                userId,
                userName: uData.name || uData.displayName || "Customer",
                userEmail: uData.email || "",
                userPhone: uData.phoneNumber || "",
                amountAssessed: calc.amountAssessed,
                amountRecovered: calc.amountRecovered,
                amountOutstanding: calc.amountOutstanding,
                walletBalanceBefore: currentWalletBalance,
                walletBalanceAfter: calc.newBalance,
                outstandingDebtBefore: currentDebt,
                outstandingDebtAfter: calc.newDebt,
                status: "APPLIED",
                createdAt: nowIso,
                updatedAt: nowIso,
              });

              // Write transaction ledger entry for user history
              const txRef = `deduction-${deductionId}-${userId}`;
              const txDocRef = adminDb.collection("transactions").doc(`tx-${txRef}`);
              transaction.set(txDocRef, {
                userId,
                amount: calc.amountAssessed,
                currency: "NGN",
                reference: txRef,
                type: "GLOBAL_DEDUCTION",
                category: "DEDUCTION",
                direction: "DEBIT",
                description: `${name} (Amount Assessed: ₦${calc.amountAssessed.toLocaleString()}, Recovered: ₦${calc.amountRecovered.toLocaleString()}, Debt: ₦${calc.amountOutstanding.toLocaleString()})`,
                recipientName: "Service Charge",
                status: "SUCCESS",
                date: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
                time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
                fee: 0,
                totalDebited: calc.amountRecovered,
                totalCredited: 0,
                createdAt: nowIso,
                completedAt: nowIso,
                metadata: {
                  deductionId,
                  amountAssessed: calc.amountAssessed,
                  amountRecovered: calc.amountRecovered,
                  amountOutstanding: calc.amountOutstanding,
                  newDebtPosition: calc.newDebt,
                  netPositionAfter: calc.netBalanceAfter,
                },
              });
            });
          } catch (txErr: any) {
            console.error(`[Global Deduction Transaction Error for User ${userId}]:`, txErr.message);
            failedUsersCount++;
          }
        })
      );
    }

    // Compute master totals by querying committed user_deductions documents to ensure transaction retries never inflate metrics
    const userDeductionsSnap = await adminDb
      .collection("user_deductions")
      .where("deductionId", "==", deductionId)
      .get();

    let processedUsersCount = 0;
    let indebtedUsersCount = 0;
    let totalAssessedMinor = 0;
    let totalRecoveredMinor = 0;
    let totalOutstandingMinor = 0;

    userDeductionsSnap.forEach((doc) => {
      const dData = doc.data() || {};
      if (dData.status === "APPLIED") {
        processedUsersCount++;
        const assessed = toMinorUnits(dData.amountAssessed);
        const recovered = toMinorUnits(dData.amountRecovered);
        const outstanding = toMinorUnits(dData.amountOutstanding);

        totalAssessedMinor += assessed;
        totalRecoveredMinor += recovered;
        totalOutstandingMinor += outstanding;

        if (outstanding > 0) {
          indebtedUsersCount++;
        }
      }
    });

    const finalStatus = (failedUsersCount === 0 && processedUsersCount >= totalEligibleCount)
      ? "COMPLETED"
      : "PARTIAL";

    const totalAssessedAmount = toMajorUnits(totalAssessedMinor);
    const totalRecoveredAmount = toMajorUnits(totalRecoveredMinor);
    const totalOutstandingAmount = toMajorUnits(totalOutstandingMinor);

    const summaryData = {
      status: finalStatus,
      eligibleUsersCount: totalEligibleCount,
      processedUsersCount,
      failedUsersCount,
      indebtedUsersCount,
      totalAssessedAmount,
      totalRecoveredAmount,
      totalOutstandingAmount,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // STRICT WORKER FINALIZATION: Atomically requires BOTH d.status === "PROCESSING" AND d.processingToken === workerToken
    const finalizationResult = await adminDb.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(deductionRef);
      if (!docSnap.exists) {
        return { finalized: false, reason: "MASTER_DOC_MISSING" };
      }

      const d = docSnap.data() || {};

      // If already COMPLETED by this exact worker, allow idempotent completion return
      if (d.status === "COMPLETED" && d.processingToken === workerToken) {
        return { finalized: true, status: "COMPLETED" };
      }

      // Mandatory check: Must be in "PROCESSING" state AND processingToken must match current workerToken exactly
      if (d.status !== "PROCESSING" || !d.processingToken || d.processingToken !== workerToken) {
        return {
          finalized: false,
          reason: "LOST_OWNERSHIP",
          currentStatus: d.status,
          activeToken: d.processingToken,
        };
      }

      transaction.set(deductionRef, summaryData, { merge: true });
      return { finalized: true, status: finalStatus };
    });

    if (!finalizationResult.finalized) {
      return NextResponse.json({
        error: "Worker lost lock lease ownership before finalization.",
      }, { status: 409 });
    }

    // Reliable Non-silent Audit Log
    try {
      await adminDb.collection("admin_audit_logs").add({
        action: "global_wallet_deduction_executed",
        adminEmail,
        adminUid,
        deductionId,
        details: {
          name,
          amount: parsedAmount,
          status: finalStatus,
          eligibleUsersCount: totalEligibleCount,
          processedUsersCount,
          failedUsersCount,
          totalAssessedAmount,
          totalRecoveredAmount,
          totalOutstandingAmount,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (auditErr: any) {
      console.error("[Audit Logging Error]: Failed to record admin audit log:", auditErr.message);
    }

    return NextResponse.json({
      success: true,
      message: `Global deduction "${name}" processed! Status: ${finalStatus}. Processed: ${processedUsersCount}, Failed: ${failedUsersCount}`,
      deduction: {
        id: deductionId,
        deductionId,
        name,
        amount: parsedAmount,
        ...summaryData,
      },
    });
  } catch (err: any) {
    console.error("[Admin Deductions Execute Error]:", err.message);
    return NextResponse.json({ error: err.message || "Failed to execute global deduction" }, { status: 500 });
  }
}
