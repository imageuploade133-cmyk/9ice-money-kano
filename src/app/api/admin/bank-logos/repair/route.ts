import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { BankService } from "@/services/bank-service";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { validateImageUrl } from "@/lib/image-upload";

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "bank_logos.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    const banksSnap = await adminDb.collection("banks").get();
    if (banksSnap.empty) {
      return NextResponse.json({ success: true, message: "No bank documents found to repair", scanned: 0 });
    }

    let scanned = 0;
    let healthyCount = 0;
    let repairedCount = 0;
    let needsRepairCount = 0;

    const batchSize = 100;
    let batch = adminDb.batch();
    let currentBatchCount = 0;

    for (const docSnap of banksSnap.docs) {
      scanned++;
      const data = docSnap.data();
      const bankId = docSnap.id;
      const code = String(data.code || "").trim();
      const paddedCode = code && /^\d+$/.test(code) ? code.padStart(3, "0") : code;

      const currentLogoUrl = data.logoUrl as string | undefined;
      const currentBackupUrl = data.logoBackupUrl as string | undefined;

      if (!currentLogoUrl) {
        continue;
      }

      // Validate primary URL
      const primaryValidation = await validateImageUrl(currentLogoUrl, 4000);

      if (primaryValidation.valid) {
        healthyCount++;
        // Ensure status is marked HEALTHY
        if (data.logoStatus !== "HEALTHY") {
          batch.update(docSnap.ref, {
            logoStatus: "HEALTHY",
            verifiedAt: new Date().toISOString(),
          });
          currentBatchCount++;
        }
      } else {
        console.warn(`[Bank Logo Repair] Bank ${bankId} (${data.name}) primary logo invalid: ${primaryValidation.error}`);

        let newLogoUrl: string | null = null;
        let newBackupUrl: string | null = currentBackupUrl || null;
        let repaired = false;

        // Try current backup URL first
        if (currentBackupUrl && currentBackupUrl !== currentLogoUrl) {
          const backupValidation = await validateImageUrl(currentBackupUrl, 4000);
          if (backupValidation.valid) {
            newLogoUrl = currentBackupUrl;
            newBackupUrl = currentLogoUrl; // Swap
            repaired = true;
          }
        }

        // If backup wasn't valid, check if ibb.co viewer link can be transformed to direct i.ibb.co
        if (!repaired && currentLogoUrl.includes("ibb.co/") && !currentLogoUrl.includes("i.ibb.co/")) {
          // Attempt repair if viewer URL pattern
          const directAttempt = currentLogoUrl.replace("ibb.co/", "i.ibb.co/");
          const directValidation = await validateImageUrl(directAttempt, 4000);
          if (directValidation.valid) {
            newLogoUrl = directAttempt;
            newBackupUrl = currentLogoUrl;
            repaired = true;
          }
        }

        if (repaired && newLogoUrl) {
          repairedCount++;
          batch.update(docSnap.ref, {
            logoUrl: newLogoUrl,
            logoBackupUrl: newBackupUrl,
            logoStatus: "REPAIRED",
            verifiedAt: new Date().toISOString(),
          });
          currentBatchCount++;
        } else {
          // Mark as NEEDS_REPAIR without blindly clearing/deleting the URL
          needsRepairCount++;
          batch.update(docSnap.ref, {
            logoStatus: "NEEDS_REPAIR",
            logoError: primaryValidation.error,
            verifiedAt: new Date().toISOString(),
          });
          currentBatchCount++;
        }
      }

      if (currentBatchCount >= batchSize) {
        await batch.commit();
        batch = adminDb.batch();
        currentBatchCount = 0;
      }
    }

    if (currentBatchCount > 0) {
      await batch.commit();
    }

    // Invalidate in-memory bank cache
    BankService.clearCache();

    return NextResponse.json({
      success: true,
      message: `Bank logo health check and repair completed.`,
      scanned,
      healthy: healthyCount,
      repaired: repairedCount,
      needsRepair: needsRepairCount,
    });
  } catch (err: any) {
    console.error("[Bank Logo Repair API Exception]:", err.message);
    return NextResponse.json({ error: "Bank logo repair process failed", details: err.message }, { status: 500 });
  }
}
