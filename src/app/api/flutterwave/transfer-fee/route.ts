import { NextResponse } from "next/server";
import { authenticateUserRequest, verifyUserKycApproved } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";
import { calculateTransferMarkupFee, TransferTieredMarkup } from "@/lib/transfer-markup-util";
import { getGatewayUrl } from "@/lib/gateway-util";

export async function GET(req: Request) {
  const reqId = `fee-req-${Date.now()}-${Math.random().toString(36).slice(-4)}`;
  const gatewayUrl = getGatewayUrl();

  let uid = "";
  // 1. Authenticate user to ensure secure access (no hackers/scammers)
  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
  } catch (authErr: unknown) {
    const error = authErr as Error;
    console.error(`[Transfer-Fee Auth Error] [${reqId}] Verification failed:`, error.message);
    return NextResponse.json({ error: "Unauthorized: Invalid or missing token." }, { status: 401 });
  }

  // 2. Enforce KYC verification consistently for financial services
  const isApproved = await verifyUserKycApproved(uid);
  if (!isApproved) {
    return NextResponse.json({ error: "Forbidden: Account verification is required to perform financial operations." }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const amountStr = searchParams.get("amount") || "0";
    const amount = parseFloat(amountStr);
    const isBulk = searchParams.get("bulk") === "true";
    const countStr = searchParams.get("count") || "1";
    const count = Math.max(1, parseInt(countStr, 10) || 1);

    if (isNaN(amount) || amount < 0) {
      return NextResponse.json({ error: "Invalid transfer amount." }, { status: 400 });
    }

    // 3. Fetch global TRN fee configuration (ON/OFF switch and free transfers quota)
    let enableTransferFee = true;
    let freeTransfersQuota = 0;
    let freeTransferResetPeriod = "NEVER";
    let showFreeTransfersIndicator = true;

    const trnFeeRef = adminDb.collection("config").doc("trn_fee_config");
    const trnFeeSnap = await trnFeeRef.get();
    if (trnFeeSnap.exists) {
      const feeData = trnFeeSnap.data() || {};
      enableTransferFee = feeData.enableTransferFee !== false;
      freeTransfersQuota = Math.max(0, Number(feeData.freeTransfersQuota) || 0);
      freeTransferResetPeriod = feeData.freeTransferResetPeriod || "NEVER";
      showFreeTransfersIndicator = feeData.showFreeTransfersIndicator !== false;
    }

    // Check if global transfer fees are completely OFF
    if (!enableTransferFee) {
      console.log(`[Transfer-Fee API] [${reqId}] Global transfer fees are OFF. Returning ₦0.00 fee.`);
      return NextResponse.json({
        success: true,
        providerFee: 0,
        adminCommission: 0,
        fee: 0,
        totalDebit: amount,
        isFreeTransfer: true,
        freeReason: "Global transfer fees disabled by administrator",
        showFreeIndicator: showFreeTransfersIndicator,
      });
    }

    // Check if user qualifies for free transfer quota
    if (freeTransfersQuota > 0 && uid) {
      const userSnap = await adminDb.collection("users").doc(uid).get();
      if (userSnap.exists) {
        const userData = userSnap.data() || {};
        let usedFreeCount = Number(userData.usedFreeTransfers) || 0;
        const lastReset = userData.lastFreeTransferResetDate ? new Date(userData.lastFreeTransferResetDate) : null;
        const now = new Date();

        // Evaluate reset frequency
        let shouldReset = false;
        if (lastReset) {
          if (freeTransferResetPeriod === "DAILY") {
            shouldReset = lastReset.toDateString() !== now.toDateString();
          } else if (freeTransferResetPeriod === "WEEKLY") {
            const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
            shouldReset = now.getTime() - lastReset.getTime() >= oneWeekMs;
          } else if (freeTransferResetPeriod === "MONTHLY") {
            shouldReset = lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear();
          }
        }

        if (shouldReset) {
          usedFreeCount = 0;
        }

        if (usedFreeCount < freeTransfersQuota) {
          console.log(`[Transfer-Fee API] [${reqId}] User ${uid} qualifies for free transfer (${usedFreeCount + 1}/${freeTransfersQuota}). Returning ₦0.00 fee.`);
          return NextResponse.json({
            success: true,
            providerFee: 0,
            adminCommission: 0,
            fee: 0,
            totalDebit: amount,
            isFreeTransfer: true,
            freeReason: `Free transfer quota (${freeTransfersQuota - usedFreeCount} remaining)`,
            remainingFreeTransfers: freeTransfersQuota - usedFreeCount,
            showFreeIndicator: showFreeTransfersIndicator,
          });
        }
      }
    }

    // 4. Fetch custom global markup configurations securely from Firestore config collection
    let defaultTransferProfitMargin = 0;
    let defaultBulkTransferProfitMargin = 0;
    let transferTieredMargins: TransferTieredMarkup[] = [];
    let bulkTransferTieredMargins: TransferTieredMarkup[] = [];

    const marginRef = adminDb.collection("config").doc("vtu_profit_margins");
    const marginSnap = await marginRef.get();
    if (marginSnap.exists) {
      const marginData = marginSnap.data() || {};
      defaultTransferProfitMargin = Number(marginData.transferProfitMargin) || 0;
      defaultBulkTransferProfitMargin = Number(marginData.bulkTransferProfitMargin) || 0;
      if (Array.isArray(marginData.transferTieredMargins)) {
        transferTieredMargins = marginData.transferTieredMargins;
      }
      if (Array.isArray(marginData.bulkTransferTieredMargins)) {
        bulkTransferTieredMargins = marginData.bulkTransferTieredMargins;
      }
    }

    let finalFee = 10.00;

    if (isBulk) {
      // Bulk transfer fee calculation: evaluate tiered markup for each recipient amount or count
      const amountsParam = searchParams.get("amounts");
      const baseFlatFee = 10.00;
      if (amountsParam) {
        const itemAmounts = amountsParam.split(",").map((a) => Number(a) || 0);
        let accumulatedFees = 0;
        for (const itemAmt of itemAmounts) {
          const markup = calculateTransferMarkupFee(itemAmt, defaultBulkTransferProfitMargin, bulkTransferTieredMargins);
          accumulatedFees += baseFlatFee + markup;
        }
        finalFee = accumulatedFees;
      } else {
        // Evaluate based on average amount per recipient if total amount is passed
        const avgAmtPerRec = count > 0 ? amount / count : amount;
        const bulkMarkup = calculateTransferMarkupFee(avgAmtPerRec, defaultBulkTransferProfitMargin, bulkTransferTieredMargins);
        const finalFlatFee = baseFlatFee + bulkMarkup;
        finalFee = count * finalFlatFee;
      }
    } else {
      // Single transfer fee calculation: fetch base fee from remote payment gateway S2S and apply single tiered markup
      let baseFee = 10.00;
      const authHeader = req.headers.get("Authorization") || "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.split("Bearer ")[1] : "";
      const sessionId = req.headers.get("X-Session-ID") || req.headers.get("x-session-id") || "";

      if (uid !== "mock-uid") {
        try {
          const feeRes = await fetch(`${gatewayUrl}/api/flutterwave/transfer-fee?amount=${amount}&currency=NGN`, {
            headers: {
              "Authorization": `Bearer ${idToken}`,
              ...(sessionId ? { "X-Session-ID": sessionId } : {}),
              "Content-Type": "application/json",
            },
          });
          const feeText = await feeRes.text().catch(() => "");
          let feeData: Record<string, any> = {};
          try {
            feeData = feeText ? JSON.parse(feeText) : {};
          } catch {
            feeData = {};
          }
          if (feeRes.ok && feeData.success) {
            baseFee = Number(feeData.fee) || 10.00;
          }
        } catch (err: unknown) {
          const error = err as Error;
          console.warn(`[Transfer-Fee API] [${reqId}] Failed to fetch dynamic fee. Using fallback 10 NGN:`, error.message);
        }
      }

      const transferProfitMargin = calculateTransferMarkupFee(amount, defaultTransferProfitMargin, transferTieredMargins);
      finalFee = baseFee + transferProfitMargin;
    }

    const totalDebit = amount + finalFee;

    console.log(`[Transfer-Fee API] [${reqId}] Calculated transfer fee successfully: amount=${amount}, isBulk=${isBulk}, fee=${finalFee}, totalDebit=${totalDebit}`);

    return NextResponse.json({
      success: true,
      providerFee: isBulk ? 10.00 : (uid !== "mock-uid" ? (finalFee - (calculateTransferMarkupFee(amount, defaultTransferProfitMargin, transferTieredMargins) || 0)) : 10.00),
      adminCommission: finalFee - (isBulk ? 10.00 : (uid !== "mock-uid" ? (finalFee - (calculateTransferMarkupFee(amount, defaultTransferProfitMargin, transferTieredMargins) || 0)) : 10.00)),
      fee: finalFee,
      totalDebit
    });

  } catch (error: any) {
    console.error(`[Transfer-Fee API Exception] [${reqId}] CRITICAL FAILURE:`, error.message, error.stack);
    return NextResponse.json({
      error: "Internal server error occurred while calculating transfer fee.",
      message: error.message
    }, { status: 500 });
  }
}
