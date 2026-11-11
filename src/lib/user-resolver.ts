import { adminDb } from "@/lib/firebase-admin";

export interface ResolvedInternalUser {
  uid: string;
  name: string;
  email: string;
  phoneNumber?: string;
}

/**
 * Resolves an internal E-Global Pay user by virtual account number, account ID (ET-XXXXXX), phone number, email, or user ID.
 * Returns null if the target account is an external bank account or user cannot be found.
 */
export async function resolveInternalUserByAccount(accountInput: string): Promise<ResolvedInternalUser | null> {
  if (!accountInput || typeof accountInput !== "string") return null;
  const cleanInput = accountInput.trim();
  if (!cleanInput) return null;

  try {
    if (!adminDb) return null;

    // 1. Check wallet_accounts collection by accountNumber (permanent virtual account number)
    const walletAccQuery = await adminDb.collection("wallet_accounts")
      .where("accountNumber", "==", cleanInput)
      .limit(1)
      .get();

    if (!walletAccQuery.empty) {
      const accDoc = walletAccQuery.docs[0];
      const accData = accDoc.data() || {};
      const targetUid = accData.userId || accDoc.id;
      if (targetUid) {
        const userDoc = await adminDb.collection("users").doc(targetUid).get();
        if (userDoc.exists) {
          const uData = userDoc.data() || {};
          return {
            uid: targetUid,
            name: uData.name || uData.displayName || uData.fullName || "E-Global Pay User",
            email: uData.email || "",
            phoneNumber: uData.phoneNumber || uData.phone || "",
          };
        }
      }
    }

    // Direct document lookup in wallet_accounts (doc ID is userId)
    const walletAccDoc = await adminDb.collection("wallet_accounts").doc(cleanInput).get();
    if (walletAccDoc.exists) {
      const targetUid = walletAccDoc.id;
      const userDoc = await adminDb.collection("users").doc(targetUid).get();
      if (userDoc.exists) {
        const uData = userDoc.data() || {};
        return {
          uid: targetUid,
          name: uData.name || uData.displayName || uData.fullName || "E-Global Pay User",
          email: uData.email || "",
          phoneNumber: uData.phoneNumber || uData.phone || "",
        };
      }
    }

    // 2. Check users collection by accountId (e.g., "ET-ABC123")
    if (cleanInput.toUpperCase().startsWith("ET-")) {
      const accountIdQuery = await adminDb.collection("users")
        .where("accountId", "==", cleanInput.toUpperCase())
        .limit(1)
        .get();

      if (!accountIdQuery.empty) {
        const uDoc = accountIdQuery.docs[0];
        const uData = uDoc.data() || {};
        return {
          uid: uDoc.id,
          name: uData.name || uData.displayName || uData.fullName || "E-Global Pay User",
          email: uData.email || "",
          phoneNumber: uData.phoneNumber || uData.phone || "",
        };
      }
    }

    // 3. Check users collection directly by User Document ID
    const directUserDoc = await adminDb.collection("users").doc(cleanInput).get();
    if (directUserDoc.exists) {
      const uData = directUserDoc.data() || {};
      return {
        uid: directUserDoc.id,
        name: uData.name || uData.displayName || uData.fullName || "E-Global Pay User",
        email: uData.email || "",
        phoneNumber: uData.phoneNumber || uData.phone || "",
      };
    }

    // 4. Check users collection by Phone Number
    const cleanDigits = cleanInput.replace(/\D/g, "");
    if (cleanDigits.length >= 7) {
      const phoneVariations = Array.from(new Set([
        cleanInput,
        cleanDigits,
        `+${cleanDigits}`,
        cleanDigits.startsWith("0") ? `+234${cleanDigits.slice(1)}` : `+234${cleanDigits}`,
        cleanDigits.startsWith("234") ? `0${cleanDigits.slice(3)}` : cleanDigits,
      ])).filter(Boolean);

      const phoneQuery = await adminDb.collection("users")
        .where("phoneNumber", "in", phoneVariations.slice(0, 10))
        .limit(1)
        .get();

      if (!phoneQuery.empty) {
        const uDoc = phoneQuery.docs[0];
        const uData = uDoc.data() || {};
        return {
          uid: uDoc.id,
          name: uData.name || uData.displayName || uData.fullName || "E-Global Pay User",
          email: uData.email || "",
          phoneNumber: uData.phoneNumber || uData.phone || "",
        };
      }
    }

    // 5. Check users collection by Email
    if (cleanInput.includes("@")) {
      const emailQuery = await adminDb.collection("users")
        .where("email", "==", cleanInput.toLowerCase())
        .limit(1)
        .get();

      if (!emailQuery.empty) {
        const uDoc = emailQuery.docs[0];
        const uData = uDoc.data() || {};
        return {
          uid: uDoc.id,
          name: uData.name || uData.displayName || uData.fullName || "E-Global Pay User",
          email: uData.email || "",
          phoneNumber: uData.phoneNumber || uData.phone || "",
        };
      }
    }

  } catch (err: any) {
    console.warn(`[resolveInternalUserByAccount] Exception during lookup for '${accountInput}':`, err.message);
  }

  return null;
}
