import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { WalletService } from "@/services/wallet-service";
import { NotificationService } from "@/services/notification-service";

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "wallets.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    if (!adminDb) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query")?.trim() || "";
    const pageSize = Math.min(Math.max(Number(searchParams.get("limit")) || 10, 1), 50);
    const lastDocId = searchParams.get("lastDocId")?.trim() || searchParams.get("startAfter")?.trim() || "";

    // 1. Fetch total deposit audit records count using low-cost count() aggregation query
    let totalLogsCount = 0;
    try {
      const countSnap = await adminDb
        .collection("transactions")
        .where("type", "in", ["DEPOSIT", "ADMIN_DEPOSIT", "WALLET_FUNDING"])
        .count()
        .get();
      totalLogsCount = countSnap.data().count || 0;
    } catch (countErr: any) {
      console.warn("[Admin Deposit GET] Count aggregation error:", countErr.message);
    }

    // 2. Fetch paginated admin deposits audit log using cursor
    let queryRef = adminDb
      .collection("transactions")
      .where("type", "in", ["DEPOSIT", "ADMIN_DEPOSIT", "WALLET_FUNDING"])
      .orderBy("createdAt", "desc")
      .limit(pageSize);

    if (lastDocId) {
      try {
        const lastDocSnap = await adminDb.collection("transactions").doc(lastDocId).get();
        if (lastDocSnap.exists) {
          queryRef = queryRef.startAfter(lastDocSnap);
        }
      } catch (cursorErr: any) {
        console.warn("[Admin Deposit GET] Cursor doc lookup warning:", cursorErr.message);
      }
    }

    const depositsSnap = await queryRef.get();

    // Deduplicate any legacy duplicate records by unique reference ID
    const seenRefs = new Set<string>();
    const depositLogs: any[] = [];

    depositsSnap.docs.forEach((doc) => {
      const data = doc.data();
      const rawRef = data.reference || doc.id;
      const cleanRef = rawRef.replace(/^tx-/, "");

      if (!seenRefs.has(cleanRef)) {
        seenRefs.add(cleanRef);
        depositLogs.push({
          id: doc.id,
          ...data,
          adminEmail: data.adminEmail || data.metadata?.adminEmail || "Admin",
        });
      }
    });

    const lastFetchedDocId = depositsSnap.docs.length > 0 ? depositsSnap.docs[depositsSnap.docs.length - 1].id : null;
    const hasMore = depositsSnap.docs.length === pageSize;

    // 2. Search users if query provided
    let searchResults: any[] = [];
    if (query) {
      const qLower = query.toLowerCase();

      // Search users collection by email, name, or phone prefix
      const usersSnap = await adminDb.collection("users").limit(20).get();

      const matchedDocs = usersSnap.docs.filter((doc) => {
        const data = doc.data();
        const uid = doc.id.toLowerCase();
        const email = (data.email || "").toLowerCase();
        const name = (data.name || "").toLowerCase();
        const phone = (data.phoneNumber || "").toLowerCase();
        const vaNumber = (data.virtualAccountNumber || "").toLowerCase();

        return (
          uid.includes(qLower) ||
          email.includes(qLower) ||
          name.includes(qLower) ||
          phone.includes(qLower) ||
          vaNumber.includes(qLower)
        );
      });

      // For each matched user, load their multi-currency wallet balances
      searchResults = await Promise.all(
        matchedDocs.map(async (doc) => {
          const uData = doc.data();
          const uid = doc.id;

          // Fetch NGN, USD, XOF, EUR, GBP wallet balances
          const currencies = ["NGN", "USD", "XOF", "EUR", "GBP"];
          const balances: Record<string, number> = {};

          await Promise.all(
            currencies.map(async (curr) => {
              try {
                const wSnap = await adminDb!.collection("wallets").doc(`${uid}_${curr}`).get();
                if (wSnap.exists) {
                  balances[curr] = Number(wSnap.data()?.balance) || 0;
                } else if (curr === "NGN") {
                  balances[curr] = Number(uData.balance) || 0;
                } else {
                  balances[curr] = 0;
                }
              } catch {
                balances[curr] = 0;
              }
            })
          );

          return {
            uid,
            name: uData.name || uData.displayName || "E-Global Customer",
            email: uData.email || "",
            phoneNumber: uData.phoneNumber || uData.phone || "",
            photoURL: uData.photoURL || null,
            virtualAccountNumber: uData.virtualAccountNumber || null,
            virtualAccountBankName: uData.virtualAccountBankName || null,
            balances,
          };
        })
      );
    }

    return NextResponse.json({
      success: true,
      searchResults,
      depositLogs,
      totalLogsCount,
      hasMore,
      lastDocId: lastFetchedDocId,
    });
  } catch (err: any) {
    console.error("[Admin Deposit GET] Error:", err.message);
    return NextResponse.json({ error: "Failed to load deposit data", details: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "wallets.manage");
    if (!perm.authorized) {
      return perm.response!;
    }

    if (!adminDb) {
      return NextResponse.json({ error: "Database not initialized" }, { status: 500 });
    }

    const body = (await req.json()) || {};
    const { targetUid, currency = "NGN", amount, narration } = body;

    if (!targetUid || typeof targetUid !== "string") {
      return NextResponse.json({ error: "Target customer UID is required." }, { status: 400 });
    }

    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json({ error: "Valid positive deposit amount is required." }, { status: 400 });
    }

    // Verify target user document exists
    const userDoc = await adminDb.collection("users").doc(targetUid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "Target customer profile doc not found." }, { status: 404 });
    }

    const userData = userDoc.data() || {};
    const adminEmail = perm.auth?.email || "admin@system";
    const ref = `ADMIN-DEP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const depositNarration = narration?.trim() || `Administrative Credit Deposit by ${adminEmail}`;

    // Execute atomic credit deposit via WalletService inside runTransaction
    // WalletService.creditWallet writes the single authoritative transaction record under `transactions/tx-${ref}`
    const creditResult = await adminDb.runTransaction(async (transaction) => {
      return await WalletService.creditWallet(transaction, {
        userId: targetUid,
        amount: numAmount,
        currency,
        reference: ref,
        docId: `tx-${ref}`,
        description: depositNarration,
        narration: depositNarration,
        recipientName: userData.name || targetUid,
        senderName: "E-Global-Pay Admin",
        senderBankName: "E-Global-Pay",
        virtualAccountBankName: "E-Global-Pay",
        type: "DEPOSIT",
        category: "DEPOSIT",
        direction: "CREDIT",
        totalCredited: numAmount,
        metadata: {
          adminEmail,
          isAdminDeposit: true,
          senderBankName: "E-Global-Pay",
          depositedAt: new Date().toISOString(),
        },
      });
    });

    // Dispatch FCM Push Notification to target customer
    const currSym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "XOF" ? "CFA" : "₦";
    await NotificationService.sendPushNotification(targetUid, {
      title: "Account Credited 💰",
      body: `Your ${currency} wallet has been credited with ${currSym}${numAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}.`,
      type: "transaction",
      reference: ref,
      amount: numAmount,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully deposited ${currSym}${numAmount.toLocaleString()} into ${userData.name || targetUid}'s ${currency} wallet!`,
      reference: ref,
      newBalance: creditResult.newBalance,
    });
  } catch (err: any) {
    console.error("[Admin Deposit POST] Error:", err.message);
    return NextResponse.json({ error: "Deposit execution failed", details: err.message }, { status: 500 });
  }
}
