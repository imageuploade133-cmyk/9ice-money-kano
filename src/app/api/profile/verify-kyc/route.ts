import { NextResponse } from "next/server";
import crypto from "crypto";
import { authenticateUserRequest } from "@/lib/auth-util";
import { adminDb } from "@/lib/firebase-admin";
import { getGatewayUrl } from "@/lib/gateway-util";

const GATEWAY_URL = getGatewayUrl();

export async function POST(req: Request) {
  let uid = "";
  let idToken = "";
  let emailFallback = "";
  let nameFallback = "";

  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    idToken = authHeader.split("Bearer ")[1];
  }

  try {
    const authResult = await authenticateUserRequest(req);
    uid = authResult.uid;
    emailFallback = authResult.email || "";
    nameFallback = authResult.name || "";

    if (!uid) {
      console.error("[KYC Proxy Auth Error] Decoded token is missing uid.");
      return NextResponse.json({ error: "Unauthorized: Firebase user UID is missing." }, { status: 401 });
    }
  } catch (authErr: unknown) {
    const error = authErr as Error;
    console.error("[KYC Proxy Auth Error] Authentication failed:", error.message);
    return NextResponse.json({ error: `Unauthorized: ${error.message || "Invalid or missing token."}` }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { idNumber, type, capturedSelfie, livenessChallenge } = body;

    const errors: string[] = [];
    if (!idNumber) {
      errors.push("Identity number (idNumber) is required.");
    } else if (typeof idNumber !== "string") {
      errors.push("Identity number must be a string.");
    } else if (!/^\d{11}$/.test(idNumber.trim())) {
      errors.push("Identity number must be exactly 11 digits.");
    }

    if (!type) {
      errors.push("Identity type (type) is required.");
    } else if (type !== "bvn" && type !== "nin") {
      errors.push("Identity type must be either 'bvn' or 'nin'.");
    }

    if (!capturedSelfie || typeof capturedSelfie !== "string") {
      errors.push("Live camera facial capture selfie is required.");
    } else {
      const trimmedSelfie = capturedSelfie.trim();
      if (trimmedSelfie.startsWith("data:") || trimmedSelfie.includes("base64")) {
        errors.push("Raw base64 or data URLs are strictly rejected for KYC selfies. Image must be uploaded via /api/upload-image first.");
      } else {
        // STRICT URL HOSTNAME CHECK: Use URL parser to verify hostname is strictly i.ibb.co
        try {
          const parsedUrl = new URL(trimmedSelfie);
          if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "i.ibb.co") {
            errors.push("Selfie URL must be a direct HTTPS image URL hosted on secure storage. Arbitrary external hosts are rejected.");
          }
        } catch {
          errors.push("Invalid selfie URL format.");
        }
      }
    }

    if (!livenessChallenge) {
      errors.push("Facial liveness challenge could not be verified.");
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
    }

    // REQUIREMENT 2 & 3: Strict KYC Selfie Receipt & Expiry Validation
    // Verify that capturedSelfie URL was uploaded via /api/upload-image by this authenticated UID specifically for purpose === "kyc_selfie"
    const trimmedSelfieUrl = capturedSelfie.trim();
    const receiptDocId = crypto.createHash("sha256").update(`${uid}:${trimmedSelfieUrl}`).digest("hex");
    const receiptSnap = await adminDb.collection("kyc_upload_receipts").doc(receiptDocId).get();

    let validReceiptFound = false;
    const nowIso = new Date().toISOString();

    if (receiptSnap.exists) {
      const receiptData = receiptSnap.data() || {};

      // STRICT CHECKS: ownerUid, url, purpose === "kyc_selfie" (kyc_document cannot satisfy selfie verification), and non-expired
      if (
        receiptData.ownerUid === uid &&
        receiptData.url === trimmedSelfieUrl &&
        receiptData.purpose === "kyc_selfie" &&
        receiptData.expiresAt &&
        receiptData.expiresAt > nowIso
      ) {
        validReceiptFound = true;
      } else {
        console.warn(`[KYC Provenance Violation] Invalid/expired receipt or owner/purpose mismatch for ${uid}`);
        return NextResponse.json({
          error: "Access Denied: The submitted selfie upload receipt is invalid, expired, wrong purpose, or belongs to another user account."
        }, { status: 403 });
      }
    } else {
      // Fallback query by URL in kyc_upload_receipts enforcing the EXACT SAME strict security checks
      const receiptQuery = await adminDb.collection("kyc_upload_receipts")
        .where("url", "==", trimmedSelfieUrl)
        .limit(1)
        .get();

      if (!receiptQuery.empty) {
        const foundData = receiptQuery.docs[0].data();
        if (
          foundData.ownerUid === uid &&
          foundData.url === trimmedSelfieUrl &&
          foundData.purpose === "kyc_selfie" &&
          foundData.expiresAt &&
          foundData.expiresAt > nowIso
        ) {
          validReceiptFound = true;
        } else {
          console.warn(`[KYC Provenance Violation] Fallback check failed for ${uid}`);
          return NextResponse.json({
            error: "Access Denied: The submitted selfie upload receipt is invalid, expired, wrong purpose, or belongs to another user account."
          }, { status: 403 });
        }
      }
    }

    if (!validReceiptFound) {
      return NextResponse.json({
        error: "Access Denied: Mandatory KYC selfie upload receipt missing or expired. You must record and upload your selfie using the in-app camera."
      }, { status: 403 });
    }

    // Fetch user profile from Firestore users collection
    let userDocData: any = {};
    try {
      const userSnap = await adminDb.collection("users").doc(uid).get();
      if (userSnap.exists) {
        userDocData = userSnap.data() || {};
      }
    } catch (e: any) {
      console.warn("[KYC API] Could not fetch user doc:", e?.message);
    }

    const firstName = body.firstName || userDocData.firstName || nameFallback.split(" ")[0] || "User";
    const lastName = body.lastName || userDocData.lastName || nameFallback.split(" ").slice(1).join(" ") || "User";
    const phone = body.phoneNumber || body.phone || userDocData.phoneNumber || userDocData.phone || "";
    const userEmail = body.email || userDocData.email || emailFallback || "";
    const userBvn = type === "bvn" ? idNumber.trim() : (userDocData.bvn || "");
    const userNin = type === "nin" ? idNumber.trim() : (userDocData.nin || "");

    // Persist complete KYC submission into Firestore kyc_submissions collection & users collection
    const kycSubmissionData = {
      userId: uid,
      uid,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      email: userEmail,
      phone,
      phoneNumber: phone,
      documentType: type,
      documentNumber: idNumber.trim(),
      kycDocumentType: type,
      kycDocumentNumber: idNumber.trim(),
      bvn: userBvn,
      nin: userNin,
      capturedSelfie: trimmedSelfieUrl,
      status: "PENDING",
      kycStatus: "PENDING_REVIEW",
      submittedAt: nowIso,
      updatedAt: nowIso,
    };

    await adminDb.collection("kyc_submissions").doc(uid).set(kycSubmissionData, { merge: true });

    // Update user document status and document numbers
    const userUpdates: Record<string, any> = {
      kycStatus: "PENDING_REVIEW",
      kycSubmittedAt: nowIso,
      capturedSelfie: trimmedSelfieUrl,
    };
    if (type === "bvn") userUpdates.bvn = idNumber.trim();
    if (type === "nin") userUpdates.nin = idNumber.trim();

    await adminDb.collection("users").doc(uid).set(userUpdates, { merge: true });

    const gatewayApiKey = process.env.PAYMENT_GATEWAY_API_KEY || process.env.GATEWAY_API_KEY;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": idToken ? `Bearer ${idToken}` : "",
    };
    if (gatewayApiKey) headers["x-api-key"] = gatewayApiKey;

    // Non-blocking forward of KYC request to payment-gateway VM for background account provisioning
    try {
      const response = await fetch(`${GATEWAY_URL}/api/profile/verify-kyc`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          userId: uid,
          uid,
          firstName,
          lastName,
          documentType: type,
          documentNumber: idNumber.trim(),
          email: userEmail,
          phone,
          capturedSelfie: trimmedSelfieUrl,
          livenessChallenge,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        console.warn(`[KYC Gateway Provisioning Notice] Status ${response.status}:`, result?.message || result?.error || "Gateway response non-200");
      }
    } catch (gwErr: any) {
      console.warn(`[KYC Gateway Provisioning Warning] Background gateway sync error:`, gwErr?.message || gwErr);
    }

    return NextResponse.json({
      success: true,
      message: "KYC submitted successfully. Please hold on while our verification team reviews your information. Your verification may take up to 30 minutes.",
      status: "PENDING_REVIEW"
    });

  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[KYC Proxy Failure] User: ${uid}, Error: ${error.message}`);
    return NextResponse.json({
      error: "Identity verification failed. Please ensure your information matches your registered account."
    }, { status: 400 });
  }
}
