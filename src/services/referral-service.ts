import { adminDb } from "@/lib/firebase-admin";
import { WalletService } from "./wallet-service";

export interface ReferralRecord {
  id: string; // referrerUid_referredUid
  referrerUid: string;
  referredUid: string;
  referrerAccountId: string;
  referredAccountId: string;
  referredName: string;
  referredEmail: string;
  status: "pending" | "active";
  amountPaid: number;
  minFundingRequired: number;
  createdAt: string;
  updatedAt: string;
}

export class ReferralService {
  /**
   * Registers a referral connection when a new user B completes registration.
   * This is entirely secure, idempotent, and runs server-side to prevent tampering.
   */
  static async registerReferral(
    referredUid: string,
    referralCode: string,
    referredName: string,
    referredEmail: string
  ): Promise<void> {
    if (!referralCode) return;

    try {
      let trimmedCode = referralCode.trim().toUpperCase();
      // Normalize code format: if user typed numbers only e.g. "123456", convert to "ET-123456"
      if (/^\d+$/.test(trimmedCode)) {
        trimmedCode = `ET-${trimmedCode}`;
      } else if (trimmedCode.startsWith("ET") && !trimmedCode.startsWith("ET-")) {
        trimmedCode = `ET-${trimmedCode.slice(2)}`;
      }

      // Look up referring user by their accountId
      let referrerQuery = await adminDb.collection("users")
        .where("accountId", "==", trimmedCode)
        .limit(1)
        .get();

      // Fallback check if accountId was saved without hyphen e.g. "ET123456" or just number
      if (referrerQuery.empty && trimmedCode.startsWith("ET-")) {
        const noHyphenCode = `ET${trimmedCode.slice(3)}`;
        referrerQuery = await adminDb.collection("users")
          .where("accountId", "==", noHyphenCode)
          .limit(1)
          .get();
      }

      if (referrerQuery.empty) {
        console.log(`[ReferralService] Referrer accountId ${trimmedCode} not found.`);
        return;
      }

      const referrerDoc = referrerQuery.docs[0];
      const referrerUid = referrerDoc.id;

      if (referrerUid === referredUid) {
        console.warn(`[ReferralService] Prevented self-referral attempt by uid: ${referredUid}`);
        return;
      }

      // Check if B is already referred by someone or if this exact connection already exists
      const referralId = `${referrerUid}_${referredUid}`;
      const referralRef = adminDb.collection("referrals").doc(referralId);
      const referralSnap = await referralRef.get();

      if (referralSnap.exists) {
        console.log(`[ReferralService] Referral connection already registered: ${referralId}`);
        return;
      }

      // Ensure B can only be referred by one person (no double referrals)
      const existingQuery = await adminDb.collection("referrals")
        .where("referredUid", "==", referredUid)
        .limit(1)
        .get();

      if (!existingQuery.empty) {
        console.log(`[ReferralService] User ${referredUid} was already referred by another account.`);
        return;
      }

      // Record the pending referral securely in Firestore
      const newReferral: ReferralRecord = {
        id: referralId,
        referrerUid,
        referredUid,
        referrerAccountId: trimmedCode,
        referredAccountId: "", // populated when B gets their accountId generated
        referredName,
        referredEmail,
        status: "pending",
        amountPaid: 0,
        minFundingRequired: 2000, // ₦2,000 NGN minimum threshold
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await referralRef.set(newReferral);
      console.log(`[ReferralService] Secure pending referral registered: ${referralId}`);
    } catch (err: any) {
      console.error("[ReferralService] Failed to register referral securely:", err.message);
    }
  }

  /**
   * Evaluates if B has met the funding threshold of ₦2,000 NGN.
   * If met, completes the referral, awards user A ₦1,000 NGN, and records the transaction.
   * Leverages atomic Firestore transactions and multi-level checks for absolute security.
   */
  static async checkAndProcessReferral(referredUid: string): Promise<void> {
    try {
      // Find if B has any pending referral
      const refQuery = await adminDb.collection("referrals")
        .where("referredUid", "==", referredUid)
        .where("status", "==", "pending")
        .limit(1)
        .get();

      if (refQuery.empty) {
        return;
      }

      const referralDoc = refQuery.docs[0];
      const referralData = referralDoc.data() as ReferralRecord;
      const referralId = referralDoc.id;

      // Check B's successful deposit transactions in the ledger across all deposit types
      const depositTypes = ["DEPOSIT", "VIRTUAL_ACCOUNT_DEPOSIT", "WALLET_FUNDING", "ADMIN_DEPOSIT"];
      const txQuery = await adminDb.collection("transactions")
        .where("userId", "==", referredUid)
        .where("type", "in", depositTypes)
        .where("status", "==", "SUCCESS")
        .get();

      let totalDeposited = 0;
      let metRequirement = false;

      txQuery.forEach((doc) => {
        const tx = doc.data();
        const amount = Number(tx.amount) || 0;
        totalDeposited += amount;
        if (amount >= referralData.minFundingRequired) {
          metRequirement = true;
        }
      });

      // Also qualify if cumulative deposits meet or exceed the minimum threshold
      if (totalDeposited >= referralData.minFundingRequired) {
        metRequirement = true;
      }

      if (!metRequirement) {
        console.log(`[ReferralService] Referred user ${referredUid} funding criteria not met. Funded: ₦${totalDeposited}/₦${referralData.minFundingRequired}`);
        return;
      }

      console.log(`[ReferralService] User ${referredUid} met funding requirement (Funded: ₦${totalDeposited}). Transitioning referral to ACTIVE atomically.`);

      // Complete referral and credit the referrer (A) inside an atomic transaction
      await adminDb.runTransaction(async (transaction) => {
        const refRef = adminDb.collection("referrals").doc(referralId);
        const refSnap = await transaction.get(refRef);

        if (!refSnap.exists) {
          throw new Error("Referral document missing inside transaction scope.");
        }

        const freshRefData = refSnap.data() as ReferralRecord;
        if (freshRefData.status !== "pending") {
          console.log(`[ReferralService] Double-award prevention: referral ${referralId} already active.`);
          return;
        }

        // Retrieve referred user's current accountId to save on the record
        let referredAccountId = freshRefData.referredAccountId || "";
        if (!referredAccountId) {
          const userSnap = await transaction.get(adminDb.collection("users").doc(referredUid));
          if (userSnap.exists) {
            referredAccountId = userSnap.data()?.accountId || "";
          }
        }

        // Update referral record to active state
        transaction.update(refRef, {
          status: "active",
          referredAccountId,
          amountPaid: 1000,
          updatedAt: new Date().toISOString()
        });

        // Credit referrer (User A) wallet atomically with ₦1,000 NGN
        const referrerUid = freshRefData.referrerUid;
        const referrerUserRef = adminDb.collection("users").doc(referrerUid);
        const referrerWalletRef = adminDb.collection("wallets").doc(`${referrerUid}_NGN`);

        const [referrerUserSnap, referrerWalletSnap] = await Promise.all([
          transaction.get(referrerUserRef),
          transaction.get(referrerWalletRef)
        ]);

        if (referrerUserSnap.exists) {
          const rUserData = referrerUserSnap.data() || {};
          const rWalletBalance = referrerWalletSnap.exists ? (Number(referrerWalletSnap.data()?.balance) || 0) : 0;

          await WalletService.creditWallet(transaction, {
            userId: referrerUid,
            amount: 1000,
            currency: "NGN",
            reference: `REFR-${referredUid}`,
            description: `Referral Reward for referring ${freshRefData.referredName}`,
            recipientName: freshRefData.referredName,
            preLoadedUser: {
              ref: referrerUserRef,
              data: rUserData,
              balance: Number(rUserData.balance) || 0
            },
            preLoadedWallet: {
              ref: referrerWalletRef,
              data: referrerWalletSnap.exists ? referrerWalletSnap.data() || {} : {},
              balance: rWalletBalance
            }
          });
        }
      });

      console.log(`[ReferralService] Referral ${referralId} completed. Referrer ${referralData.referrerUid} awarded ₦1,000.`);
    } catch (err: any) {
      console.error(`[ReferralService] Error processing referral check for referred user ${referredUid}:`, err.message);
    }
  }

  /**
   * Checks if the user has completed the funding/balance requirement of ₦3,000 NGN.
   * Requirement is met if:
   * 1. The user's current NGN wallet balance is >= ₦3,000 NGN.
   * OR
   * 2. The user has cumulative successful deposits of >= ₦3,000 NGN.
   */
  static async hasCompletedRequirement(userId: string): Promise<boolean> {
    try {
      // 1. Check current NGN wallet balance
      const walletSnap = await adminDb.collection("wallets").doc(`${userId}_NGN`).get();
      if (walletSnap.exists) {
        const balance = Number(walletSnap.data()?.balance) || 0;
        if (balance >= 3000) {
          return true;
        }
      }

      // 2. Check cumulative successful deposits across all deposit types
      const depositTypes = ["DEPOSIT", "VIRTUAL_ACCOUNT_DEPOSIT", "WALLET_FUNDING", "ADMIN_DEPOSIT"];
      const txQuery = await adminDb.collection("transactions")
        .where("userId", "==", userId)
        .where("type", "in", depositTypes)
        .where("status", "==", "SUCCESS")
        .get();

      let totalDeposited = 0;
      txQuery.forEach((doc) => {
        totalDeposited += Number(doc.data().amount) || 0;
      });

      if (totalDeposited >= 3000) {
        return true;
      }

      return false;
    } catch (err: any) {
      console.error("[ReferralService] Error checking user requirement:", err.message);
      return false;
    }
  }

  /**
   * Validates if a user is allowed to perform a purchase using their BONUS wallet.
   * If the user has not completed the requirement (funding NGN wallet with >= 3000), they cannot use their bonus wallet.
   * If completed, they can only buy Airtime <= 200 NGN cumulative per day OR Data <= 1GB plan once per day.
   */
  static async validateBonusPurchase(
    userId: string,
    billerType: string,
    amount: number,
    itemCode: string,
    itemName: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const completed = await this.hasCompletedRequirement(userId);
    if (!completed) {
      return {
        allowed: false,
        reason: "You cannot spend your bonus wallet because you have not completed the requirement. To unlock your bonus wallet, you must fund your main account with a minimum of ₦3,000 NGN (either current balance or cumulative deposits)."
      };
    }

    const typeUpper = (billerType || "").toUpperCase();

    // Get today's start date
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartISO = todayStart.toISOString();

    // Query all bonus transactions to aggregate today's spending
    const txQuery = await adminDb.collection("transactions")
      .where("userId", "==", userId)
      .where("walletType", "==", "BONUS")
      .where("status", "==", "SUCCESS")
      .get();

    if (typeUpper === "AIRTIME") {
      let cumulativeToday = 0;
      txQuery.forEach((doc) => {
        const tx = doc.data();
        if (tx.createdAt >= todayStartISO && tx.type === "AIRTIME") {
          cumulativeToday += Number(tx.amount) || 0;
        }
      });

      if (cumulativeToday + amount > 200) {
        return {
          allowed: false,
          reason: `Bonus Airtime purchase limit exceeded. You can only spend up to ₦200 NGN on Airtime per day using your bonus wallet. Today you have already spent ₦${cumulativeToday} NGN.`
        };
      }
    } else if (typeUpper === "DATA") {
      // 1. Check if the plan is within 1GB
      const normalizedName = (itemName || "").toLowerCase();
      let isWithinLimit = false;

      if (normalizedName.includes("mb") || normalizedName.includes("megabyte")) {
        isWithinLimit = true;
      } else {
        const match = normalizedName.match(/([\d.]+)\s*gb/);
        if (match) {
          const gbVal = parseFloat(match[1]);
          if (!isNaN(gbVal) && gbVal <= 1.0) {
            isWithinLimit = true;
          }
        } else if (normalizedName.includes("1gb") || normalizedName.includes("1 gb")) {
          isWithinLimit = true;
        }
      }

      if (!isWithinLimit && normalizedName) {
        return {
          allowed: false,
          reason: "Using the bonus wallet, you can only purchase Data plans within a 1GB limit (e.g. 1GB or less)."
        };
      }

      // 2. Check if already purchased data today
      let dataCountToday = 0;
      txQuery.forEach((doc) => {
        const tx = doc.data();
        if (tx.createdAt >= todayStartISO && tx.type === "DATA") {
          dataCountToday += 1;
        }
      });

      if (dataCountToday >= 1) {
        return {
          allowed: false,
          reason: "Using the bonus wallet, you can only purchase Data plans once per day."
        };
      }
    } else {
      // Any other bills (e.g. Cable, Utility) are NOT allowed with Bonus wallet
      return {
        allowed: false,
        reason: "Bonus wallet can only be used for Airtime, Mobile Data, or Fixed Deposits once the ₦3,000 NGN funding requirement is completed."
      };
    }

    return { allowed: true };
  }

  /**
   * Fetches the complete list of referrals (both pending and active) for a referrer.
   */
  static async getReferralsList(referrerUid: string): Promise<ReferralRecord[]> {
    try {
      const snap = await adminDb.collection("referrals")
        .where("referrerUid", "==", referrerUid)
        .orderBy("createdAt", "desc")
        .get();

      return snap.docs.map(doc => doc.data() as ReferralRecord);
    } catch (err: any) {
      console.error(`[ReferralService] Failed to query referrals for referrer ${referrerUid}:`, err.message);
      throw err;
    }
  }
}
