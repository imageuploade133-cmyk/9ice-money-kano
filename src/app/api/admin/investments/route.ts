import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdminPermission } from "@/lib/admin-permissions";

// Server-side in-memory query cache with 2-minute TTL for low Firestore reads
interface CacheEntry {
  data: any;
  timestamp: number;
}
const investmentsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

export async function GET(req: Request) {
  try {
    const perm = await requireAdminPermission(req, "investments.manage");
    if (!perm.authorized || !perm.auth) {
      return perm.response!;
    }
    const { uid } = perm.auth;

    // Playtesting mock bypass
    if (uid === "mock-admin-uid") {
      const mockInvestments = [
        {
          id: "mock-inv-1",
          userId: "mock-user-1",
          userName: "JULES VERNE",
          userEmail: "jules@example.com",
          amount: 500000,
          interestRate: 15,
          status: "ACTIVE",
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          maturesAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          type: "fixed_deposit",
          description: "Fixed Deposit 90-Days Plan"
        },
        {
          id: "mock-inv-2",
          userId: "mock-user-2",
          userName: "STEVE COLLINS",
          userEmail: "steve@example.com",
          amount: 250000,
          interestRate: 12,
          status: "SETTLED",
          createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
          maturesAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          claimedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          type: "fixed_deposit",
          description: "Fixed Deposit 90-Days Plan"
        }
      ];

      return NextResponse.json({
        success: true,
        investments: mockInvestments
      });
    }

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") || "ALL";
    const limitParam = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const startAfterId = searchParams.get("startAfter") || "";
    const searchQuery = (searchParams.get("search") || "").trim().toLowerCase();
    const noCacheParam = searchParams.get("nocache") === "true";

    const cacheKey = `investments_${statusParam}_${limitParam}_${startAfterId}_${searchQuery}`;
    const now = Date.now();
    const cached = investmentsCache.get(cacheKey);

    if (!noCacheParam && cached && now - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    // Query investments with index-backed filtering
    let query: FirebaseFirestore.Query = adminDb.collection("investments");

    if (statusParam === "SETTLED") {
      query = query.where("status", "in", ["SETTLED", "CLAIMED"]);
    } else if (statusParam === "CANCELLED") {
      query = query.where("status", "in", ["CANCELLED", "CANCELED"]);
    } else if (statusParam !== "ALL") {
      query = query.where("status", "==", statusParam);
    }

    query = query.orderBy("createdAt", "desc");

    if (startAfterId) {
      const startAfterDoc = await adminDb.collection("investments").doc(startAfterId).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }

    // Fetch +1 to determine if there is a next page
    const snapshot = await query.limit(limitParam + 1).get();

    const rawDocs: any[] = [];
    snapshot.forEach((doc) => {
      rawDocs.push({ id: doc.id, ...doc.data() });
    });

    const hasNextPage = rawDocs.length > limitParam;
    if (hasNextPage) {
      rawDocs.pop(); // Remove extra record used for page detection
    }

    const lastDocId = rawDocs.length > 0 ? rawDocs[rawDocs.length - 1].id : null;

    // Batch fetch unique user profiles for low reads (0 N+1 reads)
    const uniqueUserIds = Array.from(
      new Set(rawDocs.map((inv) => inv.userId).filter(Boolean))
    );

    const { getFirebaseAuthUserByUid } = await import("@/lib/firebase-auth-rest");

    const usersCache: Record<string, { name: string; email: string; phone: string; balance: number; bonusBalance: number; isInvestmentBlocked?: boolean }> = {};

    if (uniqueUserIds.length > 0) {
      const userDocRefs = uniqueUserIds.map((uid) => adminDb.collection("users").doc(uid));
      const userDocs = await adminDb.getAll(...userDocRefs);

      for (const doc of userDocs) {
        if (doc.exists) {
          const uData = doc.data() || {};
          let computedEmail = uData.email || uData.emailAddress || "";
          let computedPhone = uData.phoneNumber || uData.phone || uData.mobile || "";
          let computedName =
            uData.name ||
            uData.displayName ||
            `${uData.firstName || ""} ${uData.lastName || ""}`.trim();

          // Fallback lookup to Firebase Auth REST API if email is missing from Firestore user doc
          if (!computedEmail) {
            const fbUser = await getFirebaseAuthUserByUid(doc.id);
            if (fbUser) {
              computedEmail = fbUser.email || "";
              computedPhone = computedPhone || fbUser.phoneNumber || "";
              computedName = computedName || fbUser.displayName || "";
            }
          }

          if (!computedName) {
            computedName = (computedEmail ? computedEmail.split("@")[0].toUpperCase() : "") || computedPhone || `User (${doc.id.slice(0, 8)})`;
          }

          usersCache[doc.id] = {
            name: computedName,
            email: computedEmail || "No Email",
            phone: computedPhone || "No Phone",
            balance: Number(uData.balance) || 0,
            bonusBalance: Number(uData.bonusBalance) || 0,
            isInvestmentBlocked: Boolean(uData.isInvestmentBlocked),
          };
        } else {
          // If Firestore doc missing, attempt Firebase Auth REST lookup
          const fbUser = await getFirebaseAuthUserByUid(doc.id);
          usersCache[doc.id] = {
            name: fbUser?.displayName || (fbUser?.email ? fbUser.email.split("@")[0].toUpperCase() : `User (${doc.id.slice(0, 8)})`),
            email: fbUser?.email || "No Email",
            phone: fbUser?.phoneNumber || "No Phone",
            balance: 0,
            bonusBalance: 0,
          };
        }
      }
    }

    let enrichedInvestments = rawDocs.map((inv) => {
      const meta = usersCache[inv.userId];

      // Normalize interestRate: if rate is <= 1 (e.g., 0.125 or 0.08), convert to percentage (12.5 or 8)
      let rawRate = Number(inv.interestRate);
      if (isNaN(rawRate) || rawRate <= 0) {
        rawRate = Number(inv.apr) || 0;
      }
      const normalizedInterestRate = rawRate > 0 && rawRate <= 1 ? Number((rawRate * 100).toFixed(2)) : Number(rawRate.toFixed(2));

      // Resolve email with multi-tier fallback across stored inv fields and user profile meta
      const resolvedEmail =
        (inv.userEmail && inv.userEmail !== "No Email" ? inv.userEmail : null) ||
        (inv.email && inv.email !== "No Email" ? inv.email : null) ||
        (meta?.email && meta?.email !== "No Email" ? meta?.email : null) ||
        "No Email";

      // Resolve phone with multi-tier fallback across stored inv fields and user profile meta
      const resolvedPhone =
        (inv.userPhone && inv.userPhone !== "No Phone" ? inv.userPhone : null) ||
        (inv.phoneNumber || inv.phone || null) ||
        (meta?.phone && meta?.phone !== "No Phone" ? meta?.phone : null) ||
        "No Phone";

      // Resolve user name with multi-tier fallback
      const resolvedName =
        (inv.userName && inv.userName !== "Unknown User" && inv.userName !== "System User" ? inv.userName : null) ||
        meta?.name ||
        (resolvedEmail !== "No Email" ? resolvedEmail.split("@")[0].toUpperCase() : null) ||
        (inv.userId ? `User (${inv.userId.slice(0, 8)})` : "System User");

      // Resolve public investment reference
      const publicRef = inv.investmentReference || (inv.id ? `INV-${inv.id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-8)}` : "INV-LEGACY");

      const currentBalance = meta?.balance !== undefined ? meta.balance : (Number(inv.balanceAfterInvestment) || 0);
      const currentBonusBalance = meta?.bonusBalance !== undefined ? meta.bonusBalance : (Number(inv.bonusBalanceAfterInvestment) || 0);

      return {
        ...inv,
        investmentReference: publicRef,
        userName: resolvedName,
        userEmail: resolvedEmail,
        userPhone: resolvedPhone,
        walletType: inv.walletType || "MAIN",
        userCurrentBalance: currentBalance,
        userCurrentBonusBalance: currentBonusBalance,
        isUserInvestmentBlocked: Boolean(meta?.isInvestmentBlocked),
        balanceBeforeInvestment: inv.balanceBeforeInvestment !== undefined ? Number(inv.balanceBeforeInvestment) : null,
        balanceAfterInvestment: inv.balanceAfterInvestment !== undefined ? Number(inv.balanceAfterInvestment) : null,
        bonusBalanceBeforeInvestment: inv.bonusBalanceBeforeInvestment !== undefined ? Number(inv.bonusBalanceBeforeInvestment) : null,
        bonusBalanceAfterInvestment: inv.bonusBalanceAfterInvestment !== undefined ? Number(inv.bonusBalanceAfterInvestment) : null,
        interestRate: normalizedInterestRate,
        description: inv.description || inv.optionName || "Savings / Fixed Deposit Plan",
        optionName: inv.optionName || inv.description || "Savings / Fixed Deposit Plan",
        maturesAt: inv.maturityDate || inv.maturesAt || inv.createdAt,
      };
    });

    // In-memory search filter for client search term
    if (searchQuery) {
      enrichedInvestments = enrichedInvestments.filter(
        (inv) =>
          inv.userName?.toLowerCase().includes(searchQuery) ||
          inv.userEmail?.toLowerCase().includes(searchQuery) ||
          inv.userPhone?.includes(searchQuery) ||
          inv.id?.toLowerCase().includes(searchQuery) ||
          inv.investmentReference?.toLowerCase().includes(searchQuery) ||
          inv.optionName?.toLowerCase().includes(searchQuery) ||
          String(inv.amount).includes(searchQuery)
      );
    }

    const responsePayload = {
      success: true,
      investments: enrichedInvestments,
      pagination: {
        hasNextPage,
        lastDocId,
        limit: limitParam,
      },
    };

    investmentsCache.set(cacheKey, { data: responsePayload, timestamp: now });

    return NextResponse.json(responsePayload);

  } catch (err: any) {
    console.error("[Admin Investments GET Exception]:", err.message);
    return NextResponse.json({ error: "Unauthorized or server exception", details: err.message }, { status: 401 });
  }
}
