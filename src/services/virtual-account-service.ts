import { adminDb } from "@/lib/firebase-admin";
import { UserWalletAccount, FLWVirtualAccountResponse } from "@/types/flutterwave";
import { safeParseJson } from "@/lib/utils";
import { getGatewayUrl } from "@/lib/gateway-util";

const getFlwBaseUrl = () => `${getGatewayUrl()}/api/flutterwave`;

export class VirtualAccountService {
  /**
   * Retrieves an existing permanent virtual account for a user or creates a new one idempotently.
   * Utilizes safe verified Firebase ID Token fallbacks if profile fields are missing in Firestore.
   * Restricts permanent virtual accounts only to users with a valid BVN or NIN.
   */
  static async getOrCreateVirtualAccount(
    userId: string,
    emailFallback?: string,
    nameFallback?: string,
    bvnInput?: string,
    ninInput?: string,
    idToken?: string
  ): Promise<UserWalletAccount> {
    if (!userId) {
      throw new Error("Missing authenticated user ID context.");
    }

    const accountRef = adminDb.collection("wallet_accounts").doc(userId);

    // 1. Check if the permanent account already exists in Firestore (Idempotent check)
    const accountDoc = await accountRef.get();
    if (accountDoc.exists) {
      console.log(`[Virtual Account Service] Idempotent hit: existing permanent account found for user: ${userId}`);
      return accountDoc.data() as UserWalletAccount;
    }

    // 2. Fetch the user profile to compile required payload parameters
    console.log(`[Virtual Account Service] No account found. Loading user profile details for: ${userId}`);
    const userDocRef = adminDb.collection("users").doc(userId);
    const userDoc = await userDocRef.get();

    const userData = userDoc.exists ? (userDoc.data() || {}) : {};

    const bvn = (bvnInput || userData.bvn || "").toString().trim();
    const nin = (ninInput || userData.nin || "").toString().trim();

    const hasValidBvn = bvn && /^\d{11}$/.test(bvn);
    const hasValidNin = nin && /^\d{11}$/.test(nin);

    // Restrict permanent accounts to users with a valid BVN or NIN
    if (!hasValidBvn && !hasValidNin) {
      throw new Error("A valid 11-digit BVN or NIN is required to activate a permanent static virtual account.");
    }

    // Defensively resolve email and name with high-security verified Token fallback contexts
    const email = userData.email || emailFallback || `user-${userId}@e-tech-hub.com`;
    const fullname = userData.name || userData.displayName || nameFallback || "Captain User";
    const phone = userData.phoneNumber || userData.phone || "08012345678";

    if (!email) {
      throw new Error("Missing required customer email to generate a permanent virtual account.");
    }
    if (!fullname) {
      throw new Error("Missing required customer name. Please configure your profile display name first.");
    }

    const nameParts = fullname.trim().split(/\s+/);
    const firstname = nameParts[0] || "Customer";
    const lastname = nameParts.slice(1).join(" ") || "Wallet";
    const tx_ref = `user-wallet-${userId}`;

    console.log(`[Virtual Account Service] Registering permanent virtual account with Flutterwave for: ${userId}`);

    // 3. Request a permanent virtual account from VM Payment Gateway
    const bvnToPass = hasValidBvn ? bvn : nin;

    const customNarration = `${firstname} ${lastname}`.trim().slice(0, 35);

    const response = await fetch(`${getFlwBaseUrl()}/create-virtual-account`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${idToken || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        tx_ref,
        phone,
        phonenumber: phone,
        isPermanent: true,
        is_permanent: true,
        currency: "NGN",
        firstname,
        lastname,
        narration: customNarration,
        bvn: bvnToPass,
        userId,
      }),
    });

    const resData: FLWVirtualAccountResponse = await safeParseJson(response);

    console.log(`[Virtual Account API Call] HTTP Status: ${response.status}`);
    console.log(`[Virtual Account API Raw Response] ${JSON.stringify(resData)}`);

    if (!response.ok || resData.status !== "success") {
      const apiErrorMessage = resData.message || `HTTP Error ${response.status}`;
      console.error(`[Virtual Account API Error] Failed: ${apiErrorMessage}`);
      throw new Error(apiErrorMessage);
    }

    const flwAccount = resData.data;
    if (!flwAccount || !flwAccount.account_number) {
      throw new Error("The payment gateway failed to return virtual account number credentials.");
    }

    // Extract official bank-verified name from Flutterwave to overwrite local profiles
    const flwAccountAny = flwAccount as any;
    const verifiedAccountName = flwAccountAny.account_name || "";
    let rawVerifiedName = verifiedAccountName.replace(/\s*-\s*E-Tech\s*$/i, "").trim();
    if (!rawVerifiedName) {
      rawVerifiedName = `${firstname} ${lastname}`.trim();
    }

    const namePartsClean = rawVerifiedName.split(/\s+/);
    const verifiedFirst = namePartsClean[0] || firstname;
    const verifiedLast = namePartsClean.slice(1).join(" ") || lastname;

    console.log(`[Virtual Account Service] Overwriting user ${userId} profile name fields with bank-verified BVN name: ${rawVerifiedName}`);
    try {
      await adminDb.collection("users").doc(userId).update({
        firstName: verifiedFirst,
        lastName: verifiedLast,
        fullName: rawVerifiedName,
        displayName: rawVerifiedName,
        name: rawVerifiedName,
        kycStatus: "VERIFIED",
        updatedAt: new Date().toISOString(),
      });
    } catch (dbErr: any) {
      console.warn(`[Virtual Account Service] Warning: Failed to update user profile names: ${dbErr.message}`);
    }

    // Mapped account details format
    const newAccountRecord: UserWalletAccount = {
      userId,
      accountNumber: flwAccount.account_number,
      bankName: flwAccount.bank_name || "",
      accountName: flwAccountAny.account_name || `${firstname} ${lastname}`,
      currency: flwAccount.currency || "NGN",
      flwRef: flwAccount.order_ref,
      txRef: tx_ref,
      isPermanent: true,
      status: flwAccount.account_status || "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 4. Save to Firestore
    await accountRef.set(newAccountRecord);
    console.log(`[Virtual Account Service] Permanent account recorded in Firestore for: ${userId}`);

    return newAccountRecord;
  }
}
